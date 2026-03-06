export const SUPPORTED_WORLD_SCHEMA_VERSION = 1;

const WORLD_FILE_BASENAME = "fmg-world";

export const sanitizeSeedForFilename = (seed: string): string => {
  const sanitized = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return sanitized || WORLD_FILE_BASENAME;
};

export const createWorldDownloadName = (seed: string): string => {
  return `${WORLD_FILE_BASENAME}-${sanitizeSeedForFilename(seed)}.json`;
};

export const getSerializedWorldSchemaVersion = (
  payload: string,
): number | null => {
  try {
    const parsed = JSON.parse(payload) as { schemaVersion?: unknown };
    return typeof parsed.schemaVersion === "number"
      ? parsed.schemaVersion
      : null;
  } catch {
    return null;
  }
};

export const formatWorldLoadError = (
  payload: string,
  errorMessage: string,
): string => {
  const schemaVersion = getSerializedWorldSchemaVersion(payload);

  if (
    schemaVersion !== null &&
    schemaVersion !== SUPPORTED_WORLD_SCHEMA_VERSION
  ) {
    return `This world file uses schema version ${schemaVersion}. This UI currently supports schema version ${SUPPORTED_WORLD_SCHEMA_VERSION}.`;
  }

  if (schemaVersion === null && errorMessage.includes("schemaVersion")) {
    return "This world file is missing a schema version, so the UI cannot verify that it is safe to load.";
  }

  return errorMessage;
};
