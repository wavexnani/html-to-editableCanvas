# Test plan — HTML → Editable Canvas (initial prototype)

**Under test:** the initial scaffold on branch
`devin/1776735646-initial-prototype` running locally at
<http://localhost:5173>. The PR cannot be pushed yet because the Devin GitHub
app does not have access to the new empty repo `wavexnani/html-to-editableCanvas`;
that is a blocker for posting results on GitHub but not for runtime testing.

## Scope

A single adversarial end-to-end flow: **prove the app can import the user's
HTML, extract editable layers, let the user change a text layer, and export a
PNG that reflects the change**. This exercises every critical piece:
iframe render + DOM walk (importer), html2canvas-pro rasterization
(background), Fabric canvas (editing), and canvas export.

If any of these are broken — importer fails silently, background doesn't
rasterize, text layers aren't selectable, the property panel doesn't wire
changes, or export snapshots the wrong region — this test will visibly fail.

## Primary flow: import sample → edit text → export PNG

| # | Action | Expected pass criteria | Fail if |
| - | ------ | ---------------------- | ------- |
| 1 | Load `http://localhost:5173` in Chrome | Page shows header "HTML → Editable Canvas", toolbar with buttons "Import HTML", "Load Sample", "+ Text", "+ Rect", "+ Image", "−", "Fit", "+", "Export JSON", "Export PNG". Status reads "Import an HTML file or click Load Sample to begin." | Any of the above labels missing; blank page; console errors about module loading |
| 2 | Click **Load Sample** | Status flips to "Rendering sample (ClassSwipe V9)…", spinner appears; within ~5s status changes to "Extracted N layers · WxH px" where **N ≥ 50** (the sample has 300+ DOM nodes; at least dozens are leaf text elements) and **W ≥ 1600, H ≥ 700** | N < 20, or status says "Import failed: …", or status never updates, or canvas stays empty |
| 3 | Observe the canvas | A rasterized image of the ClassSwipe design (dark background with "PLAY STORE Screenshots" heading and 5 phone-screenshot cards in a row) is visible, fit to the viewport | Canvas is blank, white, or shows only a grid; or shows a broken image icon |
| 4 | Click directly on the large "PLAY STORE" text (white heading near top of the design) | Fabric selection handles (blue corners) appear around a rectangle tightly bounding the heading. Property panel on the right switches from the empty-state hint to show "Properties text" with a "Content" textarea whose value starts with "PLAY STORE" (possibly including "Screenshots" if the importer collapsed sibling text) | No selection handles appear; property panel still shows "Select an element to edit."; selected layer is labeled "image" or "rect" instead of "text" |
| 5 | In the Content textarea, replace the heading text with `DEVIN EDIT` (select all + type) | The text on the canvas updates live to read `DEVIN EDIT` in the same position, font size, and color as before. The underlying rasterized "PLAY STORE" text is still visible behind it (background layer is locked), but the Fabric textbox on top covers it with the new text. | Canvas still shows "PLAY STORE" only; the textbox disappears; app crashes; textarea edit has no visible effect |
| 6 | Click empty canvas area to deselect | Selection handles disappear; property panel returns to the empty-state hint including the Shortcuts list | Panel still shows inputs; handles remain |
| 7 | Click **Export PNG** | A file named `design.png` downloads. Open it | Download never fires; the file is 0 bytes; the file fails to open |
| 8 | Inspect `design.png` | Image dimensions equal the scene dimensions reported in step 2 (within ±1px). The exported image contains the `DEVIN EDIT` text rendered on top of the original design (i.e. the edit persisted into the export) | PNG is blank / has only background / shows "PLAY STORE" with no edit / has a different aspect ratio than the canvas |

## Regression / edge spot-checks (only if primary flow passes)

- **Zoom/pan still works after load.** Ctrl+wheel zooms; Alt+drag pans. Canvas should not jump or reset selection.
- **Delete key removes selection.** Select any layer, press Delete, expect it to disappear from the canvas.

Both are clearly labeled "Regression" in the final report.

## Known limitations acknowledged (not tested here)

- Custom Google Fonts (`Syne`, `Space Mono`) loaded only inside the iframe
  may fall back to browser defaults when the Fabric Textbox re-renders. The
  raster background still shows the correct fonts. This is called out in the
  README and is acceptable for the first prototype.
- Complex CSS effects (gradients, neumorphic shadows, animations) are
  preserved as a rasterized background but cannot be independently edited.
  That is the intentional design choice documented in the architecture.

## Evidence captured

- Screen recording of the full flow (steps 1–8) with annotations per step.
- Screenshot of the downloaded `design.png` opened in an image viewer for
  step 8.
- Browser console output confirming no errors during import/edit/export.
