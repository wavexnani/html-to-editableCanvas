import { useEffect, useState } from "react";
import { Canvas, Rect, Textbox } from "fabric";
import type { LayeredObject } from "../lib/sceneToFabric";

interface Props {
  canvas: Canvas | null;
  selected: LayeredObject | null;
  onChange: () => void;
}

interface TextProps {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fill: string;
  textAlign: string;
}

interface RectProps {
  fill: string;
  stroke: string;
  strokeWidth: number;
  rx: number;
}

interface CommonProps {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
}

function readCommon(obj: LayeredObject): CommonProps {
  return {
    x: Math.round(obj.left ?? 0),
    y: Math.round(obj.top ?? 0),
    width: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
    height: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
    angle: Math.round(obj.angle ?? 0),
    opacity: obj.opacity ?? 1,
  };
}

function readText(obj: LayeredObject): TextProps {
  const t = obj as Textbox;
  return {
    text: t.text ?? "",
    fontFamily: t.fontFamily ?? "sans-serif",
    fontSize: t.fontSize ?? 16,
    fontWeight: String(t.fontWeight ?? 400),
    fill: (t.fill as string) ?? "#ffffff",
    textAlign: t.textAlign ?? "left",
  };
}

function readRect(obj: LayeredObject): RectProps {
  const r = obj as Rect;
  return {
    fill: (r.fill as string) ?? "#ffffff",
    stroke: (r.stroke as string) ?? "",
    strokeWidth: r.strokeWidth ?? 0,
    rx: (r.rx as number) ?? 0,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function PropertyPanel({ canvas, selected, onChange }: Props) {
  const [common, setCommon] = useState<CommonProps | null>(null);
  const [text, setText] = useState<TextProps | null>(null);
  const [rect, setRect] = useState<RectProps | null>(null);

  useEffect(() => {
    if (!selected) {
      setCommon(null);
      setText(null);
      setRect(null);
      return;
    }
    setCommon(readCommon(selected));
    setText(selected.layerKind === "text" ? readText(selected) : null);
    setRect(selected.layerKind === "rect" ? readRect(selected) : null);

    const update = () => setCommon(readCommon(selected));
    selected.on("moving", update);
    selected.on("scaling", update);
    selected.on("rotating", update);
    return () => {
      selected.off("moving", update);
      selected.off("scaling", update);
      selected.off("rotating", update);
    };
  }, [selected]);

  if (!selected || !common) {
    return (
      <aside className="property-panel">
        <h3>Properties</h3>
        <p className="muted">Select an element to edit.</p>
        <div className="hints">
          <h4>Shortcuts</h4>
          <ul>
            <li><code>Alt + drag</code> or middle-mouse — pan</li>
            <li><code>Ctrl/Cmd + wheel</code> — zoom</li>
            <li><code>Delete</code> — remove selection</li>
            <li><code>Ctrl/Cmd + D</code> — duplicate</li>
            <li>Double-click text to edit inline</li>
          </ul>
        </div>
      </aside>
    );
  }

  const commit = () => {
    canvas?.requestRenderAll();
    onChange();
  };

  const setC = <K extends keyof CommonProps>(k: K, v: CommonProps[K]) => {
    setCommon((c) => (c ? { ...c, [k]: v } : c));
    if (k === "x") selected.set({ left: v as number });
    if (k === "y") selected.set({ top: v as number });
    if (k === "width") selected.set({ scaleX: (v as number) / (selected.width || 1) });
    if (k === "height") selected.set({ scaleY: (v as number) / (selected.height || 1) });
    if (k === "angle") selected.set({ angle: v as number });
    if (k === "opacity") selected.set({ opacity: v as number });
    selected.setCoords();
    commit();
  };

  const setT = <K extends keyof TextProps>(k: K, v: TextProps[K]) => {
    setText((t) => (t ? { ...t, [k]: v } : t));
    if (selected.layerKind !== "text") return;
    const t = selected as Textbox;
    const map: Record<keyof TextProps, string> = {
      text: "text",
      fontFamily: "fontFamily",
      fontSize: "fontSize",
      fontWeight: "fontWeight",
      fill: "fill",
      textAlign: "textAlign",
    };
    t.set({ [map[k]]: k === "fontSize" ? Number(v) : v });
    commit();
  };

  const setR = <K extends keyof RectProps>(k: K, v: RectProps[K]) => {
    setRect((r) => (r ? { ...r, [k]: v } : r));
    if (selected.layerKind !== "rect") return;
    const r = selected as Rect;
    if (k === "rx") r.set({ rx: Number(v), ry: Number(v) });
    else if (k === "strokeWidth") r.set({ strokeWidth: Number(v) });
    else r.set({ [k]: v });
    commit();
  };

  return (
    <aside className="property-panel">
      <h3>
        Properties <span className="tag">{selected.layerKind ?? "object"}</span>
      </h3>

      <div className="prop-grid">
        <Row label="X"><input type="number" value={common.x} onChange={(e) => setC("x", Number(e.target.value))} /></Row>
        <Row label="Y"><input type="number" value={common.y} onChange={(e) => setC("y", Number(e.target.value))} /></Row>
        <Row label="W"><input type="number" value={common.width} onChange={(e) => setC("width", Number(e.target.value))} /></Row>
        <Row label="H"><input type="number" value={common.height} onChange={(e) => setC("height", Number(e.target.value))} /></Row>
        <Row label="Angle"><input type="number" value={common.angle} onChange={(e) => setC("angle", Number(e.target.value))} /></Row>
        <Row label="Opacity">
          <input type="range" min={0} max={1} step={0.05} value={common.opacity} onChange={(e) => setC("opacity", Number(e.target.value))} />
        </Row>
      </div>

      {text && (
        <>
          <h4>Text</h4>
          <Row label="Content">
            <textarea rows={3} value={text.text} onChange={(e) => setT("text", e.target.value)} />
          </Row>
          <Row label="Font">
            <input type="text" value={text.fontFamily} onChange={(e) => setT("fontFamily", e.target.value)} />
          </Row>
          <Row label="Size">
            <input type="number" value={text.fontSize} onChange={(e) => setT("fontSize", Number(e.target.value))} />
          </Row>
          <Row label="Weight">
            <select value={text.fontWeight} onChange={(e) => setT("fontWeight", e.target.value)}>
              <option value="300">Light (300)</option>
              <option value="400">Regular (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">SemiBold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">ExtraBold (800)</option>
            </select>
          </Row>
          <Row label="Color">
            <input type="color" value={toHex(text.fill)} onChange={(e) => setT("fill", e.target.value)} />
          </Row>
          <Row label="Align">
            <select value={text.textAlign} onChange={(e) => setT("textAlign", e.target.value)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </Row>
        </>
      )}

      {rect && (
        <>
          <h4>Shape</h4>
          <Row label="Fill">
            <input type="color" value={toHex(rect.fill)} onChange={(e) => setR("fill", e.target.value)} />
          </Row>
          <Row label="Stroke">
            <input type="color" value={toHex(rect.stroke || "#000000")} onChange={(e) => setR("stroke", e.target.value)} />
          </Row>
          <Row label="Stroke W">
            <input type="number" value={rect.strokeWidth} onChange={(e) => setR("strokeWidth", Number(e.target.value))} />
          </Row>
          <Row label="Radius">
            <input type="number" value={rect.rx} onChange={(e) => setR("rx", Number(e.target.value))} />
          </Row>
        </>
      )}
    </aside>
  );
}

/**
 * Best-effort convert rgb()/rgba()/hex color strings to a #rrggbb value for
 * <input type="color">.
 */
function toHex(color: string): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color.length === 7 ? color : color;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
