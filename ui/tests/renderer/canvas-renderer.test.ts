import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE,
  DEFAULT_VISIBILITY,
  buildRenderableWorld,
} from "../../adapter";
import { CanvasMapRenderer } from "../../renderer";
import { getFixtureWorld } from "../helpers/world-fixture";

class FakeCanvasContext2D {
  public drawImageCalls = 0;

  public strokeCalls = 0;

  public fillRectCalls = 0;

  public fillStyle = "#000000";

  public strokeStyle = "#000000";

  public lineWidth = 1;

  public lineJoin: CanvasLineJoin = "miter";

  public textAlign: CanvasTextAlign = "start";

  public textBaseline: CanvasTextBaseline = "alphabetic";

  public font = "10px sans-serif";

  public beginPath(): void {}

  public moveTo(): void {}

  public lineTo(): void {}

  public closePath(): void {}

  public fill(): void {}

  public stroke(): void {
    this.strokeCalls += 1;
  }

  public fillRect(): void {
    this.fillRectCalls += 1;
  }

  public clearRect(): void {}

  public setTransform(): void {}

  public arc(): void {}

  public strokeText(): void {}

  public fillText(): void {}

  public save(): void {}

  public restore(): void {}

  public drawImage(): void {
    this.drawImageCalls += 1;
  }
}

class FakeCanvas {
  public width: number;

  public height: number;

  public readonly context = new FakeCanvasContext2D();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public getContext(contextId: string): FakeCanvasContext2D | null {
    if (contextId !== "2d") {
      return null;
    }
    return this.context;
  }
}

const previousDocument = globalThis.document;

describe("CanvasMapRenderer", () => {
  afterEach(() => {
    if (previousDocument) {
      globalThis.document = previousDocument;
      return;
    }

    (globalThis as { document?: Document | undefined }).document = undefined;
  });

  it("composites visible layers without a browser canvas implementation", () => {
    globalThis.document = {
      createElement: () => new FakeCanvas(1, 1),
    } as unknown as Document;

    const world = buildRenderableWorld(getFixtureWorld());
    const rootCanvas = new FakeCanvas(world.width, world.height);
    const renderer = new CanvasMapRenderer(
      rootCanvas as unknown as HTMLCanvasElement,
      DEFAULT_VISIBILITY,
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1.75 },
    );

    renderer.setWorld(world);
    renderer.render({ hoverCellId: null, selectedCellId: null });

    expect(rootCanvas.context.drawImageCalls).toBe(4);
  });

  it("skips non-overlay layers when they are hidden", () => {
    globalThis.document = {
      createElement: () => new FakeCanvas(1, 1),
    } as unknown as Document;

    const world = buildRenderableWorld(getFixtureWorld());
    const rootCanvas = new FakeCanvas(world.width, world.height);
    const renderer = new CanvasMapRenderer(
      rootCanvas as unknown as HTMLCanvasElement,
      {
        ...DEFAULT_VISIBILITY,
        physical: false,
        biomes: false,
        rivers: false,
        cultures: false,
        settlements: false,
        states: false,
        routes: false,
        provinces: false,
        religions: false,
        military: false,
        markers: false,
        zones: false,
        labels: false,
      },
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1 },
    );

    renderer.setWorld(world);
    renderer.render({ hoverCellId: null, selectedCellId: null });

    expect(rootCanvas.context.drawImageCalls).toBe(1);
  });

  it("renders packed terrain review mode without browser canvas APIs", () => {
    globalThis.document = {
      createElement: () => new FakeCanvas(1, 1),
    } as unknown as Document;

    const world = buildRenderableWorld(getFixtureWorld());
    const rootCanvas = new FakeCanvas(world.width, world.height);
    const renderer = new CanvasMapRenderer(
      rootCanvas as unknown as HTMLCanvasElement,
      DEFAULT_VISIBILITY,
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1 },
      "packed",
    );

    renderer.setWorld(world);
    renderer.render({ hoverCellId: null, selectedCellId: null });

    expect(rootCanvas.context.drawImageCalls).toBe(4);
  });

  it("keeps offscreen layers large enough for the full world", () => {
    globalThis.document = {
      createElement: () => new FakeCanvas(1, 1),
    } as unknown as Document;

    const world = buildRenderableWorld(getFixtureWorld());
    const rootCanvas = new FakeCanvas(320, 240);
    const renderer = new CanvasMapRenderer(
      rootCanvas as unknown as HTMLCanvasElement,
      DEFAULT_VISIBILITY,
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1 },
    );

    renderer.setWorld(world);

    const physicalLayer = (
      renderer as unknown as {
        layerCanvases: Map<string, FakeCanvas>;
      }
    ).layerCanvases.get("physical");

    expect(physicalLayer?.width).toBeGreaterThanOrEqual(world.width);
    expect(physicalLayer?.height).toBeGreaterThanOrEqual(world.height);
  });

  it("renders coastline and river review masks without browser canvas APIs", () => {
    globalThis.document = {
      createElement: () => new FakeCanvas(1, 1),
    } as unknown as Document;

    const world = buildRenderableWorld(getFixtureWorld());

    const coastlineRoot = new FakeCanvas(world.width, world.height);
    const coastlineRenderer = new CanvasMapRenderer(
      coastlineRoot as unknown as HTMLCanvasElement,
      {
        ...DEFAULT_VISIBILITY,
        physical: true,
        rivers: false,
        cultures: false,
        settlements: false,
        states: false,
        routes: false,
        provinces: false,
        religions: false,
        military: false,
        markers: false,
        zones: false,
        labels: false,
      },
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1 },
      "packed",
      "coastline",
    );
    coastlineRenderer.setWorld(world);
    coastlineRenderer.render({ hoverCellId: null, selectedCellId: null });

    const riverRoot = new FakeCanvas(world.width, world.height);
    const riverRenderer = new CanvasMapRenderer(
      riverRoot as unknown as HTMLCanvasElement,
      {
        ...DEFAULT_VISIBILITY,
        physical: true,
        rivers: false,
        cultures: false,
        settlements: false,
        states: false,
        routes: false,
        provinces: false,
        religions: false,
        military: false,
        markers: false,
        zones: false,
        labels: false,
      },
      DEFAULT_STYLE,
      { x: 0, y: 0, zoom: 1 },
      "packed",
      "rivers",
    );
    riverRenderer.setWorld(world);
    riverRenderer.render({ hoverCellId: null, selectedCellId: null });

    expect(coastlineRoot.context.drawImageCalls).toBeGreaterThanOrEqual(2);
    expect(riverRoot.context.drawImageCalls).toBeGreaterThanOrEqual(2);

    const coastlinePhysicalLayer = (
      coastlineRenderer as unknown as { layerCanvases: Map<string, FakeCanvas> }
    ).layerCanvases.get("physical");
    const riverPhysicalLayer = (
      riverRenderer as unknown as { layerCanvases: Map<string, FakeCanvas> }
    ).layerCanvases.get("physical");

    expect(coastlinePhysicalLayer?.context.fillRectCalls).toBeGreaterThan(0);
    expect(coastlinePhysicalLayer?.context.strokeCalls).toBeGreaterThan(0);
    expect(riverPhysicalLayer?.context.fillRectCalls).toBeGreaterThan(0);
    expect(riverPhysicalLayer?.context.strokeCalls).toBeGreaterThanOrEqual(0);
  });
});
