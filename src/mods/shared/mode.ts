// Canonical Claude Code mode detection.
// The CLI cycles through three interactive modes via shift+tab — plan,
// accept edits, and auto (bypass permissions / yolo). Each statusline
// version phrases them slightly differently ("plan mode on",
// "accept edits on", "auto-accept edits on", "bypass permissions on"),
// so we normalise to a single shape every mod can render.

export type ModeKind = "default" | "plan" | "accept" | "auto";

export type ModeVisual = {
  kind: ModeKind;
  /** lowercase canonical label, e.g. "plan mode" / "accept edits" / "auto mode". */
  label: string;
  /** uppercase variant for typographic chrome. */
  labelUpper: string;
  emoji: string;
  /** raw claude-code text (lowercased) when present — useful for tooltips. */
  raw?: string;
};

const DEFAULT: ModeVisual = {
  kind: "default",
  label: "default",
  labelUpper: "DEFAULT",
  emoji: "✨",
};

export function describeMode(mode: string | undefined | null): ModeVisual {
  if (!mode) return DEFAULT;
  const raw = mode.trim();
  if (!raw) return DEFAULT;
  const m = raw.toLowerCase();

  if (m.includes("plan")) {
    return { kind: "plan", label: "plan mode", labelUpper: "PLAN MODE", emoji: "🗺️", raw: m };
  }
  // "accept edits on" + "auto-accept edits on" both land here.
  if (m.includes("accept")) {
    return { kind: "accept", label: "accept edits", labelUpper: "ACCEPT EDITS", emoji: "✅", raw: m };
  }
  // Pure "auto …" (without "accept"), "bypass permissions", "yolo",
  // "dangerously skip permissions" → the most permissive ("auto") mode.
  if (m.includes("bypass") || m.includes("yolo") || m.includes("dangerous") || m.includes("auto")) {
    return { kind: "auto", label: "auto mode", labelUpper: "AUTO MODE", emoji: "🤖", raw: m };
  }

  return { kind: "default", label: m, labelUpper: m.toUpperCase(), emoji: "✨", raw: m };
}
