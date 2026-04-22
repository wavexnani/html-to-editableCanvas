import type { Fill, GradientStop, Shadow, Stroke } from "../types";

/**
 * Utilities for parsing CSS computed-style strings into the scene's Fill /
 * Shadow / transform types. These are intentionally best-effort — modern CSS
 * is huge; we cover the shapes used by the target sample + all the common
 * modern-design idioms (solid colors, linear/radial gradients, single and
 * multiple box shadows, rgb/rgba/hex/named colors, 2D transforms).
 */

const NAMED_COLORS: Record<string, string> = {
  transparent: "rgba(0,0,0,0)",
  black: "rgb(0,0,0)",
  white: "rgb(255,255,255)",
  red: "rgb(255,0,0)",
  green: "rgb(0,128,0)",
  blue: "rgb(0,0,255)",
  gray: "rgb(128,128,128)",
  grey: "rgb(128,128,128)",
  silver: "rgb(192,192,192)",
  yellow: "rgb(255,255,0)",
  cyan: "rgb(0,255,255)",
  magenta: "rgb(255,0,255)",
  orange: "rgb(255,165,0)",
  purple: "rgb(128,0,128)",
  pink: "rgb(255,192,203)",
};

export function normalizeColor(raw: string | null | undefined): string {
  if (!raw) return "rgba(0,0,0,0)";
  const s = raw.trim().toLowerCase();
  if (s in NAMED_COLORS) return NAMED_COLORS[s];
  return raw.trim();
}

export function isTransparent(color: string): boolean {
  const s = color.trim().toLowerCase();
  if (s === "transparent") return true;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(",").map((p) => p.trim());
  if (parts.length === 4) return Number(parts[3]) === 0;
  return false;
}

/** Split a CSS function-argument list by top-level commas (respecting nested parens). */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

/** Take a color + optional offset token — e.g. `#fff 25%` or `rgba(0,0,0,.5) 0 50%`. */
function parseGradientStop(stop: string, index: number, total: number): GradientStop[] {
  // Handle "color 50%" or "color 10% 50%" (which means the same color at two offsets)
  const mFn = stop.match(/^(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8}|[a-z]+)\s*(.*)$/i);
  if (!mFn) {
    return [{ offset: total > 1 ? index / (total - 1) : 0, color: normalizeColor(stop) }];
  }
  const color = normalizeColor(mFn[1]);
  const rest = mFn[2].trim();
  if (!rest) {
    return [{ offset: total > 1 ? index / (total - 1) : 0, color }];
  }
  const parts = rest.split(/\s+/);
  return parts.map((p) => ({
    offset: parsePercentOrLength(p),
    color,
  }));
}

function parsePercentOrLength(p: string): number {
  if (p.endsWith("%")) return Math.max(0, Math.min(1, parseFloat(p) / 100));
  const n = parseFloat(p);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/**
 * Parse `background-image` / `background` into a Fill. Returns null for
 * `none` or unrecognised patterns.
 */
export function parseBackgroundImage(bg: string): Fill | null {
  if (!bg || bg === "none") return null;
  // Strip leading whitespace; some browsers prepend keywords like `rgba(...) none`.
  const s = bg.trim();

  // Linear gradient
  const linear = s.match(/^linear-gradient\((.+)\)$/i);
  if (linear) {
    const inner = linear[1];
    const parts = splitTopLevelCommas(inner);
    let angle = 180; // CSS default: `to bottom`
    let stopStart = 0;
    const first = parts[0];
    if (/^(\d+(\.\d+)?)(deg|rad|turn)$/i.test(first)) {
      const m = first.match(/^(\d+(\.\d+)?)(deg|rad|turn)$/i)!;
      const n = parseFloat(m[1]);
      const unit = m[3].toLowerCase();
      if (unit === "rad") angle = (n * 180) / Math.PI;
      else if (unit === "turn") angle = n * 360;
      else angle = n;
      stopStart = 1;
    } else if (/^to\s+/i.test(first)) {
      const dir = first.replace(/^to\s+/i, "").trim().toLowerCase();
      angle = directionToAngle(dir);
      stopStart = 1;
    }
    const stopParts = parts.slice(stopStart);
    const stops: GradientStop[] = [];
    stopParts.forEach((sp, i) => stops.push(...parseGradientStop(sp, i, stopParts.length)));
    return { type: "linear", angle, stops };
  }

  // Radial gradient — crude support: treat as center, auto radius.
  const radial = s.match(/^radial-gradient\((.+)\)$/i);
  if (radial) {
    const inner = radial[1];
    const parts = splitTopLevelCommas(inner);
    let stopStart = 0;
    if (parts.length > 1 && /at\s+/i.test(parts[0])) stopStart = 1;
    else if (parts.length > 1 && /^(circle|ellipse|closest|farthest)/i.test(parts[0])) stopStart = 1;
    const stopParts = parts.slice(stopStart);
    const stops: GradientStop[] = [];
    stopParts.forEach((sp, i) => stops.push(...parseGradientStop(sp, i, stopParts.length)));
    return { type: "radial", cx: 0.5, cy: 0.5, r: 0.5, stops };
  }

  // `url(...)` — image background handled separately by importer.
  if (/^url\(/i.test(s)) return null;

  return null;
}

function directionToAngle(dir: string): number {
  const map: Record<string, number> = {
    top: 0,
    "top right": 45,
    right: 90,
    "bottom right": 135,
    bottom: 180,
    "bottom left": 225,
    left: 270,
    "top left": 315,
  };
  return map[dir] ?? 180;
}

/**
 * Parse a CSS `box-shadow` computed value. Only emits the first non-inset
 * shadow layer (Fabric only supports one shadow per object). Returns null
 * if the computed value is `none`.
 */
export function parseBoxShadow(raw: string): Shadow | null {
  if (!raw || raw === "none") return null;
  // Split multi-shadow list, same top-level-comma logic.
  const layers = splitTopLevelCommas(raw);
  for (const layer of layers) {
    const parsed = parseSingleShadow(layer);
    if (parsed && !parsed.inset) return parsed; // prefer outer shadow
  }
  // fall back to first layer even if inset
  for (const layer of layers) {
    const parsed = parseSingleShadow(layer);
    if (parsed) return parsed;
  }
  return null;
}

function parseSingleShadow(layer: string): Shadow | null {
  const inset = /(^|\s)inset(\s|$)/i.test(layer);
  const s = layer.replace(/(^|\s)inset(\s|$)/gi, " ").trim();

  // Extract color (rgb/rgba/hex/named) — it can come at the start or the end.
  let color = "rgba(0,0,0,0.5)";
  let rest = s;
  const colorRe = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8})/i;
  const mc = s.match(colorRe);
  if (mc) {
    color = normalizeColor(mc[0]);
    rest = s.replace(mc[0], "").trim();
  }
  const nums = rest.split(/\s+/).map(parseFloat).filter(Number.isFinite);
  if (nums.length < 2) return null;
  const [offsetX, offsetY, blur = 0] = nums;
  return { color, offsetX, offsetY, blur, inset };
}

export function parseBorder(
  borderStyle: string,
  borderWidth: string,
  borderColor: string,
): Stroke | null {
  const w = parseFloat(borderWidth);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!borderStyle || borderStyle === "none" || borderStyle === "hidden") return null;
  const color = normalizeColor(borderColor);
  if (isTransparent(color)) return null;
  let style: Stroke["style"] = "solid";
  if (borderStyle === "dashed") style = "dashed";
  else if (borderStyle === "dotted") style = "dotted";
  return { color, width: w, style };
}

/**
 * Decompose a CSS `transform: matrix(a,b,c,d,e,f)` / `matrix3d(...)` / `none`
 * string into a 2D rotation angle (degrees) for the importer. Skew / scale are
 * discarded — we rely on the bounding-rect from layout for size.
 */
export function parseTransformAngle(transform: string): number {
  if (!transform || transform === "none") return 0;
  const m2 = transform.match(/matrix\(([^)]+)\)/);
  if (m2) {
    const [a, b] = m2[1].split(",").map((x) => parseFloat(x.trim()));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return (Math.atan2(b, a) * 180) / Math.PI;
    }
  }
  const m3 = transform.match(/matrix3d\(([^)]+)\)/);
  if (m3) {
    const parts = m3[1].split(",").map((x) => parseFloat(x.trim()));
    if (parts.length >= 6) {
      return (Math.atan2(parts[1], parts[0]) * 180) / Math.PI;
    }
  }
  const r = transform.match(/rotate\(\s*(-?\d+(\.\d+)?)(deg|rad|turn)?\s*\)/i);
  if (r) {
    const n = parseFloat(r[1]);
    const unit = (r[3] || "deg").toLowerCase();
    if (unit === "rad") return (n * 180) / Math.PI;
    if (unit === "turn") return n * 360;
    return n;
  }
  return 0;
}

export function parseFontWeight(weight: string): number {
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

export function parseLetterSpacing(ls: string): number {
  if (!ls || ls === "normal") return 0;
  const n = parseFloat(ls);
  return Number.isFinite(n) ? n : 0;
}

export function parseLineHeight(lh: string, fontSize: number): number {
  if (!lh || lh === "normal") return 1.16;
  if (lh.endsWith("px")) {
    const n = parseFloat(lh);
    return Number.isFinite(n) && fontSize > 0 ? n / fontSize : 1.16;
  }
  const n = parseFloat(lh);
  return Number.isFinite(n) ? n : 1.16;
}

export function firstFontFamily(family: string): string {
  const first = family.split(",")[0]?.trim() ?? "sans-serif";
  return first.replace(/^['"]|['"]$/g, "");
}

/**
 * Parse a CSS `border-radius` shorthand computed value into per-corner radii.
 * Handles `Npx`, `Npx Npx`, `Npx Npx Npx`, `Npx Npx Npx Npx`, and trailing
 * `/`-separated vertical radii (collapsed to the horizontal value).
 */
export function parseBorderRadius(
  topLeft: string,
  topRight: string,
  bottomRight: string,
  bottomLeft: string,
): { tl: number; tr: number; br: number; bl: number } {
  const px = (s: string) => {
    // Only take first number (horizontal) from e.g. "12px 12px"
    const n = parseFloat(s.split(" ")[0] || "0");
    return Number.isFinite(n) ? n : 0;
  };
  return { tl: px(topLeft), tr: px(topRight), br: px(bottomRight), bl: px(bottomLeft) };
}
