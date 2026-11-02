"""Builds the screens' font, "Telemark Screen", from the jump picture's own glyphs.

The menus set their headings, labels and choices in the same letters the jump
picture draws (src/render/pixel-font.ts): a body and a shadow one row under it.
The font is a colour font (COLRv0 with a CPAL palette): every glyph has two
layers, the shadow in palette entry 0 and the body in the text's own colour
(palette index 0xFFFF), so a stylesheet gives the body with `color` and the
shadow with `@font-palette-values`. The plain outline of every glyph is its body
alone, for a browser that does not draw colour fonts.

Pixel grid: 8 pixels to the em, from the two mark rows above the capitals down
to the baseline, which the body's last row stands on; the shadow and the marks
below a capital go under it. Every character advances 6 pixels, as in the
picture. Lower-case letters map to the capitals' glyphs.

Usage, after a change to src/render/pixel-font.ts:
  node scripts/export-screen-glyphs.mjs <glyphs.json>
  python tools/font/make_screen_font.py <glyphs.json> src/ui/fonts/telemark-screen.woff2
The script also writes the record of the build next to this script
(telemark-screen.build.sha256: the glyphs, this script, the pinned font tools
and the font); scripts/lib/screen-font-glyphs.test.mjs compares it with a fresh
export and the files of today.
"""

import json
import sys
from pathlib import Path

from build_record import write_record
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

FAMILY = "Telemark Screen"
UNITS_PER_EM = 1000
PIXELS_PER_EM = 8
PX = UNITS_PER_EM // PIXELS_PER_EM
# The default palette; a stylesheet overrides entry 0 for each tone. RGBA, 0 to 1.
DEFAULT_SHADOW = (0x74 / 255, 0x74 / 255, 0x1E / 255, 1.0)
FOREGROUND = 0xFFFF
NO_BREAK_SPACE = 0x00A0
# The font's first build, 2026-10-15 23:53:17, in seconds from 1904 as the
# format counts; fixed, so a build from the same inputs gives the same file.
BUILT_S_SINCE_1904 = 3874953197


def runs(rows: list[str], mark: str) -> list[tuple[int, int, int]]:
    """Horizontal runs of `mark` pixels as (row, first column, length)."""
    found = []
    for r, line in enumerate(rows):
        c = 0
        while c < len(line):
            if line[c] != mark:
                c += 1
                continue
            start = c
            while c < len(line) and line[c] == mark:
                c += 1
            found.append((r, start, c - start))
    return found


def outline(rows: list[str], mark: str, baseline_row: int):
    """The pixels of one kind as clockwise rectangles, one per run, the baseline row standing on y = 0."""
    pen = TTGlyphPen(None)
    for r, column, length in runs(rows, mark):
        x0, x1 = column * PX, (column + length) * PX
        y0 = (baseline_row - r) * PX
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y0 + PX))
        pen.lineTo((x1, y0 + PX))
        pen.lineTo((x1, y0))
        pen.closePath()
    return pen.glyph()


def component(base: str, glyph_set: dict):
    """A glyph drawn as another one, so the body layer does not repeat the base glyph's outline."""
    pen = TTGlyphPen(glyph_set)
    pen.addComponent(base, (1, 0, 0, 1, 0, 0))
    return pen.glyph()


def build(glyphs_path: str, out_path: str) -> None:
    raw = Path(glyphs_path).read_bytes()
    data = json.loads(raw.decode("utf-8"))
    frame = data["frame"]
    # The frame's row that stands on the baseline: the body's last row.
    baseline_row = frame["baselineRow"] - frame["topRow"]
    if frame["rows"] - baseline_row - 1 < 0 or baseline_row + 1 != PIXELS_PER_EM:
        sys.exit("the glyph frame does not put 8 pixels from its top to the baseline")
    advance = frame["advance"] * PX

    order = [".notdef"]
    outlines = {".notdef": TTGlyphPen(None).glyph()}
    cmap: dict[int, str] = {}
    layers: dict[str, list[tuple[str, int]]] = {}
    for index, glyph in enumerate(data["glyphs"]):
        char, rows = glyph["char"], glyph["rows"]
        name, body, shade = f"g{index}", f"g{index}.body", f"g{index}.shade"
        order += [name, body, shade]
        outlines[name] = outline(rows, "#", baseline_row)
        outlines[body] = component(name, outlines)
        outlines[shade] = outline(rows, "o", baseline_row)
        if any("#" in row or "o" in row for row in rows):
            layers[name] = [(shade, 0), (body, FOREGROUND)]
        for c in {char, char.lower()}:
            if len(c) == 1:
                cmap.setdefault(ord(c), name)
        if char == " ":
            cmap[NO_BREAK_SPACE] = name

    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.font["head"].created = fb.font["head"].modified = BUILT_S_SINCE_1904
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(outlines)
    glyf = fb.font["glyf"]
    metrics = {}
    for name in order:
        glyf[name].recalcBounds(glyf)
        metrics[name] = (advance, getattr(glyf[name], "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    descent = (frame["rows"] - baseline_row - 1) * PX
    fb.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=-descent)
    fb.setupOS2(
        sTypoAscender=UNITS_PER_EM,
        sTypoDescender=-descent,
        sTypoLineGap=0,
        usWinAscent=UNITS_PER_EM,
        usWinDescent=descent,
        sxHeight=6 * PX,
        sCapHeight=6 * PX,
    )
    fb.setupCOLR(layers, version=0)
    fb.setupCPAL([[DEFAULT_SHADOW]])
    fb.setupNameTable(
        {
            "copyright": "Copyright 2026 Maciej Budzyński",
            "familyName": FAMILY,
            "styleName": "Regular",
            "licenseDescription": "GNU General Public License, version 3 or later",
            "licenseInfoURL": "https://www.gnu.org/licenses/gpl-3.0.html",
        }
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    fb.save(out_path)
    record = Path(__file__).with_name("telemark-screen.build.sha256")
    write_record(record, {"glyphs": raw}, [__file__, out_path])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2])
