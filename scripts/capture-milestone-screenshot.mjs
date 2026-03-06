import path from "node:path";
import {
  captureScreenshot,
  defaultBrowser,
  defaultDummyPath,
  defaultDummySelector,
  parseArgs,
  parseViewport,
  requireSlug,
  screenshotsRoot,
  startStaticServer,
  writeJson,
} from "./screenshot-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const slug = requireSlug(args.slug);
const viewport = parseViewport(args.viewport);
const selector =
  typeof args.selector === "string" ? args.selector : defaultDummySelector;
const browser =
  typeof args.browser === "string" ? args.browser : defaultBrowser;
const timestamp = new Date().toISOString();
const outputPath = path.join(screenshotsRoot, "milestones", `${slug}.png`);
const metadataPath = path.join(screenshotsRoot, "milestones", `${slug}.json`);

const server = typeof args.url === "string" ? null : await startStaticServer();
const url =
  typeof args.url === "string"
    ? args.url
    : `${server.baseUrl}${defaultDummyPath}`;

try {
  const result = await captureScreenshot({
    session: `milestone-${slug}`,
    url,
    selector,
    outputPath,
    viewport,
    browser,
    fullPage: args["full-page"] === true,
  });

  await writeJson(metadataPath, {
    slug,
    capturedAt: timestamp,
    url,
    selector,
    browser,
    viewport: viewport.raw,
    fullPage: args["full-page"] === true,
    artifact: path.relative(path.dirname(metadataPath), result.outputPath),
    sha256: result.sha256,
  });

  console.log(
    `Saved milestone screenshot to ${path.relative(process.cwd(), outputPath)}`,
  );
} finally {
  await server?.close();
}
