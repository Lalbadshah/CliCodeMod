import type { Profile, ProfileParser, ToolEventEmit } from "./types";
import { makeLineSplitter } from "./line-parser";
import { nextId } from "./ansi";

// Codex CLI transcript grammar:
//
//   • Edited src/components/cine-viewer.tsx (+2 -0)
//       172      windowWidth: 256,
//       173 +    rescaleSlope: 1,
//
//   • Ran bun run type-check
//     └ src/file.tsx(101,20): error TS18047: '...' is possibly 'null'.
//
//   • Explored
//     └ Read volume-viewer.tsx
//
//   ─ Worked for 1m 20s ─────────────────────
//
// Bullet is U+2022 (•). Single-line result marker is U+2514 (└).
// Separator lines (turn boundaries) are runs of U+2500 (─).
const BULLET_RE = /^•\s+(.+?)\s*$/u;
const RESULT_RE = /^\s+└\s*(.*?)\s*$/u;
const SEPARATOR_RE = /^─+\s*(.*?)\s*─+\s*$/u;
const EDIT_SUMMARY_RE = /\s+\((\+\d+(?:\s+-\d+)?(?:\s+[~=]?\d+)?)\)\s*$/u;

type State =
  | { kind: "idle" }
  | { kind: "tool"; toolId: string; name: string; lastOutput?: string };

const PAST_TENSE: Record<string, string> = {
  Edited: "Edit",
  Ran: "Ran",
  Read: "Read",
  Explored: "Explore",
  Searched: "Search",
  Waited: "Wait",
  Created: "Create",
  Wrote: "Write",
  Deleted: "Delete",
  Moved: "Move",
  Copied: "Copy",
  Checked: "Check",
  Installed: "Install",
  Tested: "Test",
};

function parseBullet(rest: string): { name: string; args?: string; summary?: string } {
  // Try to pull a trailing "(+N -M)" style count off as a summary.
  let summary: string | undefined;
  const mEdit = rest.match(EDIT_SUMMARY_RE);
  let body = rest;
  if (mEdit) {
    summary = mEdit[1];
    body = rest.slice(0, mEdit.index).trimEnd();
  }

  const spaceIdx = body.indexOf(" ");
  if (spaceIdx < 0) {
    const verb = body.trim();
    return { name: PAST_TENSE[verb] ?? verb, summary };
  }
  const verb = body.slice(0, spaceIdx);
  const args = body.slice(spaceIdx + 1).trim();
  return { name: PAST_TENSE[verb] ?? verb, args: args || undefined, summary };
}

export function createCodexParser(emit: ToolEventEmit): ProfileParser {
  let state: State = { kind: "idle" };
  let pendingSummary: string | undefined;

  const closePending = (): void => {
    if (state.kind === "tool") {
      emit({
        type: "tool_end",
        id: state.toolId,
        toolId: state.toolId,
        name: state.name,
        status: "ok",
        summary: pendingSummary ?? state.lastOutput,
        ts: Date.now(),
      });
    }
    state = { kind: "idle" };
    pendingSummary = undefined;
  };

  const handleLine = (line: string): void => {
    if (!line.trim()) {
      // Blank closes a tool block (but not a diff block under a tool — handled
      // by the indentation check below: we only close on truly bare blanks).
      if (state.kind !== "idle") closePending();
      return;
    }

    // Turn separator: "─ Worked for 1m 20s ──────"
    const sep = line.match(SEPARATOR_RE);
    if (sep) {
      closePending();
      emit({ type: "turn", id: nextId("cxt"), label: sep[1] || undefined, ts: Date.now() });
      return;
    }

    // New action bullet.
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      closePending();
      const { name, args, summary } = parseBullet(bullet[1]);
      const id = nextId("cxt");
      pendingSummary = summary;
      emit({ type: "tool_start", id, name, args, rawLine: line.trimEnd(), ts: Date.now() });
      state = { kind: "tool", toolId: id, name };
      return;
    }

    // Single-line result marker.
    const res = line.match(RESULT_RE);
    if (res) {
      if (state.kind === "tool") {
        const text = res[1];
        if (text) state.lastOutput = text;
        emit({
          type: "tool_output",
          id: nextId("cxo"),
          toolId: state.toolId,
          text,
          ts: Date.now(),
        });
      }
      return;
    }

    // Indented continuation while inside a tool — diff lines, multi-line stdout.
    if (state.kind === "tool" && /^\s{2,}/.test(line)) {
      const text = line.replace(/^\s{2,}/, "");
      if (!text) return;
      state.lastOutput = text;
      emit({
        type: "tool_output",
        id: nextId("cxo"),
        toolId: state.toolId,
        text,
        ts: Date.now(),
      });
      return;
    }

    // Anything else (codex's own banner, prompt box) — ignore.
  };

  const splitter = makeLineSplitter(handleLine);

  return {
    parse(chunk: string): void {
      splitter(chunk);
    },
    flush(): void {
      closePending();
    },
    reset(): void {
      state = { kind: "idle" };
      pendingSummary = undefined;
    },
  };
}

export const codexProfile: Profile = {
  id: "codex",
  name: "Codex",
  matches(binary: string): boolean {
    const b = binary.toLowerCase();
    return b.includes("codex");
  },
  createParser(emit) {
    return createCodexParser(emit);
  },
};
