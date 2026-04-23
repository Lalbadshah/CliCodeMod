import type { ToolLineStyle } from "../types";

export const ORACLE_ALIASES: Record<string, string> = {
  Read: "Scry",
  Write: "Inscribe",
  Edit: "Emend",
  Bash: "Incant",
  Glob: "Divine",
  Grep: "Augur",
  Task: "Summon",
  WebFetch: "Seek Afar",
  Fetch: "Seek Afar",
  WebSearch: "Consult Stars",
  NotebookEdit: "Annotate Codex",
  TodoWrite: "Mark the Ledger",
  BashOutput: "Hear the Echo",
  KillShell: "Banish",
  SlashCommand: "Invoke Rite",
  AskUserQuestion: "Query the Seeker",
  ExitPlanMode: "Break the Seal",
};

export const ORACLE_TOOL_STYLE: ToolLineStyle = {
  glyph: "✦",
  sgr: "\x1b[38;2;184;138;58m",
  wrap: ["", " ✦"],
  targetSgr: "\x1b[2;38;2;106;78;43m",
  checkSgr: "\x1b[38;2;138;104;32m",
};
