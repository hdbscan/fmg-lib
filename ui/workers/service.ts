import {
  type WorldGraphV1,
  deserializeWorld,
  generateWorld,
  serializeWorld,
} from "fmg-lib";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const runWorkerRequest = (
  request: WorkerRequest,
  isCancelled: (requestId: string) => boolean,
): WorkerResponse => {
  const started = performance.now();

  if (request.type === "cancel") {
    return {
      type: "status",
      requestId: request.requestId,
      stage: "cancelled",
      message: "request cancelled",
    };
  }

  if (isCancelled(request.requestId)) {
    return {
      type: "status",
      requestId: request.requestId,
      stage: "cancelled",
      message: "request cancelled",
    };
  }

  try {
    if (request.type === "generate") {
      const world = generateWorld(request.config);
      if (isCancelled(request.requestId)) {
        return {
          type: "status",
          requestId: request.requestId,
          stage: "cancelled",
          message: "request cancelled",
        };
      }

      return {
        type: "generated",
        requestId: request.requestId,
        world,
        elapsedMs: performance.now() - started,
      };
    }

    if (request.type === "serialize") {
      return {
        type: "serialized",
        requestId: request.requestId,
        payload: serializeWorld(request.world),
        elapsedMs: performance.now() - started,
      };
    }

    const deserialized = deserializeWorld(request.payload);
    return {
      type: "deserialized",
      requestId: request.requestId,
      world: deserialized,
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    return {
      type: "error",
      requestId: request.requestId,
      message: toErrorMessage(error),
    };
  }
};

export const extractWorldFromResponse = (
  response: WorkerResponse,
): WorldGraphV1 | null => {
  if (response.type === "generated" || response.type === "deserialized") {
    return response.world;
  }
  return null;
};
