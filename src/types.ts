export type LayerKind = "text" | "image" | "rect";

export interface TextLayer {
  id: string;
  kind: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: "normal" | "italic";
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textAlign: "left" | "center" | "right" | "justify";
  opacity: number;
}

export interface ImageLayer {
  id: string;
  kind: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src: string;
  opacity: number;
}

export interface RectLayer {
  id: string;
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  opacity: number;
}

export type Layer = TextLayer | ImageLayer | RectLayer;

export interface Scene {
  /** Logical width of the design in pixels. */
  width: number;
  /** Logical height of the design in pixels. */
  height: number;
  /** Optional rasterized snapshot of the original HTML used as a locked background. */
  background?: string;
  layers: Layer[];
}
