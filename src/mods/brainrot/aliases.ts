import type { ToolLineStyle } from "../types";

export const BRAINROT_ALIASES: Record<string, string> = {
  Read: "peek 👀",
  Write: "yap into",
  Edit: "skibidi-patch",
  Bash: "run it fr",
  Glob: "find that bussin",
  Grep: "lowkey search",
  Task: "delegate sigma",
  WebFetch: "curl vibes",
  Fetch: "curl vibes",
  WebSearch: "google cap",
  NotebookEdit: "jot rizz",
  TodoWrite: "todo no cap",
  BashOutput: "catch output",
  KillShell: "ggs",
  SlashCommand: "/ohio",
  AskUserQuestion: "ask chat",
  ExitPlanMode: "ship it",
};

export const BRAINROT_TOOL_STYLE: ToolLineStyle = {
  glyph: "⟪",
  sgr: "\x1b[1;38;2;255;72;200m",
  wrap: ["", " ⟫"],
  targetSgr: "\x1b[38;2;160;220;255m",
  checkSgr: "\x1b[1;38;2;80;255;140m",
};
