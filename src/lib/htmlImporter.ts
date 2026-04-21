import html2canvas from "html2canvas-pro";
import type { Layer, Scene, TextLayer, ImageLayer } from "../types";

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

/**
 * Parse a CSS font-weight keyword or numeric string into a numeric weight.
 */
function parseFontWeight(weight: string): number {
  const map: Record<string, number> = {
    normal: 400,
    bold: 700,
    bolder: 700,
    lighter: 300,
  };
  if (weight in map) return map[weight];
  const n = parseInt(weight, 10);
  return Number.isFinite(n) ? n : 400;
}

function parseLetterSpacing(ls: string): number {
  if (!ls || ls === "normal") return 0;
  const n = parseFloat(ls);
  return Number.isFinite(n) ? n : 0;
}

function parseLineHeight(lh: string, fontSize: number): number {
  if (!lh || lh === "normal") return 1.16;
  if (lh.endsWith("px")) {
    const n = parseFloat(lh);
    return Number.isFinite(n) && fontSize > 0 ? n / fontSize : 1.16;
  }
  const n = parseFloat(lh);
  return Number.isFinite(n) ? n : 1.16;
}

/**
 * Strip the first font-family from a CSS font-family list and unquote it.
 */
function firstFontFamily(family: string): string {
  const first = family.split(",")[0]?.trim() ?? "sans-serif";
  return first.replace(/^['"]|['"]$/g, "");
}

/**
 * Check if an element has direct visible text content (text nodes that are not
 * empty and are not fully overlapped by child elements).
 */
function getDirectText(el: Element): string {
  let text = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      text += n.textContent ?? "";
    }
  });
  return text.trim();
}

/**
 * An element is a "leaf text element" if it contains at least one direct text
 * node and all of its children (if any) are inline formatting elements we
 * choose to collapse into the parent's text.
 */
function isLeafTextElement(el: Element): boolean {
  const direct = getDirectText(el);
  if (!direct) return false;
  // If any child is a block-level element, we treat children separately.
  for (const child of Array.from(el.children)) {
    const display = getComputedStyle(child).display;
    if (display.startsWith("block") || display === "flex" || display === "grid" || display === "table") {
      return false;
    }
  }
  return true;
}

function rectWithin(elRect: DOMRect, rootRect: DOMRect) {
  return {
    x: elRect.left - rootRect.left,
    y: elRect.top - rootRect.top,
    width: elRect.width,
    height: elRect.height,
  };
}

function extractTextLayer(el: Element, rootRect: DOMRect): TextLayer | null {
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return null;
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const pos = rectWithin(rect, rootRect);
  const fontSize = parseFloat(cs.fontSize) || 14;

  return {
    id: nextId("t"),
    kind: "text",
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    rotation: 0,
    text,
    fontFamily: firstFontFamily(cs.fontFamily),
    fontSize,
    fontWeight: parseFontWeight(cs.fontWeight),
    fontStyle: cs.fontStyle === "italic" ? "italic" : "normal",
    color: cs.color,
    letterSpacing: parseLetterSpacing(cs.letterSpacing),
    lineHeight: parseLineHeight(cs.lineHeight, fontSize),
    textAlign: TEXT_ALIGN_MAP[cs.textAlign] ?? "left",
    opacity: parseFloat(cs.opacity) || 1,
  };
}

function extractImageLayer(el: HTMLImageElement, rootRect: DOMRect): ImageLayer | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  if (!el.src) return null;
  const cs = getComputedStyle(el);
  const pos = rectWithin(rect, rootRect);
  return {
    id: nextId("i"),
    kind: "image",
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    rotation: 0,
    src: el.src,
    opacity: parseFloat(cs.opacity) || 1,
  };
}

/**
 * Walk the DOM of `root` and return the editable layers (text + images).
 */
function walkAndExtract(root: HTMLElement): Layer[] {
  const rootRect = root.getBoundingClientRect();
  const layers: Layer[] = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.currentNode;
  while (current) {
    const el = current as Element;
    if (el.tagName === "IMG") {
      const layer = extractImageLayer(el as HTMLImageElement, rootRect);
      if (layer) layers.push(layer);
    } else if (isLeafTextElement(el)) {
      const layer = extractTextLayer(el, rootRect);
      if (layer) layers.push(layer);
    }
    current = walker.nextNode();
  }
  return layers;
}

/**
 * Wait for webfonts + images to be ready inside the iframe so html2canvas
 * captures the design faithfully.
 */
async function waitForIframeReady(iframeDoc: Document): Promise<void> {
  // Fonts
  const fontsReady = (iframeDoc as Document & { fonts?: { ready: Promise<FontFaceSet> } }).fonts?.ready;
  if (fontsReady) await fontsReady;
  // Images
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
  // One extra animation frame so layout is settled.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

export interface ImportOptions {
  /** Viewport width used to render the HTML. Default: 1800. */
  viewportWidth?: number;
  /** Min viewport height. Default: 900. */
  viewportHeight?: number;
}

export interface ImportResult {
  scene: Scene;
  /** The iframe that produced the scene. Caller may dispose via `disposeImport`. */
  iframe: HTMLIFrameElement;
}

/**
 * Render the given HTML in a hidden iframe, then extract editable text/image
 * layers and a rasterized background snapshot.
 */
export async function importHtml(html: string, options: ImportOptions = {}): Promise<ImportResult> {
  const viewportWidth = options.viewportWidth ?? 1800;
  const viewportHeight = options.viewportHeight ?? 900;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${viewportWidth}px;height:${viewportHeight}px;border:0;visibility:hidden;`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    iframe.addEventListener("load", () => resolve(), { once: true });
    iframe.addEventListener("error", () => reject(new Error("Failed to load HTML in iframe")), { once: true });
  });

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) throw new Error("Could not access iframe document");

  await waitForIframeReady(doc);

  // Resize iframe to match content so we capture the whole design.
  const body = doc.body;
  const html_ = doc.documentElement;
  const contentWidth = Math.max(body.scrollWidth, html_.scrollWidth, viewportWidth);
  const contentHeight = Math.max(body.scrollHeight, html_.scrollHeight, viewportHeight);
  iframe.style.width = `${contentWidth}px`;
  iframe.style.height = `${contentHeight}px`;
  // Give the layout a tick to settle after resize.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const layers = walkAndExtract(body);

  let background: string | undefined;
  try {
    const canvas = await html2canvas(body, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: contentWidth,
      height: contentHeight,
      windowWidth: contentWidth,
      windowHeight: contentHeight,
      scale: 1,
    });
    background = canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[htmlImporter] html2canvas rasterization failed:", err);
  }

  const scene: Scene = {
    width: contentWidth,
    height: contentHeight,
    background,
    layers,
  };

  return { scene, iframe };
}

export function disposeImport(result: ImportResult | null) {
  if (!result) return;
  result.iframe.remove();
}
