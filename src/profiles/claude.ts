import type { Profile, ProfileParser, ToolEventEmit } from "./types";
import { stripAnsi, nextId } from "./ansi";

// Claude Code 2.x renders tool calls via ANSI cursor-positioning inside
// synchronized-update regions (\e[?2026h … \e[?2026l). Tool-line content
// never ends with "\n" — Claude moves the cursor up to the target row,
// writes the bullet + bold name + args, then moves the cursor back to
// the prompt. A line-based parser sees none of it because makeLineSplitter
// only flushes on "\n", and the content before the final "\r" on a line
// is discarded as spinner overwrite. So we scan the raw PTY byte stream
// directly for markers Claude always emits around each tool call:
//
//   \e[1m<ToolName>\e[22m("<arg>")       ← tool name wrapped in bold,
//                                          directly followed by "("
//   ⎿  Searching: <query>                ← ongoing-tool output marker
//   ⏺  Did 1 search in 8s                ← completion summary (green ⏺)
//
// All three survive cursor positioning because the bold-SGR codes and
// ⏺/⎿ glyphs are emitted verbatim every time the region is redrawn.

const BUFFER_CAP = 64 * 1024;
const BUFFER_TRIM_TO = 16 * 1024;
const LOOKAHEAD_AFTER_BOLD = 64;
const ARGS_LOOKAHEAD = 512;

const TOOL_BOLD_RE =
  /\x1b\[1m([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\x1b\[22m/gu;
const SEARCHING_RE = /⎿\s+([^\r\n⏺●⎿]{2,180})/gu;
// Any ⏺-prefixed line: either a tool_start (Name followed by "(") or
// assistant prose / completion summary. We use this to close the active
// tool reliably — Claude's real summaries use a wide variety of verbs
// (Listed, Created, Killed, Invoked, Spawned, Shipped…) that an enum
// regex can't keep up with.
const ENTRY_RE = /⏺\s+([^\r\n]{1,200})/gu;

// Claude's tool names. Canonicalized to space-free keys so alias maps on
// mods (which use "WebSearch", "BashOutput", etc.) match without needing
// a per-mod space-aware lookup.
const KNOWN_TOOLS = new Set([
  "Bash",
  "BashOutput",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Task",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
  "NotebookRead",
  "TodoWrite",
  "KillShell",
  "SlashCommand",
  "AskUserQuestion",
  "ExitPlanMode",
  "Update",
  "Create",
  "Fetch",
]);

function canonicalizeToolName(raw: string): string {
  return raw.replace(/\s+/g, "");
}

export function createClaudeParser(emit: ToolEventEmit): ProfileParser {
  type ActiveTool = { id: string; name: string; lastOutput?: string };
  let active: ActiveTool | null = null;

  // Parallel buffers: raw bytes for the bold-SGR regex, ANSI-stripped for
  // the ⎿/⏺ output+entry patterns. Scanning cursors advance independently
  // per pattern so each regex can move forward at its own pace.
  let raw = "";
  let stripped = "";
  let rawScan = 0;
  let outputScan = 0;
  let entryScan = 0;

  const trim = (): void => {
    if (raw.length > BUFFER_CAP) {
      const drop = raw.length - BUFFER_TRIM_TO;
      raw = raw.slice(drop);
      rawScan = Math.max(0, rawScan - drop);
    }
    if (stripped.length > BUFFER_CAP) {
      const drop = stripped.length - BUFFER_TRIM_TO;
      stripped = stripped.slice(drop);
      outputScan = Math.max(0, outputScan - drop);
      entryScan = Math.max(0, entryScan - drop);
    }
  };

  const closeActive = (summary?: string): void => {
    if (!active) return;
    emit({
      type: "tool_end",
      id: active.id,
      toolId: active.id,
      name: active.name,
      status: "ok",
      summary: summary ?? active.lastOutput,
      ts: Date.now(),
    });
    active = null;
  };

  const scanCalls = (): void => {
    TOOL_BOLD_RE.lastIndex = rawScan;
    let m: RegExpExecArray | null;
    while ((m = TOOL_BOLD_RE.exec(raw)) !== null) {
      const rawName = m[1];
      const name = canonicalizeToolName(rawName);
      const afterBold = TOOL_BOLD_RE.lastIndex;
      rawScan = afterBold;
      if (!KNOWN_TOOLS.has(name)) continue;

      // Bold delimiters also wrap decorative text in the startup banner
      // ("\e[1mClaude\e[1CCode\e[22m"). Tool calls always have "(" as the
      // first visible character after \e[22m, so require it.
      const after = stripAnsi(raw.slice(afterBold, afterBold + LOOKAHEAD_AFTER_BOLD));
      const firstVisible = after.match(/^\s*(\S)/);
      if (!firstVisible || firstVisible[1] !== "(") continue;

      // Best-effort args: ANSI-strip a wider window, take the text between
      // the first "(" and the first ")" (or line break, or 160 chars).
      // Claude interleaves cursor-right ops between words inside args, so
      // this is approximate — good enough for a sidebar chip.
      const argsWindow = stripAnsi(raw.slice(afterBold, afterBold + ARGS_LOOKAHEAD));
      const openIdx = argsWindow.indexOf("(");
      const argsTail = openIdx >= 0 ? argsWindow.slice(openIdx + 1) : "";
      const endIdx = argsTail.search(/[)\r\n]/);
      const args =
        (endIdx >= 0 ? argsTail.slice(0, endIdx) : argsTail.slice(0, 160))
          .trim()
          .replace(/\s+/g, " ") || undefined;

      closeActive();
      const id = nextId("clt");
      emit({
        type: "tool_start",
        id,
        name,
        args,
        rawLine: `⏺ ${rawName}${args ? `(${args})` : ""}`,
        ts: Date.now(),
      });
      active = { id, name };
    }
  };

  const scanOutputs = (): void => {
    // Independent cursors for the two patterns — each advances through the
    // stripped buffer at its own pace.
    SEARCHING_RE.lastIndex = outputScan;
    let o: RegExpExecArray | null;
    while ((o = SEARCHING_RE.exec(stripped)) !== null) {
      outputScan = SEARCHING_RE.lastIndex;
      if (!active) continue;
      const text = o[1].trim().replace(/\s+/g, " ");
      if (!text) continue;
      emit({
        type: "tool_output",
        id: nextId("clo"),
        toolId: active.id,
        text,
        ts: Date.now(),
      });
      active.lastOutput = text;
    }

    // Every ⏺ line either opens a new tool (handled in scanCalls on the raw
    // buffer) OR marks the end of the current one (assistant prose / summary
    // text). Regardless of which, if the active tool's id came from an
    // earlier ⏺ and we now see another ⏺, it's done.
    ENTRY_RE.lastIndex = entryScan;
    let e: RegExpExecArray | null;
    while ((e = ENTRY_RE.exec(stripped)) !== null) {
      entryScan = ENTRY_RE.lastIndex;
      if (!active) continue;
      const body = e[1].trim().replace(/\s+/g, " ");
      // A new tool_start looks like "Name(…" — scanCalls will re-open
      // active with the new id, so just close the prior one here (no
      // summary — the next bold-SGR match has the real name).
      const isToolStart = /^[A-Z][A-Za-z0-9]*(?:\s[A-Z][A-Za-z0-9]*)*\s*\(/.test(body);
      if (isToolStart) {
        closeActive();
      } else {
        // Assistant prose or completion summary. Prefer the previously
        // captured ⎿ output text if we have one (it's usually more useful
        // as a tool summary); otherwise use this body.
        const summary = active.lastOutput || body.slice(0, 160);
        closeActive(summary);
      }
    }
  };

  return {
    parse(chunk: string): void {
      raw += chunk;
      stripped += stripAnsi(chunk);
      trim();
      scanCalls();
      scanOutputs();
    },
    flush(): void {
      closeActive();
    },
    reset(): void {
      active = null;
      raw = "";
      stripped = "";
      rawScan = 0;
      outputScan = 0;
      entryScan = 0;
    },
  };
}

export const claudeProfile: Profile = {
  id: "claude",
  name: "Claude Code",
  matches(binary: string): boolean {
    return binary.toLowerCase().includes("claude");
  },
  createParser(emit) {
    return createClaudeParser(emit);
  },
};
