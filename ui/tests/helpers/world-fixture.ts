import {
  type GenerationConfig,
  type WorldGraphV1,
  generateWorld,
} from "fmg-lib";
import { type RenderableWorld, buildRenderableWorld } from "../../adapter";

const FIXTURE_CONFIG: GenerationConfig = {
  seed: "ui-quality-fixture",
  width: 320,
  height: 200,
  cells: 180,
  culturesCount: 8,
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

let cachedWorld: WorldGraphV1 | null = null;
let cachedRenderable: RenderableWorld | null = null;

export const getFixtureWorld = (): WorldGraphV1 => {
  cachedWorld ??= generateWorld(FIXTURE_CONFIG);
  return cachedWorld;
};

export const getFixtureRenderableWorld = (): RenderableWorld => {
  cachedRenderable ??= buildRenderableWorld(getFixtureWorld());
  return cachedRenderable;
};
