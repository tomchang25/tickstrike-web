from PIL import Image

from compiler import FOAM, WATER_LIGHT, WATER_MID, blank, set_pixel, tint_underwater


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    output = blank()
    sink = (0, 0, 1, 1, 2, 3, 5, 7)[frame]
    side_shift = {
        "down": (0, -1, 1, -1, 1, 0, 0, 0),
        "up": (0, 1, -1, 1, -1, 0, 0, 0),
        "left": (0, -1, 0, -1, 0, 0, 0, 0),
        "right": (0, 1, 0, 1, 0, 0, 0, 0),
    }[direction][frame]
    waterline = (15, 14, 13, 12, 10, 8, 6, 5)[frame]

    if frame < 7:
        for y in range(16):
            for x in range(16):
                color = source.getpixel((x, y))
                if not color[3]:
                    continue
                target_x, target_y = x + side_shift, y + sink
                if 0 <= target_x < 16 and 0 <= target_y < 16:
                    set_pixel(
                        output,
                        target_x,
                        target_y,
                        tint_underwater(color) if target_y >= waterline else color,
                    )

    for x in range(2, 14):
        if (x + frame) % 4 != 0:
            set_pixel(output, x, waterline, FOAM if (x + frame) % 3 == 0 else WATER_LIGHT)

    bubble_x = {"down": 10, "up": 6, "left": 4, "right": 11}[direction]
    for index, (x, y) in enumerate(
        {
            2: ((bubble_x, 5),),
            3: ((bubble_x, 4), (bubble_x - 1, 7)),
            4: ((bubble_x, 3), (bubble_x + 1, 6)),
            5: ((bubble_x, 2), (bubble_x - 2, 5)),
            6: ((bubble_x, 1), (bubble_x - 2, 4), (bubble_x + 2, 7)),
            7: ((bubble_x, 1), (bubble_x - 2, 4), (bubble_x + 2, 7), (8, 10)),
        }.get(frame, ())
    ):
        set_pixel(output, x, y, FOAM if index % 2 == 0 else WATER_MID)
    return output
