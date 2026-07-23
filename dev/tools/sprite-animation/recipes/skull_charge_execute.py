from PIL import Image

from compiler import CELL_SIZE, INK, blank, set_pixel

SKULL_RED = (224, 57, 76, 255)
SKULL_ORANGE = (228, 109, 58, 255)
CHARGE_GOLD = (241, 196, 113, 255)
CHARGE_HOT = (255, 235, 174, 255)
FORWARD_AMOUNT = (0, 0, 1, 2, 1, 0, 0, 0)


def stretch_forward(source: Image.Image, direction: str, amount: int) -> Image.Image:
    if amount == 0:
        return source.copy()
    forward = {
        "down": (0, 1),
        "up": (0, -1),
        "left": (-1, 0),
        "right": (1, 0),
    }[direction]
    output = blank()
    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = source.getpixel((x, y))
            if not color[3]:
                continue
            projection = (x - 7.5) * forward[0] + (y - 7.5) * forward[1]
            distance = amount if projection > 0 else 0
            for step in range(distance + 1):
                set_pixel(output, x + forward[0] * step, y + forward[1] * step, color)
    return output


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    amount = FORWARD_AMOUNT[frame]
    output = stretch_forward(source, direction, amount)
    pixels = output.load()

    if frame in (1, 2, 3, 4):
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                color = pixels[x, y]
                if color == SKULL_ORANGE:
                    pixels[x, y] = CHARGE_HOT if frame in (2, 3) else CHARGE_GOLD
                elif color == SKULL_RED and frame == 3 and (x + 2 * y) % 4 == 0:
                    pixels[x, y] = SKULL_ORANGE

    if frame in (1, 2, 3):
        eye_points = {
            "down": ((5, 7), (10, 7)),
            "up": (),
            "left": ((5, 7),),
            "right": ((10, 7),),
        }[direction]
        forward = {
            "down": (0, 1),
            "up": (0, -1),
            "left": (-1, 0),
            "right": (1, 0),
        }[direction]
        for x, y in eye_points:
            projection = (x - 7.5) * forward[0] + (y - 7.5) * forward[1]
            distance = amount if projection > 0 else 0
            x += forward[0] * distance
            y += forward[1] * distance
            if 0 <= x < CELL_SIZE and 0 <= y < CELL_SIZE and output.getpixel((x, y)) == INK:
                set_pixel(output, x, y, CHARGE_HOT)
    return output
