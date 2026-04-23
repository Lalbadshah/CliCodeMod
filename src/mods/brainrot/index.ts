import type { TerminalBus } from "../../bus";
import type { Mod } from "../types";
import { MOD_META } from "../registry";
import { mountXterm } from "../shared/xterm-host";
import { createToolCallTransformer } from "../shared/tool-call-transformer";
import { attachToolFeed } from "../shared/tool-overlay";
import { BRAINROT_ALIASES, BRAINROT_TOOL_STYLE } from "./aliases";
import { writeCell } from "../shared/cell";
import { createSessionBridge, formatTokens, type SessionInfo } from "../shared/session-info";
import { describeMode } from "../shared/mode";
import {
  buildBrainrotCaption,
  BRAINROT_SYSTEM,
  BRAINROT_BUBBLE_SYSTEM,
  buildToolAlias,
  buildBrainrotToolLine,
  buildBrainrotMarqueeTick,
  buildBrainrotMoodPick,
  buildBrainrotBubble,
  BRAINROT_MOODS,
  type BrainrotMood,
} from "../../llm/prompts";
import { formatMemeContext, sampleMemeContext } from "../../llm/meme-context";
import type { StreamHandle } from "../../llm/client";
import type { LlmStatus } from "../../llm/types";

// Feature flag — flip to `false` to revert to the plain-prompt bubble (no
// injected meme dictionary). The meme-context module itself is independent
// and can be deleted without touching the rest of the mod.
const INCLUDE_MEME_CONTEXT = true;
// How many slang entries to sample per bubble refresh. Larger = more
// vocabulary variety but more tokens spent on context.
const MEME_SAMPLE_SIZE = 16;
import "./styles.css";

const BRAINROT_VOICE =
  "Respond in gen-z brainrot dialect: 'fr fr', 'no cap', 'skibidi', 'sigma', 'rizz', 'bussin', 'ohio'. Stay technically accurate. Minimal emoji. Never drop the dialect.";

const TYPING_GIF_URL = new URL("./typing.gif", import.meta.url).href;

type Channel = {
  id: string;
  label: string;
  src: string;
  caption: string;
};

const TV_GIFS: Channel[] = [
  { id: "typing",   label: "TYPING", src: TYPING_GIF_URL, caption: "cooking 🔥" },
  { id: "thinking", label: "THINK",  src: "",             caption: "thinking…" },
  { id: "cooked",   label: "COOKED", src: "",             caption: "we cooked 💀" },
  { id: "goated",   label: "GOATED", src: "",             caption: "goated 🐐" },
];

const TYPING_QUIET_MS = 600;
const MAX_LIVE_TOOLS = 5;

const TOOL_EMOJI: Record<string, string> = {
  Read: "👀",
  Write: "✏️",
  Edit: "✏️",
  Bash: "⚡",
  BashOutput: "📤",
  Glob: "🔎",
  Grep: "🔎",
  Task: "🧠",
  WebFetch: "🌐",
  Fetch: "🌐",
  WebSearch: "🌐",
  NotebookEdit: "📓",
  TodoWrite: "✅",
  KillShell: "💀",
  SlashCommand: "⌘",
  AskUserQuestion: "🙋",
  ExitPlanMode: "🚢",
};

type ChipRefs = {
  el: HTMLElement;
  argsEl: HTMLElement;
  outputsEl: HTMLElement;
  stickerEl: HTMLElement;
  name: string;
  rawArgs?: string;
  llmArgs?: string;
  doneTimer?: number;
  exitTimer?: number;
  // Watchdog — if we never get a tool_end event, force-close after a while
  // so a stuck chip doesn't hold the sidebar hostage.
  stuckTimer?: number;
  startedAt: number;
  lastActivityAt: number;
  marqueeEl?: HTMLElement;
};

const CHIP_DONE_MS = 3200;
const CHIP_EXIT_MS = 4800;
const CHIP_EXIT_DURATION = 260;
// If a chip has been "cooking" this long with no output and no close, treat
// it as finished — covers cases where the Claude parser misses the summary.
const CHIP_STUCK_MS = 45_000;
// Bound how many tool chips we cycle through the marquee at once.
const MAX_MARQUEE_CHIPS = 6;
// How many recent tool names to feed the brain loop.
const BRAIN_TOOL_WINDOW = 8;

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

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

export function createBrainrotMod(): Mod {
  let teardown: (() => void) | null = null;

  return {
    id: "brainrot",
    meta: MOD_META.brainrot,
    voicePrompt: BRAINROT_VOICE,
    toolAliases: BRAINROT_ALIASES,
    toolLineStyle: BRAINROT_TOOL_STYLE,

    mount(root: HTMLElement, bus: TerminalBus) {
      const shell = document.createElement("div");
      shell.className = "br-shell";

      // ── TITLE BAR ────────────────────────────────
      const titlebar = document.createElement("div");
      titlebar.className = "br-titlebar";

      const dots = document.createElement("div");
      dots.className = "br-dots";
      for (const col of ["#ff5f57", "#febc2e", "#28c840"]) {
        const d = document.createElement("div");
        d.className = "br-dot";
        d.style.background = col;
        dots.append(d);
      }

      const title = document.createElement("div");
      title.className = "br-title";
      title.innerHTML = `✨ brainrot.term ✨ &nbsp; <span class="tag">fr fr no cap</span>`;

      const modePill = document.createElement("div");
      modePill.className = "br-mode-pill is-default";
      modePill.innerHTML = `<span class="emoji">✨</span><span class="label">default</span>`;

      const version = document.createElement("div");
      version.className = "br-version";
      version.textContent = "v 4.20.69 · slay edition";

      const modelStatus = document.createElement("div");
      modelStatus.className = "br-model-status is-offline";
      modelStatus.innerHTML =
        `<span class="br-ms-dot"></span>` +
        `<span class="br-ms-label">model offline fr</span>`;
      const modelLabel = modelStatus.querySelector(".br-ms-label") as HTMLElement;

      titlebar.append(dots, title, modePill, modelStatus, version);

      const renderModelStatus = (s: LlmStatus): void => {
        const cls = !s.enabled || s.error
          ? "is-offline"
          : s.loading
            ? "is-loading"
            : s.available
              ? "is-live"
              : "is-offline";
        modelStatus.className = `br-model-status ${cls}`;
        const prettyId = s.activeModelId
          ? s.activeModelId.replace(/[-_]/g, " ")
          : "local ai";
        const label =
          cls === "is-live"    ? `${prettyId} locked in 🔒` :
          cls === "is-loading" ? "loading model…" :
                                 "model offline fr";
        writeCell(modelLabel, label);
      };

      // Session snapshot referenced by multiple renderers below — declared
      // up-front so the renderMarquee closure doesn't hit the TDZ when it's
      // called before the session subscribe fires.
      let lastAliasInfo: SessionInfo | null = null;

      // ── MARQUEE ──────────────────────────────────
      const marquee = document.createElement("div");
      marquee.className = "br-marquee";
      const marqueeTrack = document.createElement("div");
      marqueeTrack.className = "br-marquee-track";
      marquee.append(marqueeTrack);

      // Mutable marquee state — rebuilt whenever tool chips / llm zingers
      // change. Two copies concatenated so the scroll loops seamlessly.
      const marqueeChips: Array<{ emoji: string; alias: string; text: string }> = [];
      let marqueeZinger = "";
      const renderMarquee = (): void => {
        const info = lastAliasInfo;
        const tokens = info?.tokensLabel || "—";
        const ctx = info?.ctxPct != null ? `${info.ctxPct}%` : "—";
        const cost = info?.costLabel ? `$${info.costLabel}` : "$—";
        const lat = info?.statusTime || "—";
        const staticSeg = `
          ⚡ refactor cooked &nbsp;·&nbsp;
          tokens <span class="br-mq-in">${escapeHtml(tokens)}</span> &nbsp;·&nbsp;
          ctx <span class="br-mq-out">${escapeHtml(ctx)}</span> &nbsp;·&nbsp;
          cost <span class="br-mq-cost">${escapeHtml(cost)}</span> &nbsp;·&nbsp;
          latency <span class="br-mq-lat">${escapeHtml(lat)}</span> &nbsp;·&nbsp;
          <span class="pink">claude is locked in 🔒</span>
        `;
        const zingerSeg = marqueeZinger
          ? ` &nbsp;·&nbsp; <span class="yellow">${escapeHtml(marqueeZinger)}</span>`
          : "";
        const chipsSeg = marqueeChips
          .map(
            (c) =>
              `<span class="br-mq-chip"><span class="e">${c.emoji}</span>` +
              `<b>${escapeHtml(c.alias)}</b>` +
              `<i>${escapeHtml(c.text)}</i></span>`,
          )
          .join(" ");
        const seg = `${staticSeg}${zingerSeg}${chipsSeg ? " &nbsp;·&nbsp; " + chipsSeg : ""}`;
        marqueeTrack.innerHTML = `<span>${seg}</span><span>${seg}</span>`;
      };
      renderMarquee();

      // ── BODY (sidebar + main) ────────────────────
      const body = document.createElement("div");
      body.className = "br-body";

      // -- Sidebar: live "tools rn" feed + vibe check
      const aside = document.createElement("aside");
      aside.className = "br-aside";

      const asideHead = document.createElement("div");
      asideHead.className = "br-aside-head";
      asideHead.innerHTML = `<span class="br-live-pill">LIVE</span>tools rn`;
      aside.append(asideHead);

      const toolsList = document.createElement("div");
      toolsList.className = "br-tools-list";
      aside.append(toolsList);

      const vibe = document.createElement("div");
      vibe.className = "br-vibe";
      vibe.innerHTML = `
        <b>vibe check 📊</b><br/>
        mode: <span class="br-vibe-mode">default</span><br/>
        ctx used: <span class="br-vibe-ctx">—</span> 🧠<br/>
        tools fired: <span class="br-vibe-tools accent">0</span>
      `;
      aside.append(vibe);

      // -- Main: terminal + TV + speech bubble
      const main = document.createElement("div");
      main.className = "br-main";

      const bubble = document.createElement("div");
      bubble.className = "br-bubble";
      const bubbleInner = document.createElement("span");
      bubbleInner.className = "br-bubble-inner";
      bubbleInner.textContent = "claude said let him cook";
      bubble.append(bubbleInner);
      let bubbleText = bubbleInner.textContent || "";

      const termWrap = document.createElement("div");
      termWrap.className = "br-term-wrap";

      const termHeader = document.createElement("div");
      termHeader.className = "br-term-header";
      termHeader.innerHTML = `
        <span class="left br-term-prompt">$ ~/repo · main</span>
        <span class="right br-term-status is-idle">😴 idle</span>
      `;
      const termPrompt = termHeader.querySelector(".br-term-prompt") as HTMLElement;
      const termStatus = termHeader.querySelector(".br-term-status") as HTMLElement;

      const termHost = document.createElement("div");
      termHost.className = "br-term-host";

      const fxLayer = document.createElement("div");
      fxLayer.className = "br-fx-layer";
      termHost.append(fxLayer);

      termWrap.append(termHeader, termHost);

      // -- TV (overlaps the terminal at bottom-right)
      const tv = document.createElement("div");
      tv.className = "br-tv";

      const tvBody = document.createElement("div");
      tvBody.className = "br-tv-body";

      const antenna = document.createElement("div");
      antenna.className = "br-tv-antenna";
      antenna.innerHTML = `
        <div class="rod left"></div>
        <div class="rod right"></div>
        <div class="ball"></div>
      `;

      const screen = document.createElement("div");
      screen.className = "br-tv-screen";

      const slot = document.createElement("div");
      slot.className = "slot";
      screen.append(slot);

      const scanlines = document.createElement("div");
      scanlines.className = "br-tv-scanlines";
      const glare = document.createElement("div");
      glare.className = "br-tv-glare";
      const caption = document.createElement("div");
      caption.className = "br-tv-caption";
      screen.append(scanlines, glare, caption);

      const recDot = document.createElement("div");
      recDot.className = "br-tv-rec";
      recDot.innerHTML = `<span class="br-tv-rec-dot"></span>LIVE`;
      recDot.style.display = "none";
      screen.append(recDot);

      const dials = document.createElement("div");
      dials.className = "br-tv-dials";
      const channelRow = document.createElement("div");
      channelRow.className = "br-tv-channels";
      const channelButtons: HTMLButtonElement[] = [];
      TV_GIFS.forEach((g, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "br-tv-ch";
        btn.textContent = String(i + 1);
        btn.title = g.label;
        btn.addEventListener("click", () => setChannel(i));
        // Don't steal terminal focus when clicking the button.
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        channelRow.append(btn);
        channelButtons.push(btn);
      });
      const knobs = document.createElement("div");
      knobs.className = "br-tv-knobs";
      knobs.innerHTML = `<div class="br-tv-knob"></div><div class="br-tv-knob"></div>`;
      dials.append(channelRow, knobs);

      const tvLabel = document.createElement("div");
      tvLabel.className = "br-tv-label";

      tvBody.append(antenna, screen, dials, tvLabel);
      tv.append(tvBody);

      main.append(bubble, termWrap, tv);

      // ── STATS STRIP ──────────────────────────────
      const stats = document.createElement("div");
      stats.className = "br-stats";

      const statDefs = [
        { key: "in",   lab: "tokens in",  val: "184k",  col: "var(--cyan)",   emoji: "⬇️" },
        { key: "out",  lab: "tokens out", val: "49k",   col: "var(--pink)",   emoji: "⬆️" },
        { key: "cost", lab: "cost",       val: "$3.42", col: "var(--lime)",   emoji: "💸" },
        { key: "turns",lab: "turns",      val: "127",   col: "var(--yellow)", emoji: "🔄" },
        { key: "lat",  lab: "latency",    val: "412ms", col: "var(--purple)", emoji: "⚡", light: true },
        { key: "rizz", lab: "rizz score", val: "9001",  col: "var(--pink)",   emoji: "🔥" },
      ];
      const statVals: Record<string, HTMLElement> = {};
      statDefs.forEach((s, i) => {
        const el = document.createElement("div");
        el.className = "br-stat" + (s.light ? " is-light" : "");
        el.style.background = s.col;
        el.style.transform = `rotate(${(i % 2 ? -1 : 1) * 1.5}deg)`;
        el.innerHTML = `
          <div class="br-stat-lab">${s.emoji} ${s.lab}</div>
          <div class="br-stat-val">${s.val}</div>
        `;
        statVals[s.key] = el.querySelector(".br-stat-val") as HTMLElement;
        stats.append(el);
      });

      const mood = document.createElement("div");
      mood.className = "br-mood";
      mood.innerHTML = `mood: <b class="br-mood-text">locked in 🔒</b>`;
      const moodText = mood.querySelector(".br-mood-text") as HTMLElement;
      stats.append(mood);

      body.append(aside, main);
      shell.append(titlebar, marquee, body, stats);
      root.append(shell);

      // ── Live tool feed state ─────────────────────
      let toolsFired = 0;
      const vibeTools = vibe.querySelector(".br-vibe-tools") as HTMLElement;
      const vibeMode  = vibe.querySelector(".br-vibe-mode") as HTMLElement;
      const chips = new Map<string, ChipRefs>();
      // Mutable — the transformer reads this per-line, so LLM-generated aliases
      // we drop in here are picked up on the next matching tool-call line.
      const liveAliases: Record<string, string> = { ...BRAINROT_ALIASES };
      // Chips keyed by *tool name* (all chips for a given raw tool) so we can
      // retroactively rename them when the LLM alias lands.
      const chipsByName = new Map<string, Set<ChipRefs>>();
      const aliasPending = new Set<string>();
      const aliasFromLlm = new Set<string>();
      const aliasStreams = new Set<StreamHandle>();
      // All active LLM streams so unmount can cancel cleanly.
      const liveStreams = new Set<StreamHandle>();
      // Rolling window of recent tool names for brain prompts.
      const recentToolNames: string[] = [];
      // LLM-picked mood drives the mood sticker + color. null = let the
      // mode-derived mood win (classic behavior).
      let brainMood: BrainrotMood | null = null;
      let brainMoodText: string | null = null;

      const trackStream = (h: StreamHandle): StreamHandle => {
        liveStreams.add(h);
        h.text.finally(() => liveStreams.delete(h));
        return h;
      };

      const emptyState = document.createElement("div");
      emptyState.className = "br-tool-empty";
      emptyState.textContent = "no tools yet · fire off a prompt fr";
      toolsList.append(emptyState);

      const renderEmpty = (): void => {
        emptyState.style.display = toolsList.querySelector(".br-tool") ? "none" : "";
      };

      const trimChips = (): void => {
        const rows = toolsList.querySelectorAll<HTMLElement>(".br-tool:not(.is-exit)");
        for (let i = MAX_LIVE_TOOLS; i < rows.length; i++) {
          exitChip(rows[i]);
        }
      };

      const exitChip = (el: HTMLElement): void => {
        if (el.classList.contains("is-exit")) return;
        const id = el.dataset.toolId;
        if (id) {
          const c = chips.get(id);
          if (c?.doneTimer) window.clearTimeout(c.doneTimer);
          if (c?.exitTimer) window.clearTimeout(c.exitTimer);
          if (c?.stuckTimer) window.clearTimeout(c.stuckTimer);
          chips.delete(id);
          if (c) {
            for (const [name, set] of chipsByName) {
              if (set.delete(c) && set.size === 0) chipsByName.delete(name);
            }
          }
        }
        el.classList.add("is-exit");
        window.setTimeout(() => {
          el.remove();
          renderEmpty();
        }, CHIP_EXIT_DURATION);
      };

      // Push a mini card to the marquee and drop the oldest when we hit
      // the window cap. We keep the MarqueeEl reference on the chip so an
      // updated llm line / close status can flow through to the marquee.
      const addMarqueeChip = (chip: ChipRefs, alias: string, text: string): void => {
        const emoji = TOOL_EMOJI[chip.name] ?? "🛠️";
        marqueeChips.push({ emoji, alias, text });
        while (marqueeChips.length > MAX_MARQUEE_CHIPS) marqueeChips.shift();
        renderMarquee();
      };
      const updateMarqueeChipForChip = (chip: ChipRefs): void => {
        // Find the latest marquee chip that matches this chip's alias/name
        // and replace its text in-place. Chips are pushed newest-last so
        // searching from the end is fine.
        const alias = liveAliases[chip.name] ?? chip.name.toLowerCase();
        const text = chip.llmArgs || chip.rawArgs || "";
        for (let i = marqueeChips.length - 1; i >= 0; i--) {
          const c = marqueeChips[i];
          if (c.alias === alias && c.text !== text) {
            c.text = text;
            renderMarquee();
            return;
          }
        }
      };

      // ── XTERM ────────────────────────────────────
      const xt = mountXterm(termHost, bus, {
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.0,
        dataTransform: createToolCallTransformer({
          aliases: liveAliases,
          style: BRAINROT_TOOL_STYLE,
          prefixFor: (name) => TOOL_EMOJI[name],
        }),
        theme: {
          background: "#0a0a14",
          foreground: "#e6f0ff",
          cursor: "#9cf04a",
          cursorAccent: "#0a0a14",
          selectionBackground: "rgba(255,79,181,0.35)",
          black: "#0a0a14",
          red: "#ff4fb5",
          green: "#9cf04a",
          yellow: "#ffd83a",
          blue: "#3ad8ff",
          magenta: "#ff4fb5",
          cyan: "#3ad8ff",
          white: "#e6f0ff",
          brightBlack: "#7a8aa8",
          brightRed: "#ff83c7",
          brightGreen: "#baff7a",
          brightYellow: "#fff066",
          brightBlue: "#7bdcff",
          brightMagenta: "#ff9dd0",
          brightCyan: "#7fe5ff",
          brightWhite: "#ffffff",
        },
      });

      // ── TV typing-detection state ────────────────
      let channel = 0;
      let isTyping = false;
      let quietTimer: number | null = null;

      const renderTv = () => {
        const g = TV_GIFS[channel];
        const playing = isTyping && !!g.src;

        slot.innerHTML = "";
        if (playing) {
          const img = document.createElement("img");
          img.src = `${g.src}#k=${Date.now()}`;
          img.alt = g.label;
          slot.append(img);
        } else {
          const frozen = document.createElement("div");
          frozen.className = "br-tv-frozen";
          frozen.innerHTML = `
            <div class="emoji">📺</div>
            <div>${g.src ? "⏸ paused — type to play" : "⏸ slot empty"}</div>
          `;
          slot.append(frozen);
        }

        recDot.style.display = playing ? "flex" : "none";
        caption.textContent = g.caption;
        tvLabel.textContent = `CH·${channel + 1}  —  ${g.label}`;

        channelButtons.forEach((btn, i) => {
          btn.classList.toggle("is-active", i === channel);
        });

        termStatus.textContent = isTyping ? "⌨️ TYPING…" : "😴 idle";
        termStatus.classList.toggle("is-idle", !isTyping);
      };

      const setChannel = (i: number) => {
        if (channel === i) return;
        channel = i;
        renderTv();
      };

      const bumpTyping = () => {
        if (!isTyping) {
          isTyping = true;
          renderTv();
        }
        if (quietTimer != null) window.clearTimeout(quietTimer);
        quietTimer = window.setTimeout(() => {
          isTyping = false;
          quietTimer = null;
          renderTv();
        }, TYPING_QUIET_MS);
      };

      // ── Typing FX (floating chars + Enter/Space specials) ────
      const FX_COLORS = [
        "var(--pink)",
        "var(--cyan)",
        "var(--yellow)",
        "var(--lime)",
        "var(--purple)",
      ];
      const BANNER_TEXTS = [
        "LET HIM COOK 🔥",
        "SKIBIDI SENT 🚀",
        "NO CAP 💯",
        "SIGMA MOVE 🗿",
        "SHIP IT 🛳️",
        "GOATED 🐐",
        "BUSSIN 💥",
        "FR FR ⚡",
      ];
      const SPARKLES = ["✨", "💫", "⭐", "🌟", "💖"];
      const MAX_FX = 80;

      const cursorPx = (): { x: number; y: number } => {
        const rect = termHost.getBoundingClientRect();
        try {
          const core: any = (xt.term as any)._core;
          const dims = core?._renderService?.dimensions?.css?.cell;
          if (dims && dims.width > 0 && dims.height > 0) {
            const buf = xt.term.buffer.active;
            const x = buf.cursorX * dims.width + dims.width * 0.6;
            const y = buf.cursorY * dims.height + dims.height * 0.5;
            return {
              x: Math.max(12, Math.min(rect.width - 12, x)),
              y: Math.max(12, Math.min(rect.height - 12, y)),
            };
          }
        } catch { /* fall through */ }
        return {
          x: rect.width * (0.18 + Math.random() * 0.35),
          y: rect.height * (0.7 + Math.random() * 0.2),
        };
      };

      const pickColor = (): string =>
        FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];

      const capFx = (): void => {
        while (fxLayer.childElementCount >= MAX_FX) {
          fxLayer.firstElementChild?.remove();
        }
      };

      const attachFx = (el: HTMLElement): void => {
        el.addEventListener("animationend", () => el.remove(), { once: true });
        capFx();
        fxLayer.append(el);
      };

      const spawnCharFloat = (ch: string): void => {
        const { x, y } = cursorPx();
        const el = document.createElement("div");
        el.className = "br-fx-char";
        el.textContent = ch;
        el.style.left = `${x + (Math.random() - 0.5) * 14}px`;
        el.style.top = `${y + (Math.random() - 0.5) * 8}px`;
        el.style.color = pickColor();
        el.style.setProperty("--br-fx-rot", `${(Math.random() - 0.5) * 50}deg`);
        el.style.setProperty("--br-fx-drift", `${(Math.random() - 0.5) * 30}px`);
        attachFx(el);
      };

      const spawnSparkleBurst = (): void => {
        const { x, y } = cursorPx();
        const count = 7;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
          const dist = 22 + Math.random() * 22;
          const el = document.createElement("div");
          el.className = "br-fx-sparkle";
          el.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
          el.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
          el.style.animationDelay = `${Math.random() * 60}ms`;
          attachFx(el);
        }
      };

      const spawnEnterBanner = (): void => {
        const banner = document.createElement("div");
        banner.className = "br-fx-banner";
        banner.textContent =
          BANNER_TEXTS[Math.floor(Math.random() * BANNER_TEXTS.length)];
        attachFx(banner);
        for (let i = 0; i < 14; i++) {
          const c = document.createElement("div");
          c.className = "br-fx-confetti";
          c.style.left = `${10 + Math.random() * 80}%`;
          c.style.top = `${20 + Math.random() * 40}%`;
          c.style.background = pickColor();
          c.style.setProperty("--br-fx-dx", `${(Math.random() - 0.5) * 260}px`);
          c.style.setProperty("--br-fx-rot", `${(Math.random() - 0.5) * 900}deg`);
          c.style.animationDelay = `${Math.random() * 160}ms`;
          attachFx(c);
        }
      };

      const spawnPop = (): void => {
        const { x, y } = cursorPx();
        const el = document.createElement("div");
        el.className = "br-fx-pop";
        el.textContent = "💨";
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        attachFx(el);
      };

      const applyTypingFx = (data: string): void => {
        if (!data || data.startsWith("\x1b")) return;
        let spawned = 0;
        const MAX_PER_CALL = 10;
        for (const ch of data) {
          if (spawned >= MAX_PER_CALL) break;
          if (ch === "\r" || ch === "\n") {
            spawnEnterBanner();
            spawned += 3;
          } else if (ch === " ") {
            spawnSparkleBurst();
            spawned += 2;
          } else if (ch === "\x7f" || ch === "\b") {
            spawnPop();
            spawned += 1;
          } else if (ch >= " ") {
            spawnCharFloat(ch);
            spawned += 1;
          }
        }
      };

      const typingDisp = xt.term.onData((d) => {
        bumpTyping();
        applyTypingFx(d);
      });

      // ── Tool-event sidebar chips + in-terminal stickers ──
      const spawnToolSticker = (emoji: string, alias: string): void => {
        const { x, y } = cursorPx();
        const el = document.createElement("div");
        el.className = "br-fx-toolchip";
        el.innerHTML = `<span class="e">${emoji}</span>${escapeHtml(alias.toUpperCase())}`;
        el.style.left = `${x + 8}px`;
        el.style.top = `${y - 18}px`;
        attachFx(el);
      };

      const requestLlmAlias = (name: string): void => {
        const llm = bus.llm;
        if (!llm?.isAvailable()) return;
        if (aliasFromLlm.has(name) || aliasPending.has(name)) return;
        const info = lastAliasInfo;
        aliasPending.add(name);
        let buf = "";
        const handle = llm.stream(
          buildToolAlias(name, info ?? ({} as unknown as SessionInfo)),
          (tok) => { buf += tok; },
          { systemPrompt: BRAINROT_SYSTEM, maxTokens: 16, temperature: 1.1, stop: ["\n"] },
        );
        aliasStreams.add(handle);
        handle.text
          .then((full) => {
            const clean = (full || buf)
              .trim()
              .replace(/^["'`]|["'`]$/g, "")
              .replace(/\s+/g, " ")
              .split(/[\n.!?]/)[0]
              .trim()
              .slice(0, 18);
            if (clean && clean.length >= 2) {
              liveAliases[name] = clean.toLowerCase();
              aliasFromLlm.add(name);
              const rows = chipsByName.get(name);
              if (rows) {
                for (const chip of rows) {
                  const nameEl = chip.el.querySelector(".br-tool-name") as HTMLElement | null;
                  if (nameEl) writeCell(nameEl, liveAliases[name]);
                  updateMarqueeChipForChip(chip);
                }
              }
            }
          })
          .catch(() => { /* fall back to static alias */ })
          .finally(() => {
            aliasPending.delete(name);
            aliasStreams.delete(handle);
          });
      };

      // Ask the local model for a 1-liner replacement of the args text on
      // this chip. The return gets applied in-place to both the sidebar
      // card and the mini marquee chip for a consistent theme-wide voice.
      const requestLlmToolLine = (
        chip: ChipRefs,
        summary?: string,
      ): void => {
        const llm = bus.llm;
        if (!llm?.isAvailable()) return;
        const info = lastAliasInfo ?? ({} as unknown as SessionInfo);
        let buf = "";
        const handle = llm.stream(
          buildBrainrotToolLine(chip.name, chip.rawArgs, summary, info),
          (tok) => { buf += tok; },
          { systemPrompt: BRAINROT_SYSTEM, maxTokens: 22, temperature: 1.15, stop: ["\n"] },
        );
        trackStream(handle);
        handle.text
          .then((full) => {
            const clean = (full || buf)
              .trim()
              .replace(/^["'`]|["'`]$/g, "")
              .replace(/\s+/g, " ")
              .split(/[\n]/)[0]
              .trim()
              .slice(0, 72);
            if (!clean || clean.length < 3) return;
            chip.llmArgs = clean;
            // Prefer the LLM line for display — it's the themed voice the
            // mod promises. Only skip if the chip has already exited.
            if (chip.el.isConnected) {
              writeCell(chip.argsEl, clean);
              chip.argsEl.classList.remove("is-empty");
            }
            updateMarqueeChipForChip(chip);
          })
          .catch(() => { /* keep raw args */ });
      };

      const addChip = (ev: { id: string; name: string; args?: string }): void => {
        const alias = liveAliases[ev.name] ?? ev.name.toLowerCase();
        const emoji = TOOL_EMOJI[ev.name] ?? "🛠️";

        const row = document.createElement("div");
        row.className = "br-tool is-cooking";
        row.dataset.toolId = ev.id;
        row.innerHTML = `
          <div class="br-tool-head">
            <span class="br-tool-emoji">${emoji}</span>
            <span class="br-tool-name"></span>
            <span class="br-tool-sticker">COOKING</span>
          </div>
          <div class="br-tool-args"></div>
          <div class="br-tool-outputs"></div>
        `;
        const nameEl    = row.querySelector(".br-tool-name")    as HTMLElement;
        const argsEl    = row.querySelector(".br-tool-args")    as HTMLElement;
        const outputsEl = row.querySelector(".br-tool-outputs") as HTMLElement;
        const stickerEl = row.querySelector(".br-tool-sticker") as HTMLElement;
        nameEl.textContent = alias;
        if (ev.args) argsEl.textContent = clamp(ev.args, 64);
        else argsEl.classList.add("is-empty");

        toolsList.prepend(row);
        const now = Date.now();
        const chip: ChipRefs = {
          el: row,
          argsEl,
          outputsEl,
          stickerEl,
          name: ev.name,
          rawArgs: ev.args,
          startedAt: now,
          lastActivityAt: now,
        };
        chips.set(ev.id, chip);
        let nameSet = chipsByName.get(ev.name);
        if (!nameSet) {
          nameSet = new Set();
          chipsByName.set(ev.name, nameSet);
        }
        nameSet.add(chip);
        renderEmpty();
        trimChips();

        toolsFired += 1;
        writeCell(vibeTools, String(toolsFired));
        spawnToolSticker(emoji, alias);

        // Watchdog: if the Claude profile misses the end event, this force
        // closes the chip so the sidebar doesn't gum up with stale cookers.
        chip.stuckTimer = window.setTimeout(() => {
          if (!chip.el.isConnected || !chip.el.classList.contains("is-cooking")) return;
          finalizeChip(chip, chip.rawArgs || "wrapped (timeout)");
        }, CHIP_STUCK_MS);

        // Mini chip in the marquee — starts with raw args; rewritten when
        // the LLM one-liner lands.
        addMarqueeChip(chip, alias, ev.args ? clamp(ev.args, 50) : "cooking");

        // Track this tool in the brain-loop's recent window.
        recentToolNames.unshift(ev.name);
        if (recentToolNames.length > BRAIN_TOOL_WINDOW) recentToolNames.length = BRAIN_TOOL_WINDOW;

        // If this tool has no hand-curated alias, ask the LLM to coin one.
        // The result lands in liveAliases for the next call + renames the
        // current chip in place when it resolves.
        if (!BRAINROT_ALIASES[ev.name]) requestLlmAlias(ev.name);
        // Always ask for a themed 1-liner for the chip's args text. We
        // try right away on tool_start; closeChip may re-fire with richer
        // summary context.
        requestLlmToolLine(chip);
      };

      const flashChip = (chip: ChipRefs): void => {
        chip.el.classList.remove("is-flash");
        void chip.el.offsetWidth;
        chip.el.classList.add("is-flash");
      };

      const addOutput = (ev: { toolId: string; text: string }): void => {
        const chip = chips.get(ev.toolId);
        if (!chip) return;
        const text = ev.text.trim();
        if (!text) return;
        chip.lastActivityAt = Date.now();
        const line = document.createElement("div");
        line.className = "br-tool-output";
        line.textContent = clamp(text, 60);
        chip.outputsEl.append(line);
        while (chip.outputsEl.children.length > 3) {
          chip.outputsEl.firstElementChild?.remove();
        }
        flashChip(chip);
      };

      // Shared finalizer — handles both the real tool_end and the stuck
      // watchdog. Safe to call multiple times; second call is a no-op.
      const finalizeChip = (chip: ChipRefs, summary?: string): void => {
        if (!chip.el.classList.contains("is-cooking")) return;
        if (chip.stuckTimer) {
          window.clearTimeout(chip.stuckTimer);
          chip.stuckTimer = undefined;
        }
        chip.el.classList.remove("is-cooking");
        chip.el.classList.add("is-ok");
        chip.stickerEl.textContent = "OK";

        // Only overwrite args if we don't already have an LLM-generated
        // one-liner — preserving the themed voice.
        if (!chip.llmArgs && summary && chip.argsEl.classList.contains("is-empty")) {
          chip.argsEl.textContent = clamp(summary, 64);
          chip.argsEl.classList.remove("is-empty");
        }
        // Fire a richer LLM rewrite now that we actually have a summary.
        if (summary) {
          requestLlmToolLine(chip, summary);
        }

        chip.el.classList.remove("is-pop");
        void chip.el.offsetWidth;
        chip.el.classList.add("is-pop");

        chip.doneTimer = window.setTimeout(() => {
          chip.el.classList.add("is-fading");
        }, CHIP_DONE_MS);
        chip.exitTimer = window.setTimeout(() => {
          exitChip(chip.el);
        }, CHIP_EXIT_MS);
      };

      const closeChip = (ev: { toolId: string; summary?: string }): void => {
        const chip = chips.get(ev.toolId);
        if (!chip) return;
        finalizeChip(chip, ev.summary);
      };

      const toolFeed = attachToolFeed({
        bus,
        onStart: addChip,
        onOutput: addOutput,
        onEnd: closeChip,
      });

      // ── SESSION INFO → stat + mode overlay ───────
      const session = createSessionBridge(xt.term, bus);

      let lastCaptionPrompt: string | undefined;
      let lastCaptionAt = 0;
      let activeCaption: StreamHandle | null = null;
      const CAPTION_MIN_GAP_MS = 6000;

      const refreshCaption = (info: SessionInfo): void => {
        const llm = bus.llm;
        if (!llm || !llm.isAvailable()) return;
        if (!info.lastPrompt || info.lastPrompt === lastCaptionPrompt) return;
        const now = Date.now();
        if (now - lastCaptionAt < CAPTION_MIN_GAP_MS) return;
        lastCaptionPrompt = info.lastPrompt;
        lastCaptionAt = now;

        activeCaption?.cancel();
        let buffer = "";
        caption.textContent = "…";
        activeCaption = llm.stream(
          buildBrainrotCaption(info),
          (tok) => {
            buffer += tok;
            caption.textContent = buffer.slice(0, 80);
          },
          { systemPrompt: BRAINROT_SYSTEM, maxTokens: 24, temperature: 1.15, stop: ["\n"] },
        );
        activeCaption.text
          .then((t) => {
            const clean = t.trim().replace(/^["']|["']$/g, "").slice(0, 80);
            if (clean) caption.textContent = clean;
          })
          .catch(() => { /* keep whatever streamed in */ });
      };

      // ── Brain loop: LLM-driven mood + marquee zinger ──
      //
      // Every few seconds we feed the model the session state + recent tool
      // activity and ask it to pick a mood tag and emit a marquee zinger.
      // Requests serialize on the single llama session.
      let moodStream: StreamHandle | null = null;
      let zingerStream: StreamHandle | null = null;
      let brainTimer: number | null = null;

      const moodLabel = (m: BrainrotMood): { text: string; emoji: string } => {
        switch (m) {
          case "locked_in": return { text: "locked in", emoji: "🔒" };
          case "cooking":   return { text: "cooking",   emoji: "👨‍🍳" };
          case "cooked":    return { text: "cooked",    emoji: "💀" };
          case "goated":    return { text: "goated",    emoji: "🐐" };
          case "mid":       return { text: "mid",       emoji: "😐" };
          case "washed":    return { text: "washed",    emoji: "🧼" };
          case "ohio":      return { text: "ohio",      emoji: "😬" };
          case "sigma":     return { text: "sigma",     emoji: "🗿" };
        }
      };

      const applyBrainMood = (tag: BrainrotMood): void => {
        brainMood = tag;
        const m = moodLabel(tag);
        brainMoodText = `${m.text} ${m.emoji}`;
        writeCell(moodText, brainMoodText);
      };

      const runMoodPick = (): void => {
        const llm = bus.llm;
        if (!llm?.isAvailable()) return;
        const info = lastAliasInfo;
        if (!info) return;
        moodStream?.cancel();
        let buf = "";
        moodStream = llm.stream(
          buildBrainrotMoodPick(info, recentToolNames),
          (tok) => { buf += tok; },
          { systemPrompt: BRAINROT_SYSTEM, maxTokens: 6, temperature: 0.8, stop: ["\n"] },
        );
        trackStream(moodStream);
        moodStream.text
          .then((t) => {
            const tag = t
              .trim()
              .toLowerCase()
              .replace(/[^a-z_]/g, "")
              .slice(0, 20);
            if ((BRAINROT_MOODS as readonly string[]).includes(tag)) {
              applyBrainMood(tag as BrainrotMood);
            }
          })
          .catch(() => { /* keep previous mood */ });
      };

      const runMarqueeZinger = (): void => {
        const llm = bus.llm;
        if (!llm?.isAvailable()) return;
        const info = lastAliasInfo;
        if (!info) return;
        zingerStream?.cancel();
        let buf = "";
        zingerStream = llm.stream(
          buildBrainrotMarqueeTick(info, recentToolNames),
          (tok) => { buf += tok; },
          { systemPrompt: BRAINROT_SYSTEM, maxTokens: 16, temperature: 1.1, stop: ["\n"] },
        );
        trackStream(zingerStream);
        zingerStream.text
          .then((t) => {
            const clean = t
              .trim()
              .replace(/^["']|["']$/g, "")
              .replace(/\s+/g, " ")
              .split(/\n/)[0]
              .trim()
              .slice(0, 60);
            if (clean) {
              marqueeZinger = clean.toUpperCase();
              renderMarquee();
            }
          })
          .catch(() => { /* no zinger */ });
      };

      const scheduleBrain = (): void => {
        if (brainTimer != null) return;
        brainTimer = window.setInterval(() => {
          // Mood first (cheap, shapes the sticker), then zinger (ambient).
          // They queue on the single llm session in this order.
          runMoodPick();
          runMarqueeZinger();
        }, 24_000);
      };

      // ── Bubble refresh: new brainrot line every 30s with a different ──
      // ── entry animation each time ────────────────────────────────────
      const BUBBLE_VARIANTS = [
        "glitch",
        "slide",
        "flip",
        "stamp",
        "sweep",
        "cascade",
      ] as const;
      type BubbleVariant = (typeof BUBBLE_VARIANTS)[number];
      let lastBubbleVariant: BubbleVariant | null = null;
      const pickBubbleVariant = (): BubbleVariant => {
        const pool = BUBBLE_VARIANTS.filter((v) => v !== lastBubbleVariant);
        const v = pool[Math.floor(Math.random() * pool.length)];
        lastBubbleVariant = v;
        return v;
      };

      const playBubbleAnim = (variant: BubbleVariant, next: string): void => {
        // Reset any prior animation class before swapping text.
        for (const v of BUBBLE_VARIANTS) bubble.classList.remove(`br-bubble-${v}`);
        if (variant === "cascade") {
          // Per-character drop — build spans with a staggered delay var.
          bubbleInner.textContent = "";
          let i = 0;
          for (const ch of next) {
            const span = document.createElement("span");
            span.className = "br-bubble-ch";
            span.textContent = ch === " " ? "\u00A0" : ch;
            span.style.setProperty("--i", String(i++));
            bubbleInner.append(span);
          }
        } else {
          bubbleInner.textContent = next;
        }
        // Force a reflow so the class addition restarts the animation.
        void bubble.offsetWidth;
        bubble.classList.add(`br-bubble-${variant}`);
      };

      // Local rotation guarantees the bubble changes on every tick even when
      // the LLM is offline, slow, or burns its budget on <think> blocks.
      const BUBBLE_FALLBACKS = [
        "fr fr shipping sigma",
        "no cap this is bussin",
        "ohio ahh codebase",
        "locked in gang",
        "rizzing the compiler",
        "goated refactor incoming",
        "skibidi merge when",
        "mid but we tried",
        "cooked the types fr",
        "claude went nuclear",
        "bro is THE problem",
        "caught in 4k no cap",
        "gyatt damn type error",
        "this diff is bussin",
        "sigma grind mode",
        "it's giving ohio",
        "let him cook respectfully",
        "npm install that boy",
        "shadow realm bugs",
        "L + ratio + compiler",
      ];
      const pickFallback = (): string => {
        let next = bubbleText;
        let tries = 0;
        while (next === bubbleText && tries++ < 6) {
          next = BUBBLE_FALLBACKS[Math.floor(Math.random() * BUBBLE_FALLBACKS.length)];
        }
        return next;
      };

      // Walk the entire xterm buffer (scrollback + viewport) so the bubble's
      // punchline can land on session history, not just the visible rows.
      // Cap the tail so huge sessions don't blow the model context.
      const TERMINAL_TEXT_CAP = 4000;
      const readTerminalText = (): string => {
        try {
          const term = xt.term;
          const buf = term.buffer.active;
          const totalRows = buf.baseY + term.rows;
          const lines: string[] = [];
          for (let i = 0; i < totalRows; i++) {
            const line = buf.getLine(i);
            lines.push(line?.translateToString(true) ?? "");
          }
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
          const joined = lines.join("\n");
          return joined.length > TERMINAL_TEXT_CAP
            ? "…" + joined.slice(-TERMINAL_TEXT_CAP)
            : joined;
        } catch {
          return "";
        }
      };

      const cleanBubble = (raw: string): string => {
        const base = raw
          .replace(/<\/?think>[\s\S]*?<\/?think>/gi, "")
          .replace(/<\/?think>/gi, "")
          .trim()
          .replace(/^["'`]|["'`]$/g, "")
          .replace(/\s+/g, " ")
          .split(/\n/)[0]
          .trim()
          .toLowerCase();
        // Keep first sentence (up to and including terminal punctuation) if
        // present; otherwise keep the whole line. Cap length so the bubble
        // never blows out.
        const m = base.match(/^[^.!?]+[.!?]/);
        const one = (m ? m[0] : base).trim();
        return one.slice(0, 180);
      };

      let bubbleStream: StreamHandle | null = null;
      let bubbleTimer: number | null = null;
      let bubbleFallbackTimer: number | null = null;

      const commitBubble = (text: string, committed: { done: boolean }): void => {
        if (committed.done) return;
        if (!text || text === bubbleText) return;
        committed.done = true;
        bubbleText = text;
        playBubbleAnim(pickBubbleVariant(), text);
      };

      const runBubbleRefresh = (): void => {
        const committed = { done: false };
        const fallback = pickFallback();

        // Race the LLM against a short deadline. If the stream returns a
        // usable line first, it wins; otherwise the fallback fires so the
        // bubble still changes on every 30s beat.
        const llm = bus.llm;
        const info = lastAliasInfo;
        if (llm?.isAvailable() && info) {
          bubbleStream?.cancel();
          let buf = "";
          const transcript = readTerminalText();
          // Fresh random sample each tick so the model isn't spoon-fed the
          // same vocab every call — keeps outputs from calcifying.
          const memeContext = INCLUDE_MEME_CONTEXT
            ? formatMemeContext(sampleMemeContext(MEME_SAMPLE_SIZE))
            : undefined;
          bubbleStream = llm.stream(
            buildBrainrotBubble(bubbleText, info, transcript, memeContext),
            (tok) => { buf += tok; },
            { systemPrompt: BRAINROT_BUBBLE_SYSTEM, maxTokens: 220, temperature: 1.15, stop: ["\n\n"] },
          );
          trackStream(bubbleStream);
          bubbleStream.text
            .then((full) => {
              const clean = cleanBubble(full || buf);
              if (clean && clean.length >= 3) commitBubble(clean, committed);
            })
            .catch(() => { /* fallback will fire */ });
        }

        // Guaranteed animation after a short grace period.
        if (bubbleFallbackTimer != null) window.clearTimeout(bubbleFallbackTimer);
        bubbleFallbackTimer = window.setTimeout(() => {
          commitBubble(fallback, committed);
        }, 6_000);
      };

      const scheduleBubble = (): void => {
        if (bubbleTimer != null) return;
        // First refresh a few seconds after mount so the session has had a
        // chance to deliver real context; then every 30s.
        window.setTimeout(runBubbleRefresh, 4_000);
        bubbleTimer = window.setInterval(runBubbleRefresh, 30_000);
      };

      const unsub = session.subscribe((info) => {
        lastAliasInfo = info;
        applyInfo(info, { termPrompt, statVals, moodText, marquee, vibeMode, vibe, modePill });
        // Preserve the LLM-picked mood if we've got one — applyInfo already
        // wrote mode-derived text, but our brain loop gets the last word.
        if (brainMoodText) writeCell(moodText, brainMoodText);
        refreshCaption(info);
      });

      let unsubLlm: (() => void) | null = null;
      if (bus.llm) {
        renderModelStatus(bus.llm.getStatus());
        unsubLlm = bus.llm.onStatusChange(renderModelStatus);
      }

      scheduleBrain();
      scheduleBubble();

      renderTv();

      teardown = () => {
        if (quietTimer != null) window.clearTimeout(quietTimer);
        if (brainTimer != null) window.clearInterval(brainTimer);
        if (bubbleTimer != null) window.clearInterval(bubbleTimer);
        if (bubbleFallbackTimer != null) window.clearTimeout(bubbleFallbackTimer);
        bubbleStream?.cancel();
        for (const c of chips.values()) {
          if (c.doneTimer) window.clearTimeout(c.doneTimer);
          if (c.exitTimer) window.clearTimeout(c.exitTimer);
          if (c.stuckTimer) window.clearTimeout(c.stuckTimer);
        }
        chips.clear();
        chipsByName.clear();
        for (const s of aliasStreams) s.cancel();
        aliasStreams.clear();
        aliasPending.clear();
        for (const s of liveStreams) s.cancel();
        liveStreams.clear();
        moodStream?.cancel();
        zingerStream?.cancel();
        toolFeed.dispose();
        typingDisp.dispose();
        unsub();
        unsubLlm?.();
        activeCaption?.cancel();
        session.dispose();
        xt.dispose();
        shell.remove();
      };
    },

    unmount() {
      teardown?.();
      teardown = null;
    },
  };
}

type BrRefs = {
  termPrompt: HTMLElement;
  statVals: Record<string, HTMLElement>;
  moodText: HTMLElement;
  marquee: HTMLElement;
  vibeMode: HTMLElement;
  vibe: HTMLElement;
  modePill: HTMLElement;
};

function applyInfo(info: SessionInfo, r: BrRefs): void {
  const cwdTail = info.cwd
    ? (info.cwd.split("/").filter(Boolean).pop() || info.cwd)
    : null;
  const branch = info.git && info.git !== "no git" ? info.git : "main";
  writeCell(r.termPrompt, cwdTail ? `$ ~/${cwdTail} · ${branch}` : undefined);

  writeCell(r.statVals.in, info.tokensLabel);
  if (info.ctxPct != null) {
    writeCell(r.statVals.out, `${info.ctxPct}%`);
    const lab = r.statVals.out.parentElement?.querySelector(".br-stat-lab") as HTMLElement | null;
    writeCell(lab, "🧠 ctx used");
  }
  writeCell(r.statVals.cost, info.costLabel ? `$${info.costLabel}` : undefined);
  writeCell(r.statVals.lat, info.statusTime);
  writeCell(r.statVals.rizz, formatTokens(info.aggregates.totalTokens));

  // Marquee live fills
  if (info.tokensLabel) {
    r.marquee.querySelectorAll<HTMLElement>(".br-mq-in").forEach((el) => writeCell(el, info.tokensLabel));
  }
  if (info.ctxPct != null) {
    const v = `${info.ctxPct}%`;
    r.marquee.querySelectorAll<HTMLElement>(".br-mq-out").forEach((el) => writeCell(el, v));
  }
  if (info.costLabel) {
    const v = `$${info.costLabel}`;
    r.marquee.querySelectorAll<HTMLElement>(".br-mq-cost").forEach((el) => writeCell(el, v));
  }
  if (info.statusTime) {
    r.marquee.querySelectorAll<HTMLElement>(".br-mq-lat").forEach((el) => writeCell(el, info.statusTime));
  }

  // Vibe box ctx%
  const vibeCtx = r.vibe.querySelector(".br-vibe-ctx") as HTMLElement | null;
  if (info.ctxPct != null) writeCell(vibeCtx, `${info.ctxPct}%`);

  // ── Mode pill (title bar) + vibe mode line ──
  const m = describeMode(info.mode);
  r.modePill.classList.remove("is-default", "is-plan", "is-accept", "is-auto");
  r.modePill.classList.add(`is-${m.kind}`);
  const emojiEl = r.modePill.querySelector(".emoji") as HTMLElement | null;
  const labelEl = r.modePill.querySelector(".label") as HTMLElement | null;
  if (emojiEl) emojiEl.textContent = m.emoji;
  writeCell(labelEl, m.label);
  writeCell(r.vibeMode, m.label);

  // Mood follows the mode too.
  writeCell(r.moodText, `${m.label} ${m.emoji}`);
}
