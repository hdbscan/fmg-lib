export type UpstreamCultureTemplateDrawEvent = Readonly<{
  draw: number;
  poolLength: number;
  pickedIndex: number;
  templateId: number;
  templateBase: number;
  odd: number;
  accepted: boolean;
}>;

type RawSelectedTemplate = Readonly<{
  templateId?: number;
  base?: number;
}>;

type RawPlaceCenterSample = Readonly<{
  sampleIndex?: number;
  cellId?: number;
  spacing?: number;
  accepted?: boolean;
}>;

type RawPlaceCenterEntry = Readonly<{
  samples?: readonly RawPlaceCenterSample[];
}>;

type RawTemplateDrawEvent = Readonly<{
  draw?: number;
  poolLength?: number;
  pickedIndex?: number;
  templateId?: number;
  templateBase?: number;
  odd?: number;
  accepted?: boolean;
}>;

export type RawUpstreamCultureRuntimePayload = Readonly<{
  selectedTemplates?: readonly RawSelectedTemplate[];
  templateDrawEvents?: readonly RawTemplateDrawEvent[];
  placeCenter?: readonly RawPlaceCenterEntry[];
  selectedCenters?: readonly number[];
}>;

export type UpstreamCultureRuntime = Readonly<{
  selectedTemplateIds: readonly number[];
  selectedTemplateBases: readonly number[];
  selectedCenters: readonly number[];
  sampleIndices: readonly number[];
  sampleCells: readonly number[];
  sampleOffsets: readonly number[];
  sampleAccepted: readonly boolean[];
  sampleSpacings: readonly number[];
  templateDrawEvents: readonly UpstreamCultureTemplateDrawEvent[];
}>;

const CULTURES_GENERATE_TARGET =
  'const s=(m=>{const g=this.getDefault(m),y=[];if(pack.cultures?.forEach(w=>{w.lock&&!w.removed&&y.push(w)}),!y.length){if(m===g.length)return g;if(g.every(w=>w.odd===1))return g.splice(0,m)}for(let w,v,b=0;y.length<m&&g.length>0;){do v=se(g.length-1),w=g[v],b++;while(b<200&&!U(w.odd));y.push(w),g.splice(v,1)}return y})(r);pack.cultures=s;const u=tn(),c=jp(r),h=ye("emblemShape").value,f=[],l=m=>{let g=(graphWidth+graphHeight)/2/r;const y=100,w=[...i].sort((k,M)=>m(M)-m(k)),v=Math.floor(w.length/2);let b=0;for(let k=0;k<y&&(b=w[Kp(0,v,5)],g*=.9,!(!t[b]&&!u.find(this.cells.p[b][0],this.cells.p[b][1],g)));k++);return b},d=m=>{';

const CULTURES_GENERATE_REPLACEMENT =
  'const s=(m=>{const g=this.getDefault(m).map((w,v)=>({...w,templateId:v})),y=[],C={selectedTemplates:[],templateDrawEvents:[],placeCenter:[]};globalThis.__cultureRuntime=C;if(pack.cultures?.forEach(w=>{w.lock&&!w.removed&&y.push(w)}),!y.length){if(m===g.length)return C.selectedTemplates=g.map(w=>({templateId:w.templateId,base:w.base})),g;if(g.every(w=>w.odd===1))return C.selectedTemplates=g.slice(0,m).map(w=>({templateId:w.templateId,base:w.base})),g.splice(0,m)}for(let w,v,b=0,D=0,E=!1;y.length<m&&g.length>0;){do v=se(g.length-1),w=g[v],b++,D++,E=U(w.odd),C.templateDrawEvents.push({draw:D,poolLength:g.length,pickedIndex:v,templateId:w.templateId,templateBase:w.base,odd:w.odd,accepted:E});while(b<200&&!E);y.push(w),C.selectedTemplates.push({templateId:w.templateId,base:w.base}),g.splice(v,1)}return y})(r);pack.cultures=s;const u=tn(),c=jp(r),h=ye("emblemShape").value,f=[],l=m=>{let g=(graphWidth+graphHeight)/2/r;const y=100,w=[...i].sort((k,M)=>m(M)-m(k)),v=Math.floor(w.length/2);let b=0;const C=[];for(let k=0;k<y;k++){const D=Kp(0,v,5);b=w[D],g*=.9;const E=!(!t[b]&&!u.find(this.cells.p[b][0],this.cells.p[b][1],g));C.push({sampleIndex:D,cellId:b,spacing:g,accepted:!E});if(!E)break}return globalThis.__cultureRuntime.placeCenter.push({samples:C}),b},d=m=>{';

export const injectUpstreamCultureRuntimeInstrumentation = (
  bundleSource: string,
): string => {
  if (!bundleSource.includes(CULTURES_GENERATE_TARGET)) {
    throw new Error(
      "Unable to locate upstream Cultures.generate snippet for runtime instrumentation",
    );
  }

  return bundleSource.replace(
    CULTURES_GENERATE_TARGET,
    CULTURES_GENERATE_REPLACEMENT,
  );
};

export const normalizeUpstreamCultureRuntime = (
  payload: RawUpstreamCultureRuntimePayload,
): UpstreamCultureRuntime => {
  const placeCenter = payload.placeCenter ?? [];
  const sampleOffsets = [0];

  for (const entry of placeCenter) {
    sampleOffsets.push(
      (sampleOffsets[sampleOffsets.length - 1] ?? 0) +
        (entry.samples?.length ?? 0),
    );
  }

  return {
    selectedTemplateIds: [
      0,
      ...(payload.selectedTemplates ?? []).map((template) =>
        Number(template.templateId ?? 0),
      ),
    ],
    selectedTemplateBases: [
      0,
      ...(payload.selectedTemplates ?? []).map((template) =>
        Number(template.base ?? 0),
      ),
    ],
    selectedCenters: [
      0,
      ...((payload.selectedCenters ?? []) as readonly number[]),
    ],
    sampleIndices: placeCenter.flatMap((entry) =>
      (entry.samples ?? []).map((sample) => Number(sample.sampleIndex ?? 0)),
    ),
    sampleCells: placeCenter.flatMap((entry) =>
      (entry.samples ?? []).map((sample) => Number(sample.cellId ?? 0)),
    ),
    sampleOffsets,
    sampleAccepted: placeCenter.flatMap((entry) =>
      (entry.samples ?? []).map((sample) => Boolean(sample.accepted)),
    ),
    sampleSpacings: placeCenter.flatMap((entry) =>
      (entry.samples ?? []).map((sample) => Number(sample.spacing ?? 0)),
    ),
    templateDrawEvents: (payload.templateDrawEvents ?? []).map((event) => ({
      draw: Number(event.draw),
      poolLength: Number(event.poolLength),
      pickedIndex: Number(event.pickedIndex),
      templateId: Number(event.templateId),
      templateBase: Number(event.templateBase),
      odd: Number(event.odd),
      accepted: Boolean(event.accepted),
    })),
  };
};
