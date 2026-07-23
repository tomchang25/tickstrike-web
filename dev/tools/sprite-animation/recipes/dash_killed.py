from PIL import Image

from compiler import CELL_SIZE, CUT_DARK, CUT_LIGHT, blank, nearby_opaque, set_pixel


def cut_value(direction: str, x: int, y: int) -> int:
    if direction == "down":
        return y - (13 - x)
    if direction == "up":
        return y - (x + 1)
    return y - 8


def split_source(source: Image.Image, direction: str) -> tuple[Image.Image, Image.Image]:
    first_half = blank()
    second_half = blank()
    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = source.getpixel((x, y))
            if not color[3]:
                continue
            if cut_value(direction, x, y) <= 0:
                first_half.putpixel((x, y), color)
            else:
                second_half.putpixel((x, y), color)

    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            value = cut_value(direction, x, y)
            if value not in (0, 1) or not nearby_opaque(source, x, y):
                continue
            part = first_half if value == 0 else second_half
            if part.getpixel((x, y))[3]:
                set_pixel(part, x, y, CUT_LIGHT if (x + y) % 2 else CUT_DARK)
    return first_half, second_half


def separation_offsets(direction: str, separation: int) -> tuple[tuple[int, int], tuple[int, int]]:
    near = separation // 2
    far = (separation + 1) // 2
    if direction == "down":
        return (-near, -near), (far, far)
    if direction == "up":
        return (near, -near), (-far, far)
    return (0, -near), (0, far)


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    if frame == 0:
        return source.copy()

    first_half, second_half = split_source(source, direction)
    output = blank()
    if frame == 1:
        output.alpha_composite(source)
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                if cut_value(direction, x, y) in (0, 1) and source.getpixel((x, y))[3]:
                    set_pixel(output, x, y, CUT_LIGHT if (x + y) % 2 else CUT_DARK)
        return output

    separation = (0, 0, 1, 2, 3, 4, 5, 5)[frame]
    first_offset, second_offset = separation_offsets(direction, separation)
    output.alpha_composite(first_half, first_offset)
    output.alpha_composite(second_half, second_offset)
    return output
