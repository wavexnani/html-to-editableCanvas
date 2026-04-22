# v2 plan — HTML → Canva-grade editable canvas

Scope confirmed with user:

- Extract **whole text blocks** as one element each (not per-leaf-text-node).
- Extract **whole background containers** as one element each (rects with
  bg / border / gradient / shadow / radius / transform).
- **Images** stay raster — move/resize/replace but no in-image painting.
- Target is to nail `classswipe_v9.html` pixel-for-pixel first.
- Effects: gradients, shadows, border-radius, transforms.
- Full **Canva-style editor UX** on top.

## Architecture overview

```
source HTML ──► iframe render ──► DOM + CSSOM walk
                                      │
                                      ▼
                    element classifier (below)
                                      │
                                      ▼
             normalized Scene { width, height, layers[] }
                                      │
                                      ▼
                  Fabric.js canvas (no rasterized bg)
                                      │
                                      ▼
  Canva-style UI:  [Layers] [Canvas + rulers/snap] [Inspector]
                   [Top toolbar: context-sensitive text/shape/image]
                   [Bottom: zoom, undo/redo, alignment, to-front/back]
```

## Element classifier (new importer)

For every element in the rendered document, decide its role:

1. **Skip** if `display: none` / `visibility: hidden` / zero size.
2. **Text block** — element whose content is only inline text/spans
   (no block-level descendants). Emit ONE `TextLayer` with the merged
   inline content, using the element's font properties. This matches
   the user's "complete text as one element" requirement.
3. **Image** — `<img>`, `<svg>` with raster content, or element with
   `background-image: url(...)`. Emit an `ImageLayer`.
4. **Shape / Background** — element with any visible paint
   (`background-color`, `background-image: gradient()`, `border`,
   `box-shadow`, non-zero `border-radius`). Emit a `RectLayer` (or
   `GradientLayer` if gradient). Children are still walked — unless
   the child is already fully covered visually.
5. **Container** — no paint, just layout. Don't emit a layer; recurse.

Z-order: preserve DOM order + stacking context. Layers later in the DOM
sit on top.

Transforms: read `getComputedStyle().transform`, decompose into
translate / rotate / scale and apply to Fabric object. Don't try to
handle arbitrary matrices in v2 — log a warning and flatten.

Pseudo-elements (`::before`, `::after`): read via
`getComputedStyle(el, "::before")`. If they have `content` and visible
paint, emit as extra layers positioned relative to the host element's
box. (Needed because classswipe_v9.html uses `::before` for some
decorative bars.)

## Fonts

- Parse `<link rel="stylesheet" href="fonts.googleapis.com/...">` and
  `@font-face` rules from the source HTML.
- Inject them into the **parent** document `<head>` at importer startup.
- Wait for `document.fonts.ready` before extracting dimensions (so
  measurements are post-layout).
- Fabric.js Textbox will now render in the correct family.

## Scene format (updated `src/types.ts`)

```ts
type Scene = {
  width: number;
  height: number;
  layers: Layer[];
  // injected <link> / @font-face rules to re-apply on load
  fonts: { href?: string; cssText?: string }[];
};

type LayerBase = {
  id: string;
  name: string;      // human-readable, for Layers panel
  kind: "text" | "rect" | "image";
  x: number; y: number; width: number; height: number;
  rotation: number;  // degrees
  opacity: number;   // 0..1
  visible: boolean;
  locked: boolean;
  shadow?: { color; blur; offsetX; offsetY };
};

type RectLayer = LayerBase & {
  kind: "rect";
  fill:
    | { type: "solid"; color: string }
    | { type: "linear-gradient"; angle: number; stops: [{offset,color}] }
    | { type: "radial-gradient"; stops: [...] };
  stroke?: { color; width; style };
  borderRadius: [tl, tr, br, bl];
};

type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontFamily: string; fontSize: number; fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number;       // multiplier
  letterSpacing: number;    // px
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  textDecoration: "none" | "underline" | "line-through";
};

type ImageLayer = LayerBase & {
  kind: "image";
  src: string;       // data URL or resolved absolute URL
  objectFit: "fill" | "contain" | "cover";
};
```

## Fabric mapping (`src/lib/sceneToFabric.ts`)

- `RectLayer` → `fabric.Rect` with solid fill, OR `fabric.Gradient` for
  gradients, plus `rx/ry` per corner (Fabric supports uniform radius;
  for non-uniform we emit a `fabric.Path` with a custom rounded rect).
- Shadows → `fabric.Shadow` attached to the object.
- `TextLayer` → `fabric.Textbox` with all typographic properties.
- `ImageLayer` → `fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" })`.
- Every object gets `data: { layerId, layerKind, name, locked }` so
  the Layers panel can reflect state and the Inspector can key off
  `layerKind`.

## UI layout (Canva-style)

```
┌──────────────────────────────────────────────────────────────┐
│ Menu bar: File | Edit | Object | View                        │
├─────────┬────────────────────────────────────┬───────────────┤
│         │ Top toolbar (contextual)           │               │
│ Layers  │                                    │  Inspector    │
│ panel   │  [  Canvas with rulers, guides  ]  │  (Position,   │
│ (tree,  │                                    │   Fill,       │
│  d&d)   │                                    │   Effects,    │
│         │                                    │   Text)       │
├─────────┴────────────────────────────────────┴───────────────┤
│ Bottom bar: zoom, undo/redo, align L/C/R, to-front/back      │
└──────────────────────────────────────────────────────────────┘
```

### Layers panel (`src/components/LayersPanel.tsx`)
- Tree of layers in z-order (top-of-list = on top).
- Drag to reorder → `canvas.bringObjectForward/backward`.
- Click → select on canvas. Double-click → rename.
- Eye icon → `set("visible", …)`. Lock icon → `set("selectable",
  "evented", "lockMovementX/Y/Scaling/Rotation", …)`.

### Top toolbar (`src/components/TopToolbar.tsx`)
- When **text** selected: font picker, size stepper, B / I / U, color,
  alignment, line-height, letter-spacing, uppercase toggle.
- When **rect** selected: fill (solid + gradient picker), stroke,
  corner radius, shadow.
- When **image** selected: replace image, crop toggle, object-fit.
- Always-on: opacity slider, rotation input.

### Inspector (`src/components/Inspector.tsx`)
- Position / size (X, Y, W, H, rotation, aspect-ratio lock).
- Align: canvas-align (L/C/R, T/M/B), distribute horiz/vert.
- Effects: shadow, blur (future).

### Menu + keyboard
- `Ctrl+Z` / `Ctrl+Shift+Z` — undo/redo (via `fabric-history` or a
  custom undo stack of `canvas.toObject` snapshots).
- `Ctrl+D` — duplicate, `Del` — delete.
- `Ctrl+G` / `Ctrl+Shift+G` — group / ungroup.
- `Ctrl+]` / `Ctrl+[` — to front / back by one.
- `Ctrl+Shift+]` / `Ctrl+Shift+[` — to absolute front / back.
- `Ctrl+C` / `Ctrl+V` — copy / paste.
- Arrow keys — nudge 1px; Shift+arrow — 10px.
- Snap to neighbours + canvas edges at 5px threshold.

## Fidelity test harness (`src/dev/fidelity.tsx`)

Dev-only panel that:
1. Loads `classswipe_v9.html` in a hidden iframe at 1:1 zoom.
2. Takes a `html2canvas-pro` snapshot.
3. Renders the imported scene on a Fabric canvas at the same size.
4. Exports Fabric to a PNG.
5. Diffs the two PNGs (pixel-by-pixel delta) and shows a heatmap.

I'll iterate the importer until the delta is visually negligible before
shipping.

## Delivery plan (branches)

- `devin/<ts>-v2-importer` — v2 importer + fabric mapping only, behind
  a feature flag so v1 still works.
- `devin/<ts>-v2-ui` — Canva-style UI.
- Both merged into the main feature branch PR (since `main` on origin
  doesn't exist yet, that push is still blocked — user has to
  initialize `main` on GitHub OR I'll keep pushing to the current
  feature branch and the PR will cover everything).

## Out of scope for v2 (explicit)

- Arbitrary HTML robustness (e.g. Tailwind sites). Follow-up.
- CSS animations / keyframes timeline. Follow-up.
- Masks, `backdrop-filter`, CSS filters. Follow-up.
- In-image pixel editing. Separate product.
- Multi-user collaboration, comments, versioning.
