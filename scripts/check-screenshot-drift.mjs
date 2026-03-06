import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  captureScreenshot,
  defaultBrowser,
  defaultDummyPath,
  defaultDummySelector,
  hashFile,
  parseArgs,
  parseViewport,
  requireSlug,
  resolvePath,
  screenshotsRoot,
  startStaticServer,
  writeJson,
} from "./screenshot-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const slug = requireSlug(args.slug);
const viewport = parseViewport(args.viewport);
const reportDirectory = path.join(screenshotsRoot, "drift", slug);
const localPath = path.join(reportDirectory, "local.png");
const metadataPath = path.join(reportDirectory, "report.json");
const markdownPath = path.join(reportDirectory, "report.md");
const htmlPath = path.join(reportDirectory, "comparison.html");
const localSelector =
  typeof args["local-selector"] === "string"
    ? args["local-selector"]
    : defaultDummySelector;
const localLabel =
  typeof args["local-label"] === "string" ? args["local-label"] : "local";
const browser =
  typeof args.browser === "string" ? args.browser : defaultBrowser;
const note = typeof args.note === "string" ? args.note : null;
const timestamp = new Date().toISOString();

const server =
  typeof args["local-url"] === "string" ? null : await startStaticServer();
const localUrl =
  typeof args["local-url"] === "string"
    ? args["local-url"]
    : `${server.baseUrl}${defaultDummyPath}`;

try {
  const localResult = await captureScreenshot({
    session: `drift-local-${slug}`,
    url: localUrl,
    selector: localSelector,
    outputPath: localPath,
    viewport,
    browser,
    fullPage: args["full-page"] === true,
  });

  let referenceType = "upstream";
  let referenceLabel =
    typeof args["upstream-label"] === "string"
      ? args["upstream-label"]
      : "upstream";
  let referencePath = path.join(reportDirectory, "upstream.png");
  let referenceSha = "";

  if (typeof args["upstream-url"] === "string") {
    const upstreamSelector =
      typeof args["upstream-selector"] === "string"
        ? args["upstream-selector"]
        : "body";
    const upstreamResult = await captureScreenshot({
      session: `drift-upstream-${slug}`,
      url: args["upstream-url"],
      selector: upstreamSelector,
      outputPath: referencePath,
      viewport,
      browser,
      fullPage: args["full-page"] === true,
    });
    referenceSha = upstreamResult.sha256;
  } else if (typeof args.baseline === "string") {
    referenceType = "baseline";
    referenceLabel =
      typeof args["baseline-label"] === "string"
        ? args["baseline-label"]
        : "approved-baseline";
    referencePath = path.join(reportDirectory, "baseline.png");
    await copyFile(resolvePath(args.baseline), referencePath);
    referenceSha = await hashFile(referencePath);
  } else {
    throw new Error(
      "Expected either --upstream-url <url> or --baseline <png>.",
    );
  }

  const status =
    localResult.sha256 === referenceSha ? "exact-match" : "different";
  const report = {
    slug,
    capturedAt: timestamp,
    viewport: viewport.raw,
    fullPage: args["full-page"] === true,
    status,
    note,
    local: {
      label: localLabel,
      url: localUrl,
      selector: localSelector,
      browser,
      artifact: "local.png",
      sha256: localResult.sha256,
    },
    reference: {
      type: referenceType,
      label: referenceLabel,
      url:
        typeof args["upstream-url"] === "string" ? args["upstream-url"] : null,
      browser: referenceType === "upstream" ? browser : null,
      selector:
        typeof args["upstream-selector"] === "string"
          ? args["upstream-selector"]
          : referenceType === "upstream"
            ? "body"
            : null,
      artifact: path.basename(referencePath),
      sha256: referenceSha,
    },
  };

  await writeJson(metadataPath, report);
  await writeFile(
    markdownPath,
    [
      `# Drift Report: ${slug}`,
      "",
      `- status: ${status}`,
      `- capturedAt: ${timestamp}`,
      `- viewport: ${viewport.raw}`,
      `- local: ${localLabel} -> local.png (${localResult.sha256})`,
      `- reference: ${referenceLabel} -> ${path.basename(referencePath)} (${referenceSha})`,
      note ? `- note: ${note}` : null,
    ]
      .filter(Boolean)
      .join("\n") + "\n",
    "utf8",
  );
  await writeFile(
    htmlPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Drift Report ${slug}</title>
    <style>
      body {
        margin: 0;
        font-family: "IBM Plex Sans", sans-serif;
        background: #eef3fb;
        color: #10223f;
      }

      main {
        padding: 24px;
      }

      .meta {
        margin-bottom: 16px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 16px;
      }

      figure {
        margin: 0;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(40, 70, 120, 0.18);
        border-radius: 14px;
        padding: 12px;
      }

      img {
        width: 100%;
        display: block;
        border-radius: 10px;
      }

      figcaption {
        margin-top: 10px;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="meta">
        <h1>Drift Report: ${slug}</h1>
        <p>Status: ${status}</p>
        <p>Viewport: ${viewport.raw}</p>
        ${note ? `<p>Note: ${note}</p>` : ""}
      </div>
      <div class="grid">
        <figure>
          <img src="local.png" alt="${localLabel}" />
          <figcaption>${localLabel} (${localResult.sha256})</figcaption>
        </figure>
        <figure>
          <img src="${path.basename(referencePath)}" alt="${referenceLabel}" />
          <figcaption>${referenceLabel} (${referenceSha})</figcaption>
        </figure>
      </div>
    </main>
  </body>
</html>
`,
    "utf8",
  );

  console.log(
    `Saved drift report to ${path.relative(process.cwd(), reportDirectory)}`,
  );
} finally {
  await server?.close();
}
