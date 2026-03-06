import { describe, expect, it } from "vitest";
import {
  SUPPORTED_WORLD_SCHEMA_VERSION,
  createWorldDownloadName,
  formatWorldLoadError,
  getSerializedWorldSchemaVersion,
} from "../../app/world-transfer";

describe("world transfer helpers", () => {
  it("builds stable download names from seeds", () => {
    expect(createWorldDownloadName("  Hello, New World!  ")).toBe(
      "fmg-world-hello-new-world.json",
    );
    expect(createWorldDownloadName("***")).toBe("fmg-world-fmg-world.json");
  });

  it("reads schema versions from serialized payloads", () => {
    expect(getSerializedWorldSchemaVersion('{"schemaVersion":1}')).toBe(1);
    expect(getSerializedWorldSchemaVersion('{"schemaVersion":"1"}')).toBeNull();
    expect(getSerializedWorldSchemaVersion("not json")).toBeNull();
  });

  it("formats a clear schema mismatch message", () => {
    expect(
      formatWorldLoadError('{"schemaVersion":7}', "unsupported schemaVersion"),
    ).toBe(
      `This world file uses schema version 7. This UI currently supports schema version ${SUPPORTED_WORLD_SCHEMA_VERSION}.`,
    );
  });

  it("formats a clear missing schema version message", () => {
    expect(
      formatWorldLoadError("{}", "serialized world is missing schemaVersion"),
    ).toBe(
      "This world file is missing a schema version, so the UI cannot verify that it is safe to load.",
    );
  });
});
