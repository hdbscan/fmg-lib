import { describe, expect, test } from "bun:test";
import { generateWorld } from "../src/index";
import {
  type ParitySnapshot,
  buildLocalParitySnapshot,
  computeParityReport,
} from "../src/parity";

const oracleFixture: ParitySnapshot = {
  kind: "upstream-oracle",
  seed: "fixture",
  width: 100,
  height: 100,
  gridSpacing: 10,
  terrain: {
    mesh: {
      vertices: [
        [0, 0],
        [50, 0],
        [50, 50],
        [0, 50],
        [100, 0],
        [100, 50],
      ],
      polygons: [
        [0, 1, 2, 3],
        [1, 4, 5, 2],
      ],
    },
    land: [1, 0],
  },
  regions: {
    vertices: [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ],
    polygons: [[0, 1, 2, 3]],
    states: [7],
    religions: [3],
  },
  burgs: [{ id: 1, x: 25, y: 25, cell: 0, name: "A" }],
  counts: {
    landmasses: 1,
    states: 1,
    religions: 1,
    burgs: 1,
  },
  sourceUrl: "fixture",
};

describe("parity report", () => {
  test("reports perfect overlap for identical snapshots", () => {
    const report = computeParityReport(oracleFixture, oracleFixture, 64);

    expect(report.terrain.iou).toBe(1);
    expect(report.politics.iou).toBe(1);
    expect(report.religions.iou).toBe(1);
    expect(report.burgs.meanNearestDistance).toBe(0);
    expect(report.counts.burgs.delta).toBe(0);
  });

  test("builds a local parity snapshot from generated worlds", () => {
    const world = generateWorld({
      seed: "parity-local",
      width: 320,
      height: 200,
      cells: 400,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });
    const snapshot = buildLocalParitySnapshot(world);

    expect(snapshot.terrain.mesh.polygons).toHaveLength(world.cellCount);
    expect(snapshot.regions.polygons).toHaveLength(world.packCellCount);
    expect(snapshot.regions.states).toHaveLength(world.packCellCount);
    expect(snapshot.regions.religions).toHaveLength(world.packCellCount);
    expect(snapshot.burgs).toHaveLength(world.burgCount);
  });
});
