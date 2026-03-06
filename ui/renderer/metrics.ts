import type { LayerVisibilityState, RenderableWorld } from "../adapter";

export type RenderWorkloadMetrics = Readonly<{
  polygonDraws: number;
  edgeChecks: number;
  routeDraws: number;
  pointDraws: number;
  labelDraws: number;
}>;

export const estimateRenderWorkload = (
  world: RenderableWorld,
  visibility: LayerVisibilityState,
): RenderWorkloadMetrics => {
  let polygonDraws = 0;
  let edgeChecks = 0;
  let routeDraws = 0;
  let pointDraws = 0;
  let labelDraws = 0;

  if (visibility.physical || visibility.biomes) {
    polygonDraws += world.landCellIds.length;
  }

  if (visibility.cultures || visibility.religions || visibility.zones) {
    polygonDraws += world.cells.length;
  }

  if (visibility.states || visibility.provinces || visibility.rivers) {
    for (const cell of world.cells) {
      edgeChecks += cell.neighbors.length;
    }
  }

  if (visibility.routes) {
    routeDraws += world.routes.length;
  }

  if (visibility.settlements) {
    pointDraws += world.burgs.length;
  }

  if (visibility.military) {
    pointDraws += world.military.length;
  }

  if (visibility.markers) {
    pointDraws += world.markers.length;
  }

  if (visibility.labels) {
    labelDraws += world.states.length + Math.min(world.burgs.length, 180);
  }

  return {
    polygonDraws,
    edgeChecks,
    routeDraws,
    pointDraws,
    labelDraws,
  };
};
