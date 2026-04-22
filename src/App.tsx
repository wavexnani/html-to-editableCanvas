import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, FabricImage } from "fabric";
import { TopToolbar } from "./components/TopToolbar";
import { LayersPanel } from "./components/LayersPanel";
import { Inspector } from "./components/Inspector";
import { BottomBar } from "./components/BottomBar";
import { EditorCanvas, type EditorCanvasHandle } from "./components/EditorCanvas";
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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [, setChangeTick] = useState(0);
  const bump = useCallback(() => setChangeTick((t) => t + 1), []);

  const getCanvas = (): Canvas | null => editorRef.current?.canvas ?? null;

  const doImport = useCallback(async (html: string, label: string) => {
    setBusy(true);
    setStatus(`Rendering ${label}…`);
    let result: ImportResult | null = null;
    try {
      result = await importHtml(html);
      setStatus(
        `${label}: ${result.scene.layers.length} layers · ${Math.round(result.scene.width)}×${Math.round(result.scene.height)}px`,
      );
      setScene(result.scene);
      await editorRef.current?.loadScene(result.scene);
      bump();
    } catch (err) {
      console.error(err);
      setStatus(`Import failed: ${(err as Error).message}`);
    } finally {
      disposeImport(result);
      setBusy(false);
    }
  }, [bump]);

  const handleImportFile = useCallback(async (file: File) => {
    const html = await readFileAsText(file);
    await doImport(html, file.name);
  }, [doImport]);

  const handleLoadSample = useCallback(async () => {
    await doImport(sampleHtml, "classswipe_v9.html");
  }, [doImport]);

  const handleAddText = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const layer = await layerToFabric({
      id: `t_new_${Date.now()}`,
      kind: "text",
      name: "New text",
      x: 60,
      y: 60,
      width: 320,
      height: 80,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: "New text",
      fontFamily: "Syne",
      fontSize: 40,
      fontWeight: 700,
      fontStyle: "normal",
      color: "#f2f4f7",
      letterSpacing: 0,
      lineHeight: 1.15,
      textAlign: "left",
      textTransform: "none",
      textDecoration: "none",
    });
    canvas.add(layer);
    canvas.setActiveObject(layer);
    canvas.requestRenderAll();
    setSelected(layer);
    bump();
  }, [bump]);

  const handleAddRect = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const layer = await layerToFabric({
      id: `r_new_${Date.now()}`,
      kind: "rect",
      name: "Rectangle",
      x: 100,
      y: 100,
      width: 260,
      height: 160,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: { type: "solid", color: "#4f8cff" },
      stroke: null,
      radius: { tl: 16, tr: 16, br: 16, bl: 16 },
    });
    canvas.add(layer);
    canvas.setActiveObject(layer);
    canvas.requestRenderAll();
    setSelected(layer);
    bump();
  }, [bump]);

  const handleAddImage = useCallback(async (file: File) => {
    const canvas = getCanvas();
    if (!canvas) return;
    const src = await readFileAsDataUrl(file);
    const img = await FabricImage.fromURL(src);
    img.set({ left: 60, top: 60 });
    const maxW = 600;
    if ((img.width ?? 0) > maxW) {
      const s = maxW / (img.width ?? 1);
      img.scale(s);
    }
    (img as LayeredObject).layerKind = "image";
    (img as LayeredObject).layerName = file.name || "image";
    (img as LayeredObject).layerId = `i_new_${Date.now()}`;
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    setSelected(img as LayeredObject);
    bump();
  }, [bump]);

  const handleExportPng = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const w = scene?.width ?? canvas.getWidth();
    const h = scene?.height ?? canvas.getHeight();
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
      width: w,
      height: h,
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
    const json = canvas.toObject(["layerId", "layerKind", "layerName", "isBackground"]);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "design.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, []);

  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const onRemoved = () => setSelected((s) => (s && !canvas.getObjects().includes(s) ? null : s));
    canvas.on("object:removed", onRemoved);
    return () => {
      canvas.off("object:removed", onRemoved);
    };
  });

  const rerender = useCallback(() => {
    editorRef.current?.canvas?.requestRenderAll();
    bump();
  }, [bump]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">⌘</span>
          <strong>HTML → Editable Canvas</strong>
          <span className="muted small">v2 · Canva-grade vector extractor</span>
        </div>
      </header>

      <TopToolbar
        canvas={getCanvas()}
        selected={selected}
        onChange={rerender}
        onImportFile={handleImportFile}
        onLoadSample={handleLoadSample}
        onAddText={handleAddText}
        onAddRect={handleAddRect}
        onAddImage={handleAddImage}
        onExportPng={handleExportPng}
        onExportJson={handleExportJson}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        canUndo={canUndo}
        canRedo={canRedo}
        busy={busy}
      />

      <main className="app-main">
        <LayersPanel
          canvas={getCanvas()}
          selected={selected}
          onSelect={setSelected}
          onChange={rerender}
        />
        <EditorCanvas
          ref={editorRef}
          onSelectionChange={setSelected}
          onHistoryChange={(u, r) => {
            setCanUndo(u);
            setCanRedo(r);
          }}
          onZoomChange={setZoom}
        />
        <Inspector canvas={getCanvas()} selected={selected} onChange={rerender} />
      </main>

      <BottomBar
        zoom={zoom}
        onZoomIn={() => editorRef.current?.zoomIn()}
        onZoomOut={() => editorRef.current?.zoomOut()}
        onZoomFit={() => editorRef.current?.zoomToFit()}
        onZoomReset={() => editorRef.current?.zoomReset()}
        status={busy ? `${status}` : status}
      />
    </div>
  );
}
