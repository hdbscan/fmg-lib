import type {
  CameraState,
  LayerVisibilityState,
  StylePreset,
  UiSession,
} from "../adapter";

export const SESSION_STORAGE_KEY = "fmg-ui-session-v1";

export type SessionSnapshot = Readonly<{
  camera: CameraState;
  visibility: LayerVisibilityState;
  style: StylePreset;
  selectedCellId: number | null;
}>;

export const toUiSession = (snapshot: SessionSnapshot): UiSession => {
  return {
    version: 1,
    camera: snapshot.camera,
    visibility: snapshot.visibility,
    style: snapshot.style,
    selectedCellId: snapshot.selectedCellId,
  };
};

export const parseUiSession = (raw: string): UiSession | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<UiSession>;
    if (parsed.version !== 1) {
      return null;
    }

    if (!parsed.camera || !parsed.visibility || !parsed.style) {
      return null;
    }

    return {
      version: 1,
      camera: {
        x: Number(parsed.camera.x ?? 0),
        y: Number(parsed.camera.y ?? 0),
        zoom: Number(parsed.camera.zoom ?? 1),
      },
      visibility: parsed.visibility,
      style: parsed.style,
      selectedCellId:
        typeof parsed.selectedCellId === "number" ? parsed.selectedCellId : null,
    };
  } catch {
    return null;
  }
};

export const saveUiSession = (snapshot: SessionSnapshot): void => {
  const encoded = JSON.stringify(toUiSession(snapshot));
  localStorage.setItem(SESSION_STORAGE_KEY, encoded);
};

export const loadUiSession = (): UiSession | null => {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return parseUiSession(raw);
};
