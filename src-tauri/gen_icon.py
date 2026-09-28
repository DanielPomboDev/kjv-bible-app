"""
Generate the KJV Bible app icon source (icons/app-icon.png, 1024x1024)
straight from the user's reference photo (desktop-reference-image.jpg,
repo root): crop the black artwork square out of the gray surround,
upscale to 1024, and round the corners with transparency so it behaves
as a proper desktop icon.

Run from the repo root:  python src-tauri/gen_icon.py
Then rebuild the derived set:  npx tauri icon src-tauri/icons/app-icon.png
"""
from PIL import Image, ImageDraw, ImageFilter

SOURCE = "desktop-reference-image.jpg"
DEST = "src-tauri/icons/app-icon.png"
S = 1024
RADIUS = 232

# Measured content box of the black artwork square in the 1024x1024
# photo (gray surround is ~27 gray; artwork background is pure black).
CROP = (107, 110, 917, 921)


def main():
    img = Image.open(SOURCE).convert("RGB").crop(CROP)
    img = img.resize((S, S), Image.LANCZOS)

    # Crush near-black photo noise to pure black so the plate stays
    # clean after downscaling (book and glow are far brighter).
    px = img.load()
    for y in range(S):
        for x in range(S):
            r, g, b = px[x, y]
            if r < 14 and g < 14 and b < 14:
                px[x, y] = (0, 0, 0)

    rgba = img.convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, S, S), radius=RADIUS, fill=255)
    # 1px feather so the rounded edge anti-aliases into transparency.
    mask = mask.filter(ImageFilter.GaussianBlur(1))
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(rgba, (0, 0), mask)
    out.save(DEST)
    print("wrote", DEST)


if __name__ == "__main__":
    main()
