import type { CameraState, RenderableWorld } from "../adapter";
import { clampZoom } from "../adapter";

export type ReviewMode = "default" | "terrain";

const TERRAIN_REVIEW_QUERY_VALUES = new Set(["terrain", "terrain-review"]);

const getCameraBounds = (
  renderable: RenderableWorld,
  reviewMode: ReviewMode,
): Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> => {
  if (reviewMode === "terrain") {
    return {
      minX: 0,
      minY: 0,
      maxX: renderable.width,
      maxY: renderable.height,
    };
  }

  return renderable.focusBounds;
};

export const readReviewMode = (search: string): ReviewMode => {
  const params = new URLSearchParams(search);
  const review = params.get("review")?.trim().toLowerCase();
  return review && TERRAIN_REVIEW_QUERY_VALUES.has(review)
    ? "terrain"
    : "default";
};

export const fitCameraToRenderable = (
  width: number,
  height: number,
  renderable: RenderableWorld,
  reviewMode: ReviewMode,
): CameraState => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const bounds = getCameraBounds(renderable, reviewMode);
  const isTerrainReview = reviewMode === "terrain";
  const horizontalPadding = isTerrainReview
    ? Math.max(6, Math.round(safeWidth * 0.01))
    : Math.max(24, Math.round(safeWidth * 0.035));
  const verticalPadding = isTerrainReview
    ? Math.max(6, Math.round(safeHeight * 0.01))
    : Math.max(24, Math.round(safeHeight * 0.04));
  const availableWidth = Math.max(160, safeWidth - horizontalPadding * 2);
  const availableHeight = Math.max(160, safeHeight - verticalPadding * 2);
  const focusWidth = Math.max(1, bounds.maxX - bounds.minX);
  const focusHeight = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(
    Math.min(availableWidth / focusWidth, availableHeight / focusHeight),
  );
  const focusCenterX = (bounds.minX + bounds.maxX) / 2;
  const focusCenterY = (bounds.minY + bounds.maxY) / 2;

  return {
    zoom,
    x: safeWidth / 2 - focusCenterX * zoom,
    y: safeHeight / 2 - focusCenterY * zoom,
  };
};

export const shouldPersistUiSession = (reviewMode: ReviewMode): boolean => {
  return reviewMode === "default";
};
