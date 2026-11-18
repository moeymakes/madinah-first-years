// ============================================================================
// WGSL sources
// ============================================================================
// Noise, detail texture, blit/bloom and the composite chain follow Abyssal Garden (MIT); the air, sky, terrain
// materials, palms, buildings and birds are this world's own.

// the first mosque's courtyard centre and Quba (x, z), shared by the ground model, materials and layout
const MQ = [0, -40], QB = [-380, 2500];
// smoothstep lives in its own string so modules that already have it (via S_G) can take the noise without it
const W_SS = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
`;
const W_NOISE = /*wgsl*/`
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;

// ---------------------------------------------------------------- near-field rock density (compute)
// M holds the CPU ground model per column: x height, y basalt mask, z granite mask (masks fade to 0 at the
// box edge, so the near surface meets the far heightmap there).
const W_DENS = W_SS + W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> D: array<f32>;
@group(0) @binding(2) var<storage, read> M: array<vec4f>;
fn colAt(x: f32, z: f32) -> vec4f {
  let fx = clamp(x, 0., f32(u.n.x) - 1.001); let fz = clamp(z, 0., f32(u.n.z) - 1.001);
  let ix = u32(fx); let iz = u32(fz); let tx = fx - f32(ix); let tz = fz - f32(iz); let w = u.n.x;
  return mix(mix(M[ix + w * iz], M[ix + 1u + w * iz], tx), mix(M[ix + w * (iz + 1u)], M[ix + 1u + w * (iz + 1u)], tx), tz);
}
fn dens(p: vec3f, gx: f32, gz: f32) -> f32 {
  let ef = ss(0., 16., min(min(gx, f32(u.n.x) - 1. - gx), min(gz, f32(u.n.z) - 1. - gz)));
  let m = colAt(gx, gz) * vec4f(1., ef, ef, 1.);
  var d = m.x - p.y;
  let w = vec3f(fbm(p * .05 + 11., 2), fbm(p * .05 + 47., 2), fbm(p * .05 + 83., 2)) - .5;
  if (m.y > .001) {
    // basalt: jointed blocks with a rough clinker crust, the cooling joints bite deeper near the flow front
    let q = p + w * 5.;
    let blk = (.5 - wor(q * vec3f(.3, .42, .3))) * 1.7;
    d += m.y * (blk + (fbm(p * .75, 3) - .5) * 1.1 + (fbm(p * 2.6, 2) - .5) * .55);
  }
  if (m.z > .001) {
    // granite: rounded tors and exfoliating slabs
    let q = p + w * 3.;
    d += m.z * ((.5 - wor(q * .085)) * 6.5 + (fbm(p * .22, 3) - .5) * 2.4 + (abs(fract(p.y * .33 + w.x) - .5) - .25) * .7);
  }
  d += (fbm(p * .9, 2) - .5) * .03 * (1. - m.y) * ef;
  return d;
}
@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id >= u.n.xyz)) { return; }
  var d = dens(u.o.xyz + vec3f(id) * u.o.w, f32(id.x), f32(id.z));
  if (id.y == u.n.y - 1u) { d = -1.; }
  if (id.y == 0u) { d = 1.; }
  D[id.x + u.n.x * (id.y + u.n.y * id.z)] = d;
}
`;

// ---------------------------------------------------------------- ground model (compute, load time)
// One function for the whole 24 km world, sampled twice: 1 m over the near field and ~23 m over everything.
// A = height, basalt, granite, wadi sand · B = hamlet ground, palm groves
const W_GROUND = W_SS + W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> A: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> B: array<vec4f>;
// scoria cones on the harrat: x, z, height, radius
const CONES = array<vec4f, 8>(vec4f(1800., -600., 70., 260.), vec4f(2600., 900., 90., 320.), vec4f(1400., 1700., 55., 220.),
  vec4f(3200., -2200., 80., 300.), vec4f(900., 2600., 60., 240.), vec4f(2200., 2400., 75., 280.), vec4f(3800., 300., 95., 340.), vec4f(1100., 650., 35., 160.));
// granite knolls in the near field (the climbable hill of viewpoint 4): x, z, height, radius
const KN = array<vec4f, 3>(vec4f(95., 165., 0., 1.), vec4f(128., 192., 0., 1.), vec4f(70., 205., 0., 1.));
fn wadiX(z: f32) -> f32 { return -150. + 30. * sin(z * .009) + 14. * sin(z * .0023 + 1.); }
fn lavaFront(z: f32) -> f32 { return 118. + 16. * sin(z * .014) + 9. * sin(z * .041 + 2.); }
fn ridged(p: vec2f, s: f32) -> f32 { return 1. - abs(fbm(vec3f(p * s, 5.), 4) * 2. - 1.); }
fn massif(p: vec2f, c: vec2f, ang: f32, L: f32, W: f32) -> f32 {
  let r = p - c; let a = vec2f(cos(ang), sin(ang));
  let lx = dot(r, a) / L; let lz = dot(r, vec2f(-a.y, a.x)) / W;
  return pow(max(1. - lx * lx - lz * lz, 0.), 1.2);
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.n.x || id.y >= u.n.y) { return; }
  let x = u.o.x + f32(id.x) * u.o.z; let z = u.o.y + f32(id.y) * u.o.z; let p2 = vec2f(x, z);
  var h = 3.5 * (fbm(vec3f(x * .0013, 1.3, z * .0013), 3) - .5) + (fbm(vec3f(x * .011, 2.1, z * .011), 2) - .5);
  let wd = abs(x - wadiX(z)) + 6. * (fbm(vec3f(x * .03, 4., z * .03), 2) - .5);
  let wadi = ss(26., 8., wd) * ss(-1100., -700., z);
  h -= 2.3 * wadi;
  var gran = 0.;
  for (var k = 0; k < 3; k++) {
    let c = KN[k]; let d = distance(p2, c.xy) / (c.w * 1.35); let kk = max(1. - d * d, 0.);
    h += c.z * pow(kk, 1.7); gran = max(gran, ss(.04, .3, kk) * step(1., c.z));
  }
  let lf = x - lavaFront(z) - 7. * (fbm(vec3f(x * .02, 3., z * .02), 2) - .5);
  // the near lava is a lobe that ends inside the walkable land, so the edge of the detailed ground never cuts it
  let lob = (length((p2 - vec2f(176., -10.)) / vec2f(58., 175.)) - 1.) * 70. + 70. * (fbm(vec3f(x * .011, 23., z * .011), 3) - .5);
  let lavN = ss(-1.5, 3.5, lf) * ss(26., 0., lob) * ss(246., 228., x) * ss(246., 225., abs(z));
  let lavF = ss(0., 380., x - 650. - 300. * sin(z * .0006) - 420. * (fbm(vec3f(x * .0012, 8., z * .0012), 3) - .5)) * ss(-2600., -1700., z);
  let lavS = ss(0., 600., x + z * .6 - 1900.);
  // Harrat al-Wabara beyond Wadi al-Aqiq to the west
  let lavW = ss(0., 500., -x - 2300. - 260. * sin(z * .0007) - 380. * (fbm(vec3f(x * .0011, 18., z * .0011), 3) - .5)) * ss(-3600., -2600., z);
  let lavB = max(max(lavF, lavS), lavW);
  var lava = max(lavN, lavB);
  h += 6.5 * lava * (.8 + .4 * fbm(vec3f(x * .01, 6., z * .01), 2)) + 9. * lavB * (fbm(vec3f(x * .007, 14., z * .007), 3) - .5);
  h += 7. * ss(.05, .35, lavB) * ss(.95, .6, lavB) * (.5 + fbm(vec3f(x * .02, 15., z * .02), 2)) * ss(300., 500., max(abs(x), abs(z)));
  for (var k = 0; k < 8; k++) {
    let c = CONES[k]; let d = distance(p2, c.xy);
    if (d < c.w) {
      h += c.z * pow(1. - d / c.w, 1.3) - c.z * .3 * pow(max(1. - d / (c.w * .2), 0.), 2.);
      lava = max(lava, ss(c.w, c.w * .7, d));
    }
  }
  let uh = massif(p2, vec2f(300., -4300.), .12, 2800., 820.);
  h += 730. * uh * (.32 + .68 * pow(ridged(p2, .0011), 1.4)) + 140. * uh * (ridged(p2 + 300., .0036) - .55) + 60. * uh * (fbm(vec3f(x * .009, 7., z * .009), 3) - .5);
  let ay = massif(p2, vec2f(-700., 4300.), -.08, 2000., 620.);
  h += 240. * ay * (.5 + .5 * ridged(p2 + 900., .0013));
  // Jabal Sal', a low rocky hill close to the north-west
  let sl = massif(p2, vec2f(-600., -650.), .45, 430., 210.);
  // basalt hill: crags on the crest and gullies down the flanks, so it never reads as a smooth dome
  h += 85. * sl * (.3 + .7 * pow(ridged(p2 + 50., .006), 1.3)) + 34. * sl * (ridged(p2 + 90., .018) - .5) + 16. * sl * (ridged(p2 + 170., .045) - .5) + 10. * sl * (fbm(vec3f(x * .05, 19., z * .05), 2) - .5);
  lava = max(lava, ss(0., .05, sl));
  gran = max(gran, ss(0., .08, uh + ay));
  let r = length(p2);
  let rim = ss(6500., 11000., r) * (.45 + .75 * fbm(vec3f(x * .0005, 9., z * .0005), 3));
  h += 300. * rim; gran = max(gran, ss(.1, .3, rim) * .8);
  h = mix(h, .3, ss(72., 46., distance(p2, vec2f(${MQ}))));
  h = mix(h, .4, ss(60., 34., distance(p2, vec2f(${QB}))));
  let outNear = ss(300., 340., max(abs(x), abs(z)));
  let oasis = ss(3300., 1900., length((p2 - vec2f(-150., 600.)) * vec2f(1., .62)));
  var settle = ss(.6, .72, fbm(vec3f(x * .0032, 21., z * .0032), 2)) * oasis * (1. - lava) * (1. - gran) * (1. - wadi * .9) * outNear;
  settle = max(settle, ss(110., 50., distance(p2, vec2f(${QB}))) * .7 * outNear);
  // groves in patches over the oasis core, open sand between them
  var palms = ss(.56, .6, fbm(vec3f(x * .0035, 11., z * .0035), 3)) * ss(2700., 1500., length((p2 - vec2f(-100., 400.)) * vec2f(1., .8)));
  palms = max(palms, ss(.55, .7, fbm(vec3f(x * .003, 13., z * .003), 2)) * .3 * ss(4500., 3000., r));
  // a dense ring of groves just outside the walkable land hides where its detailed ground ends
  palms = max(palms, ss(560., 360., max(abs(x), abs(z))) * ss(.3, .45, fbm(vec3f(x * .012, 25., z * .012), 2)));
  palms *= (1. - lava) * (1. - gran) * outNear * (1. - ss(.3, .6, settle));
  A[id.x + u.n.x * id.y] = vec4f(h, lava, gran, wadi);
  B[id.x + u.n.x * id.y] = vec4f(settle, palms, 0., 0.);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// ---------------------------------------------------------------- physically based atmosphere (Hillaire 2020)
// Rayleigh + Mie + ozone in km, Earth radius 6360 km. the oasis sits ~600 m up in dusty desert air, so the Mie
// (aerosol) density is a few times the clear-sky value and its absorption leans blue, which is what makes the haze
// warm. The same media drive the sun colour (CPU, below), the sky (LUTs, main.js) and the aerial perspective.
// turb: aerosol multiple of a clear sky. haze: the dusty boundary layer over the city (per km, ~1 km deep) that
// makes Uhud and the far harrat fade; dust: the 70 m ground layer (dawn mist lies thicker in the hollows)
const ATM = { turb: [7, 8, 12][TOD], haze: [.06, .075, .04][TOD], dust: [1.6, 1.3, 1][TOD], alt: .62 };
const ATM_BR = [5.802e-3, 13.558e-3, 33.1e-3], ATM_BO = [.65e-3, 1.881e-3, .085e-3];
const ATM_BMS = 3.996e-3 * ATM.turb, ATM_BME = [4.5e-3, 4.75e-3, 5.2e-3].map((v) => v * ATM.turb);
const SUNV = TP.sun.map((c) => c / hypot(...TP.sun));
// sun transmittance from altitude h (km) to space, integrated on the CPU with the same media as the LUTs
const atmT = (h) => {
  const N = 600, r0 = 6360 + h, mu = SUNV[1], R2 = 6460 * 6460;
  const tmax = -r0 * mu + sqrt(r0 * r0 * (mu * mu - 1) + R2), dt = tmax / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + .5) * dt, x = t * sqrt(1 - mu * mu), y = r0 + t * mu, hh = hypot(x, y) - 6360;
    const dr = exp(-hh / 8), dm = exp(-hh / 1.2), dz = max(0, 1 - abs(hh - 25) / 15);
    for (let c = 0; c < 3; c++) od[c] += (ATM_BR[c] * dr + ATM_BME[c] * dm + ATM_BO[c] * dz) * dt;
  }
  return od.map((v) => exp(-v));
};
// the solar scale keeps each preset's sun brightness; the hue now comes from the air it passes through. At night the
// moon gets a blue Purkinje tint, as the eye sees moonlight, so the night keeps its look.
const ATM_TS = atmT(ATM.alt), ATM_T6 = atmT(6), lum3 = (v) => v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
const ATM_NT = TP.night ? [.62, .78, 1.3] : [1, 1, 1];
const ATM_S = lum3(TP.sunc) / lum3(ATM_TS);
const SUNCP = ATM_TS.map((v, c) => v * ATM_S * ATM_NT[c] * (TP.night ? .7 : 1)), CLOUDSUN = ATM_T6.map((v, c) => v * ATM_S * ATM_NT[c]);
const f3 = (v) => v.map((x) => x.toPrecision(5)).join(', ');
const W_ATMC = /*wgsl*/`
const RG = 6360.; const RT = 6460.; const HR = 8.; const HM = 1.2; const MG = .76;
const BR = vec3f(${f3(ATM_BR)}); const BO = vec3f(${f3(ATM_BO)});
const BMS = vec3f(${ATM_BMS.toPrecision(5)}); const BME = vec3f(${f3(ATM_BME)});
const SUNL = vec3f(${f3(SUNV)}); const ALT = ${ATM.alt};
const PI = 3.1415927;
struct Md { sr: vec3f, sm: vec3f, e: vec3f };
fn medium(h: f32) -> Md {
  let dr = exp(-h / HR); let dm = exp(-h / HM);
  return Md(BR * dr, BMS * dm, BR * dr + BME * dm + BO * max(0., 1. - abs(h - 25.) / 15.));
}
fn phR(mu: f32) -> f32 { return .0596831 * (1. + mu * mu); }
fn phG(mu: f32, g: f32) -> f32 { let g2 = g * g; return .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(max(1. + g2 - 2. * g * mu, 1e-4), 1.5)); }
fn phM(mu: f32) -> f32 { return phG(mu, MG); }
fn tUV(r: f32, mu: f32) -> vec2f {
  let H = sqrt(RT * RT - RG * RG); let rho = sqrt(max(r * r - RG * RG, 0.));
  let d = max(-r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.)), 0.);
  let dmin = RT - r; let dmax = rho + H;
  return vec2f((d - dmin) / (dmax - dmin), rho / H);
}
// sky-view LUT: u = azimuth from the sun's vertical plane (0..pi, the sky is symmetric about it), v = elevation,
// squeezed toward the horizon where the colour changes fastest
fn svUV(rd: vec3f) -> vec2f {
  let h = vec2f(rd.x, rd.z); let s = vec2f(SUNL.x, SUNL.z);
  let az = acos(clamp(dot(h, s) / max(length(h) * length(s), 1e-5), -1., 1.)) / PI;
  let e = asin(clamp(rd.y, -1., 1.)) / (PI * .5);
  return vec2f(az, .5 + .5 * sign(e) * sqrt(abs(e)));
}
`;
// LUT passes, run once at load (the sun does not move)
const W_ATMLUT = W_FS + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var tT: texture_2d<f32>;
@group(0) @binding(1) var tM: texture_2d<f32>;
@group(0) @binding(2) var sL: sampler;
fn trans(r: f32, mu: f32) -> vec3f {
  if (mu < 0. && r * r * (mu * mu - 1.) + RG * RG >= 0.) { return vec3f(0.); }
  return textureSampleLevel(tT, sL, tUV(r, mu), 0.).rgb;
}
fn hitR(r: f32, mu: f32, R: f32) -> f32 { let d = r * r * (mu * mu - 1.) + R * R; return select(-1., -r * mu - sqrt(max(d, 0.)), d >= 0.); }
fn tmaxOf(r: f32, mu: f32) -> f32 {
  let g = hitR(r, mu, RG);
  if (mu < 0. && g > 0.) { return g; }
  return -r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.));
}
@fragment fn fsT(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(256., 64.);
  let H = sqrt(RT * RT - RG * RG); let rho = H * uv.y; let r = sqrt(rho * rho + RG * RG);
  let dmin = RT - r; let dmax = rho + H; let d = dmin + uv.x * (dmax - dmin);
  let mu = clamp(select((H * H - rho * rho - d * d) / (2. * r * d), 1., d <= 0.), -1., 1.);
  var od = vec3f(0.); let dt = d / 40.;
  for (var i = 0; i < 40; i++) {
    let t = (f32(i) + .5) * dt; let hh = sqrt(r * r + t * t + 2. * r * mu * t) - RG;
    od += medium(hh).e * dt;
  }
  return vec4f(exp(-od), 1.);
}
// multiple scattering (Hillaire 2020 sec. 5.5): second-order light from 64 directions, as a geometric series
@fragment fn fsM(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 32.; let mus = uv.x * 2. - 1.; let r = RG + uv.y * (RT - RG) + .01;
  let sd = vec3f(sqrt(1. - mus * mus), mus, 0.);
  var L2 = vec3f(0.); var fm = vec3f(0.);
  for (var i = 0; i < 8; i++) { for (var j = 0; j < 8; j++) {
    let th = PI * 2. * (f32(i) + .5) / 8.; let ph = acos(1. - 2. * (f32(j) + .5) / 8.);
    let rd = vec3f(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    let tm = tmaxOf(r, rd.y); let dt = tm / 20.;
    var T = vec3f(1.); var L = vec3f(0.); var f = vec3f(0.);
    for (var k = 0; k < 20; k++) {
      let p = vec3f(0., r, 0.) + rd * (f32(k) + .5) * dt; let pr = length(p);
      let m = medium(pr - RG); let s = m.sr + m.sm; let e = max(m.e, vec3f(1e-7));
      let st = trans(pr, dot(p / pr, sd));
      let x = (vec3f(1.) - exp(-e * dt)) / e;
      L += T * s * st * .0795775 * x; f += T * s * x;
      T *= exp(-e * dt);
    }
    if (hitR(r, rd.y, RG) > 0. && rd.y < 0.) {
      let gp = vec3f(0., r, 0.) + rd * tm; let gn = normalize(gp);
      L += T * trans(RG, dot(gn, sd)) * max(dot(gn, sd), 0.) * .3 / PI;
    }
    L2 += L / 64.; fm += f / 64.;
  } }
  return vec4f(L2 / (vec3f(1.) - fm), 1.);
}
@fragment fn fsS(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(192., 108.);
  let az = uv.x * PI; let v = uv.y * 2. - 1.; let e = sign(v) * v * v * PI * .5;
  let sh = normalize(vec2f(SUNL.x, SUNL.z)); let ch = vec2f(-sh.y, sh.x);
  let hd = sh * cos(az) + ch * sin(az);
  let rd = vec3f(hd.x * cos(e), sin(e), hd.y * cos(e));
  let r = RG + ALT; let tm = tmaxOf(r, rd.y); let mu = dot(rd, SUNL);
  let pR = phR(mu); let pM = phM(mu);
  var T = vec3f(1.); var L = vec3f(0.); var t0 = 0.;
  for (var k = 0; k < 40; k++) {
    let t1 = tm * pow((f32(k) + 1.) / 40., 2.); let dt = t1 - t0; let t = (t0 + t1) * .5; t0 = t1;
    let p = vec3f(0., r, 0.) + rd * t; let pr = length(p); let up = p / pr;
    let m = medium(pr - RG); let e = max(m.e, vec3f(1e-7));
    let ms = textureSampleLevel(tM, sL, vec2f(dot(up, SUNL) * .5 + .5, (pr - RG) / (RT - RG)), 0.).rgb;
    let S = (m.sr * pR + m.sm * pM) * trans(pr, dot(up, SUNL)) + (m.sr + m.sm) * ms;
    L += T * S * (vec3f(1.) - exp(-e * dt)) / e;
    T *= exp(-e * dt);
  }
  return vec4f(L, 1.);
}
`;

// surface detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_SS + W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;

// ---------------------------------------------------------------- shared: uniforms, sky, air
const S_G = /*wgsl*/`
// pvp: last frame's unjittered view-projection; jit: xy this frame's projection jitter in NDC, z history reset (1), w frame
// amb: sky light on an up-facing white surface, integrated from the sky-view LUT at load; smc: the far oasis light matrix
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, pvp: mat4x4f, jit: vec4f, amb: vec4f, smc: mat4x4f };
const SUNC = vec3f(${f3(SUNCP)}); const CLOUDSUN = vec3f(${f3(CLOUDSUN)});
// sky radiance per unit of the LUT: pi * solar scale, because surfaces here take SUNC as irradiance / pi
const SKYS = vec3f(${f3(ATM_NT.map((v) => v * ATM_S * PI * (TP.night ? .45 : 1)))});
const BAND = vec3f(${TP.band.join(', ')}); const AMBC = vec3f(${TP.ambc.join(', ')});
const NIGHT = ${TP.night}.;
const TAU = 6.2831853;
const LUMA = vec3f(.2126, .7152, .0722);
const NEARH = 256.;
const LOW = ${LV > 1};
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(60.)), 1.); }
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
// palms sway as a whole from the root: the same offset moves trunk tops and their fronds together
fn palmSway(b: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(b, vec2f(.043, .029));
  let gust = .65 + .35 * sin(t * .23 + b.x * .004 + b.y * .003);
  return .0045 * pow(max(h, 0.), 1.5) * gust * vec2f(sin(t * .8 + ph) + .3 * sin(t * 1.9 + ph * 2.), .6 * cos(t * .63 + ph * 1.3));
}
`;

const S_B = S_G + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tD: texture_2d<f32>;
@group(0) @binding(6) var tV: texture_3d<f32>;
@group(0) @binding(7) var tN: texture_2d<f32>;
@group(0) @binding(8) var tF: texture_2d<f32>;
@group(0) @binding(9) var tSV: texture_2d<f32>;
@group(0) @binding(10) var tMS: texture_2d<f32>;
@group(0) @binding(11) var tShC: texture_depth_2d;
// beyond the near field: the far oasis shadow map (2x2 taps), 1 outside its box
fn shadowC(p: vec3f) -> f32 {
  let s = g.smc * vec4f(p, 1.); let uv = vec2f(s.x * .5 + .5, .5 - s.y * .5);
  let inb = step(abs(s.x), .995) * step(abs(s.y), .995);
  let e = .7 / ${LV ? 2048 : 4096}.; var a = 0.;
  for (var k = 0; k < 4; k++) { a += textureSampleCompareLevel(tShC, sS, uv + vec2f(f32(k & 1) - .5, f32(k >> 1) - .5) * e, s.z - .00015); }
  return mix(1., a * .25, inb);
}
// sky radiance in direction rd, from the sky-view LUT; at night a faint warm glow lies low on the horizon
fn skyCol(rd: vec3f, sun: vec3f) -> vec3f {
  var c = textureSampleLevel(tSV, sC, svUV(rd), 0.).rgb * SKYS;
  c += BAND * .35 * pow(sat(1. - max(rd.y, 0.) * 4.), 3.) * (.4 + .6 * sat(-rd.z * .8 + .5)) * NIGHT;
  return c;
}
// aerial perspective from the same media, in closed form: optical depth of each exponential layer along the ray,
// single scattering of the sun (Rayleigh and Mie phase) plus the LUT's multiple scattering, and a 70 m dust layer
// over the ground. Far away it hands over to the sky LUT so the horizon has no seam.
struct Air { t: vec3f, i: vec3f };
const DUST = vec3f(.8e-4, .86e-4, .95e-4) * ${ATM.dust};
// dust absorbs a little more blue than red, which is what warms the haze
const HAZE = vec3f(.9, 1., 1.12) * ${ATM.haze};
fn airAt(cam: vec3f, wp: vec3f, sun: vec3f) -> Air {
  let v = wp - cam; let d = max(length(v), 1e-3); let rd = v / d;
  let hc = max(cam.y, -30.) * 1e-3 + ALT; let dk = d * 1e-3;
  let kr = rd.y / HR; let km = rd.y / HM; let k2 = rd.y / 70.;
  let odR = select((1. - exp(-kr * dk)) / kr, dk, abs(kr) < 1e-6) * exp(-hc / HR);
  let odM = select((1. - exp(-km * dk)) / km, dk, abs(km) < 1e-6) * exp(-hc / HM);
  let od2 = select((1. - exp(-k2 * d)) / k2, d, abs(k2) < 1e-7) * exp(-max(cam.y, -30.) / 70.);
  let kh = rd.y / 1.;
  let odH = select((1. - exp(-kh * dk)) / kh, dk, abs(kh) < 1e-6) * exp(-max(cam.y, -30.) * 1e-3);
  let sR = BR * odR; let sM = BMS * odM; let sD = DUST * .9 * od2 + HAZE * .85 * odH;
  let tau = sR + BME * odM + DUST * od2 + HAZE * odH;
  let T = exp(-tau);
  let mu = dot(rd, sun);
  let ms = textureSampleLevel(tMS, sC, vec2f(sun.y * .5 + .5, ALT / (RT - RG)), 0.).rgb;
  var ins = (SUNC * PI * (sR * phR(mu) + sM * phM(mu) + sD * phG(mu, .45)) + SKYS * ms * (sR + sM + sD)) * (vec3f(1.) - T) / max(tau, vec3f(1e-7));
  ins = mix(ins, skyCol(normalize(vec3f(rd.x, max(rd.y, 0.) * .3 + .012, rd.z)), sun) * (vec3f(1.) - T), ss(4000., 16000., d));
  return Air(T, ins);
}
fn aerialAt(c: vec3f, cam: vec3f, wp: vec3f, sun: vec3f) -> vec3f { let a = airAt(cam, wp, sun); return c * a.t + a.i; }
fn nearK(p: vec3f) -> f32 { return 1. - ss(NEARH - 12., NEARH - 2., max(abs(p.x), abs(p.z))); }
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0004); }
fn shadow1(p: vec3f) -> f32 {
  let s = shUV(p);
  return mix(shadowC(p), textureSampleCompareLevel(tSh, sS, s.xy, s.z), nearK(p));
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 2.4 / ${SHADOW}.; var a = 0.;
  let r = fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453) * TAU;
  for (var k = 0; k < 8; k++) { let fk = f32(k); let an = fk * 2.39996 + r; a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(cos(an), sin(an)) * sqrt((fk + .5) / 8.) * e, s.z); }
  return mix(shadowC(p), a / 8., nearK(p));
}
// r = openness, g = skylight; outside the near field everything is open sky
fn vol(p: vec3f) -> vec2f {
  let v = textureSampleLevel(tV, sC, (p - vec3f(-256., -16., -256.)) / vec3f(512., 96., 512.), 0.).rg;
  return mix(vec2f(1.), v, nearK(p));
}
fn amb(n: vec3f, sky: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return (g.amb.xyz * up * up + AMBC * (vec3f(.70, .47, .29) * .48 * (1. - up) + vec3f(.12, .085, .06))) * (.3 + .7 * sky);
}
fn aerial(c: vec3f, wp: vec3f) -> vec3f { return aerialAt(c, g.cam.xyz, wp, g.sun.xyz); }
// second target: the share of the pixel's light that is ambient (sky and bounce), so screen-space AO can darken
// only that part and never the sunlit or emissive part
struct FO { @location(0) c: vec4f, @location(1) a: vec4f };
fn outA(c: vec3f, amb: vec3f, alb: vec3f, wp: vec3f, alpha: f32) -> FO {
  let air = airAt(g.cam.xyz, wp, g.sun.xyz);
  let col = min(max(min(max(c, vec3f(0.)), vec3f(60.)) * air.t + air.i, vec3f(0.)), vec3f(60.));
  return FO(vec4f(col, alpha), vec4f(sat(dot(amb * air.t, LUMA) / max(dot(col, LUMA), 1e-5)), min(alb * air.t, vec3f(1.))));
}
`;

// ---------------------------------------------------------------- solids: terrain, rocks, buildings, trunks
// instance c: x material, y seed, z distance at which the mesh has shrunk away (0 = never), w 1 = sways like a palm
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var sc = i.a.w;
  if (i.c.z > .5 && g.res.x > 0.) { sc *= 1. - ss(i.c.z * .7, i.c.z, distance(i.a.xyz, g.cam.xyz) / g.mis.z); }
  let lp = i.p * sc;
  var w = i.a.xyz + qrot(i.b, lp);
  let mt = i.c.x;
  if (abs(mt - 12.) < .5 || abs(mt - 18.) < .5) { let sw = palmSway(i.a.xz, lp.y, g.cam.w); w.x += sw.x; w.z += sw.y; }
  if (abs(mt - 13.) < .5) { let sw = palmSway(i.a.xz, i.c.w, g.cam.w); w.x += sw.x; w.z += sw.y; }
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);
  let arch = (mt > 4.5 && mt < 11.5) || abs(mt - 17.) < .5;
  o.op = select(select(lp + i.c.y * 37., lp, arch), w, mt < 1.5); o.on = i.n.xyz;
  o.m = i.c; o.q = i.b; o.ao = i.n.w;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
// a room seen through an opening. e: entry point (x across from the opening's centre, y up from its sill), d: view ray in
// the facade frame (x along the wall, y up, z into it), o: half width and height of the opening, fl: the room floor
// relative to the sill, lit: light reaching inside. Returns radiance.
fn room(e: vec2f, d0: vec3f, o: vec2f, fl: f32, lit: vec3f, lamp: f32) -> vec3f {
  let R = .45; let W = 1.9; let D = 3.4; let Hc = 2.7;
  let d = vec3f(select(d0.x, 1e-4, abs(d0.x) < 1e-4), select(d0.y, 1e-4, abs(d0.y) < 1e-4), max(d0.z, .02));
  let mud = vec3f(.42, .31, .20);
  let tz = R / d.z;
  let tx = (sign(d.x) * o.x - e.x) / d.x; let ty = (select(0., 2. * o.y, d.y > 0.) - e.y) / d.y;
  let tr = min(tx, ty);
  let lampC = vec3f(1., .55, .22) * lamp;
  if (tr < tz) {
    let k = tr / tz;
    let face = select(.75, select(.45, 1.15, d.y < 0.), ty < tx);
    return mud * (lit * face * mix(1., .4, k) + lampC * .25);
  }
  let p = vec3f(e.x + d.x * tz, e.y + d.y * tz, R);
  let t2x = (sign(d.x) * W - p.x) / d.x; let t2y = (select(fl, fl + Hc, d.y > 0.) - p.y) / d.y; let t2z = (R + D - p.z) / d.z;
  let t = min(min(t2x, t2y), t2z);
  let q = p + d * t;
  var c = mud * (.9 + .2 * hs(floor(q.x * 3.) + floor(q.y * 3.) * 7.));
  if (t2y <= t && d.y < 0.) { c = vec3f(.34, .26, .17) * 1.25; }
  if (t2y <= t && d.y > 0.) { c = vec3f(.13, .09, .06) * (.6 + .4 * step(.45, fract(q.x * 2.2))); }
  let fall = .1 + .55 * exp(-(q.z - R) * .75) * (1. - .4 * ss(fl + 1., fl + Hc, q.y));
  let lp = vec3f(W * .55, fl + .5, R + D * .65);
  return c * (lit * fall + lampC * 1.6 / (1. + dot(q - lp, q - lp) * .8));
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> FO {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let far = mat == 1;
  let ts = select(select(1., .035, far), .5, mat >= 5 && mat != 12);
  let A = tri(i.op, on, .07 * ts); let B = tri(i.op, on, .31 * ts); let C = tri(i.op, on, 1.3 * ts); let F = tri(i.op, on, 5.1 * ts);
  let fk = ss(14., 2., dist) * f32(mat <= 4);
  let Lg = textureSample(tD, sR, i.wp.xz * .0045 + .31);
  let Mg = textureSample(tD, sR, i.wp.xz * .0011 + .7);
  let nm = textureSample(tN, sC, i.wp.xz / 512. + .5);
  let fm = textureSample(tF, sC, i.wp.xz / 24000. + .5);
  let rpW = textureSample(tD, sR, i.wp.xz * .7 + vec2f(g.cam.w * .03, 0.)).rg * 2. - 1.;
  var bump = 1.2; var gloss = .08; var alb = vec3f(.5); var emi = vec3f(0.); var metal = 0.; var vao = 1.;
  let flt = ss(.7, .92, n0.y);
  let nk = nearK(i.wp);
  let cq = abs(i.wp.xz - vec2f(${MQ}));
  let court = (1. - ss(24.2, 24.8, max(cq.x, cq.y))) * nk * f32(mat <= 1);
  // facade coordinates for building materials: along the wall and up it
  let fu = select(i.op.z, i.op.x, abs(on.z) > abs(on.x)); let fv = i.op.y; let wall = 1. - ss(.45, .7, abs(on.y));
  // openings and brick courses fade before they can sparkle (derivatives must be taken outside the material branches)
  let wfade = 1. - ss(.25, .6, fwidth(fu / 1.2) + fwidth(fv / 1.2));
  let bfade = 1. - ss(.2, .5, fwidth(fv / .3) + fwidth(fu / .6));
  let pfade = 1. - ss(.15, .45, fwidth(i.wp.x * 11.) + fwidth(i.wp.z * 11.));
  if (mat <= 1) {
    let lava = mix(fm.r, nm.g, nk); let gran = mix(fm.g, nm.b, nk); let wadi = nm.r * nk; let irr = nm.a * nk; let city = fm.b * (1. - nk);
    let ctr = select(mix(.6, 1., max(nm.r, nm.g) * nk), .55, far);
    alb = mix(vec3f(.50, .34, .20), vec3f(.62, .45, .28), sat(A.c * .9 + Lg.a * .9 - .55)) * mix(.93, .7 + .45 * mix(B.h, Lg.b, .45), ctr) * mix(.98, .84 + .32 * C.c, ctr);
    alb *= mix(vec3f(.92, .95, 1.), vec3f(1.07, 1., .9), Mg.a);
    alb *= mix(vec3f(1.), vec3f(1.06, .95, .82), ss(.4, .7, Lg.a));
    alb = mix(alb, vec3f(.36, .26, .18) * (.8 + .4 * C.h), ss(.55, .75, B.c) * .35);
    alb = mix(alb, vec3f(.50, .44, .35) * (.86 + .25 * B.h), wadi);
    alb = mix(alb, mix(vec3f(.21, .14, .085), vec3f(.12, .15, .055), ss(.35, .65, B.c)), irr * .85);
    // the mosque courtyard: trodden earth strewn with small pebbles
    let peb = ss(.58, .8, C.c * .6 + B.c * .25 + F.h * .15) * fk;
    let pq = i.wp.xz * 11.; let pc = floor(pq); let ph = hs(pc.x * 1.7 + pc.y * 31.3);
    let pebS = (1. - ss(.18, .32, length(fract(pq) - .5 - (vec2f(hs(ph * 9.), hs(ph * 13.)) - .5) * .4))) * step(.72, ph) * pfade;
    let mqf = i.wp.xz - vec2f(${MQ[0]}., ${MQ[1]}.);
    let rows = ss(.25, .0, abs(fract(mqf.y / 1.15) - .5) - .22) * step(13.2, mqf.y) * step(abs(mqf.x), 24.) * (.5 + .5 * B.h);
    alb = mix(alb, mix(vec3f(.40, .30, .20), vec3f(.48, .37, .25), A.c) * (.9 + .15 * Lg.b) * (1. - .22 * peb) * (1. - .1 * rows) * mix(1., mix(.62, 1.25, hs(ph * 5.)), pebS) + vec3f(.05, .04, .03) * ss(.7, .9, C.h) * fk, court * .97);
    // harrat basalt is grey-black (albedo about .06-.11), not brown: windblown dust settles only in the flat hollows
    let bas = mix(vec3f(.056, .059, .066), vec3f(.096, .097, .10), ss(.4, .8, C.c)) * (.8 + .4 * mix(.5, F.h * C.h, fk));
    let lv = ss(.1, .55, lava * (1.15 + .9 * (C.c - .5) + .6 * (B.c - .5)));
    // fresh black flows and older rust-brown weathered sheets, in patches a few hundred metres across
    let basV = bas * mix(.78, 1.2, Lg.b) * mix(vec3f(1.), vec3f(1.25, 1.04, .86), ss(.6, .85, Mg.a) * .4);
    alb = mix(alb, mix(basV, vec3f(.34, .28, .21) * (.8 + .3 * B.h), flt * ss(.74, .94, Lg.a + .3 * B.c) * .28), lv);
    var gra = select(mix(vec3f(.24, .18, .15), vec3f(.34, .26, .21), A.c), mix(vec3f(.46, .19, .10), vec3f(.62, .31, .17), A.c), far) * (.68 + .55 * B.h);
    gra = mix(gra, vec3f(.16, .11, .09), ss(.5, .75, fract(i.wp.y * .11 + A.h * 1.5)) * select(.45, 0., far));
    gra = mix(gra, gra * vec3f(.55, .5, .5), ss(.55, .8, B.c) * f32(far) * .5);
    alb = mix(alb, gra, sat(gran * 1.4) * (1. - .1 * flt));
    alb = mix(alb, vec3f(.52, .41, .29) * (.88 + .18 * C.c), ss(.05, .4, city) * .5);
    alb = mix(alb, mix(mix(vec3f(.06, .06, .063), vec3f(.105, .10, .097), A.h) * (.75 + .5 * B.c), vec3f(.30, .25, .20), ss(.7, .88, B.c) * .22), lava * (1. - nk) * .9 * (1. - .45 * ss(1500., 6000., dist)));
    let fam = mix(.32, .45, max(wadi, lava));
    alb *= mix(1., 1. - fam * .5 + fam * F.h, fk);
    bump = select(mix(.3, mix(.7, .9, lava), max(wadi, lava)), max(.55, lava * 1.3), far) * (1. - .9 * court); gloss = mix(.03, .16, lava * (1. - flt)) * ss(120., 20., dist);
  } else if (mat == 2) {
    alb = mix(vec3f(.058, .058, .062), vec3f(.10, .095, .092), ss(.45, .75, C.c)) * (.7 + .6 * F.h);
    alb = mix(alb, vec3f(.34, .28, .21), flt * ss(.75, .95, B.c) * .18); bump = 1.5; gloss = .1;
  } else if (mat == 3) {
    alb = mix(vec3f(.22, .17, .14), vec3f(.33, .26, .21), C.c) * (.65 + .55 * B.h); bump = 1.2;
  } else if (mat == 4) {
    alb = mix(vec3f(.42, .35, .28), vec3f(.33, .27, .21), hs(sd * 91.)) * (.75 + .4 * B.h); bump = .6; gloss = .05;
  } else if (mat == 5) {
    // mud brick: courses of sun-dried bricks, rendered and eroded, darker at the foot
    let row = floor(fv / .34); let bx = fract(fu / .7 + row * .5); let by = fract(fv / .34);
    let mortar = (1. - ss(.0, .1, by) * ss(1., .9, by)) * .6 + (1. - ss(.0, .07, bx) * ss(1., .93, bx)) * .5;
    let render = ss(.55, .7, C.c + .2 * B.h);
    alb = mix(vec3f(.47, .32, .19), vec3f(.39, .26, .15), hs(row * 7.1 + floor(fu / .7 + row * .5)) * .6) * (.8 + .35 * C.h);
    alb = mix(alb * (1. - .45 * mortar * (1. - render) * bfade) * (.92 + .16 * F.h) * (.85 + .3 * hs(row * 3.3 + floor(fu / .7 + row * .5) * 1.7)), vec3f(.56, .41, .28) * (.75 + .4 * B.h), render * .12);
    // sun-dried mud brick reflects about .35-.45; brighter, a wall in full sun becomes a flat white face
    alb *= mix(.7, 1., ss(0., .6, fv)) * .84 * (1. - .22 * mortar * bfade); bump = .22;
  } else if (mat == 6) {
    // the mosque walls: mud brick under a worn mud render, on a footing of rough stones
    let row = floor(fv / .3); let bxi = floor(fu / .62 + row * .5); let bx = fract(fu / .62 + row * .5); let by = fract(fv / .3);
    let mort = (1. - ss(.0, .12, by) * ss(1., .88, by)) * .6 + (1. - ss(.0, .08, bx) * ss(1., .92, bx)) * .5;
    var br = mix(vec3f(.50, .35, .21), vec3f(.42, .28, .16), hs(row * 7.1 + bxi) * .8) * (.85 + .3 * C.h);
    br *= 1. - .45 * mort * bfade;
    let render = ss(.42, .58, A.c + .35 * B.h - .15 * ss(.5, 3.5, fv));
    alb = mix(br, vec3f(.61, .47, .32) * (.84 + .28 * B.h) * (.92 + .1 * C.c), render * .85);
    let srow = floor(fv / .27); let sx = fu / (.42 + .25 * hs(srow * 3.7)) + hs(srow) * 7.;
    let stn = mix(vec3f(.15, .13, .11), vec3f(.33, .28, .22), hs(floor(sx) * 1.3 + srow * 17.)) * (.7 + .5 * F.h);
    let sj = (1. - ss(.0, .1, fract(sx)) * ss(1., .9, fract(sx))) + (1. - ss(.0, .14, fract(fv / .27)) * ss(1., .86, fract(fv / .27)));
    let plinth = 1. - ss(.62, .7, fv + .08 * hs(floor(fu / .5)));
    alb = mix(alb, mix(stn, vec3f(.40, .30, .20), sat(sj) * .7 * bfade), plinth * wall);
    alb = mix(alb, vec3f(.47, .35, .23) * (.85 + .3 * B.h), ss(.6, .9, on.y));
    alb *= mix(.78, 1., ss(0., 1.4, fv)); bump = .12;
  } else if (mat == 7 || mat == 17) {
    // houses and the household rooms: mud render over brick, worn patches, a plank door and small high windows.
    // Neighbourhoods differ (a few hundred metres apart) in the clay of their render, pale wadi clay, red harrat earth
    // or grey-brown, and in age: older quarters show more brick, darker splash marks and higher grime.
    let hh = hs(sd * 3.7);
    let clay = mix(mix(vec3f(.60, .48, .33), vec3f(.56, .38, .25), ss(.38, .62, Lg.a)), vec3f(.50, .44, .36), ss(.55, .78, Mg.a) * .7);
    let age = ss(.3, .7, Lg.b);
    alb = clay * mix(.84, 1.08, hh) * (.82 + .26 * B.h) * (.9 + .15 * C.c);
    let row = floor(fv / .32); let bx = fract(fu / .66 + row * .5); let by = fract(fv / .32);
    let mort = (1. - ss(0., .1, by) * ss(1., .9, by)) * .5 + (1. - ss(0., .07, bx) * ss(1., .93, bx)) * .4;
    let worn = ss(.62 - .14 * age, .74 - .1 * age, A.c + .25 * B.c) * wall;
    alb = mix(alb, alb * vec3f(.86, .8, .74) * (1. - .45 * mort * bfade), worn);
    alb *= mix(.74 - .1 * age, 1., ss(0., .9 + .6 * age, fv));
    let sub = i.ao;
    if (sub < -.45) {
      // a mat of dried fronds: midribs side by side, leaflets fraying at the ends
      let fx = i.op.x * 3.3 + .4 * sin(i.op.z * 1.7) + .6 * C.h; let st = fract(fx); let sid = hs(floor(fx) * 1.7 + floor(i.op.z * .8));
      alb = mix(vec3f(.40, .30, .15), vec3f(.56, .44, .25), sid) * (.72 + .3 * ss(.1, .5, st) * ss(.95, .6, st)) * (.82 + .3 * C.h); bump = .4;
    } else if (sub < -.1) {
      // palm wood: split trunks and beams, grey-brown and weathered, fibrous
      let fib = ss(.3, .7, fract(fu * 9. + fv * 9. + C.h * 2.));
      alb = mix(vec3f(.31, .24, .17), vec3f(.22, .16, .11), hs(sd * 13. + floor(fu * 2.) + floor(fv * 2.))) * (.84 + .3 * C.h) * (1. - .12 * fib * bfade); bump = .5;
    } else if (i.m.w > .5) {
      // openings show the room behind them (interior mapping): the reveal of the 45 cm wall, then a dim mud room lit by
      // the light that comes in; at night some houses have a small oil lamp burning
      let zf = abs(on.z) > abs(on.x);
      let vo = qrot(vec4f(-i.q.xyz, i.q.w), normalize(i.wp - g.cam.xyz));
      let rd = vec3f(select(vo.z, vo.x, zf), vo.y, -dot(vo, on));
      let lamp = NIGHT * step(select(.7, .85, mat == 17), hs(sd * 5.1));
      let lit = amb(vec3f(0., 1., 0.), 1.) * .3 + SUNC * .035 * (1. - NIGHT);
      let dx = 0.;
      let door = step(abs(fu - dx), .55) * step(fv, 2.) * step(.7, on.z) * wall;
      let open = step(.45, hs(sd * 2.3));
      let plank = .8 + .2 * step(.5, fract((fu - dx) * 5.));
      let curtain = open * step(.5, hs(sd * 6.7)) * step(2. - .75 * hs(sd * 8.1), fv);
      let cloth = select(vec3f(.12, .13, .22), select(vec3f(.36, .12, .07), vec3f(.52, .45, .34), hs(sd * 9.3) > .6), hs(sd * 9.3) > .3);
      let doorC = select(vec3f(.15, .095, .055) * plank * (.8 + .3 * C.h), cloth * (.85 + .2 * sin(fu * 20.)), curtain > .5);
      alb = mix(alb, doorC, door * wfade * (1. - open * (1. - curtain)));
      emi += room(vec2f(fu - dx, fv), rd, vec2f(.55, 1.), 0., lit, lamp) * door * open * (1. - curtain) * wfade;
      alb = mix(alb, alb * .5, (step(abs(fu - dx), .7) - step(abs(fu - dx), .55)) * step(fv, 2.12) * step(.7, on.z) * wall * wfade);
      let wc = floor(fu / 2.6 + hh * 3.); let wu = (fract(fu / 2.6 + hh * 3.) - .5) * 2.6;
      let win = step(abs(wu), .26) * step(abs(fv - 2.3), .22) * step(.55, hs(wc * 7.3 + sd * 11.)) * wall * (1. - door);
      alb = mix(alb, vec3f(0.), win * wfade);
      emi += room(vec2f(wu, fv - 2.08), rd, vec2f(.26, .22), -2.08, lit, lamp) * win * wfade;
      // a palm-wood lintel over each window
      alb = mix(alb, vec3f(.24, .18, .12) * (.85 + .3 * C.h), step(abs(wu), .42) * step(abs(fv - 2.6), .07) * step(.55, hs(wc * 7.3 + sd * 11.)) * wall * (1. - door) * wfade);
    }
    alb = mix(alb, mix(vec3f(.36, .27, .18), vec3f(.30, .24, .19), age) * (.85 + .3 * B.h), ss(.6, .9, on.y) * step(-.1, sub));
    alb *= select(1., .32, mat == 17);
    bump = select(.1, bump, sub < -.1);
  } else if (mat == 8) {
    // utum and well heads: coursed rough stone, dark basalt mixed with brown, in mud mortar; a few slits high up
    let srow = floor(fv / .36); let sx = fu / (.5 + .35 * hs(srow * 3.7)) + hs(srow) * 7.;
    let sid = hs(floor(sx) * 1.3 + srow * 17.);
    alb = mix(vec3f(.21, .18, .15), mix(mix(vec3f(.11, .10, .09), vec3f(.24, .20, .16), sid), vec3f(.36, .29, .21), step(.82, sid)) * (.7 + .5 * F.h), bfade) * (.85 + .3 * C.c);
    let sj = (1. - ss(.0, .08, fract(sx)) * ss(1., .92, fract(sx))) + (1. - ss(.0, .12, fract(fv / .36)) * ss(1., .88, fract(fv / .36)));
    alb = mix(alb, vec3f(.42, .32, .22) * (.85 + .3 * B.h), sat(sj) * .75 * bfade);
    let slit = step(abs(fract(fu / 3.2) - .5) * 3.2, .14) * step(abs(fract((fv - 4.) / 3.4) - .5) * 3.4, .5) * step(3.5, fv) * step(fv, 10.) * wall;
    alb = mix(alb, vec3f(.02, .018, .016), slit * wfade);
    emi = vec3f(1., .55, .22) * 1.2 * slit * wfade * NIGHT * step(.6, hs(floor(fu / 3.2) * 5.3 + floor((fv - 4.) / 3.4) * 2.9 + sd * 11.));
    alb = mix(alb, vec3f(.38, .30, .22) * (.85 + .3 * B.h), ss(.6, .9, on.y));
    bump = .3;
  } else if (mat == 9) {
    // roof of the prayer hall: palm stalks laid side by side underneath, mud on top, ragged frond ends at the edge
    // underneath: palm fronds laid over the joists, each a midrib with leaflets slanting off it, mud showing between
    let crs = floor(i.op.z / 3.2 + hs(floor(i.op.x / 4.)) * .9); let fu3 = i.op.x * 2.6 + i.op.z * (hs(crs * 4.1) - .5) * .9 + .4 * sin(i.op.z * .9 + floor(i.op.x * 2.6)) + crs * 1.37; let fi = floor(fu3) + crs * 31.; let fx = fract(fu3) - .5;
    let sl = 2.6 + 1.6 * hs(fi * 5.3); let sz = i.op.z + hs(fi * 2.9) * 4.; let si = floor(sz / sl); let sv = fract(sz / sl);
    let dir = select(-1., 1., hs(fi * 1.3 + si * 7.7) > .5);
    let lf = fract(dir * i.op.z * 5.5 + abs(fx) * (2.6 + 1.2 * hs(fi + si)) + hs(fi * 1.7 + si) * 9.);
    let leaflet = ss(.15, .35, lf) * ss(.95, .7, lf) * (1. - ss(.36, .5, abs(fx)));
    let rib = 1. - ss(.03, .07, abs(fx));
    let ftone = mix(vec3f(.42, .31, .15), vec3f(.58, .45, .24), hs(fi * 3.1 + si * 1.9)) * mix(vec3f(1.), vec3f(.8, .8, .82), ss(.5, .8, B.h));
    let gap = ss(.06, 0., min(sv, 1. - sv)) * .6 + ss(.75, .95, C.c) * .35;
    let fronds = mix(mix(mix(ftone * .8, ftone, leaflet * mix(.5, 1., bfade)), ftone * .88, rib * bfade), vec3f(.20, .15, .10), gap * bfade * .6);
    let sz2 = i.op.z * 13. + .5 * sin(i.op.x * .6 + crs * 3.); let sid = floor(sz2); let sf = fract(sz2) - .5;
    let stk = mix(vec3f(.46, .35, .21), vec3f(.60, .48, .31), hs(sid * 1.3 + floor(i.op.x / 3.)));
    let stalks = mix(stk * .8, mix(stk * (.72 + .4 * (1. - 4. * sf * sf)), vec3f(.13, .10, .07), ss(.36, .5, abs(sf)) * .8), bfade);
    let fpat = ss(.6, .85, hs(crs * 7.3 + floor(i.op.x / 2.3 + .4 * sin(i.op.z * 1.3)) * 3.1) * .75 + .25 * C.c) * .8;
    let under = mix(stalks, fronds, fpat) * (.8 + .3 * C.h);
    let eu = fu * 7. + 2.5 * sin(fu * 1.7) + 1.5 * sin(fu * 4.1);
    let edge = mix(vec3f(.36, .26, .13), vec3f(.48, .36, .19), hs(floor(eu) * 1.7)) * (.82 + .18 * ss(.0, .4, fract(eu))) * (.8 + .3 * F.h);
    alb = select(edge, under, on.y < -.5);
    // a few gaps in the thatch where the sky glows through
    let gc = vec2f(i.op.x * 2.6, i.op.z * 1.4); let gid = hs(floor(gc.x) * 7.1 + floor(gc.y) * 3.3 + 1.7);
    emi = vec3f(.5, .36, .2) * step(.985, gid) * (1. - ss(.05, .4, length(fract(gc) - .5))) * f32(on.y < -.5) * bfade * .25 * (1. - NIGHT);
    alb = mix(alb, mix(vec3f(.22, .17, .10), ftone * .5, .3 + .5 * leaflet) * (.85 + .3 * B.h), ss(.5, .8, on.y));
    bump = .3;
  } else if (mat == 12 || mat == 18 || mat == 19) {
    // date palm trunk: spiral of cut leaf bases makes a diamond crosshatch
    let ang = select(atan2(i.op.z - sd * 37., i.op.x - sd * 37.), atan2(on.z, on.x), mat == 19) / TAU;
    let k1 = abs(fract(i.op.y * 3.3 + ang * 8.) - .5); let k2 = abs(fract(i.op.y * 3.3 - ang * 8.) - .5);
    let grv = 1. - ss(.03, .2, min(k1, k2));
    alb = mix(vec3f(.34, .25, .16), vec3f(.24, .17, .11), B.c) * (1. - .3 * grv * f32(mat != 18)) * (.88 + .24 * C.h);
    if (mat == 19) {
      let cid = hs(floor(i.wp.x / 3.6 + .5) * 7.3 + floor(i.wp.z / 3.6 + .5) * 3.1);
      // leaf-scar rings of a stripped trunk: spacing wanders with each year's growth and differs from trunk to trunk
      let ry = i.op.y * (1.8 + 1.6 * cid) + .55 * sin(i.op.y * (.9 + cid) + cid * 17.) + .25 * sin(i.op.y * 4.3 + cid * 5.) + cid * 5.;
      let ring = ss(.0, .08, abs(fract(ry + .06 * cos(ang * TAU + hs(floor(ry)) * 6.)) - .5) - (.3 + .14 * hs(floor(ry) * 2.3 + cid))) * (.3 + .7 * hs(floor(ry) * 1.9 + cid));
      let fib = ss(.3, .7, fract(ang * 90. + .5 * sin(i.op.y * 3. + cid * 9.)));
      let stub = fract(ry + .06 * cos(ang * TAU + hs(floor(ry)) * 6.));
      alb = mix(vec3f(.40, .30, .19), vec3f(.30, .22, .14), cid) * (1. - .07 * fib * bfade * ss(.3, .7, C.c)) * (1. - .2 * ring * bfade) * (.78 + .44 * C.h);
      alb *= mix(1., .62 + .5 * ss(0., .5 + .45 * hs(floor(ry) * 5.1 + cid), stub), bfade * (.25 + .75 * hs(floor(ry) * 3.7 + cid)));
      alb *= mix(vec3f(.72, .66, .6), vec3f(1.), ss(.2, 1.4, i.op.y)) * mix(1., 1.12, ss(2., 3.2, i.op.y) * hs(cid * 7.));
    }
    vao = mix(select(.55, .82, mat == 19), 1., ss(0., 2., i.op.y - sd * 37.)); bump = .8;
    alb *= select(1., .55, mat == 18);
  } else if (mat == 13) {
    alb = mix(vec3f(.38, .15, .04), vec3f(.24, .08, .03), hs(sd * 17.)) * (.8 + .3 * C.h); gloss = .35; bump = .6;
  } else if (mat == 14) {
    // ditch banks (aux: 0 at the waterline, 1 at the foot): heaped spoil, dark and damp towards the water
    let wet = 1. - ss(.1, .7, i.ao);
    alb = mix(vec3f(.36, .27, .18) * (.8 + .35 * B.h) * (.85 + .25 * C.c), vec3f(.13, .10, .07) * (.85 + .3 * C.h), wet); bump = .9; gloss = .02 + .12 * wet;
  } else if (mat == 16) {
    alb = vec3f(.24, .15, .08) * (.7 + .5 * C.c); bump = .7;
  }
  // water: sky reflection over a dark channel bed, ripples from the detail texture
  if (mat == 15) {
    let V = normalize(g.cam.xyz - i.wp);
    let N = normalize(vec3f(rpW.x * .02, 1., rpW.y * .02));
    let fr = .02 + .98 * pow(1. - sat(dot(N, V)), 5.);
    let R = reflect(-V, N);
    var c = mix(vec3f(.035, .036, .026), skyCol(R, g.sun.xyz) * vec3f(.8, .72, .62), .22 + .7 * fr) + SUNC * shadow1(i.wp) * pow(sat(dot(R, g.sun.xyz)), 700.) * 6.;
    return outA(c, vec3f(0.), vec3f(0.), i.wp, 1.);
  }
  let lvN = select(0., max(nm.g * nk, fm.r * (1. - nk)), mat <= 1);
  let onT = normalize(mix(on, vec3f(0., 1., 0.), select(0., max(court * .85, flt * (1. - max(nm.r, nm.g) * nk) * .3 * nk), mat <= 1)));
  let N = normalize(qrot(i.q, normalize(onT + (A.n * .8 * (1. - lvN * .8) + B.n * .6 * (1. - lvN * .5) + C.n * (.4 + lvN * .5) * ss(45., 8., dist) + F.n * (select(.5, .12, mat <= 1) + lvN * .6) * fk) * bump)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let vv = vol(i.wp + n0 * 1.2); let v2 = vol(i.wp + n0 * 4.);
  var ao = (sat((vv.x - .5) * 6.) * .5 + sat((v2.x - .5) * 2.5) * .5) * vao * mix(1., i.ao, f32(mat == 1));
  ao = mix(ao, vao * select(1., i.ao, far), 1. - nk);
  ao = select(ao, .5 + .5 * ao, mat >= 5 && mat != 12 && mat != 13 && mat != 19);
  ao = select(ao, .35 + .65 * ao, mat == 12 || mat == 13 || mat == 19);
  ao = select(ao, .25 + .75 * ao, mat == 2 || (mat <= 1 && lvN > .5));
  // deep shade under the prayer-hall roof and the Suffah (their skylight is mostly blocked)
  let mq = i.wp - vec3f(${MQ[0]}., .22, ${MQ[1]}.);
  let hall = (1. - ss(24.3, 25., abs(mq.x))) * ss(12.6, 16., mq.z) * (1. - ss(25.1, 25.5, mq.z)) * (1. - ss(3.1, 3.38, mq.y));
  let suf = (1. - ss(-4., -3., mq.x)) * step(-25.5, mq.x) * (1. - ss(-21.5, -19.6, mq.z)) * step(-25.5, mq.z) * (1. - ss(2.7, 3.05, mq.y));
  ao *= 1. - .62 * sat(hall + suf);
  let sh = select(shadow9(i.wp + n0 * (.45 + dist * .003) + g.sun.xyz * .25), sat(i.ao * 1.6 - .3) * shadowC(i.wp + n0 * 1.5 + g.sun.xyz), far);
  let E = SUNC * sh;
  let ndl = sat(dot(N, L));
  let am = amb(N, vv.y) * ao;
  // moonlit court light bounced into the shade of the hall, reaching the roof's shadow on the court too
  let hallN = (1. - ss(24.3, 25., abs(mq.x))) * ss(6., 12., mq.z) * (1. - ss(25.1, 25.5, mq.z)) * (1. - ss(3.1, 3.38, mq.y)) * (1. - sh);
  let ambC = alb * am + alb * mix(vec3f(.62, .40, .22) * .75 * sat(hall + suf), SUNC * vec3f(.8, .92, 1.1) * mix(.45, .2, ss(13., 25., mq.z)) * sat(hallN + suf), NIGHT)
    + alb * vec3f(.50, .32, .18) * .22 * (1. - NIGHT) * (1. - sh) * flt * nk * f32(mat <= 1);
  var c = alb * E * ndl + ambC + emi;
  let Hh = normalize(V + L);
  let spc = mix(vec3f(.04), alb, metal);
  c += E * spc * pow(sat(dot(N, Hh)), mix(8., 120., gloss)) * gloss * ndl * 4.;
  let refl = skyCol(reflect(-V, N), L) * ao * spc * gloss * pow(1. - sat(dot(N, V)), 3.) * 1.5;
  return outA(c + refl, ambC + refl, alb * ao, i.wp, 1.);
}
`;

// ---------------------------------------------------------------- fronds, grass, shrubs
// instance: a = anchor xyz + length, b = yaw, tilt from vertical, half width, height of the anchor above ground,
// c (unorm8) = type, seed1, seed2, bend
const W_LEAF = S_B + /*wgsl*/`
override ROWS: f32 = 7.;
override FAR: f32 = 400.;
struct LI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f };
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec4f, @location(5) @interpolate(flat) sd: vec2f };
fn grassSway(p: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(p, vec2f(.071, .043));
  return .05 * h * (vec2f(sin(t * 1.3 + ph), cos(t * 1.1 + ph * 1.3)) + .4 * vec2f(sin(t * 3.1 + ph * 3.), cos(t * 2.7 + ph * 2.)));
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: LI) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / (ROWS - 1.);
  let ty = i32(i.c.x * 255. + .5); let s1 = i.c.y; let s2 = i.c.z;
  let t = g.cam.w; let len = i.a.w; let hA = i.b.w;
  let cy = cos(i.b.x); let sy = sin(i.b.x); let ct = cos(i.b.y); let st = sin(i.b.y);
  let d = vec3f(st * cy, ct, st * sy); let pe = vec3f(ct * cy, -st, ct * sy); let sd = vec3f(-sy, 0., cy);
  var col = vec3f(0.); var pr = vec4f(0.); var shp = 0.; var fold = 0.;
  let palm = ty == 0 || ty == 1 || ty == 5;
  switch ty {
    case 0 {
      // date palm fronds are glaucous grey-green, not lime; each palm (keyed by its crown) has its own tint and its
      // own share of yellowing fronds
      let ph = hs(i.a.x * .37 + i.a.z * .71);
      col = mix(vec3f(.06, .08, .045), vec3f(.14, .15, .09), s1 * s1) * mix(vec3f(.9, .97, 1.06), vec3f(1.1, 1., .78), ph);
      col = mix(col, vec3f(.30, .22, .11) * (.8 + .4 * s1), step(s2, ph * .22) * .75);
      pr = vec4f(1., .55, 0., 0.); fold = .5; }
    case 1 { col = mix(vec3f(.20, .14, .075), vec3f(.28, .20, .10), s1); pr = vec4f(1., .3, 0., 0.); fold = .3; }
    case 2 { col = mix(vec3f(.24, .27, .08), vec3f(.42, .38, .14), s1); pr = vec4f(0., .8, 0., 0.); }
    case 3 { col = mix(vec3f(.20, .21, .14), vec3f(.28, .23, .13), s1); pr = vec4f(0., .4, 0., 0.); }
    case 4 { col = mix(vec3f(.12, .13, .07), vec3f(.17, .17, .09), s1); pr = vec4f(0., .6, 0., 0.); }
    default { col = mix(vec3f(.07, .09, .035), vec3f(.11, .12, .045), s1); pr = vec4f(0., .6, 0., 0.); }
  }
  // fronds droop along a circular arc and flutter; grass and shrubs bend and sway from the root
  let fl = sin(t * (1.7 + s1) + s2 * 40. + hA * .3) * select(.12, .2, palm);
  let k0 = (i.c.w - .2) * select(1.5, 2.6, palm) + fl * v;
  let ka = select(k0, .05, abs(k0) < .05);
  let sK = sin(ka * v); let cK = cos(ka * v);
  let c = i.a.xyz + len * (d * (sK / ka) + pe * ((1. - cK) / ka));
  let N = normalize(pe * cK - d * sK);
  var w = i.b.z;
  if (palm) { w *= ss(.0, .16, v) * (1. - .8 * pow(v, 1.8)) * select(1., .8, ty == 5); }
  else { w *= pow(max(sin(3.14159 * pow(v, .6)), 0.), .7); }
  let cd = distance(i.a.xyz, g.cam.xyz);
  let farK = select((1. - ss(FAR * g.mis.z * .8, FAR * g.mis.z, cd)), 1., g.res.x == 0.);
  var p = c + sd * u * w * farK - N * abs(u) * w * fold;
  if (palm) { let sw = palmSway(i.a.xz - vec2f(0., 0.), hA, t); p.x += sw.x; p.z += sw.y; }
  else { let sw = grassSway(i.a.xz, p.y - i.a.y + hA, t); p.x += sw.x; p.z += sw.y; }
  o.cp = g.vp * vec4f(p, 1.); o.wp = p; o.n = normalize(-N - sd * u * fold * .9); o.uv = vec2f(u, v);
  o.col = col; o.pr = pr; o.sd = vec2f(s1, s2);
  return o;
}
fn leafCov(i: LO) -> f32 {
  let s = i.uv.y * 28. + abs(i.uv.x) * 3.4 + i.sd.x * 7.;
  let fw = fwidth(s);
  let f = abs(fract(s) - .5) * 2.;
  let lw = .56 * (1. - .45 * abs(i.uv.x));
  var cov = 1. - ss(lw - fw, lw + fw, f);
  cov = max(cov, 1. - ss(.04, .07, abs(i.uv.x)));
  cov *= 1. - ss(.82, 1., abs(i.uv.x) + .1 * f);
  cov = mix(cov, .85, ss(.15, .38, fw));
  let sharp = sat((cov - .5) / max(fwidth(cov), 1e-4) + .5);
  return select(1., sharp, i.pr.x > .5);
}
@fragment fn fsSh(i: LO) { if (leafCov(i) < .5) { discard; } }
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> FO {
  // leaflets: slanted strips either side of the rachis, cut from the frond by alpha (to coverage with MSAA)
  let alpha = leafCov(i);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .1 + i.sd.x * 3.7, i.uv.y * .6 + i.sd.y * 5.3));
  if ((LOW || g.res.x == 0.) && alpha < .5) { discard; }
  let dist = length(i.wp - g.cam.xyz);
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let vv = vol(i.wp + vec3f(0., .5, 0.));
  let E = SUNC * mix(shadow1(i.wp + L * .6), 1., .12);
  let ndl = dot(n, L);
  var alb = i.col * (.7 + .3 * ss(0., .3, abs(i.uv.x))) * mix(.75, 1.1, i.uv.y) * (.6 + .8 * lt.b) * (.75 + .5 * lt.a);
  // sun-dried tips on palm fronds
  alb = mix(alb, vec3f(.24, .17, .09) * (.8 + .4 * lt.a), ss(.8, 1., i.uv.y) * (.25 + .55 * i.sd.y) * step(.5, i.pr.x));
  let tr = (max(-ndl, 0.) * 1.1 + .06) * i.pr.y;
  let trc = alb * vec3f(1.05, 1.3, .75);
  let aov = sat((vv.x - .5) * 5.);
  let am = (amb(n, vv.y) + amb(-n, vv.y) * i.pr.y * .45) * (.35 + .65 * aov);
  var c = E * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  // date palm leaflets carry a waxy cuticle: tight bright glints
  c += E * pow(sat(dot(n, H)), 32.) * mix(.12, .3, step(.5, i.pr.x));
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 4.) * .8;
  return outA(c, alb * am, alb, i.wp, alpha);
}
`;

// ---------------------------------------------------------------- birds (pigeons): flight and flapping in the shader
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (14. / R);
  let ph = i.b.w * 17.;
  let P = i.a.xyz + vec3f(R * cos(ta), 4. * sin(2. * ta + ph), R * .8 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 8. * cos(2. * ta + ph), R * .8 * cos(ta))) * sign(i.b.y);
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  let off = S * ((h.y - .5) * 9. + sin(t * .5 + s * 40.) * 1.5) + Up * ((h.z - .5) * 5. + cos(t * .4 + s * 31.) * 1.);
  var l = i.p * i.b.z;
  let au = abs(i.n.w);
  let flap = ss(-.3, .4, sin(t * .45 + s * 23.));
  l.y += sin(t * 13. + s * 50.) * .55 * au * au * i.b.z * flap + au * .12 * i.b.z * (1. - flap);
  let w = P + off + S * l.x + Up * l.y + T * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * i.n.x + Up * i.n.y + T * i.n.z; o.op = i.p; o.sd = s;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = mix(vec3f(.30, .32, .36), vec3f(.48, .49, .52), ss(-.02, .02, i.op.y));
  alb = mix(alb, vec3f(.12, .13, .15), ss(.7, .9, abs(i.op.x)));
  alb = mix(alb, alb * vec3f(.7, 1.1, .9), step(.8, hs(i.sd * 3.)) );
  let E = SUNC * shadow1(i.wp);
  var c = alb * (E * (.2 + .8 * sat(dot(n, L))) + amb(n, 1.) * 1.2) + E * pow(sat(dot(n, normalize(V + L))), 20.) * .2;
  return fin(aerial(c, i.wp));
}
`;

// ---------------------------------------------------------------- sky dome behind everything
const W_SKY = S_B + W_NOISE + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) d: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.d = g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-9, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.d); let L = g.sun.xyz; let mu = dot(rd, L);
  var c = skyCol(rd, L);
  // high thin cloud: streaks of cirrus on a plane 6 km up, lit gold toward the sun
  if (rd.y > .004) {
    let q = rd.xz / rd.y * 6000.;
    let r = vec2f(q.x * .96 + q.y * .28, q.y * .96 - q.x * .28) * vec2f(.00011, .00042) + vec2f(g.cam.w * .002, 0.);
    let n = fbm(vec3f(r, 1.3), 5) + .35 * (fbm(vec3f(r * 3.1, 4.1), 3) - .5);
    let cov = ss(.58, .84, n) * ss(.03, .2, rd.y) * (1. - ss(.35, .9, rd.y));
    let lit = (CLOUDSUN * (.05 + .45 * pow(max(mu, 0.), 4.)) + g.amb.xyz * .9) * (.75 + .5 * fbm(vec3f(r * 7., 2.), 2));
    c = mix(c, lit, cov * .5);
  }
  // scattered altocumulus 3 km up (after Madinah Horizon 02909b3): fbm density on the cloud plane, self-shadowed by
  // sampling a little toward the sun, lit by the sun at that height plus sky light, fading into the sky with distance
  if (rd.y > .008) {
    let tpl = (3000. - g.cam.y) / rd.y;
    let pp = g.cam.xz + rd.xz * tpl;
    let uv = pp * .00013 + vec2f(g.cam.w * .0008, g.cam.w * .0003);
    let dn = fbm(vec3f(uv, 4.2), 5) + .25 * (fbm(vec3f(uv * 3.3, 7.7), 3) - .5);
    let cov = ss(.57, .76, dn) * ss(.008, .06, rd.y) * ss(70000., 20000., tpl);
    if (cov > .001) {
      let dl = fbm(vec3f(uv + normalize(L.xz) * .05, 4.2), 4);
      let sh = exp(-ss(.5, .85, dl) * 2.4);
      let lit = CLOUDSUN * (.22 + 1.1 * pow(max(mu, 0.), 4.)) * sh + g.amb.xyz * (.8 + .4 * ss(.6, .9, dn));
      c = mix(c, mix(lit, c, ss(15000., 70000., tpl) * .7), cov * .92);
    }
  }
  c += mix(SUNC * 9., vec3f(2.4, 2.4, 2.2), NIGHT) * ss(mix(.99988, .99975, NIGHT), mix(.99994, .99982, NIGHT), mu);
  // stars: one soft point per sky cell, a pixel or two wide, so they hold still as the camera moves
  if (NIGHT > .5 && rd.y > 0.) {
    let p = rd * 230.; let h = h33(floor(p)); let off = fract(p) - .5 - (h - .5) * .5;
    c += vec3f(.85, .9, 1.) * step(.982, h.z) * ss(.14, .0, length(off)) * (.4 + 1.6 * h.x * h.x) * ss(.02, .2, rd.y) * 2.;
  }
  return fin(c);
}
`;

// ---------------------------------------------------------------- dust motes and pollen (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  let B = 26.;
  var p = a.xyz * B + vec3f(t * .18, t * .03, t * .07) + .4 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = .006 + .02 * a.w * a.w * a.w;
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0016);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let fade = ss(B * .5, B * .3, d) * ss(.4, 2., d) * min(1., sz / (d * .0016)) * ss(-2., 1., -abs(p.y - 4.) + 4.) * .3;
  let mu = dot(normalize(p - g.cam.xyz), g.sun.xyz);
  let ph = .15 + 2.2 * pow(max(mu, 0.), 6.);
  o.pr = vec4f(fade * ph * shadow1(p), a.w, 0., 0.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let m = ss(1., .15, length(i.uv));
  return vec4f(min(SUNC * mix(vec3f(1.), vec3f(1., .9, .6), i.pr.y) * m * m * i.pr.x * .5, vec3f(2.)), 0.);
}
`;

// ---------------------------------------------------------------- sun shafts through the grove dust (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sS: sampler_comparison;
@group(0) @binding(2) var tSh: texture_depth_2d;
@group(0) @binding(3) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = g.fwd.w / max(dp, 1e-6);
  let tm = min(zl * rl, 150.);
  let ro = g.cam.xyz; let sx = g.sun.xyz;
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = 0.;
  for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let inb = 1. - ss(NEARH - 12., NEARH - 2., max(abs(p.x), abs(p.z)));
    let vis = mix(1., textureSampleCompareLevel(tSh, sS, vec2f(s.x * .5 + .5, .5 - s.y * .5), s.z - .0004), inb);
    let dust = (.12 + exp(-max(p.y, 0.) / 12.) * 1.6) * mix(.3, 1., inb);
    acc += vis * dust * exp(-t * .004);
  }
  let mu = dot(rd, sx);
  let gg = .72;
  let ph = (1. - gg * gg) / pow(1. + gg * gg - 2. * gg * mu, 1.5) * .07 + .1;
  return vec4f(min(SUNC * vec3f(1., .84, .62) * acc * dt * .015 * ph * g.mis.y, vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
const SHARP = 1.8;
fn tmap(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let uv = fc.xy * g.res.zw;
  let zf = g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6);
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  var c = textureLoad(tS, px, 0).rgb;
  if (${LV < 2}) {
    // TAA averages sub-pixel detail away; a clamped unsharp mask brings it back without halos
    let sm = vec2i(textureDimensions(tS)) - 1;
    let n0 = textureLoad(tS, clamp(px + vec2i(1, 0), vec2i(0), sm), 0).rgb; let n1 = textureLoad(tS, clamp(px - vec2i(1, 0), vec2i(0), sm), 0).rgb;
    let n2 = textureLoad(tS, clamp(px + vec2i(0, 1), vec2i(0), sm), 0).rgb; let n3 = textureLoad(tS, clamp(px - vec2i(0, 1), vec2i(0), sm), 0).rgb;
    c = clamp(c + (c - (n0 + n1 + n2 + n3) * .25) * SHARP, min(min(min(n0, n1), min(n2, n3)), c), max(max(max(n0, n1), max(n2, n3)), c));
  }
  c += acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .025) + bl * .012;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .45;
  c = tmap(c);
  // moonlight is seen with the rods: colour drains and what remains leans blue (Purkinje shift), so warm sand
  // does not read as daylit under a night sky
  if (NIGHT > .5) { let ln = dot(c, LUMA); c = mix(c, vec3f(ln) * vec3f(.78, .88, 1.12), .62); }
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);
  c *= l / max(l0, 1e-4);
  c = mix(vec3f(l), c, 1.04) + vec3f(.006, .003, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
// ---------------------------------------------------------------- ground-truth ambient occlusion (half res)
// GTAO (Jimenez et al. 2016, structure after XeGTAO): per slice direction, find the highest horizon on each side
// from the depth buffer, then integrate the cosine-weighted visible arc against the projected normal. Positions
// are camera-relative world space, so no view matrix is needed. Noise rotates every frame; TAA averages it.
const W_AO = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var tDp: texture_depth_multisampled_2d;
@group(0) @binding(2) var tPrev: texture_2d<f32>;
struct AOut { @location(0) ao: vec4f, @location(1) gi: vec4f };
// cosine-weighted visible arc of one side of a slice, from the normal's angle n to the horizon angle a
fn arcI(a: f32, n: f32, cn: f32) -> f32 { return (cn + 2. * a * sin(n) - cos(2. * a - n)) * .25; }
const SLICES = ${LV ? 2 : 3}; const STEPS = ${LV ? 3 : 4};
fn zAt(p: vec2i) -> f32 { return g.fwd.w / max(textureLoad(tDp, clamp(p, vec2i(0), vec2i(g.res.xy) - 1), 0), 1e-7); }
fn posAt(q: vec2f, z: f32) -> vec3f {
  let uv = q * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  return (g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w)) * z;
}
fn fastAcos(x: f32) -> f32 { let a = abs(x); let r = (-.156583 * a + 1.570796) * sqrt(max(1. - a, 0.)); return select(3.141593 - r, r, x >= 0.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> AOut {
  let p = vec2i(fc.xy) * 2; let q = vec2f(p) + .5;
  let dp = textureLoad(tDp, p, 0);
  if (dp < 1e-7) { return AOut(vec4f(1., 6e4, 0., 0.), vec4f(0.)); }
  let z = g.fwd.w / dp; let P = posAt(q, z);
  let zr = zAt(p + vec2i(2, 0)); let zl = zAt(p - vec2i(2, 0)); let zd = zAt(p + vec2i(0, 2)); let zu = zAt(p - vec2i(0, 2));
  let dx = select(P - posAt(q - vec2f(2., 0.), zl), posAt(q + vec2f(2., 0.), zr) - P, abs(zr - z) < abs(zl - z));
  let dy = select(P - posAt(q - vec2f(0., 2.), zu), posAt(q + vec2f(0., 2.), zd) - P, abs(zd - z) < abs(zu - z));
  let V = -normalize(P);
  var N = normalize(cross(dx, dy));
  if (dot(N, V) < 0.) { N = -N; }
  // 2.5 m around the point, but never under 8 px, so the far city still gets dark alleys and building feet
  let ppm = g.res.y * .5 / (z * g.up.w);
  let rpx = clamp(2.5 * ppm, 8., 110.); let R = rpx / ppm;
  let fr = R * .62; let fmul = -1. / fr; let fadd = (R - fr) / fr + 1.;
  let nz = fract(ign(fc.xy) + g.jit.w * .618034); let nz2 = fract(ign(fc.xy + 71.) + g.jit.w * .754877);
  var vis = 0.; var gi = vec3f(0.);
  for (var sl = 0; sl < SLICES; sl++) {
    let phi = (f32(sl) + nz) / f32(SLICES) * 3.141593;
    let om = vec2f(cos(phi), -sin(phi));
    let dir = g.right.xyz * om.x - g.up.xyz * om.y;
    let od = dir - dot(dir, V) * V;
    let ax = normalize(cross(od, V));
    let pn = N - ax * dot(N, ax); let pl = length(pn);
    let cn = sat(dot(pn, V) / max(pl, 1e-4));
    let n = sign(dot(od, pn)) * fastAcos(cn);
    let lo0 = cos(n + 1.570796); let lo1 = cos(n - 1.570796);
    var h0 = lo0; var h1 = lo1;
    for (var st = 0; st < STEPS; st++) {
      var t = (f32(st) + nz2) / f32(STEPS); t = t * t;
      let o = om * max(t * rpx, 2. + f32(st));
      let a = vec2i(q + o); let b = vec2i(q - o);
      let da = posAt(vec2f(a) + .5, zAt(a)) - P; let db = posAt(vec2f(b) + .5, zAt(b)) - P;
      let la = max(length(da), 1e-4); let lb = max(length(db), 1e-4);
      // a sample that raises the horizon hides sky and shows its own surface instead: it adds the light it
      // reflects (last frame's image) over the arc it newly covers, bounded by the AO radius
      let c0 = mix(lo0, dot(da / la, V), sat(la * fmul + fadd)); let c1 = mix(lo1, dot(db / lb, V), sat(lb * fmul + fadd));
      if (c0 > h0) { gi += min(textureLoad(tPrev, clamp(a, vec2i(0), vec2i(g.res.xy) - 1), 0).rgb, vec3f(4.)) * pl * max(arcI(n + clamp(fastAcos(h0) - n, -1.570796, 1.570796), n, cn) - arcI(n + clamp(fastAcos(c0) - n, -1.570796, 1.570796), n, cn), 0.); h0 = c0; }
      if (c1 > h1) { gi += min(textureLoad(tPrev, clamp(b, vec2i(0), vec2i(g.res.xy) - 1), 0).rgb, vec3f(4.)) * pl * max(arcI(n + clamp(-fastAcos(h1) - n, -1.570796, 1.570796), n, cn) - arcI(n + clamp(-fastAcos(c1) - n, -1.570796, 1.570796), n, cn), 0.); h1 = c1; }
    }
    let a0 = n + clamp(-fastAcos(h1) - n, -1.570796, 1.570796);
    let a1 = n + clamp(fastAcos(h0) - n, -1.570796, 1.570796);
    vis += pl * ((cn + 2. * a0 * sin(n) - cos(2. * a0 - n)) + (cn + 2. * a1 * sin(n) - cos(2. * a1 - n))) * .25;
  }
  return AOut(vec4f(pow(sat(vis / f32(SLICES)), 1.6), z, 0., 0.), vec4f(gi / f32(SLICES) * ss(400., 150., z), 0.));
}
`;
// depth-aware 5x5 blur of the half-res AO
const W_AOB = W_FS + /*wgsl*/`
@group(0) @binding(0) var tO: texture_2d<f32>;
@group(0) @binding(1) var tG: texture_2d<f32>;
struct BOut { @location(0) ao: vec4f, @location(1) gi: vec4f };
@fragment fn fs(@builtin(position) fc: vec4f) -> BOut {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tO)) - 1;
  let c = textureLoad(tO, p, 0);
  var acc = 0.; var ws = 0.; var ga = vec3f(0.);
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let r = textureLoad(tO, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = (1. - .1 * f32(x * x + y * y)) / (.02 + abs(r.y - c.y) / c.y);
    acc += r.x * w; ws += w; ga += textureLoad(tG, clamp(p + vec2i(x, y), vec2i(0), mx), 0).rgb * w;
  } }
  return BOut(vec4f(acc / ws, c.y, 0., 0.), vec4f(ga / ws, 0.));
}
`;
// ---------------------------------------------------------------- temporal anti-aliasing (full res)
// AO is applied to the ambient share here; then the frame is blended with last frame's result, reprojected by
// depth, with the history clipped to the 3x3 neighbourhood's colour range so moving fronds do not ghost.
const W_TAA = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tA: texture_2d<f32>;
@group(0) @binding(4) var tO: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth_multisampled_2d;
@group(0) @binding(6) var tH: texture_2d<f32>;
@group(0) @binding(7) var tGI: texture_2d<f32>;
// the gather only reaches the AO radius, so it under-counts the bounce from larger nearby surfaces
const GI = 3.;
fn tm(c: vec3f) -> vec3f { return c / (1. + dot(c, LUMA)); }
fn itm(c: vec3f) -> vec3f { return c / max(1. - dot(c, LUMA), 1e-3); }
// depth-aware upsample of the half-res AO (x) and bounce (yzw)
fn aoUp(p: vec2i, z: f32) -> vec4f {
  let h = (vec2f(p) + .5) * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tO)) - 1;
  var acc = vec4f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1); let q = clamp(bi + o, vec2i(0), mx);
    let r = textureLoad(tO, q, 0);
    let w = (mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y)) + .01) / (.01 + abs(r.y - z) / z);
    acc += vec4f(r.x, textureLoad(tGI, q, 0).rgb) * w; ws += w;
  }
  return acc / ws;
}
// 5-tap Catmull-Rom history fetch: sharper than bilinear, so the image does not soften as frames accumulate
fn hs5(uv: vec2f) -> vec3f {
  let sz = vec2f(textureDimensions(tH)); let p = uv * sz; let tc = floor(p - .5) + .5; let f = p - tc;
  let w0 = f * (-.5 + f * (1. - .5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f); let w2 = f * (.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-.5 + .5 * f);
  let w12 = w1 + w2; let t0 = (tc - 1.) / sz; let t3 = (tc + 2.) / sz; let t12 = (tc + w2 / w12) / sz;
  let a = w12.x * w0.y; let b = w0.x * w12.y; let c = w12.x * w12.y; let d = w3.x * w12.y; let e = w12.x * w3.y;
  let r = textureSampleLevel(tH, sC, vec2f(t12.x, t0.y), 0.).rgb * a + textureSampleLevel(tH, sC, vec2f(t0.x, t12.y), 0.).rgb * b
    + textureSampleLevel(tH, sC, t12, 0.).rgb * c + textureSampleLevel(tH, sC, vec2f(t3.x, t12.y), 0.).rgb * d + textureSampleLevel(tH, sC, vec2f(t12.x, t3.y), 0.).rgb * e;
  return max(r / (a + b + c + d + e), vec3f(0.));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(g.res.xy) - 1;
  var m1 = vec3f(0.); var m2 = vec3f(0.); var lo = vec3f(1e9); var hi = vec3f(-1e9); var cur = vec3f(0.);
  var zmin = 1e9; var dpn = 0.; var pn = px;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(px + vec2i(x, y), vec2i(0), mx);
    let dp = textureLoad(tDp, q, 0); let z = g.fwd.w / max(dp, 1e-7);
    let a = aoUp(q, z); let sa = textureLoad(tA, q, 0);
    let c = tm(textureLoad(tS, q, 0).rgb * (1. - (1. - a.x) * sa.r) + sa.gba * a.yzw * GI);
    m1 += c; m2 += c * c; lo = min(lo, c); hi = max(hi, c);
    if (x == 0 && y == 0) { cur = c; }
    if (z < zmin) { zmin = z; dpn = dp; pn = q; }
  } }
  // reproject the nearest surface in the neighbourhood, so thin foreground edges do not trail
  let uv = (vec2f(pn) + .5) * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let pc = select(g.pvp * vec4f(g.cam.xyz + rv * zmin, 1.), g.pvp * vec4f(rv, 0.), dpn < 1e-7);
  let pu = vec2f(pc.x / pc.w * .5 + .5, .5 - pc.y / pc.w * .5) - uv + (vec2f(px) + .5) * g.res.zw;
  let mean = m1 / 9.; let sg = sqrt(max(m2 / 9. - mean * mean, vec3f(0.)));
  let blo = max(lo, mean - sg * 1.25); let bhi = min(hi, mean + sg * 1.25);
  let hist = clamp(tm(hs5(pu)), blo, bhi);
  let off = any(pu < vec2f(0.)) || any(pu > vec2f(1.)) || pc.w <= 0.;
  let a = select(max(g.jit.z, .1), 1., off);
  var o = itm(mix(hist, cur, a));
  if (any(o != o)) { o = itm(cur); }
  return vec4f(min(o, vec3f(60.)), 1.);
}
`;
