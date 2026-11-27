# Phase 4 — Handwriting Recognition (Day 3–4)

**Goal:** a cropped handwritten region becomes candidate LaTeX lines with a confidence value. Low-confidence results **always** go to the learner for confirmation before any maths verdict.

> **Safety rule (spec §8.3):** the system must not label maths incorrect when the cause may be an OCR mistake.

---

## T4.1 — pix2tex recognition service + line split + confidence proxy  🔴 (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T0.5, T3.1 | T3.3, T1.9 | T4.2 |

**External:** `pix2tex` + weights (first-run download, ~100 MB+), CPU torch, `opencv-python-headless`. A GPU is optional. **Check the pix2tex licence** (record it in `06-external-requirements.md`).

**Steps**
1. Load the model once. `services/recognition/engine.py` holds a lazy singleton `LatexOCR()`, loaded in a worker thread at startup if `PRELOAD_OCR=true`, and reported in `/health`.
2. Line segmentation (pix2tex expects **one expression per image**).
   1. Grayscale → Otsu threshold → horizontal projection profile.
   2. Split on whitespace gaps ≥ 1.2 × median line height and return line crops with their bboxes (relative to the region).
   3. If the frontend sent stroke data, prefer splitting by stroke y-clusters (more reliable).
3. Recognize each line → LaTeX.
4. Confidence proxy (pix2tex does not report a calibrated confidence), as a combined score in 0..1:
   1. `parse_ok`: does `parse_step(latex)` succeed? (weight 0.4)
   2. `stability`: re-run on 2 light augmentations (±2° rotation, 0.95 scale). Score = the share of runs that agree after normalization. (weight 0.4)
   3. `sanity`: penalize very long outputs for small crops, repeated tokens, and unbalanced braces. (weight 0.2)
   4. Threshold `OCR_CONFIDENCE_THRESHOLD` (default 0.75), to be tuned in T7.2.
5. Return `[{line_index, bbox, latex, confidence, recognizer_version}]`.

**Tests**
- Unit: line segmentation on synthetic images (render 3 known lines with PIL → 3 bboxes).
- Unit: confidence scoring for fixed inputs (mock the OCR).
- `@pytest.mark.ml` integration: 10 fixture images in `datasets/handwriting_samples/` → record the exact-match rate (no pass threshold, just recorded; evaluated in T7.2).
- Performance: time per line on CPU recorded in `ai/benchmarks/`.

---

## T4.2 — Recognition stage in job runner + `/confirm` endpoint  🔴 (M1)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T2.4, T4.1 | T5.2 | T4.3, T5.3 |

**Steps**
1. Register the `recognize` stage for image submissions and persist `recognized_regions`.
2. If any line has `confidence < threshold` → `awaiting_confirmation`, and stop the pipeline.
3. `POST /submissions/{id}/confirm`, body `{regions: [{id, confirmed: true, corrected_latex?}]}`.
   1. Validate that every region id belongs to the submission.
   2. Store `corrected_latex` **separately** (keep the original OCR output for evaluation).
   3. Resume the pipeline at `verify`, using `corrected_latex ?? latex`.
4. On OCR failure → `failed_recognition`. The learner can still POST `/confirm` with typed LaTeX for each region.

**Tests**
- Integration (OCR mocked): high confidence → goes straight to verify; low confidence → `awaiting_confirmation`; confirm → completes.
- Integration: confirm with a foreign region id → 422.
- Failure injection: OCR raises → `failed_recognition`, the image is kept, and manual confirm works.

---

## T4.3 — OCR confirmation UI  🟡 (M2)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T1.9, T4.2 (mock-ok from T0.4 examples) | T5.2 | T5.4 |

**Steps**
1. When the status is `awaiting_confirmation`, open a **Check recognition** panel (not a modal that blocks the notebook).
2. For each line: show the source crop thumbnail, the recognized LaTeX rendered with KaTeX, and an editable MathLive field pre-filled with that LaTeX. Use an amber "uncertain" badge when confidence is below the threshold.
3. Buttons: **Looks right**, **Fix it** (focuses the field), **Re-crop** (back to selection), and **Type instead**.
4. Submit → `POST /confirm` → resume polling.
5. Copy must never say "wrong". Use "We're not sure we read this correctly."

**Tests**
- Component (MSW): the awaiting_confirmation example renders 3 lines with one amber badge; edit + confirm sends the correct payload.
- Accessibility: the panel is focus-trapped only while open, and Escape closes it without losing edits.
- E2E (T7.3): image path with a low-confidence mock → confirm → result.
