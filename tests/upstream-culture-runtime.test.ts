import { describe, expect, test } from "bun:test";
import {
  injectUpstreamCultureRuntimeInstrumentation,
  normalizeUpstreamCultureRuntime,
} from "../scripts/lib/upstream-culture-runtime";

describe("upstream culture runtime instrumentation", () => {
  test("injects deeper Cultures.generate helper tracing", () => {
    const source =
      'before const s=(m=>{const g=this.getDefault(m),y=[];if(pack.cultures?.forEach(w=>{w.lock&&!w.removed&&y.push(w)}),!y.length){if(m===g.length)return g;if(g.every(w=>w.odd===1))return g.splice(0,m)}for(let w,v,b=0;y.length<m&&g.length>0;){do v=se(g.length-1),w=g[v],b++;while(b<200&&!U(w.odd));y.push(w),g.splice(v,1)}return y})(r);pack.cultures=s;const u=tn(),c=jp(r),h=ye("emblemShape").value,f=[],l=m=>{let g=(graphWidth+graphHeight)/2/r;const y=100,w=[...i].sort((k,M)=>m(M)-m(k)),v=Math.floor(w.length/2);let b=0;for(let k=0;k<y&&(b=w[Kp(0,v,5)],g*=.9,!(!t[b]&&!u.find(this.cells.p[b][0],this.cells.p[b][1],g)));k++);return b},d=m=>{ after';

    const instrumented = injectUpstreamCultureRuntimeInstrumentation(source);

    expect(instrumented).toContain("globalThis.__cultureRuntime");
    expect(instrumented).toContain("templateDrawEvents.push");
    expect(instrumented).toContain("templateId:w.templateId");
    expect(instrumented).toContain("placeCenter.push({samples:C})");
  });

  test("normalizes captured helper-call facts for the harness", () => {
    const runtime = normalizeUpstreamCultureRuntime({
      selectedTemplates: [
        { templateId: 7, base: 31 },
        { templateId: 2, base: 9 },
      ],
      selectedCenters: [101, 202],
      templateDrawEvents: [
        {
          draw: 1,
          poolLength: 12,
          pickedIndex: 5,
          templateId: 7,
          templateBase: 31,
          odd: 0.2,
          accepted: false,
        },
      ],
      placeCenter: [
        {
          samples: [
            { sampleIndex: 9, cellId: 101, spacing: 12.5, accepted: false },
            { sampleIndex: 2, cellId: 88, spacing: 11.25, accepted: true },
          ],
        },
        {
          samples: [
            { sampleIndex: 4, cellId: 202, spacing: 10, accepted: true },
          ],
        },
      ],
    });

    expect(runtime.selectedTemplateIds).toEqual([0, 7, 2]);
    expect(runtime.selectedTemplateBases).toEqual([0, 31, 9]);
    expect(runtime.selectedCenters).toEqual([0, 101, 202]);
    expect(runtime.sampleIndices).toEqual([9, 2, 4]);
    expect(runtime.sampleCells).toEqual([101, 88, 202]);
    expect(runtime.sampleOffsets).toEqual([0, 2, 3]);
    expect(runtime.sampleAccepted).toEqual([false, true, true]);
    expect(runtime.sampleSpacings).toEqual([12.5, 11.25, 10]);
    expect(runtime.templateDrawEvents).toHaveLength(1);
  });
});
