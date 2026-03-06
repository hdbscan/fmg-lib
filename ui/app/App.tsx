import type { GenerationConfig, HeightTemplate, WorldGraphV1 } from "fmg-lib";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  type CameraState,
  DEFAULT_STYLE,
  type LayerVisibilityState,
  type PRESET_VISIBILITY,
  type RenderCell,
  type StylePreset,
  clampZoom,
} from "../adapter";
import { CanvasMapRenderer, estimateRenderWorkload } from "../renderer";
import type { WorkerRequest, WorkerResponse } from "../workers/protocol";
import {
  type ControllerState,
  DEFAULT_GENERATION_CONFIG,
  createController,
} from "./controller";
import { loadUiSession, saveUiSession } from "./session";
import {
  SUPPORTED_WORLD_SCHEMA_VERSION,
  createWorldDownloadName,
  formatWorldLoadError,
  getSerializedWorldSchemaVersion,
} from "./world-transfer";

type GenerationDraft = {
  seed: string;
  width: number;
  height: number;
  cells: number;
  culturesCount: number;
  heightTemplate: HeightTemplate;
};

type GenerationPreset = Readonly<{
  id: string;
  label: string;
  description: string;
  values: Partial<GenerationDraft>;
}>;

type VisibilityKey = keyof LayerVisibilityState;

type StyleKey = keyof StylePreset;

type StatusTone = "idle" | "working" | "success" | "error";

type RequestKind = "generate" | "serialize" | "deserialize";

const GENERATION_PRESETS: readonly GenerationPreset[] = [
  {
    id: "default",
    label: "Balanced",
    description: "Reliable baseline for map previews.",
    values: {
      width: 900,
      height: 600,
      cells: 6000,
      culturesCount: 10,
      heightTemplate: "continents",
    },
  },
  {
    id: "archipelago",
    label: "Archipelago",
    description: "Island-heavy layout with extra detail.",
    values: {
      width: 960,
      height: 640,
      cells: 7200,
      culturesCount: 12,
      heightTemplate: "archipelago",
    },
  },
  {
    id: "continental",
    label: "Continents",
    description: "Large landmasses with room for states.",
    values: {
      width: 1200,
      height: 800,
      cells: 9000,
      culturesCount: 14,
      heightTemplate: "continents",
    },
  },
  {
    id: "inland-sea",
    label: "Inland Sea",
    description: "Central sea suited for route overlays.",
    values: {
      width: 1080,
      height: 720,
      cells: 7500,
      culturesCount: 11,
      heightTemplate: "inland-sea",
    },
  },
] as const;

const VISIBILITY_FIELDS: readonly Readonly<{
  key: VisibilityKey;
  label: string;
}>[] = [
  { key: "physical", label: "Terrain" },
  { key: "biomes", label: "Biomes" },
  { key: "rivers", label: "Rivers" },
  { key: "cultures", label: "Cultures" },
  { key: "settlements", label: "Settlements" },
  { key: "states", label: "States" },
  { key: "routes", label: "Routes" },
  { key: "provinces", label: "Provinces" },
  { key: "religions", label: "Religions" },
  { key: "military", label: "Military" },
  { key: "markers", label: "Markers" },
  { key: "zones", label: "Zones" },
  { key: "labels", label: "Labels" },
] as const;

const STYLE_FIELDS: readonly Readonly<{
  key: StyleKey;
  label: string;
}>[] = [
  { key: "oceanColor", label: "Ocean" },
  { key: "landColorLow", label: "Lowland" },
  { key: "landColorHigh", label: "Highland" },
  { key: "riverColor", label: "Rivers" },
  { key: "stateLineColor", label: "State lines" },
  { key: "provinceLineColor", label: "Province lines" },
  { key: "burgColor", label: "Settlements" },
  { key: "militaryColor", label: "Military" },
  { key: "markerColor", label: "Markers" },
  { key: "zoneColor", label: "Zones" },
] as const;

const toGenerationDraft = (config: GenerationConfig): GenerationDraft => ({
  seed: config.seed,
  width: config.width,
  height: config.height,
  cells: config.cells,
  culturesCount: config.culturesCount ?? 10,
  heightTemplate: config.heightTemplate ?? "continents",
});

const createRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const createWorldWorker = (): Worker | null => {
  if (typeof Worker === "undefined") {
    return null;
  }

  return new Worker(new URL("../workers/generate.worker.ts", import.meta.url), {
    type: "module",
  });
};

const coerceInteger = (
  value: string,
  fallback: number,
  minimum: number,
): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, parsed);
};

const formatCount = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value);

const formatDuration = (value: number | null): string => {
  if (value == null) {
    return "-";
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
};

const invertCameraPoint = (
  camera: CameraState,
  x: number,
  y: number,
): Readonly<{ worldX: number; worldY: number }> => ({
  worldX: (x - camera.x) / camera.zoom,
  worldY: (y - camera.y) / camera.zoom,
});

const fitCameraToWorld = (
  width: number,
  height: number,
  worldWidth: number,
  worldHeight: number,
): CameraState => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const availableWidth = Math.max(160, safeWidth - 36);
  const availableHeight = Math.max(160, safeHeight - 36);
  const zoom = clampZoom(
    Math.min(availableWidth / worldWidth, availableHeight / worldHeight),
  );
  return {
    zoom,
    x: (safeWidth - worldWidth * zoom) / 2,
    y: (safeHeight - worldHeight * zoom) / 2,
  };
};

const summarizeCell = (world: WorldGraphV1, cell: RenderCell) => {
  const temperature = world.cellsTemp[cell.id] ?? 0;
  const moisture = world.cellsPrec[cell.id] ?? 0;
  const area = world.cellsArea[cell.id] ?? 0;
  return [
    ["Cell", String(cell.id)],
    ["Type", cell.feature === 1 ? "Land" : "Water"],
    ["Center", `${Math.round(cell.centerX)}, ${Math.round(cell.centerY)}`],
    ["Height", String(world.cellsH[cell.id] ?? 0)],
    ["Biome", String(cell.biome)],
    ["Culture", String(cell.culture)],
    ["State", String(cell.state)],
    ["Province", String(cell.province)],
    ["Religion", String(cell.religion)],
    ["Zone", String(cell.zone)],
    ["River", String(cell.river)],
    ["Burg", String(cell.burg)],
    ["Military", String(cell.military)],
    ["Temp", String(temperature)],
    ["Moisture", String(moisture)],
    ["Area", area.toFixed(1)],
  ] as const;
};

export const App = () => {
  const controller = createController();
  const [state, setState] = createSignal<ControllerState>(
    controller.getState(),
  );
  const [draft, setDraft] = createSignal<GenerationDraft>(
    toGenerationDraft(DEFAULT_GENERATION_CONFIG),
  );
  const [selectedPresetId, setSelectedPresetId] = createSignal("default");
  const [statusText, setStatusText] = createSignal("Ready to generate a map.");
  const [statusTone, setStatusTone] = createSignal<StatusTone>("idle");
  const [errorText, setErrorText] = createSignal<string | null>(null);
  const [lastGenerateMs, setLastGenerateMs] = createSignal<number | null>(null);
  const [canvasSize, setCanvasSize] = createSignal({ width: 960, height: 720 });
  const [activeRequest, setActiveRequest] = createSignal<Readonly<{
    id: string;
    kind: RequestKind;
  }> | null>(null);
  const [pendingLoadName, setPendingLoadName] = createSignal<string | null>(
    null,
  );
  const [pendingLoadPayload, setPendingLoadPayload] = createSignal<
    string | null
  >(null);

  let viewportElement: HTMLDivElement | undefined;
  let canvasElement: HTMLCanvasElement | undefined;
  let fileInputElement: HTMLInputElement | undefined;
  let renderer: CanvasMapRenderer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let renderFrame = 0;
  let worker: Worker | null = null;
  let restoredCamera: CameraState | null = null;
  let mounted = false;
  let dragPointerId: number | null = null;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCamera: CameraState = state().camera;

  const isGenerating = createMemo(() => activeRequest()?.kind === "generate");
  const isSaving = createMemo(() => activeRequest()?.kind === "serialize");
  const isLoading = createMemo(() => activeRequest()?.kind === "deserialize");
  const hasWorld = createMemo(() => state().world !== null);
  const generateButtonLabel = createMemo(() =>
    hasWorld() ? "Re-generate world" : "Generate world",
  );

  const refreshState = (): ControllerState => {
    const nextState = controller.getState();
    setState(nextState);
    return nextState;
  };

  const queueRender = (): void => {
    if (renderFrame !== 0) {
      return;
    }

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      const nextState = state();
      renderer?.render({
        hoverCellId: nextState.hoverCellId,
        selectedCellId: nextState.selectedCellId,
      });
    });
  };

  const syncRendererState = (nextState: ControllerState): void => {
    if (!renderer) {
      return;
    }

    renderer.setWorld(nextState.renderable);
    renderer.setVisibility(nextState.visibility);
    renderer.setStyle(nextState.style);
    renderer.setCamera(nextState.camera);
    queueRender();
  };

  const fitCamera = (): void => {
    const nextState = state();
    const renderable = nextState.renderable;
    if (!renderable) {
      return;
    }

    const size = canvasSize();
    controller.setCamera(
      fitCameraToWorld(
        size.width,
        size.height,
        renderable.width,
        renderable.height,
      ),
    );
    syncRendererState(refreshState());
  };

  const applyWorld = (
    world: WorldGraphV1,
    elapsedMs: number | null,
    fitView: boolean,
    successText?: string,
  ): void => {
    controller.setWorld(world);
    let nextState = refreshState();

    if (restoredCamera) {
      controller.setCamera(restoredCamera);
      restoredCamera = null;
      nextState = refreshState();
    } else if (fitView) {
      const size = canvasSize();
      controller.setCamera(
        fitCameraToWorld(size.width, size.height, world.width, world.height),
      );
      nextState = refreshState();
    }

    setLastGenerateMs(elapsedMs);
    setStatusTone("success");
    setStatusText(
      successText ??
        `Rendered ${formatCount(world.cellCount)} cells at ${world.width}x${world.height}.`,
    );
    setErrorText(null);
    syncRendererState(nextState);
  };

  const clearActiveRequest = (requestId?: string): void => {
    const current = activeRequest();
    if (!current) {
      return;
    }

    if (requestId && current.id !== requestId) {
      return;
    }

    setActiveRequest(null);
  };

  const downloadSerializedWorld = (payload: string): void => {
    const world = state().world;
    if (!world) {
      return;
    }

    const fileName = createWorldDownloadName(world.seed);
    const blob = new Blob([payload], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setStatusTone("success");
    setStatusText(`Saved ${fileName}.`);
    setErrorText(null);
  };

  const postGenerateRequest = (config: GenerationConfig): void => {
    if (!worker) {
      try {
        controller.generate(config);
        applyWorld(controller.getState().world as WorldGraphV1, null, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusTone("error");
        setStatusText("Generation failed.");
        setErrorText(message);
      }
      return;
    }

    const requestId = createRequestId();
    setActiveRequest({ id: requestId, kind: "generate" });
    setStatusTone("working");
    setStatusText(
      `Generating ${config.heightTemplate ?? "continents"} preset...`,
    );
    setErrorText(null);
    worker.postMessage({
      type: "generate",
      requestId,
      config,
    } satisfies WorkerRequest);
  };

  const requestSaveWorld = (): void => {
    const world = state().world;
    if (!world) {
      return;
    }

    if (!worker) {
      try {
        downloadSerializedWorld(controller.saveWorld());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusTone("error");
        setStatusText("Save failed.");
        setErrorText(message);
      }
      return;
    }

    const requestId = createRequestId();
    setActiveRequest({ id: requestId, kind: "serialize" });
    setStatusTone("working");
    setStatusText("Preparing world download...");
    setErrorText(null);
    worker.postMessage({
      type: "serialize",
      requestId,
      world,
    } satisfies WorkerRequest);
  };

  const openLoadDialog = (): void => {
    fileInputElement?.click();
  };

  const requestLoadWorld = (payload: string, fileName: string): void => {
    const schemaVersion = getSerializedWorldSchemaVersion(payload);
    if (
      schemaVersion !== null &&
      schemaVersion !== SUPPORTED_WORLD_SCHEMA_VERSION
    ) {
      setStatusTone("error");
      setStatusText(`Could not load ${fileName}.`);
      setErrorText(formatWorldLoadError(payload, "unsupported schemaVersion"));
      return;
    }

    if (!worker) {
      try {
        controller.loadWorld(payload);
        applyWorld(
          controller.getState().world as WorldGraphV1,
          null,
          true,
          `Loaded ${fileName}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusTone("error");
        setStatusText(`Could not load ${fileName}.`);
        setErrorText(formatWorldLoadError(payload, message));
      }
      return;
    }

    const requestId = createRequestId();
    setPendingLoadName(fileName);
    setPendingLoadPayload(payload);
    setActiveRequest({ id: requestId, kind: "deserialize" });
    setStatusTone("working");
    setStatusText(`Loading ${fileName}...`);
    setErrorText(null);
    worker.postMessage({
      type: "deserialize",
      requestId,
      payload,
    } satisfies WorkerRequest);
  };

  const handleLoadFile = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }

    try {
      const payload = await file.text();
      requestLoadWorld(payload, file.name || "world.json");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusTone("error");
      setStatusText(`Could not read ${file.name || "world.json"}.`);
      setErrorText(message);
    }
  };

  const cancelGeneration = (): void => {
    const current = activeRequest();
    if (!worker || !current || current.kind !== "generate") {
      return;
    }

    setStatusTone("working");
    setStatusText(
      "Cancellation requested. The worker will stop after the current step.",
    );
    worker.postMessage({
      type: "cancel",
      requestId: current.id,
    } satisfies WorkerRequest);
  };

  const updateDraft = <K extends keyof GenerationDraft>(
    key: K,
    value: GenerationDraft[K],
  ): void => {
    setDraft((current: GenerationDraft) => ({ ...current, [key]: value }));
  };

  const runGeneration = (): void => {
    const current = draft();
    const config: GenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      seed: current.seed.trim() || DEFAULT_GENERATION_CONFIG.seed,
      width: current.width,
      height: current.height,
      cells: current.cells,
      culturesCount: current.culturesCount,
      heightTemplate: current.heightTemplate,
    };
    postGenerateRequest(config);
  };

  const applyGenerationPreset = (presetId: string): void => {
    const preset = GENERATION_PRESETS.find((item) => item.id === presetId);
    setSelectedPresetId(presetId);
    if (!preset) {
      return;
    }

    setDraft((current: GenerationDraft) => ({
      ...current,
      ...preset.values,
      seed: `${preset.id}-${Date.now().toString(36)}`,
    }));
    setStatusText(preset.description);
    setStatusTone("idle");
  };

  const setVisibilityLayer = (key: VisibilityKey, value: boolean): void => {
    controller.setVisibilityLayer(key, value);
    syncRendererState(refreshState());
  };

  const applyVisibilityPreset = (
    presetName: keyof typeof PRESET_VISIBILITY,
  ): void => {
    controller.applyPreset(presetName);
    syncRendererState(refreshState());
    setStatusTone("idle");
    setStatusText(`Applied ${presetName} visibility preset.`);
  };

  const setStyleValue = (key: StyleKey, value: string): void => {
    controller.setStyle({
      ...state().style,
      [key]: value,
    });
    syncRendererState(refreshState());
  };

  const updatePointerInspection = (
    clientX: number,
    clientY: number,
  ): number | null => {
    const canvas = canvasElement;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((clientY - rect.top) / rect.height) * canvas.height;
    const worldPoint = invertCameraPoint(state().camera, canvasX, canvasY);
    const hoveredCellId = controller.inspectAt(
      worldPoint.worldX,
      worldPoint.worldY,
    );
    syncRendererState(refreshState());
    return hoveredCellId;
  };

  const inspectedCell = createMemo(() => {
    const nextState = state();
    const renderable = nextState.renderable;
    if (!renderable) {
      return null;
    }
    const cellId = nextState.selectedCellId ?? nextState.hoverCellId;
    return cellId == null ? null : (renderable.cells[cellId] ?? null);
  });

  const workload = createMemo(() => {
    const renderable = state().renderable;
    if (!renderable) {
      return null;
    }
    return estimateRenderWorkload(renderable, state().visibility);
  });

  const inspectorRows = createMemo(() => {
    const cell = inspectedCell();
    const world = state().world;
    if (!cell || !world) {
      return [] as ReadonlyArray<readonly [string, string]>;
    }
    return summarizeCell(world, cell);
  });

  const worldCellCountText = createMemo(() => {
    const count = state().world?.cellCount;
    return count == null ? "-" : formatCount(count);
  });
  const renderStateCountText = createMemo(() => {
    const count = state().renderable?.states.length;
    return count == null ? "-" : formatCount(count);
  });
  const renderBurgCountText = createMemo(() => {
    const count = state().renderable?.burgs.length;
    return count == null ? "-" : formatCount(count);
  });

  onMount(() => {
    mounted = true;

    try {
      worker = createWorldWorker();
    } catch {
      worker = null;
    }

    if (worker) {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        const current = activeRequest();
        if (!current || message.requestId !== current.id) {
          return;
        }

        if (message.type === "status") {
          if (message.stage === "cancelled") {
            clearActiveRequest(message.requestId);
            setStatusTone("idle");
            setStatusText("Generation cancelled.");
            setErrorText(null);
            return;
          }

          if (message.stage === "running") {
            setStatusTone("working");
            if (current.kind === "serialize") {
              setStatusText("Saving world...");
              return;
            }
            if (current.kind === "deserialize") {
              setStatusText(`Loading ${pendingLoadName() ?? "world.json"}...`);
              return;
            }
          }
          setStatusText(message.message);
          return;
        }

        if (message.type === "generated") {
          clearActiveRequest(message.requestId);
          applyWorld(message.world, message.elapsedMs, true);
          return;
        }

        if (message.type === "serialized") {
          clearActiveRequest(message.requestId);
          downloadSerializedWorld(message.payload);
          return;
        }

        if (message.type === "deserialized") {
          const fileName = pendingLoadName() ?? "world.json";
          clearActiveRequest(message.requestId);
          setPendingLoadName(null);
          setPendingLoadPayload(null);
          applyWorld(
            message.world,
            message.elapsedMs,
            true,
            `Loaded ${fileName}.`,
          );
          return;
        }

        if (message.type === "error") {
          const kind = current.kind;
          clearActiveRequest(message.requestId);
          setStatusTone("error");
          if (kind === "deserialize") {
            const fileName = pendingLoadName() ?? "world.json";
            const payload = pendingLoadPayload() ?? "";
            setPendingLoadName(null);
            setPendingLoadPayload(null);
            setStatusText(`Could not load ${fileName}.`);
            setErrorText(formatWorldLoadError(payload, message.message));
            return;
          }

          setStatusText(
            kind === "serialize" ? "Save failed." : "Generation failed.",
          );
          setErrorText(message.message);
        }
      };
    }

    const session = loadUiSession();
    if (session) {
      controller.setVisibility(session.visibility);
      controller.setStyle(session.style);
      controller.selectCell(session.selectedCellId);
      restoredCamera = session.camera;
      refreshState();
      setStatusText("Restored previous UI session.");
    }

    if (viewportElement) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        const nextWidth = Math.max(320, Math.round(entry.contentRect.width));
        const nextHeight = Math.max(320, Math.round(entry.contentRect.height));
        setCanvasSize({ width: nextWidth, height: nextHeight });
        renderer?.resize(nextWidth, nextHeight);
        queueRender();
      });
      resizeObserver.observe(viewportElement);
    }

    window.setTimeout(() => {
      if (mounted && !state().world) {
        runGeneration();
      }
    }, 0);
  });

  onCleanup(() => {
    mounted = false;
    if (renderFrame !== 0) {
      window.cancelAnimationFrame(renderFrame);
    }
    resizeObserver?.disconnect();
    worker?.terminate();
  });

  createEffect(() => {
    const canvas = canvasElement;
    if (!canvas || renderer) {
      return;
    }

    const nextState = state();
    const size = canvasSize();
    renderer = new CanvasMapRenderer(
      canvas,
      nextState.visibility,
      nextState.style,
      nextState.camera,
    );
    renderer.resize(size.width, size.height);
    syncRendererState(nextState);
  });

  createEffect(() => {
    if (!mounted) {
      return;
    }

    const nextState = state();
    saveUiSession({
      camera: nextState.camera,
      visibility: nextState.visibility,
      style: nextState.style,
      selectedCellId: nextState.selectedCellId,
    });
  });

  createEffect(() => {
    const nextState = state();
    if (!renderer) {
      return;
    }
    syncRendererState(nextState);
  });

  createEffect(() => {
    const size = canvasSize();
    if (!renderer) {
      return;
    }
    renderer.resize(size.width, size.height);
    queueRender();
  });

  const nextStatusToneClass = () => `status-pill status-${statusTone()}`;

  const resetStyle = (): void => {
    controller.setStyle(DEFAULT_STYLE);
    syncRendererState(refreshState());
  };

  const clearSelection = (): void => {
    controller.selectCell(null);
    syncRendererState(refreshState());
  };

  return (
    <div class="layout" data-screenshot="ui-shell">
      <aside class="panel sidebar">
        <div class="panel-scroll">
          <section class="section hero-section">
            <div class="eyebrow">FMG UI Renderer</div>
            <h1>Solid app shell</h1>
            <p class="lead">
              Generate a world, tune overlays, and inspect the data already
              exposed by the adapter and renderer scaffold.
            </p>
            <div class="hero-actions">
              <button
                class="primary"
                type="button"
                onClick={runGeneration}
                disabled={isGenerating() || isSaving() || isLoading()}
              >
                {generateButtonLabel()}
              </button>
              <button
                class="warn"
                type="button"
                onClick={cancelGeneration}
                disabled={!isGenerating()}
              >
                Cancel generate
              </button>
              <button
                type="button"
                onClick={fitCamera}
                disabled={!state().renderable}
              >
                Reset view
              </button>
            </div>
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>World file</h2>
              <span class="hint">Worker-backed save and load</span>
            </div>
            <div class="transfer-actions">
              <button
                type="button"
                onClick={requestSaveWorld}
                disabled={
                  !hasWorld() || isSaving() || isGenerating() || isLoading()
                }
              >
                Save world
              </button>
              <button
                type="button"
                onClick={openLoadDialog}
                disabled={isSaving() || isGenerating() || isLoading()}
              >
                Load world
              </button>
            </div>
            <p class="empty-state transfer-copy">
              Export the current world as serialized JSON, then load it back
              into the same renderer. Unsupported schema versions are blocked
              with a clear UI error.
            </p>
            <input
              data-ui-smoke="load-world-input"
              ref={fileInputElement}
              class="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void handleLoadFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>Generation</h2>
              <span class="hint">Worker-backed when available</span>
            </div>
            <label>
              Preset
              <select
                value={selectedPresetId()}
                onInput={(event) =>
                  applyGenerationPreset(event.currentTarget.value)
                }
              >
                <For each={GENERATION_PRESETS}>
                  {(preset) => (
                    <option value={preset.id}>{preset.label}</option>
                  )}
                </For>
              </select>
            </label>
            <div class="row">
              <label>
                Seed
                <input
                  type="text"
                  value={draft().seed}
                  onInput={(event) =>
                    updateDraft("seed", event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Terrain
                <select
                  value={draft().heightTemplate}
                  onInput={(event) =>
                    updateDraft(
                      "heightTemplate",
                      event.currentTarget.value as HeightTemplate,
                    )
                  }
                >
                  <option value="continents">Continents</option>
                  <option value="archipelago">Archipelago</option>
                  <option value="inland-sea">Inland sea</option>
                </select>
              </label>
            </div>
            <div class="row">
              <label>
                Width
                <input
                  type="number"
                  min="320"
                  step="20"
                  value={draft().width}
                  onInput={(event) =>
                    updateDraft(
                      "width",
                      coerceInteger(
                        event.currentTarget.value,
                        draft().width,
                        320,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  min="320"
                  step="20"
                  value={draft().height}
                  onInput={(event) =>
                    updateDraft(
                      "height",
                      coerceInteger(
                        event.currentTarget.value,
                        draft().height,
                        320,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <div class="row">
              <label>
                Cells
                <input
                  type="number"
                  min="500"
                  step="250"
                  value={draft().cells}
                  onInput={(event) =>
                    updateDraft(
                      "cells",
                      coerceInteger(
                        event.currentTarget.value,
                        draft().cells,
                        500,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Cultures
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft().culturesCount}
                  onInput={(event) =>
                    updateDraft(
                      "culturesCount",
                      coerceInteger(
                        event.currentTarget.value,
                        draft().culturesCount,
                        1,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>Visibility</h2>
              <div class="mini-actions">
                <button
                  type="button"
                  onClick={() => applyVisibilityPreset("physical")}
                >
                  Physical
                </button>
                <button
                  type="button"
                  onClick={() => applyVisibilityPreset("political")}
                >
                  Political
                </button>
                <button
                  type="button"
                  onClick={() => applyVisibilityPreset("all")}
                >
                  All
                </button>
              </div>
            </div>
            <div class="checkbox-grid">
              <For each={VISIBILITY_FIELDS}>
                {(field) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={state().visibility[field.key]}
                      onInput={(event) =>
                        setVisibilityLayer(
                          field.key,
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>{field.label}</span>
                  </label>
                )}
              </For>
            </div>
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>Style</h2>
              <button type="button" onClick={resetStyle}>
                Reset colors
              </button>
            </div>
            <div class="color-grid">
              <For each={STYLE_FIELDS}>
                {(field) => (
                  <label>
                    {field.label}
                    <input
                      type="color"
                      value={state().style[field.key]}
                      onInput={(event) =>
                        setStyleValue(field.key, event.currentTarget.value)
                      }
                    />
                  </label>
                )}
              </For>
            </div>
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>Status</h2>
              <span class={nextStatusToneClass()}>{statusTone()}</span>
            </div>
            <p class="status-line" data-ui-smoke="status-line">
              {statusText()}
            </p>
            <Show when={errorText()}>
              {(message) => <div class="banner">{message()}</div>}
            </Show>
            <div class="metric-grid compact-grid">
              <div>
                <span class="metric-label">Cells</span>
                <strong data-ui-smoke="metric-cells">
                  {worldCellCountText()}
                </strong>
              </div>
              <div>
                <span class="metric-label">States</span>
                <strong>{renderStateCountText()}</strong>
              </div>
              <div>
                <span class="metric-label">Burgs</span>
                <strong>{renderBurgCountText()}</strong>
              </div>
              <div>
                <span class="metric-label">Last run</span>
                <strong>{formatDuration(lastGenerateMs())}</strong>
              </div>
            </div>
            <Show when={workload()}>
              {(metrics) => (
                <div class="metric-grid compact-grid top-gap">
                  <div>
                    <span class="metric-label">Polygons</span>
                    <strong>{formatCount(metrics().polygonDraws)}</strong>
                  </div>
                  <div>
                    <span class="metric-label">Edges</span>
                    <strong>{formatCount(metrics().edgeChecks)}</strong>
                  </div>
                  <div>
                    <span class="metric-label">Routes</span>
                    <strong>{formatCount(metrics().routeDraws)}</strong>
                  </div>
                  <div>
                    <span class="metric-label">Points</span>
                    <strong>{formatCount(metrics().pointDraws)}</strong>
                  </div>
                </div>
              )}
            </Show>
          </section>

          <section class="section">
            <div class="section-title-row">
              <h2>Inspector</h2>
              <span class="hint">Click to pin, hover to preview</span>
            </div>
            <Show
              when={inspectorRows().length > 0}
              fallback={
                <p class="empty-state">Generate a world and hover a cell.</p>
              }
            >
              <table class="inspector-table" data-ui-smoke="inspector-table">
                <tbody>
                  <For each={inspectorRows()}>
                    {(row) => (
                      <tr>
                        <th>{row[0]}</th>
                        <td>{row[1]}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </section>
        </div>
      </aside>

      <main class="panel viewport-shell" data-screenshot="ui-shell-physical">
        <div class="viewport-toolbar">
          <div>
            <strong>Canvas</strong>
            <span class="hint">Wheel to zoom, drag to pan</span>
          </div>
          <div class="mini-actions">
            <button type="button" onClick={clearSelection}>
              Clear selection
            </button>
            <button
              type="button"
              onClick={fitCamera}
              disabled={!state().renderable}
            >
              Fit world
            </button>
          </div>
        </div>
        <div
          class="viewport"
          ref={viewportElement}
          data-screenshot="ui-shell-viewport"
        >
          <canvas
            data-screenshot="ui-shell-canvas"
            ref={canvasElement}
            onPointerDown={(event) => {
              if (!canvasElement) {
                return;
              }
              dragPointerId = event.pointerId;
              dragMoved = false;
              dragStartX = event.clientX;
              dragStartY = event.clientY;
              dragStartCamera = state().camera;
              canvasElement.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragPointerId === event.pointerId) {
                const deltaX = event.clientX - dragStartX;
                const deltaY = event.clientY - dragStartY;
                dragMoved =
                  dragMoved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
                controller.setCamera({
                  ...dragStartCamera,
                  x: dragStartCamera.x + deltaX,
                  y: dragStartCamera.y + deltaY,
                });
                syncRendererState(refreshState());
                return;
              }
              updatePointerInspection(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (dragPointerId !== event.pointerId) {
                return;
              }
              if (!dragMoved) {
                const cellId = updatePointerInspection(
                  event.clientX,
                  event.clientY,
                );
                controller.selectCell(cellId);
                syncRendererState(refreshState());
              }
              if (canvasElement?.hasPointerCapture(event.pointerId)) {
                canvasElement.releasePointerCapture(event.pointerId);
              }
              dragPointerId = null;
            }}
            onPointerLeave={() => {
              if (dragPointerId != null) {
                return;
              }
              controller.inspectAt(-1, -1);
              syncRendererState(refreshState());
            }}
            onWheel={(event) => {
              event.preventDefault();
              const canvas = canvasElement;
              if (!canvas) {
                return;
              }
              const rect = canvas.getBoundingClientRect();
              const canvasX =
                ((event.clientX - rect.left) / rect.width) * canvas.width;
              const canvasY =
                ((event.clientY - rect.top) / rect.height) * canvas.height;
              const currentCamera = state().camera;
              const worldPoint = invertCameraPoint(
                currentCamera,
                canvasX,
                canvasY,
              );
              const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
              const nextZoom = clampZoom(currentCamera.zoom * zoomFactor);
              controller.setCamera({
                zoom: nextZoom,
                x: canvasX - worldPoint.worldX * nextZoom,
                y: canvasY - worldPoint.worldY * nextZoom,
              });
              syncRendererState(refreshState());
            }}
          />
          <div class="viewport-overlay">
            <div class="overlay-chip" data-ui-smoke="hover-chip">
              {state().hoverCellId != null
                ? `Hover ${state().hoverCellId}`
                : "Hover none"}
            </div>
            <div class="overlay-chip" data-ui-smoke="selected-chip">
              {state().selectedCellId != null
                ? `Selected ${state().selectedCellId}`
                : "Selection none"}
            </div>
            <div class="overlay-chip">
              Zoom {state().camera.zoom.toFixed(2)}x
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
