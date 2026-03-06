import path from "node:path";
import {
  captureScreenshot,
  defaultBrowser,
  defaultDummyPath,
  defaultDummySelector,
  parseArgs,
  parseDelayMs,
  parseViewport,
  repoRoot,
  requireSlug,
  resolveStaticTarget,
  screenshotsRoot,
  startStaticServer,
  writeJson,
} from "./screenshot-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const slug = requireSlug(args.slug);
const viewport = parseViewport(args.viewport);
const selector =
  typeof args.selector === "string" ? args.selector : defaultDummySelector;
const readySelector =
  typeof args["ready-selector"] === "string"
    ? args["ready-selector"]
    : selector;
const browser =
  typeof args.browser === "string" ? args.browser : defaultBrowser;
const delayMs = parseDelayMs(args["delay-ms"]);
const timestamp = new Date().toISOString();
const outputPath = path.join(screenshotsRoot, "milestones", `${slug}.png`);
const metadataPath = path.join(screenshotsRoot, "milestones", `${slug}.json`);

const staticTarget =
  typeof args.url === "string"
    ? null
    : resolveStaticTarget({
        staticRoot: args["static-root"],
        staticPath: args["static-path"],
        defaultPath: defaultDummyPath,
      });
const server = staticTarget
  ? await startStaticServer(staticTarget.rootDirectory)
  : null;
const url =
  typeof args.url === "string"
    ? args.url
    : `${server.baseUrl}${staticTarget.urlPath}`;

try {
  const result = await captureScreenshot({
    session: `milestone-${slug}`,
    url,
    selector,
    readySelector,
    outputPath,
    viewport,
    browser,
    fullPage: args["full-page"] === true,
    delayMs,
  });

  await writeJson(metadataPath, {
    slug,
    capturedAt: timestamp,
    url,
    selector,
    readySelector,
    browser,
    viewport: viewport.raw,
    fullPage: args["full-page"] === true,
    delayMs,
    staticRoot: staticTarget
      ? path.relative(repoRoot, staticTarget.rootDirectory) || "."
      : null,
    staticPath: staticTarget?.urlPath ?? null,
    artifact: path.relative(path.dirname(metadataPath), result.outputPath),
    sha256: result.sha256,
  });

  console.log(
    `Saved milestone screenshot to ${path.relative(process.cwd(), outputPath)}`,
  );
} finally {
  await server?.close();
}
