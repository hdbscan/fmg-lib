import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateWorld } from "../src/index";
import {
  type ParityReport,
  type ParitySnapshot,
  buildLocalParitySnapshot,
  computeParityReport,
} from "../src/parity";
import { fetchUpstreamOracle } from "./fetch-upstream-oracle";

const DEFAULT_OUTPUT = "artifacts/parity/latest-report.json";
const DEFAULT_ORACLE_CACHE = "artifacts/parity/upstream-oracle.json";

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

const printReport = (report: ParityReport): void => {
  console.log(`oracle: ${report.oracle.sourceUrl ?? report.oracle.seed}`);
  console.log(`seed: ${report.oracle.seed}`);
  console.log(`terrain_iou: ${report.terrain.iou.toFixed(4)}`);
  console.log(`political_iou: ${report.politics.iou.toFixed(4)}`);
  console.log(`religion_iou: ${report.religions.iou.toFixed(4)}`);
  console.log(
    `burg_mean_nearest_distance: ${report.burgs.meanNearestDistance.toFixed(2)}`,
  );
  console.log(
    `burg_median_nearest_distance: ${report.burgs.medianNearestDistance.toFixed(2)}`,
  );
  console.log(
    `burg_oracle_recall_within_threshold(${report.burgs.threshold.toFixed(2)}): ${report.burgs.oracleRecallWithinThreshold.toFixed(4)}`,
  );
  console.log(
    `burg_local_precision_within_threshold(${report.burgs.threshold.toFixed(2)}): ${report.burgs.localPrecisionWithinThreshold.toFixed(4)}`,
  );
  console.log(
    `counts: landmasses ${report.counts.landmasses.local}/${report.counts.landmasses.oracle}, states ${report.counts.states.local}/${report.counts.states.oracle}, religions ${report.counts.religions.local}/${report.counts.religions.oracle}, burgs ${report.counts.burgs.local}/${report.counts.burgs.oracle}`,
  );
};

const loadCachedOracle = async (
  oraclePath: string,
): Promise<ParitySnapshot | null> => {
  try {
    const raw = await readFile(oraclePath, "utf8");
    return JSON.parse(raw) as ParitySnapshot;
  } catch {
    return null;
  }
};

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const oraclePath = path.resolve(
    process.cwd(),
    args.oracle ?? DEFAULT_ORACLE_CACHE,
  );
  const refreshOracle = args.refresh === "true";
  const oracle = refreshOracle
    ? await fetchUpstreamOracle(args.url)
    : ((await loadCachedOracle(oraclePath)) ??
      (await fetchUpstreamOracle(args.url)));

  const config = {
    seed: oracle.seed,
    width: oracle.width,
    height: oracle.height,
    cells: oracle.terrain.mesh.polygons.length,
    culturesCount: Math.max(1, oracle.cultureCount ?? 12),
    ...(oracle.statesNumber !== undefined
      ? { statesCount: oracle.statesNumber }
      : {}),
    ...(oracle.townsNumber !== undefined && oracle.townsNumber !== 1000
      ? { townsCount: oracle.townsNumber }
      : {}),
    ...(oracle.lakeElevationLimit !== undefined
      ? { climate: { lakeElevationLimit: oracle.lakeElevationLimit } }
      : {}),
    layers: {
      physical: true,
      cultures: true,
      settlements: true,
      politics: true,
      religions: true,
    },
  } as const;

  const world = generateWorld(config);
  const local = buildLocalParitySnapshot(world, config);
  const report = computeParityReport(oracle, local, Number(args.raster ?? 256));

  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(oraclePath), { recursive: true });
  await writeFile(oraclePath, `${JSON.stringify(oracle, null, 2)}\n`, "utf8");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printReport(report);
  console.log(`oracle_json: ${oraclePath}`);
  console.log(`report_json: ${outputPath}`);
}
