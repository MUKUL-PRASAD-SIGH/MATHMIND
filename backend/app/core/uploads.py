"""Image upload validation (spec section 13.2): type by magic bytes, size, dimensions; EXIF stripped."""

import io
import warnings

import filetype  # type: ignore[import-untyped]
from PIL import Image

from app.core.errors import AppError

ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}


def validate_and_normalize_image(data: bytes, max_bytes: int, max_side: int) -> tuple[bytes, int, int]:
    """Returns (png_bytes, width, height). Raises AppError 413/415/422."""
    if len(data) > max_bytes:
        raise AppError(413, "file_too_large", "Image is too large", {"max_bytes": max_bytes, "received": len(data)})
    if not data:
        raise AppError(422, "empty_file", "The uploaded file is empty")

    kind = filetype.guess(data)
    if kind is None or kind.mime not in ALLOWED_MIME:
        raise AppError(
            415,
            "unsupported_media_type",
            "Only PNG, JPEG or WebP images are accepted",
            {"detected": kind.mime if kind else None},
        )

    # Guard against decompression bombs before decoding pixel data.
    Image.MAX_IMAGE_PIXELS = max_side * max_side
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                width, height = probe.size
                if width > max_side or height > max_side:
                    raise AppError(
                        422,
                        "image_too_large",
                        "Image dimensions exceed the limit",
                        {"max_side": max_side, "width": width, "height": height},
                    )
                probe.load()
                img = probe.convert("RGBA" if probe.mode in ("RGBA", "LA", "P") else "RGB")
    except AppError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise AppError(422, "image_too_large", "Image dimensions exceed the limit", {"max_side": max_side}) from exc
    except Exception as exc:
        raise AppError(422, "invalid_image", "The image could not be decoded") from exc

    out = io.BytesIO()
    img.save(out, format="PNG")  # re-encoding drops EXIF and any trailing payload
    return out.getvalue(), width, height
