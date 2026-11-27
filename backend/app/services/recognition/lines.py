"""Split a handwritten region into one image per line (T4.1). pix2tex expects one expression per image.

Grayscale -> Otsu threshold -> horizontal projection profile -> ink bands. Bands separated by a gap
smaller than 1.2 x the median band height are merged (fraction bars, exponents, descenders), so only
real line breaks split.
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image

GAP_FACTOR = 1.2
PAD_PX = 4
MIN_INK_FRACTION = 0.002  # rows with less ink than this (relative to width) count as blank
MIN_BAND_PX = 3


@dataclass(frozen=True)
class LineCrop:
    image: Image.Image
    # bbox relative to the region image (0..1)
    x: float
    y: float
    w: float
    h: float


def otsu_threshold(gray: np.ndarray) -> int:
    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    total = gray.size
    if total == 0:
        return 128
    weights = np.arange(256, dtype=np.float64)
    sum_all = float((hist * weights).sum())
    w_bg = sum_bg = 0.0
    best, best_t = -1.0, 128
    for t in range(256):
        w_bg += hist[t]
        if w_bg == 0:
            continue
        w_fg = total - w_bg
        if w_fg == 0:
            break
        sum_bg += t * hist[t]
        m_bg = sum_bg / w_bg
        m_fg = (sum_all - sum_bg) / w_fg
        between = w_bg * w_fg * (m_bg - m_fg) ** 2
        if between > best:
            best, best_t = between, t
    return best_t


def ink_mask(img: Image.Image) -> np.ndarray:
    gray = np.asarray(img.convert("L"), dtype=np.uint8)
    if gray.size == 0 or int(gray.max()) - int(gray.min()) < 16:
        return np.zeros(gray.shape, dtype=bool)  # blank / uniform image
    t = otsu_threshold(gray)
    mask = gray <= t
    if mask.mean() > 0.5:  # light ink on a dark background
        mask = ~mask
    return mask


def _runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) runs of True."""
    runs, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(flags)))
    return runs


def line_bands(mask: np.ndarray) -> list[tuple[int, int]]:
    if mask.size == 0:
        return []
    width = mask.shape[1]
    rows = mask.sum(axis=1) > max(1, MIN_INK_FRACTION * width)
    bands = [b for b in _runs(rows) if b[1] - b[0] >= MIN_BAND_PX]
    if len(bands) < 2:
        return bands
    median_h = float(np.median([e - s for s, e in bands]))
    merged = [bands[0]]
    for s, e in bands[1:]:
        ps, pe = merged[-1]
        if s - pe < GAP_FACTOR * median_h:
            merged[-1] = (ps, e)
        else:
            merged.append((s, e))
    return merged


def segment_lines(img: Image.Image) -> list[LineCrop]:
    img = img.convert("RGB")
    mask = ink_mask(img)
    if not mask.any():
        return []
    H, W = mask.shape
    out = []
    for top, bottom in line_bands(mask):
        cols = np.flatnonzero(mask[top:bottom].any(axis=0))
        left, right = int(cols[0]), int(cols[-1]) + 1
        x0, y0 = max(0, left - PAD_PX), max(0, top - PAD_PX)
        x1, y1 = min(W, right + PAD_PX), min(H, bottom + PAD_PX)
        out.append(LineCrop(img.crop((x0, y0, x1, y1)), x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H))
    return out
