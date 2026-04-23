import type { ToolLineStyle } from "../types";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const SGR_RE = /\x1b\[[\d;]*m/g;
const stripSgr = (s: string): string => s.replace(SGR_RE, "");

// Claude Code renders its tool bullet with either ● (U+25CF BLACK CIRCLE) in
// older builds or ⏺ (U+23FA BLACK CIRCLE FOR RECORD) in 2.x. Match either so
// the transformer keeps firing across version bumps. 2.x also splits
// multi-word tool names with spaces ("Web Search"), so the name group accepts
// any number of additional capitalized words.
const TOOL_BULLET_RE = /[●⏺]/u;
const TOOL_LINE_RE = /^\s*(?:\x1b\[[\d;]*m)*[●⏺]\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*)\b(.*)$/u;
const CHECK_LINE_RE = /^(\s+)(?:\x1b\[[\d;]*m)*([✓⎿])/u;
const PENDING_MAX_LINES = 40;

export type ToolEvent =
  | { type: "start"; name: string; target?: string; ts: number }
  | { type: "done"; name: string; ts: number };

function parseTarget(rest: string): string | undefined {
  const cleaned = rest.trim();
  if (!cleaned) return undefined;
  // Most tool lines look like `(target…)`; peel one layer of parens if present.
  const paren = cleaned.match(/^\(([^)]{1,200})\)?/);
  if (paren) return paren[1].trim() || undefined;
  return cleaned.slice(0, 80) || undefined;
}

export function createToolCallTransformer(opts: {
  // Mutable: the transformer reads aliases[name] on each line, so callers
  // may extend this map at runtime (e.g., to drop in LLM-generated aliases).
  aliases: Record<string, string>;
  style: ToolLineStyle;
  // Optional per-tool prefix inserted before the alias (e.g., a themed emoji).
  prefixFor?: (name: string) => string | undefined;
  onTool?: (e: ToolEvent) => void;
}): (chunk: string) => string {
  const { aliases, style, onTool, prefixFor } = opts;
  const glyph = style.glyph ?? "●";
  const [wrapL, wrapR] = style.wrap ?? ["", ""];
  const targetSgr = style.targetSgr ?? DIM;
  const checkSgr = style.checkSgr;

  let residual = "";
  let pendingName: string | undefined;
  let pendingLinesLeft = 0;

  const finishPending = (): void => {
    if (pendingName) {
      onTool?.({ type: "done", name: pendingName, ts: Date.now() });
      pendingName = undefined;
      pendingLinesLeft = 0;
    }
  };

  const transformLine = (line: string): string => {
    const toolMatch = line.match(TOOL_LINE_RE);
    // "Web Search" → "WebSearch" to hit the space-free keys used by mod alias
    // maps. Fall through to the unchanged line if we still don't recognize it.
    const canonical = toolMatch ? toolMatch[1].replace(/\s+/g, "") : "";
    if (toolMatch && aliases[canonical]) {
      // A new tool starts — any prior tool that never got a check marker is
      // considered done (claude-code sometimes renders results with ⎿ rather
      // than ✓, or folds them behind a "ctrl+r to expand" hint).
      finishPending();
      const alias = aliases[canonical];
      const cleanRest = stripSgr(toolMatch[2]).trimStart();
      pendingName = canonical;
      pendingLinesLeft = PENDING_MAX_LINES;
      onTool?.({
        type: "start",
        name: canonical,
        target: parseTarget(cleanRest),
        ts: Date.now(),
      });
      const prefix = prefixFor?.(canonical);
      const head = prefix ? `${prefix} ${alias}` : alias;
      return (
        `${style.sgr}${wrapL}${glyph} ${head}${wrapR}${RESET}` +
        (cleanRest ? ` ${targetSgr}${cleanRest}${RESET}` : "")
      );
    }
    if (pendingName) {
      const cm = line.match(CHECK_LINE_RE);
      if (cm) {
        finishPending();
        // Colorize the ✓ glyph; don't touch ⎿ — claude already paints it.
        if (checkSgr && cm[2] === "✓") {
          return line.replace(CHECK_LINE_RE, `${cm[1]}${checkSgr}${cm[2]}${RESET}`);
        }
      } else if (--pendingLinesLeft <= 0) {
        finishPending();
      }
    }
    return line;
  };

  const transformComplete = (block: string): string => {
    if (block.length === 0) return "";
    const pieces = block.split("\n");
    pieces.pop();
    const out: string[] = [];
    for (const raw of pieces) {
      const hasCR = raw.endsWith("\r");
      const line = hasCR ? raw.slice(0, -1) : raw;
      out.push(transformLine(line) + (hasCR ? "\r" : ""));
    }
    return out.join("\n") + "\n";
  };

  const couldBeToolCallTail = (tail: string): boolean => {
    if (tail.length === 0) return true;
    let i = 0;
    while (i < tail.length && tail[i] === "\x1b") {
      const rest = tail.slice(i);
      const m = rest.match(/^\x1b\[[\d;]*m/);
      if (!m) return false;
      i += m[0].length;
    }
    if (i >= tail.length) return true;
    return TOOL_BULLET_RE.test(tail[i]);
  };

  return (chunk: string): string => {
    const combined = residual + chunk;
    const lastNl = combined.lastIndexOf("\n");

    if (lastNl < 0) {
      if (couldBeToolCallTail(combined)) {
        residual = combined;
        return "";
      }
      residual = "";
      return combined;
    }

    const completePart = combined.slice(0, lastNl + 1);
    const tail = combined.slice(lastNl + 1);
    const outComplete = transformComplete(completePart);

    if (couldBeToolCallTail(tail)) {
      residual = tail;
      return outComplete;
    }
    residual = "";
    return outComplete + tail;
  };
}
