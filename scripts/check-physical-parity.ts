import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { firefox } from "playwright";
import {
  type PhysicalDiagnostics,
  type PhysicalDiagnosticsComparison,
  comparePhysicalDiagnostics,
  generatePhysicalDiagnostics,
} from "../src/index";
import { buildGenerationConfigFromOracle } from "../src/internal/oracle-config";
import { fetchUpstreamOracle } from "./fetch-upstream-oracle";

const DEFAULT_OUTPUT = "artifacts/parity/physical-harness-report.json";
const DEFAULT_ORACLE_CACHE = "artifacts/parity/upstream-oracle.json";

type PhysicalHarnessReport = Readonly<{
  oracleSeed: string;
  oracleSourceUrl: string;
  local: PhysicalDiagnostics;
  oracle: PhysicalDiagnostics;
  comparison: PhysicalDiagnosticsComparison;
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

const fetchUpstreamPhysicalDiagnostics = async (
  sourceUrl: string,
): Promise<PhysicalDiagnostics> => {
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
            (globalThis as Record<string, unknown>).Rivers &&
            (globalThis as Record<string, unknown>).Biomes,
        ),
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1000);

    return await page.evaluate<PhysicalDiagnostics>(async () => {
      type BrowserPhysicalStep = {
        key: string;
        label: string;
        packToGrid: number[];
        packH: number[];
        packX100: number[];
        packY100: number[];
        temp: number[];
        prec: number[];
        flow: number[];
        river: number[];
        biome: number[];
        tempHash: string;
        precHash: string;
        flowHash: string;
        riverHash: string;
        biomeHash: string;
        riverCellCount: number;
        uniqueRiverCount: number;
      };

      const digestHex = async (values: readonly number[]): Promise<string> => {
        const buffer = Uint32Array.from(values);
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
      };

      const globalData = globalThis as Record<string, unknown>;
      const grid = globalData.grid as {
        cells: {
          temp: ArrayLike<number>;
          prec: ArrayLike<number>;
        };
      };
      const getPack = () =>
        globalData.pack as {
          cells: {
            i: ArrayLike<number>;
            g: ArrayLike<number>;
            h: ArrayLike<number>;
            p: ArrayLike<readonly [number, number]>;
            fl?: ArrayLike<number>;
            r?: ArrayLike<number>;
            biome?: ArrayLike<number>;
          };
        };
      const Features = globalData.Features as {
        markupPack: () => void;
      };
      const reGraph = globalData.reGraph as (() => void) | undefined;

      if (!Features || !reGraph) {
        throw new Error("Upstream physical pipeline globals are unavailable");
      }

      const capture = async (
        key: string,
        label: string,
        visibility: Readonly<{
          temp: boolean;
          prec: boolean;
          flow: boolean;
          river: boolean;
          biome: boolean;
        }>,
      ): Promise<BrowserPhysicalStep> => {
        const pack = getPack();
        const packCellCount = pack.cells.i.length;
        const packToGrid = new Array<number>(packCellCount);
        const packH = new Array<number>(packCellCount);
        const packX100 = new Array<number>(packCellCount);
        const packY100 = new Array<number>(packCellCount);
        const temp = new Array<number>(packCellCount);
        const prec = new Array<number>(packCellCount);
        const flow = new Array<number>(packCellCount);
        const river = new Array<number>(packCellCount);
        const biome = new Array<number>(packCellCount);
        const rivers = new Set<number>();
        let riverCellCount = 0;

        for (let packId = 0; packId < packCellCount; packId += 1) {
          const gridCellId = pack.cells.g[packId] ?? 0;
          const packHeight = pack.cells.h[packId] ?? 0;
          const point = pack.cells.p[packId] ?? [0, 0];
          const tempValue = visibility.temp
            ? (grid.cells.temp[gridCellId] ?? 0)
            : 0;
          const precValue = visibility.prec
            ? (grid.cells.prec[gridCellId] ?? 0)
            : 0;
          const flowValue = visibility.flow
            ? (pack.cells.fl?.[packId] ?? 0)
            : 0;
          const riverValue = visibility.river
            ? (pack.cells.r?.[packId] ?? 0)
            : 0;
          const biomeValue = visibility.biome
            ? (pack.cells.biome?.[packId] ?? 0)
            : 0;

          packToGrid[packId] = gridCellId;
          packH[packId] = packHeight;
          packX100[packId] = Math.round((point[0] ?? 0) * 100);
          packY100[packId] = Math.round((point[1] ?? 0) * 100);
          temp[packId] = tempValue;
          prec[packId] = precValue;
          flow[packId] = flowValue;
          river[packId] = riverValue;
          biome[packId] = biomeValue;

          if (riverValue > 0) {
            riverCellCount += 1;
            rivers.add(riverValue);
          }
        }

        return {
          key,
          label,
          packToGrid,
          packH,
          packX100,
          packY100,
          temp,
          prec,
          flow,
          river,
          biome,
          tempHash: await digestHex(temp),
          precHash: await digestHex(prec),
          flowHash: await digestHex(flow),
          riverHash: await digestHex(river),
          biomeHash: await digestHex(biome),
          riverCellCount,
          uniqueRiverCount: rivers.size,
        };
      };

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
      const heightTemplate: "continents" | "archipelago" | "mediterranean" =
        templateId === "archipelago"
          ? "archipelago"
          : templateId === "inland-sea"
            ? "mediterranean"
            : "continents";
      const steps: BrowserPhysicalStep[] = [];
      const seaLevel = 20;
      const originalPack = getPack();
      const originalTemp = Int8Array.from(grid.cells.temp);
      const originalPrec = Uint8Array.from(grid.cells.prec);

      globalData.pack = {};
      reGraph();
      Features.markupPack();
      grid.cells.temp = new Int8Array(grid.cells.temp.length);
      grid.cells.prec = new Uint8Array(grid.cells.prec.length);
      steps.push(
        await capture("physical:pack-ready", "Pack ready", {
          temp: false,
          prec: false,
          flow: false,
          river: false,
          biome: false,
        }),
      );

      globalData.pack = originalPack;
      grid.cells.temp = originalTemp;
      grid.cells.prec = originalPrec;
      steps.push(
        await capture("physical:climate-temp", "Climate temperature", {
          temp: true,
          prec: false,
          flow: false,
          river: false,
          biome: false,
        }),
      );
      steps.push(
        await capture("physical:climate-prec", "Climate precipitation", {
          temp: true,
          prec: true,
          flow: false,
          river: false,
          biome: false,
        }),
      );
      steps.push(
        await capture("physical:hydrology", "Hydrology", {
          temp: true,
          prec: true,
          flow: true,
          river: true,
          biome: false,
        }),
      );
      steps.push(
        await capture("physical:biome", "Biome", {
          temp: true,
          prec: true,
          flow: true,
          river: true,
          biome: true,
        }),
      );

      return {
        seed,
        width,
        height,
        cellCount: grid.cells.temp.length,
        packCellCount: getPack().cells.i.length,
        heightTemplate,
        seaLevel,
        steps,
      };
    });
  } finally {
    await browser.close();
  }
};

const printComparison = (comparison: PhysicalDiagnosticsComparison): void => {
  const first = comparison.firstDivergentStep;
  console.log(`physical_steps_compared: ${comparison.steps.length}`);
  console.log(`physical_match: ${comparison.matches}`);
  console.log(
    `first_divergent_step: ${first ? `${first.key} (${first.label})` : "none"}`,
  );
  if (!first) {
    return;
  }

  console.log(
    `first_divergent_pack_cell: ${first.firstPackToGridDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_pack_height_cell: ${first.firstPackHDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_pack_x_cell: ${first.firstPackXDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_pack_y_cell: ${first.firstPackYDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_temp_cell: ${first.firstTempDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_prec_cell: ${first.firstPrecDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_flow_cell: ${first.firstFlowDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_river_cell: ${first.firstRiverDifferenceCell ?? "none"}`,
  );
  console.log(
    `first_divergent_biome_cell: ${first.firstBiomeDifferenceCell ?? "none"}`,
  );
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
  const local = generatePhysicalDiagnostics(config);
  const oracle = await fetchUpstreamPhysicalDiagnostics(sourceUrl);
  const comparison = comparePhysicalDiagnostics(oracle, local);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT);
  const report: PhysicalHarnessReport = {
    oracleSeed: oracleSnapshot.seed,
    oracleSourceUrl: sourceUrl,
    local,
    oracle,
    comparison,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printComparison(comparison);
  console.log(`physical_report_json: ${outputPath}`);
}
