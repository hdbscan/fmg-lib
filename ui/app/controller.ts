import {
  type GenerationConfig,
  type WorldGraphV1,
  deserializeWorld,
  generateWorld,
  serializeWorld,
} from "fmg-lib";
import {
  type CameraState,
  DEFAULT_STYLE,
  DEFAULT_VISIBILITY,
  type HitTestIndex,
  type LayerVisibilityState,
  PRESET_VISIBILITY,
  type RenderableWorld,
  type StylePreset,
  buildRenderableWorld,
  createHitTestIndex,
  findCellAt,
} from "../adapter";

export type ControllerState = {
  world: WorldGraphV1 | null;
  renderable: RenderableWorld | null;
  hitTest: HitTestIndex | null;
  visibility: LayerVisibilityState;
  style: StylePreset;
  camera: CameraState;
  selectedCellId: number | null;
  hoverCellId: number | null;
};

export type Controller = ReturnType<typeof createController>;

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  seed: "ui-default-seed",
  width: 900,
  height: 600,
  cells: 6000,
  culturesCount: 10,
  layers: {
    physical: true,
    cultures: true,
    settlements: true,
    politics: true,
    religions: true,
    military: true,
    markers: true,
    zones: true,
  },
};

export const createController = () => {
  let state: ControllerState = {
    world: null,
    renderable: null,
    hitTest: null,
    visibility: DEFAULT_VISIBILITY,
    style: DEFAULT_STYLE,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    selectedCellId: null,
    hoverCellId: null,
  };

  const getState = (): ControllerState => state;

  const setWorld = (world: WorldGraphV1): void => {
    const renderable = buildRenderableWorld(world);
    const hitTest = createHitTestIndex(renderable);
    state = {
      ...state,
      world,
      renderable,
      hitTest,
      selectedCellId: null,
      hoverCellId: null,
    };
  };

  const generate = (config: GenerationConfig): void => {
    setWorld(generateWorld(config));
  };

  const setVisibilityLayer = (
    key: keyof LayerVisibilityState,
    value: boolean,
  ): void => {
    state = {
      ...state,
      visibility: {
        ...state.visibility,
        [key]: value,
      },
    };
  };

  const applyPreset = (presetName: keyof typeof PRESET_VISIBILITY): void => {
    state = {
      ...state,
      visibility: PRESET_VISIBILITY[presetName],
    };
  };

  const setStyle = (nextStyle: StylePreset): void => {
    state = {
      ...state,
      style: nextStyle,
    };
  };

  const setCamera = (nextCamera: CameraState): void => {
    state = {
      ...state,
      camera: nextCamera,
    };
  };

  const inspectAt = (worldX: number, worldY: number): number | null => {
    const hitTest = state.hitTest;
    if (!hitTest) {
      return null;
    }

    const cellId = findCellAt(hitTest, worldX, worldY);
    state = {
      ...state,
      hoverCellId: cellId,
    };
    return cellId;
  };

  const selectCell = (cellId: number | null): void => {
    state = {
      ...state,
      selectedCellId: cellId,
    };
  };

  const saveWorld = (): string => {
    if (!state.world) {
      throw new Error("cannot save world before generation");
    }

    return serializeWorld(state.world);
  };

  const loadWorld = (payload: string): void => {
    const world = deserializeWorld(payload);
    setWorld(world);
  };

  return {
    getState,
    generate,
    setWorld,
    setVisibilityLayer,
    applyPreset,
    setStyle,
    setCamera,
    inspectAt,
    selectCell,
    saveWorld,
    loadWorld,
  };
};
