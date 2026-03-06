import { extent } from "d3-array";
import { rgb } from "d3-color";
import { interpolateRgb } from "d3-interpolate";
import { scaleLinear } from "d3-scale";
import type {
  CameraState,
  LayerVisibilityState,
  RenderableWorld,
  StylePreset,
} from "../adapter";
import type { MapRenderer, RenderLayer, RenderOverlayState } from "./types";

const createCanvasLike = (
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const get2D = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D context is unavailable");
  }
  return context;
};

const buildLandScale = (style: StylePreset): ((height: number) => string) => {
  return scaleLinear<string>()
    .domain([20, 100])
    .range([style.landColorLow, style.landColorHigh])
    .interpolate(interpolateRgb)
    .clamp(true);
};

const fillPolygon = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  polygon: Float32Array,
): void => {
  if (polygon.length < 6) {
    return;
  }

  context.beginPath();
  context.moveTo(polygon[0] ?? 0, polygon[1] ?? 0);
  for (let index = 2; index < polygon.length; index += 2) {
    context.lineTo(polygon[index] ?? 0, polygon[index + 1] ?? 0);
  }
  context.closePath();
  context.fill();
};

const strokeBetweenCenters = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  world: RenderableWorld,
  fromCellId: number,
  toCellId: number,
): void => {
  const fromCell = world.cells[fromCellId];
  const toCell = world.cells[toCellId];
  if (!fromCell || !toCell) {
    return;
  }

  context.beginPath();
  context.moveTo(fromCell.centerX, fromCell.centerY);
  context.lineTo(toCell.centerX, toCell.centerY);
  context.stroke();
};

const isVisible = (visibility: LayerVisibilityState, layer: RenderLayer): boolean => {
  if (layer === "physical") {
    return visibility.physical || visibility.biomes || visibility.rivers;
  }

  if (layer === "political") {
    return (
      visibility.cultures ||
      visibility.states ||
      visibility.provinces ||
      visibility.religions ||
      visibility.routes
    );
  }

  if (layer === "entities") {
    return (
      visibility.settlements || visibility.military || visibility.markers || visibility.zones
    );
  }

  return true;
};

const LAYERS: readonly RenderLayer[] = [
  "physical",
  "political",
  "entities",
  "overlay",
] as const;

export class CanvasMapRenderer implements MapRenderer {
  private readonly rootCanvas: HTMLCanvasElement;

  private readonly rootContext: CanvasRenderingContext2D;

  private readonly layerCanvases = new Map<RenderLayer, HTMLCanvasElement | OffscreenCanvas>();

  private readonly layerContexts = new Map<
    RenderLayer,
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  >();

  private readonly dirty = new Set<RenderLayer>(LAYERS);

  private world: RenderableWorld | null = null;

  private visibility: LayerVisibilityState;

  private style: StylePreset;

  private camera: CameraState;

  constructor(
    canvas: HTMLCanvasElement,
    visibility: LayerVisibilityState,
    style: StylePreset,
    camera: CameraState,
  ) {
    this.rootCanvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas 2d context is unavailable");
    }

    this.rootContext = context;
    this.visibility = visibility;
    this.style = style;
    this.camera = camera;

    for (const layer of LAYERS) {
      const layerCanvas = createCanvasLike(canvas.width, canvas.height);
      this.layerCanvases.set(layer, layerCanvas);
      this.layerContexts.set(layer, get2D(layerCanvas));
    }
  }

  public resize(width: number, height: number): void {
    this.rootCanvas.width = width;
    this.rootCanvas.height = height;

    for (const layer of LAYERS) {
      const layerCanvas = this.layerCanvases.get(layer);
      if (!layerCanvas) {
        continue;
      }
      layerCanvas.width = width;
      layerCanvas.height = height;
    }

    this.markDirty();
  }

  public setWorld(world: RenderableWorld | null): void {
    this.world = world;
    this.markDirty();
  }

  public setCamera(camera: CameraState): void {
    this.camera = camera;
    this.markDirty("overlay");
  }

  public setVisibility(visibility: LayerVisibilityState): void {
    this.visibility = visibility;
    this.markDirty();
  }

  public setStyle(style: StylePreset): void {
    this.style = style;
    this.markDirty();
  }

  public markDirty(layer?: RenderLayer): void {
    if (!layer) {
      for (const item of LAYERS) {
        this.dirty.add(item);
      }
      return;
    }

    this.dirty.add(layer);
  }

  public render(overlays: RenderOverlayState): void {
    for (const layer of LAYERS) {
      if (!this.dirty.has(layer)) {
        continue;
      }

      if (layer === "physical") {
        this.drawPhysicalLayer();
      } else if (layer === "political") {
        this.drawPoliticalLayer();
      } else if (layer === "entities") {
        this.drawEntityLayer();
      } else {
        this.drawOverlayLayer(overlays);
      }

      this.dirty.delete(layer);
    }

    this.composite();
  }

  private drawPhysicalLayer(): void {
    const context = this.layerContexts.get("physical");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);
    context.fillStyle = this.style.oceanColor;
    context.fillRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    if (!this.world) {
      return;
    }

    const landScale = buildLandScale(this.style);

    for (const cell of this.world.cells) {
      if (cell.feature !== 1) {
        continue;
      }

      const height = this.world.source.cellsH[cell.id] ?? 20;
      context.fillStyle = landScale(height);
      fillPolygon(context, cell.polygon);

      if (this.visibility.biomes && cell.biome > 0) {
        context.fillStyle = `rgba(${(cell.biome * 53) % 255}, ${(cell.biome * 97) % 255}, ${(cell.biome * 29) % 255}, 0.16)`;
        fillPolygon(context, cell.polygon);
      }
    }

    if (!this.visibility.rivers) {
      return;
    }

    context.strokeStyle = this.style.riverColor;
    context.lineWidth = 1;
    for (const cell of this.world.cells) {
      if (cell.river <= 0) {
        continue;
      }

      for (const neighborId of cell.neighbors) {
        const neighbor = this.world.cells[neighborId];
        if (!neighbor || neighbor.id <= cell.id || neighbor.river <= 0) {
          continue;
        }

        strokeBetweenCenters(context, this.world, cell.id, neighbor.id);
      }
    }
  }

  private drawPoliticalLayer(): void {
    const context = this.layerContexts.get("political");
    if (!context || !this.world) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    if (this.visibility.cultures) {
      for (const cell of this.world.cells) {
        if (cell.culture <= 0) {
          continue;
        }
        context.fillStyle = `rgba(${(cell.culture * 71) % 255}, ${(cell.culture * 41) % 255}, ${(cell.culture * 113) % 255}, 0.22)`;
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.religions) {
      for (const cell of this.world.cells) {
        if (cell.religion <= 0) {
          continue;
        }
        context.fillStyle = `rgba(${(cell.religion * 89) % 255}, ${(cell.religion * 23) % 255}, ${(cell.religion * 59) % 255}, 0.18)`;
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.states) {
      context.strokeStyle = this.style.stateLineColor;
      context.lineWidth = 1.6;
      for (const cell of this.world.cells) {
        if (cell.state <= 0) {
          continue;
        }
        for (const neighborId of cell.neighbors) {
          if (neighborId <= cell.id) {
            continue;
          }
          const neighbor = this.world.cells[neighborId];
          if (!neighbor || neighbor.state === cell.state) {
            continue;
          }
          strokeBetweenCenters(context, this.world, cell.id, neighbor.id);
        }
      }
    }

    if (this.visibility.provinces) {
      context.strokeStyle = this.style.provinceLineColor;
      context.lineWidth = 0.85;
      for (const cell of this.world.cells) {
        if (cell.province <= 0) {
          continue;
        }
        for (const neighborId of cell.neighbors) {
          if (neighborId <= cell.id) {
            continue;
          }
          const neighbor = this.world.cells[neighborId];
          if (!neighbor || neighbor.province === cell.province) {
            continue;
          }
          strokeBetweenCenters(context, this.world, cell.id, neighbor.id);
        }
      }
    }

    if (this.visibility.routes) {
      context.strokeStyle = rgb(this.style.stateLineColor).darker(1.2).toString();
      context.lineWidth = 1;
      for (const route of this.world.routes) {
        context.beginPath();
        context.moveTo(route.fromX, route.fromY);
        context.lineTo(route.toX, route.toY);
        context.stroke();
      }
    }
  }

  private drawEntityLayer(): void {
    const context = this.layerContexts.get("entities");
    if (!context || !this.world) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    if (this.visibility.zones) {
      context.fillStyle = `${this.style.zoneColor}33`;
      for (const cell of this.world.cells) {
        if (cell.zone <= 0) {
          continue;
        }
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.settlements) {
      context.fillStyle = this.style.burgColor;
      for (const burg of this.world.burgs) {
        context.beginPath();
        context.arc(burg.x, burg.y, burg.port > 0 ? 3.5 : 2.5, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (this.visibility.military) {
      context.fillStyle = this.style.militaryColor;
      for (const military of this.world.military) {
        context.fillRect(military.x - 2, military.y - 2, 4, 4);
      }
    }

    if (this.visibility.markers) {
      context.strokeStyle = this.style.markerColor;
      context.lineWidth = 1.3;
      for (const marker of this.world.markers) {
        context.beginPath();
        context.moveTo(marker.x - 3, marker.y);
        context.lineTo(marker.x + 3, marker.y);
        context.moveTo(marker.x, marker.y - 3);
        context.lineTo(marker.x, marker.y + 3);
        context.stroke();
      }
    }

    if (this.visibility.labels && this.camera.zoom > 1.3) {
      const stateCellCounts = this.world.states.map((state) => state.cells);
      const range = extent(stateCellCounts);
      const minCells = range[0] ?? 0;
      const maxCells = range[1] ?? 1;
      const fontScale = scaleLinear<number>()
        .domain([minCells, maxCells])
        .range([9, 16])
        .clamp(true);

      context.fillStyle = "#f7f7f7";
      context.strokeStyle = "rgba(0, 0, 0, 0.5)";
      context.lineWidth = 2;
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (const state of this.world.states) {
        context.font = `${Math.floor(fontScale(state.cells))}px "IBM Plex Sans", "Segoe UI", sans-serif`;
        const label = `S${state.id}`;
        context.strokeText(label, state.centerX, state.centerY);
        context.fillText(label, state.centerX, state.centerY);
      }

      if (this.camera.zoom > 2.2) {
        context.fillStyle = "#111827";
        context.font = '10px "IBM Plex Sans", "Segoe UI", sans-serif';
        const maxLabels = 180;
        let rendered = 0;
        for (const burg of this.world.burgs) {
          if (rendered >= maxLabels) {
            break;
          }
          context.fillText(`B${burg.id}`, burg.x + 4, burg.y + 4);
          rendered += 1;
        }
      }
    }
  }

  private drawOverlayLayer(overlays: RenderOverlayState): void {
    const context = this.layerContexts.get("overlay");
    if (!context || !this.world) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    const drawHighlight = (cellId: number | null, strokeStyle: string, lineWidth: number): void => {
      if (cellId == null) {
        return;
      }
      const cell = this.world?.cells[cellId];
      if (!cell) {
        return;
      }

      context.strokeStyle = strokeStyle;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.moveTo(cell.polygon[0] ?? 0, cell.polygon[1] ?? 0);
      for (let index = 2; index < cell.polygon.length; index += 2) {
        context.lineTo(cell.polygon[index] ?? 0, cell.polygon[index + 1] ?? 0);
      }
      context.closePath();
      context.stroke();
    };

    drawHighlight(overlays.selectedCellId, "#fef3c7", 2.6);
    drawHighlight(overlays.hoverCellId, "#1f2937", 1.2);
  }

  private composite(): void {
    const context = this.rootContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    context.save();
    context.setTransform(
      this.camera.zoom,
      0,
      0,
      this.camera.zoom,
      this.camera.x,
      this.camera.y,
    );

    for (const layer of LAYERS) {
      if (layer !== "overlay" && !isVisible(this.visibility, layer)) {
        continue;
      }
      const source = this.layerCanvases.get(layer);
      if (!source) {
        continue;
      }
      context.drawImage(source, 0, 0);
    }

    context.restore();
  }
}
