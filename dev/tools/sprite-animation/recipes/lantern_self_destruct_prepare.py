from PIL import Image

from compiler import CELL_SIZE, set_pixel

INK = (20, 27, 27, 255)
LANTERN_RED = (224, 57, 76, 255)
LANTERN_DARK = (151, 60, 79, 255)
FUSE_ORANGE = (215, 139, 74, 255)
FUSE_GOLD = (241, 196, 113, 255)
FUSE_HOT = (255, 235, 174, 255)
FUSE_WHITE = (255, 248, 225, 255)
PULSE = (0, 1, 2, 3, 4, 3, 2, 1)


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    output = source.copy()
    pixels = output.load()
    pulse = PULSE[frame]

    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = pixels[x, y]
            if color == FUSE_ORANGE and pulse >= 2:
                pixels[x, y] = FUSE_GOLD
            elif color == FUSE_GOLD and pulse >= 3:
                pixels[x, y] = FUSE_HOT if pulse == 3 else FUSE_WHITE

    if direction == "down":
        core = ((6, 8), (9, 8), (5, 9), (10, 9), (5, 10), (10, 10), (6, 11), (9, 11))
    elif direction == "up":
        core = ((6, 7), (9, 7), (5, 8), (10, 8), (6, 9), (9, 9))
    elif direction == "left":
        core = ((3, 7), (4, 8), (4, 9), (4, 10), (3, 11))
    else:
        core = ((12, 7), (11, 8), (11, 9), (11, 10), (12, 11))

    if pulse >= 2:
        for index, (x, y) in enumerate(core):
            if output.getpixel((x, y)) not in (INK, (0, 0, 0, 0)):
                set_pixel(output, x, y, FUSE_GOLD if index % 2 else FUSE_ORANGE)
    if pulse >= 3:
        for x, y in core[::2]:
            set_pixel(output, x, y, FUSE_HOT)
    if pulse == 4:
        hot_spots = {
            "down": ((6, 9), (9, 9), (6, 10), (9, 10)),
            "up": ((7, 7), (8, 7), (7, 8), (8, 8)),
            "left": ((3, 8), (3, 9), (4, 9), (3, 10)),
            "right": ((12, 8), (12, 9), (11, 9), (12, 10)),
        }[direction]
        for x, y in hot_spots:
            set_pixel(output, x, y, FUSE_WHITE)

    # The rear-facing lantern has no visible core, so its internal pulse reads
    # through the casing bands rather than inventing an external flame.
    if direction == "up" and pulse >= 2:
        band_color = FUSE_ORANGE if pulse == 2 else FUSE_GOLD if pulse == 3 else FUSE_HOT
        for x in range(6, 10):
            for y in (8, 10):
                if output.getpixel((x, y)) in (LANTERN_RED, LANTERN_DARK):
                    set_pixel(output, x, y, band_color)
    return output
