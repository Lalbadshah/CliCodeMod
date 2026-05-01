import type { Terminal } from "@xterm/xterm";

export type Statusline = {
  model?: string;
  tokens?: string;
  cost?: string;
  git?: string;
  cwd?: string;
  time?: string;
  ctxPct?: number;
  block5hPct?: number;
  block5hLeft?: string;
  block7dPct?: number;
  block7dLeft?: string;
  mode?: string;
  busy?: boolean;
  busyVerb?: string;
  busySeconds?: number;
  busyTokens?: string;
};

const SEP_RE = /\s*│\s*/u;
const STAR_RE = /^✷\s+(.+?)\s+✷$/u;
const TOK_RE = /∑\s+(\S+)/u;
const COST_RE = /\$([\d.,]+)/u;
const CWD_RE = /◒\s+(.+)$/u;
const TIME_RE = /⏱\s+(\S+)/u;
const CTX_RE = /◈\s*ctx\s*\[[^\]]*\]\s*(\d+)\s*%/u;
const H5_RE = /⧗\s*5h\s*\[[^\]]*\]\s*(\d+)\s*%(?:\s*↺\s*(\S+))?/u;
const D7_RE = /⧗\s*7d\s*\[[^\]]*\]\s*(\d+)\s*%(?:\s*↺\s*(\S+))?/u;
// Claude Code prefixes the mode line with a mode-specific symbol:
//   "⏸ plan mode on …"           (plan)
//   "⏵⏵ accept edits on …"       (accept edits / auto-accept)
//   "⏵⏵ bypass permissions on …" (yolo / bypass)
// Earlier releases only used ⏵⏵, so we match either prefix.
const MODE_RE = /(?:⏸|⏵⏵)\s+(.+?)(?:\s+\(.*\))?\s*$/u;
// Claude Code's "thinking" line: a rotating spinner glyph + an -ing verb +
// ellipsis, followed by an elapsed-time / token pill. Real-world variants:
//   "✻ Pondering… (12s · ↑ 3.2k tokens · esc to interrupt)"
//   "✳ Levitating… (17s · still thinking with xhigh effort)"
//   "✶ Cogitating… (5s · ⚒ 1.8k tokens)"
// Detection ORs three signals — any one is enough — because the trailing
// pill format keeps shifting between releases (esc to interrupt / still
// thinking / no tail at all). The spinner-glyph + verb pair is the most
// stable; the literal phrases are belt-and-suspenders.
const BUSY_INTERRUPT_RE = /esc\s+to\s+interrupt/i;
const BUSY_THINKING_RE = /still\s+thinking/i;
// Glyph class covers the dingbat-stars block (U+2730–U+273F: ✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿)
// plus the sparkle / atom / filled-circle glyphs Claude rotates through.
const BUSY_VERB_RE =
  /(?:^|\s)[●⚛✨✰-✿]\s+([A-Z][a-zA-Z]+(?:ing|ed))(?:…|\.{2,}|\s)/u;
const BUSY_SECONDS_RE = /\(\s*(\d+)\s*s\b/u;
const BUSY_TOKENS_RE = /([\d.,]+\s*[kmb]?)\s*tokens?/iu;

function parseLines(lines: string[]): Statusline {
  const s: Statusline = {};
  for (const raw of lines) {
    if (!raw) continue;
    const line = raw.trim();

    if (line.includes("✷") && line.includes("│")) {
      const segs = line.split(SEP_RE).map((x) => x.trim()).filter(Boolean);
      for (const seg of segs) {
        const m1 = seg.match(STAR_RE);
        if (m1) { s.model = m1[1].trim(); continue; }

        const tok = seg.match(TOK_RE);
        const cost = seg.match(COST_RE);
        if (tok) s.tokens = tok[1];
        if (cost) s.cost = cost[1];
        if (tok || cost) continue;

        const cwd = seg.match(CWD_RE);
        if (cwd) { s.cwd = cwd[1].trim(); continue; }

        const time = seg.match(TIME_RE);
        if (time) { s.time = time[1]; continue; }

        if (!/[✷∑◒⏱$◈⧗]/.test(seg) && seg.length > 0 && seg.length < 40) {
          s.git = seg;
        }
      }
    }

    const ctx = line.match(CTX_RE);
    if (ctx) s.ctxPct = Number(ctx[1]);

    const h5 = line.match(H5_RE);
    if (h5) {
      s.block5hPct = Number(h5[1]);
      if (h5[2]) s.block5hLeft = h5[2];
    }

    const d7 = line.match(D7_RE);
    if (d7) {
      s.block7dPct = Number(d7[1]);
      if (d7[2]) s.block7dLeft = d7[2];
    }

    const mode = line.match(MODE_RE);
    if (mode) s.mode = mode[1].trim();

    const verbMatch = line.match(BUSY_VERB_RE);
    const isBusyLine =
      verbMatch != null ||
      BUSY_INTERRUPT_RE.test(line) ||
      BUSY_THINKING_RE.test(line);
    if (isBusyLine) {
      s.busy = true;
      if (verbMatch) s.busyVerb = verbMatch[1];
      const secs = line.match(BUSY_SECONDS_RE);
      if (secs) s.busySeconds = Number(secs[1]);
      const tok = line.match(BUSY_TOKENS_RE);
      if (tok) s.busyTokens = tok[1].replace(/\s+/g, "");
    }
  }
  if (s.busy == null) s.busy = false;
  return s;
}

export function watchStatusline(
  term: Terminal,
  onChange: (s: Statusline) => void,
): () => void {
  let lastKey = "";
  let timer: number | null = null;
  let disposed = false;

  const read = () => {
    if (disposed) return;
    try {
      const buf = term.buffer.active;
      const baseY = buf.baseY;
      const rows = term.rows;
      const lines: string[] = [];
      for (let i = 0; i < rows; i++) {
        const line = buf.getLine(baseY + i);
        lines.push(line?.translateToString(true) ?? "");
      }
      const parsed = parseLines(lines);
      const key = JSON.stringify(parsed);
      if (key !== lastKey) {
        lastKey = key;
        onChange(parsed);
      }
    } catch {
      /* terminal may be mid-dispose */
    }
  };

  const schedule = () => {
    if (timer !== null || disposed) return;
    timer = window.setTimeout(() => {
      timer = null;
      read();
    }, 180);
  };

  const disp = term.onRender(() => schedule());
  queueMicrotask(read);

  return () => {
    disposed = true;
    disp.dispose();
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}
