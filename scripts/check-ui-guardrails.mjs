import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const uiRoot = path.join(repoRoot, "ui");
const srcRoot = path.join(repoRoot, "src");
const bannedPackages = ["jquery", "jquery-ui", "d3-selection", "d3-transition"];
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);
const manifestNames = new Set(["package.json"]);
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const failures = [];

const normalizePath = (value) => path.normalize(value);

const isInside = (candidate, target) => {
  const normalizedCandidate = normalizePath(candidate);
  const normalizedTarget = normalizePath(target);
  return (
    normalizedCandidate === normalizedTarget ||
    normalizedCandidate.startsWith(`${normalizedTarget}${path.sep}`)
  );
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
      continue;
    }

    files.push(entryPath);
  }

  return files;
};

const getSpecifiers = (sourceText) => {
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g,
    /\bexport\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  const specifiers = [];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
};

const matchesBannedPackage = (specifier) =>
  bannedPackages.some(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  );

const checkManifest = async (filePath) => {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  const relativePath = path.relative(repoRoot, filePath);

  for (const field of dependencyFields) {
    const entries = Object.keys(manifest[field] ?? {});

    for (const dependencyName of entries) {
      if (bannedPackages.includes(dependencyName)) {
        failures.push(
          `${relativePath}: banned dependency \`${dependencyName}\` in ${field}`,
        );
      }
    }
  }
};

const checkSourceFile = async (filePath) => {
  const sourceText = await readFile(filePath, "utf8");
  const relativePath = path.relative(repoRoot, filePath);

  for (const specifier of getSpecifiers(sourceText)) {
    if (matchesBannedPackage(specifier)) {
      failures.push(`${relativePath}: banned package import \`${specifier}\``);
    }

    if (specifier.startsWith("fmg-lib/")) {
      failures.push(
        `${relativePath}: deep import \`${specifier}\` is not allowed`,
      );
    }

    if (!specifier.startsWith(".")) {
      continue;
    }

    const resolvedTarget = path.resolve(path.dirname(filePath), specifier);
    if (isInside(resolvedTarget, srcRoot)) {
      failures.push(
        `${relativePath}: relative import into repo src is not allowed (found \`${specifier}\`)`,
      );
    }
  }
};

const files = await walk(uiRoot);

for (const filePath of files) {
  const extension = path.extname(filePath);
  const fileName = path.basename(filePath);

  if (manifestNames.has(fileName)) {
    await checkManifest(filePath);
    continue;
  }

  if (sourceExtensions.has(extension)) {
    await checkSourceFile(filePath);
  }
}

if (failures.length > 0) {
  console.error("UI guardrail check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("UI guardrails passed.");
