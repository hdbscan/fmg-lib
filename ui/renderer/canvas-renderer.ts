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
import type {
  MapRenderer,
  RenderLayer,
  RenderOverlayState,
  TerrainGeometryMode,
} from "./types";

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

type IndexedEdge = Readonly<{
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cellA: number;
  cellB: number | null;
}>;

const STATE_FILL_PALETTE = [
  "#d9e4f5",
  "#f0d9df",
  "#d8ead9",
  "#f5e7b1",
  "#f3d5c5",
  "#dce6d0",
  "#d8e7ea",
  "#ead9ef",
] as const;

const CULTURE_FILL_PALETTE = [
  "rgba(93, 122, 183, 0.18)",
  "rgba(208, 148, 99, 0.18)",
  "rgba(109, 155, 112, 0.18)",
  "rgba(156, 117, 171, 0.18)",
] as const;

const RELIGION_FILL_PALETTE = [
  "rgba(226, 200, 130, 0.14)",
  "rgba(173, 196, 214, 0.14)",
  "rgba(212, 171, 192, 0.14)",
  "rgba(180, 205, 174, 0.14)",
] as const;

const STATE_FORM_LABELS = ["Realm", "Kingdom", "Maritime", "Duchy"] as const;

const hashIndex = (value: number): number => {
  const seed = Math.imul(value ^ 0x45d9f3b, 0x45d9f3b);
  return (seed ^ (seed >>> 16)) >>> 0;
};

const pickPaletteColor = (
  palette: readonly string[],
  value: number,
): string => {
  return palette[hashIndex(value) % palette.length] ?? palette[0] ?? "#cccccc";
};

const buildStateLabel = (
  stateId: number,
  cultureId: number,
  form: number,
): string => {
  const first = ["A", "Be", "Ca", "Da", "El", "Fa", "Ga", "I", "Lo", "Ma"];
  const middle = [
    "ra",
    "len",
    "vor",
    "the",
    "mir",
    "dor",
    "sa",
    "lia",
    "ver",
    "mon",
  ];
  const last = ["ia", "on", "or", "en", "ar", "is", "um", "eth", "a", "os"];
  const seed = hashIndex(stateId * 31 + cultureId * 17 + form * 13);
  const name = `${first[seed % first.length]}${middle[(seed >>> 4) % middle.length]}${last[(seed >>> 9) % last.length]}`;
  const formLabel = STATE_FORM_LABELS[form] ?? STATE_FORM_LABELS[0];
  if (form === 1 || form === 3) {
    return `${formLabel} of ${name}`;
  }
  if (form === 2) {
    return `${formLabel} ${name}`;
  }
  return name;
};

const edgeKey = (ax: number, ay: number, bx: number, by: number): string => {
  if (ax < bx || (ax === bx && ay <= by)) {
    return `${ax},${ay}|${bx},${by}`;
  }
  return `${bx},${by}|${ax},${ay}`;
};

const buildEdges = (world: RenderableWorld): readonly IndexedEdge[] => {
  const edges = new Map<string, IndexedEdge>();

  for (const cell of world.cells) {
    const polygon = cell.polygon;
    for (let index = 0; index < polygon.length; index += 2) {
      const nextIndex = (index + 2) % polygon.length;
      const ax = polygon[index] ?? 0;
      const ay = polygon[index + 1] ?? 0;
      const bx = polygon[nextIndex] ?? 0;
      const by = polygon[nextIndex + 1] ?? 0;
      if (ax === bx && ay === by) {
        continue;
      }

      const key = edgeKey(ax, ay, bx, by);
      const existing = edges.get(key);
      if (!existing) {
        edges.set(key, { ax, ay, bx, by, cellA: cell.id, cellB: null });
        continue;
      }

      if (existing.cellA === cell.id || existing.cellB === cell.id) {
        continue;
      }

      edges.set(key, { ...existing, cellB: cell.id });
    }
  }

  return [...edges.values()];
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

const tracePolygon = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  polygon: Float32Array,
): void => {
  if (polygon.length < 6) {
    return;
  }

  context.moveTo(polygon[0] ?? 0, polygon[1] ?? 0);
  for (let index = 2; index < polygon.length; index += 2) {
    context.lineTo(polygon[index] ?? 0, polygon[index + 1] ?? 0);
  }
  context.closePath();
};

const fillTerrainFeature = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rings: readonly Float32Array[],
): void => {
  context.beginPath();
  for (const ring of rings) {
    tracePolygon(context, ring);
  }
  context.fill("evenodd");
};

const strokeTerrainFeature = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rings: readonly Float32Array[],
): void => {
  context.beginPath();
  for (const ring of rings) {
    tracePolygon(context, ring);
  }
  context.stroke();
};

const isVisible = (
  visibility: LayerVisibilityState,
  layer: RenderLayer,
): boolean => {
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
      visibility.settlements ||
      visibility.military ||
      visibility.markers ||
      visibility.zones
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

  private readonly layerCanvases = new Map<
    RenderLayer,
    HTMLCanvasElement | OffscreenCanvas
  >();

  private readonly layerContexts = new Map<
    RenderLayer,
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  >();

  private readonly dirty = new Set<RenderLayer>(LAYERS);

  private world: RenderableWorld | null = null;

  private edges: readonly IndexedEdge[] = [];

  private visibility: LayerVisibilityState;

  private style: StylePreset;

  private camera: CameraState;

  private readonly terrainGeometryMode: TerrainGeometryMode;

  constructor(
    canvas: HTMLCanvasElement,
    visibility: LayerVisibilityState,
    style: StylePreset,
    camera: CameraState,
    terrainGeometryMode: TerrainGeometryMode = "grid",
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
    this.terrainGeometryMode = terrainGeometryMode;

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
    this.edges = world ? buildEdges(world) : [];
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

    if (
      this.terrainGeometryMode === "packed" &&
      this.world.terrainFeatures.length > 0
    ) {
      context.strokeStyle = "rgba(255, 255, 255, 0.16)";
      context.lineWidth = 10;
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const feature of this.world.terrainFeatures) {
        strokeTerrainFeature(context, feature.rings);
      }

      for (const feature of this.world.terrainFeatures) {
        context.fillStyle =
          feature.type === 3
            ? landScale(Math.max(20, feature.height))
            : this.style.oceanColor;
        fillTerrainFeature(context, feature.rings);
      }

      if (this.visibility.biomes) {
        for (const cell of this.world.cells) {
          if (cell.feature !== 1 || cell.biome <= 0) {
            continue;
          }
          context.fillStyle = pickPaletteColor(
            CULTURE_FILL_PALETTE,
            cell.biome,
          );
          fillPolygon(context, cell.polygon);
        }
      }

      context.strokeStyle = "rgba(70, 96, 138, 0.55)";
      context.lineWidth = 1.2;
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const feature of this.world.terrainFeatures) {
        strokeTerrainFeature(context, feature.rings);
      }

      if (!this.visibility.rivers) {
        return;
      }

      context.strokeStyle = this.style.riverColor;
      context.lineWidth = 1.15;
      context.lineCap = "round";
      for (const edge of this.edges) {
        const cellA = this.world.cells[edge.cellA];
        const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
        if (!cellA || !cellB || cellA.river <= 0 || cellB.river <= 0) {
          continue;
        }

        context.beginPath();
        context.moveTo(edge.ax, edge.ay);
        context.lineTo(edge.bx, edge.by);
        context.stroke();
      }
      return;
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.16)";
    context.lineWidth = 10;
    context.lineCap = "round";
    for (const edge of this.edges) {
      const cellA = this.world.cells[edge.cellA];
      const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
      if (!cellA) {
        continue;
      }

      const isCoast =
        (cellA.feature === 1 && (!cellB || cellB.feature !== 1)) ||
        (cellA.feature !== 1 && cellB?.feature === 1);
      if (!isCoast) {
        continue;
      }

      context.beginPath();
      context.moveTo(edge.ax, edge.ay);
      context.lineTo(edge.bx, edge.by);
      context.stroke();
    }

    for (const cell of this.world.cells) {
      if (cell.feature !== 1) {
        continue;
      }

      const height = this.world.source.cellsH[cell.id] ?? 20;
      context.fillStyle = landScale(height);
      fillPolygon(context, cell.polygon);

      if (this.visibility.biomes && cell.biome > 0) {
        context.fillStyle = pickPaletteColor(CULTURE_FILL_PALETTE, cell.biome);
        fillPolygon(context, cell.polygon);
      }
    }

    context.strokeStyle = "rgba(70, 96, 138, 0.55)";
    context.lineWidth = 1.2;
    for (const edge of this.edges) {
      const cellA = this.world.cells[edge.cellA];
      const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
      if (!cellA) {
        continue;
      }

      const isCoast =
        (cellA.feature === 1 && (!cellB || cellB.feature !== 1)) ||
        (cellA.feature !== 1 && cellB?.feature === 1);
      if (!isCoast) {
        continue;
      }

      context.beginPath();
      context.moveTo(edge.ax, edge.ay);
      context.lineTo(edge.bx, edge.by);
      context.stroke();
    }

    if (!this.visibility.rivers) {
      return;
    }

    context.strokeStyle = this.style.riverColor;
    context.lineWidth = 1.15;
    context.lineCap = "round";
    for (const edge of this.edges) {
      const cellA = this.world.cells[edge.cellA];
      const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
      if (!cellA || !cellB || cellA.river <= 0 || cellB.river <= 0) {
        continue;
      }

      context.beginPath();
      context.moveTo(edge.ax, edge.ay);
      context.lineTo(edge.bx, edge.by);
      context.stroke();
    }
  }

  private drawPoliticalLayer(): void {
    const context = this.layerContexts.get("political");
    if (!context || !this.world) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.rootCanvas.width, this.rootCanvas.height);

    if (this.visibility.states) {
      for (const cell of this.world.cells) {
        if (cell.feature !== 1 || cell.state <= 0) {
          continue;
        }
        context.fillStyle = pickPaletteColor(STATE_FILL_PALETTE, cell.state);
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.cultures) {
      for (const cell of this.world.cells) {
        if (cell.culture <= 0) {
          continue;
        }
        context.fillStyle = pickPaletteColor(
          CULTURE_FILL_PALETTE,
          cell.culture,
        );
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.religions) {
      for (const cell of this.world.cells) {
        if (cell.religion <= 0) {
          continue;
        }
        context.fillStyle = pickPaletteColor(
          RELIGION_FILL_PALETTE,
          cell.religion,
        );
        fillPolygon(context, cell.polygon);
      }
    }

    if (this.visibility.states) {
      context.strokeStyle = this.style.stateLineColor;
      context.lineWidth = 1.8;
      context.lineCap = "round";
      for (const edge of this.edges) {
        const cellA = this.world.cells[edge.cellA];
        const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
        if (!cellA || !cellB || cellA.feature !== 1 || cellB.feature !== 1) {
          continue;
        }
        if (cellA.state <= 0 || cellA.state === cellB.state) {
          continue;
        }
        context.beginPath();
        context.moveTo(edge.ax, edge.ay);
        context.lineTo(edge.bx, edge.by);
        context.stroke();
      }
    }

    if (this.visibility.provinces) {
      context.strokeStyle = this.style.provinceLineColor;
      context.lineWidth = 0.85;
      context.lineCap = "round";
      for (const edge of this.edges) {
        const cellA = this.world.cells[edge.cellA];
        const cellB = edge.cellB == null ? null : this.world.cells[edge.cellB];
        if (!cellA || !cellB || cellA.feature !== 1 || cellB.feature !== 1) {
          continue;
        }
        if (cellA.province <= 0 || cellA.province === cellB.province) {
          continue;
        }
        context.beginPath();
        context.moveTo(edge.ax, edge.ay);
        context.lineTo(edge.bx, edge.by);
        context.stroke();
      }
    }

    if (this.visibility.routes) {
      context.strokeStyle = rgb(this.style.stateLineColor)
        .darker(1.2)
        .toString();
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

    if (this.visibility.labels && this.camera.zoom > 0.9) {
      const stateCellCounts = this.world.states.map((state) => state.cells);
      const range = extent(stateCellCounts);
      const minCells = range[0] ?? 0;
      const maxCells = range[1] ?? 1;
      const fontScale = scaleLinear<number>()
        .domain([minCells, maxCells])
        .range([12, 28])
        .clamp(true);

      context.fillStyle = "rgba(46, 61, 89, 0.9)";
      context.strokeStyle = "rgba(255, 255, 255, 0.6)";
      context.lineWidth = 3;
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (const state of this.world.states) {
        if (state.cells < Math.max(12, maxCells * 0.08)) {
          continue;
        }
        context.font = `${Math.floor(fontScale(state.cells))}px "Iowan Old Style", "Times New Roman", serif`;
        const label = buildStateLabel(
          state.id,
          state.culture,
          state.form,
        ).toUpperCase();
        context.strokeText(label, state.centerX, state.centerY);
        context.fillText(label, state.centerX, state.centerY);
      }

      if (this.camera.zoom > 1.5) {
        context.fillStyle = "rgba(34, 50, 78, 0.78)";
        context.strokeStyle = "rgba(255, 255, 255, 0.55)";
        context.lineWidth = 2.2;
        context.font = '11px "Iowan Old Style", "Times New Roman", serif';
        const maxLabels = 80;
        let rendered = 0;
        for (const burg of this.world.burgs) {
          if (rendered >= maxLabels) {
            break;
          }
          const label = buildStateLabel(
            burg.id,
            burg.culture,
            burg.port > 0 ? 2 : 0,
          );
          context.strokeText(label, burg.x + 10, burg.y - 6);
          context.fillText(label, burg.x + 10, burg.y - 6);
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

    const drawHighlight = (
      cellId: number | null,
      strokeStyle: string,
      lineWidth: number,
    ): void => {
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
