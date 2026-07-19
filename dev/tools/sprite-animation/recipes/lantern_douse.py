from PIL import Image

from compiler import FOAM, STEAM, WATER_DARK, WATER_LIGHT, WATER_MID, set_pixel

FLAME_COLORS = {
    (224, 57, 76, 255),
    (215, 139, 74, 255),
    (241, 196, 113, 255),
}


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    output = source.copy()
    pixels = output.load()
    for y in range(16):
        for x in range(16):
            color = pixels[x, y]
            if color not in FLAME_COLORS or frame < 2:
                continue
            if frame == 2 and y <= 8 and (x + y) % 2 == 0:
                pixels[x, y] = WATER_LIGHT
            elif frame == 3 and y <= 10:
                pixels[x, y] = WATER_MID if (x + y) % 2 else WATER_LIGHT
            elif frame == 4:
                pixels[x, y] = WATER_DARK if y > 7 else WATER_MID
            elif frame >= 5:
                pixels[x, y] = WATER_DARK if y > 8 and (x + y + frame) % 2 == 0 else (0, 0, 0, 0)

    stream_x = {"down": 8, "up": 7, "left": 6, "right": 9}[direction]
    if frame == 1:
        set_pixel(output, stream_x, 0, WATER_LIGHT)
        set_pixel(output, stream_x, 1, WATER_MID)
    elif frame == 2:
        for y in range(7):
            set_pixel(output, stream_x, y, WATER_LIGHT if y % 2 == 0 else WATER_MID)
    elif frame == 3:
        for x, y in ((stream_x - 3, 5), (stream_x - 1, 6), (stream_x + 1, 6), (stream_x + 3, 5)):
            set_pixel(output, x, y, FOAM)
    elif frame == 4:
        for x, y in ((3, 1), (6, 0), (10, 1), (12, 0)):
            set_pixel(output, x, y, STEAM)
    elif frame >= 5:
        for x in range(4, 12):
            if (x + frame) % 2 == 0:
                set_pixel(output, x, 15, WATER_MID)
    return output
