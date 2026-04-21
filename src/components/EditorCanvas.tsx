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

export interface EditorCanvasHandle {
  canvas: Canvas | null;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  loadScene: (scene: Scene) => Promise<void>;
}

interface Props {
  onSelectionChange: (selected: LayeredObject | null) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

export const EditorCanvas = forwardRef<EditorCanvasHandle, Props>(function EditorCanvas(
  { onSelectionChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });

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

    const emitSelection = () => {
      const active = canvas.getActiveObject() as LayeredObject | null;
      onSelectionChange(active ?? null);
    };
    canvas.on("selection:created", emitSelection);
    canvas.on("selection:updated", emitSelection);
    canvas.on("selection:cleared", () => onSelectionChange(null));

    // Pan with space or middle mouse
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

    // Wheel zoom (ctrl/cmd + wheel), otherwise pan
    const onWheel = (e: TPointerEventInfo<WheelEvent>) => {
      const evt = e.e;
      if (evt.ctrlKey || evt.metaKey) {
        evt.preventDefault();
        evt.stopPropagation();
        const delta = evt.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
        canvas.zoomToPoint(new Point(evt.offsetX, evt.offsetY), zoom);
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
    };
  }, [onSelectionChange]);

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
      if (!canvas) return;
      const active = canvas.getActiveObject();
      const target = e.target as HTMLElement | null;
      const typingInField =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typingInField) return;
      if ((e.key === "Delete" || e.key === "Backspace") && active) {
        const activeObjects = canvas.getActiveObjects() as FabricObject[];
        activeObjects.forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && active) {
        e.preventDefault();
        active.clone().then((clone: FabricObject) => {
          clone.set({ left: (active.left ?? 0) + 16, top: (active.top ?? 0) + 16 });
          canvas.add(clone);
          canvas.setActiveObject(clone);
          canvas.requestRenderAll();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fitScene = useCallback((sceneWidth: number, sceneHeight: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const pad = 48;
    const scale = Math.min(
      (size.width - pad) / sceneWidth,
      (size.height - pad) / sceneHeight,
      1,
    );
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    canvas.setZoom(zoom);
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] = (size.width - sceneWidth * zoom) / 2;
      vpt[5] = (size.height - sceneHeight * zoom) / 2;
      canvas.setViewportTransform(vpt);
    }
    canvas.requestRenderAll();
  }, [size]);

  useImperativeHandle(ref, () => ({
    get canvas() {
      return fabricRef.current;
    },
    zoomIn: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const zoom = Math.min(MAX_ZOOM, canvas.getZoom() * 1.2);
      canvas.zoomToPoint(new Point(size.width / 2, size.height / 2), zoom);
    },
    zoomOut: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const zoom = Math.max(MIN_ZOOM, canvas.getZoom() / 1.2);
      canvas.zoomToPoint(new Point(size.width / 2, size.height / 2), zoom);
    },
    zoomToFit: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      fitScene(canvas.getWidth(), canvas.getHeight());
    },
    loadScene: async (scene) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      await loadScene(canvas, scene);
      canvas.setDimensions({ width: size.width, height: size.height }, { cssOnly: false });
      fitScene(scene.width, scene.height);
    },
  }));

  return (
    <div ref={containerRef} className="editor-canvas-host">
      <canvas ref={canvasElRef} />
    </div>
  );
});
