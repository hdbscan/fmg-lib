import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { firefox } from "playwright";
import { buildGenerationConfigFromOracle } from "../src/internal/oracle-config";
import { fetchUpstreamOracle } from "./fetch-upstream-oracle";
import {
  repoRoot,
  resolvePath,
  startStaticServer,
  writeJson,
} from "./screenshot-lib.mjs";

const DEFAULT_OUTPUT = "artifacts/parity/render-parity-report.json";
const DEFAULT_ORACLE_CACHE = "artifacts/parity/upstream-oracle.json";
const DEFAULT_LOCAL_STATIC_ROOT = "ui/dist";
const DEFAULT_UPSTREAM_URL =
  "https://azgaar.github.io/Fantasy-Map-Generator/?seed=42424242&options=default";
const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const LOCAL_SELECTOR = '[data-screenshot="render-parity-canvas"]';
const UPSTREAM_SELECTOR = "#map";
const EXPECTED_VISIBLE_LAYERS = [
  "ocean",
  "lakes",
  "landmass",
  "coastline",
  "heightmap",
  "rivers",
];

const parseArgs = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${current ?? ""}`);
    }

    const name = current.slice(2);
    const next = argv[index + 1];
    if (!name || !next || next.startsWith("--")) {
      throw new Error(`Expected a value after ${current}`);
    }

    values[name] = next;
    index += 1;
  }

  return values;
};

const loadCachedOracle = async (oraclePath) => {
  try {
    return JSON.parse(await readFile(oraclePath, "utf8"));
  } catch {
    return null;
  }
};

const configToSearch = (config) => {
  const params = new URLSearchParams();
  params.set("review", "render-parity");
  params.set("terrainGeometry", "packed");
  params.set("seed", config.seed);
  params.set("width", String(config.width));
  params.set("height", String(config.height));
  params.set("cells", String(config.cells));
  params.set("culturesCount", String(config.culturesCount));

  if (config.statesCount !== undefined) {
    params.set("statesCount", String(config.statesCount));
  }
  if (config.townsCount !== undefined) {
    params.set("townsCount", String(config.townsCount));
  }
  if (config.heightTemplate) {
    const template =
      config.heightTemplate === "mediterranean"
        ? "inland-sea"
        : config.heightTemplate;
    params.set("heightTemplate", template);
  }

  const hidden = config.hiddenControls ?? {};
  const climate = config.climate ?? {};

  for (const [key, value] of Object.entries(hidden)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  for (const [key, value] of Object.entries(climate)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  return `/?${params.toString()}`;
};

const buildLocalUrl = (baseUrl, config, maskLayer = null) => {
  const params = new URLSearchParams(configToSearch(config).slice(2));
  if (maskLayer) {
    params.set("maskLayer", maskLayer);
  }
  return `${baseUrl}/?${params.toString()}`;
};

const setupUpstreamPhysicalCore = async (page, maskLayer = null) => {
  await page.waitForFunction(() => globalThis.mapId !== undefined, {
    timeout: 120000,
  });
  await page.waitForTimeout(1000);
  await page.evaluate(
    ({ maskLayer, expectedVisibleLayers }) => {
      const byId = (id) => document.getElementById(id);
      const clickIfNeeded = (id, shouldBeOn) => {
        const button = byId(id);
        if (!button) {
          return;
        }
        const isOn = !button.classList.contains("buttonoff");
        if (isOn !== shouldBeOn) {
          button.click();
        }
      };

      if (typeof handleLayersPresetChange === "function") {
        handleLayersPresetChange("landmass");
      }

      const offButtons = [
        "toggleTexture",
        "toggleBiomes",
        "toggleCells",
        "toggleGrid",
        "toggleCoordinates",
        "toggleCompass",
        "toggleRelief",
        "toggleReligions",
        "toggleCultures",
        "toggleStates",
        "toggleProvinces",
        "toggleZones",
        "toggleBorders",
        "toggleRoutes",
        "toggleTemperature",
        "togglePopulation",
        "toggleIce",
        "togglePrecipitation",
        "toggleEmblems",
        "toggleBurgIcons",
        "toggleLabels",
        "toggleMilitary",
        "toggleMarkers",
        "toggleRulers",
        "toggleScaleBar",
        "toggleVignette",
      ];
      for (const id of offButtons) {
        clickIfNeeded(id, false);
      }

      if (maskLayer === null) {
        clickIfNeeded("toggleHeight", true);
        clickIfNeeded("toggleRivers", true);
      } else {
        clickIfNeeded("toggleHeight", false);
        clickIfNeeded("toggleRivers", maskLayer === "rivers");
      }

      if (typeof resetZoom === "function") {
        resetZoom(0);
      }

      const viewbox = document.getElementById("viewbox");
      if (viewbox) {
        viewbox.setAttribute("transform", "translate(0 0) scale(1)");
      }

      const visibility = new Map([
        ["ocean", maskLayer === null],
        ["lakes", maskLayer === null],
        ["landmass", maskLayer === null],
        ["terrs", maskLayer === null],
        ["coastline", maskLayer === null || maskLayer === "coastline"],
        ["rivers", maskLayer === null || maskLayer === "rivers"],
        ["terrain", false],
        ["relig", false],
        ["cults", false],
        ["regions", false],
        ["provs", false],
        ["zones", false],
        ["borders", false],
        ["routes", false],
        ["temperature", false],
        ["ice", false],
        ["prec", false],
        ["population", false],
        ["emblems", false],
        ["icons", false],
        ["labels", false],
        ["armies", false],
        ["markers", false],
        ["coordinates", false],
        ["compass", false],
        ["gridOverlay", false],
        ["cells", false],
        ["scaleBar", false],
        ["legend", false],
      ]);

      for (const [id, visible] of visibility) {
        const element = byId(id);
        if (!element) {
          continue;
        }
        element.style.display = visible ? "block" : "none";
        element.style.visibility = visible ? "visible" : "hidden";
      }

      const forceMaskStyle = (selector) => {
        for (const node of document.querySelectorAll(selector)) {
          node.setAttribute("fill", "none");
          node.setAttribute("stroke", "#000000");
          node.setAttribute("stroke-width", "2");
          node.setAttribute("stroke-linecap", "round");
          node.setAttribute("stroke-linejoin", "round");
          node.removeAttribute("filter");
        }
      };

      if (maskLayer === "coastline") {
        const map = byId("map");
        if (map) {
          map.style.background = "#ffffff";
        }
        forceMaskStyle("#coastline use, #coastline path");
      }

      if (maskLayer === "rivers") {
        const map = byId("map");
        if (map) {
          map.style.background = "#ffffff";
        }
        const riversGroup = byId("rivers");
        if (riversGroup && globalThis.pack?.rivers && globalThis.Rivers) {
          const toPath = (points) => {
            if (!Array.isArray(points) || points.length === 0) {
              return "";
            }
            const [firstX, firstY] = points[0] ?? [0, 0];
            const commands = [`M${firstX},${firstY}`];
            for (
              let pointIndex = 1;
              pointIndex < points.length;
              pointIndex += 1
            ) {
              const [x, y] = points[pointIndex] ?? [0, 0];
              commands.push(`L${x},${y}`);
            }
            return commands.join(" ");
          };
          const lines = [];
          for (const river of globalThis.pack.rivers) {
            if (!river?.cells || river.cells.length < 3) {
              continue;
            }
            const points = globalThis.Rivers.addMeandering(river.cells);
            const d = toPath(points);
            if (!d) {
              continue;
            }
            lines.push(
              `<path d="${d}" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`,
            );
          }
          riversGroup.innerHTML = lines.join("");
        }
      }

      window.__fmgRenderParity = {
        review: "physical-core",
        maskLayer: maskLayer ?? "styled",
        visibleLayers: expectedVisibleLayers,
        selector: "#map",
      };
    },
    { maskLayer, expectedVisibleLayers: EXPECTED_VISIBLE_LAYERS },
  );
  await page.waitForTimeout(500);
};

const waitForLocalRenderParity = async (page) => {
  await page.locator(LOCAL_SELECTOR).first().waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
};

const captureElement = async (page, selector, outputPath) => {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible" });
  const buffer = await locator.screenshot({ path: outputPath });
  return buffer;
};

const compareImages = async (browser, left, right, mode) => {
  const page = await browser.newPage({ viewport: { width: 8, height: 8 } });
  try {
    return await page.evaluate(
      async ({ leftBase64, rightBase64, mode }) => {
        const load = async (base64) =>
          await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("image failed to load"));
            image.src = `data:image/png;base64,${base64}`;
          });

        const [leftImage, rightImage] = await Promise.all([
          load(leftBase64),
          load(rightBase64),
        ]);

        const width = Math.min(leftImage.width, rightImage.width);
        const height = Math.min(leftImage.height, rightImage.height);
        const readPixels = (image) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("2d context unavailable");
          }
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        };

        const leftPixels = readPixels(leftImage);
        const rightPixels = readPixels(rightImage);

        if (mode === "mask") {
          let intersection = 0;
          let union = 0;
          for (let index = 0; index < leftPixels.length; index += 4) {
            const leftOn =
              (leftPixels[index + 3] ?? 0) > 0 &&
              (leftPixels[index] ?? 255) < 128;
            const rightOn =
              (rightPixels[index + 3] ?? 0) > 0 &&
              (rightPixels[index] ?? 255) < 128;
            if (leftOn && rightOn) {
              intersection += 1;
            }
            if (leftOn || rightOn) {
              union += 1;
            }
          }

          return {
            width,
            height,
            pixelIntersection: intersection,
            pixelUnion: union,
            iou: union === 0 ? 1 : intersection / union,
          };
        }

        let mismatchPixels = 0;
        let totalChannelDiff = 0;
        let maxChannelDiff = 0;
        for (let index = 0; index < leftPixels.length; index += 4) {
          let pixelMismatch = false;
          for (let channel = 0; channel < 4; channel += 1) {
            const diff = Math.abs(
              (leftPixels[index + channel] ?? 0) -
                (rightPixels[index + channel] ?? 0),
            );
            totalChannelDiff += diff;
            maxChannelDiff = Math.max(maxChannelDiff, diff);
            if (diff > 16) {
              pixelMismatch = true;
            }
          }
          if (pixelMismatch) {
            mismatchPixels += 1;
          }
        }

        const pixelCount = width * height;
        return {
          width,
          height,
          pixelCount,
          mismatchPixels,
          mismatchRatio: pixelCount === 0 ? 0 : mismatchPixels / pixelCount,
          meanAbsoluteChannelDiff:
            pixelCount === 0 ? 0 : totalChannelDiff / (pixelCount * 4),
          maxChannelDiff,
        };
      },
      {
        leftBase64: left.toString("base64"),
        rightBase64: right.toString("base64"),
        mode,
      },
    );
  } finally {
    await page.close();
  }
};

const readLayerMetadata = async (page, kind) => {
  if (kind === "local") {
    return await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-render-review="physical-core"]',
      );
      return {
        review: shell?.getAttribute("data-render-review") ?? null,
        maskLayer: shell?.getAttribute("data-render-mask-layer") ?? null,
        visibleLayers:
          shell?.getAttribute("data-render-visible-layers")?.split(",") ?? [],
        selector: '[data-screenshot="render-parity-canvas"]',
      };
    });
  }

  return await page.evaluate(() => window.__fmgRenderParity ?? null);
};

const sortStrings = (values) =>
  [...values].sort((left, right) => left.localeCompare(right));

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const oraclePath = path.resolve(
    process.cwd(),
    args.oracle ?? DEFAULT_ORACLE_CACHE,
  );
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT);
  const upstreamUrl = args["upstream-url"] ?? DEFAULT_UPSTREAM_URL;
  const localRoot = resolvePath(
    args["local-static-root"] ?? DEFAULT_LOCAL_STATIC_ROOT,
  );
  const oracle =
    (await loadCachedOracle(oraclePath)) ??
    (await fetchUpstreamOracle(upstreamUrl));
  const config = buildGenerationConfigFromOracle(oracle);
  const localServer = await startStaticServer(localRoot);
  const artifactDirectory = path.join(
    path.dirname(outputPath),
    "render-parity-artifacts",
  );
  await mkdir(artifactDirectory, { recursive: true });

  const browser = await firefox.launch({ headless: true });

  try {
    const localPage = await browser.newPage({ viewport: DEFAULT_VIEWPORT });
    await localPage.goto(buildLocalUrl(localServer.baseUrl, config), {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await waitForLocalRenderParity(localPage);
    const localStyledPath = path.join(artifactDirectory, "local-styled.png");
    const localStyled = await captureElement(
      localPage,
      LOCAL_SELECTOR,
      localStyledPath,
    );
    const localMetadata = await readLayerMetadata(localPage, "local");

    const upstreamPage = await browser.newPage({ viewport: DEFAULT_VIEWPORT });
    await upstreamPage.goto(upstreamUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await setupUpstreamPhysicalCore(upstreamPage);
    const upstreamStyledPath = path.join(
      artifactDirectory,
      "upstream-styled.png",
    );
    const upstreamStyled = await captureElement(
      upstreamPage,
      UPSTREAM_SELECTOR,
      upstreamStyledPath,
    );
    const upstreamMetadata = await readLayerMetadata(upstreamPage, "upstream");

    const styledImageParity = await compareImages(
      browser,
      localStyled,
      upstreamStyled,
      "styled",
    );

    const maskResults = {};
    for (const maskLayer of ["coastline", "rivers"]) {
      const localMaskPage = await browser.newPage({
        viewport: DEFAULT_VIEWPORT,
      });
      await localMaskPage.goto(
        buildLocalUrl(localServer.baseUrl, config, maskLayer),
        {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        },
      );
      await waitForLocalRenderParity(localMaskPage);
      const localMaskPath = path.join(
        artifactDirectory,
        `local-${maskLayer}.png`,
      );
      const localMask = await captureElement(
        localMaskPage,
        LOCAL_SELECTOR,
        localMaskPath,
      );
      await localMaskPage.close();

      const upstreamMaskPage = await browser.newPage({
        viewport: DEFAULT_VIEWPORT,
      });
      await upstreamMaskPage.goto(upstreamUrl, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await setupUpstreamPhysicalCore(upstreamMaskPage, maskLayer);
      const upstreamMaskPath = path.join(
        artifactDirectory,
        `upstream-${maskLayer}.png`,
      );
      const upstreamMask = await captureElement(
        upstreamMaskPage,
        UPSTREAM_SELECTOR,
        upstreamMaskPath,
      );
      await upstreamMaskPage.close();

      maskResults[maskLayer] = {
        localArtifact: path.relative(path.dirname(outputPath), localMaskPath),
        upstreamArtifact: path.relative(
          path.dirname(outputPath),
          upstreamMaskPath,
        ),
        ...(await compareImages(browser, localMask, upstreamMask, "mask")),
      };
    }

    await localPage.close();
    await upstreamPage.close();

    const localVisible = sortStrings(localMetadata?.visibleLayers ?? []);
    const upstreamVisible = sortStrings(upstreamMetadata?.visibleLayers ?? []);
    const missingInUpstream = localVisible.filter(
      (layer) => !upstreamVisible.includes(layer),
    );
    const extraInUpstream = upstreamVisible.filter(
      (layer) => !localVisible.includes(layer),
    );

    const report = {
      oracle: {
        seed: oracle.seed,
        sourceUrl: upstreamUrl,
      },
      baseline: {
        review: "physical-core",
        terrainGeometry: "packed",
        expectedVisibleLayers: EXPECTED_VISIBLE_LAYERS,
      },
      local: {
        selector: LOCAL_SELECTOR,
        url: buildLocalUrl(localServer.baseUrl, config),
        staticRoot: path.relative(repoRoot, localRoot) || ".",
        styledArtifact: path.relative(
          path.dirname(outputPath),
          localStyledPath,
        ),
        metadata: localMetadata,
      },
      upstream: {
        selector: UPSTREAM_SELECTOR,
        url: upstreamUrl,
        styledArtifact: path.relative(
          path.dirname(outputPath),
          upstreamStyledPath,
        ),
        metadata: upstreamMetadata,
      },
      styleLayerParity: {
        localVisibleLayers: localVisible,
        upstreamVisibleLayers: upstreamVisible,
        missingInUpstream,
        extraInUpstream,
        exactLayerMatch:
          missingInUpstream.length === 0 && extraInUpstream.length === 0,
      },
      geometryParity: maskResults,
      renderedImageParity: styledImageParity,
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeJson(outputPath, report);
    console.log(`render_parity_report: ${outputPath}`);
    console.log(
      `rendered_image_mismatch_ratio: ${styledImageParity.mismatchRatio.toFixed(4)}`,
    );
    console.log(`coastline_mask_iou: ${maskResults.coastline.iou.toFixed(4)}`);
    console.log(`river_mask_iou: ${maskResults.rivers.iou.toFixed(4)}`);
    console.log(
      `style_layer_exact_match: ${report.styleLayerParity.exactLayerMatch}`,
    );
  } finally {
    await browser.close();
    await localServer.close();
  }
}
