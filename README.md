# HTML → Editable Canvas

Paste an HTML/CSS design and edit it like Canva/Figma: every text, image, and
shape becomes an independently selectable, movable, resizable, rotatable, and
editable layer on a Fabric.js canvas.

![screenshot placeholder](docs/hero.png)

## What it does

1. **Import HTML.** Click *Import HTML* (or *Load Sample* to try the bundled
   `classswipe_v9.html` design) and the app renders it in a hidden iframe at
   a fixed viewport width (1800px by default).
2. **Extract layers.** The importer walks the DOM and pulls every
   text-containing leaf element and `<img>` tag out as an editable layer with
   pixel-accurate position, size, font, color, and opacity.
3. **Rasterize background.** A high-fidelity snapshot of the original HTML is
   rendered via [html2canvas-pro](https://github.com/yorickshan/html2canvas-pro)
   and placed on the canvas as a locked background layer, so complex CSS you
   could *not* decompose (gradients, neumorphism shadows, SVG, backdrop
   filters, animations) still looks right.
4. **Edit freely.** Every extracted layer is a Fabric object on top of the
   background — select, drag, resize, rotate, recolor, retype, duplicate,
   delete. Add new text, shapes, or images.
5. **Export** to PNG (merged render) or JSON (reloadable scene).

## Stack

- **React + Vite + TypeScript** — UI shell.
- **[Fabric.js v6](http://fabricjs.com/)** — editable canvas primitives.
- **html2canvas-pro** — background rasterization.
- No backend. Everything runs in the browser.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Click *Load Sample* to try the bundled
`classswipe_v9.html` design, or *Import HTML* to load your own file.

### Scripts

- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check and build for production.
- `npm run lint` — ESLint.
- `npm run preview` — serve the production build locally.

## Editor shortcuts

- `Alt + drag` or middle-mouse — pan the canvas
- `Ctrl/Cmd + wheel` — zoom
- `Delete` / `Backspace` — remove selection
- `Ctrl/Cmd + D` — duplicate selection
- Double-click a text layer — edit inline

## Architecture

```
src/
├─ App.tsx                    # top-level state, toolbar wiring, import/export
├─ types.ts                   # Scene / Layer types
├─ lib/
│  ├─ htmlImporter.ts         # HTML → Scene (iframe + DOM walk + html2canvas)
│  └─ sceneToFabric.ts        # Scene → Fabric objects
├─ components/
│  ├─ EditorCanvas.tsx        # Fabric canvas wrapper (pan/zoom/selection)
│  ├─ Toolbar.tsx             # top action bar
│  └─ PropertyPanel.tsx       # right-hand inspector for selected layer
├─ samples/
│  └─ classswipe_v9.html      # bundled demo design
└─ styles/index.css
```

### How the importer works

`importHtml(html)`:

1. Creates a hidden iframe with the HTML as `srcdoc`.
2. Waits for `document.fonts.ready` and all `<img>` loads.
3. Resizes the iframe to the content's `scrollWidth` × `scrollHeight` so we
   capture the whole design, not just the initial viewport.
4. Walks the iframe's DOM:
   - For each leaf element with direct text content → `TextLayer` with
     `getBoundingClientRect()` position and computed font/color style.
   - For each `<img>` → `ImageLayer`.
5. Rasterizes the iframe body with `html2canvas-pro` and stores the data URL
   as `Scene.background`.
6. Returns the `Scene` object. The iframe is then disposed.

### Extending

- **New layer kinds** — add to `types.ts` and `sceneToFabric.ts`.
- **Better CSS extraction** — extend `htmlImporter.ts` to also pick up
  computed `background-color`, `border-radius`, `box-shadow`, and emit
  `RectLayer`s for visible block-level elements instead of relying only on the
  raster background.
- **Persisted scenes** — `canvas.toObject([...])` is already used for JSON
  export; wire it to a backend or localStorage for save/load.

## Known limitations

- Fancy CSS (gradients, neumorphism, backdrop-filter, animations, SVG) is
  captured as a rasterized background — you can reposition/retype text on top
  of it, but you cannot edit the background itself.
- `html2canvas-pro` can't render `iframe`, `video`, or cross-origin images
  without CORS headers.
- Font rendering on the canvas uses whatever fonts are loaded in the host
  document — web fonts referenced only inside the imported HTML may fall back
  to the browser default on the Fabric side. Add the same `@font-face`
  declarations to `index.html` or inject them at import time if you need
  pixel-perfect font fidelity.
