import { generateWorld } from "../src/index";

type Scenario = {
  name: string;
  width: number;
  height: number;
  cells: number;
};

const SCENARIOS: Scenario[] = [
  { name: "small", width: 800, height: 500, cells: 6000 },
  { name: "medium", width: 1400, height: 900, cells: 18000 },
  { name: "large", width: 2400, height: 1500, cells: 50000 },
];

const ITERATIONS = 5;

const now = (): number => performance.now();

const usedMemoryMB = (): number => {
  const bytes = process.memoryUsage().heapUsed;
  return bytes / (1024 * 1024);
};

const runScenario = (scenario: Scenario): void => {
  const durations: number[] = [];

  for (let index = 0; index < ITERATIONS; index += 1) {
    const seed = `perf-${scenario.name}-${index}`;
    const start = now();
    const world = generateWorld({
      seed,
      width: scenario.width,
      height: scenario.height,
      cells: scenario.cells,
    });
    const end = now();

    durations.push(end - start);

    if (world.cellCount === 0) {
      throw new Error("unexpected empty world in performance baseline");
    }
  }

  const total = durations.reduce((sum, value) => sum + value, 0);
  const average = total / durations.length;
  const min = Math.min(...durations);
  const max = Math.max(...durations);

  console.log(
    JSON.stringify({
      scenario: scenario.name,
      width: scenario.width,
      height: scenario.height,
      cells: scenario.cells,
      iterations: ITERATIONS,
      averageMs: Number(average.toFixed(3)),
      minMs: Number(min.toFixed(3)),
      maxMs: Number(max.toFixed(3)),
      heapUsedMB: Number(usedMemoryMB().toFixed(2)),
    }),
  );
};

for (const scenario of SCENARIOS) {
  runScenario(scenario);
}
