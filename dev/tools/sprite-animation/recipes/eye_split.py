from PIL import Image

from compiler import CELL_SIZE, CUT_DARK, CUT_LIGHT, FOAM, blank, nearby_opaque, set_pixel


def line_value(direction: str, x: int, y: int) -> int:
    if direction == "down":
        return y - (13 - x)
    if direction == "up":
        return y - (x + 1)
    if direction == "left":
        return y - 8
    return y - 7


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    if frame == 0:
        return source.copy()

    first_half = blank()
    second_half = blank()
    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = source.getpixel((x, y))
            if not color[3]:
                continue
            target = first_half if line_value(direction, x, y) <= 0 else second_half
            target.putpixel((x, y), color)

    output = blank()
    if frame == 1:
        output.alpha_composite(source)
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                if line_value(direction, x, y) == 0 and nearby_opaque(source, x, y):
                    set_pixel(output, x, y, FOAM)
        return output

    separation = (0, 0, 1, 2, 3, 4, 5, 6)[frame]
    if direction == "down":
        first_offset = (-separation // 2, -separation // 2)
        second_offset = ((separation + 1) // 2, (separation + 1) // 2)
    elif direction == "up":
        first_offset = ((separation + 1) // 2, -separation // 2)
        second_offset = (-separation // 2, (separation + 1) // 2)
    elif direction == "left":
        first_offset = (-min(2, separation // 2), -separation // 2)
        second_offset = (min(2, (separation + 1) // 2), (separation + 1) // 2)
    else:
        first_offset = (min(2, separation // 2), -separation // 2)
        second_offset = (-min(2, (separation + 1) // 2), (separation + 1) // 2)

    if frame <= 5:
        output.alpha_composite(first_half, first_offset)
        output.alpha_composite(second_half, second_offset)
    elif frame == 6:
        for part, (offset_x, offset_y), phase in (
            (first_half, first_offset, 0),
            (second_half, second_offset, 1),
        ):
            for y in range(CELL_SIZE):
                for x in range(CELL_SIZE):
                    color = part.getpixel((x, y))
                    if color[3] and (x + 2 * y + phase) % 3:
                        set_pixel(output, x + offset_x, y + offset_y, color)
    else:
        particles = {
            "down": ((3, 4), (6, 2), (10, 12), (13, 10), (7, 14)),
            "up": ((2, 11), (5, 13), (10, 2), (13, 5), (8, 0)),
            "left": ((4, 3), (5, 7), (8, 12), (10, 9)),
            "right": ((11, 3), (10, 7), (7, 12), (5, 9)),
        }[direction]
        for index, (x, y) in enumerate(particles):
            set_pixel(output, x, y, CUT_LIGHT if index % 2 else FOAM)
        return output

    if frame in (2, 3, 4, 5):
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                if line_value(direction, x, y) == 0 and nearby_opaque(source, x, y):
                    set_pixel(output, x, y, CUT_DARK if (x + y) % 2 else CUT_LIGHT)
    return output
