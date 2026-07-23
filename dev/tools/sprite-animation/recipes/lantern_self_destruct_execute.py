from PIL import Image

from compiler import CELL_SIZE, INK, blank, nearby_opaque, set_pixel

LANTERN_RED = (224, 57, 76, 255)
LANTERN_DARK = (151, 60, 79, 255)
FUSE_ORANGE = (215, 139, 74, 255)
FUSE_GOLD = (241, 196, 113, 255)
FUSE_HOT = (255, 235, 174, 255)
FUSE_WHITE = (255, 248, 225, 255)
TRANSPARENT = (0, 0, 0, 0)


def split_shell(source: Image.Image, separation: int) -> Image.Image:
    output = blank()
    for y in range(CELL_SIZE):
        for x in range(CELL_SIZE):
            color = source.getpixel((x, y))
            if not color[3]:
                continue
            offset_x = -separation if x < 8 else separation
            offset_y = -separation if y < 8 else separation
            set_pixel(output, x + offset_x, y + offset_y, color)
    return output


def build_frame(source: Image.Image, direction: str, frame: int, _config: dict) -> Image.Image:
    if frame == 0:
        return source.copy()

    if frame == 1:
        output = source.copy()
        pixels = output.load()
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                if pixels[x, y] == FUSE_ORANGE:
                    pixels[x, y] = FUSE_GOLD
                elif pixels[x, y] == FUSE_GOLD:
                    pixels[x, y] = FUSE_WHITE
        for x, y in ((7, 7), (8, 7), (6, 8), (9, 8), (7, 9), (8, 9)):
            if nearby_opaque(source, x, y):
                set_pixel(output, x, y, FUSE_HOT)
        return output

    if frame == 2:
        output = source.copy()
        crack = {
            "down": ((7, 5), (8, 6), (7, 7), (8, 8), (7, 9), (8, 10), (7, 11)),
            "up": ((8, 4), (7, 5), (8, 6), (7, 7), (8, 8), (7, 9), (8, 10)),
            "left": ((4, 7), (5, 8), (6, 7), (7, 8), (8, 7), (9, 8), (10, 7)),
            "right": ((11, 7), (10, 8), (9, 7), (8, 8), (7, 7), (6, 8), (5, 7)),
        }[direction]
        for index, (x, y) in enumerate(crack):
            if nearby_opaque(source, x, y):
                set_pixel(output, x, y, FUSE_WHITE if index % 2 else FUSE_HOT)
        return output

    if frame in (3, 4):
        output = split_shell(source, frame - 2)
        radius = 1 if frame == 3 else 2
        for y in range(8 - radius, 8 + radius + 1):
            for x in range(8 - radius, 8 + radius + 1):
                if abs(x - 8) + abs(y - 8) <= radius + 1:
                    set_pixel(output, x, y, FUSE_WHITE if (x + y) % 2 else FUSE_HOT)
        return output

    if frame == 5:
        separated = split_shell(source, 3)
        output = blank()
        for y in range(CELL_SIZE):
            for x in range(CELL_SIZE):
                color = separated.getpixel((x, y))
                if color[3] and color != INK and (x + 2 * y) % 3:
                    set_pixel(output, x, y, color)
        for x, y in ((7, 7), (8, 7), (7, 8), (8, 8), (6, 8), (9, 8)):
            set_pixel(output, x, y, FUSE_HOT if (x + y) % 2 else FUSE_WHITE)
        return output

    if frame == 6:
        output = blank()
        particles = {
            "down": ((2, 4), (5, 2), (11, 3), (14, 5), (4, 12), (9, 14), (13, 11)),
            "up": ((2, 10), (5, 13), (11, 12), (14, 9), (4, 3), (9, 1), (13, 4)),
            "left": ((3, 2), (1, 6), (2, 12), (7, 14), (11, 3), (13, 8), (12, 13)),
            "right": ((12, 2), (14, 6), (13, 12), (8, 14), (4, 3), (2, 8), (3, 13)),
        }[direction]
        colors = (LANTERN_RED, FUSE_ORANGE, FUSE_GOLD, FUSE_HOT)
        for index, (x, y) in enumerate(particles):
            set_pixel(output, x, y, colors[index % len(colors)])
        return output

    return blank()
