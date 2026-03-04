type TextStyle = {
  fontSize: number;
  fontWeight: "normal" | "bold";
  /**
   * Unitless multiplier, like CSS `line-height`.
   */
  lineHeight: number;
};

export type RawElementProps = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BaseRawElement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextRawElement = {
  type: "text";
  text: string;
  style: TextStyle;
} & BaseRawElement;

export type GroupRawElement = {
  type: "group";
  direction: "horizontal" | "vertical";
  gap: number;
  elements: BaseRawElement[];
} & BaseRawElement;

export type RawElement = TextRawElement | GroupRawElement;
