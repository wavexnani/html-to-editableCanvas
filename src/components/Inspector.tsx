import { useEffect, useState } from "react";
import type { Canvas, FabricObject } from "fabric";
import { Rect, Shadow as FabricShadow, Textbox } from "fabric";
import type { LayeredObject } from "../lib/sceneToFabric";

interface Props {
  canvas: Canvas | null;
  selected: LayeredObject | null;
  onChange: () => void;
}

interface Common {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  opacity: number;
}

function readCommon(obj: LayeredObject): Common {
  return {
    x: Math.round(obj.left ?? 0),
    y: Math.round(obj.top ?? 0),
    w: Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)),
    h: Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)),
    angle: Math.round(obj.angle ?? 0),
    opacity: obj.opacity ?? 1,
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

export function Inspector({ canvas, selected, onChange }: Props) {
  const [common, setCommon] = useState<Common | null>(null);
  const [textContent, setTextContent] = useState<string>("");
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowBlur, setShadowBlur] = useState(0);
  const [shadowOffX, setShadowOffX] = useState(0);
  const [shadowOffY, setShadowOffY] = useState(0);

  useEffect(() => {
    if (!selected) {
      setCommon(null);
      setTextContent("");
      return;
    }
    setCommon(readCommon(selected));
    if (selected.layerKind === "text") {
      setTextContent((selected as Textbox).text ?? "");
    }
    const sh = selected.shadow;
    if (sh && typeof sh === "object") {
      setShadowColor((sh.color as string) || "#000000");
      setShadowBlur((sh.blur as number) || 0);
      setShadowOffX((sh.offsetX as number) || 0);
      setShadowOffY((sh.offsetY as number) || 0);
    } else {
      setShadowColor("#000000");
      setShadowBlur(0);
      setShadowOffX(0);
      setShadowOffY(0);
    }
    const update = () => setCommon(readCommon(selected));
    selected.on("moving", update);
    selected.on("scaling", update);
    selected.on("rotating", update);
    selected.on("modified", update);
    return () => {
      selected.off("moving", update);
      selected.off("scaling", update);
      selected.off("rotating", update);
      selected.off("modified", update);
    };
  }, [selected]);

  if (!selected || !common) {
    return (
      <aside className="inspector">
        <div className="panel-header"><h3>Inspector</h3></div>
        <p className="muted small pad">Select an element to edit.</p>
        <div className="hints pad">
          <h4>Shortcuts</h4>
          <ul>
            <li><code>Alt + drag</code> pan &middot; <code>Ctrl + wheel</code> zoom</li>
            <li><code>Del</code> delete &middot; <code>Ctrl+D</code> duplicate</li>
            <li><code>Ctrl+Z</code> / <code>Ctrl+Shift+Z</code> undo/redo</li>
            <li><code>Ctrl+]</code> / <code>Ctrl+[</code> raise / lower</li>
            <li>Arrow nudge; <code>Shift</code>+arrow = 10px</li>
          </ul>
        </div>
      </aside>
    );
  }

  const commit = () => {
    canvas?.requestRenderAll();
    onChange();
  };

  const setC = <K extends keyof Common>(k: K, v: Common[K]) => {
    setCommon((c) => (c ? { ...c, [k]: v } : c));
    if (k === "x") selected.set({ left: v as number });
    if (k === "y") selected.set({ top: v as number });
    if (k === "w") selected.set({ scaleX: (v as number) / (selected.width || 1) });
    if (k === "h") selected.set({ scaleY: (v as number) / (selected.height || 1) });
    if (k === "angle") selected.set({ angle: v as number });
    if (k === "opacity") selected.set({ opacity: v as number });
    selected.setCoords();
    commit();
  };

  const applyShadow = (patch: Partial<{ color: string; blur: number; offsetX: number; offsetY: number }>) => {
    const color = patch.color ?? shadowColor;
    const blur = patch.blur ?? shadowBlur;
    const offX = patch.offsetX ?? shadowOffX;
    const offY = patch.offsetY ?? shadowOffY;
    if (!color || (blur === 0 && offX === 0 && offY === 0)) {
      selected.set({ shadow: null });
    } else {
      selected.set({
        shadow: new FabricShadow({ color, blur, offsetX: offX, offsetY: offY }),
      });
    }
    commit();
  };

  const alignHoriz = (mode: "left" | "center" | "right") => {
    if (!canvas) return;
    const w = (selected.width ?? 0) * (selected.scaleX ?? 1);
    if (mode === "left") selected.set({ left: 0 });
    else if (mode === "center") selected.set({ left: (canvas.getWidth() - w) / 2 });
    else selected.set({ left: canvas.getWidth() - w });
    selected.setCoords();
    commit();
    setCommon(readCommon(selected));
  };

  const alignVert = (mode: "top" | "middle" | "bottom") => {
    if (!canvas) return;
    const h = (selected.height ?? 0) * (selected.scaleY ?? 1);
    if (mode === "top") selected.set({ top: 0 });
    else if (mode === "middle") selected.set({ top: (canvas.getHeight() - h) / 2 });
    else selected.set({ top: canvas.getHeight() - h });
    selected.setCoords();
    commit();
    setCommon(readCommon(selected));
  };

  const reorder = (direction: "front" | "back" | "forward" | "backward") => {
    if (!canvas) return;
    const obj = selected as unknown as FabricObject;
    if (direction === "front") canvas.bringObjectToFront(obj);
    else if (direction === "back") canvas.sendObjectToBack(obj);
    else if (direction === "forward") canvas.bringObjectForward(obj);
    else canvas.sendObjectBackwards(obj);
    commit();
  };

  return (
    <aside className="inspector">
      <div className="panel-header">
        <h3>Inspector</h3>
        <span className="tag">{selected.layerKind ?? "object"}</span>
      </div>

      <Section title="Position & size">
        <div className="prop-grid two">
          <Row label="X"><input type="number" value={common.x} onChange={(e) => setC("x", Number(e.target.value))} /></Row>
          <Row label="Y"><input type="number" value={common.y} onChange={(e) => setC("y", Number(e.target.value))} /></Row>
          <Row label="W"><input type="number" value={common.w} onChange={(e) => setC("w", Number(e.target.value))} /></Row>
          <Row label="H"><input type="number" value={common.h} onChange={(e) => setC("h", Number(e.target.value))} /></Row>
          <Row label="Angle"><input type="number" value={common.angle} onChange={(e) => setC("angle", Number(e.target.value))} /></Row>
          <Row label="Opacity">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={common.opacity}
              onChange={(e) => setC("opacity", Number(e.target.value))}
            />
          </Row>
        </div>
      </Section>

      <Section title="Alignment">
        <div className="btn-row">
          <button className="btn sq" onClick={() => alignHoriz("left")} title="Align left">⇤</button>
          <button className="btn sq" onClick={() => alignHoriz("center")} title="Align center">⇔</button>
          <button className="btn sq" onClick={() => alignHoriz("right")} title="Align right">⇥</button>
          <span className="sep" />
          <button className="btn sq" onClick={() => alignVert("top")} title="Align top">⇞</button>
          <button className="btn sq" onClick={() => alignVert("middle")} title="Align middle">⇕</button>
          <button className="btn sq" onClick={() => alignVert("bottom")} title="Align bottom">⇟</button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => reorder("front")}>Front</button>
          <button className="btn" onClick={() => reorder("forward")}>+1</button>
          <button className="btn" onClick={() => reorder("backward")}>−1</button>
          <button className="btn" onClick={() => reorder("back")}>Back</button>
        </div>
      </Section>

      {selected.layerKind === "text" ? (
        <Section title="Text">
          <Row label="Content">
            <textarea
              rows={4}
              value={textContent}
              onChange={(e) => {
                setTextContent(e.target.value);
                (selected as Textbox).set({ text: e.target.value });
                commit();
              }}
            />
          </Row>
          <TextKerning selected={selected as Textbox} commit={commit} />
        </Section>
      ) : null}

      {selected.layerKind === "rect" ? (
        <Section title="Shape">
          <Row label="Fill">
            <input
              type="color"
              value={toHex(selected.fill as string)}
              onChange={(e) => {
                (selected as Rect).set({ fill: e.target.value });
                commit();
              }}
            />
          </Row>
          <Row label="Stroke">
            <input
              type="color"
              value={toHex((selected.stroke as string) || "#000000")}
              onChange={(e) => {
                (selected as Rect).set({ stroke: e.target.value });
                commit();
              }}
            />
          </Row>
          <Row label="Stroke W">
            <input
              type="number"
              value={Math.round((selected.strokeWidth as number) ?? 0)}
              onChange={(e) => {
                (selected as Rect).set({ strokeWidth: Number(e.target.value) });
                commit();
              }}
            />
          </Row>
          {selected instanceof Rect ? (
            <Row label="Radius">
              <input
                type="number"
                value={Math.round((selected.rx as number) ?? 0)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  selected.set({ rx: v, ry: v });
                  commit();
                }}
              />
            </Row>
          ) : null}
        </Section>
      ) : null}

      <Section title="Shadow">
        <div className="prop-grid two">
          <Row label="Color">
            <input
              type="color"
              value={toHex(shadowColor)}
              onChange={(e) => {
                setShadowColor(e.target.value);
                applyShadow({ color: e.target.value });
              }}
            />
          </Row>
          <Row label="Blur">
            <input
              type="number"
              value={shadowBlur}
              onChange={(e) => {
                const v = Number(e.target.value);
                setShadowBlur(v);
                applyShadow({ blur: v });
              }}
            />
          </Row>
          <Row label="Off X">
            <input
              type="number"
              value={shadowOffX}
              onChange={(e) => {
                const v = Number(e.target.value);
                setShadowOffX(v);
                applyShadow({ offsetX: v });
              }}
            />
          </Row>
          <Row label="Off Y">
            <input
              type="number"
              value={shadowOffY}
              onChange={(e) => {
                const v = Number(e.target.value);
                setShadowOffY(v);
                applyShadow({ offsetY: v });
              }}
            />
          </Row>
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function TextKerning({ selected, commit }: { selected: Textbox; commit: () => void }) {
  const spacing = (selected.charSpacing ?? 0) / 1000; // back to em
  const lineHeight = selected.lineHeight ?? 1.16;
  return (
    <div className="prop-grid two">
      <Row label="Letter">
        <input
          type="number"
          step={0.01}
          value={Number(spacing.toFixed(3))}
          onChange={(e) => {
            selected.set({ charSpacing: Number(e.target.value) * 1000 });
            commit();
          }}
        />
      </Row>
      <Row label="Line H">
        <input
          type="number"
          step={0.05}
          value={Number(lineHeight.toFixed(2))}
          onChange={(e) => {
            selected.set({ lineHeight: Number(e.target.value) });
            commit();
          }}
        />
      </Row>
    </div>
  );
}

function toHex(color: string | null | undefined): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.slice(0, 7);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
  const h = (n: number) => (Number.isFinite(n) ? n : 0).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
