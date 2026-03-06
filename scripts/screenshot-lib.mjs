import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDirectory, "..");
export const screenshotsRoot = path.join(repoRoot, "screenshots");
export const defaultDummyPath = "/ui/dummy/index.html";
export const defaultDummySelector = '[data-screenshot="ui-dummy-card"]';
export const defaultBrowser = "firefox";

const bunxCommand = process.platform === "win32" ? "bunx.cmd" : "bunx";

const usageError = (message) => {
  throw new Error(message);
};

export const parseArgs = (argv) => {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      usageError(`Unexpected argument: ${current}`);
    }

    const name = current.slice(2);
    if (!name) {
      usageError("Empty flag name is not allowed.");
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[name] = true;
      continue;
    }

    values[name] = next;
    index += 1;
  }

  return values;
};

export const requireSlug = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    usageError("Expected --slug <name>.");
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const parseViewport = (value) => {
  const raw = typeof value === "string" ? value : "1440x960";
  const match = raw.match(/^(\d+)x(\d+)$/);

  if (!match) {
    usageError(`Invalid viewport: ${raw}. Expected WIDTHxHEIGHT.`);
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
    raw,
  };
};

export const resolvePath = (value) =>
  path.isAbsolute(value) ? value : path.join(repoRoot, value);

export const ensureDirectory = async (directoryPath) => {
  await mkdir(directoryPath, { recursive: true });
};

export const writeJson = async (filePath, value) => {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const hashFile = async (filePath) => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const getContentType = (filePath) => {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
};

export const startStaticServer = async (rootDirectory = repoRoot) => {
  const server = createServer(async (request, response) => {
    const requestedPath = request.url ? decodeURIComponent(request.url) : "/";
    const pathname = requestedPath.split("?")[0] ?? "/";
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(rootDirectory, relativePath);

    if (!filePath.startsWith(rootDirectory)) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    try {
      const source = await readFile(filePath);
      response.writeHead(200, { "content-type": getContentType(filePath) });
      response.end(source);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine static server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
};

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Command failed (${command} ${args.join(" ")}):\n${stdout}${stderr}`,
        ),
      );
    });
  });

export const runPlaywrightCli = async (session, ...args) =>
  runCommand(bunxCommand, ["playwright-cli", `-s=${session}`, ...args]);

const buildCaptureCode = ({ selector, outputPath, fullPage }) => {
  const cssSelector = typeof selector === "string" ? selector : "body";
  const output = JSON.stringify(outputPath);

  return `async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(300);
    const selector = ${JSON.stringify(cssSelector)};
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible" });
    await page.addStyleTag({ content: "*, *::before, *::after { caret-color: transparent !important; animation-duration: 0s !important; transition-duration: 0s !important; }" });
    ${
      fullPage
        ? `await page.screenshot({ path: ${output}, fullPage: true });`
        : `await locator.screenshot({ path: ${output} });`
    }
  }`;
};

export const captureScreenshot = async ({
  session,
  url,
  selector,
  outputPath,
  viewport,
  browser = defaultBrowser,
  fullPage = false,
}) => {
  await ensureDirectory(path.dirname(outputPath));

  try {
    await runPlaywrightCli(
      session,
      "open",
      "about:blank",
      "--browser",
      browser,
    );
    await runPlaywrightCli(
      session,
      "resize",
      String(viewport.width),
      String(viewport.height),
    );
    await runPlaywrightCli(session, "goto", url);
    await runPlaywrightCli(
      session,
      "run-code",
      buildCaptureCode({ selector, outputPath, fullPage }),
    );
  } finally {
    await runPlaywrightCli(session, "close").catch(() => {});
  }

  return {
    outputPath,
    sha256: await hashFile(outputPath),
  };
};
