import { serializeWorld } from "fmg-lib";
import { describe, expect, it } from "vitest";
import {
  extractWorldFromResponse,
  runWorkerRequest,
} from "../../workers/service";
import { getFixtureWorld } from "../helpers/world-fixture";

describe("runWorkerRequest", () => {
  it("generates a world payload for generate requests", () => {
    const response = runWorkerRequest(
      {
        type: "generate",
        requestId: "generate-1",
        config: {
          seed: "worker-generate",
          width: 200,
          height: 120,
          cells: 96,
          culturesCount: 5,
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
        },
      },
      () => false,
    );

    expect(response.type).toBe("generated");
    if (response.type !== "generated") {
      return;
    }

    expect(response.requestId).toBe("generate-1");
    expect(response.world.cellCount).toBeGreaterThan(0);
    expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(extractWorldFromResponse(response)).toBe(response.world);
  });

  it("serializes and deserializes worlds", () => {
    const world = getFixtureWorld();
    const serialized = runWorkerRequest(
      {
        type: "serialize",
        requestId: "serialize-1",
        world,
      },
      () => false,
    );

    expect(serialized.type).toBe("serialized");
    if (serialized.type !== "serialized") {
      return;
    }

    const deserialized = runWorkerRequest(
      {
        type: "deserialize",
        requestId: "deserialize-1",
        payload: serialized.payload,
      },
      () => false,
    );

    expect(deserialized.type).toBe("deserialized");
    if (deserialized.type !== "deserialized") {
      return;
    }

    expect(deserialized.world.seed).toBe(world.seed);
    expect(deserialized.world.cellCount).toBe(world.cellCount);
    expect(extractWorldFromResponse(deserialized)?.seed).toBe(world.seed);
  });

  it("returns cancellation statuses before or during work", () => {
    const world = getFixtureWorld();

    expect(
      runWorkerRequest(
        {
          type: "cancel",
          requestId: "cancel-1",
        },
        () => false,
      ),
    ).toEqual({
      type: "status",
      requestId: "cancel-1",
      stage: "cancelled",
      message: "request cancelled",
    });

    expect(
      runWorkerRequest(
        {
          type: "serialize",
          requestId: "cancel-2",
          world,
        },
        (requestId) => requestId === "cancel-2",
      ),
    ).toEqual({
      type: "status",
      requestId: "cancel-2",
      stage: "cancelled",
      message: "request cancelled",
    });
  });

  it("normalizes thrown errors into worker error responses", () => {
    const response = runWorkerRequest(
      {
        type: "deserialize",
        requestId: "deserialize-error",
        payload: `${serializeWorld(getFixtureWorld())}broken`,
      },
      () => false,
    );

    expect(response.type).toBe("error");
    if (response.type !== "error") {
      return;
    }

    expect(response.requestId).toBe("deserialize-error");
    expect(response.message.length).toBeGreaterThan(0);
    expect(extractWorldFromResponse(response)).toBeNull();
  });
});
