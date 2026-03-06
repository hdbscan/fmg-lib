declare module "../scripts/screenshot-lib.mjs" {
  export const defaultDummyPath: string;
  export const repoRoot: string;
  export const normalizeUrlPath: (
    value: string | undefined,
    fallback?: string,
  ) => string;
  export const parseDelayMs: (
    value: string | boolean | undefined,
    fallback?: number,
  ) => number;
  export const resolveStaticTarget: (options: {
    staticRoot?: string;
    staticPath?: string;
    defaultPath?: string;
  }) => {
    rootDirectory: string;
    urlPath: string;
  };
}
