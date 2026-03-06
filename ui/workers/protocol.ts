import type { GenerationConfig, WorldGraphV1 } from "fmg-lib";

export type WorkerRequest =
  | Readonly<{
      type: "generate";
      requestId: string;
      config: GenerationConfig;
    }>
  | Readonly<{
      type: "serialize";
      requestId: string;
      world: WorldGraphV1;
    }>
  | Readonly<{
      type: "deserialize";
      requestId: string;
      payload: string;
    }>
  | Readonly<{
      type: "cancel";
      requestId: string;
    }>;

export type WorkerResponse =
  | Readonly<{
      type: "status";
      requestId: string;
      stage: "queued" | "running" | "cancelled" | "completed";
      message: string;
      elapsedMs?: number;
    }>
  | Readonly<{
      type: "generated";
      requestId: string;
      world: WorldGraphV1;
      elapsedMs: number;
    }>
  | Readonly<{
      type: "serialized";
      requestId: string;
      payload: string;
      elapsedMs: number;
    }>
  | Readonly<{
      type: "deserialized";
      requestId: string;
      world: WorldGraphV1;
      elapsedMs: number;
    }>
  | Readonly<{
      type: "error";
      requestId: string;
      message: string;
    }>;
