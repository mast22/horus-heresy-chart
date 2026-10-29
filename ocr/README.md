# OCR and classification

These scripts read `sources/chart.png` (the Black Librarium “THE HORUS HERESY: SPOILER-FREE READING ORDER” v3.0 poster, 12000×12556) and classify it into work boxes, publication kinds, gold ribbons, shortcut badges, conflict zones, and directed arrows.

The page reads `src/flow/chart.ts`. `build_graph.py` writes a draft to `ocr/out/chart.ts`. That draft is a starting transcription. The shipped chart has later hand edits listed at the end of this file. Copy the draft over `src/flow/chart.ts` only after those edits are back in place.

Generated JSON, crops, and the draft chart go in `ocr/out/`. That directory is gitignored. The scripts create it.

## Requirements

- macOS, with the system Swift toolchain and the Vision framework. Tesseract is not used.
- Python 3 with the libraries in `requirements.txt`. The transcription used numpy 2.5.4, scipy 1.18.1, scikit-image 0.26.0, and Pillow 12.3.0, installed on the user site.

```bash
python3 -m pip install --user -r ocr/requirements.txt
swift --version
```

The Swift files import AppKit. They run on macOS. The Python steps can run on another machine once `ocr.json` and the poster are already there.

## Files

| File | Role |
| --- | --- |
| `ocr.swift` | Tile the poster and run Vision OCR. |
| `bands.py` | Measure the horizontal faction fills inside a box, top to bottom. This is the only band measurement. |
| `extract_nodes.py` | Cluster hits into work boxes, classify the publication line, and record those fills. |
| `reocr.swift` | Re-read each box at 3× so titles split by a tile boundary come back clean. |
| `extract_edges.py` | Trace red, blue, and green arrows and detect shortcut badges. |
| `build_graph.py` | Emit `ocr/out/chart.ts` from those products. `color` is the band list. |
| `scan_boxes.py` | Pair black horizontal rules and report boxes the seeder missed. |
| `measure_new.py` | Measure a fixed list of poster seeds, including their fills, and walk the arrow that leaves each one. |

A headless Chrome check was used to confirm the running page. It does not read the poster or classify nodes, so it is not part of this folder.

Paths are resolved from the script file. The working directory can be the repo root or anywhere else. Swift still needs the image path you pass on the command line.

## Run the pipeline

From the repo root:

```bash
swift ocr/ocr.swift sources/chart.png ocr/out/ocr.json
python3 ocr/extract_nodes.py
swift ocr/reocr.swift sources/chart.png ocr/out/nodes.json ocr/out/reocr.json
python3 ocr/extract_edges.py
python3 ocr/build_graph.py
```

`ocr.swift` prints `image 12000x12556`, one line per tile, then `wrote N hits`. On this poster the original run wrote 1076 hits and took about half a minute.

`extract_nodes.py` prints `deduped hits`, `clusters`, `works`, a sample table, and an `ANCHORS` list. The original run reported 575 deduped hits, 245 clusters, 216 works, and 29 skipped clusters.

`reocr.swift` prints `reocr N` to stderr. The original run printed `reocr 216`. The JSON is compact, not pretty-printed.

`extract_edges.py` prints badge count, head count, skeleton size, and an anchor neighbourhood. It holds the chart body in memory (about 12000×7800 RGB plus several masks). Expect several minutes and on the order of a gigabyte of RAM. The original tracer wrote on the order of 175 edges before the hand corrections below.

`build_graph.py` prints kind counts, which badges it kept, zone rectangles, edges it dropped or inserted, and `wrote .../ocr/out/chart.ts`. The last line says the draft left `src/flow/chart.ts` alone.

Second pass, after the shipped chart exists. These two read `src/flow/chart.ts`. They do not edit it.

```bash
python3 ocr/scan_boxes.py
python3 ocr/measure_new.py
```

`scan_boxes.py` prints how many horizontal rules it paired, which existing novels it failed to cover, and one `NEW` line per box that does not overlap a work already in the chart. Crops land in `ocr/out/unmatched-boxes/box-NNN.jpg`. The original scan paired 145 boxes and missed 0 known novels. The in-body discoveries were the four Siege novels. A tank under a STORYLINE label and the footer emblems (page y greater than about 11618) were also paired. They are not works.

`measure_new.py` prints a measured rectangle for each hardcoded seed, then the node a colour walk reached. The rectangle line includes `fills`, the band hexes from `measure_bands`, and the older single `fill` median. Seeds are poster pixels for this chart (Misbegotten, Terminus, Chamber, Prince of Blood, Scions of the Storm, the second SC and AE badges, and Terra Books 3–6). A new poster needs new seeds. The walk can stop on a vertical spine. Confirm with the pixel check in the debug section before adding an edge.

## Products

`ocr/out/ocr.json` is a pretty-printed array. Vision boxes are normalised with the origin at the bottom-left of the tile. The script converts them to page pixels whose origin is the top-left of the poster.

```json
{
  "conf": 0.91,
  "h": 22.0,
  "text": "MECHANICUM",
  "w": 160.0,
  "x": 1204.0,
  "y": 4688.0
}
```

`ocr/out/nodes.json` is one object per classified work:

```json
{
  "id": "mechanicum",
  "title": "MECHANICUM",
  "publication": "Book 9",
  "book": 9,
  "kind": "novel",
  "textBox": [1180.0, 4660.0, 1400.0, 4740.0],
  "box": [1100, 4600, 1480, 4780],
  "ribbon": true,
  "fill": [180, 40, 40],
  "fills": [[180, 40, 40]],
  "lines": ["MECHANICUM", "Book 9"],
  "cx": 1290.0,
  "cy": 4690.0
}
```

`box` is `[x0, y0, x1, y1]` in page pixels, including the black border. `id` is a slug of the first-pass title, cut at 48 characters. A repeated slug gets `-2`, `-3`, and so on, in top-to-bottom then left-to-right order. Tile-boundary garbage stays in the id (`the-maste-f-mankin`, `prospero-ero-burns`, `fulgrim-rim`). Edges use that id. Leave it in place if you already have an `edges.json` that points at it.

`fills` is the faction colours inside that box, top to bottom. Each entry is `[r, g, b]`. One fill is a list of one colour. A book about several legions is several entries, in order. `fill` is the older single median and is not that list. `nodes-with-badges.json` uses the same two fields on each shortcut badge.

`reocr.swift` reads `id` and `box` and ignores every other field, so you can pass `nodes.json` straight through. Each result is `{ "id", "lines": [{ "text", "x", "y", "w", "h", "conf" }] }`. Line geometry is in page pixels, at the original scale, even though the recogniser saw a 3× image.

`edges.json` entries look like this:

```json
{
  "source": "the-kaban-project",
  "target": "mechanicum",
  "cls": "primary",
  "sourceTitle": "THE KABAN PROJECT",
  "targetTitle": "MECHANICUM",
  "dist": 420
}
```

`cls` is `primary`, `secondary`, or `tertiary`. `dist` is the skeleton length in pixels. `nodes-with-badges.json` is the work list plus shortcut badges, with boxes shifted back to page coordinates.

`chart.ts` exports `works`, `edges`, `zones`, and `buildChartGraph()`. Each work's `color` is a readonly string array, one hex per band, top to bottom. `faction` and `text` stay one hex each.

## How a work is classified

`extract_nodes.py` keeps hits with confidence at least 0.45 whose top is between y 4200 and y 11940. The era bar sits near y 3880–4132 (black, then gold, split at x 9220). The footer trademark starts near y 11920. Hits whose centres fall in the same 28×16 cell collapse to the longer string.

A cluster joins two hits when the vertical gap is at most 24px and the horizontal overlap is at least 0.28 of the narrower hit, or when the gap is under 16px and the centre-x values are within 36px.

A cluster becomes a work when one of its lines matches a publication:

- `Terra Book N` or `Book N`
- ebook, audio, novella, anthology
- Primarchs (with ebook, audio, or book)
- Characters Series
- graphic novel

An arrow glyph on that publication line (`→`, `->`, `>`, `›`, `»`) makes the kind `shortStory`. Otherwise a numbered book is a `novel`, including `Terra Book`. The other words map to `ebook`, `audio`, `novella`, `anthology`, `primarchs`, `characters`, or `graphicNovel`.

The text box grows outward until it hits a black rule (channels under 45, at least 55% of the sampled span). A border wider than 700px or taller than 280px is a zone frame and is skipped. So is a border under 36×28.

A gold ribbon is more than 70 gold pixels in the 52px strip under the box. Gold is R > 190, G between 110 and 220, B < 100, and R > G.

`build_graph.py` replaces the title and the publication with the 3× read when that read is usable. An arrow still counts only on the publication line. A bullet on some other line, such as a decorative `•..` inside the box, does not turn a novel into a short story. Mechanicum stays `Book 9`, kind `novel`.

`bands.py` measures the fills. `extract_nodes.py` calls `measure_bands` on each work box and writes `fills`. `build_graph.py` copies that list into `color` as hex strings. A work written before `fills` existed falls back to a one-element list of the legacy `fill`. Faction still snaps each channel of that single `fill` to a multiple of 32. Ink is `#1c1917` when that fill's luminance is above 155, and `#f6f1e6` otherwise. The page does not paint from `text`. `scripts/check-colors.ts` calls the same `measure_bands` function and does not keep a second copy of the measurement.

One fill that spans the box stays one colour. A black fill stays black; the light type on it is not a colour. Glyph ink, the black border, gold ribbons, antialiased fringes, and the page showing in a rounded corner are not colours. A stripe about 6px tall that still spans the node counts. A pale cream or light-gray fill counts when it fills the band. Adjacent rows of the same fill are one band. A page-like cap is not merged into a real fill, so a cream badge is not trimmed away with the paper.

Era is `siege-of-terra` when the box centre x is at least 9220 or the publication starts with `Terra Book`. Everything else in the body is `horus-heresy`.

Shortcut letters on this poster are F, FT, SC, OE, W, R, and AE. The tracer keeps pink badges as F and dark-red badges as FT. `badge-20` and `badge-21` were corners of ordinary boxes and are dropped. SC, R, OE, W, and AE use measured rectangles in `build_graph.py`, including the SC box `[3048, 6071, 3109, 6121]`. A zone border had widened the automatic bbox for that badge. Each of those five rectangles is measured with `measure_bands` on its own box. The colour is not copied from the novel. F and FT use `fills` from the tracer when that field is present. An older badge file has only `fill`, and `build_graph.py` then measures the badge box the same way. Each badge's `standsFor` is the novel id in `SHORTCUT_NOVELS`.

## How an arrow is classified

The tracer crops x 60–11940, y 4140–11920.

| Class | Colour | Head | Stroke |
| --- | --- | --- | --- |
| primary | red: R > 155, R > G+55, R > B+55, G < 120, B < 120 | solid triangle | solid |
| secondary | blue: B > 105, B > R+40, B > G+15, R < 110, G < 170 | diamond | dotted |
| tertiary | green: G > 110, G > R+35, G > B+25, R < 130, B < 130 | circle | dotted |

Dark maroon fills and black borders (all channels under 42) are not lines. Dashes are closed with a 1×21 horizontal rectangle, a 21×1 vertical rectangle, then a disk of radius 2. The skeleton is walked from the arrow head back to the first other box. Contact is a gap under 7px after 8 steps. A dead end may snap to a box within 48px.

Work boxes are dilated by a disk of radius 3 so the stroke that touches the border is cut. Shortcut badges are not dilated. Dilating them severs a red line that runs beside an F badge, and the walk then starts at the badge.

`build_graph.py` drops an edge whose traced length is over 3200 and whose endpoints differ in y by more than 180. It then applies four fixed corrections:

- remove primary `bringer-of-sorrow` → `magisterium`
- add primary `the-maste-f-mankin` → `magisterium`
- add primary `prospero-ero-burns` → `rebirth`
- add tertiary `mechanicum` → `the-last-church`

The long jumps removed on the original trace were Into Exile → Wolf Hunt, Black Oculus → Dreadwing, Sermon of Exodus → Luther, The Last Remembrancer → The Crimson Fist, The Buried Dagger → Sons of the Selenar, Vulkan Lives → Templar, The Last Council → The Solar War, and Duty Waits → The Lost and the Damned. Into Exile → The Master of Mankind stayed.

Zone rectangles come from long black rules near a label seed. Schism of Mars and War Within the Webway use the measured fallback. A detection wider than 2800 or taller than 1800 is rejected. Other zones may be approximate. A work's zone is the smallest rectangle that contains its centre.

## Original counts

These are the numbers recorded for this poster. A newer Vision model can change the hit text, so treat them as a comparison, not a test the scripts enforce.

| Stage | Recorded result |
| --- | --- |
| `ocr.json` | 1076 hits |
| `extract_nodes.py` | 575 deduped hits, 245 clusters, 216 works, 29 skipped |
| Kinds | anthology 1, audio 7, characters 1, ebook 16, graphicNovel 1, novel 50, novella 6, shortStory 134 |
| Ribbons on that pass | 26 |
| `reocr.swift` | 216 boxes |
| Tracer | about 175 edges, before hand edits |
| `scan_boxes.py` | 947 rules, 145 paired boxes, 0 known novels missed |

The shipped page, after the hand edits, has 245 Horus Heresy works, 8 Siege of Terra works, 176 edges, 29 ribboned works, and 28 shortcut badges. `scripts/check-graph.ts` checks that graph. It does not check `ocr/out/`.

## FAQ

**The anchors section prints 0 for Mechanicum or The Master of Mankind.** The cluster was skipped. Either no line matched the publication pattern, or the border search latched onto a zone frame (wider than 700 or taller than 280). Print the cluster lines: search `ocr.json` for the title and look at `y`. The body filter drops anything above y 4200.

**A title is split or misspelled, but the box is in the right place.** The first pass tiles at 2200px with 280px of overlap and turns language correction off, so a title on a tile edge can read as `THE MASTE F MANKIN]` or `PROSPERO ERO BURNS`. `reocr.swift` reads the finished box at 3× with language correction on. `build_graph.py` uses that text for the visible title and keeps the garbled id.

**Mechanicum came out as a short story, publication `→ Book 9`.** An arrow glyph on the publication line marks a short story. A stray bullet on another line does not. `choose_publication` in `build_graph.py` only looks at the original publication string and at reocr lines that themselves contain Book, ebook, audio, novella, primarch, character, graphic, or anthology. Mechanicum's publication is `Book 9`.

**Stories from Sons of the Emperor, Blood of the Emperor, or Scions of the Emperor are missing.** Those anthology names do not match the publication pattern, so `extract_nodes.py` drops the cluster. `scan_boxes.py` still sees the black rules. The shipped chart adds Misbegotten, Prince of Blood, Terminus, The Chamber at the End of Memory, and Scions of the Storm by hand.

**The draft has no First Wall, Saturnine, Mortis, or Warhawk.** The rectangular seeder missed that row. `scan_boxes.py` reported them as unmatched in-body boxes. They are novels on y 7978 in `src/flow/chart.ts`, with gold ribbons and a primary chain from The Lost and the Damned. The draft emitter does not add them.

**`reocr.swift` will not decode `nodes.json`.** The current decoder reads `id` and `box` and ignores the other keys. A decode error means the file is not a JSON array, or some `box` is missing or is not four integers. A strict decoder can be fed a projection:

```bash
jq 'map({id, box})' ocr/out/nodes.json > ocr/out/nodes-slim.json
swift ocr/reocr.swift sources/chart.png ocr/out/nodes-slim.json ocr/out/reocr.json
```

**`build_graph.py` crashed looking up `the-maste-f-mankin` or `the-cr-the-crimson-king`.** The anchor report at the bottom of `main` expects the ids produced from this poster's first-pass OCR. A different OCR pass produces different slugs. The crash is in the report, after classification. Inspect `nodes.json` ids and retarget those prints, or skip the report. Do not rename the shipped ids without updating every edge that uses them.

**Can this run from a laptop that is not a Mac?** Copy `ocr.json` from a Mac, then run the Python steps. `ocr.swift` and `reocr.swift` need AppKit and Vision.

**Pillow refuses the poster.** The scripts set `Image.MAX_IMAGE_PIXELS = None` before `Image.open`. A one-off snippet that omits that raises `DecompressionBombError` on a 12000×12556 image.

**Saving a crop raises `OSError: cannot write mode RGBA as JPEG`.** Convert to RGB first. `scan_boxes.py` already calls `.convert("RGB")` before `save`.

## Problems and how to debug

Work down the pipeline. Each step's input is the previous step's file. A wrong box in `nodes.json` sends `reocr.swift` to the wrong crop and sends the tracer to the wrong port.

**Text is mirrored vertically, or landmark lines sit near the bottom.** CGImage's crop origin on this buffer is the top-left. The first version cropped at `height - oy - th`, which flipped the page. `ocr.swift` now crops at `(ox, oy)`. Check: hits for the era label should sit near y 3880–4132, and chart-body titles should sit between y 4140 and y 11920. If they are piled at the bottom, the origin was flipped again.

**`failed to load image` or `failed to make cgimage`.** The path does not point at the poster. From the repo root the argument is `sources/chart.png`. AppKit reads PNG and JPEG.

**`FileNotFoundError` for `ocr/out/ocr.json`.** Run `ocr.swift` first. The Python scripts look next to themselves, in `ocr/out/`, not in the current directory.

**`ModuleNotFoundError: numpy` (or scipy, skimage, PIL).** Install `ocr/requirements.txt`. Confirm with `python3 -c "import numpy, scipy, skimage, PIL"`.

**A box swallowed a whole storyline.** `find_border` walked out to a zone rule. The size check (width ≤ 700, height ≤ 280) is what drops it. If a real work is inside a tight frame and got dropped, print its text-box and the border it found.

**Chamfered or dog-eared boxes are missing, and a vertical-line scan finds almost nothing.** Pairing left and right borders with a 78px window failed: the dense core of an ~88px side is shorter than the height test, and arrow heads split the side rules. The scan that recovered the novels uses horizontal black runs:

1. Threshold channels under 42.
2. Close with a 1×16 structure. That bridges a vertical stroke. Neighbouring boxes are about 170px apart, so they stay separate.
3. Keep runs of length 145–340.
4. Group runs that share an x-span and sit within 10px in y. Several boxes share a row, so one run per row is the wrong grouping.
5. Keep a rule whose thickness is 2–12px and that has at least two runs.
6. Pair a top rule with a bottom rule 70–130px lower, left and right ends within 14px.

A chamfer makes the top rule shorter than the bottom. A difference above 14px rejects the pair. When that happens, take the seed from `ocr.json`, flood the interior, and measure the black pixels that touch it. That is what `measure_new.py` does for its seed list.

**`TypeError: cannot unpack non-iterable int` inside `walk_to_source`.** `best` is `(ny, nx, ang)`. The step has to be `(best[0], best[1])`. Assigning `nxt = best[0]` and then unpacking `nxt` into `y, x` raises this. The current file uses the pair.

**An F badge is the source of a red edge, and the real source is the novel beside it.** The line was cut because badges were dilated. `extract_edges.py` dilates work boxes only. Badge interiors are masked so the fill is not a line, and the rectangle is not grown.

**The tracer joins two nodes that have no arrow between them.** Common on a vertical spine. Terminus's red runs right, then down the spine between The Solar War and The Lost and the Damned. The walk continued and hit The Binary Succession. Chamber's blue is a bus that passes beside Garro and does not enter that box. Count coloured pixels in the gap before keeping the edge:

```bash
python3 - <<'PY'
from PIL import Image
import numpy as np
Image.MAX_IMAGE_PIXELS = None
im = np.asarray(Image.open("sources/chart.png").convert("RGB"))
# Page-pixel window covering the gap. Change these four numbers.
y0, y1, x0, x1 = 7700, 7900, 8900, 9600
crop = im[y0:y1, x0:x1]
r = crop[:, :, 0].astype(int)
g = crop[:, :, 1].astype(int)
b = crop[:, :, 2].astype(int)
red = (r > 155) & (r > g + 55) & (r > b + 55) & (g < 120) & (b < 120)
blue = (b > 105) & (b > r + 40) & (b > g + 15) & (r < 110) & (g < 170)
green = (g > 110) & (g > r + 35) & (g > b + 25) & (r < 130) & (b < 130)
print("red", int(red.sum()), "blue", int(blue.sum()), "green", int(green.sum()))
Image.fromarray(crop).save("ocr/out/gap.jpg", quality=85)
PY
```

Zero coloured pixels in the gap means the edge is false. A round green head in the last few pixels, as between Scions of the Storm and The Purge, is a real tertiary. A stroke that stops beside a box, such as the green line short of The First Wall, is not an edge into that box. Two vertical reds in the Saturnine–Mortis gap are the legs of one primary that routes around the opening, not two extra edges.

**`drop long jump` removed a real arrow.** The filter is `dist > 3200` and `|dy| > 180` in `build_graph.py`. Look at the dropped line in the log, then at that object in `edges.json`. A real arrow that travels a long way and changes row by more than 180px needs to be added back by hand. The eight jumps listed above were false snaps.

**Ribbon on the wrong box.** Gold is searched in the strip under the border. Bringer of Sorrow sits above The Master of Mankind's ribbon, so a loose strip marks Bringer. The shipped chart has Bringer's ribbon false and The Master of Mankind's ribbon true. Crop y from the suspect box bottom to 55px below it and count gold pixels with the mask in `has_ribbon`.

**`scan_boxes.py` prints a pile of NEW boxes.** Sort by y. Above the footer (y under about 11618) and clear of a STORYLINE illustration, compare the crop with the poster. Zone labels are regions, not nodes. The footer and the tank are the usual false pairs.

**The page and the draft disagree.** Compare counts, then ids:

```bash
python3 - <<'PY'
import pathlib, re
shipped = pathlib.Path("src/flow/chart.ts").read_text()
draft = pathlib.Path("ocr/out/chart.ts").read_text()
def ids(text, kind):
    body = text.split("export const edges")[0]
    return set(re.findall(r'id: "([^"]+)"', body))
print("only in shipped", sorted(ids(shipped, "w") - ids(draft, "w"))[:40])
print("only in draft", sorted(ids(draft, "w") - ids(shipped, "w"))[:40])
PY
```

Run `node --experimental-strip-types scripts/check-graph.ts` against the shipped module after any edit you do keep. That script imports `src/flow/chart.ts`.

## Hand edits the draft does not contain

`build_graph.py` already removes the Bringer → Magisterium primary and adds the three `ensure()` edges above. It also hardcodes the five measured shortcut stubs and writes every `color` array from `measure_bands`. Colours are not a hand edit. A fresh draft still needs the rest of this list before it can replace `src/flow/chart.ts`.

Works added from the border scan and the seed measurements:

- `the-first-wall`, `saturnine`, `mortis`, `warhawk`: novels, publications `Terra Book 3` through `Terra Book 6`, ribbon, era `siege-of-terra`, y 7978, width 180, height 94. Primary chain: The Lost and the Damned → The First Wall → Saturnine → Mortis → Warhawk.
- `misbegotten` (Sons of the Emperor), `terminus` (Blood of the Emperor), `the-chamber-at-the-end-of-memory` (Scions of the Emperor), `prince-of-blood` (Sons of the Emperor), `scions-of-the-storm` (`→ Book 10`).
- `shortcut-sc-2` (stands for `scars`) and `shortcut-ae-2` (stands for `angel-exterminatus`), both on y 10636.

Edges added with those works:

- secondary Misbegotten → Saturnine
- primary Grandfather's Gift → Terminus
- primary Heart of the Conqueror → Prince of Blood → A Rose Watered with Blood
- tertiary Scions of the Storm → The Purge
- primary `shortcut-sc-2` → Grey Talon
- primary `shortcut-ae-2` → The Seventh Serpent

Edges removed after a zero-pixel check, which a fresh trace can emit again:

- primary Child of Chaos → Grandfather's Gift
- primary Grandfather's Gift → Child of Chaos (the arrow on the poster goes to Terminus)
- primary Heart of the Conqueror → The Revelation of the Word (the arrow goes to Prince of Blood; the Revelation box stays)

Walks that were rejected and should stay rejected: Terminus → The Binary Succession, Chamber → Garro. Bringer of Sorrow's ribbon stays false.
