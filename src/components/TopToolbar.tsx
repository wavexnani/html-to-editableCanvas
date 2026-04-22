import { useEffect, useState } from "react";
import type { Canvas } from "fabric";
import { Path, Rect, Textbox } from "fabric";
import type { LayeredObject } from "../lib/sceneToFabric";

interface Props {
  canvas: Canvas | null;
  selected: LayeredObject | null;
  onChange: () => void;
  /** Menu actions (rendered as a group on the left of the contextual bar). */
  onImportFile: (file: File) => void;
  onLoadSample: () => void;
  onAddText: () => void;
  onAddRect: () => void;
  onAddImage: (file: File) => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
}

const FONT_FAMILIES = [
  "Syne",
  "Space Mono",
  "Inter",
  "Roboto",
  "Helvetica",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "monospace",
  "serif",
  "sans-serif",
];

const WEIGHTS = ["300", "400", "500", "600", "700", "800"];

export function TopToolbar(props: Props) {
  const { canvas, selected, onChange, busy } = props;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!selected) return;
    const h = () => setTick((t) => t + 1);
    selected.on("modified", h);
    return () => {
      selected.off("modified", h);
    };
  }, [selected]);

  const kind = selected?.layerKind;
  // Silence unused-var warning about `tick`: we only need it to trigger re-render.
  void tick;

  const setProp = (patch: Record<string, unknown>) => {
    if (!selected) return;
    selected.set(patch);
    canvas?.requestRenderAll();
    onChange();
  };

  return (
    <div className="top-toolbar">
      <div className="tt-group">
        <label className="btn" data-variant="primary">
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onImportFile(f);
              e.target.value = "";
            }}
            hidden
          />
          Import HTML
        </label>
        <button className="btn" onClick={props.onLoadSample} disabled={busy}>
          Load Sample
        </button>
      </div>

      <div className="tt-sep" />

      <div className="tt-group">
        <button className="btn" onClick={props.onAddText} title="Add text (T)">+ Text</button>
        <button className="btn" onClick={props.onAddRect} title="Add rectangle">+ Rect</button>
        <label className="btn" title="Add image">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onAddImage(f);
              e.target.value = "";
            }}
            hidden
          />
          + Image
        </label>
      </div>

      <div className="tt-sep" />

      <div className="tt-group">
        <button className="btn" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button className="btn" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>

      {selected ? <div className="tt-sep" /> : null}

      {kind === "text" ? <TextTools selected={selected as Textbox & LayeredObject} setProp={setProp} /> : null}
      {kind === "rect" ? <RectTools selected={selected as (Rect | Path) & LayeredObject} setProp={setProp} /> : null}

      <div className="tt-spacer" />

      <div className="tt-group">
        <button className="btn" onClick={props.onExportJson}>Export JSON</button>
        <button className="btn" data-variant="primary" onClick={props.onExportPng}>
          Export PNG
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Text formatting tools
 * ────────────────────────────────────────────────────────────────────── */

function TextTools({
  selected,
  setProp,
}: {
  selected: Textbox & LayeredObject;
  setProp: (patch: Record<string, unknown>) => void;
}) {
  const family = (selected.fontFamily as string) ?? "sans-serif";
  const size = selected.fontSize ?? 16;
  const weight = String(selected.fontWeight ?? 400);
  const italic = selected.fontStyle === "italic";
  const underline = !!selected.underline;
  const align = selected.textAlign ?? "left";
  const color = typeof selected.fill === "string" ? selected.fill : "#ffffff";
  return (
    <div className="tt-group text-tools">
      <select
        className="tt-select"
        value={family}
        onChange={(e) => setProp({ fontFamily: e.target.value })}
        title="Font"
      >
        {[family, ...FONT_FAMILIES.filter((f) => f !== family)].map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <div className="tt-step">
        <button className="btn sq" onClick={() => setProp({ fontSize: Math.max(4, size - 2) })}>−</button>
        <input
          type="number"
          className="tt-num"
          value={Math.round(size)}
          onChange={(e) => setProp({ fontSize: Number(e.target.value) || size })}
        />
        <button className="btn sq" onClick={() => setProp({ fontSize: size + 2 })}>+</button>
      </div>
      <select
        className="tt-select narrow"
        value={weight}
        onChange={(e) => setProp({ fontWeight: Number(e.target.value) })}
        title="Weight"
      >
        {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
      </select>
      <button
        className={`btn sq${italic ? " active" : ""}`}
        onClick={() => setProp({ fontStyle: italic ? "normal" : "italic" })}
        title="Italic"
      >
        <i>I</i>
      </button>
      <button
        className={`btn sq${underline ? " active" : ""}`}
        onClick={() => setProp({ underline: !underline })}
        title="Underline"
      >
        <u>U</u>
      </button>
      <div className="tt-group compact">
        {(["left", "center", "right", "justify"] as const).map((a) => (
          <button
            key={a}
            className={`btn sq${align === a ? " active" : ""}`}
            onClick={() => setProp({ textAlign: a })}
            title={`Align ${a}`}
          >
            {a === "left" ? "⯇" : a === "right" ? "⯈" : a === "center" ? "☰" : "≡"}
          </button>
        ))}
      </div>
      <label className="tt-color" title="Color">
        <input
          type="color"
          value={toHex(color)}
          onChange={(e) => setProp({ fill: e.target.value })}
        />
      </label>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Shape formatting tools
 * ────────────────────────────────────────────────────────────────────── */

function RectTools({
  selected,
  setProp,
}: {
  selected: (Rect | Path) & LayeredObject;
  setProp: (patch: Record<string, unknown>) => void;
}) {
  const fillRaw = selected.fill;
  const fillColor = typeof fillRaw === "string" ? fillRaw : "#4f8cff";
  const stroke = (selected.stroke as string) ?? "";
  const strokeWidth = selected.strokeWidth ?? 0;
  const rx =
    selected instanceof Rect
      ? ((selected.rx as number) ?? 0)
      : 0;

  return (
    <div className="tt-group shape-tools">
      <label className="tt-color" title="Fill">
        <span className="lbl">Fill</span>
        <input
          type="color"
          value={toHex(fillColor)}
          onChange={(e) => setProp({ fill: e.target.value })}
        />
      </label>
      <label className="tt-color" title="Stroke">
        <span className="lbl">Border</span>
        <input
          type="color"
          value={toHex(stroke || "#000000")}
          onChange={(e) => setProp({ stroke: e.target.value })}
        />
      </label>
      <div className="tt-step" title="Border width">
        <span className="lbl">W</span>
        <input
          type="number"
          className="tt-num"
          value={Math.round(strokeWidth)}
          onChange={(e) => setProp({ strokeWidth: Number(e.target.value) })}
        />
      </div>
      {selected instanceof Rect ? (
        <div className="tt-step" title="Corner radius">
          <span className="lbl">R</span>
          <input
            type="number"
            className="tt-num"
            value={Math.round(rx)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setProp({ rx: v, ry: v });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function toHex(color: string): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color.length === 4 ? hex4to7(color) : color.slice(0, 7);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r ?? 0)}${h(g ?? 0)}${h(b ?? 0)}`;
}

function hex4to7(s: string) {
  return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
}
