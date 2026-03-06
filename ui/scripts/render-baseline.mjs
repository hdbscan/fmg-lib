import { generateWorld } from "fmg-lib";
import {
  DEFAULT_STYLE,
  DEFAULT_VISIBILITY,
  buildRenderableWorld,
} from "../adapter/index.ts";
import {
  CanvasMapRenderer,
  estimateRenderWorkload,
} from "../renderer/index.ts";

class FakeCanvasContext2D {
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  fill() {}
  stroke() {}
  fillRect() {}
  clearRect() {}
  setTransform() {}
  arc() {}
  strokeText() {}
  fillText() {}
  save() {}
  restore() {}
  drawImage() {}
}

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.context = new FakeCanvasContext2D();
  }

  getContext(contextId) {
    if (contextId !== "2d") {
      return null;
    }
    return this.context;
  }
}

const scenarios = [
  { name: "small", width: 320, height: 200, cells: 180 },
  { name: "medium", width: 640, height: 400, cells: 1200 },
  { name: "large", width: 900, height: 600, cells: 3200 },
];

const iterations = 3;

const average = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const now = () => performance.now();

const originalDocument = globalThis.document;
globalThis.document = {
  createElement: () => new FakeCanvas(1, 1),
};

try {
  for (const scenario of scenarios) {
    const adapterTimes = [];
    const renderTimes = [];
    let workload = null;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const world = generateWorld({
        seed: `ui-render-baseline-${scenario.name}-${iteration}`,
        width: scenario.width,
        height: scenario.height,
        cells: scenario.cells,
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
      });

      const adapterStarted = now();
      const renderable = buildRenderableWorld(world);
      workload = estimateRenderWorkload(renderable, DEFAULT_VISIBILITY);
      adapterTimes.push(now() - adapterStarted);

      const renderer = new CanvasMapRenderer(
        new FakeCanvas(renderable.width, renderable.height),
        DEFAULT_VISIBILITY,
        DEFAULT_STYLE,
        { x: 0, y: 0, zoom: 1.8 },
      );
      renderer.setWorld(renderable);

      const renderStarted = now();
      renderer.render({ hoverCellId: null, selectedCellId: null });
      renderTimes.push(now() - renderStarted);
    }

    console.log(
      JSON.stringify({
        scenario: scenario.name,
        iterations,
        adapterMs: Number(average(adapterTimes).toFixed(3)),
        renderMs: Number(average(renderTimes).toFixed(3)),
        workload,
      }),
    );
  }
} finally {
  if (originalDocument) {
    globalThis.document = originalDocument;
  } else {
    delete globalThis.document;
  }
}
