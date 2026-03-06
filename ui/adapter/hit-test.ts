import type { HitTestIndex, RenderCell, RenderableWorld } from "./types";

const pointInPolygon = (x: number, y: number, polygon: Float32Array): boolean => {
  let inside = false;
  const pointCount = polygon.length / 2;

  for (let i = 0, j = pointCount - 1; i < pointCount; j = i, i += 1) {
    const ix = polygon[i * 2] ?? 0;
    const iy = polygon[i * 2 + 1] ?? 0;
    const jx = polygon[j * 2] ?? 0;
    const jy = polygon[j * 2 + 1] ?? 0;

    const intersects =
      iy > y !== jy > y && x < ((jx - ix) * (y - iy)) / ((jy - iy) || 1e-7) + ix;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const pushBucket = (
  buckets: number[][],
  columns: number,
  rows: number,
  cell: RenderCell,
  bucketSize: number,
): void => {
  const fromColumn = Math.max(0, Math.floor(cell.bboxMinX / bucketSize));
  const toColumn = Math.min(columns - 1, Math.floor(cell.bboxMaxX / bucketSize));
  const fromRow = Math.max(0, Math.floor(cell.bboxMinY / bucketSize));
  const toRow = Math.min(rows - 1, Math.floor(cell.bboxMaxY / bucketSize));

  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      const key = row * columns + column;
      const bucket = buckets[key];
      if (bucket) {
        bucket.push(cell.id);
      }
    }
  }
};

export const createHitTestIndex = (
  renderable: RenderableWorld,
  bucketSize = 24,
): HitTestIndex => {
  const bucketColumns = Math.max(1, Math.ceil(renderable.width / bucketSize));
  const bucketRows = Math.max(1, Math.ceil(renderable.height / bucketSize));
  const buckets: number[][] = Array.from(
    { length: bucketColumns * bucketRows },
    () => [],
  );

  for (const cell of renderable.cells) {
    pushBucket(buckets, bucketColumns, bucketRows, cell, bucketSize);
  }

  return {
    bucketSize,
    bucketColumns,
    bucketRows,
    buckets: buckets.map((bucket) => Uint32Array.from(bucket)),
    renderable,
  };
};

export const findCellAt = (
  index: HitTestIndex,
  worldX: number,
  worldY: number,
): number | null => {
  if (
    worldX < 0 ||
    worldY < 0 ||
    worldX > index.renderable.width ||
    worldY > index.renderable.height
  ) {
    return null;
  }

  const column = Math.max(
    0,
    Math.min(index.bucketColumns - 1, Math.floor(worldX / index.bucketSize)),
  );
  const row = Math.max(
    0,
    Math.min(index.bucketRows - 1, Math.floor(worldY / index.bucketSize)),
  );
  const bucketKey = row * index.bucketColumns + column;
  const bucket = index.buckets[bucketKey] ?? new Uint32Array(0);

  for (const cellId of bucket) {
    const cell = index.renderable.cells[cellId];
    if (!cell) {
      continue;
    }

    if (
      worldX < cell.bboxMinX ||
      worldX > cell.bboxMaxX ||
      worldY < cell.bboxMinY ||
      worldY > cell.bboxMaxY
    ) {
      continue;
    }

    if (pointInPolygon(worldX, worldY, cell.polygon)) {
      return cell.id;
    }
  }

  return null;
};
