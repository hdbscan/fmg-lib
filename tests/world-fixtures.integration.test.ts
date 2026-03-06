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
      hashCellsH: 2435351560,
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
      hashCellsFeature: 2804943325,
      hashCellsFeatureId: 3167769336,
      featureCount: 13,
      hashFeatureType: 3781111089,
      hashFeatureLand: 618232598,
      hashFeatureBorder: 4263780634,
      hashFeatureSize: 69274142,
      hashFeatureFirstCell: 2427276941,
      hashCellsCoast: 1551389230,
      hashCellsLandmass: 3337548850,
      landmassCount: 5,
      hashLandmassKind: 2667009974,
      hashLandmassSize: 853058207,
      hashLandmassBorder: 2138539933,
      hashCellsTemp: 3708013695,
      hashCellsPrec: 574968714,
      hashCellsFlow: 1377315647,
      hashCellsRiver: 3932159501,
      hashCellsBiome: 2930289347,
      hashCellsWaterbody: 3366592511,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 2027567016,
      packCellCount: 2734,
      hashGridToPack: 3895339148,
      hashPackToGrid: 618728524,
      hashPackX: 2084069898,
      hashPackY: 1255664290,
      hashPackH: 3985714132,
      hashPackArea: 3989593678,
      hashPackNeighborOffsets: 1782778012,
      hashPackNeighbors: 3886698419,
      hashPackCellsFeatureId: 1608732546,
      packFeatureCount: 5,
      hashPackFeatureType: 2984944048,
      hashPackFeatureBorder: 2138539933,
      hashPackFeatureSize: 853058207,
      hashPackFeatureFirstCell: 2398178964,
      hashPackCoast: 2479503377,
      hashPackHaven: 1830576133,
      hashPackHarbor: 1170871645,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 23.248621553885,
      meanTemp: 2.258980785297,
      meanPrec: 176.468003341688,
      landRatio: 0.456808688388,
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
      hashCellsH: 2068625434,
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
      hashCellsFeature: 2530369308,
      hashCellsFeatureId: 1702402910,
      featureCount: 21,
      hashFeatureType: 4124644633,
      hashFeatureLand: 722386638,
      hashFeatureBorder: 667609690,
      hashFeatureSize: 2118984758,
      hashFeatureFirstCell: 586867763,
      hashCellsCoast: 4080216602,
      hashCellsLandmass: 4023466810,
      landmassCount: 13,
      hashLandmassKind: 1456734435,
      hashLandmassSize: 2265425273,
      hashLandmassBorder: 892911165,
      hashCellsTemp: 2430443526,
      hashCellsPrec: 2322759119,
      hashCellsFlow: 2569959218,
      hashCellsRiver: 2506343491,
      hashCellsBiome: 3311837937,
      hashCellsWaterbody: 1510525145,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 4010660418,
      packCellCount: 2629,
      hashGridToPack: 2282799767,
      hashPackToGrid: 394445107,
      hashPackX: 1339855341,
      hashPackY: 2744256392,
      hashPackH: 1586477906,
      hashPackArea: 2655662663,
      hashPackNeighborOffsets: 1342567321,
      hashPackNeighbors: 391596367,
      hashPackCellsFeatureId: 1116604250,
      packFeatureCount: 13,
      hashPackFeatureType: 3078997032,
      hashPackFeatureBorder: 892911165,
      hashPackFeatureSize: 2265425273,
      hashPackFeatureFirstCell: 2301828873,
      hashPackCoast: 1329133504,
      hashPackHaven: 2184977425,
      hashPackHarbor: 2920299139,
      hashVertexX: 1955023207,
      hashVertexY: 1367661068,
      hashCellVertexOffsets: 2304713312,
      hashCellVertices: 894105692,
      hashOffsets: 2753894046,
      hashNeighbors: 3902155913,
      meanHeight: 12.521075096705,
      meanTemp: 2.272175536881,
      meanPrec: 183.055622248900,
      landRatio: 0.175336801387,
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
      hashCellsH: 2435351560,
      hashCellsCulture: 778319871,
      cultureCount: 10,
      hashCultureSeedCell: 3379642569,
      hashCultureSize: 2745722251,
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
      hashCellsFeature: 2804943325,
      hashCellsFeatureId: 3167769336,
      featureCount: 13,
      hashFeatureType: 3781111089,
      hashFeatureLand: 618232598,
      hashFeatureBorder: 4263780634,
      hashFeatureSize: 69274142,
      hashFeatureFirstCell: 2427276941,
      hashCellsCoast: 1551389230,
      hashCellsLandmass: 3337548850,
      landmassCount: 5,
      hashLandmassKind: 2667009974,
      hashLandmassSize: 853058207,
      hashLandmassBorder: 2138539933,
      hashCellsTemp: 3708013695,
      hashCellsPrec: 574968714,
      hashCellsFlow: 1377315647,
      hashCellsRiver: 3932159501,
      hashCellsBiome: 2930289347,
      hashCellsWaterbody: 3366592511,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 2027567016,
      packCellCount: 2734,
      hashGridToPack: 3895339148,
      hashPackToGrid: 618728524,
      hashPackX: 2084069898,
      hashPackY: 1255664290,
      hashPackH: 3985714132,
      hashPackArea: 3989593678,
      hashPackNeighborOffsets: 1782778012,
      hashPackNeighbors: 3886698419,
      hashPackCellsFeatureId: 1608732546,
      packFeatureCount: 5,
      hashPackFeatureType: 2984944048,
      hashPackFeatureBorder: 2138539933,
      hashPackFeatureSize: 853058207,
      hashPackFeatureFirstCell: 2398178964,
      hashPackCoast: 2479503377,
      hashPackHaven: 1830576133,
      hashPackHarbor: 1170871645,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 23.248621553885,
      meanTemp: 2.258980785297,
      meanPrec: 176.468003341688,
      landRatio: 0.456808688388,
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
      hashCellsH: 2435351560,
      hashCellsCulture: 1148055245,
      cultureCount: 0,
      hashCultureSeedCell: 1268118805,
      hashCultureSize: 1268118805,
      hashCellsBurg: 3114528229,
      burgCount: 15,
      hashBurgCell: 3303617005,
      hashBurgPopulation: 100396111,
      hashBurgPort: 838741266,
      hashBurgCulture: 187360325,
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
      hashCellsFeature: 2804943325,
      hashCellsFeatureId: 3167769336,
      featureCount: 13,
      hashFeatureType: 3781111089,
      hashFeatureLand: 618232598,
      hashFeatureBorder: 4263780634,
      hashFeatureSize: 69274142,
      hashFeatureFirstCell: 2427276941,
      hashCellsCoast: 1551389230,
      hashCellsLandmass: 3337548850,
      landmassCount: 5,
      hashLandmassKind: 2667009974,
      hashLandmassSize: 853058207,
      hashLandmassBorder: 2138539933,
      hashCellsTemp: 3708013695,
      hashCellsPrec: 574968714,
      hashCellsFlow: 1377315647,
      hashCellsRiver: 3932159501,
      hashCellsBiome: 2930289347,
      hashCellsWaterbody: 3366592511,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 2027567016,
      packCellCount: 2734,
      hashGridToPack: 3895339148,
      hashPackToGrid: 618728524,
      hashPackX: 2084069898,
      hashPackY: 1255664290,
      hashPackH: 3985714132,
      hashPackArea: 3989593678,
      hashPackNeighborOffsets: 1782778012,
      hashPackNeighbors: 3886698419,
      hashPackCellsFeatureId: 1608732546,
      packFeatureCount: 5,
      hashPackFeatureType: 2984944048,
      hashPackFeatureBorder: 2138539933,
      hashPackFeatureSize: 853058207,
      hashPackFeatureFirstCell: 2398178964,
      hashPackCoast: 2479503377,
      hashPackHaven: 1830576133,
      hashPackHarbor: 1170871645,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 23.248621553885,
      meanTemp: 2.258980785297,
      meanPrec: 176.468003341688,
      landRatio: 0.456808688388,
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
      hashCellsH: 2435351560,
      hashCellsCulture: 778319871,
      cultureCount: 10,
      hashCultureSeedCell: 3379642569,
      hashCultureSize: 2745722251,
      hashCellsBurg: 3114528229,
      burgCount: 15,
      hashBurgCell: 3303617005,
      hashBurgPopulation: 100396111,
      hashBurgPort: 838741266,
      hashBurgCulture: 2393221670,
      hashCellsState: 4221174030,
      stateCount: 6,
      hashStateCenterBurg: 3936987769,
      hashStateCulture: 3523296844,
      hashStateForm: 2097651489,
      hashStateCells: 1046430911,
      routeCount: 8,
      hashRouteFromState: 1969033368,
      hashRouteToState: 2706201611,
      hashRouteKind: 3017984775,
      hashRouteWeight: 2839435563,
      hashCellsProvince: 2199131344,
      provinceCount: 7,
      hashProvinceState: 1357771115,
      hashProvinceCenterCell: 2864810715,
      hashProvinceCells: 1909953316,
      hashCellsReligion: 3960611501,
      religionCount: 15,
      hashReligionSeedCell: 1052155821,
      hashReligionType: 1787546519,
      hashReligionSize: 358134944,
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
      hashCellsFeature: 2804943325,
      hashCellsFeatureId: 3167769336,
      featureCount: 13,
      hashFeatureType: 3781111089,
      hashFeatureLand: 618232598,
      hashFeatureBorder: 4263780634,
      hashFeatureSize: 69274142,
      hashFeatureFirstCell: 2427276941,
      hashCellsCoast: 1551389230,
      hashCellsLandmass: 3337548850,
      landmassCount: 5,
      hashLandmassKind: 2667009974,
      hashLandmassSize: 853058207,
      hashLandmassBorder: 2138539933,
      hashCellsTemp: 3708013695,
      hashCellsPrec: 574968714,
      hashCellsFlow: 1377315647,
      hashCellsRiver: 3932159501,
      hashCellsBiome: 2930289347,
      hashCellsWaterbody: 3366592511,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 2027567016,
      packCellCount: 2734,
      hashGridToPack: 3895339148,
      hashPackToGrid: 618728524,
      hashPackX: 2084069898,
      hashPackY: 1255664290,
      hashPackH: 3985714132,
      hashPackArea: 3989593678,
      hashPackNeighborOffsets: 1782778012,
      hashPackNeighbors: 3886698419,
      hashPackCellsFeatureId: 1608732546,
      packFeatureCount: 5,
      hashPackFeatureType: 2984944048,
      hashPackFeatureBorder: 2138539933,
      hashPackFeatureSize: 853058207,
      hashPackFeatureFirstCell: 2398178964,
      hashPackCoast: 2479503377,
      hashPackHaven: 1830576133,
      hashPackHarbor: 1170871645,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 23.248621553885,
      meanTemp: 2.258980785297,
      meanPrec: 176.468003341688,
      landRatio: 0.456808688388,
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
      hashCellsH: 2435351560,
      hashCellsCulture: 778319871,
      cultureCount: 10,
      hashCultureSeedCell: 3379642569,
      hashCultureSize: 2745722251,
      hashCellsBurg: 3114528229,
      burgCount: 15,
      hashBurgCell: 3303617005,
      hashBurgPopulation: 100396111,
      hashBurgPort: 838741266,
      hashBurgCulture: 2393221670,
      hashCellsState: 4221174030,
      stateCount: 6,
      hashStateCenterBurg: 3936987769,
      hashStateCulture: 3523296844,
      hashStateForm: 2097651489,
      hashStateCells: 1046430911,
      routeCount: 8,
      hashRouteFromState: 1969033368,
      hashRouteToState: 2706201611,
      hashRouteKind: 3017984775,
      hashRouteWeight: 2839435563,
      hashCellsProvince: 2199131344,
      provinceCount: 7,
      hashProvinceState: 1357771115,
      hashProvinceCenterCell: 2864810715,
      hashProvinceCells: 1909953316,
      hashCellsReligion: 3960611501,
      religionCount: 15,
      hashReligionSeedCell: 1052155821,
      hashReligionType: 1787546519,
      hashReligionSize: 358134944,
      hashCellsMilitary: 2234699324,
      militaryCount: 13,
      hashMilitaryCell: 1076858538,
      hashMilitaryState: 1300070440,
      hashMilitaryType: 3681848076,
      hashMilitaryStrength: 3786942792,
      markerCount: 35,
      hashMarkerCell: 3988457488,
      hashMarkerType: 3211119844,
      hashMarkerStrength: 4264891039,
      hashCellsZone: 3910926180,
      zoneCount: 21,
      hashZoneSeedCell: 1171586331,
      hashZoneType: 317096433,
      hashZoneCells: 713771049,
      hashCellsFeature: 2804943325,
      hashCellsFeatureId: 3167769336,
      featureCount: 13,
      hashFeatureType: 3781111089,
      hashFeatureLand: 618232598,
      hashFeatureBorder: 4263780634,
      hashFeatureSize: 69274142,
      hashFeatureFirstCell: 2427276941,
      hashCellsCoast: 1551389230,
      hashCellsLandmass: 3337548850,
      landmassCount: 5,
      hashLandmassKind: 2667009974,
      hashLandmassSize: 853058207,
      hashLandmassBorder: 2138539933,
      hashCellsTemp: 3708013695,
      hashCellsPrec: 574968714,
      hashCellsFlow: 1377315647,
      hashCellsRiver: 3932159501,
      hashCellsBiome: 2930289347,
      hashCellsWaterbody: 3366592511,
      waterbodyCount: 8,
      hashWaterbodyType: 3670463116,
      hashWaterbodySize: 2027567016,
      packCellCount: 2734,
      hashGridToPack: 3895339148,
      hashPackToGrid: 618728524,
      hashPackX: 2084069898,
      hashPackY: 1255664290,
      hashPackH: 3985714132,
      hashPackArea: 3989593678,
      hashPackNeighborOffsets: 1782778012,
      hashPackNeighbors: 3886698419,
      hashPackCellsFeatureId: 1608732546,
      packFeatureCount: 5,
      hashPackFeatureType: 2984944048,
      hashPackFeatureBorder: 2138539933,
      hashPackFeatureSize: 853058207,
      hashPackFeatureFirstCell: 2398178964,
      hashPackCoast: 2479503377,
      hashPackHaven: 1830576133,
      hashPackHarbor: 1170871645,
      hashVertexX: 3826746024,
      hashVertexY: 2840394013,
      hashCellVertexOffsets: 1635618596,
      hashCellVertices: 140719261,
      hashOffsets: 3890842510,
      hashNeighbors: 244053842,
      meanHeight: 23.248621553885,
      meanTemp: 2.258980785297,
      meanPrec: 176.468003341688,
      landRatio: 0.456808688388,
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
