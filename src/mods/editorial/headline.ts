import type { LlmClient, StreamHandle } from "../../llm/client";
import {
  EDITORIAL_HEADLINE_SYSTEM,
  buildEditorialHeadline,
  buildEditorialIdleDeck,
} from "../../llm/prompts";
import type { SessionInfo } from "../shared/session-info";
import { describeMode } from "../shared/mode";

export type Headline = {
  /** small italic uppercase label above the title (e.g. "DISPATCH · PLAN MODE") */
  kicker: string;
  /** the giant serif title */
  title: string;
  /** true if this is the empty/awaiting state — UI uses it to keep is-empty styling */
  empty: boolean;
};

const AWAITING_KICKER = "AWAITING · FIRST · PROMPT";
const AWAITING_TITLE = "The conversation has not yet begun.";

export function fallbackHeadline(info: SessionInfo): Headline {
  // Prefer the scraped first user prompt, then the OSC terminal title.
  // The kicker never names the source — readers don't care whether the
  // copy came off the wire or a teletype, and "TERMINAL TITLE" looks
  // ridiculous as a deck.
  const raw = info.title ?? info.terminalTitle;
  if (raw) {
    return { kicker: buildKicker(info), title: clampTitle(raw, 220), empty: false };
  }
  return { kicker: AWAITING_KICKER, title: AWAITING_TITLE, empty: true };
}

function buildKicker(info: SessionInfo): string {
  const ed = describeMode(info.mode);
  const agent = info.isClaudeCode
    ? "CLAUDE"
    : info.binary
    ? info.binary.toUpperCase()
    : "SHELL";
  const middle = info.mode ? ed.labelUpper : "FILED LIVE";
  return `DISPATCH · ${middle} · ${agent}`;
}

type RunInputs = {
  info: SessionInfo;
  /** terminal tail used to ground the headline in real activity */
  transcript?: string;
};

type RunCallbacks = {
  onUpdate(headline: Headline): void;
};

const REFRESH_MS = 45_000;
const MIN_REGEN_MS = 6_000;

/**
 * Owns the LLM-driven editorial headline. Call `update` whenever the
 * session info changes; the engine decides whether the change is
 * substantial enough to regenerate. Output is delivered via the
 * `onUpdate` callback so the UI stays single-sourced (no double-write
 * between this module and the deterministic fallback path).
 *
 * The engine always emits a deterministic fallback first (so the UI is
 * never stuck on "AWAITING…" while waiting for the LLM). If the LLM
 * yields a usable line within the deadline it replaces the fallback;
 * otherwise the fallback stands until the next refresh tick.
 */
export type HeadlineEngine = {
  update(inputs: RunInputs): void;
  dispose(): void;
};

type Snapshot = {
  prompt?: string;
  termTitle?: string;
  mode?: string;
};

export function createHeadlineEngine(
  llm: LlmClient | null,
  cb: RunCallbacks,
): HeadlineEngine {
  let disposed = false;
  let lastSnap: Snapshot = {};
  let lastRunAt = 0;
  let lastEmittedKey = "";
  let pending: StreamHandle | null = null;
  let refreshTimer: number | null = null;
  let lastInfo: SessionInfo | null = null;
  let lastTranscript: string | undefined;

  const emit = (h: Headline): void => {
    if (disposed) return;
    const key = `${h.kicker}\n${h.title}\n${h.empty ? 1 : 0}`;
    if (key === lastEmittedKey) return;
    lastEmittedKey = key;
    cb.onUpdate(h);
  };

  const run = (info: SessionInfo, transcript: string | undefined): void => {
    if (disposed) return;
    pending?.cancel();
    pending = null;

    if (!llm?.isAvailable()) return;

    const hasSignal = !!info.title || !!info.terminalTitle || !!transcript;

    let buf = "";
    const prompt = hasSignal
      ? buildEditorialHeadline(info, info.title, info.terminalTitle, transcript)
      : buildEditorialIdleDeck(info);

    const handle = llm.stream(
      prompt,
      (tok) => {
        buf += tok;
      },
      {
        systemPrompt: EDITORIAL_HEADLINE_SYSTEM,
        maxTokens: 60,
        temperature: 0.85,
        stop: ["\n\n"],
      },
    );
    pending = handle;
    handle.text
      .then((full) => {
        if (disposed) return;
        if (pending !== handle) return;
        pending = null;
        const cleaned = cleanHeadline(full || buf);
        if (!cleaned) return;
        if (hasSignal) {
          emit({ kicker: buildKicker(info), title: cleaned, empty: false });
        } else {
          emit({ kicker: AWAITING_KICKER, title: cleaned, empty: true });
        }
      })
      .catch(() => {
        if (pending === handle) pending = null;
      });
  };

  const scheduleRefresh = (): void => {
    if (refreshTimer != null || disposed) return;
    refreshTimer = window.setInterval(() => {
      if (disposed || !lastInfo) return;
      run(lastInfo, lastTranscript);
    }, REFRESH_MS);
  };

  return {
    update({ info, transcript }) {
      if (disposed) return;
      lastInfo = info;
      lastTranscript = transcript;

      // Always (re)compute the deterministic fallback so the UI updates
      // immediately, before the LLM has a chance to respond.
      emit(fallbackHeadline(info));

      const snap: Snapshot = {
        prompt: info.title,
        termTitle: info.terminalTitle,
        mode: info.mode,
      };
      const promptChanged = snap.prompt !== lastSnap.prompt;
      const titleChanged = snap.termTitle !== lastSnap.termTitle;
      const modeChanged = snap.mode !== lastSnap.mode;
      const stale = Date.now() - lastRunAt > MIN_REGEN_MS;

      if (promptChanged || titleChanged || (modeChanged && stale)) {
        lastSnap = snap;
        lastRunAt = Date.now();
        run(info, transcript);
      }

      scheduleRefresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending?.cancel();
      pending = null;
      if (refreshTimer != null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}

function cleanHeadline(raw: string): string {
  const stripped = raw
    .replace(/<\/?think>[\s\S]*?<\/?think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/^[\s>*•\-–—_=]+/u, "")
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/gu, "")
    .replace(/\s+/g, " ")
    .split(/\n/)[0]
    .replace(/[.!?…]+$/u, "")
    .trim();
  if (!stripped) return "";
  // Reject obvious refusals or instruction echoes.
  if (/^(here|sure|okay|ok|certainly|let'?s|i\b|the headline)/i.test(stripped)) return "";
  return clampTitle(stripped, 120);
}

function clampTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
