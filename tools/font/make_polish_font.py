"""Builds the Polish letters missing from Silkscreen as a small fallback font.

Silkscreen covers only "ó" of the Polish alphabet. This script takes the base
letters from Silkscreen and adds the marks on the same 125-unit pixel grid,
so text set in Silkscreen falls back to these glyphs for the other letters.
Silkscreen draws lower and upper case alike, so both share one glyph.

Usage: python make_polish_font.py <silkscreen-latin-400-normal.woff2> <out.woff2>

The base font comes from @fontsource/silkscreen in node_modules. The script also
writes the record of the build next to this script (telemark-polish.build.sha256:
the base font, this script, the pinned font tools and the font);
scripts/lib/polish-font-build.test.mjs compares it with the files of today, so an
update of Silkscreen or of the font tools asks for the font to be built again.
"""

import sys
from pathlib import Path

from build_record import write_record
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

FAMILY = "Telemark Polish"
PX = 125
COMMITTED_FONT = "src/ui/fonts/telemark-polish.woff2"
# The font's first build, 2026-10-11 11:24:50, in seconds from 1904 as the
# format counts; fixed, so a build from the same inputs gives the same file.
BUILT_S_SINCE_1904 = 3874562690

# (glyph name, code points, base glyph, base shift in px, advance change in px,
#  extra pixels as (column, row) with row 0 on the baseline, acute shift in px)
Rect = tuple[int, int]
LETTERS: list[tuple[str, tuple[int, ...], str, int, int, list[Rect], int | None]] = [
    ("aogonek", (0x0105, 0x0104), "a", 0, 0, [(4, -1), (5, -2)], None),
    ("cacute", (0x0107, 0x0106), "c", 0, 0, [], 1),
    ("eogonek", (0x0119, 0x0118), "e", 0, 0, [(3, -1), (4, -2)], None),
    ("lslash", (0x0142, 0x0141), "l", 1, 1, [(1, 2), (3, 3)], None),
    ("nacute", (0x0144, 0x0143), "n", 0, 0, [], 2),
    ("sacute", (0x015B, 0x015A), "s", 0, 0, [], 1),
    ("zacute", (0x017A, 0x0179), "z", 0, 0, [], 1),
    ("zdotaccent", (0x017C, 0x017B), "z", 0, 0, [(2, 6)], None),
]


def pixel(pen: TTGlyphPen, column: int, row: int) -> None:
    """One clockwise square, the winding Silkscreen uses for outer contours."""
    x0, y0 = column * PX, row * PX
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y0 + PX))
    pen.lineTo((x0 + PX, y0 + PX))
    pen.lineTo((x0 + PX, y0))
    pen.closePath()


def build(source_path: str, out_path: str) -> None:
    src = TTFont(source_path)
    glyphs = src.getGlyphSet()
    order = [".notdef"] + [name for name, *_ in LETTERS]
    outlines = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (src["hmtx"][".notdef"][0], 0)}  # lsb filled in below
    cmap: dict[int, str] = {}
    for name, codes, base, shift, widen, extra, acute in LETTERS:
        pen = TTGlyphPen(None)
        recorded = DecomposingRecordingPen(glyphs)
        glyphs[base].draw(recorded)
        recorded.replay(TransformPen(pen, (1, 0, 0, 1, shift * PX, 0)))
        for column, row in extra:
            pixel(pen, column, row)
        if acute is not None:
            mark = DecomposingRecordingPen(glyphs)
            glyphs["acutecomb"].draw(mark)
            mark.replay(TransformPen(pen, (1, 0, 0, 1, acute * PX, 0)))
        outlines[name] = pen.glyph()
        advance = src["hmtx"][base][0] + widen * PX
        metrics[name] = (advance, 0)
        for code in codes:
            cmap[code] = name

    fb = FontBuilder(src["head"].unitsPerEm, isTTF=True)
    fb.font["head"].created = fb.font["head"].modified = BUILT_S_SINCE_1904
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(outlines)
    glyf = fb.font["glyf"]
    for name in order:
        glyf[name].recalcBounds(glyf)
        metrics[name] = (metrics[name][0], getattr(glyf[name], "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    hhea, os2 = src["hhea"], src["OS/2"]
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent)
    fb.setupOS2(
        sTypoAscender=os2.sTypoAscender,
        sTypoDescender=os2.sTypoDescender,
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=os2.usWinAscent,
        usWinDescent=os2.usWinDescent,
        sxHeight=os2.sxHeight,
        sCapHeight=os2.sCapHeight,
    )
    fb.setupNameTable(
        {
            "copyright": "Copyright 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen)",
            "familyName": FAMILY,
            "styleName": "Regular",
            "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
            "licenseInfoURL": "https://openfontlicense.org",
        }
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    fb.save(out_path)
    record = Path(__file__).with_name("telemark-polish.build.sha256")
    write_record(record, out_path, COMMITTED_FONT, {}, [source_path, __file__])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2])
