import { describe, expect, test } from "bun:test";
import { type GenerationConfig, generateWorld } from "../src/index";

type Fixture = {
  name: string;
  config: GenerationConfig;
  expected: {
    cellCount: number;
    gridCellsX: number;
    gridCellsY: number;
    hashCellsX: number;
    hashCellsY: number;
    hashCellsBorder: number;
    hashCellsArea: number;
    hashCellsH: number;
    hashCellsCulture: number;
    cultureCount: number;
    hashCultureSeedCell: number;
    hashCultureSize: number;
    hashCellsBurg: number;
    burgCount: number;
    hashBurgCell: number;
    hashBurgPopulation: number;
    hashBurgPort: number;
    hashBurgCulture: number;
    hashCellsState: number;
    stateCount: number;
    hashStateCenterBurg: number;
    hashStateCulture: number;
    hashStateForm: number;
    hashStateCells: number;
    routeCount: number;
    hashRouteFromState: number;
    hashRouteToState: number;
    hashRouteKind: number;
    hashRouteWeight: number;
    hashCellsProvince: number;
    provinceCount: number;
    hashProvinceState: number;
    hashProvinceCenterCell: number;
    hashProvinceCells: number;
    hashCellsReligion: number;
    religionCount: number;
    hashReligionSeedCell: number;
    hashReligionType: number;
    hashReligionSize: number;
    hashCellsMilitary: number;
    militaryCount: number;
    hashMilitaryCell: number;
    hashMilitaryState: number;
    hashMilitaryType: number;
    hashMilitaryStrength: number;
    markerCount: number;
    hashMarkerCell: number;
    hashMarkerType: number;
    hashMarkerStrength: number;
    hashCellsZone: number;
    zoneCount: number;
    hashZoneSeedCell: number;
    hashZoneType: number;
    hashZoneCells: number;
    hashCellsFeature: number;
    hashCellsFeatureId: number;
    featureCount: number;
    hashFeatureType: number;
    hashFeatureLand: number;
    hashFeatureBorder: number;
    hashFeatureSize: number;
    hashFeatureFirstCell: number;
    hashCellsCoast: number;
    hashCellsLandmass: number;
    landmassCount: number;
    hashLandmassKind: number;
    hashLandmassSize: number;
    hashLandmassBorder: number;
    hashCellsTemp: number;
    hashCellsPrec: number;
    hashCellsFlow: number;
    hashCellsRiver: number;
    hashCellsBiome: number;
    hashCellsWaterbody: number;
    waterbodyCount: number;
    hashWaterbodyType: number;
    hashWaterbodySize: number;
    packCellCount: number;
    hashGridToPack: number;
    hashPackToGrid: number;
    hashPackX: number;
    hashPackY: number;
    hashPackH: number;
    hashPackArea: number;
    hashPackNeighborOffsets: number;
    hashPackNeighbors: number;
    hashPackCellsFeatureId: number;
    packFeatureCount: number;
    hashPackFeatureType: number;
    hashPackFeatureBorder: number;
    hashPackFeatureSize: number;
    hashPackFeatureFirstCell: number;
    hashPackCoast: number;
    hashPackHaven: number;
    hashPackHarbor: number;
    hashVertexX: number;
    hashVertexY: number;
    hashCellVertexOffsets: number;
    hashCellVertices: number;
    hashOffsets: number;
    hashNeighbors: number;
    meanHeight: number;
    meanTemp: number;
    meanPrec: number;
    landRatio: number;
  };
};

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

const fnv1a = (bytes: Uint8Array): number => {
  let hash = FNV_OFFSET;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};

const bytesOf = (
  view:
    | Float32Array
    | Uint8Array
    | Uint16Array
    | Int8Array
    | Int32Array
    | Uint32Array,
): Uint8Array => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

const summarize = (world: ReturnType<typeof generateWorld>) => {
  let sumHeight = 0;
  let sumTemp = 0;
  let sumPrec = 0;
  let land = 0;

  for (let index = 0; index < world.cellCount; index += 1) {
    const height = world.cellsH[index] ?? 0;
    const temperature = world.cellsTemp[index] ?? 0;
    const precipitation = world.cellsPrec[index] ?? 0;
    const feature = world.cellsFeature[index] ?? 0;

    sumHeight += height;
    sumTemp += temperature;
    sumPrec += precipitation;

    if (feature === 1) {
      land += 1;
    }
  }

  return {
    meanHeight: sumHeight / world.cellCount,
    meanTemp: sumTemp / world.cellCount,
    meanPrec: sumPrec / world.cellCount,
    landRatio: land / world.cellCount,
  };
};

const fixtures: Fixture[] = [
  {
    name: "alpha",
    config: {
      seed: "fixture-alpha",
      width: 900,
      height: 600,
      cells: 6000,
    },
    expected: {
      cellCount: 5985,
      gridCellsX: 95,
      gridCellsY: 63,
      hashCellsX: 4120159262,
      hashCellsY: 2268101168,
      hashCellsBorder: 3543253719,
      hashCellsArea: 1726810507,
      hashCellsH: 4038231510,
      hashCellsCulture: 1148055245,
      cultureCount: 0,
      hashCultureSeedCell: 1268118805,
      hashCultureSize: 1268118805,
      hashCellsBurg: 1148055245,
      burgCount: 0,
      hashBurgCell: 1268118805,
      hashBurgPopulation: 292984781,
      hashBurgPort: 84696351,
      hashBurgCulture: 292984781,
      hashCellsState: 1148055245,
      stateCount: 0,
      hashStateCenterBurg: 292984781,
      hashStateCulture: 292984781,
      hashStateForm: 84696351,
      hashStateCells: 1268118805,
      routeCount: 0,
      hashRouteFromState: 292984781,
      hashRouteToState: 292984781,
      hashRouteKind: 84696351,
      hashRouteWeight: 292984781,
      hashCellsProvince: 1148055245,
      provinceCount: 0,
      hashProvinceState: 292984781,
      hashProvinceCenterCell: 1268118805,
      hashProvinceCells: 1268118805,
      hashCellsReligion: 1148055245,
      religionCount: 0,
      hashReligionSeedCell: 1268118805,
      hashReligionType: 84696351,
      hashReligionSize: 1268118805,
      hashCellsMilitary: 1148055245,
      militaryCount: 0,
      hashMilitaryCell: 1268118805,
      hashMilitaryState: 292984781,
      hashMilitaryType: 84696351,
      hashMilitaryStrength: 292984781,
      markerCount: 0,
      hashMarkerCell: 1268118805,
      hashMarkerType: 84696351,
      hashMarkerStrength: 84696351,
      hashCellsZone: 1148055245,
      zoneCount: 0,
      hashZoneSeedCell: 1268118805,
      hashZoneType: 84696351,
      hashZoneCells: 1268118805,
      hashCellsFeature: 2056039851,
      hashCellsFeatureId: 2731163199,
      featureCount: 251,
      hashFeatureType: 1884840341,
      hashFeatureLand: 350883558,
      hashFeatureBorder: 1366036011,
      hashFeatureSize: 1250626472,
      hashFeatureFirstCell: 1763059643,
      hashCellsCoast: 1861042417,
      hashCellsLandmass: 628115660,
      landmassCount: 141,
      hashLandmassKind: 1630840890,
      hashLandmassSize: 239670690,
      hashLandmassBorder: 839592396,
      hashCellsTemp: 4212390678,
      hashCellsPrec: 2484027936,
      hashCellsFlow: 1279585811,
      hashCellsRiver: 251034153,
      hashCellsBiome: 2425880526,
      hashCellsWaterbody: 1204601646,
      waterbodyCount: 110,
      hashWaterbodyType: 2862031456,
      hashWaterbodySize: 2350969387,
      packCellCount: 3702,
      hashGridToPack: 3007280028,
      hashPackToGrid: 790598808,
      hashPackX: 1904421144,
      hashPackY: 1079429310,
      hashPackH: 1480501701,
      hashPackArea: 641625677,
      hashPackNeighborOffsets: 694130846,
      hashPackNeighbors: 2420954058,
      hashPackCellsFeatureId: 2815383660,
      packFeatureCount: 141,
      hashPackFeatureType: 2843026344,
      hashPackFeatureBorder: 839592396,
      hashPackFeatureSize: 239670690,
      hashPackFeatureFirstCell: 2822969297,
      hashPackCoast: 1064248155,
      hashPackHaven: 1559539427,
      hashPackHarbor: 3745641182,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 27.557727652464493,
      meanTemp: 2.235421888053467,
      meanPrec: 173.72848788638262,
      landRatio: 0.618546365914787,
    },
  },
  {
    name: "beta",
    config: {
      seed: "fixture-beta",
      width: 1400,
      height: 900,
      cells: 15000,
      jitter: 0.5,
      heightNoise: 0.6,
      seaLevel: 25,
    },
    expected: {
      cellCount: 14994,
      gridCellsX: 153,
      gridCellsY: 98,
      hashCellsX: 2091151760,
      hashCellsY: 2624837818,
      hashCellsBorder: 92233319,
      hashCellsArea: 2713315639,
      hashCellsH: 2433227558,
      hashCellsCulture: 964503445,
      cultureCount: 0,
      hashCultureSeedCell: 1268118805,
      hashCultureSize: 1268118805,
      hashCellsBurg: 964503445,
      burgCount: 0,
      hashBurgCell: 1268118805,
      hashBurgPopulation: 292984781,
      hashBurgPort: 84696351,
      hashBurgCulture: 292984781,
      hashCellsState: 964503445,
      stateCount: 0,
      hashStateCenterBurg: 292984781,
      hashStateCulture: 292984781,
      hashStateForm: 84696351,
      hashStateCells: 1268118805,
      routeCount: 0,
      hashRouteFromState: 292984781,
      hashRouteToState: 292984781,
      hashRouteKind: 84696351,
      hashRouteWeight: 292984781,
      hashCellsProvince: 964503445,
      provinceCount: 0,
      hashProvinceState: 292984781,
      hashProvinceCenterCell: 1268118805,
      hashProvinceCells: 1268118805,
      hashCellsReligion: 964503445,
      religionCount: 0,
      hashReligionSeedCell: 1268118805,
      hashReligionType: 84696351,
      hashReligionSize: 1268118805,
      hashCellsMilitary: 964503445,
      militaryCount: 0,
      hashMilitaryCell: 1268118805,
      hashMilitaryState: 292984781,
      hashMilitaryType: 84696351,
      hashMilitaryStrength: 292984781,
      markerCount: 0,
      hashMarkerCell: 1268118805,
      hashMarkerType: 84696351,
      hashMarkerStrength: 84696351,
      hashCellsZone: 964503445,
      zoneCount: 0,
      hashZoneSeedCell: 1268118805,
      hashZoneType: 84696351,
      hashZoneCells: 1268118805,
      hashCellsFeature: 1233283482,
      hashCellsFeatureId: 1823166951,
      featureCount: 961,
      hashFeatureType: 1487771233,
      hashFeatureLand: 3372202876,
      hashFeatureBorder: 4169311632,
      hashFeatureSize: 1686323872,
      hashFeatureFirstCell: 1159090144,
      hashCellsCoast: 1152601057,
      hashCellsLandmass: 2571404556,
      landmassCount: 527,
      hashLandmassKind: 2962327825,
      hashLandmassSize: 4197153574,
      hashLandmassBorder: 321141101,
      hashCellsTemp: 2444483001,
      hashCellsPrec: 3689738850,
      hashCellsFlow: 3753398001,
      hashCellsRiver: 2686763490,
      hashCellsBiome: 2759845257,
      hashCellsWaterbody: 957403484,
      waterbodyCount: 434,
      hashWaterbodyType: 1944441558,
      hashWaterbodySize: 4035693043,
      packCellCount: 8077,
      hashGridToPack: 1453633916,
      hashPackToGrid: 1275762053,
      hashPackX: 4201961160,
      hashPackY: 3559892585,
      hashPackH: 2497790706,
      hashPackArea: 292089691,
      hashPackNeighborOffsets: 377879681,
      hashPackNeighbors: 670263889,
      hashPackCellsFeatureId: 3392844732,
      packFeatureCount: 527,
      hashPackFeatureType: 3465454390,
      hashPackFeatureBorder: 321141101,
      hashPackFeatureSize: 4197153574,
      hashPackFeatureFirstCell: 4031657551,
      hashPackCoast: 1308887037,
      hashPackHaven: 2117476942,
      hashPackHarbor: 1135311807,
      hashVertexX: 1955023207,
      hashVertexY: 1367661068,
      hashCellVertexOffsets: 2304713312,
      hashCellVertices: 894105692,
      hashOffsets: 2753894046,
      hashNeighbors: 3902155913,
      meanHeight: 28.572295584900626,
      meanTemp: 2.2176870748299318,
      meanPrec: 172.67006802721087,
      landRatio: 0.5386821395224757,
    },
  },
  {
    name: "alpha-cultures",
    config: {
      seed: "fixture-alpha",
      width: 900,
      height: 600,
      cells: 6000,
      layers: {
        physical: true,
        cultures: true,
      },
      culturesCount: 10,
    },
    expected: {
      cellCount: 5985,
      gridCellsX: 95,
      gridCellsY: 63,
      hashCellsX: 4120159262,
      hashCellsY: 2268101168,
      hashCellsBorder: 3543253719,
      hashCellsArea: 1726810507,
      hashCellsH: 4038231510,
      hashCellsCulture: 1575762248,
      cultureCount: 10,
      hashCultureSeedCell: 1778830445,
      hashCultureSize: 2745300931,
      hashCellsBurg: 1148055245,
      burgCount: 0,
      hashBurgCell: 1268118805,
      hashBurgPopulation: 292984781,
      hashBurgPort: 84696351,
      hashBurgCulture: 292984781,
      hashCellsState: 1148055245,
      stateCount: 0,
      hashStateCenterBurg: 292984781,
      hashStateCulture: 292984781,
      hashStateForm: 84696351,
      hashStateCells: 1268118805,
      routeCount: 0,
      hashRouteFromState: 292984781,
      hashRouteToState: 292984781,
      hashRouteKind: 84696351,
      hashRouteWeight: 292984781,
      hashCellsProvince: 1148055245,
      provinceCount: 0,
      hashProvinceState: 292984781,
      hashProvinceCenterCell: 1268118805,
      hashProvinceCells: 1268118805,
      hashCellsReligion: 1148055245,
      religionCount: 0,
      hashReligionSeedCell: 1268118805,
      hashReligionType: 84696351,
      hashReligionSize: 1268118805,
      hashCellsMilitary: 1148055245,
      militaryCount: 0,
      hashMilitaryCell: 1268118805,
      hashMilitaryState: 292984781,
      hashMilitaryType: 84696351,
      hashMilitaryStrength: 292984781,
      markerCount: 0,
      hashMarkerCell: 1268118805,
      hashMarkerType: 84696351,
      hashMarkerStrength: 84696351,
      hashCellsZone: 1148055245,
      zoneCount: 0,
      hashZoneSeedCell: 1268118805,
      hashZoneType: 84696351,
      hashZoneCells: 1268118805,
      hashCellsFeature: 2056039851,
      hashCellsFeatureId: 2731163199,
      featureCount: 251,
      hashFeatureType: 1884840341,
      hashFeatureLand: 350883558,
      hashFeatureBorder: 1366036011,
      hashFeatureSize: 1250626472,
      hashFeatureFirstCell: 1763059643,
      hashCellsCoast: 1861042417,
      hashCellsLandmass: 628115660,
      landmassCount: 141,
      hashLandmassKind: 1630840890,
      hashLandmassSize: 239670690,
      hashLandmassBorder: 839592396,
      hashCellsTemp: 4212390678,
      hashCellsPrec: 2484027936,
      hashCellsFlow: 1279585811,
      hashCellsRiver: 251034153,
      hashCellsBiome: 2425880526,
      hashCellsWaterbody: 1204601646,
      waterbodyCount: 110,
      hashWaterbodyType: 2862031456,
      hashWaterbodySize: 2350969387,
      packCellCount: 3702,
      hashGridToPack: 3007280028,
      hashPackToGrid: 790598808,
      hashPackX: 1904421144,
      hashPackY: 1079429310,
      hashPackH: 1480501701,
      hashPackArea: 641625677,
      hashPackNeighborOffsets: 694130846,
      hashPackNeighbors: 2420954058,
      hashPackCellsFeatureId: 2815383660,
      packFeatureCount: 141,
      hashPackFeatureType: 2843026344,
      hashPackFeatureBorder: 839592396,
      hashPackFeatureSize: 239670690,
      hashPackFeatureFirstCell: 2822969297,
      hashPackCoast: 1064248155,
      hashPackHaven: 1559539427,
      hashPackHarbor: 3745641182,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 27.557727652464493,
      meanTemp: 2.235421888053467,
      meanPrec: 173.72848788638262,
      landRatio: 0.618546365914787,
    },
  },
  {
    name: "alpha-settlements",
    config: {
      seed: "fixture-alpha",
      width: 900,
      height: 600,
      cells: 6000,
      layers: {
        physical: true,
        settlements: true,
      },
    },
    expected: {
      cellCount: 5985,
      gridCellsX: 95,
      gridCellsY: 63,
      hashCellsX: 4120159262,
      hashCellsY: 2268101168,
      hashCellsBorder: 3543253719,
      hashCellsArea: 1726810507,
      hashCellsH: 4038231510,
      hashCellsCulture: 1148055245,
      cultureCount: 0,
      hashCultureSeedCell: 1268118805,
      hashCultureSize: 1268118805,
      hashCellsBurg: 1948172924,
      burgCount: 49,
      hashBurgCell: 731265683,
      hashBurgPopulation: 643710216,
      hashBurgPort: 4108640830,
      hashBurgCulture: 3846586517,
      hashCellsState: 1148055245,
      stateCount: 0,
      hashStateCenterBurg: 292984781,
      hashStateCulture: 292984781,
      hashStateForm: 84696351,
      hashStateCells: 1268118805,
      routeCount: 0,
      hashRouteFromState: 292984781,
      hashRouteToState: 292984781,
      hashRouteKind: 84696351,
      hashRouteWeight: 292984781,
      hashCellsProvince: 1148055245,
      provinceCount: 0,
      hashProvinceState: 292984781,
      hashProvinceCenterCell: 1268118805,
      hashProvinceCells: 1268118805,
      hashCellsReligion: 1148055245,
      religionCount: 0,
      hashReligionSeedCell: 1268118805,
      hashReligionType: 84696351,
      hashReligionSize: 1268118805,
      hashCellsMilitary: 1148055245,
      militaryCount: 0,
      hashMilitaryCell: 1268118805,
      hashMilitaryState: 292984781,
      hashMilitaryType: 84696351,
      hashMilitaryStrength: 292984781,
      markerCount: 0,
      hashMarkerCell: 1268118805,
      hashMarkerType: 84696351,
      hashMarkerStrength: 84696351,
      hashCellsZone: 1148055245,
      zoneCount: 0,
      hashZoneSeedCell: 1268118805,
      hashZoneType: 84696351,
      hashZoneCells: 1268118805,
      hashCellsFeature: 2056039851,
      hashCellsFeatureId: 2731163199,
      featureCount: 251,
      hashFeatureType: 1884840341,
      hashFeatureLand: 350883558,
      hashFeatureBorder: 1366036011,
      hashFeatureSize: 1250626472,
      hashFeatureFirstCell: 1763059643,
      hashCellsCoast: 1861042417,
      hashCellsLandmass: 628115660,
      landmassCount: 141,
      hashLandmassKind: 1630840890,
      hashLandmassSize: 239670690,
      hashLandmassBorder: 839592396,
      hashCellsTemp: 4212390678,
      hashCellsPrec: 2484027936,
      hashCellsFlow: 1279585811,
      hashCellsRiver: 251034153,
      hashCellsBiome: 2425880526,
      hashCellsWaterbody: 1204601646,
      waterbodyCount: 110,
      hashWaterbodyType: 2862031456,
      hashWaterbodySize: 2350969387,
      packCellCount: 3702,
      hashGridToPack: 3007280028,
      hashPackToGrid: 790598808,
      hashPackX: 1904421144,
      hashPackY: 1079429310,
      hashPackH: 1480501701,
      hashPackArea: 641625677,
      hashPackNeighborOffsets: 694130846,
      hashPackNeighbors: 2420954058,
      hashPackCellsFeatureId: 2815383660,
      packFeatureCount: 141,
      hashPackFeatureType: 2843026344,
      hashPackFeatureBorder: 839592396,
      hashPackFeatureSize: 239670690,
      hashPackFeatureFirstCell: 2822969297,
      hashPackCoast: 1064248155,
      hashPackHaven: 1559539427,
      hashPackHarbor: 3745641182,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 27.557727652464493,
      meanTemp: 2.235421888053467,
      meanPrec: 173.72848788638262,
      landRatio: 0.618546365914787,
    },
  },
  {
    name: "alpha-politics",
    config: {
      seed: "fixture-alpha",
      width: 900,
      height: 600,
      cells: 6000,
      layers: {
        physical: true,
        politics: true,
        cultures: true,
        religions: true,
      },
      culturesCount: 10,
    },
    expected: {
      cellCount: 5985,
      gridCellsX: 95,
      gridCellsY: 63,
      hashCellsX: 4120159262,
      hashCellsY: 2268101168,
      hashCellsBorder: 3543253719,
      hashCellsArea: 1726810507,
      hashCellsH: 4038231510,
      hashCellsCulture: 1575762248,
      cultureCount: 10,
      hashCultureSeedCell: 1778830445,
      hashCultureSize: 2745300931,
      hashCellsBurg: 1948172924,
      burgCount: 49,
      hashBurgCell: 731265683,
      hashBurgPopulation: 643710216,
      hashBurgPort: 4108640830,
      hashBurgCulture: 1829491064,
      hashCellsState: 3462865515,
      stateCount: 16,
      hashStateCenterBurg: 216285931,
      hashStateCulture: 3732891602,
      hashStateForm: 833218783,
      hashStateCells: 2500808511,
      routeCount: 30,
      hashRouteFromState: 3251756050,
      hashRouteToState: 2448917353,
      hashRouteKind: 527968845,
      hashRouteWeight: 3300651293,
      hashCellsProvince: 825674199,
      provinceCount: 22,
      hashProvinceState: 2062898408,
      hashProvinceCenterCell: 3046567264,
      hashProvinceCells: 591531635,
      hashCellsReligion: 2619554503,
      religionCount: 30,
      hashReligionSeedCell: 1733744736,
      hashReligionType: 2627316720,
      hashReligionSize: 2444508990,
      hashCellsMilitary: 1148055245,
      militaryCount: 0,
      hashMilitaryCell: 1268118805,
      hashMilitaryState: 292984781,
      hashMilitaryType: 84696351,
      hashMilitaryStrength: 292984781,
      markerCount: 0,
      hashMarkerCell: 1268118805,
      hashMarkerType: 84696351,
      hashMarkerStrength: 84696351,
      hashCellsZone: 1148055245,
      zoneCount: 0,
      hashZoneSeedCell: 1268118805,
      hashZoneType: 84696351,
      hashZoneCells: 1268118805,
      hashCellsFeature: 2056039851,
      hashCellsFeatureId: 2731163199,
      featureCount: 251,
      hashFeatureType: 1884840341,
      hashFeatureLand: 350883558,
      hashFeatureBorder: 1366036011,
      hashFeatureSize: 1250626472,
      hashFeatureFirstCell: 1763059643,
      hashCellsCoast: 1861042417,
      hashCellsLandmass: 628115660,
      landmassCount: 141,
      hashLandmassKind: 1630840890,
      hashLandmassSize: 239670690,
      hashLandmassBorder: 839592396,
      hashCellsTemp: 4212390678,
      hashCellsPrec: 2484027936,
      hashCellsFlow: 1279585811,
      hashCellsRiver: 251034153,
      hashCellsBiome: 2425880526,
      hashCellsWaterbody: 1204601646,
      waterbodyCount: 110,
      hashWaterbodyType: 2862031456,
      hashWaterbodySize: 2350969387,
      packCellCount: 3702,
      hashGridToPack: 3007280028,
      hashPackToGrid: 790598808,
      hashPackX: 1904421144,
      hashPackY: 1079429310,
      hashPackH: 1480501701,
      hashPackArea: 641625677,
      hashPackNeighborOffsets: 694130846,
      hashPackNeighbors: 2420954058,
      hashPackCellsFeatureId: 2815383660,
      packFeatureCount: 141,
      hashPackFeatureType: 2843026344,
      hashPackFeatureBorder: 839592396,
      hashPackFeatureSize: 239670690,
      hashPackFeatureFirstCell: 2822969297,
      hashPackCoast: 1064248155,
      hashPackHaven: 1559539427,
      hashPackHarbor: 3745641182,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 27.557727652464493,
      meanTemp: 2.235421888053467,
      meanPrec: 173.72848788638262,
      landRatio: 0.618546365914787,
    },
  },
  {
    name: "alpha-optional-systems",
    config: {
      seed: "fixture-alpha",
      width: 900,
      height: 600,
      cells: 6000,
      layers: {
        physical: true,
        cultures: true,
        politics: true,
        religions: true,
        military: true,
        markers: true,
        zones: true,
      },
      culturesCount: 10,
    },
    expected: {
      cellCount: 5985,
      gridCellsX: 95,
      gridCellsY: 63,
      hashCellsX: 4120159262,
      hashCellsY: 2268101168,
      hashCellsBorder: 3543253719,
      hashCellsArea: 1726810507,
      hashCellsH: 4038231510,
      hashCellsCulture: 1575762248,
      cultureCount: 10,
      hashCultureSeedCell: 1778830445,
      hashCultureSize: 2745300931,
      hashCellsBurg: 1948172924,
      burgCount: 49,
      hashBurgCell: 731265683,
      hashBurgPopulation: 643710216,
      hashBurgPort: 4108640830,
      hashBurgCulture: 1829491064,
      hashCellsState: 3462865515,
      stateCount: 16,
      hashStateCenterBurg: 216285931,
      hashStateCulture: 3732891602,
      hashStateForm: 833218783,
      hashStateCells: 2500808511,
      routeCount: 30,
      hashRouteFromState: 3251756050,
      hashRouteToState: 2448917353,
      hashRouteKind: 527968845,
      hashRouteWeight: 3300651293,
      hashCellsProvince: 825674199,
      provinceCount: 22,
      hashProvinceState: 2062898408,
      hashProvinceCenterCell: 3046567264,
      hashProvinceCells: 591531635,
      hashCellsReligion: 2619554503,
      religionCount: 30,
      hashReligionSeedCell: 1733744736,
      hashReligionType: 2627316720,
      hashReligionSize: 2444508990,
      hashCellsMilitary: 1268595510,
      militaryCount: 42,
      hashMilitaryCell: 389395670,
      hashMilitaryState: 791822349,
      hashMilitaryType: 791516192,
      hashMilitaryStrength: 310186776,
      markerCount: 41,
      hashMarkerCell: 1892335517,
      hashMarkerType: 892549865,
      hashMarkerStrength: 3722062394,
      hashCellsZone: 4051062341,
      zoneCount: 24,
      hashZoneSeedCell: 135972031,
      hashZoneType: 2074009093,
      hashZoneCells: 80743715,
      hashCellsFeature: 2056039851,
      hashCellsFeatureId: 2731163199,
      featureCount: 251,
      hashFeatureType: 1884840341,
      hashFeatureLand: 350883558,
      hashFeatureBorder: 1366036011,
      hashFeatureSize: 1250626472,
      hashFeatureFirstCell: 1763059643,
      hashCellsCoast: 1861042417,
      hashCellsLandmass: 628115660,
      landmassCount: 141,
      hashLandmassKind: 1630840890,
      hashLandmassSize: 239670690,
      hashLandmassBorder: 839592396,
      hashCellsTemp: 4212390678,
      hashCellsPrec: 2484027936,
      hashCellsFlow: 1279585811,
      hashCellsRiver: 251034153,
      hashCellsBiome: 2425880526,
      hashCellsWaterbody: 1204601646,
      waterbodyCount: 110,
      hashWaterbodyType: 2862031456,
      hashWaterbodySize: 2350969387,
      packCellCount: 3702,
      hashGridToPack: 3007280028,
      hashPackToGrid: 790598808,
      hashPackX: 1904421144,
      hashPackY: 1079429310,
      hashPackH: 1480501701,
      hashPackArea: 641625677,
      hashPackNeighborOffsets: 694130846,
      hashPackNeighbors: 2420954058,
      hashPackCellsFeatureId: 2815383660,
      packFeatureCount: 141,
      hashPackFeatureType: 2843026344,
      hashPackFeatureBorder: 839592396,
      hashPackFeatureSize: 239670690,
      hashPackFeatureFirstCell: 2822969297,
      hashPackCoast: 1064248155,
      hashPackHaven: 1559539427,
      hashPackHarbor: 3745641182,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 27.557727652464493,
      meanTemp: 2.235421888053467,
      meanPrec: 173.72848788638262,
      landRatio: 0.618546365914787,
    },
  },
];

describe("world fixture regressions", () => {
  for (const fixture of fixtures) {
    test(`matches locked fixture '${fixture.name}'`, () => {
      const world = generateWorld(fixture.config);
      const stats = summarize(world);

      expect(world.cellCount).toBe(fixture.expected.cellCount);
      expect(world.gridCellsX).toBe(fixture.expected.gridCellsX);
      expect(world.gridCellsY).toBe(fixture.expected.gridCellsY);

      expect(fnv1a(bytesOf(world.cellsX))).toBe(fixture.expected.hashCellsX);
      expect(fnv1a(bytesOf(world.cellsY))).toBe(fixture.expected.hashCellsY);
      expect(fnv1a(bytesOf(world.cellsBorder))).toBe(
        fixture.expected.hashCellsBorder,
      );
      expect(fnv1a(bytesOf(world.cellsArea))).toBe(
        fixture.expected.hashCellsArea,
      );
      expect(fnv1a(bytesOf(world.cellsH))).toBe(fixture.expected.hashCellsH);
      expect(fnv1a(bytesOf(world.cellsCulture))).toBe(
        fixture.expected.hashCellsCulture,
      );
      expect(world.cultureCount).toBe(fixture.expected.cultureCount);
      expect(fnv1a(bytesOf(world.cultureSeedCell))).toBe(
        fixture.expected.hashCultureSeedCell,
      );
      expect(fnv1a(bytesOf(world.cultureSize))).toBe(
        fixture.expected.hashCultureSize,
      );
      expect(fnv1a(bytesOf(world.cellsBurg))).toBe(
        fixture.expected.hashCellsBurg,
      );
      expect(world.burgCount).toBe(fixture.expected.burgCount);
      expect(fnv1a(bytesOf(world.burgCell))).toBe(
        fixture.expected.hashBurgCell,
      );
      expect(fnv1a(bytesOf(world.burgPopulation))).toBe(
        fixture.expected.hashBurgPopulation,
      );
      expect(fnv1a(bytesOf(world.burgPort))).toBe(
        fixture.expected.hashBurgPort,
      );
      expect(fnv1a(bytesOf(world.burgCulture))).toBe(
        fixture.expected.hashBurgCulture,
      );
      expect(fnv1a(bytesOf(world.cellsState))).toBe(
        fixture.expected.hashCellsState,
      );
      expect(world.stateCount).toBe(fixture.expected.stateCount);
      expect(fnv1a(bytesOf(world.stateCenterBurg))).toBe(
        fixture.expected.hashStateCenterBurg,
      );
      expect(fnv1a(bytesOf(world.stateCulture))).toBe(
        fixture.expected.hashStateCulture,
      );
      expect(fnv1a(bytesOf(world.stateForm))).toBe(
        fixture.expected.hashStateForm,
      );
      expect(fnv1a(bytesOf(world.stateCells))).toBe(
        fixture.expected.hashStateCells,
      );
      expect(world.routeCount).toBe(fixture.expected.routeCount);
      expect(fnv1a(bytesOf(world.routeFromState))).toBe(
        fixture.expected.hashRouteFromState,
      );
      expect(fnv1a(bytesOf(world.routeToState))).toBe(
        fixture.expected.hashRouteToState,
      );
      expect(fnv1a(bytesOf(world.routeKind))).toBe(
        fixture.expected.hashRouteKind,
      );
      expect(fnv1a(bytesOf(world.routeWeight))).toBe(
        fixture.expected.hashRouteWeight,
      );
      expect(fnv1a(bytesOf(world.cellsProvince))).toBe(
        fixture.expected.hashCellsProvince,
      );
      expect(world.provinceCount).toBe(fixture.expected.provinceCount);
      expect(fnv1a(bytesOf(world.provinceState))).toBe(
        fixture.expected.hashProvinceState,
      );
      expect(fnv1a(bytesOf(world.provinceCenterCell))).toBe(
        fixture.expected.hashProvinceCenterCell,
      );
      expect(fnv1a(bytesOf(world.provinceCells))).toBe(
        fixture.expected.hashProvinceCells,
      );
      expect(fnv1a(bytesOf(world.cellsReligion))).toBe(
        fixture.expected.hashCellsReligion,
      );
      expect(world.religionCount).toBe(fixture.expected.religionCount);
      expect(fnv1a(bytesOf(world.religionSeedCell))).toBe(
        fixture.expected.hashReligionSeedCell,
      );
      expect(fnv1a(bytesOf(world.religionType))).toBe(
        fixture.expected.hashReligionType,
      );
      expect(fnv1a(bytesOf(world.religionSize))).toBe(
        fixture.expected.hashReligionSize,
      );
      expect(fnv1a(bytesOf(world.cellsMilitary))).toBe(
        fixture.expected.hashCellsMilitary,
      );
      expect(world.militaryCount).toBe(fixture.expected.militaryCount);
      expect(fnv1a(bytesOf(world.militaryCell))).toBe(
        fixture.expected.hashMilitaryCell,
      );
      expect(fnv1a(bytesOf(world.militaryState))).toBe(
        fixture.expected.hashMilitaryState,
      );
      expect(fnv1a(bytesOf(world.militaryType))).toBe(
        fixture.expected.hashMilitaryType,
      );
      expect(fnv1a(bytesOf(world.militaryStrength))).toBe(
        fixture.expected.hashMilitaryStrength,
      );
      expect(world.markerCount).toBe(fixture.expected.markerCount);
      expect(fnv1a(bytesOf(world.markerCell))).toBe(
        fixture.expected.hashMarkerCell,
      );
      expect(fnv1a(bytesOf(world.markerType))).toBe(
        fixture.expected.hashMarkerType,
      );
      expect(fnv1a(bytesOf(world.markerStrength))).toBe(
        fixture.expected.hashMarkerStrength,
      );
      expect(fnv1a(bytesOf(world.cellsZone))).toBe(
        fixture.expected.hashCellsZone,
      );
      expect(world.zoneCount).toBe(fixture.expected.zoneCount);
      expect(fnv1a(bytesOf(world.zoneSeedCell))).toBe(
        fixture.expected.hashZoneSeedCell,
      );
      expect(fnv1a(bytesOf(world.zoneType))).toBe(
        fixture.expected.hashZoneType,
      );
      expect(fnv1a(bytesOf(world.zoneCells))).toBe(
        fixture.expected.hashZoneCells,
      );
      expect(fnv1a(bytesOf(world.cellsFeature))).toBe(
        fixture.expected.hashCellsFeature,
      );
      expect(fnv1a(bytesOf(world.cellsFeatureId))).toBe(
        fixture.expected.hashCellsFeatureId,
      );
      expect(world.featureCount).toBe(fixture.expected.featureCount);
      expect(fnv1a(bytesOf(world.featureType))).toBe(
        fixture.expected.hashFeatureType,
      );
      expect(fnv1a(bytesOf(world.featureLand))).toBe(
        fixture.expected.hashFeatureLand,
      );
      expect(fnv1a(bytesOf(world.featureBorder))).toBe(
        fixture.expected.hashFeatureBorder,
      );
      expect(fnv1a(bytesOf(world.featureSize))).toBe(
        fixture.expected.hashFeatureSize,
      );
      expect(fnv1a(bytesOf(world.featureFirstCell))).toBe(
        fixture.expected.hashFeatureFirstCell,
      );
      expect(fnv1a(bytesOf(world.cellsCoast))).toBe(
        fixture.expected.hashCellsCoast,
      );
      expect(fnv1a(bytesOf(world.cellsLandmass))).toBe(
        fixture.expected.hashCellsLandmass,
      );
      expect(world.landmassCount).toBe(fixture.expected.landmassCount);
      expect(fnv1a(bytesOf(world.landmassKind))).toBe(
        fixture.expected.hashLandmassKind,
      );
      expect(fnv1a(bytesOf(world.landmassSize))).toBe(
        fixture.expected.hashLandmassSize,
      );
      expect(fnv1a(bytesOf(world.landmassBorder))).toBe(
        fixture.expected.hashLandmassBorder,
      );
      expect(fnv1a(bytesOf(world.cellsTemp))).toBe(
        fixture.expected.hashCellsTemp,
      );
      expect(fnv1a(bytesOf(world.cellsPrec))).toBe(
        fixture.expected.hashCellsPrec,
      );
      expect(fnv1a(bytesOf(world.cellsFlow))).toBe(
        fixture.expected.hashCellsFlow,
      );
      expect(fnv1a(bytesOf(world.cellsRiver))).toBe(
        fixture.expected.hashCellsRiver,
      );
      expect(fnv1a(bytesOf(world.cellsBiome))).toBe(
        fixture.expected.hashCellsBiome,
      );
      expect(fnv1a(bytesOf(world.cellsWaterbody))).toBe(
        fixture.expected.hashCellsWaterbody,
      );
      expect(world.waterbodyCount).toBe(fixture.expected.waterbodyCount);
      expect(fnv1a(bytesOf(world.waterbodyType))).toBe(
        fixture.expected.hashWaterbodyType,
      );
      expect(fnv1a(bytesOf(world.waterbodySize))).toBe(
        fixture.expected.hashWaterbodySize,
      );
      expect(world.packCellCount).toBe(fixture.expected.packCellCount);
      expect(fnv1a(bytesOf(world.gridToPack))).toBe(
        fixture.expected.hashGridToPack,
      );
      expect(fnv1a(bytesOf(world.packToGrid))).toBe(
        fixture.expected.hashPackToGrid,
      );
      expect(fnv1a(bytesOf(world.packX))).toBe(fixture.expected.hashPackX);
      expect(fnv1a(bytesOf(world.packY))).toBe(fixture.expected.hashPackY);
      expect(fnv1a(bytesOf(world.packH))).toBe(fixture.expected.hashPackH);
      expect(fnv1a(bytesOf(world.packArea))).toBe(
        fixture.expected.hashPackArea,
      );
      expect(fnv1a(bytesOf(world.packNeighborOffsets))).toBe(
        fixture.expected.hashPackNeighborOffsets,
      );
      expect(fnv1a(bytesOf(world.packNeighbors))).toBe(
        fixture.expected.hashPackNeighbors,
      );
      expect(fnv1a(bytesOf(world.packCellsFeatureId))).toBe(
        fixture.expected.hashPackCellsFeatureId,
      );
      expect(world.packFeatureCount).toBe(fixture.expected.packFeatureCount);
      expect(fnv1a(bytesOf(world.packFeatureType))).toBe(
        fixture.expected.hashPackFeatureType,
      );
      expect(fnv1a(bytesOf(world.packFeatureBorder))).toBe(
        fixture.expected.hashPackFeatureBorder,
      );
      expect(fnv1a(bytesOf(world.packFeatureSize))).toBe(
        fixture.expected.hashPackFeatureSize,
      );
      expect(fnv1a(bytesOf(world.packFeatureFirstCell))).toBe(
        fixture.expected.hashPackFeatureFirstCell,
      );
      expect(fnv1a(bytesOf(world.packCoast))).toBe(
        fixture.expected.hashPackCoast,
      );
      expect(fnv1a(bytesOf(world.packHaven))).toBe(
        fixture.expected.hashPackHaven,
      );
      expect(fnv1a(bytesOf(world.packHarbor))).toBe(
        fixture.expected.hashPackHarbor,
      );
      expect(fnv1a(bytesOf(world.vertexX))).toBe(fixture.expected.hashVertexX);
      expect(fnv1a(bytesOf(world.vertexY))).toBe(fixture.expected.hashVertexY);
      expect(fnv1a(bytesOf(world.cellVertexOffsets))).toBe(
        fixture.expected.hashCellVertexOffsets,
      );
      expect(fnv1a(bytesOf(world.cellVertices))).toBe(
        fixture.expected.hashCellVertices,
      );
      expect(fnv1a(bytesOf(world.cellNeighborOffsets))).toBe(
        fixture.expected.hashOffsets,
      );
      expect(fnv1a(bytesOf(world.cellNeighbors))).toBe(
        fixture.expected.hashNeighbors,
      );

      expect(stats.meanHeight).toBeCloseTo(fixture.expected.meanHeight, 10);
      expect(stats.meanTemp).toBeCloseTo(fixture.expected.meanTemp, 10);
      expect(stats.meanPrec).toBeCloseTo(fixture.expected.meanPrec, 10);
      expect(stats.landRatio).toBeCloseTo(fixture.expected.landRatio, 10);
    });
  }
});
