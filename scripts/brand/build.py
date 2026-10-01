"""Renders the Ranjha Play brand assets (SVG -> PNG via headless Chrome).

    py -3 scripts/brand/build.py all      # needs Pillow and Google Chrome

Writes the app icons, splash image and favicon into assets/.
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

import mark

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "..", "assets"))
TMP = tempfile.mkdtemp(prefix="ranjha-brand-")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BG = "#07070B"


def svg_doc(inner, defs="", size=1024, view=1024):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {view} {view}">
  <defs>{mark.mark_defs()}{defs}</defs>
  {inner}
</svg>"""


def scaled(body, scale, cx=532, cy=512):
    """Centre the mark (optical centre ~532,512) and scale it about the canvas centre."""
    return f'<g transform="translate(512 512) scale({scale}) translate({-cx} {-cy})">{body}</g>'


GLOW_DEFS = """
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FF2447" stop-opacity="0.34"/>
      <stop offset="0.45" stop-color="#FF2447" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#FF2447" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FF8A1F" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FF8A1F" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15151D"/>
      <stop offset="1" stop-color="#050507"/>
    </linearGradient>
"""


def background(full=True):
    return f"""
  <rect width="1024" height="1024" fill="url(#vignette)"/>
  <circle cx="500" cy="470" r="470" fill="url(#glow)"/>
  <circle cx="690" cy="760" r="330" fill="url(#glow2)"/>
"""


def render(name, svg, size, transparent):
    svg_path = os.path.join(TMP, name.replace(".png", ".svg"))
    png_path = os.path.join(ASSETS, name)
    svg = svg.replace('width="1024" height="1024" viewBox', f'width="{size}" height="{size}" viewBox', 1)
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    args = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={size},{size}",
        f"--screenshot={png_path}",
    ]
    if transparent:
        args.append("--default-background-color=00000000")
    args.append("file:///" + svg_path.replace("\\", "/"))
    subprocess.run(args, check=True, capture_output=True)
    im = Image.open(png_path).convert("RGBA" if transparent else "RGB")
    im = im.crop((0, 0, size, size))
    im.save(png_path, optimize=True)
    print("rendered", name, im.size)
    return png_path


def main(which):
    body = mark.mark_body()
    if which in ("all", "preview", "icon"):
        # iOS / store icon: opaque, full-bleed (the OS applies the corner mask).
        render("icon.png", svg_doc(background() + scaled(body, 0.9), GLOW_DEFS), 1024, False)
    if which in ("all", "android"):
        # Adaptive icon: 108dp canvas, only the centre 66dp is guaranteed visible.
        render("android-icon-foreground.png", svg_doc(scaled(body, 0.56)), 512, True)
        render("android-icon-background.png", svg_doc(background(), GLOW_DEFS), 512, False)
        render(
            "android-icon-monochrome.png",
            svg_doc(scaled(mark.mark_body(mono="#FFFFFF"), 0.56)),
            432,
            True,
        )
    if which in ("all", "splash"):
        render("splash-icon.png", svg_doc(scaled(body, 1.0)), 1024, True)
    if which in ("all", "favicon"):
        fav = f"""
  <rect width="1024" height="1024" rx="230" fill="{BG}"/>
  {scaled(body, 1.05)}"""
        render("favicon.png", svg_doc(fav), 48, True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
