import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { firefox } from "playwright";
import {
  type TerrainDiagnostics,
  type TerrainDiagnosticsComparison,
  compareTerrainDiagnostics,
  generateTerrainDiagnostics,
} from "../src/index";
import { buildGenerationConfigFromOracle } from "../src/internal/oracle-config";
import { fetchUpstreamOracle } from "./fetch-upstream-oracle";

const DEFAULT_OUTPUT = "artifacts/parity/terrain-harness-report.json";
const DEFAULT_ORACLE_CACHE = "artifacts/parity/upstream-oracle.json";

type TerrainHarnessReport = Readonly<{
  oracleSeed: string;
  oracleSourceUrl: string;
  local: TerrainDiagnostics;
  oracle: TerrainDiagnostics;
  comparison: TerrainDiagnosticsComparison;
}>;

const parseArgs = (argv: string[]): Record<string, string> => {
  const values: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${current ?? ""}`);
    }

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

const fetchUpstreamTerrainDiagnostics = async (
  sourceUrl: string,
): Promise<TerrainDiagnostics> => {
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
            (globalThis as Record<string, unknown>).grid &&
            (
              (globalThis as Record<string, unknown>).pack as {
                cells?: { state?: unknown };
                burgs?: { length: number };
                states?: { length: number };
                religions?: { length: number };
              }
            ).cells?.state &&
            (
              (globalThis as Record<string, unknown>).pack as {
                burgs?: { length: number };
                states?: { length: number };
                religions?: { length: number };
              }
            ).burgs?.length &&
            (
              (globalThis as Record<string, unknown>).pack as {
                states?: { length: number };
                religions?: { length: number };
              }
            ).states?.length &&
            (
              (globalThis as Record<string, unknown>).pack as {
                religions?: { length: number };
              }
            ).religions?.length,
        ),
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1000);

    return await page.evaluate<TerrainDiagnostics>(() => {
      type BrowserTerrainStep = {
        key: string;
        label: string;
        landCellCount: number;
        landComponentSizes: number[];
        coastMask: number[];
      };

      const globalData = globalThis as Record<string, unknown>;
      const grid = globalData.grid as {
        cellsDesired: number;
        cellsX: number;
        cellsY: number;
        points: [number, number][];
        cells: {
          i: number[];
          c: number[][];
          b: ArrayLike<number>;
          h: ArrayLike<number>;
        };
      };
      const HeightmapGenerator = globalData.HeightmapGenerator as {
        addStep: (
          tool: string,
          a2: string,
          a3: string,
          a4: string,
          a5: string,
        ) => void;
        generate: (graph: unknown) => Promise<Uint8Array>;
        getHeights: () => Uint8Array | null;
      };
      if (!HeightmapGenerator) {
        throw new Error("Upstream HeightmapGenerator is unavailable");
      }
      const seed = String(globalData.seed ?? "");
      const width = Number(globalData.graphWidth ?? 0);
      const height = Number(globalData.graphHeight ?? 0);
      const templateInput = (
        globalThis as {
          document?: {
            getElementById: (id: string) => { value?: string } | null;
          };
        }
      ).document?.getElementById("templateInput");
      const templateId = templateInput?.value ?? "continents";
      const heightTemplate: "continents" | "archipelago" | "inland-sea" =
        templateId === "archipelago" || templateId === "inland-sea"
          ? templateId
          : "continents";
      const steps: BrowserTerrainStep[] = [];
      const seaLevel = 20;
      const neighbors = grid.cells.c.map((entry) => entry.slice());
      const zeroHeights = new Uint8Array(grid.cells.i.length);
      const originalHeights = Uint8Array.from(
        ((grid as { cells?: { h?: ArrayLike<number> } }).cells?.h ??
          []) as ArrayLike<number>,
      );

      const capture = (
        heights: ArrayLike<number>,
        key: string,
        label: string,
      ): BrowserTerrainStep => {
        const land = Array.from(heights, (value) =>
          value >= seaLevel ? 1 : 0,
        );
        const coastMask = new Array(land.length).fill(0);
        const visited = new Uint8Array(land.length);
        const componentSizes: number[] = [];

        for (let cellId = 0; cellId < land.length; cellId += 1) {
          const isLand = land[cellId] === 1;
          let touchesOpposite = false;

          for (const neighborId of neighbors[cellId] ?? []) {
            if ((land[neighborId] ?? 0) !== (isLand ? 1 : 0)) {
              touchesOpposite = true;
              break;
            }
          }

          if (touchesOpposite) {
            coastMask[cellId] = isLand ? 1 : -1;
          }

          if (!isLand || visited[cellId] === 1) {
            continue;
          }

          let size = 0;
          const queue = [cellId];
          visited[cellId] = 1;

          while (queue.length > 0) {
            const current = queue.pop() ?? 0;
            size += 1;

            for (const neighborId of neighbors[current] ?? []) {
              if ((land[neighborId] ?? 0) !== 1 || visited[neighborId] === 1) {
                continue;
              }

              visited[neighborId] = 1;
              queue.push(neighborId);
            }
          }

          componentSizes.push(size);
        }

        for (let distance = 2; distance <= 10; distance += 1) {
          for (let cellId = 0; cellId < land.length; cellId += 1) {
            if (land[cellId] !== 1 || coastMask[cellId] !== 0) {
              continue;
            }

            if (
              (neighbors[cellId] ?? []).some(
                (neighborId) => coastMask[neighborId] === distance - 1,
              )
            ) {
              coastMask[cellId] = distance;
            }
          }
        }

        for (let distance = -2; distance >= -10; distance -= 1) {
          for (let cellId = 0; cellId < land.length; cellId += 1) {
            if (land[cellId] !== 0 || coastMask[cellId] !== 0) {
              continue;
            }

            if (
              (neighbors[cellId] ?? []).some(
                (neighborId) => coastMask[neighborId] === distance + 1,
              )
            ) {
              coastMask[cellId] = distance;
            }
          }
        }

        componentSizes.sort((left, right) => right - left);
        return {
          key,
          label,
          landCellCount: land.reduce<number>(
            (count, value) => count + value,
            0,
          ),
          landComponentSizes: componentSizes,
          coastMask,
        };
      };

      const originalAddStep =
        HeightmapGenerator.addStep.bind(HeightmapGenerator);
      let stepIndex = 0;
      HeightmapGenerator.addStep = (tool, a2, a3, a4, a5) => {
        originalAddStep(tool, a2, a3, a4, a5);
        stepIndex += 1;
        const heights = HeightmapGenerator.getHeights() ?? zeroHeights;
        steps.push(
          capture(
            heights,
            `heightmap:${stepIndex}:${tool}`,
            `Heightmap ${stepIndex} ${tool}`,
          ),
        );
      };

      grid.cells.h = zeroHeights;

      return HeightmapGenerator.generate(grid)
        .then((heights) => {
          steps.push(
            capture(heights, "heightmap:complete", "Heightmap complete"),
          );
          return {
            seed,
            width,
            height,
            cellCount: grid.cells.i.length,
            heightTemplate,
            seaLevel,
            steps,
          };
        })
        .finally(() => {
          HeightmapGenerator.addStep = originalAddStep;
          (grid as unknown as { cells: { h: Uint8Array } }).cells.h =
            originalHeights;
        });
    });
  } finally {
    await browser.close();
  }
};

const printComparison = (comparison: TerrainDiagnosticsComparison): void => {
  const first = comparison.firstDivergentStep;
  console.log(`terrain_steps_compared: ${comparison.steps.length}`);
  console.log(`terrain_match: ${comparison.matches}`);
  console.log(
    `first_divergent_step: ${first ? `${first.key} (${first.label})` : "none"}`,
  );
  if (first) {
    console.log(
      `first_divergent_land_cells: local=${first.localLandCellCount} oracle=${first.oracleLandCellCount}`,
    );
    console.log(
      `first_divergent_coast_cell: ${first.firstCoastMaskDifferenceCell ?? "none"}`,
    );
  }
};

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const oraclePath = path.resolve(
    process.cwd(),
    args.oracle ?? DEFAULT_ORACLE_CACHE,
  );
  const refreshOracle = args.refresh === "true";
  const cachedOracle = refreshOracle
    ? null
    : await loadCachedOracle(oraclePath);
  const oracleSnapshot = cachedOracle ?? (await fetchUpstreamOracle(args.url));
  const sourceUrl = args.url ?? oracleSnapshot.sourceUrl ?? "";
  const config = buildGenerationConfigFromOracle(oracleSnapshot);
  const local = generateTerrainDiagnostics(config);
  const oracle = await fetchUpstreamTerrainDiagnostics(sourceUrl);
  const comparison = compareTerrainDiagnostics(oracle, local);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT);
  const report: TerrainHarnessReport = {
    oracleSeed: oracleSnapshot.seed,
    oracleSourceUrl: sourceUrl,
    local,
    oracle,
    comparison,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printComparison(comparison);
  console.log(`terrain_report_json: ${outputPath}`);
}
