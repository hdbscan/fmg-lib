import { describe, expect, test } from "bun:test";
import path from "node:path";

type ScreenshotLibModule = {
  defaultDummyPath: string;
  repoRoot: string;
  normalizeUrlPath: (value: string | undefined, fallback?: string) => string;
  parseDelayMs: (
    value: string | boolean | undefined,
    fallback?: number,
  ) => number;
  resolveStaticTarget: (options: {
    staticRoot?: string;
    staticPath?: string;
    defaultPath?: string;
  }) => {
    rootDirectory: string;
    urlPath: string;
  };
};

const loadScreenshotLib = async (): Promise<ScreenshotLibModule> =>
  // @ts-ignore Runtime-only helper script has no TypeScript declarations.
  (await import("../scripts/screenshot-lib.mjs")) as ScreenshotLibModule;

describe("screenshot lib", () => {
  test("normalizes static capture paths", async () => {
    const { defaultDummyPath, normalizeUrlPath } = await loadScreenshotLib();

    expect(normalizeUrlPath("ui/index.html")).toBe("/ui/index.html");
    expect(normalizeUrlPath("/ui/index.html")).toBe("/ui/index.html");
    expect(normalizeUrlPath(undefined, defaultDummyPath)).toBe(
      defaultDummyPath,
    );
    expect(normalizeUrlPath("/", defaultDummyPath)).toBe("/");
  });

  test("resolves repo-relative static roots", async () => {
    const { repoRoot, resolveStaticTarget } = await loadScreenshotLib();

    expect(
      resolveStaticTarget({
        staticRoot: "ui/dist",
        staticPath: "/",
      }),
    ).toEqual({
      rootDirectory: path.join(repoRoot, "ui/dist"),
      urlPath: "/",
    });
  });

  test("parses capture delays", async () => {
    const { parseDelayMs } = await loadScreenshotLib();

    expect(parseDelayMs(undefined)).toBe(300);
    expect(parseDelayMs("1200")).toBe(1200);
    expect(() => parseDelayMs("-1")).toThrow(
      "Invalid delay: -1. Expected a non-negative integer.",
    );
  });
});
