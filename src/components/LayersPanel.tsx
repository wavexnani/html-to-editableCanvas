import { useEffect, useState } from "react";
import type { Canvas } from "fabric";
import type { LayeredObject } from "../lib/sceneToFabric";

interface Props {
  canvas: Canvas | null;
  /** The currently-selected Fabric object, or null. */
  selected: LayeredObject | null;
  /** Called when a layer is clicked → the app should update its selection. */
  onSelect: (obj: LayeredObject | null) => void;
  /** Called whenever layer state was mutated (z-order, visibility, lock, rename). */
  onChange: () => void;
}

interface LayerEntry {
  obj: LayeredObject;
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  locked: boolean;
}

const KIND_ICON: Record<string, string> = {
  text: "T",
  rect: "▭",
  image: "🖼",
};

export function LayersPanel({ canvas, selected, onSelect, onChange }: Props) {
  const [entries, setEntries] = useState<LayerEntry[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const rebuild = () => {
    if (!canvas) {
      setEntries([]);
      return;
    }
    // Top-of-list = on top of canvas (visually) → reverse fabric order.
    const objs = canvas.getObjects() as LayeredObject[];
    const list: LayerEntry[] = objs
      .slice()
      .reverse()
      .map((o, i) => ({
        obj: o,
        id: o.layerId ?? `idx-${i}`,
        name: o.layerName ?? o.layerKind ?? "object",
        kind: o.layerKind ?? "object",
        visible: o.visible !== false,
        locked: !(o.selectable ?? true),
      }));
    setEntries(list);
  };

  useEffect(() => {
    if (!canvas) return;
    rebuild();
    const h = () => rebuild();
    canvas.on("object:added", h);
    canvas.on("object:removed", h);
    canvas.on("object:modified", h);
    return () => {
      canvas.off("object:added", h);
      canvas.off("object:removed", h);
      canvas.off("object:modified", h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  const toggleVisibility = (entry: LayerEntry) => {
    entry.obj.set({ visible: !entry.visible });
    canvas?.requestRenderAll();
    onChange();
    rebuild();
  };

  const toggleLock = (entry: LayerEntry) => {
    const next = !entry.locked;
    entry.obj.set({
      selectable: !next,
      evented: !next,
      lockMovementX: next,
      lockMovementY: next,
      lockRotation: next,
      lockScalingX: next,
      lockScalingY: next,
    });
    if (next && selected === entry.obj) {
      canvas?.discardActiveObject();
      onSelect(null);
    }
    canvas?.requestRenderAll();
    onChange();
    rebuild();
  };

  const rename = (entry: LayerEntry, name: string) => {
    entry.obj.layerName = name;
    setRenaming(null);
    onChange();
    rebuild();
  };

  const selectLayer = (entry: LayerEntry) => {
    if (entry.locked) return;
    canvas?.setActiveObject(entry.obj);
    canvas?.requestRenderAll();
    onSelect(entry.obj);
  };

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: string) => {
    if (!canvas || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const objs = canvas.getObjects() as LayeredObject[];
    const drag = objs.find((o) => o.layerId === dragId);
    const target = objs.find((o) => o.layerId === targetId);
    if (!drag || !target) {
      setDragId(null);
      return;
    }
    const idx = objs.indexOf(target);
    canvas.remove(drag);
    canvas.insertAt(idx, drag);
    canvas.requestRenderAll();
    setDragId(null);
    onChange();
    rebuild();
  };

  return (
    <aside className="layers-panel" aria-label="Layers">
      <div className="panel-header">
        <h3>Layers</h3>
        <span className="tag">{entries.length}</span>
      </div>
      <div className="layers-list" role="listbox">
        {entries.length === 0 ? (
          <div className="muted small pad">No layers yet. Import a design or add a shape.</div>
        ) : null}
        {entries.map((entry) => {
          const isSelected = selected === entry.obj;
          return (
            <div
              key={entry.id}
              className={`layer-item${isSelected ? " is-selected" : ""}${entry.locked ? " is-locked" : ""}`}
              role="option"
              aria-selected={isSelected}
              draggable
              onDragStart={() => onDragStart(entry.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(entry.id)}
              onClick={() => selectLayer(entry)}
            >
              <span className="kind" title={entry.kind}>{KIND_ICON[entry.kind] ?? "?"}</span>
              {renaming === entry.id ? (
                <input
                  autoFocus
                  className="rename-input"
                  defaultValue={entry.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => rename(entry, e.target.value || entry.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(entry, (e.target as HTMLInputElement).value || entry.name);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span
                  className="name"
                  title={entry.name}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenaming(entry.id);
                  }}
                >
                  {entry.name}
                </span>
              )}
              <button
                className="icon-btn"
                title={entry.visible ? "Hide" : "Show"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(entry);
                }}
              >
                {entry.visible ? "👁" : "◌"}
              </button>
              <button
                className="icon-btn"
                title={entry.locked ? "Unlock" : "Lock"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(entry);
                }}
              >
                {entry.locked ? "🔒" : "🔓"}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
