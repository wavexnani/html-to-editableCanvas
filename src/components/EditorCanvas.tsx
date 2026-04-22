import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Canvas, FabricObject, Point, TPointerEventInfo } from "fabric";
import type { Scene } from "../types";
import { loadScene, type LayeredObject } from "../lib/sceneToFabric";
import { createHistory, type HistoryHandle } from "../lib/history";

export interface EditorCanvasHandle {
  canvas: Canvas | null;
  history: HistoryHandle | null;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomReset: () => void;
  loadScene: (scene: Scene) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface Props {
  onSelectionChange: (selected: LayeredObject | null) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 6;

export const EditorCanvas = forwardRef<EditorCanvasHandle, Props>(function EditorCanvas(
  { onSelectionChange, onHistoryChange, onZoomChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const historyRef = useRef<HistoryHandle | null>(null);
  const sceneSizeRef = useRef<{ w: number; h: number }>({ w: 1200, h: 800 });
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [zoom, setZoom] = useState(1);

  // Resize observer keeps Fabric sized to the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new Canvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: "#1a1d24",
    });
    fabricRef.current = canvas;

    const history = createHistory(canvas);
    historyRef.current = history;
    history.subscribe(() => onHistoryChange?.(history.canUndo(), history.canRedo()));

    const emitSelection = () => {
      const active = canvas.getActiveObject() as LayeredObject | null;
      onSelectionChange(active ?? null);
    };
    canvas.on("selection:created", emitSelection);
    canvas.on("selection:updated", emitSelection);
    canvas.on("selection:cleared", () => onSelectionChange(null));

    // Pan with Alt/middle-mouse
    let isPanning = false;
    let lastPoint: Point | null = null;
    const onMouseDown = (e: TPointerEventInfo) => {
      const evt = e.e as MouseEvent;
      if (evt.button === 1 || evt.altKey) {
        isPanning = true;
        canvas.selection = false;
        lastPoint = new Point(evt.clientX, evt.clientY);
        canvas.defaultCursor = "grabbing";
      }
    };
    const onMouseMove = (e: TPointerEventInfo) => {
      if (!isPanning || !lastPoint) return;
      const evt = e.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] += evt.clientX - lastPoint.x;
      vpt[5] += evt.clientY - lastPoint.y;
      canvas.requestRenderAll();
      lastPoint = new Point(evt.clientX, evt.clientY);
    };
    const onMouseUp = () => {
      isPanning = false;
      lastPoint = null;
      canvas.selection = true;
      canvas.defaultCursor = "default";
    };
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    // Wheel zoom / pan
    const onWheel = (e: TPointerEventInfo<WheelEvent>) => {
      const evt = e.e;
      if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault();
        evt.stopPropagation();
        const delta = evt.deltaY;
        let z = canvas.getZoom();
        z *= 0.999 ** delta;
        z = Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
        canvas.zoomToPoint(new Point(evt.offsetX, evt.offsetY), z);
        setZoom(z);
        onZoomChange?.(z);
      } else {
        evt.preventDefault();
        const vpt = canvas.viewportTransform;
        if (!vpt) return;
        vpt[4] -= evt.deltaX;
        vpt[5] -= evt.deltaY;
        canvas.requestRenderAll();
      }
    };
    canvas.on("mouse:wheel", onWheel);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
      historyRef.current = null;
    };
  }, [onSelectionChange, onHistoryChange, onZoomChange]);

  // Keep Fabric canvas element sized to container.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: size.width, height: size.height }, { cssOnly: false });
    canvas.requestRenderAll();
  }, [size]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const canvas = fabricRef.current;
      const history = historyRef.current;
      if (!canvas) return;
      const target = e.target as HTMLElement | null;
      const typingInField =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typingInField) return;
      const active = canvas.getActiveObject();

      const meta = e.ctrlKey || e.metaKey;

      // Undo / Redo — always available.
      if (meta && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        history?.undo();
        return;
      }
      if (meta && ((e.key === "z" || e.key === "Z") && e.shiftKey)) {
        e.preventDefault();
        history?.redo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        history?.redo();
        return;
      }

      if (!active) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const actives = canvas.getActiveObjects() as FabricObject[];
        actives.forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return;
      }
      if (meta && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        active.clone().then((clone: FabricObject) => {
          clone.set({ left: (active.left ?? 0) + 16, top: (active.top ?? 0) + 16 });
          const src = active as LayeredObject;
          (clone as LayeredObject).layerId = `${src.layerId ?? "obj"}_copy_${Date.now().toString(36)}`;
          (clone as LayeredObject).layerKind = src.layerKind;
          (clone as LayeredObject).layerName = (src.layerName ?? "object") + " copy";
          canvas.add(clone);
          canvas.setActiveObject(clone);
          canvas.requestRenderAll();
        });
        return;
      }
      // z-order
      if (meta && e.key === "]") {
        e.preventDefault();
        if (e.shiftKey) canvas.bringObjectToFront(active);
        else canvas.bringObjectForward(active);
        canvas.requestRenderAll();
        return;
      }
      if (meta && e.key === "[") {
        e.preventDefault();
        if (e.shiftKey) canvas.sendObjectToBack(active);
        else canvas.sendObjectBackwards(active);
        canvas.requestRenderAll();
        return;
      }

      // Arrow nudging
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        active.set({ top: (active.top ?? 0) - step });
        active.setCoords();
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: active });
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        active.set({ top: (active.top ?? 0) + step });
        active.setCoords();
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: active });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        active.set({ left: (active.left ?? 0) - step });
        active.setCoords();
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: active });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        active.set({ left: (active.left ?? 0) + step });
        active.setCoords();
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: active });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fitScene = useCallback((sceneWidth: number, sceneHeight: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const pad = 64;
    const scale = Math.min(
      (size.width - pad) / sceneWidth,
      (size.height - pad) / sceneHeight,
      1,
    );
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    canvas.setZoom(z);
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] = (size.width - sceneWidth * z) / 2;
      vpt[5] = (size.height - sceneHeight * z) / 2;
      canvas.setViewportTransform(vpt);
    }
    canvas.requestRenderAll();
    setZoom(z);
    onZoomChange?.(z);
  }, [size, onZoomChange]);

  useImperativeHandle(ref, () => ({
    get canvas() {
      return fabricRef.current;
    },
    get history() {
      return historyRef.current;
    },
    get zoom() {
      return zoom;
    },
    zoomIn: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const z = Math.min(MAX_ZOOM, canvas.getZoom() * 1.2);
      canvas.zoomToPoint(new Point(size.width / 2, size.height / 2), z);
      setZoom(z);
      onZoomChange?.(z);
    },
    zoomOut: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const z = Math.max(MIN_ZOOM, canvas.getZoom() / 1.2);
      canvas.zoomToPoint(new Point(size.width / 2, size.height / 2), z);
      setZoom(z);
      onZoomChange?.(z);
    },
    zoomToFit: () => {
      fitScene(sceneSizeRef.current.w, sceneSizeRef.current.h);
    },
    zoomReset: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setZoom(1);
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] = (size.width - sceneSizeRef.current.w) / 2;
        vpt[5] = (size.height - sceneSizeRef.current.h) / 2;
        canvas.setViewportTransform(vpt);
      }
      canvas.requestRenderAll();
      setZoom(1);
      onZoomChange?.(1);
    },
    loadScene: async (scene) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const history = historyRef.current;
      if (history) {
        await history.suspend(async () => {
          await loadScene(canvas, scene);
        });
        history.clear();
      } else {
        await loadScene(canvas, scene);
      }
      canvas.setDimensions({ width: size.width, height: size.height }, { cssOnly: false });
      sceneSizeRef.current = { w: scene.width, h: scene.height };
      fitScene(scene.width, scene.height);
    },
    undo: async () => {
      await historyRef.current?.undo();
    },
    redo: async () => {
      await historyRef.current?.redo();
    },
  }));

  return (
    <div ref={containerRef} className="editor-canvas-host">
      <canvas ref={canvasElRef} />
    </div>
  );
});
