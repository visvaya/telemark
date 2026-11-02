"""The record of what a committed font was built from.

One line per item, its SHA-256 and its name: the files by their path from the
repository's root, plus any input that is not a file of the repository. The
tests in scripts/lib compare every line with what is there now, so the font
cannot fall behind its inputs, its build script or the pinned font tools, and
a hand edit of the font shows too.
"""

import hashlib
import os
from pathlib import Path

# Absolute paths without following links: pnpm links node_modules/<package> to
# a folder named after the version.
SCRIPT_DIR = Path(os.path.abspath(__file__)).parent
REPO = SCRIPT_DIR.parents[1]


def write_record(
    record_path: Path,
    font_path: str,
    committed_font: str,
    inputs: dict[str, bytes],
    files: list[str | Path],
) -> None:
    """Writes the record of a build of `font_path` from `inputs` (name to
    content), the repository's `files` and the pinned font tools. Only a build
    of the committed font is recorded: a build anywhere else, say for a
    comparison, leaves the record as it is."""
    built = os.path.normcase(os.path.abspath(font_path))
    if built != os.path.normcase(str(REPO / committed_font)):
        print(f"{font_path}: not {committed_font}, so the record is left as it is")
        return
    entries = dict(inputs)
    for path in [*files, font_path, SCRIPT_DIR / "requirements.txt"]:
        name = Path(os.path.abspath(path)).relative_to(REPO).as_posix()
        entries[name] = Path(path).read_bytes()
    lines = [
        f"{hashlib.sha256(data).hexdigest()}  {name}\n"
        for name, data in entries.items()
    ]
    Path(record_path).write_bytes("".join(lines).encode("utf-8"))
