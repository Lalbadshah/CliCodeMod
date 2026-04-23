import type { LlmSettings } from "../llm/types";

export type ModSelection = "neon" | "oracle" | "editorial" | "brainrot";

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AppSettings = {
  binary: string;
  cwd: string;
  extraArgs?: string[];
  selectedMod?: ModSelection;
  windowBounds?: WindowBounds;
  llm?: LlmSettings;
};

export type StatusEvent =
  | { kind: "spawn_ok"; pid: number }
  | { kind: "spawn_error"; message: string }
  | { kind: "exit"; code: number | null; signal: NodeJS.Signals | null };
