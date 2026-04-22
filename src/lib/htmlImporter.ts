import type {
  Fill,
  FontSource,
  ImageLayer,
  Layer,
  RectLayer,
  Scene,
  TextLayer,
} from "../types";
import {
  firstFontFamily,
  isTransparent,
  normalizeColor,
  parseBackgroundImage,
  parseBorder,
  parseBorderRadius,
  parseBoxShadow,
  parseFontWeight,
  parseLetterSpacing,
  parseLineHeight,
  parseTransformAngle,
} from "./cssParsing";

/* ────────────────────────────────────────────────────────────────────── *
 *  v2 HTML importer — element-level extraction.
 *
 *  Walk every element in the rendered DOM. For each, classify as:
 *    • Text block    — inline text content, no block children. Emit ONE
 *                       TextLayer containing the element's merged text.
 *    • Image         — <img> or CSS background-image:url(...).
 *    • Shape         — has visible paint (bg color, gradient, border,
 *                       shadow, radius). Emit a RectLayer.
 *    • Container     — layout only. Recurse into children.
 *
 *  Children of a text block are NOT re-visited (the whole block is one
 *  layer per the user's "complete text as one element" requirement). This
 *  is what differentiates v2 from v1 (which emitted one layer per leaf
 *  text element and ended up with 180+ tiny layers).
 *
 *  Fonts (<link href="fonts.googleapis.com">, <style>@font-face), and the
 *  body/root background are extracted too so the parent canvas renders in
 *  the correct colors and typefaces.
 * ────────────────────────────────────────────────────────────────────── */

let layerCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${layerCounter++}`;

const TEXT_ALIGN_MAP: Record<string, TextLayer["textAlign"]> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "justify",
  start: "left",
  end: "right",
};

/** Is this element a zero-size / invisible / removed from layout element? */
function isVisible(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (parseFloat(cs.opacity) === 0) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width < 0.5 || rect.height < 0.5) return false;
  return true;
}

/** Does any descendant participate in block-level layout? */
function hasBlockDescendant(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const cd = getComputedStyle(child).display;
    if (cd === "block" || cd === "flex" || cd === "grid" || cd === "table" || cd === "list-item") {
      return true;
    }
    if (hasBlockDescendant(child)) return true;
  }
  return false;
}

/** Merge inline text content of an element (textContent with normalized whitespace). */
function mergedText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Decide if this element can be emitted as a single text layer:
 * - it has non-empty text,
 * - no block-level descendants (text is a single block of inline content),
 * - and it is not itself an <img> / <svg> / <canvas> etc.
 */
function canBeTextBlock(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "IMG" || tag === "SVG" || tag === "CANVAS" || tag === "VIDEO" || tag === "AUDIO") {
    return false;
  }
  // Script / style / nothing-to-render
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "LINK" || tag === "META") {
    return false;
  }
  const text = mergedText(el);
  if (!text) return false;
  if (hasBlockDescendant(el)) return false;
  return true;
}

/** Does this element paint anything on its own? */
function hasVisiblePaint(cs: CSSStyleDeclaration): boolean {
  if (!isTransparent(normalizeColor(cs.backgroundColor))) return true;
  if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
  if (cs.boxShadow && cs.boxShadow !== "none") return true;
  const bw = parseFloat(cs.borderTopWidth || "0") +
    parseFloat(cs.borderRightWidth || "0") +
    parseFloat(cs.borderBottomWidth || "0") +
    parseFloat(cs.borderLeftWidth || "0");
  if (bw > 0 && cs.borderStyle !== "none") return true;
  return false;
}

function relRect(el: Element, root: DOMRect) {
  const r = (el as HTMLElement).getBoundingClientRect();
  return {
    x: r.left - root.left,
    y: r.top - root.top,
    width: r.width,
    height: r.height,
  };
}

function buildTextLayer(el: HTMLElement, root: DOMRect): TextLayer | null {
  const cs = getComputedStyle(el);
  if (!isVisible(el, cs)) return null;
  const text = mergedText(el);
  if (!text) return null;

  const pos = relRect(el, root);
  const fontSize = parseFloat(cs.fontSize) || 14;

  const layer: TextLayer = {
    id: nextId("t"),
    kind: "text",
    name: text.length > 28 ? text.slice(0, 28) + "…" : text,
    x: pos.x,
    y: pos.y,
    width: Math.max(pos.width, 1),
    height: Math.max(pos.height, 1),
    rotation: parseTransformAngle(cs.transform),
    opacity: parseFloat(cs.opacity) || 1,
    visible: true,
    locked: false,
    shadow: parseBoxShadow(cs.textShadow || "none") ?? undefined,
    sourceTag: el.tagName,
    text,
    fontFamily: firstFontFamily(cs.fontFamily),
    fontSize,
    fontWeight: parseFontWeight(cs.fontWeight),
    fontStyle: cs.fontStyle === "italic" ? "italic" : "normal",
    color: normalizeColor(cs.color),
    textAlign: TEXT_ALIGN_MAP[cs.textAlign] ?? "left",
    lineHeight: parseLineHeight(cs.lineHeight, fontSize),
    letterSpacing: parseLetterSpacing(cs.letterSpacing),
    textTransform:
      (cs.textTransform as TextLayer["textTransform"]) in {
        none: 1, uppercase: 1, lowercase: 1, capitalize: 1,
      }
        ? (cs.textTransform as TextLayer["textTransform"])
        : "none",
    textDecoration:
      cs.textDecorationLine?.includes("underline")
        ? "underline"
        : cs.textDecorationLine?.includes("line-through")
          ? "line-through"
          : "none",
  };
  return layer;
}

function buildRectLayer(el: HTMLElement, root: DOMRect): RectLayer | null {
  const cs = getComputedStyle(el);
  if (!isVisible(el, cs)) return null;
  const pos = relRect(el, root);

  // Fill: gradient beats solid; if both present, we keep gradient (matches CSS).
  const gradient = parseBackgroundImage(cs.backgroundImage);
  const solid = normalizeColor(cs.backgroundColor);
  let fill: Fill | null = null;
  if (gradient) fill = gradient;
  else if (!isTransparent(solid)) fill = { type: "solid", color: solid };

  const stroke = parseBorder(cs.borderTopStyle, cs.borderTopWidth, cs.borderTopColor);
  const shadow = parseBoxShadow(cs.boxShadow);
  const radius = parseBorderRadius(
    cs.borderTopLeftRadius,
    cs.borderTopRightRadius,
    cs.borderBottomRightRadius,
    cs.borderBottomLeftRadius,
  );

  // Skip containers that really paint nothing (pure layout wrappers).
  if (!fill && !stroke && !shadow && radius.tl + radius.tr + radius.br + radius.bl < 0.5) {
    return null;
  }

  const layer: RectLayer = {
    id: nextId("r"),
    kind: "rect",
    name: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
    x: pos.x,
    y: pos.y,
    width: Math.max(pos.width, 1),
    height: Math.max(pos.height, 1),
    rotation: parseTransformAngle(cs.transform),
    opacity: parseFloat(cs.opacity) || 1,
    visible: true,
    locked: false,
    shadow: shadow && !shadow.inset ? shadow : undefined,
    sourceTag: el.tagName,
    fill,
    stroke,
    radius,
  };
  return layer;
}

function buildImageLayerFromImg(el: HTMLImageElement, root: DOMRect): ImageLayer | null {
  const cs = getComputedStyle(el);
  if (!isVisible(el, cs)) return null;
  if (!el.src) return null;
  const pos = relRect(el, root);
  return {
    id: nextId("i"),
    kind: "image",
    name: el.alt || "image",
    x: pos.x,
    y: pos.y,
    width: Math.max(pos.width, 1),
    height: Math.max(pos.height, 1),
    rotation: parseTransformAngle(cs.transform),
    opacity: parseFloat(cs.opacity) || 1,
    visible: true,
    locked: false,
    sourceTag: "IMG",
    src: el.src,
    objectFit: (cs.objectFit as ImageLayer["objectFit"]) || "fill",
  };
}

/** Extract a raster data URL from `background-image: url(...)` of `el`. */
function extractBackgroundImageUrl(cs: CSSStyleDeclaration): string | null {
  const bg = cs.backgroundImage;
  if (!bg || bg === "none") return null;
  const m = bg.match(/url\((['"]?)([^)]+?)\1\)/);
  return m ? m[2] : null;
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Fonts
 * ────────────────────────────────────────────────────────────────────── */

function extractFonts(doc: Document): FontSource[] {
  const fonts: FontSource[] = [];
  // <link rel="stylesheet" href="...">
  doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (link.href) fonts.push({ href: link.href });
  });
  // <link rel="preconnect" for fonts.googleapis.com> — we don't need, skip.
  // <style>@font-face</style>
  doc.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    const css = style.textContent ?? "";
    const rules = css.match(/@font-face\s*\{[^}]*\}/g);
    if (rules?.length) {
      fonts.push({ cssText: rules.join("\n") });
    }
    // Also preserve @import url("fonts.googleapis.com...") inside <style>.
    const imports = css.match(/@import\s+url\(['"]?([^'")]+)['"]?\)\s*;/g);
    if (imports) {
      imports.forEach((imp) => {
        const m = imp.match(/@import\s+url\(['"]?([^'")]+)['"]?\)/);
        if (m?.[1]) fonts.push({ href: m[1] });
      });
    }
  });
  return fonts;
}

/**
 * Inject the given font sources into the parent document. Idempotent — uses a
 * data-fontsrc attribute so repeated imports don't duplicate <link>/<style>
 * tags. Returns a Promise that resolves once document.fonts.ready fires.
 */
export async function registerFonts(fonts: FontSource[]): Promise<void> {
  for (const f of fonts) {
    if (f.href) {
      const sel = `link[data-fontsrc="${CSS.escape(f.href)}"]`;
      if (!document.head.querySelector(sel)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = f.href;
        link.crossOrigin = "anonymous";
        link.setAttribute("data-fontsrc", f.href);
        document.head.appendChild(link);
      }
    }
    if (f.cssText) {
      const key = hashString(f.cssText);
      const sel = `style[data-fontsrc-css="${key}"]`;
      if (!document.head.querySelector(sel)) {
        const style = document.createElement("style");
        style.setAttribute("data-fontsrc-css", key);
        style.textContent = f.cssText;
        document.head.appendChild(style);
      }
    }
  }
  // Wait for fonts to be usable.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Walker
 * ────────────────────────────────────────────────────────────────────── */

interface WalkContext {
  root: DOMRect;
  layers: Layer[];
  /** Elements we've already consumed as part of a text block. */
  consumed: WeakSet<Element>;
}

const ROOT_SKIP_TAGS = new Set(["HTML", "HEAD", "BODY", "SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"]);

function walk(el: Element, ctx: WalkContext) {
  if (ctx.consumed.has(el)) return;

  const tag = el.tagName;

  // Inline SVG — rasterize as a single image layer (hard to map to Fabric
  // primitives in v2; in-fabric SVG support is a follow-up).
  if (tag === "SVG") {
    // Skip: not worth emitting as an image right now; covered by parent bg.
    return;
  }

  if (tag === "IMG") {
    const img = buildImageLayerFromImg(el as HTMLImageElement, ctx.root);
    if (img) ctx.layers.push(img);
    return;
  }

  if (!(el instanceof HTMLElement) || ROOT_SKIP_TAGS.has(tag)) {
    // Still recurse into children of skipped tags (e.g. body) but don't emit.
    for (const child of Array.from(el.children)) walk(child, ctx);
    return;
  }

  const cs = getComputedStyle(el);
  if (!isVisible(el, cs)) return;

  // Background-image: url(...) → emit an image layer at this element's rect.
  const bgUrl = extractBackgroundImageUrl(cs);
  if (bgUrl) {
    const pos = relRect(el, ctx.root);
    ctx.layers.push({
      id: nextId("i"),
      kind: "image",
      name: `bg(${tag.toLowerCase()})`,
      x: pos.x,
      y: pos.y,
      width: Math.max(pos.width, 1),
      height: Math.max(pos.height, 1),
      rotation: parseTransformAngle(cs.transform),
      opacity: parseFloat(cs.opacity) || 1,
      visible: true,
      locked: false,
      sourceTag: tag,
      src: bgUrl,
      objectFit: (cs.backgroundSize === "cover"
        ? "cover"
        : cs.backgroundSize === "contain"
          ? "contain"
          : "fill"),
    } satisfies ImageLayer);
    // Note: bg-image elements can also have text; we still recurse below.
  } else if (hasVisiblePaint(cs)) {
    const rect = buildRectLayer(el, ctx.root);
    if (rect) ctx.layers.push(rect);
  }

  // Text block? Emit a single text layer and DON'T recurse — this is the
  // heart of "complete text as one element".
  if (canBeTextBlock(el)) {
    const text = buildTextLayer(el, ctx.root);
    if (text) {
      ctx.layers.push(text);
      // Mark all descendants consumed so we don't also emit their paint.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
      let n: Node | null = walker.nextNode();
      while (n) {
        ctx.consumed.add(n as Element);
        n = walker.nextNode();
      }
      return;
    }
  }

  for (const child of Array.from(el.children)) walk(child, ctx);
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Background (body) fill
 * ────────────────────────────────────────────────────────────────────── */

function extractBodyFill(doc: Document): Fill | null {
  const body = doc.body;
  const html = doc.documentElement;
  const bcs = getComputedStyle(body);
  const hcs = getComputedStyle(html);

  const grad = parseBackgroundImage(bcs.backgroundImage) ?? parseBackgroundImage(hcs.backgroundImage);
  if (grad) return grad;
  const c = normalizeColor(bcs.backgroundColor);
  if (!isTransparent(c)) return { type: "solid", color: c };
  const c2 = normalizeColor(hcs.backgroundColor);
  if (!isTransparent(c2)) return { type: "solid", color: c2 };
  return null;
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Readiness
 * ────────────────────────────────────────────────────────────────────── */

async function waitForIframeReady(iframeDoc: Document): Promise<void> {
  const fontsReady = (iframeDoc as Document & { fonts?: { ready: Promise<FontFaceSet> } }).fonts?.ready;
  if (fontsReady) await fontsReady;
  const imgs = Array.from(iframeDoc.images) as HTMLImageElement[];
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Public API
 * ────────────────────────────────────────────────────────────────────── */

export interface ImportOptions {
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface ImportResult {
  scene: Scene;
  iframe: HTMLIFrameElement;
}

export async function importHtml(html: string, options: ImportOptions = {}): Promise<ImportResult> {
  const viewportWidth = options.viewportWidth ?? 1800;
  const viewportHeight = options.viewportHeight ?? 900;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${viewportWidth}px;height:${viewportHeight}px;` +
    `border:0;visibility:hidden;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    iframe.addEventListener("load", () => resolve(), { once: true });
    iframe.addEventListener("error", () => reject(new Error("Failed to load HTML in iframe")), { once: true });
  });

  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Could not access iframe document");

  await waitForIframeReady(doc);

  // Resize iframe to content size so nothing is clipped.
  const body = doc.body;
  const html_ = doc.documentElement;
  const contentWidth = Math.max(body.scrollWidth, html_.scrollWidth, viewportWidth);
  const contentHeight = Math.max(body.scrollHeight, html_.scrollHeight, viewportHeight);
  iframe.style.width = `${contentWidth}px`;
  iframe.style.height = `${contentHeight}px`;
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // Register fonts on parent document BEFORE measuring so Fabric renders with
  // the right font metrics later. (We still measure inside the iframe, but
  // we want the same fonts available on the parent canvas too.)
  const fonts = extractFonts(doc);
  await registerFonts(fonts);

  const background = extractBodyFill(doc);

  const rootRect = body.getBoundingClientRect();
  const ctx: WalkContext = {
    root: rootRect,
    layers: [],
    consumed: new WeakSet(),
  };
  walk(body, ctx);

  // Post-processing: stable ordering is DOM order (bottom → top). Drop
  // zero-area layers that slipped through.
  const layers = ctx.layers.filter((l) => l.width > 0.5 && l.height > 0.5);

  const scene: Scene = {
    width: contentWidth,
    height: contentHeight,
    layers,
    fonts,
    background,
  };

  return { scene, iframe };
}

export function disposeImport(result: ImportResult | null) {
  if (!result) return;
  result.iframe.remove();
}
