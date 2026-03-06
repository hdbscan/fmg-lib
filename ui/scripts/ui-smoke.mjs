import {
  resolvePath,
  runPlaywrightCli,
  startStaticServer,
} from "../../scripts/screenshot-lib.mjs";

const viewport = { width: 1440, height: 960 };
const generatedWorld = { width: 640, height: 480, cells: 1500 };
const overwriteWorld = { width: 320, height: 320, cells: 1000 };

const formatCount = (value) => new Intl.NumberFormat("en-US").format(value);

const buildScenarioCode = () => {
  const generatedStatus = `Rendered ${formatCount(generatedWorld.cells)} cells at ${generatedWorld.width}x${generatedWorld.height}.`;
  const overwriteStatus = `Rendered ${formatCount(overwriteWorld.cells)} cells at ${overwriteWorld.width}x${overwriteWorld.height}.`;

  return `async (page) => {
    const assert = (condition, message) => {
      if (!condition) {
        throw new Error(message);
      }
    };
    const readText = async (selector) => (await page.locator(selector).textContent())?.trim() ?? "";
    const waitForText = async (selector, expected) => {
      await page.waitForFunction(
        ([targetSelector, targetText]) => {
          return (document.querySelector(targetSelector)?.textContent ?? "").trim() === targetText;
        },
        [selector, expected],
      );
    };
    const waitForPattern = async (selector, pattern) => {
      await page.waitForFunction(
        ([targetSelector, source]) => {
          const text = (document.querySelector(targetSelector)?.textContent ?? "").trim();
          return new RegExp(source).test(text);
        },
        [selector, pattern.source],
      );
    };

    page.setDefaultTimeout(30000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForLoadState("domcontentloaded");

    const statusSelector = '[data-ui-smoke="status-line"]';
    const cellsSelector = '[data-ui-smoke="metric-cells"]';
    const hoverSelector = '[data-ui-smoke="hover-chip"]';
    const selectedSelector = '[data-ui-smoke="selected-chip"]';
    const inspectorSelector = '[data-ui-smoke="inspector-table"]';

    const generateButton = page.getByRole("button", { name: /Generate world|Re-generate world/ });
    const saveButton = page.getByRole("button", { name: "Save world" });
    const seedInput = page.getByLabel("Seed");
    const widthInput = page.getByLabel("Width");
    const heightInput = page.getByLabel("Height");
    const cellsInput = page.getByLabel("Cells");
    const riversToggle = page.getByLabel("Rivers");
    const fileInput = page.locator('[data-ui-smoke="load-world-input"]');
    const canvas = page.locator('[data-screenshot="ui-shell-canvas"]');

    await page.waitForFunction((selector) => {
      return ((document.querySelector(selector)?.textContent ?? "").trim() || "-") !== "-";
    }, cellsSelector);

    await seedInput.fill("ui-smoke-generate");
    await widthInput.fill("${generatedWorld.width}");
    await heightInput.fill("${generatedWorld.height}");
    await cellsInput.fill("${generatedWorld.cells}");
    await generateButton.click();
    await waitForText(statusSelector, ${JSON.stringify(generatedStatus)});
    assert((await readText(cellsSelector)) === ${JSON.stringify(formatCount(generatedWorld.cells))}, "Generate flow did not update the cell metric.");

    await page.getByRole("button", { name: "Political" }).click();
    assert(!(await page.getByLabel("Biomes").isChecked()), "Political preset should hide biomes.");
    assert(await page.getByLabel("Provinces").isChecked(), "Political preset should enable provinces.");
    await riversToggle.uncheck();
    assert(!(await riversToggle.isChecked()), "Rivers overlay should toggle off.");
    await riversToggle.check();
    assert(await riversToggle.isChecked(), "Rivers overlay should toggle back on.");

    const box = await canvas.boundingBox();
    assert(box, "Canvas bounds were not available for inspection.");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await waitForPattern(hoverSelector, /^Hover \\d+$/);
    await page.mouse.click(centerX, centerY);
    await waitForPattern(selectedSelector, /^Selected \\d+$/);
    await page.locator(inspectorSelector).waitFor({ state: "visible" });
    assert((await readText(inspectorSelector)).includes("Cell"), "Inspector did not render selected cell details.");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      saveButton.click(),
    ]);
    const downloadPath = await download.path();
    assert(downloadPath, "Save flow did not produce a downloadable world file.");
    const { readFile } = await import("node:fs/promises");
    const payload = await readFile(downloadPath, "utf8");
    const serialized = JSON.parse(payload);
    assert(serialized.schemaVersion === 1, "Saved world payload is missing the supported schema version.");

    await seedInput.fill("ui-smoke-overwrite");
    await widthInput.fill("${overwriteWorld.width}");
    await heightInput.fill("${overwriteWorld.height}");
    await cellsInput.fill("${overwriteWorld.cells}");
    await generateButton.click();
    await waitForText(statusSelector, ${JSON.stringify(overwriteStatus)});
    assert((await readText(cellsSelector)) === ${JSON.stringify(formatCount(overwriteWorld.cells))}, "Overwrite generate flow did not complete.");

    const fileName = download.suggestedFilename();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: "application/json",
      buffer: Buffer.from(payload, "utf8"),
    });
    await waitForText(statusSelector, \`Loaded \${fileName}.\`);
    assert((await readText(cellsSelector)) === ${JSON.stringify(formatCount(generatedWorld.cells))}, "Load flow did not restore the saved world.");
  }`;
};

const run = async () => {
  const staticRoot = resolvePath("ui/dist");
  const session = `ui-smoke-${Date.now().toString(36)}`;
  const server = await startStaticServer(staticRoot);

  try {
    await runPlaywrightCli(
      session,
      "open",
      "about:blank",
      "--browser",
      "firefox",
    );
    await runPlaywrightCli(
      session,
      "resize",
      String(viewport.width),
      String(viewport.height),
    );
    await runPlaywrightCli(session, "goto", server.baseUrl);
    await runPlaywrightCli(session, "run-code", buildScenarioCode());
  } finally {
    await runPlaywrightCli(session, "close").catch(() => {});
    await server.close();
  }
};

await run();
