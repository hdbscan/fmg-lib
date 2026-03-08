import type {
  SerializedTypedArray,
  SerializedWorldV1,
  WorldGraphV1,
} from "./types";

type TypedArrayKind = SerializedTypedArray["format"];
type WorldDeserializer = (value: unknown) => WorldGraphV1;

const encodeBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

const decodeBase64 = (base64: string): Uint8Array => {
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

const encodeTypedArray = (
  view:
    | Float32Array
    | Uint8Array
    | Uint16Array
    | Int8Array
    | Int32Array
    | Uint32Array,
  format: TypedArrayKind,
): SerializedTypedArray => {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  return {
    format,
    base64: encodeBase64(bytes),
  };
};

const decodeTypedArray = (
  encoded: SerializedTypedArray,
):
  | Float32Array
  | Uint8Array
  | Uint16Array
  | Int8Array
  | Int32Array
  | Uint32Array => {
  const bytes = decodeBase64(encoded.base64);
  const copied = bytes.slice();
  const buffer = copied.buffer;

  if (encoded.format === "f32") {
    return new Float32Array(buffer);
  }

  if (encoded.format === "u8") {
    return new Uint8Array(buffer);
  }

  if (encoded.format === "u16") {
    return new Uint16Array(buffer);
  }

  if (encoded.format === "i8") {
    return new Int8Array(buffer);
  }

  if (encoded.format === "i32") {
    return new Int32Array(buffer);
  }

  return new Uint32Array(buffer);
};

export const serializeWorld = (world: WorldGraphV1): string => {
  const serialized: SerializedWorldV1 = {
    schemaVersion: world.schemaVersion,
    seed: world.seed,
    width: world.width,
    height: world.height,
    requestedCells: world.requestedCells,
    cellCount: world.cellCount,
    gridSpacing: world.gridSpacing,
    gridCellsX: world.gridCellsX,
    gridCellsY: world.gridCellsY,
    cultureCount: world.cultureCount,
    burgCount: world.burgCount,
    stateCount: world.stateCount,
    routeCount: world.routeCount,
    provinceCount: world.provinceCount,
    religionCount: world.religionCount,
    militaryCount: world.militaryCount,
    markerCount: world.markerCount,
    zoneCount: world.zoneCount,
    featureCount: world.featureCount,
    waterbodyCount: world.waterbodyCount,
    landmassCount: world.landmassCount,
    packCellCount: world.packCellCount,
    packFeatureCount: world.packFeatureCount,
    arrays: {
      cellsX: encodeTypedArray(world.cellsX, "f32"),
      cellsY: encodeTypedArray(world.cellsY, "f32"),
      cellsBorder: encodeTypedArray(world.cellsBorder, "u8"),
      cellsArea: encodeTypedArray(world.cellsArea, "f32"),
      cellsH: encodeTypedArray(world.cellsH, "u8"),
      cellsCulture: encodeTypedArray(world.cellsCulture, "u16"),
      cultureSeedCell: encodeTypedArray(world.cultureSeedCell, "u32"),
      cultureSize: encodeTypedArray(world.cultureSize, "u32"),
      cellsBurg: encodeTypedArray(world.cellsBurg, "u16"),
      burgCell: encodeTypedArray(world.burgCell, "u32"),
      burgX: encodeTypedArray(world.burgX, "f32"),
      burgY: encodeTypedArray(world.burgY, "f32"),
      burgPopulation: encodeTypedArray(world.burgPopulation, "u16"),
      burgCapital: encodeTypedArray(world.burgCapital, "u8"),
      burgPort: encodeTypedArray(world.burgPort, "u8"),
      burgCulture: encodeTypedArray(world.burgCulture, "u16"),
      cellsState: encodeTypedArray(world.cellsState, "u16"),
      stateCenterBurg: encodeTypedArray(world.stateCenterBurg, "u16"),
      stateCulture: encodeTypedArray(world.stateCulture, "u16"),
      stateForm: encodeTypedArray(world.stateForm, "u8"),
      stateCells: encodeTypedArray(world.stateCells, "u32"),
      routeFromState: encodeTypedArray(world.routeFromState, "u16"),
      routeToState: encodeTypedArray(world.routeToState, "u16"),
      routeKind: encodeTypedArray(world.routeKind, "u8"),
      routeWeight: encodeTypedArray(world.routeWeight, "u16"),
      cellRouteOffsets: encodeTypedArray(world.cellRouteOffsets, "u32"),
      cellRouteNeighbors: encodeTypedArray(world.cellRouteNeighbors, "u32"),
      cellRouteKinds: encodeTypedArray(world.cellRouteKinds, "u8"),
      cellsProvince: encodeTypedArray(world.cellsProvince, "u16"),
      provinceState: encodeTypedArray(world.provinceState, "u16"),
      provinceCenterCell: encodeTypedArray(world.provinceCenterCell, "u32"),
      provinceCells: encodeTypedArray(world.provinceCells, "u32"),
      cellsReligion: encodeTypedArray(world.cellsReligion, "u16"),
      religionSeedCell: encodeTypedArray(world.religionSeedCell, "u32"),
      religionType: encodeTypedArray(world.religionType, "u8"),
      religionSize: encodeTypedArray(world.religionSize, "u32"),
      cellsMilitary: encodeTypedArray(world.cellsMilitary, "u16"),
      militaryCell: encodeTypedArray(world.militaryCell, "u32"),
      militaryState: encodeTypedArray(world.militaryState, "u16"),
      militaryType: encodeTypedArray(world.militaryType, "u8"),
      militaryStrength: encodeTypedArray(world.militaryStrength, "u16"),
      markerCell: encodeTypedArray(world.markerCell, "u32"),
      markerType: encodeTypedArray(world.markerType, "u8"),
      markerStrength: encodeTypedArray(world.markerStrength, "u8"),
      cellsZone: encodeTypedArray(world.cellsZone, "u16"),
      zoneSeedCell: encodeTypedArray(world.zoneSeedCell, "u32"),
      zoneType: encodeTypedArray(world.zoneType, "u8"),
      zoneCells: encodeTypedArray(world.zoneCells, "u32"),
      cellsFeature: encodeTypedArray(world.cellsFeature, "u8"),
      cellsFeatureId: encodeTypedArray(world.cellsFeatureId, "u32"),
      featureType: encodeTypedArray(world.featureType, "u8"),
      featureGroup: encodeTypedArray(world.featureGroup, "u8"),
      featureLand: encodeTypedArray(world.featureLand, "u8"),
      featureBorder: encodeTypedArray(world.featureBorder, "u8"),
      featureSize: encodeTypedArray(world.featureSize, "u32"),
      featureFirstCell: encodeTypedArray(world.featureFirstCell, "u32"),
      cellsCoast: encodeTypedArray(world.cellsCoast, "i8"),
      cellsLandmass: encodeTypedArray(world.cellsLandmass, "u32"),
      landmassKind: encodeTypedArray(world.landmassKind, "u8"),
      landmassSize: encodeTypedArray(world.landmassSize, "u32"),
      landmassBorder: encodeTypedArray(world.landmassBorder, "u8"),
      cellsTemp: encodeTypedArray(world.cellsTemp, "i8"),
      cellsPrec: encodeTypedArray(world.cellsPrec, "u8"),
      cellsFlow: encodeTypedArray(world.cellsFlow, "u32"),
      cellsRiver: encodeTypedArray(world.cellsRiver, "u32"),
      cellsBiome: encodeTypedArray(world.cellsBiome, "u8"),
      cellsWaterbody: encodeTypedArray(world.cellsWaterbody, "u32"),
      waterbodyType: encodeTypedArray(world.waterbodyType, "u8"),
      waterbodyGroup: encodeTypedArray(world.waterbodyGroup, "u8"),
      waterbodySize: encodeTypedArray(world.waterbodySize, "u32"),
      gridToPack: encodeTypedArray(world.gridToPack, "i32"),
      packToGrid: encodeTypedArray(world.packToGrid, "u32"),
      packX: encodeTypedArray(world.packX, "f32"),
      packY: encodeTypedArray(world.packY, "f32"),
      packH: encodeTypedArray(world.packH, "u8"),
      packArea: encodeTypedArray(world.packArea, "f32"),
      packFlow: encodeTypedArray(world.packFlow, "u32"),
      packNeighborOffsets: encodeTypedArray(world.packNeighborOffsets, "u32"),
      packNeighbors: encodeTypedArray(world.packNeighbors, "u32"),
      packRiver: encodeTypedArray(world.packRiver, "u32"),
      packRiverCellOffsets: encodeTypedArray(world.packRiverCellOffsets, "u32"),
      packRiverCells: encodeTypedArray(world.packRiverCells, "i32"),
      packCellsFeatureId: encodeTypedArray(world.packCellsFeatureId, "u32"),
      packFeatureType: encodeTypedArray(world.packFeatureType, "u8"),
      packFeatureFeatureId: encodeTypedArray(world.packFeatureFeatureId, "u32"),
      packFeatureBorder: encodeTypedArray(world.packFeatureBorder, "u8"),
      packFeatureSize: encodeTypedArray(world.packFeatureSize, "u32"),
      packFeatureFirstCell: encodeTypedArray(world.packFeatureFirstCell, "u32"),
      packFeatureGroup: encodeTypedArray(world.packFeatureGroup, "u8"),
      packFeatureChainOffsets: encodeTypedArray(
        world.packFeatureChainOffsets,
        "u32",
      ),
      packFeatureVertexOffsets: encodeTypedArray(
        world.packFeatureVertexOffsets,
        "u32",
      ),
      packFeatureVertices: encodeTypedArray(world.packFeatureVertices, "u32"),
      packFeatureShorelineOffsets: encodeTypedArray(
        world.packFeatureShorelineOffsets,
        "u32",
      ),
      packFeatureShoreline: encodeTypedArray(world.packFeatureShoreline, "u32"),
      packCoast: encodeTypedArray(world.packCoast, "i8"),
      packHaven: encodeTypedArray(world.packHaven, "i32"),
      packHarbor: encodeTypedArray(world.packHarbor, "u8"),
      packVertexX: encodeTypedArray(world.packVertexX, "f32"),
      packVertexY: encodeTypedArray(world.packVertexY, "f32"),
      packCellVertexOffsets: encodeTypedArray(
        world.packCellVertexOffsets,
        "u32",
      ),
      packCellVertices: encodeTypedArray(world.packCellVertices, "u32"),
      vertexX: encodeTypedArray(world.vertexX, "f32"),
      vertexY: encodeTypedArray(world.vertexY, "f32"),
      cellVertexOffsets: encodeTypedArray(world.cellVertexOffsets, "u32"),
      cellVertices: encodeTypedArray(world.cellVertices, "u32"),
      cellNeighborOffsets: encodeTypedArray(world.cellNeighborOffsets, "u32"),
      cellNeighbors: encodeTypedArray(world.cellNeighbors, "u32"),
    },
  };

  return JSON.stringify(serialized);
};

const assertSerializedWorld = (value: unknown): SerializedWorldV1 => {
  if (value === null || typeof value !== "object") {
    throw new Error("serialized world must be an object");
  }

  const world = value as Partial<SerializedWorldV1>;
  if (world.schemaVersion !== 1) {
    throw new Error("unsupported schemaVersion");
  }

  if (!world.arrays) {
    throw new Error("serialized world is missing arrays");
  }

  if (typeof world.waterbodyCount !== "number") {
    throw new Error("serialized world is missing waterbodyCount");
  }

  if (typeof world.cultureCount !== "number") {
    throw new Error("serialized world is missing cultureCount");
  }

  if (typeof world.burgCount !== "number") {
    throw new Error("serialized world is missing burgCount");
  }

  if (typeof world.stateCount !== "number") {
    throw new Error("serialized world is missing stateCount");
  }

  if (typeof world.routeCount !== "number") {
    throw new Error("serialized world is missing routeCount");
  }

  if (typeof world.provinceCount !== "number") {
    throw new Error("serialized world is missing provinceCount");
  }

  if (typeof world.religionCount !== "number") {
    throw new Error("serialized world is missing religionCount");
  }

  if (typeof world.militaryCount !== "number") {
    throw new Error("serialized world is missing militaryCount");
  }

  if (typeof world.markerCount !== "number") {
    throw new Error("serialized world is missing markerCount");
  }

  if (typeof world.zoneCount !== "number") {
    throw new Error("serialized world is missing zoneCount");
  }

  if (typeof world.featureCount !== "number") {
    throw new Error("serialized world is missing featureCount");
  }

  if (typeof world.landmassCount !== "number") {
    throw new Error("serialized world is missing landmassCount");
  }

  if (typeof world.packCellCount !== "number") {
    throw new Error("serialized world is missing packCellCount");
  }

  if (typeof world.packFeatureCount !== "number") {
    throw new Error("serialized world is missing packFeatureCount");
  }

  return world as SerializedWorldV1;
};

const deserializeV1: WorldDeserializer = (value: unknown): WorldGraphV1 => {
  const world = assertSerializedWorld(value);

  const cellsX = decodeTypedArray(world.arrays.cellsX);
  const cellsY = decodeTypedArray(world.arrays.cellsY);
  const cellsBorder = decodeTypedArray(world.arrays.cellsBorder);
  const cellsArea = decodeTypedArray(world.arrays.cellsArea);
  const cellsH = decodeTypedArray(world.arrays.cellsH);
  const cellsCulture = decodeTypedArray(world.arrays.cellsCulture);
  const cultureSeedCell = decodeTypedArray(world.arrays.cultureSeedCell);
  const cultureSize = decodeTypedArray(world.arrays.cultureSize);
  const cellsBurg = decodeTypedArray(world.arrays.cellsBurg);
  const burgCell = decodeTypedArray(world.arrays.burgCell);
  const burgX = decodeTypedArray(world.arrays.burgX);
  const burgY = decodeTypedArray(world.arrays.burgY);
  const burgPopulation = decodeTypedArray(world.arrays.burgPopulation);
  const burgCapital = decodeTypedArray(world.arrays.burgCapital);
  const burgPort = decodeTypedArray(world.arrays.burgPort);
  const burgCulture = decodeTypedArray(world.arrays.burgCulture);
  const cellsState = decodeTypedArray(world.arrays.cellsState);
  const stateCenterBurg = decodeTypedArray(world.arrays.stateCenterBurg);
  const stateCulture = decodeTypedArray(world.arrays.stateCulture);
  const stateForm = decodeTypedArray(world.arrays.stateForm);
  const stateCells = decodeTypedArray(world.arrays.stateCells);
  const routeFromState = decodeTypedArray(world.arrays.routeFromState);
  const routeToState = decodeTypedArray(world.arrays.routeToState);
  const routeKind = decodeTypedArray(world.arrays.routeKind);
  const routeWeight = decodeTypedArray(world.arrays.routeWeight);
  const cellRouteOffsets = decodeTypedArray(world.arrays.cellRouteOffsets);
  const cellRouteNeighbors = decodeTypedArray(world.arrays.cellRouteNeighbors);
  const cellRouteKinds = decodeTypedArray(world.arrays.cellRouteKinds);
  const cellsProvince = decodeTypedArray(world.arrays.cellsProvince);
  const provinceState = decodeTypedArray(world.arrays.provinceState);
  const provinceCenterCell = decodeTypedArray(world.arrays.provinceCenterCell);
  const provinceCells = decodeTypedArray(world.arrays.provinceCells);
  const cellsReligion = decodeTypedArray(world.arrays.cellsReligion);
  const religionSeedCell = decodeTypedArray(world.arrays.religionSeedCell);
  const religionType = decodeTypedArray(world.arrays.religionType);
  const religionSize = decodeTypedArray(world.arrays.religionSize);
  const cellsMilitary = decodeTypedArray(world.arrays.cellsMilitary);
  const militaryCell = decodeTypedArray(world.arrays.militaryCell);
  const militaryState = decodeTypedArray(world.arrays.militaryState);
  const militaryType = decodeTypedArray(world.arrays.militaryType);
  const militaryStrength = decodeTypedArray(world.arrays.militaryStrength);
  const markerCell = decodeTypedArray(world.arrays.markerCell);
  const markerType = decodeTypedArray(world.arrays.markerType);
  const markerStrength = decodeTypedArray(world.arrays.markerStrength);
  const cellsZone = decodeTypedArray(world.arrays.cellsZone);
  const zoneSeedCell = decodeTypedArray(world.arrays.zoneSeedCell);
  const zoneType = decodeTypedArray(world.arrays.zoneType);
  const zoneCells = decodeTypedArray(world.arrays.zoneCells);
  const cellsFeature = decodeTypedArray(world.arrays.cellsFeature);
  const cellsFeatureId = decodeTypedArray(world.arrays.cellsFeatureId);
  const featureType = decodeTypedArray(world.arrays.featureType);
  const featureGroup = world.arrays.featureGroup
    ? decodeTypedArray(world.arrays.featureGroup)
    : new Uint8Array(world.featureCount + 1);
  const featureLand = decodeTypedArray(world.arrays.featureLand);
  const featureBorder = decodeTypedArray(world.arrays.featureBorder);
  const featureSize = decodeTypedArray(world.arrays.featureSize);
  const featureFirstCell = decodeTypedArray(world.arrays.featureFirstCell);
  const cellsCoast = decodeTypedArray(world.arrays.cellsCoast);
  const cellsLandmass = decodeTypedArray(world.arrays.cellsLandmass);
  const landmassKind = decodeTypedArray(world.arrays.landmassKind);
  const landmassSize = decodeTypedArray(world.arrays.landmassSize);
  const landmassBorder = decodeTypedArray(world.arrays.landmassBorder);
  const cellsTemp = decodeTypedArray(world.arrays.cellsTemp);
  const cellsPrec = decodeTypedArray(world.arrays.cellsPrec);
  const cellsFlow = decodeTypedArray(world.arrays.cellsFlow);
  const cellsRiver = decodeTypedArray(world.arrays.cellsRiver);
  const cellsBiome = decodeTypedArray(world.arrays.cellsBiome);
  const cellsWaterbody = decodeTypedArray(world.arrays.cellsWaterbody);
  const waterbodyType = decodeTypedArray(world.arrays.waterbodyType);
  const waterbodyGroup = world.arrays.waterbodyGroup
    ? decodeTypedArray(world.arrays.waterbodyGroup)
    : new Uint8Array(world.waterbodyCount + 1);
  const waterbodySize = decodeTypedArray(world.arrays.waterbodySize);
  const gridToPack = decodeTypedArray(world.arrays.gridToPack);
  const packToGrid = decodeTypedArray(world.arrays.packToGrid);
  const packX = decodeTypedArray(world.arrays.packX);
  const packY = decodeTypedArray(world.arrays.packY);
  const packH = decodeTypedArray(world.arrays.packH);
  const packArea = decodeTypedArray(world.arrays.packArea);
  const packFlow = world.arrays.packFlow
    ? decodeTypedArray(world.arrays.packFlow)
    : new Uint32Array(world.packCellCount);
  const packNeighborOffsets = decodeTypedArray(
    world.arrays.packNeighborOffsets,
  );
  const packNeighbors = decodeTypedArray(world.arrays.packNeighbors);
  const packRiver = world.arrays.packRiver
    ? decodeTypedArray(world.arrays.packRiver)
    : new Uint32Array(world.packCellCount);
  const packRiverCellOffsets = world.arrays.packRiverCellOffsets
    ? decodeTypedArray(world.arrays.packRiverCellOffsets)
    : new Uint32Array(1);
  const packRiverCells = world.arrays.packRiverCells
    ? decodeTypedArray(world.arrays.packRiverCells)
    : new Int32Array(0);
  const packCellsFeatureId = decodeTypedArray(world.arrays.packCellsFeatureId);
  const packFeatureType = decodeTypedArray(world.arrays.packFeatureType);
  const packFeatureFeatureId = world.arrays.packFeatureFeatureId
    ? decodeTypedArray(world.arrays.packFeatureFeatureId)
    : new Uint32Array(world.packFeatureCount + 1);
  const packFeatureBorder = decodeTypedArray(world.arrays.packFeatureBorder);
  const packFeatureSize = decodeTypedArray(world.arrays.packFeatureSize);
  const packFeatureFirstCell = decodeTypedArray(
    world.arrays.packFeatureFirstCell,
  );
  const packFeatureGroup = decodeTypedArray(world.arrays.packFeatureGroup);
  const packFeatureChainOffsets = decodeTypedArray(
    world.arrays.packFeatureChainOffsets,
  );
  const packFeatureVertexOffsets = decodeTypedArray(
    world.arrays.packFeatureVertexOffsets,
  );
  const packFeatureVertices = decodeTypedArray(
    world.arrays.packFeatureVertices,
  );
  const packFeatureShorelineOffsets = decodeTypedArray(
    world.arrays.packFeatureShorelineOffsets,
  );
  const packFeatureShoreline = decodeTypedArray(
    world.arrays.packFeatureShoreline,
  );
  const packCoast = decodeTypedArray(world.arrays.packCoast);
  const packHaven = decodeTypedArray(world.arrays.packHaven);
  const packHarbor = decodeTypedArray(world.arrays.packHarbor);
  const packVertexX = decodeTypedArray(world.arrays.packVertexX);
  const packVertexY = decodeTypedArray(world.arrays.packVertexY);
  const packCellVertexOffsets = decodeTypedArray(
    world.arrays.packCellVertexOffsets,
  );
  const packCellVertices = decodeTypedArray(world.arrays.packCellVertices);
  const vertexX = decodeTypedArray(world.arrays.vertexX);
  const vertexY = decodeTypedArray(world.arrays.vertexY);
  const cellVertexOffsets = decodeTypedArray(world.arrays.cellVertexOffsets);
  const cellVertices = decodeTypedArray(world.arrays.cellVertices);
  const cellNeighborOffsets = decodeTypedArray(
    world.arrays.cellNeighborOffsets,
  );
  const cellNeighbors = decodeTypedArray(world.arrays.cellNeighbors);

  if (
    !(cellsX instanceof Float32Array) ||
    !(cellsY instanceof Float32Array) ||
    !(cellsBorder instanceof Uint8Array) ||
    !(cellsArea instanceof Float32Array) ||
    !(cellsH instanceof Uint8Array) ||
    !(cellsCulture instanceof Uint16Array) ||
    !(cultureSeedCell instanceof Uint32Array) ||
    !(cultureSize instanceof Uint32Array) ||
    !(cellsBurg instanceof Uint16Array) ||
    !(burgCell instanceof Uint32Array) ||
    !(burgX instanceof Float32Array) ||
    !(burgY instanceof Float32Array) ||
    !(burgPopulation instanceof Uint16Array) ||
    !(burgCapital instanceof Uint8Array) ||
    !(burgPort instanceof Uint8Array) ||
    !(burgCulture instanceof Uint16Array) ||
    !(cellsState instanceof Uint16Array) ||
    !(stateCenterBurg instanceof Uint16Array) ||
    !(stateCulture instanceof Uint16Array) ||
    !(stateForm instanceof Uint8Array) ||
    !(stateCells instanceof Uint32Array) ||
    !(routeFromState instanceof Uint16Array) ||
    !(routeToState instanceof Uint16Array) ||
    !(routeKind instanceof Uint8Array) ||
    !(routeWeight instanceof Uint16Array) ||
    !(cellRouteOffsets instanceof Uint32Array) ||
    !(cellRouteNeighbors instanceof Uint32Array) ||
    !(cellRouteKinds instanceof Uint8Array) ||
    !(cellsProvince instanceof Uint16Array) ||
    !(provinceState instanceof Uint16Array) ||
    !(provinceCenterCell instanceof Uint32Array) ||
    !(provinceCells instanceof Uint32Array) ||
    !(cellsReligion instanceof Uint16Array) ||
    !(religionSeedCell instanceof Uint32Array) ||
    !(religionType instanceof Uint8Array) ||
    !(religionSize instanceof Uint32Array) ||
    !(cellsMilitary instanceof Uint16Array) ||
    !(militaryCell instanceof Uint32Array) ||
    !(militaryState instanceof Uint16Array) ||
    !(militaryType instanceof Uint8Array) ||
    !(militaryStrength instanceof Uint16Array) ||
    !(markerCell instanceof Uint32Array) ||
    !(markerType instanceof Uint8Array) ||
    !(markerStrength instanceof Uint8Array) ||
    !(cellsZone instanceof Uint16Array) ||
    !(zoneSeedCell instanceof Uint32Array) ||
    !(zoneType instanceof Uint8Array) ||
    !(zoneCells instanceof Uint32Array) ||
    !(cellsFeature instanceof Uint8Array) ||
    !(cellsFeatureId instanceof Uint32Array) ||
    !(featureType instanceof Uint8Array) ||
    !(featureGroup instanceof Uint8Array) ||
    !(featureLand instanceof Uint8Array) ||
    !(featureBorder instanceof Uint8Array) ||
    !(featureSize instanceof Uint32Array) ||
    !(featureFirstCell instanceof Uint32Array) ||
    !(cellsCoast instanceof Int8Array) ||
    !(cellsLandmass instanceof Uint32Array) ||
    !(landmassKind instanceof Uint8Array) ||
    !(landmassSize instanceof Uint32Array) ||
    !(landmassBorder instanceof Uint8Array) ||
    !(cellsTemp instanceof Int8Array) ||
    !(cellsPrec instanceof Uint8Array) ||
    !(cellsFlow instanceof Uint32Array) ||
    !(cellsRiver instanceof Uint32Array) ||
    !(cellsBiome instanceof Uint8Array) ||
    !(cellsWaterbody instanceof Uint32Array) ||
    !(waterbodyType instanceof Uint8Array) ||
    !(waterbodyGroup instanceof Uint8Array) ||
    !(waterbodySize instanceof Uint32Array) ||
    !(gridToPack instanceof Int32Array) ||
    !(packToGrid instanceof Uint32Array) ||
    !(packX instanceof Float32Array) ||
    !(packY instanceof Float32Array) ||
    !(packH instanceof Uint8Array) ||
    !(packArea instanceof Float32Array) ||
    !(packFlow instanceof Uint32Array) ||
    !(packNeighborOffsets instanceof Uint32Array) ||
    !(packNeighbors instanceof Uint32Array) ||
    !(packRiver instanceof Uint32Array) ||
    !(packRiverCellOffsets instanceof Uint32Array) ||
    !(packRiverCells instanceof Int32Array) ||
    !(packCellsFeatureId instanceof Uint32Array) ||
    !(packFeatureType instanceof Uint8Array) ||
    !(packFeatureFeatureId instanceof Uint32Array) ||
    !(packFeatureBorder instanceof Uint8Array) ||
    !(packFeatureSize instanceof Uint32Array) ||
    !(packFeatureFirstCell instanceof Uint32Array) ||
    !(packFeatureGroup instanceof Uint8Array) ||
    !(packFeatureChainOffsets instanceof Uint32Array) ||
    !(packFeatureVertexOffsets instanceof Uint32Array) ||
    !(packFeatureVertices instanceof Uint32Array) ||
    !(packFeatureShorelineOffsets instanceof Uint32Array) ||
    !(packFeatureShoreline instanceof Uint32Array) ||
    !(packCoast instanceof Int8Array) ||
    !(packHaven instanceof Int32Array) ||
    !(packHarbor instanceof Uint8Array) ||
    !(packVertexX instanceof Float32Array) ||
    !(packVertexY instanceof Float32Array) ||
    !(packCellVertexOffsets instanceof Uint32Array) ||
    !(packCellVertices instanceof Uint32Array) ||
    !(vertexX instanceof Float32Array) ||
    !(vertexY instanceof Float32Array) ||
    !(cellVertexOffsets instanceof Uint32Array) ||
    !(cellVertices instanceof Uint32Array) ||
    !(cellNeighborOffsets instanceof Uint32Array) ||
    !(cellNeighbors instanceof Uint32Array)
  ) {
    throw new Error("serialized arrays have invalid formats");
  }

  return {
    schemaVersion: 1,
    seed: world.seed,
    width: world.width,
    height: world.height,
    requestedCells: world.requestedCells,
    cellCount: world.cellCount,
    gridSpacing: world.gridSpacing,
    gridCellsX: world.gridCellsX,
    gridCellsY: world.gridCellsY,
    cultureCount: world.cultureCount,
    cellsX,
    cellsY,
    cellsBorder,
    cellsArea,
    cellsH,
    cellsCulture,
    cultureSeedCell,
    cultureSize,
    cellsBurg,
    burgCount: world.burgCount,
    burgCell,
    burgX,
    burgY,
    burgPopulation,
    burgCapital,
    burgPort,
    burgCulture,
    cellsState,
    stateCount: world.stateCount,
    stateCenterBurg,
    stateCulture,
    stateForm,
    stateCells,
    routeCount: world.routeCount,
    routeFromState,
    routeToState,
    routeKind,
    routeWeight,
    cellRouteOffsets,
    cellRouteNeighbors,
    cellRouteKinds,
    cellsProvince,
    provinceCount: world.provinceCount,
    provinceState,
    provinceCenterCell,
    provinceCells,
    cellsReligion,
    religionCount: world.religionCount,
    religionSeedCell,
    religionType,
    religionSize,
    cellsMilitary,
    militaryCount: world.militaryCount,
    militaryCell,
    militaryState,
    militaryType,
    militaryStrength,
    markerCount: world.markerCount,
    markerCell,
    markerType,
    markerStrength,
    cellsZone,
    zoneCount: world.zoneCount,
    zoneSeedCell,
    zoneType,
    zoneCells,
    cellsFeature,
    cellsFeatureId,
    featureCount: world.featureCount,
    featureType,
    featureGroup,
    featureLand,
    featureBorder,
    featureSize,
    featureFirstCell,
    cellsCoast,
    cellsLandmass,
    landmassCount: world.landmassCount,
    landmassKind,
    landmassSize,
    landmassBorder,
    cellsTemp,
    cellsPrec,
    cellsFlow,
    cellsRiver,
    cellsBiome,
    cellsWaterbody,
    waterbodyCount: world.waterbodyCount,
    waterbodyType,
    waterbodyGroup,
    waterbodySize,
    packCellCount: world.packCellCount,
    gridToPack,
    packToGrid,
    packX,
    packY,
    packH,
    packArea,
    packFlow,
    packNeighborOffsets,
    packNeighbors,
    packRiver,
    packRiverCellOffsets,
    packRiverCells,
    packCellsFeatureId,
    packFeatureCount: world.packFeatureCount,
    packFeatureType,
    packFeatureFeatureId,
    packFeatureBorder,
    packFeatureSize,
    packFeatureFirstCell,
    packFeatureGroup,
    packFeatureChainOffsets,
    packFeatureVertexOffsets,
    packFeatureVertices,
    packFeatureShorelineOffsets,
    packFeatureShoreline,
    packCoast,
    packHaven,
    packHarbor,
    packVertexX,
    packVertexY,
    packCellVertexOffsets,
    packCellVertices,
    vertexX,
    vertexY,
    cellVertexOffsets,
    cellVertices,
    cellNeighborOffsets,
    cellNeighbors,
  };
};

const DESERIALIZERS: Record<number, WorldDeserializer> = {
  1: deserializeV1,
};

export const deserializeWorld = (serialized: string): WorldGraphV1 => {
  const parsed = JSON.parse(serialized) as {
    schemaVersion?: number;
  };

  const schemaVersion = parsed.schemaVersion;
  if (typeof schemaVersion !== "number") {
    throw new Error("serialized world is missing schemaVersion");
  }

  const deserialize = DESERIALIZERS[schemaVersion];
  if (!deserialize) {
    throw new Error("unsupported schemaVersion");
  }

  return deserialize(parsed);
};
