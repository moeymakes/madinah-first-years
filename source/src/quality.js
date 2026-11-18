// ============================================================================
// quality level, chosen before anything is built (pattern from Abyssal Garden, MIT)
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium and Low keep every 2nd / 4th frond, grass blade and pebble and bake fewer
// shadows; Low also drops anti-aliasing and uses coarser meshes and fewer light shaft steps.
// localStorage.madinahFY = "level,pixels,detail". madinahFYLoad is set while the world is built: still set on the
// next visit means that load crashed the tab, so this one runs a level lower.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad;
try { SV = (localStorage.madinahFY || '').split(','); bad = localStorage.madinahFYLoad; } catch {}
LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;
if (bad && LV < 2) { SV = [++LV]; keep('madinahFY', LV); }
const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, RAYN = LV > 1 ? 10 : 24;
// time of day (worldsmith references/time-of-day.md): 0 dawn after Fajr, 1 golden hour, 2 night.
// Every bake depends on the sun, so changing it reloads the page.
let TOD = 1;
try { const t = localStorage.madinahFYTime; if (t === '0' || t === '1' || t === '2') TOD = +t; } catch {}
const TP = [
  { sun: [.93, .105, -.36], sunc: [2.2, 1.55, 1.15], zen: [.16, .27, .55], warm: [1.25, .78, .58], cool: [.60, .64, .78], band: [1, .55, .45], gnd: 1, farblue: [.56, .64, .80], ambc: [1, 1, 1.05], cloud: [1.3, .82, .78], expo: 1.02, rays: .8, night: 0, birds: 1.4 },
  { sun: [-.93, .158, .37], sunc: [2.9, 2.1, 1.35], zen: [.10, .24, .58], warm: [1.35, .84, .44], cool: [.74, .68, .66], band: [1, .5, .2], gnd: 1, farblue: [.56, .64, .80], ambc: [1, 1, 1], cloud: [1.2, .74, .52], expo: .84, rays: 1, night: 0, birds: 1 },
  { sun: [.45, .62, .64], sunc: [.17, .2, .29], zen: [.004, .008, .022], warm: [.05, .045, .05], cool: [.025, .03, .045], band: [.12, .07, .04], gnd: .06, farblue: [.03, .035, .05], ambc: [.05, .055, .08], cloud: [.03, .035, .05], expo: 2.6, rays: 0, night: 1, birds: .1 },
][TOD];
