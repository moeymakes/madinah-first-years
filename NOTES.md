# Madinah, First Years: build notes

Built with the `worldsmith` skill (`/home/moey/.shared/skills/worldsmith`), starting from the source of
`/home/moey/Dev/projects/madinah-horizon` (copied, never edited there). Brief: `prompt.txt`.

## State (update after every step)

- Phase: 7 (delivered). Stopping rule reached: 6 critic rounds used (iter-03, 07, 09, 11, 14, 15); the last verdict
  is still "major" (verify/final/critic.md). Not passed; stopped by the round limit, as the brief says.
- Last good capture: verify/iter-15 (dev.html), verify/final-min-high and verify/final-min-low (index.html at High and
  at Low via --storage madinahFY=2): 0 console errors on all three.
- Perf (iter-15, RTX 3070, 2560x1440, 60 s flight; other worlds may have been rendering on the same GPU):
  GPU avg 6.17 ms, p99 6.70, max 7.04 -> passes the 11 ms target. Frame line is vsync-locked headless (16.67).
- index.html: 97.4 kB (99,762 bytes), 39.7 kB gzipped. Load to menu about 3 s headless.
- Watchdog: none (subagent run without CronCreate).
- Open items from the last critic: the mosque is not legible from the air, lava reads brown and its lobe edge
  looks cut out, the wadi glitters, the hall columns and thatch read as manufactured, far groves still read as a
  planted pattern, posterised shadow edges at the low sun, tiny window openings. Not done: touch controls and the
  Medium level were not re-tested; Low shows a few floating grass blades in pose 1.

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
| Houses | mud brick, flat roofs of palm trunks and fronds | single-storey flat-roofed houses, some with a roof room or a yard, beam ends showing | guess within the known materials |
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

