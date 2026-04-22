export type LayerKind = "text" | "image" | "rect";

export interface Shadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  /** true = box-shadow inset; false = outer drop shadow. */
  inset?: boolean;
}

export interface GradientStop {
  offset: number; // 0..1
  color: string;
}

export type Fill =
  | { type: "solid"; color: string }
  | { type: "linear"; angle: number; stops: GradientStop[] }
  | { type: "radial"; cx: number; cy: number; r: number; stops: GradientStop[] };

export interface Stroke {
  color: string;
  width: number;
  style?: "solid" | "dashed" | "dotted";
}

export interface CornerRadius {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** Properties shared by every layer. */
export interface LayerBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Optional outer drop shadow. */
  shadow?: Shadow;
  /** DOM tag we came from, for debug + default naming. */
  sourceTag?: string;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number;   // multiplier
  letterSpacing: number; // px
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  textDecoration: "none" | "underline" | "line-through";
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  src: string;
  objectFit: "fill" | "contain" | "cover";
}

export interface RectLayer extends LayerBase {
  kind: "rect";
  fill: Fill | null;
  stroke: Stroke | null;
  radius: CornerRadius;
}

export type Layer = TextLayer | ImageLayer | RectLayer;

/** A CSS @font-face rule or Google Fonts stylesheet that needs re-registering
 *  on the parent document so editable text renders in the correct family. */
export interface FontSource {
  /** Full stylesheet URL (Google Fonts, etc.) to add as <link>. */
  href?: string;
  /** Raw CSS text (typically @font-face rules) to inject as <style>. */
  cssText?: string;
}

export interface Scene {
  /** Logical width of the design in pixels. */
  width: number;
  /** Logical height of the design in pixels. */
  height: number;
  /** Z-ordered list of editable layers. First = bottom. */
  layers: Layer[];
  /** Fonts the scene depends on; injected into the parent document. */
  fonts: FontSource[];
  /** Background paint for the root canvas (body background). */
  background?: Fill | null;
}
