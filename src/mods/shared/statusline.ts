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
const MODE_RE = /⏵⏵\s+(.+?)(?:\s+\(.*\))?\s*$/u;

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
  }
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
