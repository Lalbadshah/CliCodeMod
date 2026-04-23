import type { Terminal } from "@xterm/xterm";
import type { TerminalBus } from "../../bus";
import { watchStatusline, type Statusline } from "./statusline";

export type AgentKind = "claude-code" | "other";

export type SessionAggregates = {
  peakTokens: number;
  peakCost: number;
  totalTokens: number;
  totalCost: number;
  updates: number;
  resets: number;
  firstSeenAt?: number;
  lastUpdatedAt?: number;
};

export type SessionInfo = {
  agentKind: AgentKind;
  isClaudeCode: boolean;
  binary?: string;
  pid: number | null;
  isMock: boolean;

  statusline: Readonly<Statusline>;

  model?: string;
  tokensLabel?: string;
  tokensCount?: number;
  costLabel?: string;
  costAmount?: number;
  git?: string;
  cwd?: string;
  ctxPct?: number;
  block5hPct?: number;
  block5hLeft?: string;
  block7dPct?: number;
  block7dLeft?: string;
  mode?: string;

  nowMs: number;
  timeHHMM: string;
  timeHHMMSS: string;
  statusTime?: string;

  title?: string;
  lastPrompt?: string;

  aggregates: Readonly<SessionAggregates>;
};

export type SessionSubscriber = (info: SessionInfo) => void;

export interface SessionBridge {
  readonly snapshot: SessionInfo;
  subscribe(cb: SessionSubscriber): () => void;
  dispose(): void;
}

// Module-level aggregate state so it persists across mod swaps within the
// same window (each mod unmounts its xterm and bridge on swap, but the
// cumulative totals, peaks and reset counters should survive the swap).
const shared = {
  aggregates: emptyAggregates(),
  prevTokens: undefined as number | undefined,
  prevCost: undefined as number | undefined,
  tokensBase: 0,
  costBase: 0,
};

function emptyAggregates(): SessionAggregates {
  return {
    peakTokens: 0,
    peakCost: 0,
    totalTokens: 0,
    totalCost: 0,
    updates: 0,
    resets: 0,
  };
}

export function resetSessionAggregates(): void {
  shared.aggregates = emptyAggregates();
  shared.prevTokens = undefined;
  shared.prevCost = undefined;
  shared.tokensBase = 0;
  shared.costBase = 0;
}

export function parseTokensLabel(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.trim().match(/^([\d.,]+)\s*([kmb])?$/i);
  if (!m) return undefined;
  const num = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return undefined;
  const unit = m[2]?.toLowerCase();
  const mult = unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit === "b" ? 1e9 : 1;
  return num * mult;
}

export function parseCostLabel(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const cleaned = v.replace(/[\s,$]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

export function formatTokens(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

export function formatCost(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toFixed(n < 10 ? 3 : 2);
}

const CLAUDE_BINARY_RE = /(^|[\/\\])claude(-code)?($|[\s\-_.])/i;

function detectAgentKindFromBinary(binary: string | undefined): AgentKind {
  if (!binary) return "other";
  if (CLAUDE_BINARY_RE.test(binary) || /^claude/i.test(binary.trim())) {
    return "claude-code";
  }
  return "other";
}

function hasClaudeStatusSignals(s: Statusline): boolean {
  return (
    s.ctxPct != null ||
    s.block5hPct != null ||
    s.block7dPct != null ||
    (s.model != null && /claude|opus|sonnet|haiku/i.test(s.model))
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtTime(d: Date, withSeconds: boolean): string {
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  if (!withSeconds) return `${hh}:${mm}`;
  return `${hh}:${mm}:${pad2(d.getSeconds())}`;
}

// `> prompt` or `› prompt` — matches a user-turn line in the transcript.
// Allows a single leading box-drawing gutter like "│ > prompt" that Claude
// sometimes renders inside its framed input.
const PROMPT_RE = /^[\s\u2500-\u257F]*[>›]\s+(\S.*?)\s*$/u;
// Claude's own suggestion / hints sometimes start with "> " inside help
// screens ("> /help for help"). Filter those since they aren't user turns.
const PROMPT_REJECT_RE = /^(?:\/help|\/clear|for help|Try "|Press)/i;

function extractPrompt(line: string): string | undefined {
  const m = line.match(PROMPT_RE);
  if (!m) return undefined;
  const text = m[1].trim();
  if (text.length < 2) return undefined;
  if (PROMPT_REJECT_RE.test(text)) return undefined;
  return text;
}

type ScrapedPrompts = {
  title?: string;
  lastPrompt?: string;
};

function scrapePrompts(
  term: Terminal,
  cache: { title?: string; scannedTo: number },
): ScrapedPrompts {
  const buf = term.buffer.active;
  const len = buf.length;
  if (len === 0) return { title: cache.title };

  // Find first user prompt (top-down) — cached once found, resumes
  // scanning from where we left off so scrollback eviction can't erase it.
  if (!cache.title) {
    for (let i = cache.scannedTo; i < len; i++) {
      const line = buf.getLine(i)?.translateToString(true) ?? "";
      const prompt = extractPrompt(line);
      if (prompt) {
        cache.title = prompt;
        break;
      }
    }
    cache.scannedTo = len;
  }

  // Most recent prompt (bottom-up) — rescanned every time.
  let lastPrompt: string | undefined;
  for (let i = len - 1; i >= Math.max(0, len - 2000); i--) {
    const line = buf.getLine(i)?.translateToString(true) ?? "";
    const prompt = extractPrompt(line);
    if (prompt) {
      lastPrompt = prompt;
      break;
    }
  }

  return { title: cache.title, lastPrompt };
}

export function createSessionBridge(term: Terminal, bus: TerminalBus): SessionBridge {
  const listeners = new Set<SessionSubscriber>();
  let disposed = false;

  let baseKind = detectAgentKindFromBinary(bus.meta.binary);
  let detectedClaude = baseKind === "claude-code";
  let latest: Statusline = {};
  const promptCache: { title?: string; scannedTo: number } = { scannedTo: 0 };
  let prompts: ScrapedPrompts = {};
  let snap: SessionInfo = build();

  function build(): SessionInfo {
    const now = new Date();
    const tokensCount = parseTokensLabel(latest.tokens);
    const costAmount = parseCostLabel(latest.cost);
    const kind: AgentKind =
      baseKind === "claude-code" || detectedClaude ? "claude-code" : "other";
    return {
      agentKind: kind,
      isClaudeCode: kind === "claude-code",
      binary: bus.meta.binary,
      pid: bus.meta.pid,
      isMock: bus.meta.isMock,
      statusline: latest,
      model: latest.model,
      tokensLabel: latest.tokens,
      tokensCount,
      costLabel: latest.cost,
      costAmount,
      git: latest.git,
      cwd: latest.cwd,
      ctxPct: latest.ctxPct,
      block5hPct: latest.block5hPct,
      block5hLeft: latest.block5hLeft,
      block7dPct: latest.block7dPct,
      block7dLeft: latest.block7dLeft,
      mode: latest.mode,
      nowMs: now.getTime(),
      timeHHMM: fmtTime(now, false),
      timeHHMMSS: fmtTime(now, true),
      statusTime: latest.time,
      title: prompts.title,
      lastPrompt: prompts.lastPrompt,
      aggregates: { ...shared.aggregates },
    };
  }

  function emit(): void {
    if (disposed) return;
    snap = build();
    for (const cb of listeners) {
      try {
        cb(snap);
      } catch (err) {
        console.error("[session] subscriber error", err);
      }
    }
  }

  const stopStatus = watchStatusline(term, (s) => {
    if (disposed) return;
    latest = s;
    prompts = scrapePrompts(term, promptCache);

    const now = Date.now();
    shared.aggregates.updates += 1;
    if (shared.aggregates.firstSeenAt == null) shared.aggregates.firstSeenAt = now;
    shared.aggregates.lastUpdatedAt = now;

    if (hasClaudeStatusSignals(s)) detectedClaude = true;

    const tokens = parseTokensLabel(s.tokens);
    if (tokens != null) {
      if (tokens > shared.aggregates.peakTokens) shared.aggregates.peakTokens = tokens;
      if (shared.prevTokens != null && tokens < shared.prevTokens) {
        shared.tokensBase += shared.prevTokens;
        shared.aggregates.resets += 1;
      }
      shared.aggregates.totalTokens = shared.tokensBase + tokens;
      shared.prevTokens = tokens;
    }

    const cost = parseCostLabel(s.cost);
    if (cost != null) {
      if (cost > shared.aggregates.peakCost) shared.aggregates.peakCost = cost;
      if (shared.prevCost != null && cost < shared.prevCost) {
        shared.costBase += shared.prevCost;
      }
      shared.aggregates.totalCost = shared.costBase + cost;
      shared.prevCost = cost;
    }

    emit();
  });

  const tick = window.setInterval(() => {
    if (disposed) return;
    prompts = scrapePrompts(term, promptCache);
    emit();
  }, 1000);

  queueMicrotask(() => {
    prompts = scrapePrompts(term, promptCache);
    emit();
  });

  return {
    get snapshot() {
      return snap;
    },
    subscribe(cb) {
      listeners.add(cb);
      try {
        cb(snap);
      } catch (err) {
        console.error("[session] initial subscriber error", err);
      }
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      window.clearInterval(tick);
      stopStatus();
    },
  };
}
