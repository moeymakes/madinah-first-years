# Madinah, First Years: build notes

Built with the `worldsmith` skill (`/home/moey/.shared/skills/worldsmith`), starting from the source of
`/home/moey/Dev/projects/madinah-horizon` (copied, never edited there). Brief: `prompt.txt`.

## State (update after every step)

- Phase: realism stages 1-3 (brief: /home/moey/.config/Claude/side-session-notes/local_e46bf3a1-465b-49b7-b617-a09a30fa0fa1/realism-stages-brief.md).
- **Stage 1: shipped 2026-11-18 ~17:15 AEDT** (main 6ad6df1, live page byte-identical to the build).
- **Stage 2: stopped at the fix-loop cap, not shipped** (2026-11-18 ~21:45 AEDT). Branch `realism-s2` at the s2-k
  commit holds it all; main and the live page are still stage 1. Reason: after 4 fix loops on the prayer hall the
  critic still rates its surfaces major (round 5, verify/s2-k/critic.md), and the hall is the stage-2 hero, so the
  brief's ship-with-out-of-scope-majors rule does not apply. Every metric beats live (table below).
- **Stage 3: built on branch `realism-s3` (from realism-s2), stopped after 1 critic fix loop, not shipped**
  (2026-11-19 ~01:50 AEDT). The coordinating session said: if stage 2 cannot ship, do not ship it and go on to stage 3
  on the branch. Shipping stage 3 would ship stage 2 with it, so nothing on these branches goes live until Moey
  decides on stage 2. All gates but the critic pass (table below).
- Stage 3 content: real relief for Uhud, Jabal Ayr and Jabal Sal' from Copernicus GLO-30 (tile at
  /home/moey/Dev/research/madinah-horizon-data/dem/, packed by source/tools/pack-data.py into src/data.js; GLO-30 is a
  surface model holding the modern city's buildings, so only relief 20+ m above the plain is used, and Sal' is masked
  to the hill itself); Wadi al-Aqiq on its real course from OpenStreetMap (ways 960090164, 1235902746, via Nominatim:
  every Overpass mirror answered 502 or timed out on Nov 18-19), which also sets Harrat al-Wabara's edge; colours
  checked against six Wikimedia Commons photos (/home/moey/Dev/research/madinah-first-years-data/photos/, measured
  only); README data-sources section with the ODbL and Copernicus credits.
- What the photo calibration could and could not settle: Uhud's hue (20-30) and saturation (.3-.4) sit inside the
  photos' 17-33 / .2-.4. Rock-to-sand luminance cannot be matched: the photos are midday and this world's sun is 6-9
  degrees, where slopes facing the sun get ~4x the light of flat sand. Uhud's relative contrast rose .05 -> .07 (haze
  and dust thinned a third, crags and scree added) against .4-.5 in photos taken from 1-3 km; the render sees it
  through 4-5 km of air.
- Next if stage 2 is resumed: (1) change the hall's geometry, not its textures: girth varying along each trunk,
  joists that sag and differ in spacing, ragged frond ends hanging from the roof edge; (2) port Horizon 133f332 (GI
  gain 3 -> 1.5, gathered radiance cap 4 -> 2; white halos round sunlit boxes in Horizon); (3) the joist `rr()` calls
  added in s2-i shift the shared random stream after the mosque timber, which moved a palm in dawn pose 1: switch them
  to a position hash.

### Stage 3 gate report (crop 0,.5,1,1, 1920x1080, six poses x three Times)

| Gate | Live = stage 1 (verify/s1-i) | Stage 3 (verify/s3-g; perf and errors on s3-f) | Result |
|---|---|---|---|
| brightdetail, day mean (dawn, golden) | 42.4 (48.7, 36.2) | 45.3 (51.8, 38.7) | +6.7%, pass |
| clip% max | 0.07 | 0.08 (dawn pose 5, glow beside the sun) | pass (< 0.5) |
| flatwhite% max | 0.69 | 0.98 (pose 5, y 540-566: sky haze above that pose's horizon, where the old over-tall procedural Uhud used to stand) | pass (< 2) |
| GPU, 60 s flight 2560x1440 High | 7.95 avg, p99 12.68 | 7.86 avg, p99 12.08, max 13.58 (verify/s3f-gate/perf) | pass |
| console errors, index.html, 3 Times x 3 levels | 0 | 0 at all 9 (verify/s3f-gate) | pass |
| menu preview | renders | renders, 0 errors | pass |
| index.html size | 122.6 KB | 142.3 KB | pass (< 160 KB) |
| critic (sonnet, images only) | major | **major** (verify/s3-f/critic.md, with disposition) | fail: stage-3 item left is the layout reading as a grid |

What moved the numbers: DEM 42.2 (s3-a, modern buildings and a basalt-masked bump in the settlement from the surface
model) -> 44.5 once masked (s3-b); Aqiq 44.6; granite albedo 44.5 (Uhud barely changed: haze dominates at 4 km); haze
and dust thinned 45.1; crags 44.7; critic fix 45.3.

### Stage 2 gate report (crop 0,.5,1,1, 1920x1080, six poses x three Times)

| Gate | Live = stage 1 (verify/s1-i) | Stage 2 (verify/s2-k) | Result |
|---|---|---|---|
| brightdetail, day mean (dawn, golden) | 42.4 (48.7, 36.2) | 44.3 (50.7, 38.0) | +4.4%, pass (hold or rise) |
| clip% max | 0.07 (dawn pose 5) | 0.08 (dawn pose 5) | pass (< 0.5); the +0.01 is glow beside the dawn sun, x 1840-1915 just under the horizon |
| flatwhite% max | 0.69 (dawn pose 1) | 0.82 (dawn pose 1) | pass (< 2); the new pixels are haze glowing beside the dawn sun (x 1650-1913, y 544-604) |
| GPU, 60 s flight 2560x1440 High | 7.95 avg, p99 12.68 | 8.16 avg, p99 12.69, max 13.99 (verify/s2k-gate/perf) | pass (<= 11 / <= 16) |
| console errors, index.html, 3 Times x 3 levels | 0 | 0 at all 9 (verify/s2k-gate) | pass |
| menu preview phone/tablet/desktop | renders | renders, 0 errors (verify/s2k-gate/menu) | pass |
| index.html size | 122.6 KB | 124.6 KB | pass (< 160 KB) |
| critic (5 rounds, sonnet, images only) | major | **major** | **fail, in scope (prayer-hall surfaces)** |

Critic rounds (verify/s2-f, s2-h, s2-i, s2-j, s2-k critic.md, each with its disposition): in-scope majors fixed along
the way: night hall black (moon bounce from the court), basalt brown (grey-black .06-.11, less dust, cooler), lava
lobe a pasted tile (sand tongues over the edge, patchy rubble, softer margin, crags on Jabal Sal'), roof tiling
(courses at varied angles, then bare stalks with frond patches), identical banded columns (irregular rings, then
stacked leaf-base stubs), featureless floor (worn prayer rows, then single pebbles). Still major in round 5: the hall
reads as "pipes" and a "pergola". Out of stage-2 scope, carried: night colour, the far shadow-map edge behind the cone,
mud-brick look and windows, haze, dawn vs golden (stage 1); Uhud banding and detail, the layout reading as a grid
(stage 3).

What moved the numbers: s2-a (palms + GI + colonnade) 41.7; A/B showed the softer frond sheen and GI each cost about
half of it; GI faded nearer (no gain, reverted); basalt, ditch banks, clouds 41.7; waxy frond glint 43.3; critic fixes
42.9 -> 42.6 -> 44.3 -> 44.4 -> 44.3.

### Stage 2 features (all on realism-s2)

- Palms after Horizon ac0180e (glaucous fronds, per-palm tint, yellowing, dry tips, dead-frond skirt), plus a waxy glint.
- Prayer hall as three porticoes of eight leaning, bowed palm trunks at 6.1 m bays (sources below); stalk roof.
- Bounded screen-space GI after Horizon 8246d13 (gain 3, see next steps).
- Altocumulus at 3 km after Horizon 02909b3.
- Harrat basalt grey-black at albedo .06-.11; ditches dug between heaped spoil banks, wet toward the water.

### Stage 2 sources (mosque, 7 AH state)

- Muslim Heritage, "The Form and Function of the Prophet's Mosque during the Time of the Prophet"
  (https://muslimheritage.com/function-of-the-prophet-mosque/): three colonnades on the qibla side, each of six or eight
  palm-trunk pillars; rear shade for the muhajirun; mud brick on a stone foundation about 1.5 m deep, walls 75 cm; roof
  of palm trunks, cross-beams, leaves and stalks, about the height of a man with raised hands.
- Madain Project, "Expansion Chronology of Masjid al-Nabawi" (https://madainproject.com/expansion_chronology_of_masjid_al_nabawi):
  50 x 50 m after 7 AH, roof raised from 2.5 m to 3.5 m, stone foundation and unbaked brick.
- Wikipedia, "Prophet's Mosque" (https://en.wikipedia.org/wiki/Prophet%27s_Mosque): 47.32 m per side after Khaybar;
  roof of beaten clay and palm leaves on palm trunks, 3.60 m. Disagreements (size, when pebbles were laid, where the
  porticoes were) are kept as they are; the model follows Madain for size and Muslim Heritage for the colonnades.

### Stage 1 gate report (crop 0,.5,1,1 below the horizon, 1920x1080, all six poses at each Time)

| Gate | Live build (verify/s1-base) | Stage 1 (verify/s1-i) | Result |
|---|---|---|---|
| brightdetail, day mean (dawn, golden) | 36.6 (38.7, 34.6) | 42.4 (48.7, 36.2) | +15.9%, pass (>= +15%) |
| clip% max | 0.01 | 0.07 | pass (< 0.5) |
| flatwhite% max | 7.38 (dawn pose 1) | 0.69 | pass (< 2) |
| GPU, 60 s flight 2560x1440 High (verify/s1-gate/perf) | 6.17 avg (Nov 16) | 7.95 avg, p99 12.68, max 14.40 | pass (<= 11 / <= 16) |
| console errors, index.html, 3 Times x High/Medium/Low | 0 | 0 (verify/s1-gate, re-run on the final build in verify/s1-final-idx) | pass |
| menu preview phone/tablet/desktop | renders | renders, 0 errors (verify/s1-gate/menu) | pass |
| index.html size | 99.8 KB | 122.6 KB (122,640 bytes) | pass (< 160 KB) |
| critic (one round, sonnet, images only) | major | **major** | fail, shipped under the brief's rule |

Night brightdetail is noise (a handful of bright pixels decide it), so the gate uses dawn and golden hour; night was
checked for clipping (0.00%) and by eye.

Critic majors and where they went: house beam ends floating in a dotted row (a real bug: the roof room's beam row spanned
the whole house; fixed), night ground reading as daylit sand (fixed: moonlit Purkinje grade, lifted moon fill). Not
stage 1, carried to stage 2: hall roof thatch tiling and identical columns, flat hall interior, brown lava (should be
black basalt), the water channel. Stage 3: far terrain speckle and Uhud detail (real DEM). The two fixes were measured
(numbers above) but not re-reviewed by a second critic round, to stay inside the usage window.

What moved the numbers (day brightdetail): GTAO+TAA+Hillaire sky 36.6 -> 39.5; houses, openings and tint 40.1; post-TAA
sharpen 1.25 41.4, 1.8 42.4; raising exposure lowered it (dawn .95->1.02, golden .74->.84 gave 38.4, reverted); the
far-oasis shadow map left the pose metrics unchanged (its area is beyond the poses) but darkens grove floors seen from
the air, as a 9 degree sun should (a 12 m palm throws a ~75 m shadow).

## Before realism (2026-11-16 delivery)

- Phase 7 delivered. Stopping rule reached: 6 critic rounds; the last verdict "major" (verify/final/critic.md).
- Perf (iter-15, 2560x1440, 60 s flight): GPU avg 6.17 ms, p99 6.70, max 7.04. index.html 97.4 kB.
- Open items from the last critic: the mosque is not legible from the air, lava reads brown and its lobe edge
  looks cut out, the wadi glitters, the hall columns and thatch read as manufactured, far groves still read as a
  planted pattern, posterised shadow edges at the low sun, tiny window openings.

## What is reasonably known, and what is a guess

| Element | Source says | Here | Status |
|---|---|---|---|
| First mosque, 1 AH (622) | about 35 x 30 m, oriented north-south; qibla wall first to the north (Jerusalem) | built as the 7 AH state instead | known |
| Expansion, 7 AH (629) | about 50 x 50 m (100 x 100 cubits); roof height raised from about 2.5 m to 3.5 m | 50 x 50 m enclosure, roof underside 3.5 m | known (approximate) |
| Walls | unbaked mud brick (labin) on stone foundations about 3 cubits (1.5 m) deep; walls about 75 cm thick | 0.75 m mud-brick walls, a low course of stone footing showing above ground, patchy mud render | thickness known; visible footing height and render are guesses |
| Wall height | not stated directly in the sources checked | 3.8 m, just above the roof | guess |
| Columns and roof | palm-trunk columns; roof of palm trunks/cross beams covered with palm leaves and stalks and mud | palm-trunk columns, trunk beams, stalk joists, a frond-and-mud slab | known |
| Roofed area | three porticoes on the qibla (south) side, six or eight palm pillars each | three rows of 13 columns (the wider 7 AH mosque) | row count known, column count a guess |
| Suffah | a covered shelter at the rear (north) after the qibla change | one-bay shelter on the north side, west half | location known, extent a guess |
| Gates | three entrances; after the qibla change the south one was closed and a north one opened (east and west remained) | gates north, east, west, all 2.4 m wide | positions approximate, sizes guesses |
| Floor | unpaved earth at first, gravel later | earth with pebbles | approximate |
| Minarets, domes, minbar decoration | none in this period | none | known |
| Rooms of the Prophet's ﷺ household | adjoined the mosque, mostly on the east side; mud brick and palm stalks; low ceilings | a row of plain closed low rooms outside the east wall, no doors or openings shown | location approximate; form a guess; interiors deliberately not shown |
| Utum (atam) | stone and mud fortified tower-houses, square in plan, multi-storey, one per clan | square tapering towers of coursed stone, about 12 m, small slits, a parapet | form a guess |
| Houses | mud brick, flat roofs of palm trunks and fronds | single-storey flat-roofed houses, some with a roof room (outside mud stair) or a yard (frond shelter), two-storey ones, palm-wood beam ends, lintels and posts, frond shades (arish) on palm posts with a mud bench; doors and small high windows open onto dim rooms, some lit by an oil lamp at night; render clay and age vary by neighbourhood | guess within the known materials (realism stage 1) |
| Harrat | Madinah lies between lava fields: Harrat Waqim east, Harrat al-Wabara west, Harrat Rahat south | black basalt east (near) and south and west (far) | known |
| Uhud | about 4-5 km north, a long red granite massif | far ridge 4.3 km north, about 380 m relief | known, distance compressed |
| Jabal Sal' | a hill just north-west of the mosque | low dark hill 1 km north-west | position composed |
| Wadi al-Aqiq | to the west | sandy wadi crossing the near field's west side | composed |
| Quba | the first mosque built, a village about 3-6 km south | a small enclosure with palm columns 2.5 km south-south-west | form a guess, distance compressed |
| Wells | the oasis was watered by wells (Bi'r Ha north of the mosque, Bi'r Aris at Quba, and others) | stone-ringed wells with wooden frames, earthen ditches | form a guess |

Sources checked 2026-11-15:
- Muslim Heritage, "The Form and Function of the Prophet's Mosque during the Time of the Prophet"
  (https://muslimheritage.com/?p=13537): stone foundation three cubits (about 1.5 m) deep, adobe walls 75 cm
  wide, roof of palm trunks and cross beams covered with palm leaves and stalks, three porticoes on the qibla
  side with six or eight palm-trunk pillars each, rear shade for the homeless muhajirun, three original
  entrances and the qibla change.
- Madain Project, "Expansion Chronology of Masjid al-Nabawi"
  (https://madainproject.com/expansion_chronology_of_masjid_al_nabawi): 35 x 30 m in 1 AH, 50 x 50 m after the
  7 AH expansion, roof height raised from 2.5 m to 3.5 m, palm columns, palm-branch roof.
- Wikipedia, "Prophet's Mosque" (https://en.wikipedia.org/wiki/Masjid_Nabawi): roof of beaten clay and palm
  leaves on palm trunks, about 3.6 m high; mud brick on a stone base.
- Archnet, pre-Islamic Medina (https://next.archnet.org/authorities/3802), Brown University Joukowsky
  Institute glossary (https://webhelper.brown.edu/joukowsky/courses/islamicarchaeologyglossary2007/4434.html),
  DergiPark study on utum (https://dergipark.org.tr/tr/download/article-file/5560437): utum as square stone
  and mud tower-houses, defensive and residential, a network of clan strongholds rather than a city wall.
- Saudipedia on Madinah's geography and lava fields (https://saudipedia.com/en/are-there-lava-fields-in-al-madinah-al-munawwarah),
  Harrat Rahat and Battle of al-Harra articles: Harrat Waqim east of the city; Quba south; Jabal Sal'
  north-west; Wadi al-Aqiq cutting through the harrat.
- Sibling world Madinah Horizon (its NOTES.md) for Uhud's distance and colour and the basalt look.

## Geography (composed, not to scale)

Axes: +x east, -z north, y up, metres. Ground near 0.

- First mosque centred at (0, -40), 50 x 50 m, qibla (south) wall at z = -15. Ground flattened around it.
- Household rooms: a row along the outside of the east wall, x 25.4-31, broken by the east gate (z = -48).
- Settlements: west of the mosque (with the lane of pose 3 to an utum), east of it, a row to the north.
- Groves: walled gardens south of the open ground in front of the qibla wall, a strip west of the wadi.
- Wadi al-Aqiq: x about -150, crossing north-south. Black lava front from x about 118 eastward.
- Far: Jabal Sal' (-600, -650), Uhud centred (300, -4300), Ayr (-700, 4300), scoria cones east,
  Harrat al-Wabara west of x -2300, hamlets and groves over the oasis, Quba at (-380, 2500).

## Six poses (keys 1-6)

1. Lane: between garden walls and palms, the qibla wall of the mosque ahead, Uhud beyond.
2. Courtyard: inside the enclosure by the north gate, looking south to the palm-column prayer hall.
3. Settlement: a lane between mud-brick houses toward a stone utum among palms.
4. Lava edge: on the black basalt looking north-north-west over the oasis to Sal' and Uhud.
5. Wadi: sandy bed with acacias, looking north to Uhud.
6. Flight: 150 m up south-east of the mosque, looking north-west over the oasis to Uhud.

Fly path (60 s): along the grove lane, over the qibla roof and the courtyard, west over the houses to the
wadi, south through the wadi, east over the groves and the hill, the lava, then rise to pose 6.

## Palette (linear, golden hour)

Sun (2.9, 2.1, 1.35) HDR · sky zenith (.10, .24, .58) · horizon (.98, .66, .42).
Mud brick (.47, .32, .19) · render (.56, .42, .28) · basalt (.035, .034, .034) · palm green (.16, .22, .07) ·
pebble floor (.55, .46, .34). Accents: date clusters (.75, .30, .04), the dark frond-shade under the roof.

## Critic intent paragraph

The oasis of Madinah in the 7th century at golden hour: warm, quiet, reverent, timeless. Dense date-palm groves
in mud-brick garden walls, wells and earthen irrigation ditches, scattered flat-roofed mud-brick houses and a
few square stone tower-houses, lanes of packed earth. At its heart a very simple mosque: a square enclosure of
mud-brick walls on a stone footing, an open earth courtyard, and a shaded prayer hall of palm-trunk columns
under a roof of palm fronds; plain low rooms against its east side. Black volcanic lava fields at the oasis
edge, a sandy wadi with acacias, the long red granite massif of Mount Uhud on the northern horizon. Long
shadows, sun shafts through palm fronds, soft golden haze turning grey-blue with distance. No people, no
minarets or domes, nothing modern.

## Sun, movement, audio

- Sun static: elevation 9 degrees, from the west-south-west (from the left when facing north). Baked shadow
  map for the near field; far terrain gets a CPU-baked heightfield shadow.
- Walk: eye 1.7 m, gravity, slide collision on the density field plus box collision for walls and houses.
  Fly (F): free 6-DOF, max 260 m altitude, radius 600 m. Dev flight on P, benchmark B.
- Audio: wind bed with gusts, frond rustle, dove coos, small-bird chirps, a soft drone. Nothing recited.

## Iteration log

- iter-00..02 (self-review): buildings read as rock (bump too high), courtyard dune texture, lava slab at the near-field edge,
  pose 2 moved into the colonnade, far palms capped by scan order.
- iter-03 critic (major): hall dark, zebra columns, lava slab and bald dome, rectangular oasis edge, frond aliasing,
  beach-sand lanes, bare cube houses. Fixed: bark from normals, frond thatch, warm bounce, lava as an irregular lobe inside
  the near field, grove ring outside it, parapets/beam ends/door frames, well at the ditch head.
- iter-07 critic (major): mosque unreadable from above, far palm rows, Sal' with palms, lava speckle, hall tunnel, white
  wadi, frond aliasing. Fixed: warmer hall (0.75 bounce), jittered far groves, Sal' palm-free, calmer lava/wadi detail,
  fewer wider leaflets, litter on open ground, Uhud 1.2x taller.
- iter-09 critic (major): toothpick far palms, detached fronds, lava slab, carport hall, mosque unreadable from above.
  Fixed: patchy far groves, tapered 12-sided columns, pose clearances, warmer sky ambient, darker hall roof.
- iter-11 critic (major): acid-green fronds, hall, linoleum lanes, lava speckle, mosque contrast. Fixed: olive fronds
  with real backlight, rotated-disk shadow filter, trimmed-trunk bark, lanes between smooth and rippled.
- iter-14 critic (major): detached fronds at pose 1, hall, posterised shadows, lava decal edge, far sticks.
  Fixed: 15 m palm clearance at pose 1, dark lava rims, calmer basalt, darker far trunks, warm bounce in shade.
- iter-15 critic (major, round 6 of 6): stop. Verdict and top items in verify/final/critic.md.
- Critic notes contradicted each other on the ground (beach sand at round 1, a listed strength at rounds 2-6); the
  rippled sand was kept as the critics' repeated strength.

