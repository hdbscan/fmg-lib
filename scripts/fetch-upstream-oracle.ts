import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { firefox } from "playwright";
import type { ParitySnapshot } from "../src/parity";

const DEFAULT_URL =
  "https://azgaar.github.io/Fantasy-Map-Generator/?seed=42424242&options=default";

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

const normalizeBooleanArray = (values: ArrayLike<number>): number[] =>
  Array.from(values, (value) => (value >= 20 ? 1 : 0));

const normalizeOracle = (payload: {
  seed: string;
  width: number;
  height: number;
  gridSpacing: number;
  terrainVertices: [number, number][];
  terrainPolygons: number[][];
  terrainHeights: ArrayLike<number>;
  regionVertices: [number, number][];
  regionPolygons: number[][];
  stateLabels: ArrayLike<number>;
  religionLabels: ArrayLike<number>;
  burgs: Array<{
    id: number;
    x: number;
    y: number;
    cell: number;
    name: string;
  }>;
  counts: {
    landmasses: number;
    states: number;
    religions: number;
    burgs: number;
  };
  cultureCount: number;
  heightmapTemplate: string | null;
  statesNumber: number | null;
  townsNumber: number | null;
  sizeVariety: number | null;
  growthRate: number | null;
  statesGrowthRate: number | null;
  provincesRatio: number | null;
  religionsNumber: number | null;
  temperatureEquator: number | null;
  temperatureNorthPole: number | null;
  temperatureSouthPole: number | null;
  elevationExponent: number | null;
  lakeElevationLimit: number | null;
  precipitation: number | null;
  mapSize: number | null;
  latitude: number | null;
  longitude: number | null;
  winds: readonly [number, number, number, number, number, number] | null;
  sourceUrl: string;
}): ParitySnapshot => ({
  kind: "upstream-oracle",
  seed: payload.seed,
  width: payload.width,
  height: payload.height,
  gridSpacing: payload.gridSpacing,
  terrain: {
    mesh: {
      vertices: payload.terrainVertices,
      polygons: payload.terrainPolygons,
    },
    land: normalizeBooleanArray(payload.terrainHeights),
  },
  regions: {
    vertices: payload.regionVertices,
    polygons: payload.regionPolygons,
    states: Array.from(payload.stateLabels),
    religions: Array.from(payload.religionLabels),
  },
  burgs: payload.burgs,
  counts: payload.counts,
  cultureCount: payload.cultureCount,
  ...(payload.heightmapTemplate !== null
    ? { heightmapTemplate: payload.heightmapTemplate }
    : {}),
  ...(payload.statesNumber !== null
    ? { statesNumber: payload.statesNumber }
    : {}),
  ...(payload.townsNumber !== null ? { townsNumber: payload.townsNumber } : {}),
  ...(payload.sizeVariety !== null ? { sizeVariety: payload.sizeVariety } : {}),
  ...(payload.growthRate !== null ? { growthRate: payload.growthRate } : {}),
  ...(payload.statesGrowthRate !== null
    ? { statesGrowthRate: payload.statesGrowthRate }
    : {}),
  ...(payload.provincesRatio !== null
    ? { provincesRatio: payload.provincesRatio }
    : {}),
  ...(payload.religionsNumber !== null
    ? { religionsNumber: payload.religionsNumber }
    : {}),
  ...(payload.temperatureEquator !== null
    ? { temperatureEquator: payload.temperatureEquator }
    : {}),
  ...(payload.temperatureNorthPole !== null
    ? { temperatureNorthPole: payload.temperatureNorthPole }
    : {}),
  ...(payload.temperatureSouthPole !== null
    ? { temperatureSouthPole: payload.temperatureSouthPole }
    : {}),
  ...(payload.elevationExponent !== null
    ? { elevationExponent: payload.elevationExponent }
    : {}),
  ...(payload.lakeElevationLimit !== null
    ? { lakeElevationLimit: payload.lakeElevationLimit }
    : {}),
  ...(payload.precipitation !== null
    ? { precipitation: payload.precipitation }
    : {}),
  ...(payload.mapSize !== null ? { mapSize: payload.mapSize } : {}),
  ...(payload.latitude !== null ? { latitude: payload.latitude } : {}),
  ...(payload.longitude !== null ? { longitude: payload.longitude } : {}),
  ...(payload.winds !== null ? { winds: payload.winds } : {}),
  sourceUrl: payload.sourceUrl,
});

export const fetchUpstreamOracle = async (
  sourceUrl = DEFAULT_URL,
): Promise<ParitySnapshot> => {
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

    const payload = await page.evaluate(() => {
      const globalData = globalThis as Record<string, unknown>;
      const evaluateExpression = (expression: string): unknown => {
        const evaluator = globalThis.eval as
          | ((code: string) => unknown)
          | undefined;
        if (!evaluator) {
          return undefined;
        }

        try {
          return evaluator(expression);
        } catch {
          return undefined;
        }
      };
      const readEvaluatedNumber = (expression: string): number | null => {
        const value = evaluateExpression(expression);
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : null;
      };
      const readSearchParamNumber = (name: string): number | null => {
        try {
          const value = new URL(
            String(
              (globalThis as { location?: { href?: string } }).location?.href ??
                "",
            ),
          ).searchParams.get(name);
          if (value === null || value.length === 0) {
            return null;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        } catch {
          return null;
        }
      };
      const readEvaluatedWinds = ():
        | [number, number, number, number, number, number]
        | null => {
        const value = evaluateExpression("options.winds");
        if (!Array.isArray(value) || value.length < 6) {
          return null;
        }

        const winds = value.slice(0, 6).map(Number);
        return winds.every((entry) => Number.isFinite(entry))
          ? (winds as [number, number, number, number, number, number])
          : null;
      };
      const pack = globalData.pack as {
        burgs: unknown[];
        vertices: { p: [number, number][] };
        cells: {
          v: number[][];
          state: ArrayLike<number>;
          religion: ArrayLike<number>;
        };
        cultures: Array<unknown>;
        features: Array<{ land?: boolean } | null>;
        states: Array<{ removed?: boolean } | null>;
        religions: Array<{ removed?: boolean } | null>;
      };
      const grid = globalData.grid as {
        spacing: number;
        vertices: { p: [number, number][] };
        cells: { v: number[][]; h: ArrayLike<number> };
      };
      const burgs = (
        pack.burgs as Array<{
          i: number;
          x: number;
          y: number;
          cell: number;
          name?: string;
        } | null>
      )
        .filter((burg) => Boolean(burg))
        .map((burg) => ({
          id: burg?.i ?? 0,
          x: burg?.x ?? 0,
          y: burg?.y ?? 0,
          cell: burg?.cell ?? 0,
          name: burg?.name ?? `burg-${burg?.i ?? 0}`,
        }));

      return {
        seed: String(globalData.seed),
        width: Number(globalData.graphWidth),
        height: Number(globalData.graphHeight),
        gridSpacing: Number(grid.spacing),
        terrainVertices: grid.vertices.p.map(
          ([x, y]: [number, number]) => [x, y] as [number, number],
        ),
        terrainPolygons: grid.cells.v.map((polygon: number[]) =>
          polygon.slice(),
        ),
        terrainHeights: Array.from(grid.cells.h, Number),
        regionVertices: pack.vertices.p.map(
          ([x, y]: [number, number]) => [x, y] as [number, number],
        ),
        regionPolygons: pack.cells.v.map((polygon: number[]) =>
          polygon.slice(),
        ),
        stateLabels: Array.from(pack.cells.state, Number),
        religionLabels: Array.from(pack.cells.religion, Number),
        burgs,
        counts: {
          landmasses: pack.features.filter(
            (feature: { land?: boolean } | null) => feature?.land === true,
          ).length,
          states: pack.states.filter(
            (state: { removed?: boolean } | null, index: number) =>
              index > 0 && state && state.removed !== true,
          ).length,
          religions: pack.religions.filter(
            (religion: { removed?: boolean } | null, index: number) =>
              index > 0 && religion && religion.removed !== true,
          ).length,
          burgs: burgs.length,
        },
        cultureCount: Math.max(pack.cultures.length - 1, 1),
        heightmapTemplate:
          ((
            globalThis as {
              document?: {
                getElementById: (id: string) => { value?: string } | null;
              };
            }
          ).document?.getElementById("templateInput")?.value ??
            null) ||
          null,
        statesNumber:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("statesNumber")?.value ?? "0",
          ) || null,
        townsNumber:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("manorsInput")?.value ?? "0",
          ) || null,
        sizeVariety:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("sizeVariety")?.value ?? "0",
          ) || null,
        growthRate:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("growthRate")?.value ?? "0",
          ) || null,
        statesGrowthRate:
          readSearchParamNumber("statesGrowthRate") ??
          (Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("statesGrowthRate")?.value ?? "0",
          ) ||
            null),
        provincesRatio:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("provincesRatio")?.value ?? "0",
          ) || null,
        religionsNumber:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("religionsNumber")?.value ?? "0",
          ) || null,
        temperatureEquator: readEvaluatedNumber("options.temperatureEquator"),
        temperatureNorthPole: readEvaluatedNumber(
          "options.temperatureNorthPole",
        ),
        temperatureSouthPole: readEvaluatedNumber(
          "options.temperatureSouthPole",
        ),
        elevationExponent:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("heightExponentInput")?.value ?? "0",
          ) || null,
        lakeElevationLimit:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("lakeElevationLimitOutput")?.value ??
              "0",
          ) || null,
        precipitation:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("precInput")?.value ?? "0",
          ) || null,
        mapSize:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("mapSizeOutput")?.value ?? "0",
          ) || null,
        latitude:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("latitudeOutput")?.value ?? "0",
          ) || null,
        longitude:
          Number(
            (
              globalThis as {
                document?: {
                  getElementById: (id: string) => { value?: string } | null;
                };
              }
            ).document?.getElementById("longitudeOutput")?.value ?? "0",
          ) || null,
        winds: readEvaluatedWinds(),
        sourceUrl: String(
          (globalData.location as { href?: string } | undefined)?.href ?? "",
        ),
      };
    });

    return normalizeOracle(payload);
  } finally {
    await browser.close();
  }
};

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const sourceUrl = args.url ?? DEFAULT_URL;
  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : undefined;
  const oracle = await fetchUpstreamOracle(sourceUrl);

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(oracle, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(oracle, null, 2));
}
