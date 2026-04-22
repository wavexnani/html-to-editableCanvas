import {
  Canvas,
  FabricImage,
  FabricObject,
  Gradient,
  Path,
  Rect,
  Shadow as FabricShadow,
  Textbox,
} from "fabric";
import type {
  Fill,
  ImageLayer,
  Layer,
  RectLayer,
  Scene,
  Shadow,
  TextLayer,
} from "../types";
import { registerFonts } from "./htmlImporter";

/** Fabric object with our own metadata for the Layers panel / inspector. */
export interface LayeredObject extends FabricObject {
  layerId?: string;
  layerKind?: Layer["kind"];
  layerName?: string;
  isBackground?: boolean;
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Helpers: CSS → Fabric
 * ────────────────────────────────────────────────────────────────────── */

function fabricFill(fill: Fill | null, width: number, height: number): string | Gradient<"linear"> | Gradient<"radial"> | undefined {
  if (!fill) return undefined;
  if (fill.type === "solid") return fill.color;
  if (fill.type === "linear") {
    // CSS angle: 0deg = upwards, 90deg = right. Map to Fabric coordinates.
    // We convert by expressing the gradient line as a unit vector and
    // multiplying by the rect's bounding box.
    const rad = ((fill.angle - 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    // Find half-diagonal projection onto the gradient line so stops span
    // the whole rect (matches CSS behaviour approximately for rectangles).
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const length = (width * absCos + height * absSin) / 2;
    const dx = Math.cos(rad) * length;
    const dy = Math.sin(rad) * length;
    return new Gradient({
      type: "linear",
      coords: { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy },
      colorStops: fill.stops.map((s) => ({ offset: s.offset, color: s.color })),
    });
  }
  // radial
  return new Gradient({
    type: "radial",
    coords: {
      x1: width * fill.cx,
      y1: height * fill.cy,
      r1: 0,
      x2: width * fill.cx,
      y2: height * fill.cy,
      r2: Math.max(width, height) * fill.r,
    },
    colorStops: fill.stops.map((s) => ({ offset: s.offset, color: s.color })),
  });
}

function fabricShadow(sh: Shadow | undefined): FabricShadow | undefined {
  if (!sh) return undefined;
  return new FabricShadow({
    color: sh.color,
    blur: sh.blur,
    offsetX: sh.offsetX,
    offsetY: sh.offsetY,
    affectStroke: false,
  });
}

/** Build an SVG path for a rectangle with per-corner radii. */
function roundedRectPath(width: number, height: number, r: RectLayer["radius"]): string {
  const { tl, tr, br, bl } = r;
  const w = width;
  const h = height;
  // Clamp radii so they don't exceed half the shorter side.
  const max = Math.min(w, h) / 2;
  const ttl = Math.min(tl, max);
  const ttr = Math.min(tr, max);
  const tbr = Math.min(br, max);
  const tbl = Math.min(bl, max);
  return [
    `M ${ttl} 0`,
    `H ${w - ttr}`,
    ttr > 0 ? `A ${ttr} ${ttr} 0 0 1 ${w} ${ttr}` : "",
    `V ${h - tbr}`,
    tbr > 0 ? `A ${tbr} ${tbr} 0 0 1 ${w - tbr} ${h}` : "",
    `H ${tbl}`,
    tbl > 0 ? `A ${tbl} ${tbl} 0 0 1 0 ${h - tbl}` : "",
    `V ${ttl}`,
    ttl > 0 ? `A ${ttl} ${ttl} 0 0 1 ${ttl} 0` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Layer → Fabric
 * ────────────────────────────────────────────────────────────────────── */

async function buildImage(layer: ImageLayer): Promise<LayeredObject> {
  const img = await FabricImage.fromURL(layer.src, { crossOrigin: "anonymous" });
  const natW = img.width || 1;
  const natH = img.height || 1;
  let scaleX = layer.width / natW;
  let scaleY = layer.height / natH;
  if (layer.objectFit === "contain") {
    const s = Math.min(scaleX, scaleY);
    scaleX = s;
    scaleY = s;
  } else if (layer.objectFit === "cover") {
    const s = Math.max(scaleX, scaleY);
    scaleX = s;
    scaleY = s;
  }
  img.set({
    left: layer.x,
    top: layer.y,
    scaleX,
    scaleY,
    angle: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
    shadow: fabricShadow(layer.shadow),
  });
  return img as LayeredObject;
}

function buildText(layer: TextLayer): LayeredObject {
  const t = new Textbox(applyCase(layer.text, layer.textTransform), {
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
    underline: layer.textDecoration === "underline",
    linethrough: layer.textDecoration === "line-through",
    splitByGrapheme: true,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
    shadow: fabricShadow(layer.shadow),
  });
  return t as LayeredObject;
}

function applyCase(text: string, tt: TextLayer["textTransform"]): string {
  switch (tt) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default: return text;
  }
}

function buildRect(layer: RectLayer): LayeredObject {
  const fill = fabricFill(layer.fill, layer.width, layer.height);
  const r = layer.radius;
  const uniform = Math.abs(r.tl - r.tr) < 0.5 && Math.abs(r.tr - r.br) < 0.5 && Math.abs(r.br - r.bl) < 0.5;

  let obj: FabricObject;
  if (uniform) {
    obj = new Rect({
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      fill: fill as unknown as string,
      stroke: layer.stroke?.color,
      strokeWidth: layer.stroke?.width ?? 0,
      strokeDashArray: layer.stroke?.style === "dashed" ? [8, 6] : layer.stroke?.style === "dotted" ? [2, 4] : undefined,
      rx: r.tl,
      ry: r.tl,
      angle: layer.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      shadow: fabricShadow(layer.shadow),
    });
  } else {
    // Non-uniform corner radii → use Path for proper geometry.
    const d = roundedRectPath(layer.width, layer.height, r);
    obj = new Path(d, {
      left: layer.x,
      top: layer.y,
      fill: fill as unknown as string,
      stroke: layer.stroke?.color,
      strokeWidth: layer.stroke?.width ?? 0,
      angle: layer.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      shadow: fabricShadow(layer.shadow),
      objectCaching: true,
    });
  }
  return obj as LayeredObject;
}

export async function layerToFabric(layer: Layer): Promise<LayeredObject> {
  let obj: LayeredObject;
  switch (layer.kind) {
    case "text":
      obj = buildText(layer);
      break;
    case "image":
      obj = await buildImage(layer);
      break;
    case "rect":
      obj = buildRect(layer);
      break;
  }
  obj.layerId = layer.id;
  obj.layerKind = layer.kind;
  obj.layerName = layer.name;
  obj.set({
    cornerStyle: "circle",
    cornerColor: "#4f8cff",
    cornerSize: 10,
    borderColor: "#4f8cff",
    transparentCorners: false,
    padding: 0,
  });
  return obj;
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Scene → Fabric
 * ────────────────────────────────────────────────────────────────────── */

function buildBackgroundFill(scene: Scene): string | Gradient<"linear"> | Gradient<"radial"> | undefined {
  if (!scene.background) return "#111318";
  return fabricFill(scene.background, scene.width, scene.height) ?? "#111318";
}

export async function loadScene(canvas: Canvas, scene: Scene) {
  // Register fonts in the parent document BEFORE we create Fabric Textbox
  // objects, so they can measure and render with the correct metrics.
  if (scene.fonts?.length) {
    await registerFonts(scene.fonts);
  }

  canvas.clear();
  canvas.setDimensions({ width: scene.width, height: scene.height });

  const bg = buildBackgroundFill(scene);
  // Fabric accepts a string OR a Pattern/Gradient for backgroundColor via TColor.
  canvas.backgroundColor = bg as unknown as string;

  for (const layer of scene.layers) {
    try {
      const obj = await layerToFabric(layer);
      canvas.add(obj);
    } catch (err) {
      // Keep going — one bad layer shouldn't blow up the whole scene.
      console.warn("[sceneToFabric] failed to build layer", layer, err);
    }
  }
  canvas.renderAll();
}
