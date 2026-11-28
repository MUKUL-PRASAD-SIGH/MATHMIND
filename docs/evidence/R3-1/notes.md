# R3-1 OCR uncertainty

- **Captured:** 2026-11-28T11:19:43+00:00 · commit `ea62773` + ConfirmPanel crop fix · automated (Playwright, laptop 1440×900) · `EVIDENCE=1 npx playwright test ocr-uncertain --project=laptop`
- **Input:** a stroke on the page, lasso → "Review this"
- **Expected:** "Check recognition" panel; original kept; correct/retry path works; **no incorrect verdict before confirmation**
- **Result:** **PARTIAL PASS — mock OCR only**

## What this shows

- The panel opens with "We're not sure we read this correctly. Please check." and lists 4 recognized lines next to crops of the learner's own ink.
- Line 2 (confidence 0.41, below `UNCERTAIN_BELOW = 0.75`) has the amber **uncertain** badge.
- **No verdict is shown** before confirmation (`review-annotations` count = 0); the word "wrong" never appears.
- "Looks right" marks a line; Escape closes the panel and the confirmation survives reopening (`screenshot-after-reopen.png`).
- Re-crop / Type instead / Continue checking are present. The original strokes are untouched (OCR text is stored separately by `region_id`).
- The server side of this rule (`awaiting_confirmation` → no verification until `POST /confirm`) is covered by
  `backend/tests/recognition/test_pipeline.py` and `tests/test_submissions_image.py`.

## What it does not show yet

The recognized text comes from the MSW mock (`ReviewResponse.awaiting_confirmation` example), **not from pix2tex**:
pix2tex is not installed on the dev laptop (`requirements-ml.txt` / `WITH_ML=1` image, several GB; not enough free RAM
during this session). To complete: build the backend with `WITH_ML=1`, upload a messy handwriting photo through
**Image → Review this**, and replace these screenshots.

## Bug found while capturing

The crop thumbnails were broken images: the blob URL was created in `useMemo` and revoked in an effect cleanup, which
React StrictMode runs once extra, so the URL in use had been revoked. Fixed in `ConfirmPanel.tsx` (create and revoke in
the same effect, and hide a thumbnail that fails to load).

Screen recording (clip.mp4): _not recorded yet — record by hand for the video (T8.4)._
