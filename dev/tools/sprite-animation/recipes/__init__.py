from .eye_split import build_frame as build_eye_split_frame
from .kappa_drown import build_frame as build_kappa_drown_frame
from .skull_extinguish import build_frame as build_skull_extinguish_frame

RECIPES = {
    "eye_split": build_eye_split_frame,
    "kappa_drown": build_kappa_drown_frame,
    "skull_extinguish": build_skull_extinguish_frame,
}
