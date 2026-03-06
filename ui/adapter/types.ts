import type { WorldGraphV1 } from "fmg-lib";

export type RenderCell = Readonly<{
  id: number;
  centerX: number;
  centerY: number;
  polygon: Float32Array;
  bboxMinX: number;
  bboxMinY: number;
  bboxMaxX: number;
  bboxMaxY: number;
  neighbors: Uint32Array;
  feature: number;
  featureId: number;
  biome: number;
  river: number;
  state: number;
  province: number;
  religion: number;
  culture: number;
  zone: number;
  burg: number;
  military: number;
}>;

export type RenderState = Readonly<{
  id: number;
  centerCell: number;
  centerX: number;
  centerY: number;
  culture: number;
  form: number;
  cells: number;
}>;

export type RenderRoute = Readonly<{
  id: number;
  fromState: number;
  toState: number;
  kind: number;
  weight: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}>;

export type RenderProvince = Readonly<{
  id: number;
  state: number;
  centerCell: number;
  cells: number;
}>;

export type RenderReligion = Readonly<{
  id: number;
  seedCell: number;
  type: number;
  size: number;
}>;

export type RenderMilitary = Readonly<{
  id: number;
  cell: number;
  x: number;
  y: number;
  state: number;
  type: number;
  strength: number;
}>;

export type RenderMarker = Readonly<{
  id: number;
  cell: number;
  x: number;
  y: number;
  type: number;
  strength: number;
}>;

export type RenderZone = Readonly<{
  id: number;
  seedCell: number;
  type: number;
  cells: number;
}>;

export type RenderBurg = Readonly<{
  id: number;
  cell: number;
  x: number;
  y: number;
  population: number;
  culture: number;
  capital: number;
  port: number;
}>;

export type RenderableWorld = Readonly<{
  source: WorldGraphV1;
  width: number;
  height: number;
  cells: ReadonlyArray<RenderCell>;
  landCellIds: Uint32Array;
  waterCellIds: Uint32Array;
  states: ReadonlyArray<RenderState>;
  routes: ReadonlyArray<RenderRoute>;
  provinces: ReadonlyArray<RenderProvince>;
  religions: ReadonlyArray<RenderReligion>;
  military: ReadonlyArray<RenderMilitary>;
  markers: ReadonlyArray<RenderMarker>;
  zones: ReadonlyArray<RenderZone>;
  burgs: ReadonlyArray<RenderBurg>;
}>;

export type LayerVisibilityState = Readonly<{
  physical: boolean;
  biomes: boolean;
  rivers: boolean;
  cultures: boolean;
  settlements: boolean;
  states: boolean;
  routes: boolean;
  provinces: boolean;
  religions: boolean;
  military: boolean;
  markers: boolean;
  zones: boolean;
  labels: boolean;
}>;

export type StylePreset = Readonly<{
  oceanColor: string;
  landColorLow: string;
  landColorHigh: string;
  riverColor: string;
  stateLineColor: string;
  provinceLineColor: string;
  burgColor: string;
  militaryColor: string;
  markerColor: string;
  zoneColor: string;
}>;

export type UiSession = Readonly<{
  version: 1;
  camera: Readonly<{
    x: number;
    y: number;
    zoom: number;
  }>;
  visibility: LayerVisibilityState;
  style: StylePreset;
  selectedCellId: number | null;
}>;

export type CameraState = Readonly<{
  x: number;
  y: number;
  zoom: number;
}>;

export type HitTestIndex = Readonly<{
  bucketSize: number;
  bucketColumns: number;
  bucketRows: number;
  buckets: ReadonlyArray<Uint32Array>;
  renderable: RenderableWorld;
}>;
