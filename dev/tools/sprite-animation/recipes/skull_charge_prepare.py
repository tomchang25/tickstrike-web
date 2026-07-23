from PIL import Image

from compiler import CELL_SIZE, INK, blank, set_pixel

SKULL_RED = (224, 57, 76, 255)
SKULL_ORANGE = (228, 109, 58, 255)
CHARGE_GOLD = (241, 196, 113, 255)
CHARGE_HOT = (255, 235, 174, 255)
PULSE = (0, 1, 2, 3, 4, 3, 2, 1)
PULLBACK = (0, 0, 0, 1, 1, 1, 0, 0)


def translate(source: Image.Image, offset_x: int, offset_y: int) -> Image.Image:
    output = blank()
    output.alpha_composite(source, (offset_x, offset_y))
    return output


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    amount = PULLBACK[frame]
    pullback = {
        "down": (0, -amount),
        "up": (0, amount),
        "left": (amount, 0),
        "right": (-amount, 0),
    }[direction]
    output = translate(source, *pullback)
    pixels = output.load()
    pulse = PULSE[frame]

    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = pixels[x, y]
            if color == SKULL_ORANGE and pulse >= 2:
                pixels[x, y] = CHARGE_GOLD if pulse < 4 else CHARGE_HOT
            elif color == SKULL_RED and pulse == 4 and (x + y) % 3 == 0:
                pixels[x, y] = SKULL_ORANGE

    if pulse >= 3:
        eye_points = {
            "down": ((5, 7), (10, 7)),
            "up": (),
            "left": ((5, 7),),
            "right": ((10, 7),),
        }[direction]
        for x, y in eye_points:
            x += pullback[0]
            y += pullback[1]
            if 0 <= x < CELL_SIZE and 0 <= y < CELL_SIZE and output.getpixel((x, y)) == INK:
                set_pixel(output, x, y, CHARGE_GOLD if pulse == 3 else CHARGE_HOT)

    if pulse == 4:
        crown = {
            "down": ((6, 1), (9, 1)),
            "up": ((6, 1), (9, 1)),
            "left": ((5, 1), (8, 0)),
            "right": ((10, 1), (7, 0)),
        }[direction]
        for x, y in crown:
            x += pullback[0]
            y += pullback[1]
            set_pixel(output, x, y, CHARGE_HOT)
    return output
