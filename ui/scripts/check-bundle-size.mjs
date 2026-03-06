import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const uiRoot = new URL("..", import.meta.url);
const distDir = new URL("../dist", import.meta.url);
const assetDir = path.join(distDir.pathname, "assets");

const BUDGETS = {
  entryJs: 350 * 1024,
  totalJs: 500 * 1024,
  totalCss: 64 * 1024,
  totalAssets: 650 * 1024,
};

const formatSize = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

const listFiles = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
};

const readAssetInfo = async (fileName) => {
  const fileUrl = new URL(`../dist/assets/${fileName}`, import.meta.url);
  const filePath = fileUrl.pathname;
  const contents = await readFile(fileUrl);
  const { size } = await stat(fileUrl);

  return {
    fileName,
    filePath,
    size,
    gzipSize: gzipSync(contents).length,
  };
};

const ensureBuildExists = async () => {
  try {
    await readdir(distDir, { withFileTypes: true });
  } catch {
    throw new Error(
      `Missing UI build output at ${distDir.pathname}. Run \`bun --cwd ui run build\` first.`,
    );
  }
};

await ensureBuildExists();

const files = await listFiles(new URL("../dist/assets", import.meta.url));
const assetInfos = await Promise.all(
  files
    .filter((fileName) => !fileName.endsWith(".map"))
    .map((fileName) => readAssetInfo(fileName)),
);

const jsAssets = assetInfos.filter((asset) => asset.fileName.endsWith(".js"));
const cssAssets = assetInfos.filter((asset) => asset.fileName.endsWith(".css"));
const totalJs = jsAssets.reduce((sum, asset) => sum + asset.size, 0);
const totalCss = cssAssets.reduce((sum, asset) => sum + asset.size, 0);
const totalAssets = assetInfos.reduce((sum, asset) => sum + asset.size, 0);
const largestEntryJs = jsAssets.reduce(
  (largest, asset) => (asset.size > largest.size ? asset : largest),
  { fileName: "(none)", size: 0, gzipSize: 0 },
);

const failures = [];
if (largestEntryJs.size > BUDGETS.entryJs) {
  failures.push(
    `largest JS asset ${largestEntryJs.fileName} is ${formatSize(largestEntryJs.size)} (budget ${formatSize(BUDGETS.entryJs)})`,
  );
}
if (totalJs > BUDGETS.totalJs) {
  failures.push(
    `total JS is ${formatSize(totalJs)} (budget ${formatSize(BUDGETS.totalJs)})`,
  );
}
if (totalCss > BUDGETS.totalCss) {
  failures.push(
    `total CSS is ${formatSize(totalCss)} (budget ${formatSize(BUDGETS.totalCss)})`,
  );
}
if (totalAssets > BUDGETS.totalAssets) {
  failures.push(
    `total assets are ${formatSize(totalAssets)} (budget ${formatSize(BUDGETS.totalAssets)})`,
  );
}

console.log(`UI bundle size report for ${uiRoot.pathname}`);
console.log(`- JS assets: ${jsAssets.length}, total ${formatSize(totalJs)}`);
console.log(`- CSS assets: ${cssAssets.length}, total ${formatSize(totalCss)}`);
console.log(
  `- Total assets: ${assetInfos.length}, total ${formatSize(totalAssets)}`,
);
console.log(
  `- Largest JS: ${largestEntryJs.fileName} (${formatSize(largestEntryJs.size)} raw, ${formatSize(largestEntryJs.gzipSize)} gzip)`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Budget exceeded: ${failure}`);
  }
  process.exitCode = 1;
}
