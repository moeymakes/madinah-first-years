# Critic, iteration 03 (sonnet subagent, images only)

**Prioritized defects**

1. **MAJOR: the mosque never reads as the focal point.**
   - pose-2: the prayer hall is almost black. The ceiling is a dark plank soffit, so it looks like a wooden pier or dock, not a roof of palm fronds. The columns are faceted octagonal posts, and there are no fronds, sun shafts, rafters or light patches on the floor.
   - The courtyard floor, lower left, is flat cold grey-blue and looks like concrete, not warm earth.
   - pose-6: the mosque is a pale rectangle among grey boxes with no readable walls, footing, hall or side rooms.
   - It should be a warm, dim interior with amber bounce light, visible frond thatch, and golden shafts landing on the floor. The shadow side should be lifted to about 15-25% brightness with a warm tint.
2. **MAJOR: pose-2 palm-trunk columns have the wrong texture.** Black horizontal blotches on a pale base, like birch or zebra bark. They should use the same diamond-scar bark as the live palms in pose-3, with a warm brown tone.
3. **MAJOR: the lava field is inconsistent and unconvincing, and it reads as a "programmer art" slab.** pose-6 right: a giant black rectangle with a dead-straight edge. pose-6 centre: a smooth bald dome like a pudding. flight frames 11-12: the lava mound is pale grey with moon-like craters. pose-4: near ground noisy high-frequency speckle; rocks smooth blobs; a flat-topped block; the lava is dark brown, not black. Should be one consistent dark basalt material with irregular broken edges, scattered boulders and clinker.
4. **MAJOR: the oasis ends in a hard rectangle (pose-6, flight frames 13-18).** A walled rectangle of palms on a flat orange plain; beyond it identical thin "pin" palms and sparse cubes, a tabletop diorama. Right edge about (1400-1450, 570-720): bright, unlit white or grey cubes. Fix distant LOD albedo and shading, fade the plain into wadi, lava and haze, break the rectangular edge.
5. **MAJOR: the foreground palm fronds in pose-1 alias.** Right side about (1700-2500, 300-1000): leaflets as a fine comb with moire and sparkles; also flight frame 1.
6. **MAJOR: ground texture is noisy and tiles.** pose-3, 5, 6: ripple-and-footprint sand at uniform contrast reads as beach sand, not packed earth lanes; in pose-6 light blotches visibly repeat over the plain. Lanes and courtyards smoother and darker-packed, ripples only in the wadi, macro colour variation.
7. **MAJOR: houses are bare cubes (pose-3).** Tiny black windows; roofs with no parapets, drains or palm-beam stubs; a small cube on the right foreground wall; no edge wear or plaster patches. Add parapets, doorways with depth, rounded corners, lintels, varied heights.
8. **MINOR: the irrigation water in pose-1 reads as blue tape** (flat opaque strip, hard-cut start mid-lane, no reflection). Sink it, reflect warm sky, run it from a bank or well.
9. **MINOR: foreground wall texture is smeared (pose-1, right)**; brick pattern too regular, Lego-like.
10. **MINOR: posterised shadow edges in pose-2** about (1400, 760); dithered blotchy grey sand.
11. **MINOR: sky sparkles in pose-1** about (1048, 72) and (1160, 250).
12. **MINOR: colour and exposure shifts across the flight.** Frames 6 and 15 blown out by the sun disc and bloom; frames 7-8 chalk-white wadi sand; aerial palms saturated green vs yellow-green at ground level.
13. **MINOR: repetitive distant palms (pose-4, pose-1)**, uniform horizon row.
14. **MINOR: composition.** pose-4 foreground lava about 60% of the frame; pose-5 lower half empty ground; pose-3 empty mid-ground. Add foreground anchors (well, ditch, wall edge).
15. **NIT: fog colour.** Left-side haze in pose-3 and pose-4 is a strong yellow bloom. No banding seen.
16. **NIT: pose-6 camera** too high and far to show the mosque; Uhud a pink-red hill at the corner.

**Strongest things to keep**
1. The golden-hour light and long shadows in pose-1, 3 and 5, plus the warm-to-blue sky gradient. The mood is genuinely quiet and timeless.
2. The palm silhouettes and diamond-scar bark in pose-3, the acacia in pose-5, and the grove density and depth haze in pose-5.
3. The Uhud-like massif with atmospheric perspective in pose-4 and pose-6; the irrigation-lane composition in flight frames 1-3; the camera-height transition.

highest severity: major
