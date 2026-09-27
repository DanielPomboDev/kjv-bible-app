"""
Generate the KJV Bible app icon source (icons/app-icon.png, 1024x1024).

Design derived from the app's design tokens (the style guide):
- rounded square plate in light-theme accent brown (#8A5A2B)
- open book in cream (#FAF7F1 background) with a warm spine shadow (#E3DDD2 border)
- ribbon bookmark in dark-theme accent gold (#D9A25C)
- subtle inner highlight along the top edge of the plate

Run from the repo root:  python src-tauri/gen_icon.py
"""
from PIL import Image, ImageDraw
import math

S = 1024  # source size; Tauri downscales from this
ACCENT = (138, 90, 43, 255)        # --accent (light)
ACCENT_DARK = (108, 69, 31, 255)   # deeper brown for bottom shading
CREAM = (250, 247, 241, 255)       # --background
CREAM_DIM = (227, 221, 210, 255)   # --border
GOLD = (217, 162, 92, 255)         # --accent (dark) for the ribbon
TEXT = (42, 37, 33, 255)           # --text-primary


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def main():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    margin = 64
    plate = (margin, margin, S - margin, S - margin)
    radius = 200

    # Plate: vertical gradient brown, rounded corners.
    grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(plate[1], plate[3]):
        t = (y - plate[1]) / (plate[3] - plate[1])
        c = tuple(
            int(ACCENT[i] + (ACCENT_DARK[i] - ACCENT[i]) * t) for i in range(3)
        ) + (255,)
        gd.line([(plate[0], y), (plate[2], y)], fill=c)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(plate, radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    # Book: two open pages meeting at a center spine, sitting on the plate.
    cx = S // 2
    top = 300
    bottom = 780
    half = 300          # half-width of each page
    page_drop = 130     # vertical curve of the outer page edges
    spine_w = 16

    def page_points(side):
        # side = -1 (left page), +1 (right page)
        outer_x = cx + side * half
        return [
            (cx + side * spine_w, top + 18),
            (outer_x, top + page_drop),
            (outer_x, bottom),
            (cx + side * spine_w, bottom - 60),
        ]

    # Page shadows (slightly larger, dim) beneath the pages for depth.
    for side in (-1, 1):
        pts = [
            (cx + side * (spine_w - 10), top + 6),
            (cx + side * (half + 18), top + page_drop + 16),
            (cx + side * (half + 18), bottom + 14),
            (cx + side * (spine_w - 10), bottom - 46),
        ]
        d.polygon(pts, fill=(0, 0, 0, 60))

    # Pages themselves.
    d.polygon(page_points(-1), fill=CREAM)
    d.polygon(page_points(1), fill=CREAM)

    # Curved page top edges (light cream arc from spine to outer corner).
    for side in (-1, 1):
        steps = 40
        for i in range(steps):
            t0 = i / steps
            t1 = (i + 1) / steps
            # quadratic-ish sag: outer edge sits lower than the spine
            x0 = cx + side * (spine_w + (half - spine_w) * t0)
            y0 = top + 18 + (page_drop - 18) * (t0 ** 1.6)
            x1 = cx + side * (spine_w + (half - spine_w) * t1)
            y1 = top + 18 + (page_drop - 18) * (t1 ** 1.6)
            d.line([(x0, y0), (x1, y1)], fill=CREAM, width=14)

    # Spine gutter: warm shadow line between the pages.
    d.line([(cx, top + 10), (cx, bottom - 62)], fill=CREAM_DIM, width=spine_w)

    # Text lines on each page (quiet border-colored strokes).
    for side in (-1, 1):
        for k in range(4):
            y = 470 + k * 62
            x0 = cx + side * (70 if k % 2 == 0 else 96)
            x1 = cx + side * (half - 44)
            if x0 > x1:
                x0, x1 = x1, x0
            d.line([(x0, y), (x1, y)], fill=CREAM_DIM, width=14)

    # Ribbon bookmark descending from behind the right page's top edge.
    rb_w = 74
    rb_x0 = cx + 150
    ribbon = [
        (rb_x0, top + 60),
        (rb_x0 + rb_w, top + 66),
        (rb_x0 + rb_w, bottom - 210),
        (rb_x0 + rb_w // 2, bottom - 150),   # swallowtail notch
        (rb_x0, bottom - 210),
    ]
    # Draw ribbon before the spine so the page overlaps its top a touch.
    ribbon_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ribbon_layer)
    rd.polygon(ribbon, fill=GOLD)
    img.alpha_composite(ribbon_layer)
    # Re-draw the right page over the ribbon's top so it tucks behind.
    d.polygon(page_points(1), fill=CREAM)
    for side in (1,):
        steps = 40
        for i in range(steps):
            t0 = i / steps
            t1 = (i + 1) / steps
            x0 = cx + side * (spine_w + (half - spine_w) * t0)
            y0 = top + 18 + (page_drop - 18) * (t0 ** 1.6)
            x1 = cx + side * (spine_w + (half - spine_w) * t1)
            y1 = top + 18 + (page_drop - 18) * (t1 ** 1.6)
            d.line([(x0, y0), (x1, y1)], fill=CREAM, width=14)
    d.line([(cx, top + 10), (cx, bottom - 62)], fill=CREAM_DIM, width=spine_w)
    for k in range(4):
        y = 470 + k * 62
        x0 = cx + (70 if k % 2 == 0 else 96)
        x1 = cx + half - 44
        d.line([(x0, y), (x1, y)], fill=CREAM_DIM, width=14)

    img.save("src-tauri/icons/app-icon.png")
    print("wrote src-tauri/icons/app-icon.png")


if __name__ == "__main__":
    main()
