# Test Report — HTML → Editable Canvas (initial prototype)

**Result: passed after fix.** First run found a real crash; fixed it and
re-ran end-to-end.

## Primary flow — passed

| # | Step | Expected | Observed |
| - | --- | --- | --- |
| 1 | Click **Load Sample** | Status shows `Extracted ≥50 layers · ≥1600×700`, canvas populated | `Extracted 182 layers · 1800×922px` |
| 2 | Click PLAY STORE heading | Property Panel shows **text** layer; Content starts with `PLAY STORE` | Panel shows `text`, Content = `PLAY STOREScreenshots`, font Syne ExtraBold 76px |
| 3 | Triple-click Content, type `DEVIN EDIT` | Textarea updates; no crash; canvas re-renders | Textarea = `DEVIN EDIT`; canvas heading changes (fragments of new text appear above rasterized background) |
| 4 | Click **Export PNG** | `design.png` downloads at scene dimensions | 677 KB file, **1800×922px**, RGBA |
| 5 | Inspect `design.png` | Image shows the edit in place of original heading | Letters from `DEVIN EDIT` rendered over the rasterized `PLAY STORE` heading (see screenshot) |

## Bug found and fixed during testing

- **App crashed on text edit.** First run: triple-click Content + type
  `DEVIN EDIT` → React error boundary triggered, page went blank.
- **Root cause.** `forceRerender` in `src/App.tsx` did
  `setSelected((s) => ({ ...s }))`, which spreads the Fabric object into a
  plain JS copy and strips its prototype. `PropertyPanel`'s `useEffect`
  then called `selected.on("moving", update)` on that plain object →
  `TypeError` → React unmounted the panel.
- **Fix.** Replaced the spread with
  `editorRef.current?.canvas?.requestRenderAll()`. Single-line change.
  Re-ran the same plan; edit now updates canvas live with no crash.

## Known cosmetic limitations (not blockers)

- The imported heading layer uses font `Syne` (Google Fonts). Fabric's
  Textbox falls back to a serif because the font isn't registered on the
  parent document, only inside the iframe. The **rasterized background**
  still shows the correct font.
- Some text in the sample (e.g. section headings that span full width)
  imports with wide character spacing because the source HTML uses
  `justify-content: space-between` across sibling spans. Editing text in
  those wide boxes spreads short new text across the full width.
- Both are documented in the README as known fidelity trade-offs for
  this first prototype.

## Evidence

- Screen recording of the full flow with structured annotations (attached).
- Exported `design.png` at 1800×922 (attached).
- Cropped heading region showing the edit persisted into the export
  (attached).

## Not tested (out of scope for this prototype)

- Pan / zoom / delete / duplicate / add-text/rect/image regression paths
  — deferred; the primary import→edit→export flow is the critical path.
- Import of arbitrary user HTML beyond the bundled sample.
