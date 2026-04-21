import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, Rect, Textbox } from "fabric";
import { Toolbar } from "./components/Toolbar";
import { EditorCanvas, type EditorCanvasHandle } from "./components/EditorCanvas";
import { PropertyPanel } from "./components/PropertyPanel";
import { importHtml, disposeImport, type ImportResult } from "./lib/htmlImporter";
import { layerToFabric, type LayeredObject } from "./lib/sceneToFabric";
import type { Scene } from "./types";
import sampleHtml from "./samples/classswipe_v9.html?raw";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function App() {
  const editorRef = useRef<EditorCanvasHandle | null>(null);
  const [selected, setSelected] = useState<LayeredObject | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("Import an HTML file or click Load Sample to begin.");
  const [scene, setScene] = useState<Scene | null>(null);

  const getCanvas = (): Canvas | null => editorRef.current?.canvas ?? null;

  const doImport = useCallback(async (html: string, label: string) => {
    setBusy(true);
    setStatus(`Rendering ${label}…`);
    let result: ImportResult | null = null;
    try {
      result = await importHtml(html);
      setStatus(`Extracted ${result.scene.layers.length} layers · ${result.scene.width}×${result.scene.height}px`);
      setScene(result.scene);
      await editorRef.current?.loadScene(result.scene);
    } catch (err) {
      console.error(err);
      setStatus(`Import failed: ${(err as Error).message}`);
    } finally {
      disposeImport(result);
      setBusy(false);
    }
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    const html = await readFileAsText(file);
    await doImport(html, file.name);
  }, [doImport]);

  const handleLoadSample = useCallback(async () => {
    await doImport(sampleHtml, "sample (ClassSwipe V9)");
  }, [doImport]);

  const handleAddText = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const layer = await layerToFabric({
      id: `t_new_${Date.now()}`,
      kind: "text",
      x: 40,
      y: 40,
      width: 280,
      height: 60,
      rotation: 0,
      text: "New text",
      fontFamily: "Inter, sans-serif",
      fontSize: 36,
      fontWeight: 600,
      fontStyle: "normal",
      color: "#ffffff",
      letterSpacing: 0,
      lineHeight: 1.2,
      textAlign: "left",
      opacity: 1,
    });
    canvas.add(layer);
    canvas.setActiveObject(layer);
    canvas.requestRenderAll();
    setSelected(layer);
  }, []);

  const handleAddRect = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const layer = await layerToFabric({
      id: `r_new_${Date.now()}`,
      kind: "rect",
      x: 80,
      y: 80,
      width: 220,
      height: 140,
      rotation: 0,
      fill: "#4f8cff",
      stroke: "",
      strokeWidth: 0,
      radius: 12,
      opacity: 1,
    });
    canvas.add(layer);
    canvas.setActiveObject(layer);
    canvas.requestRenderAll();
    setSelected(layer);
  }, []);

  const handleAddImage = useCallback(async (file: File) => {
    const canvas = getCanvas();
    if (!canvas) return;
    const src = await readFileAsDataUrl(file);
    const img = await FabricImage.fromURL(src);
    img.set({ left: 60, top: 60 });
    // Clamp to reasonable size
    const maxW = 600;
    if ((img.width ?? 0) > maxW) {
      const s = maxW / (img.width ?? 1);
      img.scale(s);
    }
    (img as LayeredObject).layerKind = "image";
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    setSelected(img as LayeredObject);
  }, []);

  const handleExportPng = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    if (!scene) {
      setStatus("Nothing to export — import a design first.");
      return;
    }
    // Export at logical scene size regardless of current zoom/viewport.
    const vpt = canvas.viewportTransform;
    const currentVpt: [number, number, number, number, number, number] | null = vpt
      ? [vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]
      : null;
    const currentZoom = canvas.getZoom();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);
    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 1,
      left: 0,
      top: 0,
      width: scene.width,
      height: scene.height,
    });
    if (currentVpt) canvas.setViewportTransform(currentVpt);
    canvas.setZoom(currentZoom);
    canvas.requestRenderAll();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "design.png";
    a.click();
  }, [scene]);

  const handleExportJson = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const json = canvas.toObject(["layerId", "layerKind", "isBackground"]);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "design.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, []);

  // Also expose a "delete selected" UX hint via a keyboard-only path (handled
  // in EditorCanvas). Clean up selection when object is removed.
  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const onRemoved = () => setSelected((s) => (s && !canvas.getObjects().includes(s) ? null : s));
    canvas.on("object:removed", onRemoved);
    return () => {
      canvas.off("object:removed", onRemoved);
    };
  });

  const forceRerender = useCallback(() => {
    // Used by PropertyPanel to notify us when selected object mutates.
    setSelected((s) => (s ? ({ ...s } as unknown as LayeredObject) : s));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <strong>HTML → Editable Canvas</strong>
          <span className="muted">Paste a design · edit like Canva · export</span>
        </div>
        <div className="status" aria-live="polite">
          {busy ? <span className="spinner" /> : null}
          <span>{status}</span>
        </div>
      </header>

      <Toolbar
        busy={busy}
        onImportFile={handleImportFile}
        onLoadSample={handleLoadSample}
        onAddText={handleAddText}
        onAddRect={handleAddRect}
        onAddImage={handleAddImage}
        onExportPng={handleExportPng}
        onExportJson={handleExportJson}
        onZoomIn={() => editorRef.current?.zoomIn()}
        onZoomOut={() => editorRef.current?.zoomOut()}
        onZoomFit={() => editorRef.current?.zoomToFit()}
      />

      <main className="app-main">
        <EditorCanvas ref={editorRef} onSelectionChange={setSelected} />
        <PropertyPanel canvas={getCanvas()} selected={selected} onChange={forceRerender} />
      </main>
    </div>
  );
}

// Prevent unused-import warnings for types used only indirectly.
export type { Textbox, Rect };
