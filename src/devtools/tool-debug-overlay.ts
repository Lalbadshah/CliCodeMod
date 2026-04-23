import type { TerminalBus } from "../bus";
import { stripAnsi } from "../profiles/ansi";

// Toggle-able diagnostic panel (Cmd/Ctrl+Shift+D). Shows, in order of how the
// PTY byte stream is consumed:
//   RAW    — each chunk that hit bus.write, with escape sequences visible
//   LINE   — plain-text lines produced by the same splitter the Claude parser uses
//   REGEX  — per-line regex result from tool-call-transformer + claude profile
//   EVENT  — ToolEvents actually emitted by the active profile parser
//
// The overlay runs its own line splitter + regex against the live byte stream
// so we can compare what it sees against what the real parser emits. When the
// two disagree, the parser is broken; when they both fail on the same line,
// the regex is wrong.

type Category = "RAW" | "LINE" | "REGEX" | "EVENT";
type Entry = { ts: number; cat: Category; text: string; html?: string };

const MAX_ENTRIES = 600;

// Same regexes as src/profiles/claude.ts and src/mods/shared/tool-call-transformer.ts
const TOOL_RE_V2 = /^\s*[⏺●]\s+([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\((.*)\)\s*$/u;
const TOOL_NOARG_RE_V2 = /^\s*[⏺●]\s+([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\s*$/u;
const TOOL_RE_V1 = /^\s*[⏺●]\s+([A-Z][A-Za-z0-9]+)\((.*)\)\s*$/u;
const BULLET_PREFIX_RE = /^\s*[⏺●]/u;
// Stream-level pattern used by the new Claude 2.x parser: bold tool name.
const BOLD_TOOL_RE =
  /\x1b\[1m([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\x1b\[22m/gu;

function escapeBytes(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n") out += "\\n\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\x1b") out += "\\e";
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
    return ch;
  });
}

function codepointList(s: string, max = 16): string {
  const parts: string[] = [];
  let i = 0;
  for (const ch of s) {
    if (i++ >= max) { parts.push("…"); break; }
    const cp = ch.codePointAt(0) ?? 0;
    parts.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}(${ch})`);
  }
  return parts.join(" ");
}

export function mountToolDebugOverlay(bus: TerminalBus): () => void {
  const panel = document.createElement("div");
  panel.setAttribute("data-tool-debug", "");
  panel.style.cssText = [
    "position:fixed",
    "top:60px",
    "right:16px",
    "width:520px",
    "height:70vh",
    "background:rgba(10,10,18,0.96)",
    "color:#dfe6f3",
    "border:1px solid rgba(120,200,255,0.35)",
    "border-radius:8px",
    "box-shadow:0 12px 40px rgba(0,0,0,0.6)",
    "font:11px/1.45 ui-monospace,Menlo,Consolas,monospace",
    "z-index:3000",
    "display:none",
    "flex-direction:column",
    "overflow:hidden",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "padding:6px 8px",
    "background:linear-gradient(180deg,#1a1f30,#0f1320)",
    "border-bottom:1px solid rgba(120,200,255,0.25)",
    "flex-wrap:wrap",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "tool-pipeline debug";
  title.style.cssText = "font-weight:600;color:#9cf0ff;margin-right:auto;letter-spacing:0.04em;";
  header.append(title);

  const filters: Record<Category, boolean> = { RAW: false, LINE: true, REGEX: true, EVENT: true };
  const catColor: Record<Category, string> = {
    RAW: "#8aa0c6",
    LINE: "#ffd86a",
    REGEX: "#ff87d4",
    EVENT: "#9cf04a",
  };
  const chipFor = (cat: Category): HTMLElement => {
    const c = document.createElement("button");
    c.type = "button";
    c.textContent = cat;
    c.style.cssText = [
      "padding:2px 8px",
      "border-radius:999px",
      "border:1px solid rgba(255,255,255,0.2)",
      "background:transparent",
      `color:${catColor[cat]}`,
      "cursor:pointer",
      "font:600 10px/1.4 ui-monospace,Menlo,monospace",
      "letter-spacing:0.06em",
    ].join(";");
    const refresh = () => {
      c.style.opacity = filters[cat] ? "1" : "0.35";
      c.style.background = filters[cat] ? "rgba(255,255,255,0.08)" : "transparent";
    };
    refresh();
    c.addEventListener("click", () => { filters[cat] = !filters[cat]; refresh(); rerender(); });
    return c;
  };
  for (const cat of ["RAW", "LINE", "REGEX", "EVENT"] as Category[]) header.append(chipFor(cat));

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "clear";
  clearBtn.style.cssText = [
    "padding:2px 8px",
    "border-radius:999px",
    "border:1px solid rgba(255,255,255,0.2)",
    "background:transparent",
    "color:#dfe6f3",
    "cursor:pointer",
    "font:600 10px/1.4 ui-monospace,Menlo,monospace",
  ].join(";");
  clearBtn.addEventListener("click", () => { entries.length = 0; rerender(); });
  header.append(clearBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "copy";
  copyBtn.style.cssText = clearBtn.style.cssText;
  copyBtn.addEventListener("click", () => {
    const text = entries
      .map((e) => `[${e.cat}] ${e.text}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
    copyBtn.textContent = "copied";
    window.setTimeout(() => { copyBtn.textContent = "copy"; }, 1200);
  });
  header.append(copyBtn);

  const log = document.createElement("div");
  log.style.cssText = [
    "flex:1",
    "overflow:auto",
    "padding:6px 8px",
    "white-space:pre-wrap",
    "word-break:break-word",
  ].join(";");

  panel.append(header, log);
  document.body.append(panel);

  const entries: Entry[] = [];

  const rerender = (): void => {
    const shouldPinBottom =
      log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    const parts: string[] = [];
    for (const e of entries) {
      if (!filters[e.cat]) continue;
      const time = new Date(e.ts).toISOString().slice(11, 23);
      const body = e.html ?? escapeHtml(e.text);
      parts.push(
        `<div style="margin-bottom:4px"><span style="color:#556;margin-right:6px">${time}</span>` +
        `<span style="color:${catColor[e.cat]};font-weight:600;margin-right:6px">${e.cat}</span>` +
        `<span>${body}</span></div>`,
      );
    }
    log.innerHTML = parts.join("");
    if (shouldPinBottom) log.scrollTop = log.scrollHeight;
  };

  const push = (cat: Category, text: string, html?: string): void => {
    entries.push({ ts: Date.now(), cat, text, html });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    rerender();
  };

  // Raw bytes in.
  let rawBoldScan = 0;
  let rawBoldBuf = "";
  const offRaw = bus.onData((data) => {
    push("RAW", escapeBytes(data).slice(0, 280) + (data.length > 280 ? " …" : ""));
    splitter(data);

    // Also show stream-level bold-tool matches (the signal the new parser
    // uses). Cap the sliding buffer so we don't leak memory in long sessions.
    rawBoldBuf += data;
    if (rawBoldBuf.length > 64 * 1024) {
      const drop = rawBoldBuf.length - 16 * 1024;
      rawBoldBuf = rawBoldBuf.slice(drop);
      rawBoldScan = Math.max(0, rawBoldScan - drop);
    }
    BOLD_TOOL_RE.lastIndex = rawBoldScan;
    let m: RegExpExecArray | null;
    while ((m = BOLD_TOOL_RE.exec(rawBoldBuf)) !== null) {
      const afterBold = BOLD_TOOL_RE.lastIndex;
      rawBoldScan = afterBold;
      const tail = stripAnsi(rawBoldBuf.slice(afterBold, afterBold + 64));
      const firstVisible = tail.match(/^\s*(\S)/);
      const looksLikeCall = firstVisible?.[1] === "(";
      push(
        "REGEX",
        `bold=[${m[1]}] follow=${JSON.stringify(tail.slice(0, 24))} ${looksLikeCall ? "→ CALL" : "→ skip"}`,
        `bold=<span style="color:#9cf04a">[${escapeHtml(m[1])}]</span> follow=<span style="color:#8aa0c6">${escapeHtml(JSON.stringify(tail.slice(0, 24)))}</span> ${looksLikeCall ? '<span style="color:#9cf04a;font-weight:600">→ CALL</span>' : '<span style="color:#ff7070">→ skip</span>'}`,
      );
    }
  });

  // Tool events out.
  const offTool = bus.onTool((ev) => {
    push("EVENT", `${ev.type} ${JSON.stringify(ev)}`);
  });

  // Local line splitter — mirrors src/profiles/line-parser.ts.
  let buf = "";
  const splitter = (chunk: string): void => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const cr = line.lastIndexOf("\r");
      if (cr !== -1) line = line.slice(cr + 1);
      const plain = stripAnsi(line);
      handleLine(plain);
    }
  };

  const handleLine = (line: string): void => {
    if (!line.trim()) return;
    push("LINE", line);

    if (BULLET_PREFIX_RE.test(line)) {
      // Emit an annotated regex comparison so we can see which patterns hit.
      const v2 = line.match(TOOL_RE_V2);
      const v2NoArg = line.match(TOOL_NOARG_RE_V2);
      const v1 = line.match(TOOL_RE_V1);
      const parts: string[] = [];
      parts.push(
        `cp=<span style="color:#9cf0ff">${escapeHtml(codepointList(line.trim().slice(0, 4)))}</span>`,
      );
      parts.push(
        `v2=<span style="color:${v2 ? "#9cf04a" : "#ff7070"}">${v2 ? `✓ name=[${escapeHtml(v2[1])}]` : "✗"}</span>`,
      );
      parts.push(
        `v2-noarg=<span style="color:${v2NoArg ? "#9cf04a" : "#ff7070"}">${v2NoArg ? `✓ name=[${escapeHtml(v2NoArg[1])}]` : "✗"}</span>`,
      );
      parts.push(
        `v1=<span style="color:${v1 ? "#9cf04a" : "#ff7070"}">${v1 ? `✓ name=[${escapeHtml(v1[1])}]` : "✗"}</span>`,
      );
      push("REGEX", `${line.slice(0, 80)} → ${parts.join(" | ")}`, `<code>${escapeHtml(line.slice(0, 80))}</code> → ${parts.join(" | ")}`);
    }
  };

  // Seed from buffered snapshot so we can inspect state captured before the
  // overlay was opened.
  const snap = bus.snapshot();
  if (snap) {
    push("RAW", `[snapshot ${snap.length}B] ` + escapeBytes(snap.slice(-400)));
    splitter(snap);
  }
  push("EVENT", `profile=${bus.profileId ?? "null"}`);

  const keydown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      const showing = panel.style.display !== "none";
      panel.style.display = showing ? "none" : "flex";
      if (!showing) rerender();
    }
  };
  document.addEventListener("keydown", keydown);

  rerender();

  return () => {
    document.removeEventListener("keydown", keydown);
    offRaw();
    offTool();
    panel.remove();
  };
}
