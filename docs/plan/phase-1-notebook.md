# Phase 1 — Notebook Foundation (Day 1–4) · Owner: M2

**Goal:** a learner can create notebooks and pages and write, erase and undo with pen, touch or mouse. They can type equations with the keyboard, select a region, import an image, and have everything autosave and survive a refresh, all offline.

---

## T1.1 — Notebook data model + IndexedDB (Dexie)  🟡

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T0.2 (T0.4 types preferred; draft types OK) | T1.2, T1.6 | T1.4, T1.5, T1.7 |

**Steps**
1. Define TS types in `src/notebook/model.ts` (re-export the generated contract types where they exist): `Notebook`, `Page`, `Stroke`, `NotebookObject`, `Background`.
2. Create the Dexie DB in `src/services/db/db.ts`.
   1. Tables: `notebooks(id, updatedAt)`, `pages(id, notebookId, order)`, `strokes(id, pageId)`, `objects(id, pageId, kind)`, `reviews(submissionId, pageId)`.
   2. `version(1)` schema plus a migration placeholder.
3. Write repositories in `src/services/db/repos/*.ts` with CRUD and `listByPage`. Strokes use soft-delete (`deleted: true`) so undo works.
4. Use UUIDv7 or `crypto.randomUUID()` for IDs.
5. Create the Zustand store `useNotebookStore` (current notebook/page and tool state) that delegates persistence to the repos.

**Tests (unit, Vitest + fake-indexeddb)**
- Create → read → update → soft-delete round-trip for every table.
- `listByPage` returns strokes in insertion order.
- A schema-version open on an empty DB succeeds.

**Done when:** repos are 100% covered by unit tests; the store loads a notebook from IDB.

---

## T1.2 — Ink canvas: Pointer Events capture & render  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 6 h | T0.2 | T1.1, T1.6 | T1.3 |

**Steps**
1. Create the `InkCanvas` component.
   1. Set `touch-action: none` on the canvas.
   2. Handle `devicePixelRatio` scaling, and resize with `ResizeObserver`.
   3. Use two canvases: a **committed** layer (all strokes) and a **live** layer (the current stroke only) for performance.
2. Capture pointer input.
   1. `pointerdown` → `setPointerCapture` and start a stroke; record `pointerType`.
   2. `pointermove` → use `getCoalescedEvents()` when available. Push `{x,y}` normalized to page size (0..1), plus `pressure` and `timeStamp`.
   3. `pointerup`/`pointercancel` → finalize the stroke, compute its `bbox`, and emit `onStrokeComplete`.
3. Add basic palm rejection: while a `pen` pointer is active, ignore `touch` pointers. Add a setting to "ignore touch when pen detected".
4. Render.
   1. Smooth with quadratic curves through midpoints.
   2. Width = `baseWidth * (0.5 + pressure)` when pressure exists, otherwise constant.
   3. Redraw the committed layer from data on load or resize.
5. Make mouse ink work, but treat it as secondary (spec: mouse handwriting is not the main laptop path).

**Tests**
- Unit: point normalization, bbox computation, the smoothing function (pure functions).
- Component: a simulated pointer sequence with `user-event` creates 1 stroke with N points.
- Manual: draw on a real tablet and phone; stroke latency should *feel* immediate (target < 16 ms per frame; check in the Performance tab).

**Done when:** pen, touch and mouse all draw; strokes are emitted as data; a redraw from data matches the original.

---

## T1.3 — Drawing tools + undo/redo  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T1.2 | T1.4 | T1.5, T1.8 |

**Steps**
1. Tool config: `pen` (opaque, thin), `pencil` (lower opacity, texture optional), `highlighter` (wide, 30% alpha, drawn on its own layer under the ink), `eraser`.
2. Eraser is a **stroke eraser** (MVP). It hit-tests against stroke bboxes, then by distance to segments, and soft-deletes the hit strokes.
3. Command stack (`src/notebook/tools/history.ts`).
   1. Commands: `AddStroke`, `DeleteStrokes`, `AddObject`, `MoveObjects`, `DeleteObjects`.
   2. `undo()`/`redo()` with a per-page stack, capped at 200 entries.
   3. Keyboard shortcuts `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y`.
4. Toolbar UI (DOM) with an accessible `aria-pressed` toggle per tool and a colour/width picker.

**Tests**
- Unit: history stack (undo after N adds, redo cleared after a new command, cap enforced).
- Unit: eraser hit-test geometry.
- Component: select the eraser → erase a stroke → undo → the stroke is back.

**Done when:** all four tools work, and undo/redo works for add, erase and move.

---

## T1.4 — Notebooks, chapters, pages + backgrounds

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T1.1 | T1.3 | T2.5 |

**Steps**
1. Notebook list screen: create, rename, delete (with confirm), and open.
2. Inside a notebook: a sidebar of pages grouped by chapter, plus add page, reorder (up/down buttons; drag optional) and rename.
3. Page backgrounds `ruled`, `squared` and `blank`, drawn as CSS/SVG patterns *behind* the canvas.
4. Next/prev page buttons, `PageUp`/`PageDown` shortcuts, and a bookmark toggle (P1 if short on time).
5. Zoom (buttons, pinch, `Ctrl+wheel`) and pan (two-finger, space+drag). Use a transform on a wrapper and keep stroke coordinates page-normalized.

**Tests**
- Component: create a notebook → add 3 pages → navigate → the correct page shows.
- Unit: zoom/pan coordinate transform (screen ↔ page) is invertible.

**Done when:** a learner can manage notebooks and pages and navigate with touch and keyboard.

---

## T1.5 — Autosave & restore

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T1.1, T1.3 | T1.4 | T2.5 |

**Steps**
1. Save every committed stroke or object change to IDB immediately (it is small). Debounce page-metadata saves by 500 ms.
2. Add a save-status indicator: `Saved` / `Saving…` / `⚠ Not saved — retrying`.
3. On IDB write failure, keep the data in memory, show a banner, and retry with backoff (spec §13.3).
4. On app start, reopen the last notebook and page (stored in `localStorage`, wrapped in try/catch).
5. Request `navigator.storage.persist()` once to reduce the risk of eviction.

**Tests**
- Unit: debounce logic.
- Integration (Vitest + fake-indexeddb): write strokes → recreate the store → the strokes are restored.
- **Failure injection:** mock a Dexie `put` rejection and check that the banner shows and the retry succeeds.
- E2E (later, T7.3): draw → reload → the strokes are present.

**Done when:** refresh, tab close and browser restart lose nothing.

---

## T1.6 — Responsive shell + device capability modes

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T0.2 | T1.1, T1.2 | T1.7, T7.4 |

**Steps**
1. `src/services/device/capabilities.ts` detects `anyCoarse`, `anyFine`, `hover`, screen class (`phone < 640`, `tablet 640–1279`, `desktop ≥ 1280`), and whether a pen has been seen.
2. Derive `mode: 'tablet' | 'phone' | 'laptop' | 'hybrid'` (see the flowchart in `02-architecture.md §2`). Add a manual override in Settings.
3. Layouts:
   1. Tablet: toolbar on the side, large touch targets (≥ 44 px), review panel as a slide-over.
   2. Phone: bottom tool bar, page list as a drawer, a prominent **Capture** button, and long-writing prompts discouraged.
   3. Laptop: top toolbar, equation-block mode on by default, review panel docked on the right.

**Tests**
- Unit: mode derivation for a matrix of mocked `matchMedia` results.
- E2E (T7.3): screenshots at 390×844 (phone), 1024×1366 (tablet, `hasTouch`) and 1440×900 (laptop).

**Done when:** each mode renders the correct layout, and the override works.

---

## T1.7 — MathLive equation blocks + symbol palette (keyboard-first)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T1.1 (T1.6 helpful) | T1.8, T2.5 | typed workflow UI, T7.8 |

**External:** `mathlive` npm package (MIT). Fonts are bundled; check that they load offline.

**Steps**
1. Add a `SolutionBlock` object kind (`payload: {steps: [{id, latex}], problemId?}`) placed on the page at a bbox.
2. Each step is a `<math-field>`.
   1. `Enter` → new step below; `Backspace` on an empty step → delete it and focus the previous one.
   2. `↑`/`↓` move between steps.
   3. Use MathLive's virtual keyboard on touch devices and the physical keyboard on laptops.
3. Text notes between steps: a `TextNote` object, plain textarea, keyboard reachable.
4. Symbol palette (fraction, root, power, subscript, π, ±, ≤, ≥, ∫, Σ, matrix). Clicking a symbol inserts it at the cursor with `mf.executeCommand(['insert', …])`, and every symbol is reachable with `Tab`.
5. Add a "Check these steps" button that calls `POST /submissions/typed` (mock until T2.3).
6. Render read-only steps with KaTeX when not focused (optional; MathLive can render too).

**Tests**
- Component: type `2x+3=7` → Enter → `2x=4` → the store has 2 steps with the correct LaTeX.
- Keyboard-only E2E (T7.3): complete the whole typed workflow without the mouse.
- Accessibility: math fields have labels ("Step 1") and the palette buttons have `aria-label`s.

**Done when:** a non-touch laptop user can write a multi-step solution entirely from the keyboard.

---

## T1.8 — Lasso selection, SVG overlay, expandable workspace  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T1.3 | T1.7 | T1.9, T5.4 |

**Steps**
1. SVG overlay layer sized to the page, above the canvas, with `pointer-events` only on interactive shapes.
2. Lasso tool.
   1. Draw a freeform polygon and close it on pointerup.
   2. Select the strokes whose bbox centre (or ≥ 60% of their points) is inside the polygon (point-in-polygon).
   3. Show the selection bbox with handles; move the selected strokes (a `MoveObjects` command).
   4. Show a selection context menu: **Review this**, **Explain step**, **Copy**, **Delete**.
3. Rectangle selection as a simpler alternative (also for mouse users).
4. Expandable workspace.
   1. An "Add working space" button attaches a `WorkspaceArea` (extra canvas region) below the page or as a side sheet.
   2. The area keeps a reference to its parent page and stays in the same notebook context.
5. Expose `getSelection(): {strokeIds, bbox}` for T1.9 and T5.4.

**Tests**
- Unit: point-in-polygon, selection-by-threshold.
- Component: lasso around 2 of 3 strokes → 2 selected; move → coordinates updated; undo → restored.

**Done when:** a region can be selected, moved and passed to the review flow.

---

## T1.9 — Image import / camera + region crop export  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T1.8 | T4.1 (backend side) | T4.3, T5.4 |

**Steps**
1. Import.
   1. `<input type="file" accept="image/png,image/jpeg,image/webp" capture="environment">` (on phones this opens the camera).
   2. Check size (≤ 5 MB) and dimensions on the client and downscale to ≤ 2048 px on the long side.
   3. Store the original as a Blob in IDB (an `objects` row with `kind: 'image'`). **Never mutate it.**
2. Place the image on the page as a movable/resizable object.
3. Region crop export, `exportRegion(bbox) → PNG Blob`.
   1. For ink, render the selected strokes on an offscreen canvas with a white background, black ink and 2× scale, with 16 px padding.
   2. For images, crop the source image to the bbox.
4. Phone capture flow: Capture → preview → crop rectangle → "Use this" → submit.

**Tests**
- Unit: size and type validation, downscale dimensions.
- Component: import fixture image → object appears; export region → Blob of type `image/png`.
- Manual: camera capture on a real phone (T7.4).

**Done when:** an imported image or ink selection becomes a PNG crop with its bbox, ready to upload.
