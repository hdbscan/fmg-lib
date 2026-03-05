export type GenerateOptions = {
  seed: string;
  width: number;
  height: number;
  cells: number;
};

export type WorldGraphV1 = {
  schema_version: 1;
  seed: string;
  width: number;
  height: number;
  cell_count: number;
  // typed arrays are preferred; JSON serialization should pack these
  cells_x: Float32Array;
  cells_y: Float32Array;
  cells_h: Uint8Array;
};

export function generateWorld(_opts: GenerateOptions): WorldGraphV1 {
  throw new Error("Not implemented yet");
}
