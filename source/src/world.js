// ============================================================================
// world layout + procedural content generation (load time only)
// ============================================================================
// Axes: +x east, -z north, y up, metres. Geography is composed and compressed: the first mosque sits at MQ
// (shaders.js) near the middle of the walkable land, Uhud 4.3 km north, the harrat to the east. The ground model
// itself (heights and masks) is W_GROUND in shaders.js.

// sun 9 degrees up in the west-south-west: facing north it lights things from the left
const SUN = (() => { const v = [-.93, .158, .37]; const l = hypot(...v); return v.map((c) => c / l); })();
// far houses (w, h, d, roof room); index 5 is a far utum
const FARH = [[8, 3.2, 9, 0], [10, 3.4, 8, 1], [7, 3, 7, 0], [12, 3.6, 10, 1], [9, 5.8, 9, 0], [8.5, 11, 8.5, 0]];
const NSOLID = 26 + FARH.length;
// near houses: w, d, h, kind (0 plain, 1 roof room, 2 walled yard to the door side, 3 two storeys)
const HOUSE = [[8, 7, 3.2, 0], [10, 8, 3.4, 1], [7, 6.5, 3, 2], [9, 8.5, 5.9, 3]];
// the first mosque: half size, wall thickness and height, gate half width and height (sizes in NOTES.md)
const MW = 25, MT = .75, MH = 3.4, MG = 1.2, MGH = 2.5;
// viewpoints: x, eye height above the ground (absolute y when flying), z, look-at x, y, z, flying
const POSES = [
  [-8, 1.7, 36, -1, 2.4, -45, 0],
  [-21, 1.7, -24, 24, 1.6, -31, 0],
  [-45, 1.7, -35, -112, 8, -125, 0],
  [138, 1.7, 30, -300, 30, -700, 0],
  [-160, 1.7, 130, -110, 62, -400, 0],
  [70, 92, 120, -40, 0, -160, 1],
];
// 60 s scripted camera path (position + look-at, absolute heights): the generator keeps it clear of palms and houses
const FLY = new Float32Array([
  -8, 3.5, 170, -4, 5, -40,
  -8, 3.5, 70, 0, 4, -40,
  -5, 5.5, 8, 0, 3, -40,
  0, 7.5, -26, 0, 2, -70,
  0, 6.5, -52, -30, 6, -140,
  -30, 9, -78, -90, 8, -170,
  -80, 14, -100, -90, 4, -170,
  -140, 8, -70, -60, 3, 0,
  -162, 5, 0, -140, 5, 150,
  -150, 5, 90, -60, 6, 200,
  -90, 9, 180, 40, 10, 190,
  0, 16, 215, 100, 20, 160,
  70, 30, 200, 130, 15, 20,
  130, 22, 100, 200, 10, -100,
  160, 25, 0, 40, 10, -140,
  140, 50, 140, -40, 5, -120,
  100, 75, 130, -40, 0, -150,
  70, 92, 120, -40, 0, -160,
]);

// walled date gardens south of the open ground before the qibla wall, and a strip west of the wadi
const GX = [-120, -66, -8, 46, 100], GZ = [22, 80, 150, 240];
const WESTPLOTS = [[-252, -232, -192, -122], [-252, -114, -192, -12], [-252, -2, -192, 108], [-252, 118, -192, 240]];
const PLOTS = [[-118, -236, -40, -165], [-20, -240, 64, -170], [-182, -252, -126, -200], [74, -252, 130, -196], [140, -252, 246, -208], [104, 214, 246, 252]];
for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if (!(i === 3 && j === 2)) PLOTS.push([GX[i] + 3, GZ[j] + 3, GX[i + 1] - 3, GZ[j + 1] - 3]);
for (const p of WESTPLOTS) PLOTS.push(p);
// earthen irrigation ditches along the lanes: polylines of x, z
const CHANNELS = [[[-120, 80], [46, 80]], [[-6.5, 23], [-6.5, 236]], [[-192, -60], [-192, 200]], [[-40, -168], [-20, -168]]];
const WELLS = [[-6.5, 21.5], [-14, 112], [-30, -160], [-198, -64], [-63, -63.6]];
// utum: x, z, height
const UTUM = [[-112, -125, 12.5], [92, -140, 11], [-182, 30, 10], [30, 196, 11.5]];
const inPlot = (x, z, m = 0) => PLOTS.some((p) => x > p[0] + m && x < p[2] - m && z > p[1] + m && z < p[3] - m);
const wadiX = (z) => -150 + 30 * sin(z * .009) + 14 * sin(z * .0023 + 1);

// ---------------------------------------------------------------- terrain mesh from the density grid
function buildTerrain(D) {
  const sn = surfaceNets(D, NX, NY, NZ), nv = sn.nv, gp = sn.pos;
  const smp = sampler3(D, NX, NY, NZ);
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = gp[k * 3], y = gp[k * 3 + 1], z = gp[k * 3 + 2], e = 0.8;
    let nx = smp(x - e, y, z) - smp(x + e, y, z), ny = smp(x, y - e, z) - smp(x, y + e, z), nz = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const X = OX + x * VS, Y = OY + y * VS, Z = OZ + z * VS;
    wp[k * 3] = vf[k * 4] = X; wp[k * 3 + 1] = vf[k * 4 + 1] = Y; wp[k * 3 + 2] = vf[k * 4 + 2] = Z;
    wn[k * 3] = nx; wn[k * 3 + 1] = ny; wn[k * 3 + 2] = nz;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  const nq = sn.ni / 6, key = new Uint8Array(nq), cnt = new Uint32Array(CELLS * CELLS + 1);
  const lo = new Float32Array(CELLS * CELLS).fill(1e9), hi = new Float32Array(CELLS * CELLS).fill(-1e9);
  for (let q = 0; q < nq; q++) {
    const a = sn.idx[q * 6] * 3;
    const c = clamp(floor((wp[a] - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((wp[a + 2] - OZ) / CELLW), 0, CELLS - 1);
    key[q] = c; cnt[c + 1]++;
    for (let j = 0; j < 6; j++) { const y = wp[sn.idx[q * 6 + j] * 3 + 1]; if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  }
  for (let c = 0; c < CELLS * CELLS; c++) cnt[c + 1] += cnt[c];
  const ib = new Uint32Array(sn.ni), fill = cnt.slice();
  for (let q = 0; q < nq; q++) { const o = fill[key[q]]++ * 6; for (let j = 0; j < 6; j++) ib[o + j] = sn.idx[q * 6 + j]; }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };
}

// ---------------------------------------------------------------- far landscape: polar grid out to 12 km
// FA: far ground grid (FN x FN, cell FC, origin FO) of [height, basalt, granite, wadi]. Heights inside the near
// field drop a metre so the detailed near terrain always wins there.
const FN = 1024, FC = 24000 / (FN - 1), FO = -12000;
function farSampler(FA) {
  return (x, z) => {
    const gx = clamp((x - FO) / FC, 0, FN - 1.001), gz = clamp((z - FO) / FC, 0, FN - 1.001), ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = (ix + FN * iz) * 4;
    return mix(mix(FA[i], FA[i + 4], fx), mix(FA[i + FN * 4], FA[i + FN * 4 + 4], fx), fz);
  };
}
function buildFar(fh) {
  const NR = 260, NS = 768, R0 = 190, R1 = 12000, nv = NR * NS;
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const sx = SUN[0], sy = SUN[1], sz = SUN[2], sl = hypot(sx, sz), tn = sy / sl;
  for (let r = 0; r < NR; r++) {
    const rad = R0 * pow(R1 / R0, r / (NR - 1));
    for (let s = 0; s < NS; s++) {
      const a = (s + (r & 1) * .5) / NS * TAU, x = cos(a) * rad, z = sin(a) * rad, k = r * NS + s;
      let h = fh(x, z);
      if (max(abs(x), abs(z)) < 253) h -= 1;
      const e = max(FC * .7, rad * .004);
      let nx = fh(x - e, z) - fh(x + e, z), ny = 2 * e, nz = fh(x, z - e) - fh(x, z + e); const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      // soft heightfield shadow: march toward the sun and keep the smallest clearance over the terrain
      let sh = 1;
      for (let t = 25; t < 3600; t *= 1.09) { const c = h + 2 + t * tn - fh(x + sx / sl * t, z + sz / sl * t); if (c < 0) { sh = 0; break; } sh = min(sh, c / (t * .045)); }
      vf[k * 4] = x; vf[k * 4 + 1] = h; vf[k * 4 + 2] = z;
      v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = round(clamp(sh, 0, 1) * 127);
    }
  }
  const ib = [];
  for (let r = 0; r < NR - 1; r++) for (let s = 0; s < NS; s++) {
    const a = r * NS + s, b = r * NS + (s + 1) % NS, c = (r + 1) * NS + s, d = (r + 1) * NS + (s + 1) % NS;
    if (r & 1) ib.push(a, c, b, b, c, d); else ib.push(a, c, d, a, d, b);
  }
  return { vb, ib: new Uint32Array(ib), nv };
}

// ---------------------------------------------------------------- procedural meshes
// optional L collects the footprint x0 z0 x1 z1 and top for walking collision
const box = (m, x0, y0, z0, x1, y1, z1, L) => {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]) { const q = f.map((i) => m.v(...v[i])); m.quad(q[0], q[1], q[2], q[3]); }
  if (L) L.push(x0, z0, x1, z1, y1);
};
// surface of revolution: prof = [[radius, height, ao]...] bottom to top, seg sides
function lathe(m, prof, seg, cx = 0, cy = 0, cz = 0, rot = PI / seg) {
  const rings = [];
  for (const [r, h, ao = 1] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU + rot; ring.push(m.v(cx + cos(a) * r, cy + h, cz + sin(a) * r, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
}
// square block tapering from w0 x d0 at y0 to w1 x d1 at y1, flat faces
function taper(m, w0, d0, w1, d1, y0, y1) {
  const a = [[-w0 / 2, y0, -d0 / 2], [w0 / 2, y0, -d0 / 2], [w0 / 2, y0, d0 / 2], [-w0 / 2, y0, d0 / 2]];
  const b = [[-w1 / 2, y1, -d1 / 2], [w1 / 2, y1, -d1 / 2], [w1 / 2, y1, d1 / 2], [-w1 / 2, y1, d1 / 2]];
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4, q = [a[k], b[k], b[k2], a[k2]].map((p) => m.v(...p)); m.quad(q[0], q[1], q[2], q[3]); }
  const q = [b[0], b[3], b[2], b[1]].map((p) => m.v(...p)); m.quad(q[0], q[1], q[2], q[3]);
}
// the first mosque, local coordinates (origin at the courtyard centre on the ground, +z = south = qibla)
function meshMosqueWalls(L) {
  const m = new Mesh(), h = MT / 2;
  box(m, -MW - h, 0, -MW - h, -MG, MH, -MW + h, L); box(m, MG, 0, -MW - h, MW + h, MH, -MW + h, L); box(m, -MG, MGH, -MW - h, MG, MH, -MW + h);
  box(m, -MW - h, 0, MW - h, MW + h, MH, MW + h, L);
  for (const x of [-MW, MW]) { box(m, x - h, 0, -MW, x + h, MH, -8 - MG, L); box(m, x - h, 0, -8 + MG, x + h, MH, MW, L); box(m, x - h, MGH, -8 - MG, x + h, MH, -8 + MG); }
  return m;
}
// palm-trunk columns and beams of the prayer hall (three porticoes on the qibla side) and of the Suffah
function meshMosqueTimber() {
  rseed(400);
  const m = new Mesh();
  const col = (x, z, h) => { const lx = rr(-.06, .06), lz = rr(-.06, .06), s = rr(.9, 1.1); m.tube([[x, -.25, z], [x, .25, z], [x + lx * .5, h * .5, z + lz * .5], [x + lx, h, z + lz]], (k) => [.3, .25, .21, .18][k] * s, 12, false, (k) => [.55, .7, .85, 1][k]); };
  const log = (x0, z0, x1, z1, y, r) => m.tube([[x0, y, z0], [(x0 + x1) / 2, y - r * .3, (z0 + z1) / 2], [x1, y, z1]], r, 6, false, () => .8);
  for (const z of [21.4, 17.8, 14.2]) { for (let x = -21.6; x <= 21.7; x += 3.6) col(x, z, 3.36); log(-MW + .3, z, MW - .3, z, 3.34, .17); }
  for (let x = -24; x <= 24.1; x += 1.6) log(x, 13.1, x, MW - .3, 3.47, .065);
  for (let x = -23.4; x <= -5; x += 3.6) col(x, -21.2, 2.92);
  log(-MW + .3, -21.2, -3.4, -21.2, 2.9, .15);
  for (let x = -24; x <= -3.5; x += 1.6) log(x, -MW + .3, x, -20.2, 3.02, .06);
  return m;
}
// roof slabs of stalks, fronds and mud, with a ragged frond fringe along the open edges
function meshMosqueRoof() {
  const m = new Mesh(), e = MW - MT / 2, o = MW + MT / 2;
  box(m, -o, MH + .02, 12.95, o, MH + .3, o);
  box(m, -e, 3.08, -e, -3.25, 3.25, -20.05);
  box(m, -e, 2.95, 12.85, e, 3.56, 12.98);
  box(m, -o - .1, MH - .12, o, o + .1, MH + .26, o + .12);
  for (const s_ of [-1, 1]) box(m, s_ < 0 ? -o - .12 : o, MH - .12, 12.95, s_ < 0 ? -o : o + .12, MH + .26, o + .12);
  box(m, -e, 2.84, -20.12, -3.25, 3.12, -20.02); box(m, -3.33, 2.84, -e, -3.23, 3.12, -20.02);
  for (let x = -21; x <= 21.1; x += 7) box(m, x - .09, MH - .2, o, x + .09, MH - .04, o + .7);
  return m;
}
// the household rooms against the east wall: plain closed low rooms (no openings shown)
function meshRooms(L) {
  rseed(401);
  const m = new Mesh(), x0 = MW + MT / 2;
  for (const [z0, z1] of [[-24.6, -19.4], [-19, -14], [-13.6, -9.7], [-6.3, -1.6], [-1.2, 3.4], [3.8, 8.6], [9, 14], [14.4, 19.4], [19.8, 24.8]]) {
    const h = rr(2.6, 3.05), d = rr(4.6, 5.6);
    box(m, x0, 0, z0, x0 + d, h, z1, L);
    box(m, x0 - .05, h, z0 - .07, x0 + d + .07, h + .24, z1 + .07);
  }
  return m;
}
// utum: a square tower-house of coursed stone, tapering, with a parapet (form is an informed guess)
function meshUtum() {
  const m = new Mesh();
  taper(m, 9, 9, 7.6, 7.6, -.5, 10.6);
  const w = 3.9, t = .45;
  box(m, -w, 10.6, -w, w, 11.6, -w + t); box(m, -w, 10.6, w - t, w, 11.6, w);
  box(m, -w, 10.6, -w, -w + t, 11.6, w); box(m, w - t, 10.6, -w, w, 11.6, w);
  for (let k = -3; k <= 3; k += 2) for (const s of [-1, 1]) { box(m, k * .9 - .3, 11.6, s * w - .23, k * .9 + .3, 12.2, s * w + .23); box(m, s * w - .23, 11.6, k * .9 - .3, s * w + .23, 12.2, k * .9 + .3); }
  return m;
}
// flat-roofed mud-brick house: body, low parapet, palm-trunk beam ends under the roof line, door on local +z
function meshHouse(w, d, h, kind) {
  const m = new Mesh(), hw = w / 2, hd = d / 2;
  box(m, -hw, -.4, -hd, hw, h, hd);
  const t = .26, ph = h + .55;
  box(m, -hw, h, -hd, hw, ph, -hd + t); box(m, -hw, h, hd - t, hw, ph, hd); box(m, -hw, h, -hd, -hw + t, ph, hd); box(m, hw - t, h, -hd, hw, ph, hd);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, sx * hw - (sx > 0 ? .5 : 0), ph, sz * hd - (sz > 0 ? .5 : 0), sx * hw + (sx < 0 ? .5 : 0), ph + .25, sz * hd + (sz < 0 ? .5 : 0));
  for (let x = -hw + .7; x < hw - .4; x += 1.1) for (const s of [-1, 1]) box(m, x - .1, h - .42, s * hd - (s < 0 ? .45 : 0), x + .1, h - .22, s * hd + (s > 0 ? .45 : 0));
  box(m, -.8, 0, hd, -.62, 2.1, hd + .12); box(m, .62, 0, hd, .8, 2.1, hd + .12); box(m, -.95, 2.05, hd, .95, 2.28, hd + .2);
  box(m, hw * .4 - .09, h - .05, -hd - .6, hw * .4 + .09, h + .1, -hd);
  if (kind === 1) { box(m, -hw + .3, h, -hd + .3, -hw + 3.6, h + 2.4, -hd + 3.4); box(m, -hw + .24, h + 2.4, -hd + .24, -hw + 3.66, h + 2.66, -hd + 3.46); }
  if (kind === 2) {
    const yd = 5.5, t = .22, wh = 2.1;
    box(m, -hw, -.4, hd, -hw + t * 2, wh, hd + yd); box(m, hw - t * 2, -.4, hd, hw, wh, hd + yd);
    box(m, -hw, -.4, hd + yd - t * 2, -.7, wh, hd + yd); box(m, .7, -.4, hd + yd - t * 2, hw, wh, hd + yd);
  }
  return m;
}
function meshFarHouse(w, h, d, step) {
  const m = new Mesh();
  box(m, -w / 2, -.5, -d / 2, w / 2, h, d / 2);
  box(m, -w / 2 - .1, h, -d / 2 - .1, w / 2 + .1, h + .35, d / 2 + .1);
  if (step) box(m, -w * .45, h, -d * .45, -w * .05, h + 2.4, -d * .05);
  return m;
}
function meshTrunk(curve, sd) {
  rseed(300 + sd);
  const m = new Mesh(), pts = [], lean = rr(.2, .9);
  for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([lean * t * t + curve * sin(t * PI) * .5, t * 10, curve * .3 * sin(t * PI * 1.3)]); }
  m.tube(pts, (k) => .34 * (1.12 - .2 * k / 12) * (k === 0 ? 1.25 : 1), LV > 1 ? 6 : 9, true, (k) => .55 + .45 * k / 12);
  m.top = pts[12];
  return m;
}
function meshFarTrunk() { const m = new Mesh(); m.tube([[0, 0, 0], [.15, 5, 0], [.3, 10, 0]], (k) => .22 - k * .03, 5, true); return m; }
function meshDates() { rseed(320); return icosphere(1, (x, y, z) => { const r = .5 + .18 * fbm(x * 3, y * 3, z * 3, 2); return [x * r, y * r * 1.5 - .3, z * r]; }); }
function meshRock(sd, sub, round_) {
  if (LV > 1 && sub > 1) sub--;
  rseed(100 + sd);
  const pl = []; for (let i = 0; i < (round_ ? 0 : 8); i++) { const q = qRand(); const l = hypot(q[0], q[1], q[2]) || 1; pl.push([q[0] / l, q[1] / l, q[2] / l, rr(.5, .85)]); }
  return icosphere(sub, (x, y, z) => {
    const r = 1 + (fbm(x * 1.6 + sd, y * 1.6, z * 1.6, 2) - .5) * (round_ ? .5 : .9);
    let px = x * r, py = y * r * (round_ ? .75 : .7), pz = z * r;
    for (const p of pl) { const d = px * p[0] + py * p[1] + pz * p[2] - p[3]; if (d > 0) { px -= p[0] * d; py -= p[1] * d; pz -= p[2] * d; } }
    return [px, py, pz];
  });
}
function meshAcacia(sd) {
  rseed(340 + sd);
  const m = new Mesh(), tops = [];
  const trunk = [[0, 0, 0], [rr(-.2, .2), 1.2, rr(-.2, .2)]];
  m.tube([[0, -.2, 0], [0, .15, 0], trunk[1]], (k) => [.34, .2, .14][k], 7, false);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + rr(-.4, .4), r = rr(1.2, 2.4), h = rr(3, 4.2);
    const end = [cos(a) * r, h, sin(a) * r];
    m.tube([trunk[1], [end[0] * .4, h * .6, end[2] * .4], end], (k) => .12 - k * .035, 5, true);
    for (let j = 0; j < 5; j++) { const b = rnd() * TAU, l = rr(.9, 1.7), tip = [end[0] + cos(b) * l, end[1] + rr(-.1, .35), end[2] + sin(b) * l]; m.tube([end, tip], (k) => k ? .012 : .035, 3, false); tops.push(tip); }
  }
  m.tops = tops;
  return m;
}
function meshBird() {
  const m = new Mesh(), X = [.17, .1, 0, -.12, -.2], H = [.01, .045, .055, .04, .012];
  const rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(sin(a) * H[i] * .9, cos(a) * H[i], X[i], 0)); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  for (const sx of [-1, 1]) {
    const a = m.v(sx * .03, .02, .06, 0), b = m.v(sx * .03, .02, -.06, 0), c = m.v(sx * .36, .03, -.02, sx), d = m.v(sx * .3, .03, -.12, sx);
    m.quad(a, c, d, b);
  }
  const t0 = m.v(0, .01, -.18, 0), t1 = m.v(.07, .01, -.3, 0), t2 = m.v(-.07, .01, -.3, 0); m.tri(t0, t1, t2);
  return m;
}

// ---------------------------------------------------------------- instance stores
function makeWorld(D, T, NA, FAR, flyPts) {
  const gi = (x, y, z) => x + NX * (y + NY * z);
  const smp = T.smp;
  const Dw = (x, y, z) => smp((x - OX) / VS, (y - OY) / VS, (z - OZ) / VS);
  const nCells = CELLS * CELLS;
  const cellOf = (x, z) => clamp(floor((x - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((z - OZ) / CELLW), 0, CELLS - 1);
  const big = Array.from({ length: nCells }, () => []), small = Array.from({ length: nCells }, () => []), farL = [];
  let nth = 0;
  // leaf record: x y z length · yaw tilt halfwidth anchor-height · type seed1 seed2 bend
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { L[cellOf(x, z)].push(x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend); };
  const grass = (x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { if (!(nth++ % THIN)) leaf(small, x, y, z, len, yaw, tilt, wid * (1 + LV / 2), hA, type, s1, s2, bend); };
  const cells = Array.from({ length: 8 }, () => Array.from({ length: nCells }, () => []));
  const solids = [];
  // instance record: x y z scale · quaternion · material seed shrink-distance extra
  const solid = (mesh, x, y, z, sc, q, mat, seed, far = 0, ex = 0) => {
    if (mesh < 8) cells[mesh][cellOf(x, z)].push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, far, ex);
    else (solids[mesh] ||= []).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, far, ex);
  };
  const Q0 = [0, 0, 0, 1], yawQ = (a) => qAxis(0, 1, 0, a);
  const fh = farSampler(FAR.A);
  const farB = (x, z, c) => { const gx = clamp(round((x - FO) / FC), 0, FN - 1), gz = clamp(round((z - FO) / FC), 0, FN - 1); return FAR.B[(gx + FN * gz) * 4 + c]; };
  const nearA = (x, z, c) => { const ix = clamp(round(x - OX), 0, NX - 1), iz = clamp(round(z - OZ), 0, NZ - 1); return NA[(ix + NX * iz) * 4 + c]; };

  // --- surface queries
  const fl = [];
  const floorsAt = (x, z) => {
    const ix = clamp(round((x - OX) / VS), 1, NX - 2), iz = clamp(round((z - OZ) / VS), 1, NZ - 2);
    fl.length = 0; let ceil = 80;
    for (let gy = NY - 2; gy >= 0; gy--) {
      const d = D[gi(ix, gy, iz)], da = D[gi(ix, gy + 1, iz)];
      if (da <= 0 && d > 0) { const y = OY + (gy + d / (d - da)) * VS; fl.push(y, ceil - y); } else if (da > 0 && d <= 0) ceil = OY + (gy + 0.5) * VS;
    }
    return fl;
  };
  const gy = (x, z) => { if (max(abs(x), abs(z)) > 250) return fh(x, z); const f = floorsAt(x, z); return f.length ? f[0] : 0; };
  const pickV = () => ((rnd() * T.nv) | 0) * 3;
  const nearFly = (x, z, r, top = 26) => { for (const p of flyPts) if (p[1] < top && hypot(x - p[0], z - p[2]) < r) return true; return false; };
  const nearPose = (x, z, r = 3) => { for (const p of POSES) if (!p[6] && hypot(x - p[0], z - p[2]) < r) return true; return false; };
  const crownAbs = new Float32Array((NX / 2) * (NY / 2) * (NZ / 2));
  // shade the skylight volume under a roof or crown: world box x0..x1, z0..z1 at height y
  const shadeSky = (x0, z0, x1, z1, y, k) => {
    const hy = round((y - OY) / VS / 2);
    for (let hz = round((z0 - OZ) / 2); hz <= round((z1 - OZ) / 2); hz++) for (let hx = round((x0 - OX) / 2); hx <= round((x1 - OX) / 2); hx++) for (let dy = -1; dy <= 0; dy++) {
      const ay = hy + dy;
      if (hx > 0 && ay > 0 && hz > 0 && hx < NX / 2 - 1 && ay < NY / 2 - 1 && hz < NZ / 2 - 1) crownAbs[hx + NX / 2 * (ay + NY / 2 * hz)] += k;
    }
  };

  // --- buildings: the mosque, the household rooms, utum, houses. coll: x0 z0 x1 z1 top (world) for walking
  const coll = [], foot = [];
  for (const [x, z] of WELLS) foot.push(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
  const blocked = (x, z, m) => { for (let i = 0; i < foot.length; i += 4) if (x > foot[i] - m && x < foot[i + 2] + m && z > foot[i + 1] - m && z < foot[i + 3] + m) return true; return false; };
  const my = gy(MQ[0], MQ[1]) - .08;
  const addColl = (L, ox, oy, oz) => { for (let i = 0; i < L.length; i += 5) coll.push(L[i] + ox, L[i + 1] + oz, L[i + 2] + ox, L[i + 3] + oz, L[i + 4] + oy); };
  const LW = [], LR = [];
  const mqWalls = meshMosqueWalls(LW), mqTimber = meshMosqueTimber(), mqRoof = meshMosqueRoof(), mqRooms = meshRooms(LR);
  addColl(LW, MQ[0], my, MQ[1]); addColl(LR, MQ[0], my, MQ[1]);
  foot.push(MQ[0] - MW - 1, MQ[1] - MW - 1, MQ[0] + MW + 7, MQ[1] + MW + 1);
  solid(9, MQ[0], my, MQ[1], 1, Q0, 6, .1, 0, 0);
  solid(10, MQ[0], my, MQ[1], 1, Q0, 19, .2, 0, 0);
  solid(11, MQ[0], my, MQ[1], 1, Q0, 9, .3, 0, 0);
  solid(12, MQ[0], my, MQ[1], 1, Q0, 7, .4, 0, 0);
  shadeSky(MQ[0] - MW, MQ[1] + 13, MQ[0] + MW, MQ[1] + MW, my + MH, .5);
  shadeSky(MQ[0] - MW, MQ[1] - MW, MQ[0] - 3.3, MQ[1] - 20, my + 3.1, .5);
  // Quba: the same kind of enclosure, smaller, among palms to the south
  const qy = fh(QB[0], QB[1]) - .1;
  for (const [k, mat] of [[9, 6], [10, 19], [11, 9]]) solid(k, QB[0], qy, QB[1], .62, Q0, mat, .5, 0, 0);
  // utum
  rseed(14);
  for (const [x, z, h] of UTUM) {
    const y = gy(x, z), s = h / 12.2, a = rr(-.2, .2);
    solid(13, x, y - .1, z, s, yawQ(a), 8, rnd(), 0, 0);
    const r = 4.6 * s; coll.push(x - r, z - r, x + r, z + r, y + h); foot.push(x - r, z - r, x + r, z + r);
  }
  // houses in hamlets: each lane keeps an open corridor from its viewpoint, footprints keep 2.4 m apart
  rseed(15);
  const P3 = POSES[2], lane3 = (x, z) => { const ax = UTUM[0][0] - P3[0], az = UTUM[0][1] - P3[2], l2 = ax * ax + az * az, t = clamp(((x - P3[0]) * ax + (z - P3[2]) * az) / l2, 0, 1); return hypot(x - P3[0] - ax * t, z - P3[2] - az * t); };
  const house = (x, z, k, quarter, sc) => {
    const [w, d, h, kind] = HOUSE[k], ext = kind === 2 ? 5.5 : 0, y = gy(x, z) - .25;
    // local footprint (with the yard) rotated by quarter turns
    let x0 = -w / 2 * sc, x1 = w / 2 * sc, z0 = -d / 2 * sc, z1 = (d / 2 + ext) * sc;
    for (let i = 0; i < quarter; i++) { const a = x0, b = x1; x0 = -z1; x1 = -z0; z0 = a; z1 = b; }
    if (blocked(x + x0, z + z0, 2.4) || blocked(x + x1, z + z1, 2.4) || blocked(x + (x0 + x1) / 2, z + (z0 + z1) / 2, 2.4 + max(x1 - x0, z1 - z0) / 2)) return false;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      const X = x + px, Z = z + pz;
      if (lane3(X, Z) < 3.5 || nearPose(X, Z, 9) || nearFly(X, Z, 6, 15) || inPlot(X, Z, -3) || nearA(X, Z, 1) > .05 || nearA(X, Z, 3) > .15 || nearA(X, Z, 2) > .2 || max(abs(X), abs(Z)) > 236) return false;
    }
    solid(14 + k, x, y, z, sc, yawQ(-quarter * PI / 2 + rr(-.02, .02)), 7, rnd(), 0, 1);
    coll.push(x + x0, z + z0, x + x1, z + z1, y + h * sc + .3); foot.push(x + x0, z + z0, x + x1, z + z1);
    return true;
  };
  const HAMLETS = [[-75, -72, 42, 46, 30], [70, -62, 26, 42, 16], [0, -104, 46, 12, 9], [-50, 2, 14, 15, 5], [-165, -150, 30, 30, 8], [150, 205, 40, 30, 6]];
  for (const [cx, cz, rx, rz, n] of HAMLETS) {
    let placed = 0;
    for (let t = 0; t < n * 14 && placed < n; t++) {
      const x = cx + rr(-rx, rx), z = cz + rr(-rz, rz), k = (rnd() * 4.4 | 0) % 4;
      if (house(x, z, k, rnd() * 4 | 0, rr(.88, 1.15))) placed++;
    }
  }

  // --- date palms: trunk (3 curved meshes), crown of fronds in tiers, dead fronds hanging, date clusters
  const trunks = [meshTrunk(.25, 0), meshTrunk(.6, 1), meshTrunk(1.1, 2)];
  const palm = (x, z, H, young = 0) => {
    const y = gy(x, z) - .2, ti = (rnd() * 3) | 0, s = H / 10, yaw = rnd() * TAU, q = yawQ(yaw);
    const tp = trunks[ti].top, top = qrot3(q, [tp[0] * s, tp[1] * s, tp[2] * s]);
    const cx = x + top[0], cy = y + top[1], cz = z + top[2];
    solid(ti, x, y, z, s, q, 12, rnd(), 0, 0);
    const nF = (young ? 16 : 36) + (rnd() * (young ? 6 : 13) | 0), off = rnd() * TAU, ls = (young ? .7 : 1) * rr(.8, 1.15);
    for (let f = 0; f < nF; f++) {
      const t = f / nF, tilt = mix(.12, 1.5, pow(t, .7)) + rr(-.1, .1);
      const len = (4 + 1.4 * rnd()) * ls * mix(.78, 1.05, sqrt(t));
      leaf(big, cx, cy + .25, cz, len, off + f * 2.39996 + rr(-.12, .12), tilt, .42 * len / 4, H, 0, rnd(), rnd(), clamp(mix(.38, 1, t) + rr(-.1, .1), 0, 1));
    }
    if (!young) for (let f = 2 + (rnd() * 3 | 0); f > 0; f--) leaf(big, cx, cy - .3, cz, rr(2.6, 3.6), rnd() * TAU, rr(2.5, 2.9), .28, H, 1, rnd(), rnd(), .3);
    if (!young && H > 6.5) for (let k = 3 + (rnd() * 3 | 0); k > 0; k--) { const a = rnd() * TAU; solid(3, cx + cos(a) * .55, cy - .75 - rnd() * .3, cz + sin(a) * .55, rr(.2, .27), yawQ(rnd() * TAU), 13, rnd(), 80, H); }
    shadeSky(cx - 2.5, cz - 2.5, cx + 2.5, cz + 2.5, cy, .22 / 3);
  };
  const okPalm = (x, z, m = 4) => !(nearFly(x, z, 7) || nearPose(x, z, 7) || hypot(x - POSES[0][0], z - POSES[0][2]) < 15 || blocked(x, z, m) || WELLS.some((w) => hypot(x - w[0], z - w[1]) < 4));
  rseed(1);
  for (const p of PLOTS) {
    const sp = rr(6.5, 9), jx = rr(0, sp), jz = rr(0, sp), old = rr(.6, 1);
    for (let z = p[1] + 3 + jz % 3; z < p[3] - 2; z += sp) for (let x = p[0] + 3 + jx % 3; x < p[2] - 2; x += sp) {
      if (rnd() < .22) continue;
      const px = x + rr(-2.2, 2.2), pz = z + rr(-2.2, 2.2);
      if (!okPalm(px, pz)) continue;
      const young = rnd() < .18;
      palm(px, pz, young ? rr(2.2, 4.2) : rr(5, 17) * old * rr(.85, 1.1), young);
      if (!young && rnd() < .2) { const a = rnd() * TAU; palm(px + cos(a) * 1.3, pz + sin(a) * 1.3, rr(1.6, 2.6), 1); }
    }
  }
  // palms between the houses and around the open ground, never inside the mosque
  rseed(2);
  for (const [cx, cz, rx, rz, n] of HAMLETS) for (let i = 0; i < n * 2.2; i++) {
    const x = cx + rr(-rx - 8, rx + 8), z = cz + rr(-rz - 8, rz + 8);
    if (!okPalm(x, z, 3) || lane3(x, z) < 4 || nearA(x, z, 1) > .1 || nearA(x, z, 3) > .3) continue;
    palm(x, z, rr(7, 15));
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, r = rr(42, 75), x = MQ[0] + cos(a) * r, z = MQ[1] + sin(a) * r;
    if (z > MQ[1] + MW - 2 && abs(x - MQ[0]) < 20) continue;
    if (!okPalm(x, z, 3) || nearA(x, z, 1) > .1 || lane3(x, z) < 4) continue;
    palm(x, z, rr(8, 16));
  }
  for (const [x, z] of UTUM) for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = rr(8, 16), px = x + cos(a) * r, pz = z + sin(a) * r; if (okPalm(px, pz, 3) && nearA(px, pz, 1) < .1) palm(px, pz, rr(8, 15)); }
  // loose palms along the eastern edge beyond the lava
  for (let i = 0; i < 90; i++) { const x = rr(232, 252), z = rr(-200, 250); if (okPalm(x, z, 3) && nearA(x, z, 1) < .05) palm(x, z, rr(7, 15)); }
  // single palms along the wadi edge
  rseed(3);
  for (let i = 0; i < 70; i++) {
    const z = rr(-240, 240), x = wadiX(z) + (rnd() < .5 ? -1 : 1) * rr(24, 36);
    if (inPlot(x, z, -2) || !okPalm(x, z, 3) || nearA(x, z, 1) > .2) continue;
    palm(x, z, rr(7, 14));
  }

  // --- garden walls, earthen ditches, wells: one world-space mesh each
  const walls = new Mesh(), chan = new Mesh(), water = new Mesh(), well = new Mesh(), wood = new Mesh();
  rseed(4);
  for (const p of PLOTS) {
    const cs = [[p[0], p[1]], [p[2], p[1]], [p[2], p[3]], [p[0], p[3]]];
    for (let e = 0; e < 4; e++) {
      const a = cs[e], b = cs[(e + 1) % 4], L = hypot(b[0] - a[0], b[1] - a[1]), gate = rr(.2, .8), h0 = rr(1.25, 1.65);
      let pts = [];
      for (let t = 0; t <= L; t += 3) {
        const u = t / L, x = mix(a[0], b[0], u), z = mix(a[1], b[1], u);
        if (abs(u - gate) * L < 2.2 || (rnd() < .03 && pts.length)) { if (pts.length > 1) walls.sweep(pts, .55, h0, () => [0, 1, 0]); pts = []; continue; }
        const h = h0 * (1 - .3 * fbm(x * .35, 2, z * .35, 2));
        pts.push([x, gy(x, z) + h - h0 / 2 - .3, z]);
      }
      if (pts.length > 1) walls.sweep(pts, .55, h0, () => [0, 1, 0]);
    }
  }
  for (const c of CHANNELS) {
    const a = c[0], b = c[1], L = hypot(b[0] - a[0], b[1] - a[1]), side = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    for (let t = 0; t < L; t += 2) {
      const u0 = t / L, u1 = min(t + 2, L) / L;
      const p0 = [mix(a[0], b[0], u0), mix(a[1], b[1], u0)], p1 = [mix(a[0], b[0], u1), mix(a[1], b[1], u1)];
      const y0 = gy(...p0) + .06, y1 = gy(...p1) + .06;
      const v = [[p0[0] - side[0] * .34, y0, p0[1] - side[1] * .34], [p0[0] + side[0] * .34, y0, p0[1] + side[1] * .34], [p1[0] + side[0] * .34, y1, p1[1] + side[1] * .34], [p1[0] - side[0] * .34, y1, p1[1] - side[1] * .34]];
      const q = v.map((pp) => water.v(...pp)); water.quad(q[0], q[1], q[2], q[3]);
    }
  }
  for (const W of WELLS) {
    const y = gy(...W);
    lathe(well, [[1.25, -.3], [1.25, .85], [1.1, .95], [.85, .95], [.85, .3]], 16, W[0], y, W[1]);
    const c0 = water.v(W[0], y + .3, W[1]);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, b = (i + 1) / 12 * TAU; water.tri(c0, water.v(W[0] + cos(a) * .85, y + .3, W[1] + sin(a) * .85), water.v(W[0] + cos(b) * .85, y + .3, W[1] + sin(b) * .85)); }
    wood.sweep([[W[0] - 1.1, y + .4, W[1]], [W[0] - 1.1, y + 2.6, W[1]]], .16, .16, () => [1, 0, 0]);
    wood.sweep([[W[0] + 1.1, y + .4, W[1]], [W[0] + 1.1, y + 2.6, W[1]]], .16, .16, () => [1, 0, 0]);
    wood.sweep([[W[0] - 1.3, y + 2.5, W[1]], [W[0] + 1.3, y + 2.5, W[1]]], .2, .2, () => [0, 1, 0]);
    coll.push(W[0] - 1.3, W[1] - 1.3, W[0] + 1.3, W[1] + 1.3, y + .95);
  }
  const worldMeshes = { walls, chan, water, well, wood, mqWalls, mqTimber, mqRoof, mqRooms };
  solid(18, 0, 0, 0, 1, Q0, 5, .1, 0, 0); solid(19, 0, 0, 0, 1, Q0, 14, .2, 0, 0); solid(20, 0, 0, 0, 1, Q0, 15, .3, 0, 0);
  solid(21, 0, 0, 0, 1, Q0, 8, .4, 0, 0); solid(22, 0, 0, 0, 1, Q0, 16, .5, 0, 0);

  // --- far hamlets: mud houses and a few utum in clusters over the oasis
  rseed(5);
  for (let gz = -3300; gz < 3600; gz += 21) for (let gx = -3300; gx < 3300; gx += 21) {
    const x = gx + rr(-6, 6), z = gz + rr(-6, 6), c = farB(x, z, 0);
    if (c < .05 || rnd() > c * .2 || max(abs(x), abs(z)) < 262 || hypot(x - QB[0], z - QB[1]) < 50) continue;
    const t = rnd() < .03 ? 5 : (rnd() * 5) | 0, sc = rr(.85, 1.15), ang = floor(rnd() * 4) * PI / 2 + rr(-.08, .08);
    solid(26 + t, x, fh(x, z) - .3, z, sc, yawQ(ang), t === 5 ? 8 : 17, rnd(), 0, 1);
  }
  // far palm groves
  rseed(6);
  const farTrunk = (x, z, H) => {
    const y = fh(x, z) - .3, s = H / 10, yaw = rnd() * TAU, q = yawQ(yaw), top = qrot3(q, [.3 * s, 10 * s, 0]);
    solid(8, x, y, z, s, q, 18, rnd(), 0, 0);
    const off = rnd() * TAU, n = LV > 1 ? 7 : 10;
    for (let f = 0; f < n; f++) farL.push(x + top[0], y + top[1] + .2, z + top[2], rr(4, 5.2), off + f * 2.39996, mix(.4, 1.9, f / n), 2, H, 5, rnd(), rnd(), .55);
  };
  const cand = [];
  for (let gz = -2800; gz < 3200; gz += 10) for (let gx = -2800; gx < 2600; gx += 10) {
    const x = gx + rr(-5, 5), z = gz + rr(-5, 5);
    if (max(abs(x), abs(z)) < 258 || abs(x - QB[0]) < 26 && abs(z - QB[1]) < 26) continue;
    if (farB(x, z, 1) > .5 && rnd() < .9) cand.push(x, z);
  }
  const keepP = min(1, 36000 * 2 / cand.length);
  for (let i = 0; i < cand.length; i += 2) if (rnd() < keepP) farTrunk(cand[i], cand[i + 1], rr(7, 15));

  // --- wadi: acacias, cobbles, sand-loving shrubs
  rseed(7);
  const acacias = [meshAcacia(0), meshAcacia(1), meshAcacia(2)];
  // hand-placed acacias framing viewpoint 5 (forward, right of its view), then a scatter along the wadi
  const rel = (i, f, r) => { const p = POSES[i]; let fx = p[3] - p[0], fz = p[5] - p[2]; const l = hypot(fx, fz); fx /= l; fz /= l; return [p[0] + fx * f - fz * r, p[2] + fz * f + fx * r]; };
  const ACS = [rel(4, 15, -8), rel(4, 30, 10), rel(4, 48, -14), rel(4, 9, 13)];
  for (let i = 0; i < 18; i++) { const z = rr(-240, 240); ACS.push([wadiX(z) + rr(-16, 16), z]); }
  for (let i = 0; i < ACS.length; i++) {
    const [x, z] = ACS[i];
    if (nearFly(x, z, 7) || (i > 3 && nearPose(x, z, 5)) || blocked(x, z, 3)) continue;
    const k = (rnd() * 3) | 0, s = rr(.9, 1.4), y = gy(x, z), q = yawQ(rnd() * TAU);
    solid(23 + k, x, y - .1, z, s, q, 16, rnd(), 0, 0);
    for (const tp of acacias[k].tops) {
      const w = qrot3(q, tp.map((v) => v * s));
      for (let j = 0; j < 190; j++) {
        const a = rnd() * TAU, r = sqrt(rnd()) * 1.15 * s;
        leaf(big, x + w[0] + cos(a) * r, y + w[1] + rr(-.18, .22) - r * r * .05, z + w[2] + sin(a) * r, rr(.22, .38), rnd() * TAU, rr(1.2, 1.9), .07, 4, 4, rnd(), rnd(), .3);
      }
    }
  }
  rseed(8);
  for (let i = 0; i < 11000; i++) {
    const near5 = i < 260, c5 = rel(4, rr(5, 26), rr(-10, 10));
    const z = near5 ? c5[1] : rr(-250, 250), x = near5 ? c5[0] : wadiX(z) + rr(-22, 22), y = gy(x, z);
    if (nearFly(x, z, 1.5) || nearPose(x, z, 1.5) || fbm(x * .06, 5, z * .06, 2) < .55) continue;
    const sc = .05 + .28 * pow(rnd(), 2.6), q = qRand();
    if (!(nth++ % THIN)) solid(7, x, y - sc * .15, z, sc, q, 4, rnd(), 40, 0);
  }
  const shrub = (x, z, n, s) => {
    const y = gy(x, z), yw = rnd() * TAU;
    for (let j = 0; j < n; j++) grass(x + rr(-.2, .2), y - .05, z + rr(-.2, .2), rr(.25, .8) * s, yw + j * 2.4, rr(.2, 1.1), rr(.03, .06), 0, 3, rnd(), rnd(), rr(.3, .7));
  };
  rseed(9);
  for (const [f, r] of [[5, -3.5], [7, 3], [11, -1]]) { const p = rel(4, f, r); shrub(p[0], p[1], 16, 1.3); }
  for (let i = 0; i < 2600; i++) {
    const x = rr(-255, 255), z = rr(-255, 255);
    if (inPlot(x, z, -3) || blocked(x, z, 1.5) || nearFly(x, z, 2) || nearPose(x, z, 2) || (abs(x - MQ[0]) < MW + 8 && abs(z - MQ[1]) < MW + 6)) continue;
    const lava = nearA(x, z, 1), wadi = nearA(x, z, 3), gr = nearA(x, z, 2);
    if (rnd() > .25 + .5 * wadi + .25 * lava - .2 * gr) continue;
    shrub(x, z, 8 + (rnd() * 12 | 0), rr(.7, 1.3));
  }

  // --- grass and fallen fronds inside the gardens, thicker by the ditches
  rseed(10);
  for (const p of PLOTS) for (let i = (p[2] - p[0]) * (p[3] - p[1]) * .12 | 0; i > 0; i--) {
    const x = rr(p[0] + 1, p[2] - 1), z = rr(p[1] + 1, p[3] - 1);
    if (nearPose(x, z, 1.2) || blocked(x, z, .5) || rnd() > .35 + .6 * fbm(x * .08, 4, z * .08, 2)) continue;
    const y = gy(x, z), yw = rnd() * TAU;
    for (let j = 0; j < 4; j++) grass(x + rr(-.15, .15), y - .03, z + rr(-.15, .15), rr(.2, .55), yw + j * 1.6, rr(.1, .7), rr(.025, .05), 0, 2, rnd(), rnd(), rr(.3, .8));
  }
  for (const c of CHANNELS) {
    const a = c[0], b = c[1], L = hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < L; t += .45) for (const s of [-1, 1]) {
      const u = t / L, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, o = s * rr(.85, 1.8), x = mix(a[0], b[0], u) + nx * o, z = mix(a[1], b[1], u) + nz * o;
      if (rnd() < .4) continue;
      const y = gy(x, z);
      for (let j = 0; j < 3; j++) grass(x, y - .03, z, rr(.25, .75), rnd() * TAU, rr(.05, .6), rr(.025, .05), 0, 2, rnd(), rnd(), rr(.3, .8));
    }
  }
  rseed(11);
  for (let i = 0; i < 260; i++) {
    const p = PLOTS[(rnd() * PLOTS.length) | 0], x = rr(p[0] + 2, p[2] - 2), z = rr(p[1] + 2, p[3] - 2);
    if (nearPose(x, z, 2.5) || blocked(x, z, 1)) continue;
    leaf(big, x, gy(x, z) + .08, z, rr(2.2, 3.4), rnd() * TAU, PI / 2 - rr(0, .12), .42, 0, 1, rnd(), rnd(), .2);
  }

  // --- litter on the open ground: fallen fronds and stones, a few thorny tufts by the wadi viewpoint
  rseed(16);
  for (let i = 0; i < 1400; i++) {
    const x = rr(-240, 240), z = rr(-240, 240);
    if (inPlot(x, z, -1) || blocked(x, z, 1) || nearA(x, z, 1) > .1 || nearPose(x, z, 1.5) || (abs(x - MQ[0]) < MW + 1 && abs(z - MQ[1]) < MW + 1)) continue;
    const y = gy(x, z);
    if (rnd() < .3) leaf(big, x, y + .06, z, rr(1.8, 3.2), rnd() * TAU, PI / 2 - rr(0, .1), .4, 0, 1, rnd(), rnd(), .2);
    else for (let k = 0; k < 4; k++) { const sc = .06 + .16 * pow(rnd(), 2), px = x + rr(-.8, .8), pz = z + rr(-.8, .8); if (!(nth++ % THIN)) solid(7, px, y - sc * .2, pz, sc, qRand(), 4, rnd(), 45, 0); }
  }
  for (const [f, r] of [[3.5, 2.2], [4.5, -3.8], [8, 5.5], [6, -1.4]]) { const p = rel(4, f, r); shrub(p[0], p[1], 22, 1.1); }

  // --- rocks: basalt rubble at the lava front, granite boulders on the hill, cobbles
  rseed(12);
  for (let i = 0; i < 70000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (max(abs(x), abs(z)) > 248 || nearFly(x, z, 2.5) || nearPose(x, z, 2.5) || blocked(x, z, .5)) continue;
    const lava = nearA(x, z, 1), gr = nearA(x, z, 2);
    const q = qRand();
    if (lava > .1 && rnd() < (sstep(.5, .95, lava) * .9 + (lava < .5 ? .35 : 0)) * (1 - sstep(200, 246, max(abs(x), abs(z))))) {
      const sc = (.2 + 1.4 * pow(rnd(), 3) + (rnd() < .04 && !nearPose(x, z, 22) ? rr(1.2, 2.6) : 0)) * (ny > .8 ? .75 : 1), bigR = sc > 1;
      solid(bigR ? 5 : 4, x - T.wn[k] * sc * .3, y - ny * sc * .3, z - T.wn[k + 2] * sc * .3, sc, q, 2, rnd(), bigR ? 0 : 110, 0);
    } else if (gr > .3 && rnd() < gr * .25) {
      const sc = .3 + 1.3 * pow(rnd(), 2);
      solid(6, x - T.wn[k] * sc * .35, y - ny * sc * .35, z - T.wn[k + 2] * sc * .35, sc, q, 3, rnd(), 0, 0);
    } else if (rnd() < .05 && !inPlot(x, z, -1) && !(abs(x - MQ[0]) < MW + 2 && abs(z - MQ[1]) < MW + 2)) {
      const sc = .05 + .25 * pow(rnd(), 2);
      if (!(nth++ % THIN)) solid(7, x, y - sc * .2, z, sc, q, 4, rnd(), 45, 0);
    }
  }

  // --- life: a few doves circling over the oasis
  rseed(13);
  const birds = [];
  for (const f of [[MQ[0] + 20, 32, MQ[1] - 30, 45, 12, 1], [-60, 26, 120, 40, 9, -1], [70, 40, -150, 60, 10, 1], [-150, 22, -40, 40, 6, -1]]) {
    const ss_ = rnd();
    for (let i = 0; i < f[4]; i++) birds.push(f[0], f[1], f[2], f[3], ss_ + rnd() * .2, f[5] * rr(.9, 1.1) * 7 / f[3], rr(.9, 1.15), rnd());
  }
  const motes = new Float32Array(4000 * 4);
  for (let i = 0; i < motes.length; i++) motes[i] = rnd();

  // --- packing
  const pack = (L) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += L[c].length / 12; }
    start[nCells] = n;
    const buf = new ArrayBuffer(n * 36), f = new Float32Array(buf), u8 = new Uint8Array(buf), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12, k++) {
      for (let j = 0; j < 8; j++) f[k * 9 + j] = a[i + j];
      u8[k * 36 + 32] = a[i + 8]; u8[k * 36 + 33] = a[i + 9] * 255; u8[k * 36 + 34] = a[i + 10] * 255; u8[k * 36 + 35] = a[i + 11] * 255;
      const y = a[i + 1], l = a[i + 3]; if (y - l < lo[c]) lo[c] = y - l; if (y + l > hi[c]) hi[c] = y + l;
    } }
    return { buf, n, start, lo, hi };
  };
  const packFlat = (a) => { const L = Array.from({ length: nCells }, (_, c) => c ? [] : a); return pack(L); };
  const packC = (L) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += L[c].length / 12; }
    start[nCells] = n;
    const data = new Float32Array(n * 12), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12) { for (let j = 0; j < 12; j++) data[k++] = a[i + j]; lo[c] = min(lo[c], a[i + 1] - 4); hi[c] = max(hi[c], a[i + 1] + 18); } }
    return { data, n, start, lo, hi };
  };

  // --- half-res volume: r = openness, g = skylight (palm crowns and roofs shade what is under them)
  const hx = NX / 2, hy = NY / 2, hz = NZ / 2, volD = new Uint8Array(hx * hy * hz * 2);
  let Lp = new Float32Array(hx * hz).fill(1), Ln = new Float32Array(hx * hz), tmp = new Float32Array(hx * hz);
  for (let y = hy - 1; y >= 0; y--) {
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) { const i = x + hx * z; tmp[i] = (Lp[x > 0 ? i - 1 : i] + 2 * Lp[i] + Lp[x < hx - 1 ? i + 1 : i]) * 0.25; }
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) {
      const i = x + hx * z, b = (tmp[z > 0 ? i - hx : i] + 2 * tmp[i] + tmp[z < hz - 1 ? i + hx : i]) * 0.25;
      const g0 = gi(x * 2, y * 2, z * 2);
      const d = (D[g0] + D[g0 + 1] + D[g0 + NX] + D[g0 + NX + 1] + D[g0 + NX * NY] + D[g0 + NX * NY + 1] + D[g0 + NX * NY + NX] + D[g0 + NX * NY + NX + 1]) * 0.125;
      const o = x + hx * (y + hy * z);
      const l = b * clamp(0.5 - d / 1.5, 0, 1) * (1 - min(crownAbs[o], 0.75));
      Ln[i] = l;
      volD[o * 2] = clamp(0.5 - d / 10, 0, 1) * 255; volD[o * 2 + 1] = min(1, b) * 255;
    }
    const t = Lp; Lp = Ln; Ln = t;
  }

  // damp earth within a metre or so of a ditch
  const ditch = (x, z) => { let d = 9; for (const [a, b] of CHANNELS) { const ax = b[0] - a[0], az = b[1] - a[1], t = clamp(((x - a[0]) * ax + (z - a[1]) * az) / (ax * ax + az * az), 0, 1); d = min(d, hypot(x - a[0] - ax * t, z - a[1] - az * t)); } return .8 * (1 - sstep(.7, 1.6, d)); };
  // --- maps: near (1 m): wadi sand, basalt, granite, irrigated soil · far (~23 m): basalt, granite, hamlets, groves
  const nm = new Uint8Array(NX * NZ * 4);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = OX + i, z = OZ + j, o = (i + NX * j) * 4, a = (i + NX * j) * 4;
    nm[o] = NA[a + 3] * 255; nm[o + 1] = NA[a + 1] * 255; nm[o + 2] = NA[a + 2] * 255;
    nm[o + 3] = max(inPlot(x, z, .4) ? .55 + .45 * fbm(x * .07, 3, z * .07, 2) : 0, ditch(x, z)) * 255;
  }
  const fmap = new Uint8Array(FN * FN * 4);
  for (let k = 0; k < FN * FN; k++) { fmap[k * 4] = FAR.A[k * 4 + 1] * 255; fmap[k * 4 + 1] = FAR.A[k * 4 + 2] * 255; fmap[k * 4 + 2] = FAR.B[k * 4] * 255; fmap[k * 4 + 3] = FAR.B[k * 4 + 1] * 255; }

  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < NSOLID; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  return { gy, fh, trunks, acacias, worldMeshes, cells: cells.map(packC), big: pack(big), small: pack(small), far: packFlat(farL),
    solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, birds: new Float32Array(birds), motes, volD, nm, fmap, coll: new Float32Array(coll) };
}
const qrot3 = (q, v) => {
  const [x, y, z, w] = q, cx = y * v[2] - z * v[1] + w * v[0], cy = z * v[0] - x * v[2] + w * v[1], cz = x * v[1] - y * v[0] + w * v[2];
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)];
};
