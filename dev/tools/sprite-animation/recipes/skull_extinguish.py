from PIL import Image

from compiler import FOAM, STEAM, WATER_DARK, WATER_LIGHT, WATER_MID, set_pixel

SKULL_RED = (224, 57, 76, 255)
SKULL_ORANGE = (228, 109, 58, 255)


def is_flame_pixel(x: int, y: int, color: tuple[int, int, int, int]) -> bool:
    if color not in (SKULL_RED, SKULL_ORANGE):
        return False
    return x <= 2 or x >= 13 or y <= 4 or y >= 12 or color == SKULL_RED


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    output = source.copy()
    pixels = output.load()
    for y in range(16):
        for x in range(16):
            color = pixels[x, y]
            if not is_flame_pixel(x, y, color) or frame < 2:
                continue
            if frame == 2 and y <= 5 and (x + y) % 2 == 0:
                pixels[x, y] = WATER_LIGHT
            elif frame == 3 and y <= 8:
                pixels[x, y] = WATER_MID if (x + y) % 2 else WATER_LIGHT
            elif frame == 4:
                pixels[x, y] = WATER_MID if y < 10 else WATER_DARK
            elif frame == 5:
                pixels[x, y] = WATER_DARK
            elif frame >= 6:
                pixels[x, y] = WATER_DARK if y > 4 and (x + y + frame) % 2 == 0 else (0, 0, 0, 0)

    stream_x = {"down": 7, "up": 8, "left": 6, "right": 9}[direction]
    if frame == 1:
        set_pixel(output, stream_x, 0, WATER_LIGHT)
        set_pixel(output, stream_x, 1, WATER_MID)
    elif frame == 2:
        for y in range(6):
            set_pixel(output, stream_x, y, WATER_LIGHT if y % 2 == 0 else WATER_MID)
    elif frame == 3:
        for y in range(8):
            set_pixel(output, stream_x, y, FOAM if y % 3 == 0 else WATER_LIGHT)
        for dx, y in ((-3, 4), (-1, 6), (1, 6), (3, 4)):
            set_pixel(output, stream_x + dx, y, FOAM)
    elif frame == 4:
        for dx, y in ((-4, 4), (-2, 5), (0, 3), (2, 5), (4, 4)):
            set_pixel(output, stream_x + dx, y, FOAM if dx % 2 == 0 else WATER_LIGHT)
        for x, y in ((3, 1), (6, 0), (10, 1), (12, 0)):
            set_pixel(output, x, y, STEAM)
    elif frame >= 5:
        for x, y in ((4, 1), (8, 0), (12, 2)):
            if frame == 5 or (x + frame) % 2:
                set_pixel(output, x, y, STEAM)
        for x in range(3, 13):
            if (x + frame) % 2 == 0:
                set_pixel(output, x, 15, WATER_MID)
    return output
