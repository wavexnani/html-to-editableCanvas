import type { Canvas } from "fabric";

/**
 * Minimal undo/redo stack built on top of `canvas.toObject()`. We snapshot
 * the full canvas state as JSON on each mutation and restore via
 * `canvas.loadFromJSON`. Not the most efficient approach for very large
 * scenes but dead simple and correct.
 *
 * We stash `layerId`, `layerKind`, `layerName` in the serialized form so
 * that Layers panel state survives undo/redo.
 */

const PROPS = ["layerId", "layerKind", "layerName", "isBackground"];

export interface HistoryHandle {
  /** Take a snapshot and push it onto the stack. Clears the redo stack. */
  push: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  /** Temporarily suspend auto-snapshotting (e.g. during programmatic loads). */
  suspend: <T>(fn: () => Promise<T> | T) => Promise<T>;
  /** Current undo depth; useful for UI disabled state. */
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Subscribe to stack changes for UI updates. Returns an unsubscribe fn. */
  subscribe: (cb: () => void) => () => void;
}

export function createHistory(canvas: Canvas, limit = 80): HistoryHandle {
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let suspended = false;
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((cb) => cb());

  const snapshot = () => JSON.stringify(canvas.toObject(PROPS));

  let lastSnapshot = snapshot();

  const push = () => {
    if (suspended) return;
    const next = snapshot();
    if (next === lastSnapshot) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = next;
    notify();
  };

  const applySnapshot = async (json: string) => {
    suspended = true;
    try {
      await canvas.loadFromJSON(JSON.parse(json));
      canvas.renderAll();
      lastSnapshot = json;
    } finally {
      suspended = false;
    }
  };

  const undo = async () => {
    if (!undoStack.length) return;
    const prev = undoStack.pop()!;
    redoStack.push(lastSnapshot);
    await applySnapshot(prev);
    notify();
  };

  const redo = async () => {
    if (!redoStack.length) return;
    const next = redoStack.pop()!;
    undoStack.push(lastSnapshot);
    await applySnapshot(next);
    notify();
  };

  const clear = () => {
    undoStack.length = 0;
    redoStack.length = 0;
    lastSnapshot = snapshot();
    notify();
  };

  const suspend = async <T,>(fn: () => Promise<T> | T): Promise<T> => {
    suspended = true;
    try {
      const r = await fn();
      lastSnapshot = snapshot();
      return r;
    } finally {
      suspended = false;
    }
  };

  // Auto-snapshot on mutating events.
  const handler = () => push();
  canvas.on("object:modified", handler);
  canvas.on("object:added", handler);
  canvas.on("object:removed", handler);
  canvas.on("text:changed", handler);

  return {
    push,
    undo,
    redo,
    clear,
    suspend,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
