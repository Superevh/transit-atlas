# Transit Atlas style

The look is locked in `assets/template.html`. `scripts/check.mjs` compares the style block and both scripts byte for byte with the template, and checks the tokens below by value. This file explains the system; it does not give permission to change it.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5ECD6` | Map paper, everywhere behind the map |
| `--paper-sheet` | `#FBF4E2` | Panels, station fill, roundel numerals |
| `--river` | `#CFE3DC` | The river, ornament only |
| `--ink` | `#14161B` | Type, station outlines, header bands |
| `--ink-soft` | `#55534B` | Section headings, verbs, counts |
| `--rule` | `#14161B` | Rules |
| `--unknown` | `#FFD60A` | Reserved: unknown markers and the fictional stamp. Never a line colour. |
| `--line-1` to `--line-8` | `#D0241D` `#0B4EA2` `#087A41` `#EE6C00` `#6B2C9E` `#007686` `#CB196F` `#7A4A1E` | Line colours, fixed to the line number. Each reaches 4.5:1 against the paper, except line 4, which keeps a vivid orange: its numeral is ink and its name uses `--line-4-text` `#B04F00`. |

## Fonts

No embedded fonts, so no licence file and no requests.
- Latin: `"Helvetica Neue","Nimbus Sans","Liberation Sans",Arial`, then the Chinese stack, then `sans-serif`.
- Chinese (`html[lang^="zh"]`): `"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei"`, then the Latin stack.

Text widths in the layout are estimated from character classes, not measured, so geometry is the same on every machine even if the fallback font differs.

## Type scale (px, weight)

| Element | Size | Weight |
|---|---|---|
| Plate title | 23 (17 on phones) | 800 |
| Dossier title | 28 (23 on phones) | 800 |
| Handoff column title | 22 | 800 |
| Station label, in map units | 18 (never below 11 px on screen at Fit on 1280x800) | 700 (800 when selected) |
| Roundel numeral, in map units | 15 | 800 |
| Line name beside a roundel, in map units | 14 | 800 |
| Legend rows and body | 14 | 700 / 500 |
| Section headings | 12, letter-spaced .06em | 800 |

## Layout

Map grid: column 158, row 132, track width 7.5 (casing 12), parallel tracks 9.5 apart, corner radius 20, all in map units.

Every track segment runs at 0, 45 or 90 degrees. Bends are rounded; station joints are not.

A map too wide to read folds like paper: it is cut into bands, every second band runs the opposite way, and lines continue through a 45 degree U-turn at the edge. The fold is chosen to give the largest label size at Fit. If the label size would still be tight, line names beside roundels are dropped; the legend keeps them.

Labels never stack, sit end to end close enough to read as one caption, or cover a track, link or plate. Focusing a station frames it with everything it connects to. A direct link prefers a channel between rows over a run along a track, and its arrow sits at its clearest point.

Screen, above 760 px wide: title plate and legend in a left column 296 wide; search and handoff button top right; zoom bottom right; dossier 384 wide on the right, and the tools move aside for it. The map fits the free area.

Screen, up to 760 px wide: compact plate on top; search, legend, handoff and Fit buttons in an opaque bottom bar, with pinch for zoom; legend and dossier as bottom sheets (dossier 58% of the height). The map opens at reading size, scale .62 to .72, placed so at least one unknown marker is on screen. The count button opens the handoff with unknowns first. Fit shows the whole map.

## The marks

- **Roundel.** An octagon in the line colour with a cream inner rim and a bold numeral: the shape built from the same 45 degree bends as the tracks. One at each end of a line, one for a loop. The line's name sits beside whichever roundel has clear ground; if neither has, only the legend names it.
- **Station.** Shape follows type (see `references/schema.md`). A station on two or more lines gets an ink interchange ring.
- **Direct link.** Ink line 4 units wide, drawn beneath the tracks, with a larger chevron. Inferred links carry the same plate as inferred tracks.
- **Direction.** A small chevron at the middle of the longest straight run.
- **Fact.** Solid track, no marker.
- **Inference.** Long dashes, and a cream plate with an approximately-equal sign on every inferred station, track and link.
- **Unknown.** Dotted track and a yellow plate with a question mark. An unknown station also has its label on yellow. A filter that hides it keeps its plate and name on the map; a track's plate hides with its track. The handoff button counts open questions: items sharing a basis are one.

## Motion

| Moment | Time | Curve |
|---|---|---|
| Tracks draw in on load, staggered by column up to 620 ms | 760 ms | `cubic-bezier(.2,.7,.2,1)` |
| Stations, marks and roundels fade in on load | 300 ms | same |
| Camera to a station, Fit | 380 ms | cubic ease-out |
| Zoom buttons | 220 ms | cubic ease-out |
| Dossier slide | 380 ms | `cubic-bezier(.2,.7,.2,1)` |
| Dimming and filters | 160 ms | linear |
| Selected station ping | 520 ms | once |

Load animation ends by 1.7 seconds, after which its class is removed. With reduced motion, everything appears at once and the camera jumps.

## Do

- Choose lines that mean something: one journey each.
- Keep labels short enough to wrap into two lines.
- Mark things as unknown rather than leaving them out.

## Do not

- Do not edit the CSS, the scripts, a colour or a position. Change the JSON and rebuild.
- Do not use yellow or the question mark for anything except unknowns.
- Do not give the river any meaning. It is derived from the map's size alone.
- Do not mix languages in one map.
- Do not make a line for every edge. Thin links exist for reads and dependencies.
