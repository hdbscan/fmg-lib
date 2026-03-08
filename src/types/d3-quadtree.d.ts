declare module "d3-quadtree" {
  export type QuadtreePoint = Readonly<{
    length: number;
    0: number;
    1: number;
  }>;

  export interface Quadtree<Point extends QuadtreePoint> {
    x(accessor: (point: Point) => number): Quadtree<Point>;
    y(accessor: (point: Point) => number): Quadtree<Point>;
    add(point: Point): Quadtree<Point>;
    find(x: number, y: number, radius?: number): Point | undefined;
  }

  export const quadtree: <Point extends QuadtreePoint>() => Quadtree<Point>;
}
