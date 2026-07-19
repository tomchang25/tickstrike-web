from PIL import Image

from compiler import FOAM, WATER_LIGHT, WATER_MID, blank, set_pixel, tint_underwater


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    output = blank()
    y_shift = (0, 0, 1, 1, 2, 4, 5, 7)[frame]
    x_shift = {
        "down": (0, -1, 1, -1, 1, 0, 0, 0),
        "up": (0, 1, -1, 1, -1, 0, 0, 0),
        "left": (0, -1, 0, -1, 0, -1, 0, 0),
        "right": (0, 1, 0, 1, 0, 1, 0, 0),
    }[direction][frame]
    waterline = (15, 14, 13, 12, 10, 8, 6, 5)[frame]

    if frame < 7:
        for y in range(16):
            for x in range(16):
                color = source.getpixel((x, y))
                if not color[3]:
                    continue
                target_x, target_y = x + x_shift, y + y_shift
                if target_x < 0 or target_x >= 16 or target_y < 0 or target_y >= 16:
                    continue
                set_pixel(
                    output,
                    target_x,
                    target_y,
                    tint_underwater(color) if target_y >= waterline else color,
                )

    for x in range(1, 15):
        surface_y = waterline - (1 if (x + frame) % 4 == 0 else 0)
        if (x + frame) % 5:
            set_pixel(output, x, surface_y, FOAM if (x + frame) % 3 == 0 else WATER_LIGHT)
        if (x + 2 * frame) % 3 == 0:
            set_pixel(output, x, waterline + 1, WATER_MID)

    splashes = {
        1: ((2, 13), (13, 13)),
        2: ((1, 11), (3, 10), (12, 10), (14, 11)),
        3: ((1, 9), (3, 8), (5, 10), (10, 10), (12, 8), (14, 9)),
        4: ((2, 8), (4, 7), (11, 7), (13, 8)),
    }.get(frame, ())
    for index, (x, y) in enumerate(splashes):
        side_offset = -1 if direction == "left" else 1 if direction == "right" else 0
        set_pixel(output, x + side_offset, y, FOAM if index % 2 == 0 else WATER_LIGHT)

    bubble_x = {"down": 10, "up": 6, "left": 4, "right": 11}[direction]
    bubbles = {
        2: ((bubble_x, 5),),
        3: ((bubble_x, 4), (bubble_x + 1, 7)),
        4: ((bubble_x, 3), (bubble_x - 2, 6)),
        5: ((bubble_x, 2), (bubble_x + 2, 5), (bubble_x - 1, 7)),
        6: ((bubble_x, 1), (bubble_x - 2, 4), (bubble_x + 2, 6)),
        7: ((bubble_x, 1), (bubble_x - 2, 4), (bubble_x + 2, 7), (8, 10)),
    }.get(frame, ())
    for index, (x, y) in enumerate(bubbles):
        set_pixel(output, x, y, FOAM if index % 2 == 0 else WATER_LIGHT)

    return output
