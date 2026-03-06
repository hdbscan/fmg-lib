/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from "./protocol";
import { runWorkerRequest } from "./service";

const cancelledRequestIds = new Set<string>();

const post = (message: WorkerResponse): void => {
  self.postMessage(message);
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "cancel") {
    cancelledRequestIds.add(request.requestId);
    post({
      type: "status",
      requestId: request.requestId,
      stage: "cancelled",
      message: "request cancelled",
    });
    return;
  }

  post({
    type: "status",
    requestId: request.requestId,
    stage: "running",
    message: `processing ${request.type}`,
  });

  const response = runWorkerRequest(request, (requestId) =>
    cancelledRequestIds.has(requestId),
  );

  post(response);

  if (response.type === "generated" || response.type === "serialized" || response.type === "deserialized") {
    post({
      type: "status",
      requestId: request.requestId,
      stage: "completed",
      message: `${request.type} completed`,
      elapsedMs: response.elapsedMs,
    });
  }

  cancelledRequestIds.delete(request.requestId);
};

export {};
