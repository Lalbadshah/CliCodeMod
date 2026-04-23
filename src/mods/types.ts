import type { TerminalBus } from "../bus";

export type ModId = "neon" | "oracle" | "editorial" | "brainrot";

export type ModPreview = {
  bg: string;
  accent: string;
  ink: string;
  label: string;
};

export type ModMeta = {
  id: ModId;
  name: string;
  blurb: string;
  preview: ModPreview;
};

export type ToolLineStyle = {
  glyph?: string;
  sgr: string;
  wrap?: [string, string];
  targetSgr?: string;
  checkSgr?: string;
};

export interface Mod {
  readonly id: ModId;
  readonly meta: ModMeta;
  readonly voicePrompt?: string;
  readonly toolAliases?: Record<string, string>;
  readonly toolLineStyle?: ToolLineStyle;
  mount(root: HTMLElement, bus: TerminalBus): void;
  unmount(): void;
}
