import type {
  CameraState,
  LayerVisibilityState,
  RenderableWorld,
  StylePreset,
} from "../adapter";

export type RenderOverlayState = Readonly<{
  hoverCellId: number | null;
  selectedCellId: number | null;
}>;

export type RenderLayer =
  | "physical"
  | "political"
  | "entities"
  | "overlay";

export type RendererState = Readonly<{
  world: RenderableWorld | null;
  camera: CameraState;
  visibility: LayerVisibilityState;
  style: StylePreset;
}>;

export interface MapRenderer {
  resize(width: number, height: number): void;
  setWorld(world: RenderableWorld | null): void;
  setCamera(camera: CameraState): void;
  setVisibility(visibility: LayerVisibilityState): void;
  setStyle(style: StylePreset): void;
  markDirty(layer?: RenderLayer): void;
  render(overlays: RenderOverlayState): void;
}
