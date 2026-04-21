import { Canvas, FabricImage, FabricObject, Rect, Textbox } from "fabric";
import type { Layer, Scene } from "../types";

export interface LayeredObject extends FabricObject {
  layerId?: string;
  layerKind?: Layer["kind"];
  isBackground?: boolean;
}

/**
 * Load an image URL into a Fabric image object, preserving the layer id.
 */
async function buildImage(src: string): Promise<FabricImage> {
  return FabricImage.fromURL(src, { crossOrigin: "anonymous" });
}

export async function layerToFabric(layer: Layer): Promise<LayeredObject> {
  let obj: LayeredObject;
  switch (layer.kind) {
    case "text": {
      const t = new Textbox(layer.text, {
        left: layer.x,
        top: layer.y,
        width: Math.max(layer.width, 10),
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        fill: layer.color,
        charSpacing: layer.letterSpacing * 1000, // fabric uses 1/1000 em
        lineHeight: layer.lineHeight,
        textAlign: layer.textAlign,
        opacity: layer.opacity,
        angle: layer.rotation,
        splitByGrapheme: true,
      });
      obj = t as LayeredObject;
      break;
    }
    case "image": {
      const img = await buildImage(layer.src);
      const scaleX = layer.width / (img.width || 1);
      const scaleY = layer.height / (img.height || 1);
      img.set({
        left: layer.x,
        top: layer.y,
        scaleX,
        scaleY,
        angle: layer.rotation,
        opacity: layer.opacity,
      });
      obj = img as LayeredObject;
      break;
    }
    case "rect": {
      const r = new Rect({
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        fill: layer.fill,
        stroke: layer.stroke || undefined,
        strokeWidth: layer.strokeWidth,
        rx: layer.radius,
        ry: layer.radius,
        angle: layer.rotation,
        opacity: layer.opacity,
      });
      obj = r as LayeredObject;
      break;
    }
  }
  obj.layerId = layer.id;
  obj.layerKind = layer.kind;
  obj.set({ cornerStyle: "circle", cornerColor: "#4f8cff", borderColor: "#4f8cff", transparentCorners: false });
  return obj;
}

export async function loadScene(canvas: Canvas, scene: Scene) {
  canvas.clear();
  canvas.setDimensions({ width: scene.width, height: scene.height });
  canvas.backgroundColor = "#111318";

  if (scene.background) {
    const bg = await buildImage(scene.background);
    bg.set({
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      hoverCursor: "default",
    });
    (bg as LayeredObject).isBackground = true;
    // Fit to scene size (the raster is already produced at scene dimensions at scale=1).
    bg.set({ scaleX: scene.width / (bg.width || scene.width), scaleY: scene.height / (bg.height || scene.height) });
    canvas.add(bg);
  }

  for (const layer of scene.layers) {
    try {
      const obj = await layerToFabric(layer);
      canvas.add(obj);
    } catch (err) {
      console.warn("[sceneToFabric] failed to build layer", layer, err);
    }
  }
  canvas.renderAll();
}
