"""
Fast plate-text OCR using the trained fast-plate-ocr engine model.

Reads text off a cropped license-plate image with
``models/best.keras`` (CCT-OCR transformer, per-slot classifier)
plus ``models/plate_config.yaml`` (alphabet / input geometry).

Runs on the Keras 3 PyTorch backend — the venv already ships torch and
does not require TensorFlow. The custom layers needed to load the model
are vendored in ``anpr/layers.py`` (from the MIT-licensed
https://github.com/ankandrew/fast-plate-ocr project).
"""
import os
import re
from dataclasses import dataclass
from pathlib import Path

os.environ.setdefault("KERAS_BACKEND", "torch")

import numpy as np
import cv2

import anpr.layers  # noqa: F401  registers the custom Keras layers
import keras
from anpr.custom_objects import build_custom_objects

INTERPOLATION_MAP = {
    "nearest": cv2.INTER_NEAREST,
    "linear": cv2.INTER_LINEAR,
    "cubic": cv2.INTER_CUBIC,
    "area": cv2.INTER_AREA,
    "lanczos4": cv2.INTER_LANCZOS4,
}


@dataclass
class PlateConfig:
    max_plate_slots: int
    alphabet: str
    pad_char: str
    img_height: int
    img_width: int
    keep_aspect_ratio: bool = False
    interpolation: str = "linear"
    image_color_mode: str = "rgb"
    padding_color: tuple = (114, 114, 114)

    @property
    def vocabulary_size(self) -> int:
        return len(self.alphabet)

    @property
    def pad_idx(self) -> int:
        return self.alphabet.index(self.pad_char)

    @property
    def num_channels(self) -> int:
        return 3 if self.image_color_mode == "rgb" else 1


def load_plate_config_from_yaml(yaml_path):
    import yaml

    with open(yaml_path, encoding="utf-8") as f:
        content = yaml.safe_load(f)
    return PlateConfig(**content)


def _resize_image(img, img_height, img_width, image_color_mode="rgb",
                  keep_aspect_ratio=False, interpolation_method="linear",
                  padding_color=(114, 114, 114)):
    interpolation = INTERPOLATION_MAP[interpolation_method]

    if not keep_aspect_ratio:
        img = cv2.resize(img, (img_width, img_height), interpolation=interpolation)
    else:
        orig_h, orig_w = img.shape[:2]
        r = min(img_height / orig_h, img_width / orig_w)
        new_unpad_w, new_unpad_h = round(orig_w * r), round(orig_h * r)
        if (orig_w, orig_h) != (new_unpad_w, new_unpad_h):
            img = cv2.resize(img, (new_unpad_w, new_unpad_h), interpolation=interpolation)
        dw, dh = (img_width - new_unpad_w) / 2, (img_height - new_unpad_h) / 2
        top, bottom = round(dh - 0.1), round(dh + 0.1)
        left, right = round(dw - 0.1), round(dw + 0.1)
        if image_color_mode == "rgb":
            border = tuple(int(c) for c in padding_color)
        else:
            border = int(padding_color[0])
        img = cv2.copyMakeBorder(
            img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=border
        )
    if image_color_mode == "grayscale" and img.ndim == 2:
        img = np.expand_dims(img, axis=-1)
    return img


def _preprocess_image(image):
    image = np.expand_dims(image, axis=0)
    return image.astype(np.uint8)


def _postprocess_output(model_output, max_plate_slots, alphabet, pad_char):
    """(plate, per-char confidence) from raw model output. Trailing pad chars stripped."""
    arr = np.asarray(model_output)
    preds = arr.reshape((-1, max_plate_slots, len(alphabet)))
    prediction_indices = np.argmax(preds, axis=-1)
    alphabet_array = np.array(list(alphabet))
    plate = "".join(alphabet_array[prediction_indices[0]].tolist()).rstrip(pad_char)
    probs = np.max(preds, axis=-1)[0]
    return plate, probs


class PlateOCR:
    def __init__(self, model_path, config_path, device=None):
        self.config = load_plate_config_from_yaml(config_path)
        self.device = device if device and device != "cpu" else None
        if self.device:
            with keras.device(self.device):
                self.model = keras.models.load_model(
                    model_path, custom_objects=build_custom_objects(self.config)
                )
        else:
            self.model = keras.models.load_model(
                model_path, custom_objects=build_custom_objects(self.config)
            )
        print(
            f"[PlateOCR] Loaded {Path(model_path).name} "
            f"(input={self.model.inputs[0].shape}, output={self.model.outputs[0].shape})"
            f"{f' on device {self.device}' if self.device else ''}"
        )

    def read(self, plate_crop):
        """
        Args:
            plate_crop: BGR image of just the plate region.

        Returns:
            tuple[str, str, np.ndarray]: (cleaned_text, raw_ocr_text,
            per-char confidences). Text fields are "" if nothing could
            be read.
        """
        if plate_crop is None or plate_crop.size == 0:
            return "", "", np.array([])

        if plate_crop.ndim == 2:
            rgb = cv2.cvtColor(plate_crop, cv2.COLOR_GRAY2RGB)
        elif plate_crop.shape[2] == 3:
            rgb = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2RGB)
        else:
            rgb = plate_crop

        resized = _resize_image(
            rgb,
            self.config.img_height,
            self.config.img_width,
            image_color_mode=self.config.image_color_mode,
            keep_aspect_ratio=self.config.keep_aspect_ratio,
            interpolation_method=self.config.interpolation,
        )
        batch = _preprocess_image(resized)

        if self.device:
            with keras.device(self.device):
                out = self.model.predict(batch, verbose=0)
        else:
            out = self.model.predict(batch, verbose=0)
        if isinstance(out, dict):
            out = out.get("plate", list(out.values())[0])

        raw, probs = _postprocess_output(
            out, self.config.max_plate_slots, self.config.alphabet, self.config.pad_char
        )
        cleaned = re.sub(r"[^A-Z0-9]", "", raw.upper())
        return cleaned, raw, probs