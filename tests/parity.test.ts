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

    expect(snapshot.terrain.mesh.polygons).toHaveLength(world.packCellCount);
    expect(snapshot.regions.polygons).toHaveLength(world.packCellCount);
    expect(snapshot.regions.states).toHaveLength(world.packCellCount);
    expect(snapshot.regions.religions).toHaveLength(world.packCellCount);
    expect(snapshot.burgs).toHaveLength(world.burgCount);
    expect(snapshot.terrain.land).toHaveLength(world.packCellCount);
  });

  test("uses packed voronoi geometry for local parity polygons", () => {
    const world = generateWorld({
      seed: "parity-packed-geometry",
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

    expect(snapshot.terrain.mesh.vertices).toHaveLength(
      world.packVertexX.length,
    );
    expect(snapshot.terrain.mesh.polygons).toHaveLength(world.packCellCount);
    expect(snapshot.terrain.mesh.vertices).not.toHaveLength(
      world.vertexX.length,
    );
    expect(snapshot.regions.vertices).toEqual(snapshot.terrain.mesh.vertices);
  });

  test("uses explicit burg coordinates in local parity snapshots", () => {
    const world = generateWorld({
      seed: "parity-burg-coords",
      width: 1280,
      height: 900,
      cells: 10000,
      culturesCount: 10,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(world.burgCount).toBeGreaterThan(0);

    const snapshot = buildLocalParitySnapshot(world);
    const firstBurg = snapshot.burgs[0];
    expect(firstBurg).toBeDefined();

    const burgId = firstBurg?.id ?? 0;
    expect(firstBurg?.x).toBe(world.burgX[burgId]);
    expect(firstBurg?.y).toBe(world.burgY[burgId]);
  });

  test("reports worse metrics when region labels drift", () => {
    const shiftedLocal: ParitySnapshot = {
      ...oracleFixture,
      kind: "local-world",
      regions: {
        ...oracleFixture.regions,
        states: [0],
        religions: [0],
      },
      counts: {
        ...oracleFixture.counts,
        states: 0,
        religions: 0,
      },
    };

    const report = computeParityReport(oracleFixture, shiftedLocal, 64);

    expect(report.politics.iou).toBeLessThan(1);
    expect(report.religions.iou).toBeLessThan(1);
    expect(report.counts.states.delta).toBe(-1);
    expect(report.counts.religions.delta).toBe(-1);
  });

  test("reports worse metrics when burg positions drift", () => {
    const shiftedLocal: ParitySnapshot = {
      ...oracleFixture,
      kind: "local-world",
      burgs: [{ id: 1, x: 80, y: 80, cell: 0, name: "A" }],
    };

    const report = computeParityReport(oracleFixture, shiftedLocal, 64);

    expect(report.burgs.meanNearestDistance).toBeGreaterThan(0);
    expect(report.burgs.medianNearestDistance).toBeGreaterThan(0);
    expect(report.burgs.oracleRecallWithinThreshold).toBeLessThan(1);
    expect(report.burgs.localPrecisionWithinThreshold).toBeLessThan(1);
  });
});
