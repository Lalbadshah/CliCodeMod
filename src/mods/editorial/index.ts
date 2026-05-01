import type { TerminalBus } from "../../bus";
import type { Mod } from "../types";
import { MOD_META } from "../registry";
import { mountInfinity, makeWordmarkInfinity } from "./infinity";
import { mountXterm } from "../shared/xterm-host";
import { writeCell, pulseEl } from "../shared/cell";
import {
  createSessionBridge,
  formatCost,
  formatTokens,
  type SessionInfo,
} from "../shared/session-info";
import { describeMode, type ModeKind } from "../shared/mode";
import { modeGlyph } from "./glyphs";
import {
  createTokenRateTracker,
  renderSparkPaths,
  type TokenRateSnapshot,
} from "./token-rate";
import { createHeadlineEngine, type Headline } from "./headline";
import "./styles.css";

const EDITORIAL_VOICE =
  "Respond like a terse newspaper sub-editor. Lede-first. Active voice. Short paragraphs. No hedging. Prefer plain words. Treat the reader as busy.";

export function createEditorialMod(): Mod {
  let teardown: (() => void) | null = null;

  return {
    id: "editorial",
    meta: MOD_META.editorial,
    voicePrompt: EDITORIAL_VOICE,

    mount(root: HTMLElement, bus: TerminalBus) {
      const shell = document.createElement("div");
      shell.className = "ed-shell";

      const masthead = buildMasthead();
      const marquee = buildMarquee();
      const body = buildBody();
      const stats = buildStats();

      shell.append(masthead.el, marquee.el, body.el, stats.el);
      root.append(shell);

      const killInfinity = mountInfinity(body.infinityHost);

      const xt = mountXterm(body.termHost, bus, {
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.35,
        theme: {
          background: "#121212",
          foreground: "#eae4d4",
          cursor: "#e63922",
          cursorAccent: "#121212",
          selectionBackground: "rgba(230,57,34,0.3)",
          black: "#121212",
          red: "#e63922",
          green: "#8fb34a",
          yellow: "#e6b450",
          blue: "#76a3d8",
          magenta: "#d876a3",
          cyan: "#76c2c2",
          white: "#d6d0c0",
          brightBlack: "#5a5a5a",
          brightRed: "#ff5a3a",
          brightGreen: "#b4d066",
          brightYellow: "#ffce6a",
          brightBlue: "#8fbfff",
          brightMagenta: "#f29ac8",
          brightCyan: "#9fe4e4",
          brightWhite: "#fbf6e6",
        },
      });

      const session = createSessionBridge(xt.term, bus);
      const rate = createTokenRateTracker();
      const headlineEngine = createHeadlineEngine(bus.llm ?? null, {
        onUpdate(h) {
          renderHeadline(body, h);
        },
      });

      const readTranscriptTail = (): string | undefined => {
        try {
          const buf = xt.term.buffer.active;
          const total = buf.length;
          if (total === 0) return undefined;
          const start = Math.max(0, total - 200);
          const lines: string[] = [];
          for (let i = start; i < total; i++) {
            lines.push(buf.getLine(i)?.translateToString(true) ?? "");
          }
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
          const joined = lines.join("\n").trim();
          return joined.length > 3200 ? "…" + joined.slice(-3200) : joined || undefined;
        } catch {
          return undefined;
        }
      };

      const unsub = session.subscribe((info) => {
        rate.sample(info);
        apply(info, rate.snapshot(), { masthead, marquee, body, stats });
        headlineEngine.update({ info, transcript: readTranscriptTail() });
      });

      teardown = () => {
        unsub();
        headlineEngine.dispose();
        session.dispose();
        rate.dispose();
        xt.dispose();
        killInfinity();
        shell.remove();
      };
    },

    unmount() {
      teardown?.();
      teardown = null;
    },
  };
}

// ── builders ─────────────────────────────────────────────

type Masthead = {
  el: HTMLElement;
  project: HTMLElement;
  agent: HTMLElement;
  live: HTMLElement;
};

function buildMasthead(): Masthead {
  const el = document.createElement("div");
  el.className = "ed-masthead";

  const left = document.createElement("div");
  left.className = "ed-mast-left";
  left.innerHTML = `
    <span class="ed-mast-dots"><span class="red"></span><span></span><span></span></span>
    <span class="ed-wordmark">
      <span class="ed-wordmark-inf">${makeWordmarkInfinity()}</span><span class="ed-wordmark-name">dex</span>
    </span>
  `;

  const center = document.createElement("div");
  center.className = "ed-mast-center";
  center.innerHTML = `
    <span class="ed-mast-col">
      <span class="no">01</span><span class="slash">/</span><span class="k">PROJECT</span>
      <span class="sep">·</span><span class="v ed-mast-project">—</span>
    </span>
    <span class="ed-mast-col">
      <span class="no">02</span><span class="slash">/</span><span class="k">AGENT</span>
      <span class="sep">·</span><span class="v ed-mast-agent">—</span>
    </span>
  `;

  const right = document.createElement("div");
  right.className = "ed-mast-right";
  right.innerHTML = `
    <span class="ed-mast-issue"><span class="no">ISSUE №</span><span class="date">${issueDate()}</span></span>
    <span class="ed-mast-live is-idle"><span class="dot"></span><span class="label">LIVE</span></span>
    <span class="ed-mast-wc"><span class="wc-btn"></span><span class="wc-btn"></span><span class="wc-btn"></span></span>
  `;

  el.append(left, center, right);

  return {
    el,
    project: center.querySelector(".ed-mast-project") as HTMLElement,
    agent: center.querySelector(".ed-mast-agent") as HTMLElement,
    live: right.querySelector(".ed-mast-live") as HTMLElement,
  };
}

type Marquee = {
  el: HTMLElement;
  /** two identical content tracks so the loop is seamless */
  tracks: HTMLElement[];
  /** references to the fields inside each track (kept in parallel) */
  projects: HTMLElement[];
  tokens: HTMLElement[];
  ctxs: HTMLElement[];
  costs: HTMLElement[];
  latencies: HTMLElement[];
  turns: HTMLElement[];
  kickers: HTMLElement[];
};

function buildMarquee(): Marquee {
  const el = document.createElement("div");
  el.className = "ed-marquee";
  const lane = document.createElement("div");
  lane.className = "ed-marquee-lane";

  const projects: HTMLElement[] = [];
  const tokens: HTMLElement[] = [];
  const ctxs: HTMLElement[] = [];
  const costs: HTMLElement[] = [];
  const latencies: HTMLElement[] = [];
  const turns: HTMLElement[] = [];
  const kickers: HTMLElement[] = [];
  const tracks: HTMLElement[] = [];

  for (let i = 0; i < 2; i++) {
    const track = document.createElement("div");
    track.className = "ed-marquee-track";
    track.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    track.innerHTML = `
      <em class="ed-m-kicker">Long form coding</em>
      <span class="sep">—</span>
      <span class="ed-m-project">—</span>
      <span class="sep">·</span>
      <strong class="ed-m-tokens">—</strong>&nbsp;tokens
      <span class="sep">·</span>
      <strong class="ed-m-ctx">—</strong>&nbsp;ctx
      <span class="sep">·</span>
      <strong class="ed-m-cost">—</strong>&nbsp;spent
      <span class="sep">·</span>
      <strong class="ed-m-turns">—</strong>&nbsp;turns
      <span class="sep">·</span>
      <strong class="ed-m-lat">—</strong>&nbsp;clock
      <span class="ed-m-inf">∞</span>
    `;
    lane.append(track);
    tracks.push(track);
    kickers.push(track.querySelector(".ed-m-kicker") as HTMLElement);
    projects.push(track.querySelector(".ed-m-project") as HTMLElement);
    tokens.push(track.querySelector(".ed-m-tokens") as HTMLElement);
    ctxs.push(track.querySelector(".ed-m-ctx") as HTMLElement);
    costs.push(track.querySelector(".ed-m-cost") as HTMLElement);
    turns.push(track.querySelector(".ed-m-turns") as HTMLElement);
    latencies.push(track.querySelector(".ed-m-lat") as HTMLElement);
  }
  el.append(lane);

  return { el, tracks, projects, tokens, ctxs, costs, latencies, turns, kickers };
}

type Body = {
  el: HTMLElement;
  infinityHost: HTMLElement;
  headKicker: HTMLElement;
  headTitle: HTMLHeadingElement;
  thinkingPill: HTMLElement;
  thinkingLabel: HTMLElement;
  thinkingPct: HTMLElement;
  thinkingGlyph: HTMLElement;
  termHost: HTMLElement;
  termCwd: HTMLElement;
  termGit: HTMLElement;
  termAgent: HTMLElement;
};

function buildBody(): Body {
  const el = document.createElement("div");
  el.className = "ed-body";

  const backdrop = document.createElement("div");
  backdrop.className = "ed-backdrop";
  const infinityHost = document.createElement("div");
  infinityHost.className = "ed-backdrop-inner";
  backdrop.append(infinityHost);

  const headline = document.createElement("div");
  headline.className = "ed-headline";
  headline.innerHTML = `
    <div class="ed-kicker ed-kicker-text">AWAITING · FIRST · PROMPT</div>
    <h1 class="ed-head ed-head-title is-empty">The conversation has not yet begun.</h1>
  `;

  const thinkingPill = document.createElement("div");
  thinkingPill.className = "ed-thinking is-idle";
  thinkingPill.innerHTML = `<span class="ed-thinking-glyph" aria-hidden="true"></span><span class="label">PRINT RUN</span><span class="sep">·</span><span class="pct">—</span>`;

  const termWrap = document.createElement("div");
  termWrap.className = "ed-term-wrap";
  const termHeader = document.createElement("div");
  termHeader.className = "ed-term-header";
  termHeader.innerHTML = `
    <span class="ed-term-slash">/</span>
    <span class="ed-term-k">TERMINAL</span>
    <span class="ed-term-sep">·</span>
    <span class="ed-term-k">ZSH</span>
    <span class="ed-term-sep">·</span>
    <span class="ed-term-k ed-term-agent">—</span>
    <span class="ed-term-spacer"></span>
    <span class="ed-term-meta ed-term-cwd">—</span>
    <span class="ed-term-sep">·</span>
    <span class="ed-term-meta ed-term-git">—</span>
  `;
  const termHost = document.createElement("div");
  termHost.className = "ed-term-host";
  termWrap.append(termHeader, termHost);

  el.append(backdrop, headline, thinkingPill, termWrap);

  return {
    el,
    infinityHost,
    headKicker: headline.querySelector(".ed-kicker-text") as HTMLElement,
    headTitle: headline.querySelector(".ed-head-title") as HTMLHeadingElement,
    thinkingPill,
    thinkingLabel: thinkingPill.querySelector(".label") as HTMLElement,
    thinkingPct: thinkingPill.querySelector(".pct") as HTMLElement,
    thinkingGlyph: thinkingPill.querySelector(".ed-thinking-glyph") as HTMLElement,
    termHost,
    termCwd: termHeader.querySelector(".ed-term-cwd") as HTMLElement,
    termGit: termHeader.querySelector(".ed-term-git") as HTMLElement,
    termAgent: termHeader.querySelector(".ed-term-agent") as HTMLElement,
  };
}

type Stat = {
  el: HTMLElement;
  setValue(v: string | undefined, sub?: string, fillPct?: number): void;
};

function makeStat(kicker: string, defaultSub: string, accent = false): Stat {
  const el = document.createElement("article");
  el.className = `ed-stat${accent ? " is-accent" : ""} is-empty`;
  el.innerHTML = `
    <div class="ed-stat-kicker">${kicker}</div>
    <div class="ed-stat-num">—</div>
    <div class="ed-stat-rule"></div>
    <div class="ed-stat-sub">${defaultSub}</div>
  `;
  const num = el.querySelector(".ed-stat-num") as HTMLElement;
  const sub = el.querySelector(".ed-stat-sub") as HTMLElement;
  const rule = el.querySelector(".ed-stat-rule") as HTMLElement;
  let lastFill: number | null = null;
  return {
    el,
    setValue(v, s, fillPct) {
      if (v == null || v === "") return;
      el.classList.remove("is-empty");
      writeCell(num, v);
      if (s) writeCell(sub, s);
      if (fillPct != null) {
        const next = Math.max(0, Math.min(100, fillPct));
        if (next !== lastFill) {
          lastFill = next;
          rule.style.setProperty("--fill", `${next}%`);
          pulseEl(rule, "fill");
        }
      }
    },
  };
}

type SparkStat = {
  el: HTMLElement;
  update(snap: TokenRateSnapshot, sub: string | undefined): void;
};

function makeSparkStat(kicker: string): SparkStat {
  const el = document.createElement("article");
  el.className = "ed-stat is-spark is-empty";
  el.innerHTML = `
    <div class="ed-stat-kicker">${kicker}</div>
    <div class="ed-spark" aria-hidden="true">
      <svg viewBox="0 0 160 42" preserveAspectRatio="none">
        <g class="ed-spark-grid">
          <line x1="0" x2="160" y1="10" y2="10"/>
          <line x1="0" x2="160" y1="21" y2="21"/>
          <line x1="0" x2="160" y1="32" y2="32"/>
        </g>
        <polyline class="ed-spark-ink" fill="none" stroke-width="1.6" points=""/>
        <polyline class="ed-spark-red" fill="none" stroke-width="1.1" stroke-dasharray="2 2" points=""/>
      </svg>
    </div>
    <div class="ed-stat-sub">rolling · 30 min</div>
  `;
  const sub = el.querySelector(".ed-stat-sub") as HTMLElement;
  const inkLine = el.querySelector(".ed-spark-ink") as SVGPolylineElement;
  const redLine = el.querySelector(".ed-spark-red") as SVGPolylineElement;
  return {
    el,
    update(snap, s) {
      const hasData = snap.samples.some(
        (x) => x.tokenDelta > 0 || x.costDelta > 0,
      );
      if (hasData) el.classList.remove("is-empty");
      const paths = renderSparkPaths(snap);
      inkLine.setAttribute("points", paths.tokens);
      redLine.setAttribute("points", paths.cost);
      if (s) writeCell(sub, s);
    },
  };
}

type Stats = {
  el: HTMLElement;
  tokens: Stat;
  ctx: Stat;
  cost: Stat;
  block5h: Stat;
  block7d: Stat;
  life: Stat;
  spark: SparkStat;
};

function buildStats(): Stats {
  const el = document.createElement("div");
  el.className = "ed-stats";
  const tokens = makeStat("TOKENS", "this session");
  const ctx = makeStat("CTX WINDOW", "of max", true);
  const cost = makeStat("COST", "this session");
  const block5h = makeStat("5H BLOCK", "rolling");
  const block7d = makeStat("7D BLOCK", "rolling");
  const life = makeStat("LIFETIME", "cumulative");
  const spark = makeSparkStat("TOKEN RATE · 30MIN");
  el.append(tokens.el, ctx.el, cost.el, block5h.el, block7d.el, life.el, spark.el);
  return { el, tokens, ctx, cost, block5h, block7d, life, spark };
}

// ── application of session → DOM ─────────────────────────

type Refs = {
  masthead: Masthead;
  marquee: Marquee;
  body: Body;
  stats: Stats;
};

function apply(info: SessionInfo, rate: TokenRateSnapshot, r: Refs): void {
  const cwdTail = info.cwd ? info.cwd.split("/").filter(Boolean).pop() || info.cwd : undefined;
  const agentLabel = info.isClaudeCode
    ? "CLAUDE CODE"
    : info.binary
    ? info.binary.toUpperCase()
    : "GENERIC";
  const edMode = describeMode(info.mode);

  // masthead
  writeCell(
    r.masthead.project,
    cwdTail ? cwdTail.toUpperCase() : info.isMock ? "MOCK-STREAM" : undefined,
  );
  writeCell(r.masthead.agent, info.model ? info.model.toUpperCase() : agentLabel);
  r.masthead.live.classList.toggle("is-idle", !info.mode);

  // marquee: two parallel tracks — update both so the loop is seamless
  const projLabel = cwdTail ?? (info.isMock ? "mock-stream" : "untitled");
  const tokLabel = info.tokensLabel ?? formatTokens(info.aggregates.totalTokens);
  const ctxLabel = info.ctxPct != null ? `${info.ctxPct}%` : "—";
  const costLabel = info.costLabel ? `$${info.costLabel}` : formatCost(info.aggregates.totalCost);
  const turnsLabel = info.aggregates.updates > 0 ? String(info.aggregates.updates) : "—";
  const clockLabel = info.statusTime ?? info.timeHHMMSS;
  const kickerLabel = info.mode ? edMode.label : "Long form coding";

  for (let i = 0; i < r.marquee.tracks.length; i++) {
    writeCell(r.marquee.kickers[i], kickerLabel);
    writeCell(r.marquee.projects[i], projLabel);
    writeCell(r.marquee.tokens[i], tokLabel);
    writeCell(r.marquee.ctxs[i], ctxLabel);
    writeCell(r.marquee.costs[i], costLabel);
    writeCell(r.marquee.turns[i], turnsLabel);
    writeCell(r.marquee.latencies[i], clockLabel);
  }

  // headline is owned by the headline engine — see createHeadlineEngine

  // now-thinking pill — renders the current mode (default included). Claude
  // Code strips the symbol from the statusline when default is active, so
  // info.mode is undefined; we still show "DEFAULT MODE" + the pilcrow
  // glyph as long as we have any session signal. Falls back to idle only
  // before the first statusline read.
  const hasSession =
    info.mode != null ||
    info.ctxPct != null ||
    info.model != null ||
    info.isClaudeCode;
  r.body.thinkingPill.classList.remove("is-idle", "is-plan", "is-accept", "is-auto", "is-default");
  if (hasSession) {
    r.body.thinkingPill.classList.add(`is-${edMode.kind}`);
    writeCell(r.body.thinkingLabel, edMode.labelUpper);
    writeCell(r.body.thinkingPct, info.ctxPct != null ? `${info.ctxPct}%` : "·");
    swapModeGlyph(r.body.thinkingGlyph, edMode.kind);
  } else {
    r.body.thinkingPill.classList.add("is-idle");
  }

  // terminal header
  writeCell(r.body.termCwd, cwdTail ? `~/${cwdTail}` : undefined);
  writeCell(r.body.termAgent, (info.model ?? agentLabel).toString().toUpperCase());
  if (info.git && info.git !== "no git") {
    writeCell(r.body.termGit, info.git);
  } else if (info.git === "no git") {
    writeCell(r.body.termGit, "no git");
  }

  // stats
  const lifeTok = info.aggregates.totalTokens;
  const lifeCost = info.aggregates.totalCost;

  r.stats.tokens.setValue(
    info.tokensLabel,
    info.tokensLabel ? "stream" : undefined,
  );
  r.stats.ctx.setValue(
    info.ctxPct != null ? `${info.ctxPct}%` : undefined,
    info.ctxPct != null ? "of context" : undefined,
    info.ctxPct,
  );
  r.stats.cost.setValue(
    info.costLabel ? `$${info.costLabel}` : undefined,
    info.costLabel ? "this session" : undefined,
  );
  r.stats.block5h.setValue(
    info.block5hPct != null ? `${info.block5hPct}%` : undefined,
    info.block5hLeft ? `${info.block5hLeft} left · 5h` : undefined,
    info.block5hPct,
  );
  r.stats.block7d.setValue(
    info.block7dPct != null ? `${info.block7dPct}%` : undefined,
    info.block7dLeft ? `${info.block7dLeft} left · 7d` : undefined,
    info.block7dPct,
  );
  r.stats.life.setValue(
    lifeTok > 0 ? formatTokens(lifeTok) : undefined,
    lifeCost > 0 ? `${formatCost(lifeCost)} cumulative` : undefined,
  );

  const sparkSub =
    rate.avgTokenPerMin > 0
      ? `${formatTokens(Math.round(rate.avgTokenPerMin))}/min · avg`
      : "rolling · 30 min";
  r.stats.spark.update(rate, sparkSub);
}

function swapModeGlyph(host: HTMLElement, kind: ModeKind): void {
  if (host.dataset.mode === kind) return;
  host.dataset.mode = kind;
  host.replaceChildren(modeGlyph(kind));
}

function issueDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}·${dd}·${yy}`;
}

function renderHeadline(body: Body, h: Headline): void {
  writeCell(body.headKicker, h.kicker);
  writeCell(body.headTitle, h.title);
  body.headTitle.classList.toggle("is-empty", h.empty);
  if (h.empty) body.headTitle.removeAttribute("title");
  else body.headTitle.setAttribute("title", h.title);
}
