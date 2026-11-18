# Critic, stage 2 round 1 (sonnet subagent, images only), verify/s2-f

Images: t1 poses 1-6, t0 poses 2 and 6, t2 poses 2 and 3 (1920x1080).

1. MAJOR: night prayer hall (t2/pose-2) near-black; right two-thirds no moonlight fill, lamp or bounce; court patch flat grey-white with a razor-straight diagonal shadow edge. Fix: cool moon bounce under the roof (8-12% of lit), a warm oil-lamp glow, soften the shadow edge, court with sand texture.
2. MAJOR: night colour wrong everywhere (t2/pose-2, pose-3): sand and mud brick neutral grey like concrete; daytime warmth lost. Fix: blue-grey moonlight that keeps some albedo hue; shadows blue, not brown-black.
3. MAJOR: prayer hall interior flat and repetitive (t1/pose-2, t0/pose-2): roof underside one evenly tiled herringbone, no rib structure; columns smooth with identical evenly spaced painted-on bands; floor featureless beige; east wall repeating brick blocks. Fix: vary band spacing per trunk, rib and beam variation and frond edges, floor detail, mats or scuffs.
4. MAJOR: dawn prayer hall (t0/pose-2) god-rays too hard: crisp radial fans from one point, sun point blown out behind the wall, read as 2D radial blur. Fix: wider, softer shafts broken by trunks and fronds, lower peak.
5. MAJOR: aerial dawn (t0/pose-6) banding on the Uhud flank: concentric stair-stepped contour bands. Fix: dithering, higher-precision normals.
6. MAJOR: aerial (t1/pose-6, t0/pose-6) lava: the basalt cone a smooth featureless dark dome, lit side uniform brown; the right-hand field a hard scalloped boundary with a grey cobble stripe like a decal. Fix: boulder scatter, dust-drift transition, break the dome silhouette.
7. MAJOR: settlement scale and layout (t1/pose-6): tiny near-identical boxes in tidy rows, palms in even stripes, hard rectangular grove boundaries, courtyard a pale empty slab. Fix: jitter, varied spacing, darker packed-earth courtyard.
8. MINOR: palms (t1/pose-1, 3, 5) sparse spiky agave-like crowns, small relative to trunks; tiled diamond crosshatch on the pose-3 trunk.
9. MINOR: mud-brick too regular cut-block courses; black square windows; a floating beam-stub cube (pose-3 top right).
10. MINOR: ditch (t1/pose-1) water a flat dark mirror; banks bulbous with a noisy normal map; grass single flat cards.
11. MINOR: haze (t1/pose-4, 5) uniform yellow-orange, not going grey-blue; purple cast in the sky.
12. MINOR: lava field (t1/pose-4) uniform dark brown, noisy high-frequency normal map; boulders similar blobs; greenish right rocks.
13. MINOR: Uhud (t1/pose-1, 5) low-detail smooth pink-brown, not a red granite massif.
14. MINOR: sand ripple texture with visible tile; rocks and tufts without contact shadows.
15. NIT: night stars sparse; tower windows plain white rectangles.
16. NIT: well frame lintel a thin beam, no rope or bucket.

Strongest: golden-hour long-shadow lighting and warm palette at ground level (t1/pose-1, 3); the aerial composition with the mosque at the heart of the grove, wadi left, lava right, Uhud behind (t1/pose-6); the roofed prayer hall's colonnade perspective and light/shadow split (t1/pose-2).

highest severity: major

Disposition (stage 2 scope = the mosque hero, GI, clouds, palms, basalt):
- In scope, fixed in s2-g onward: 1 (night hall), 3 (hall interior), 6 (basalt cone and lava edge).
- Stage 1 scope (sky, post), carried: 2, 4. Stage 3 scope (real terrain, real layout): 5, 7, 13.
