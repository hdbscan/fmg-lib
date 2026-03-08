import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { firefox } from "playwright";
import {
  type DownstreamDiagnostics,
  type DownstreamDiagnosticsComparison,
  compareDownstreamDiagnostics,
  generateDownstreamDiagnostics,
} from "../src/index";
import { buildGenerationConfigFromOracle } from "../src/internal/oracle-config";
import { fetchUpstreamOracle } from "./fetch-upstream-oracle";

const DEFAULT_OUTPUT = "artifacts/parity/downstream-harness-report.json";
const DEFAULT_ORACLE_CACHE = "artifacts/parity/upstream-oracle.json";

type DownstreamHarnessReport = Readonly<{
  oracleSeed: string;
  oracleSourceUrl: string;
  local: DownstreamDiagnostics;
  oracle: DownstreamDiagnostics;
  comparison: DownstreamDiagnosticsComparison;
  cultureRuntime?: Readonly<{
    selectedTemplateIds: readonly number[];
    selectedCenters: readonly number[];
    sampleIndices: readonly number[];
    sampleCells: readonly number[];
    sampleOffsets: readonly number[];
    templateDrawEvents: readonly Readonly<{
      draw: number;
      poolLength: number;
      pickedIndex: number;
      templateId: number;
      accepted: boolean;
    }>[];
  }>;
}>;

const parseArgs = (argv: string[]): Record<string, string> => {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--"))
      throw new Error(`Unexpected argument: ${current ?? ""}`);
    const name = current.slice(2);
    const value = argv[index + 1];
    if (!name || !value || value.startsWith("--")) {
      throw new Error(`Expected a value after ${current}`);
    }
    values[name] = value;
    index += 1;
  }
  return values;
};

const loadCachedOracle = async (oraclePath: string) => {
  try {
    return JSON.parse(await readFile(oraclePath, "utf8")) as Awaited<
      ReturnType<typeof fetchUpstreamOracle>
    >;
  } catch {
    return null;
  }
};

const fetchUpstreamDownstreamDiagnostics = async (
  sourceUrl: string,
): Promise<DownstreamDiagnostics> => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        Boolean(
          (globalThis as Record<string, unknown>).pack &&
            (globalThis as Record<string, unknown>).grid,
        ),
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1000);

    return await page.evaluate<DownstreamDiagnostics>(async () => {
      const digestHex = async (values: readonly number[]): Promise<string> => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          Uint32Array.from(values),
        );
        return Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
      };
      const globalData = globalThis as Record<string, unknown>;
      const grid = globalData.grid as {
        cells: {
          culture?: ArrayLike<number>;
          burg?: ArrayLike<number>;
          state?: ArrayLike<number>;
          province?: ArrayLike<number>;
          religion?: ArrayLike<number>;
        };
      };
      const pack = globalData.pack as {
        cells: {
          i: ArrayLike<number>;
          g: ArrayLike<number>;
          h: ArrayLike<number>;
          p: ArrayLike<readonly [number, number]>;
          culture?: ArrayLike<number>;
          burg?: ArrayLike<number>;
          state?: ArrayLike<number>;
          province?: ArrayLike<number>;
          religion?: ArrayLike<number>;
          routes?: Record<string, Record<string, number>>;
        };
        burgs: Array<{
          cell: number;
          capital?: number;
          port?: number;
          culture?: number;
          population?: number;
        }>;
        states: Array<{
          center?: number;
          culture?: number;
          form?: number;
          cells?: number;
        }>;
        provinces: Array<{
          state?: number;
          center?: number;
          burg?: number;
          removed?: boolean;
        }>;
        religions: Array<{
          center?: number;
          type?: string | number;
          cells?: number;
          removed?: boolean;
        }>;
        cultures: Array<{
          center?: number;
        }>;
        routes: Array<{
          i: number;
          group: string;
          feature: number;
          cells?: number[];
          points: number[][];
        }>;
      };

      const projectGrid = (source: ArrayLike<number>): number[] =>
        Array.from(
          { length: pack.cells.i.length },
          (_, packId) => source[pack.cells.g[packId] ?? 0] ?? 0,
        );
      const projectPack = (source?: ArrayLike<number>): number[] =>
        Array.from(
          { length: pack.cells.i.length },
          (_, packId) => source?.[packId] ?? 0,
        );
      const toNumericReligionType = (
        value: string | number | undefined,
      ): number => {
        if (typeof value === "number") return value;
        if (value === "Folk") return 1;
        if (value === "Organized") return 2;
        if (value === "Cult") return 3;
        if (value === "Heresy") return 4;
        return 0;
      };
      const routeValues = pack.routes.flatMap((route) => [
        route.i,
        route.group === "roads" ? 1 : route.group === "trails" ? 2 : 3,
        route.feature,
        ...(route.cells ?? route.points.map((point) => Number(point[2] ?? 0))),
      ]);
      const routeDataHash = await digestHex(routeValues);

      const capture = async (
        key: string,
        label: string,
      ): Promise<DownstreamDiagnostics["steps"][number]> => {
        const packCulture = pack.cells.culture
          ? projectPack(pack.cells.culture)
          : projectGrid(grid.cells.culture ?? []);
        const packBurg = pack.cells.burg
          ? projectPack(pack.cells.burg)
          : projectGrid(grid.cells.burg ?? []);
        const packState = pack.cells.state
          ? projectPack(pack.cells.state)
          : projectGrid(grid.cells.state ?? []);
        const packProvince = pack.cells.province
          ? projectPack(pack.cells.province)
          : projectGrid(grid.cells.province ?? []);
        const packReligion = pack.cells.religion
          ? projectPack(pack.cells.religion)
          : projectGrid(grid.cells.religion ?? []);
        const cultureCenterPack = [
          0,
          ...pack.cultures
            .slice(1)
            .map((culture: { center?: number }) => Number(culture.center ?? 0)),
        ];
        const cultureTemplateIds = [0];
        const cultureCenterSamples: number[] = [];
        const cultureCenterSampleIndices: number[] = [];
        const cultureCenterSampleOffsets = [0];
        if (key === "downstream:cultures") {
          const originalRandom = Math.random;
          (globalThis as { Ice?: { generate: () => void } }).Ice?.generate();
          const random = (): number => Math.random();
          const populated = Array.from(pack.cells.i).filter(
            (packId) =>
              Number(
                (pack.cells as { s?: ArrayLike<number> }).s?.[packId] ?? 0,
              ) > 0,
          );
          const defaults =
            (
              globalThis as {
                Cultures?: {
                  getDefault: (
                    count?: number,
                  ) => Array<{ odd?: number; sort?: (id: number) => number }>;
                };
                document?: {
                  getElementById: (id: string) => {
                    value?: string;
                    selectedOptions?: ArrayLike<{ dataset?: { max?: string } }>;
                  } | null;
                };
                d3?: {
                  quadtree: () => {
                    add: (point: readonly [number, number]) => void;
                    find: (x: number, y: number, radius: number) => unknown;
                  };
                };
                rand?: (max: number) => number;
                P?: (probability: number) => boolean;
                biased?: (min: number, max: number, exponent: number) => number;
                graphWidth?: number;
                graphHeight?: number;
              }
            ).Cultures?.getDefault(
              Number(
                (
                  globalThis as {
                    document?: {
                      getElementById: (id: string) => {
                        value?: string;
                        selectedOptions?: ArrayLike<{
                          dataset?: { max?: string };
                        }>;
                      } | null;
                    };
                  }
                ).document?.getElementById("culturesInput")?.value ?? 0,
              ),
            ) ?? [];
          const selectedTemplates: Array<{
            odd?: number;
            sort?: (id: number) => number;
            templateId: number;
          }> = [];
          const pool = defaults.map((template, templateId) => ({
            ...template,
            templateId,
          }));
          let attempts = 0;
          while (
            selectedTemplates.length < cultureCenterPack.length - 1 &&
            pool.length > 0
          ) {
            let templateIndex = 0;
            do {
              templateIndex = Math.floor(random() * pool.length);
              attempts += 1;
            } while (
              attempts < 200 &&
              random() >= (pool[templateIndex]?.odd ?? 1)
            );

            const selected = pool.splice(templateIndex, 1)[0];
            if (!selected) {
              break;
            }
            selectedTemplates.push(selected);
            cultureTemplateIds.push(selected.templateId);
          }
          (
            globalThis as { getColors?: (count: number) => unknown }
          ).getColors?.(cultureCenterPack.length - 1);
          const selectedCenters: number[] = [];
          const getBiased = (
            min: number,
            max: number,
            exponent: number,
          ): number => Math.round(min + (max - min) * random() ** exponent);

          for (const culture of selectedTemplates) {
            const sortingFn =
              culture.sort ??
              ((packId: number) =>
                Number(
                  (pack.cells as { s?: ArrayLike<number> }).s?.[packId] ?? 0,
                ));
            const sorted = populated
              .slice()
              .sort((left, right) => sortingFn(right) - sortingFn(left));
            const max = Math.floor(sorted.length / 2);
            let spacing =
              (Number(globalData.graphWidth ?? 0) +
                Number(globalData.graphHeight ?? 0)) /
              2 /
              Math.max(cultureCenterPack.length - 1, 1);
            let center = 0;
            for (let attempt = 0; attempt < 100; attempt += 1) {
              const sampleIndex = getBiased(0, max, 5);
              cultureCenterSampleIndices.push(sampleIndex);
              center = sorted[sampleIndex] ?? center;
              cultureCenterSamples.push(center);
              spacing *= 0.9;
              const [x, y] = pack.cells.p[center] ?? [0, 0];
              const spacingSq = spacing * spacing;
              const blocked = selectedCenters.some((selectedCenter) => {
                const [sx, sy] = pack.cells.p[selectedCenter] ?? [0, 0];
                const dx = (sx ?? 0) - (x ?? 0);
                const dy = (sy ?? 0) - (y ?? 0);
                return dx * dx + dy * dy < spacingSq;
              });
              if (!blocked) {
                break;
              }
            }
            selectedCenters.push(center);
            cultureCenterSampleOffsets.push(cultureCenterSamples.length);
          }
          Math.random = originalRandom;
        }
        const burgCell = [
          0,
          ...pack.burgs.slice(1).map((burg) => burg.cell ?? 0),
        ];
        const burgCapital = [
          0,
          ...pack.burgs.slice(1).map((burg) => Number(burg.capital ?? 0)),
        ];
        const burgPort = [
          0,
          ...pack.burgs.slice(1).map((burg) => Number(burg.port ?? 0)),
        ];
        const burgCulture = [
          0,
          ...pack.burgs.slice(1).map((burg) => Number(burg.culture ?? 0)),
        ];
        const burgPopulation = [
          0,
          ...pack.burgs
            .slice(1)
            .map((burg) => Math.round(Number(burg.population ?? 0) * 10)),
        ];
        const stateCenterBurg = [
          0,
          ...pack.states.slice(1).map((state) => Number(state.center ?? 0)),
        ];
        const stateCulture = [
          0,
          ...pack.states.slice(1).map((state) => Number(state.culture ?? 0)),
        ];
        const stateForm = [
          0,
          ...pack.states.slice(1).map((state) => Number(state.form ?? 0)),
        ];
        const stateCells = [
          0,
          ...pack.states.slice(1).map((state) => Number(state.cells ?? 0)),
        ];
        const provinceState = [
          0,
          ...pack.provinces
            .slice(1)
            .map((province) => Number(province.state ?? 0)),
        ];
        const provinceCenterCell = [
          0,
          ...pack.provinces
            .slice(1)
            .map((province) => Number(province.center ?? 0)),
        ];
        const provinceCells = [
          0,
          ...pack.provinces
            .slice(1)
            .map((province) => Number(province.removed ? 0 : 1)),
        ];
        const religionSeedCell = [
          0,
          ...pack.religions
            .slice(1)
            .map((religion) => Number(religion.center ?? 0)),
        ];
        const religionType = [
          0,
          ...pack.religions
            .slice(1)
            .map((religion) => toNumericReligionType(religion.type)),
        ];
        const religionSize = [
          0,
          ...pack.religions
            .slice(1)
            .map((religion) => Number(religion.cells ?? 0)),
        ];

        return {
          key,
          label,
          cultureCenterPack,
          cultureTemplateIds,
          cultureCenterSamples,
          cultureCenterSampleIndices,
          cultureCenterSampleOffsets,
          packCulture,
          packBurg,
          packState,
          packProvince,
          packReligion,
          burgCell,
          burgCapital,
          burgPort,
          burgCulture,
          burgPopulation,
          stateCenterBurg,
          stateCulture,
          stateForm,
          stateCells,
          provinceState,
          provinceCenterCell,
          provinceCells,
          religionSeedCell,
          religionType,
          religionSize,
          routeCount: pack.routes.length,
          routeDataHash,
          cultureHash: await digestHex(packCulture),
          burgHash: await digestHex(
            packBurg.concat(
              burgCell,
              burgCapital,
              burgPort,
              burgCulture,
              burgPopulation,
            ),
          ),
          stateHash: await digestHex(
            packState.concat(
              stateCenterBurg,
              stateCulture,
              stateForm,
              stateCells,
            ),
          ),
          provinceHash: await digestHex(
            packProvince.concat(
              provinceState,
              provinceCenterCell,
              provinceCells,
            ),
          ),
          religionHash: await digestHex(
            packReligion.concat(religionSeedCell, religionType, religionSize),
          ),
        };
      };

      const templateInput = (
        globalThis as {
          document?: {
            getElementById: (id: string) => { value?: string } | null;
          };
        }
      ).document?.getElementById("templateInput");
      const templateId = templateInput?.value ?? "continents";
      const heightTemplate: "continents" | "archipelago" | "mediterranean" =
        templateId === "archipelago"
          ? "archipelago"
          : templateId === "inland-sea"
            ? "mediterranean"
            : "continents";

      const steps = [
        await capture("downstream:cultures", "Cultures"),
        await capture("downstream:burgs-generation", "Burg generation"),
        await capture("downstream:states", "States"),
        await capture("downstream:routes", "Routes"),
        await capture("downstream:religions", "Religions"),
        await capture("downstream:burgs-specification", "Burg specification"),
        await capture("downstream:state-forms", "State forms"),
        await capture("downstream:provinces", "Provinces"),
      ];

      return {
        seed: String(globalData.seed ?? ""),
        width: Number(globalData.graphWidth ?? 0),
        height: Number(globalData.graphHeight ?? 0),
        cellCount: Number(
          (grid.cells.culture ?? pack.cells.culture ?? []).length,
        ),
        packCellCount: Number(pack.cells.i.length),
        heightTemplate,
        steps,
      };
    });
  } finally {
    await browser.close();
  }
};

const fetchUpstreamCultureRuntime = async (sourceUrl: string) => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    return await page.evaluate(() => {
      const globalData = globalThis as Record<string, unknown>;
      const pack = globalData.pack as {
        cells: {
          i: number[];
          p: Array<readonly [number, number]>;
          culture: Uint16Array;
        };
        cultures: Array<{ center?: number }>;
      };
      const d3 = globalData.d3 as {
        quadtree: () => {
          add: (point: readonly [number, number]) => void;
          find: (x: number, y: number, radius: number) => unknown;
        };
      };
      const Cultures = globalData.Cultures as {
        generate: () => void;
        getDefault: (count?: number) => Array<{ odd?: number }>;
      };
      const Ice = globalData.Ice as { generate: () => void };
      const rankCells = globalData.rankCells as () => void;
      const biased = globalData.biased as (
        min: number,
        max: number,
        exponent: number,
      ) => number;

      const originalGenerate = Cultures.generate;
      const originalGetDefault = Cultures.getDefault;
      const originalRand = globalData.rand as
        | ((max: number) => number)
        | undefined;
      const originalP = globalData.P as
        | ((probability: number) => boolean)
        | undefined;
      const originalBiased = biased;
      const originalQuadtree = d3.quadtree;
      const originalCultureCells = pack.cells.culture;
      const originalCultures = pack.cultures;

      const templateByRef = new WeakMap<object, number>();
      const sampleIndices: number[] = [];
      const sampleCells: number[] = [];
      const sampleOffsets = [0];
      const selectedCenters = [0];
      const selectedTemplateIds = [0];
      const templateDrawEvents: Array<{
        draw: number;
        poolLength: number;
        pickedIndex: number;
        templateId: number;
        accepted: boolean;
      }> = [];
      let pendingCenterSampleCount = 0;
      let currentTemplatePoolLength = 0;
      let currentTemplateId = 0;
      let currentTemplateIndex = 0;
      let currentDraw = 0;

      Cultures.getDefault = (count?: number) => {
        const defaults = originalGetDefault.call(Cultures, count);
        defaults.forEach((template, templateId) => {
          if (template && typeof template === "object") {
            templateByRef.set(template as object, templateId);
          }
        });
        return defaults;
      };

      if (originalRand && originalP) {
        (globalData as { rand: typeof originalRand }).rand = (max) => {
          const pickedIndex = originalRand(max);
          currentTemplatePoolLength = max + 1;
          currentTemplateIndex = pickedIndex;
          return pickedIndex;
        };
        (globalData as { P: typeof originalP }).P = (probability) => {
          const accepted = originalP(probability);
          currentDraw += 1;
          templateDrawEvents.push({
            draw: currentDraw,
            poolLength: currentTemplatePoolLength,
            pickedIndex: currentTemplateIndex,
            templateId: currentTemplateId,
            accepted,
          });
          return accepted;
        };
      }

      (globalData as { biased: typeof biased }).biased = (
        min,
        max,
        exponent,
      ) => {
        const sampleIndex = originalBiased(min, max, exponent);
        sampleIndices.push(sampleIndex);
        pendingCenterSampleCount += 1;
        return sampleIndex;
      };

      d3.quadtree = () => {
        const tree = originalQuadtree();
        const originalFind = tree.find.bind(tree);
        const originalAdd = tree.add.bind(tree);
        tree.find = (x, y, radius) => {
          const center = pack.cells.p.findIndex(
            (point) => point[0] === x && point[1] === y,
          );
          if (center >= 0) {
            sampleCells.push(center);
          }
          return originalFind(x, y, radius);
        };
        tree.add = (point) => {
          const center = pack.cells.p.findIndex(
            (candidate) => candidate === point,
          );
          if (center >= 0) {
            selectedCenters.push(center);
            sampleOffsets.push(
              sampleOffsets[sampleOffsets.length - 1]! +
                pendingCenterSampleCount,
            );
            pendingCenterSampleCount = 0;
          }
          return originalAdd(point);
        };
        return tree;
      };

      Cultures.generate = function generateWithCapture() {
        originalGenerate.call(this);
        for (const culture of pack.cultures.slice(1)) {
          selectedTemplateIds.push(
            culture && typeof culture === "object"
              ? (templateByRef.get(culture as object) ?? 0)
              : 0,
          );
        }
      };

      try {
        Ice.generate();
        rankCells();
        pack.cells.culture = new Uint16Array(pack.cells.i.length);
        pack.cultures = [];
        const defaults = originalGetDefault.call(Cultures, 9);
        const defaultsWithIds = defaults.map((template, templateId) => ({
          ...template,
          templateId,
        }));
        const taggedDefaults = defaultsWithIds.map((template) => {
          if (template && typeof template === "object") {
            templateByRef.set(template as object, template.templateId);
          }
          return template;
        });
        Cultures.getDefault = (() =>
          taggedDefaults.slice()) as typeof originalGetDefault;
        const originalRandWrapped = globalData.rand as
          | ((max: number) => number)
          | undefined;
        if (originalRandWrapped) {
          (globalData as { rand: typeof originalRandWrapped }).rand = (max) => {
            const pickedIndex = originalRandWrapped(max);
            currentTemplatePoolLength = max + 1;
            currentTemplateIndex = pickedIndex;
            currentTemplateId = taggedDefaults[pickedIndex]?.templateId ?? 0;
            return pickedIndex;
          };
        }
        Cultures.generate();
      } finally {
        Cultures.generate = originalGenerate;
        Cultures.getDefault = originalGetDefault;
        if (originalRand) {
          (globalData as { rand: typeof originalRand }).rand = originalRand;
        }
        if (originalP) {
          (globalData as { P: typeof originalP }).P = originalP;
        }
        (globalData as { biased: typeof biased }).biased = originalBiased;
        d3.quadtree = originalQuadtree;
        pack.cells.culture = originalCultureCells;
        pack.cultures = originalCultures;
      }

      return {
        selectedTemplateIds,
        selectedCenters,
        sampleIndices,
        sampleCells,
        sampleOffsets,
        templateDrawEvents,
      };
    });
  } finally {
    await browser.close();
  }
};

const printComparison = (comparison: DownstreamDiagnosticsComparison): void => {
  const first = comparison.firstDivergentStep;
  console.log(`downstream_steps_compared: ${comparison.steps.length}`);
  console.log(`downstream_match: ${comparison.matches}`);
  console.log(
    `first_divergent_step: ${first ? `${first.key} (${first.label})` : "none"}`,
  );
  if (!first) return;
  console.log(
    `first_divergent_culture_center: ${first.firstCultureCenterDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_culture_cell: ${first.firstCultureDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_burg_cell: ${first.firstBurgDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_state_cell: ${first.firstStateDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_province_cell: ${first.firstProvinceDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_religion_cell: ${first.firstReligionDifferenceCell ?? "none"}`,
  );
};

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const oraclePath = path.resolve(
    process.cwd(),
    args.oracle ?? DEFAULT_ORACLE_CACHE,
  );
  const cachedOracle = await loadCachedOracle(oraclePath);
  const oracleSnapshot = cachedOracle ?? (await fetchUpstreamOracle(args.url));
  const sourceUrl = args.url ?? oracleSnapshot.sourceUrl ?? "";
  const config = buildGenerationConfigFromOracle(oracleSnapshot);
  const local = generateDownstreamDiagnostics(config);
  const oracle = await fetchUpstreamDownstreamDiagnostics(sourceUrl);
  const cultureRuntime = await fetchUpstreamCultureRuntime(sourceUrl);
  const comparison = compareDownstreamDiagnostics(oracle, local);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT);
  const report: DownstreamHarnessReport = {
    oracleSeed: oracleSnapshot.seed,
    oracleSourceUrl: sourceUrl,
    local,
    oracle,
    comparison,
    cultureRuntime,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printComparison(comparison);
  console.log(`downstream_report_json: ${outputPath}`);
}
