#!/usr/bin/env python3
"""Builds the Pages site into the folder given as argv[1] (default: _site).

  index.html       the page itself
  palettes.json    generated from colors/*.css, so the picker never drifts from the repo
  jf/              the theme's real CSS (theme.css, modules, colors/, fonts/, logos/) with its
                   jsDelivr URLs made relative, so the preview runs exactly this commit's files
  preview/         captured Jellyfin pages and Jellyfin's own stylesheet (see tools/capture-preview.mjs)
  logos/           shown by the page

Run from the repository root:  python3 site/build.py _site
"""
import json, os, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
NAMES = {"jellyblue": "Jelly Blue", "jellyflix": "Jellyflix", "jellypurple": "Jelly Purple", "liquidglass": "Liquid Glass"}
TOKENS = ["primary-r", "primary-g", "primary-b", "primary-background-color", "secondary-background-color",
          "tertiary-background-color", "text-color", "header-background-color"]


def token(css, name):
    m = re.search(r"--%s\s*:\s*([^;]+);" % re.escape(name), css)
    return m.group(1).strip() if m else None


def palette(path):
    css = path.read_text(encoding="utf8")
    p = {"id": path.stem, "name": NAMES.get(path.stem, path.stem.capitalize())}
    for t in TOKENS:
        v = token(css, t)
        if v is None:
            raise SystemExit(f"{path.name}: --{t} not found")
        p[t] = int(v) if t.startswith("primary-") and len(t) == 9 else v
    return p


CDN = re.compile(r"https://cdn\.jsdelivr\.net/gh/n00bcodr/[Jj]ellyfish(?:@[\w.-]+)?/((?!colors/images/)[^\"')\s]+)")


def localise(src, dest):
    """Copy a stylesheet, pointing its jsDelivr URLs for this repository at the copies in jf/."""
    jf = OUT / "jf"
    text = src.read_text(encoding="utf8")

    def rel(m):
        return os.path.relpath(jf / m.group(1), dest.parent).replace(os.sep, "/")

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(CDN.sub(rel, text), encoding="utf8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    shutil.copy(ROOT / "site" / "index.html", OUT / "index.html")
    palettes = [palette(f) for f in sorted((ROOT / "colors").glob("*.css"))]
    (OUT / "palettes.json").write_text(json.dumps(palettes, indent=1), encoding="utf8")
    (OUT / "logos").mkdir()
    for logo in ("jellyfish.png", "streamberry.png", "favicon.ico"):
        shutil.copy(ROOT / "logos" / logo, OUT / "logos" / logo)
    jf = OUT / "jf"
    for css in ROOT.glob("*.css"):
        localise(css, jf / css.name)
    for css in (ROOT / "colors").glob("*.css"):
        localise(css, jf / "colors" / css.name)
    for sub in ("fonts", "logos"):
        for f in (ROOT / sub).iterdir():
            if f.suffix == ".css":
                localise(f, jf / sub / f.name)
            else:
                (jf / sub).mkdir(parents=True, exist_ok=True)
                shutil.copy(f, jf / sub / f.name)
    shutil.copytree(ROOT / "site" / "preview", OUT / "preview", ignore=shutil.ignore_patterns("_*"))
    (OUT / ".nojekyll").write_text("")
    print(f"built {OUT}: {len(palettes)} palettes")


main()
