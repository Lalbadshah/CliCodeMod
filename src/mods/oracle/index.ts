import type { TerminalBus } from "../../bus";
import type { Mod } from "../types";
import { MOD_META } from "../registry";
import { mountArchedWindow } from "./window";
import { romanDate, toRoman } from "./roman";
import { mountXterm } from "../shared/xterm-host";
import { createToolCallTransformer } from "../shared/tool-call-transformer";
import { writeCell, pulseEl } from "../shared/cell";
import { ORACLE_ALIASES, ORACLE_TOOL_STYLE } from "./aliases";
import {
  createSessionBridge,
  formatCost,
  formatTokens,
  type SessionInfo,
} from "../shared/session-info";
import { describeMode, type ModeKind } from "../shared/mode";
import { modeGlyph } from "./glyphs";
import "./styles.css";

const ORACLE_VOICE =
  "Speak as an oracle at a dim altar. Address the user as 'seeker'. Use archaic phrasing sparingly; never break character even in code or tool output.";

export function createOracleMod(): Mod {
  let teardown: (() => void) | null = null;

  return {
    id: "oracle",
    meta: MOD_META.oracle,
    voicePrompt: ORACLE_VOICE,
    toolAliases: ORACLE_ALIASES,
    toolLineStyle: ORACLE_TOOL_STYLE,

    mount(root: HTMLElement, bus: TerminalBus) {
      const shell = document.createElement("div");
      shell.className = "oracle-shell";

      // ── HEADER ──────────────────────────────────
      const header = document.createElement("div");
      header.className = "oracle-header";

      const left = document.createElement("div");
      left.className = "oracle-header-left";
      left.innerHTML = `
        <span class="oracle-dots"><span></span><span></span><span></span></span>
      `;

      const center = document.createElement("div");
      center.className = "oracle-header-center";
      center.innerHTML = `
        <div class="oracle-title"><span class="star">✦</span> THE ORACLE <span class="star">✦</span></div>
        <div class="oracle-subtitle">A · VESSEL · FOR · CLAUDE · CODE · EDITIO · MMXXVI</div>
      `;

      const right = document.createElement("div");
      right.className = "oracle-header-right";
      const luna = document.createElement("div");
      luna.className = "oracle-luna";
      luna.innerHTML = `
        <span class="oracle-luna-label">LUNA</span>
        <span class="oracle-moon-phase" aria-hidden="true"></span>
        <span class="oracle-luna-date"></span>
      `;
      const lunaDate = luna.querySelector(".oracle-luna-date") as HTMLElement;
      lunaDate.textContent = romanDate();
      right.append(luna);

      header.append(left, center, right);

      // ── BODY ─────────────────────────────────────
      const body = document.createElement("div");
      body.className = "oracle-body";

      // Dossier sidebar (replaces the old fake-sessions grimoire)
      const dossier = document.createElement("aside");
      dossier.className = "oracle-dossier";
      const dossierHead = document.createElement("div");
      dossierHead.className = "oracle-dossier-head";
      dossierHead.innerHTML = `<span class="flourish">⤞</span> SESSION<br/>DOSSIER`;

      const dossierList = document.createElement("dl");
      dossierList.className = "oracle-dossier-list";
      const dModel   = makeDossierRow(dossierList, "I", "VESSEL");
      const dAgent   = makeDossierRow(dossierList, "II", "AUGUR");
      const dCwd     = makeDossierRow(dossierList, "III", "SCROLL");
      const dGit     = makeDossierRow(dossierList, "IV", "RUNE");
      const dMode    = makeDossierRow(dossierList, "V", "ORDER");

      const astral = document.createElement("div");
      astral.className = "oracle-astral";
      const aMercury = makeAstralRow(astral, "☿", "mercury");
      const aSaturn  = makeAstralRow(astral, "♄", "saturn");
      const aSol     = makeAstralRow(astral, "☉", "sol");

      dossier.append(dossierHead, dossierList, astral);

      // Main terminal column
      const main = document.createElement("div");
      main.className = "oracle-main";

      const termHeader = document.createElement("div");
      termHeader.className = "oracle-term-header";
      termHeader.innerHTML = `
        <span class="rail">.:</span>
        <span class="voice">The terminal speaketh</span>
        <span class="rail">:.</span>
      `;
      const termVoice = termHeader.querySelector(".voice") as HTMLElement;

      const termHost = document.createElement("div");
      termHost.className = "oracle-term-host";

      const solveWatermark = document.createElement("div");
      solveWatermark.className = "oracle-solve-watermark";
      solveWatermark.innerHTML = `
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="0.7">
            <circle cx="150" cy="150" r="120"/>
            <circle cx="150" cy="150" r="92"/>
            <circle cx="110" cy="150" r="80"/>
            <circle cx="190" cy="150" r="80"/>
            <circle cx="150" cy="110" r="80"/>
            <circle cx="150" cy="190" r="80"/>
            <polygon points="150,28 264,228 36,228"/>
            <polygon points="150,272 36,72 264,72"/>
          </g>
          <text x="150" y="158" text-anchor="middle" font-family="Cinzel, serif"
                font-size="9" letter-spacing="4" fill="currentColor" opacity="0.9">SOLVE · COAGULA</text>
        </svg>
      `;

      main.append(termHeader, termHost, solveWatermark);

      // Arched window column
      const windowCol = document.createElement("div");
      windowCol.className = "oracle-window-col";

      body.append(dossier, main, windowCol);

      // ── METRICS (label + value strip) ────────────
      const metrics = document.createElement("div");
      metrics.className = "oracle-metrics";

      const mMint     = makeMetric("☿", "MINT");
      const mCtx      = makeMetric("◎", "CTX-WINDOW");
      const mObols    = makeMetric("$", "OBOLS-SPENT");
      const mLifetime = makeMetric("Σ", "LIFETIME");
      const m5h       = makeMetric("⌛", "BLOCK-V HORARUM");
      const cadence   = makeCadence();

      metrics.append(mMint.el, mCtx.el, mObols.el, mLifetime.el, m5h.el, cadence.el);

      // ── FOOTER ───────────────────────────────────
      const footerEl = document.createElement("div");
      footerEl.className = "oracle-footer";
      const footGlyphL = document.createElement("span");
      footGlyphL.className = "oracle-foot-glyph";
      footGlyphL.textContent = "❦";
      const footText = document.createElement("span");
      footText.className = "oracle-foot-text";
      footText.textContent = "the parchment listens · the terminal speaks";
      const footGlyphR = document.createElement("span");
      footGlyphR.className = "oracle-foot-glyph";
      footGlyphR.textContent = "❦";
      footerEl.append(footGlyphL, footText, footGlyphR);

      shell.append(header, body, metrics, footerEl);
      root.append(shell);

      const killWindow = mountArchedWindow(windowCol);

      const xt = mountXterm(termHost, bus, {
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.0,
        dataTransform: createToolCallTransformer({
          aliases: ORACLE_ALIASES,
          style: ORACLE_TOOL_STYLE,
        }),
        theme: {
          background: "#f3ecd8",
          foreground: "#2a1e0e",
          cursor: "#8a6820",
          cursorAccent: "#f3ecd8",
          selectionBackground: "rgba(184,138,58,0.35)",
          black: "#2a1e0e",
          red: "#8a3a2a",
          green: "#5a6a28",
          yellow: "#b88a3a",
          blue: "#3a5a7a",
          magenta: "#6a3a5a",
          cyan: "#3a7a7a",
          white: "#e8dfc2",
          brightBlack: "#7a6a48",
          brightRed: "#b85a48",
          brightGreen: "#7a8a3a",
          brightYellow: "#d8aa5a",
          brightBlue: "#5a7a9a",
          brightMagenta: "#8a5a7a",
          brightCyan: "#5a9a9a",
          brightWhite: "#fffaea",
        },
      });

      const session = createSessionBridge(xt.term, bus);
      const unsub = session.subscribe((info) => apply(info, {
        footText, termVoice,
        dModel, dAgent, dCwd, dGit, dMode,
        aMercury, aSaturn, aSol,
        mMint, mCtx, mObols, mLifetime, m5h, cadence,
      }));

      teardown = () => {
        unsub();
        session.dispose();
        xt.dispose();
        killWindow();
        shell.remove();
      };
    },

    unmount() {
      teardown?.();
      teardown = null;
    },
  };
}

type DossierRow = {
  setValue(
    v: string | undefined,
    state?: "active" | "done" | "empty",
    mode?: ModeKind,
  ): void;
};

const MODE_CLASSES = [
  "is-mode-default",
  "is-mode-plan",
  "is-mode-accept",
  "is-mode-auto",
];

function makeDossierRow(parent: HTMLElement, num: string, kicker: string): DossierRow {
  const row = document.createElement("div");
  row.className = "oracle-dossier-row";
  row.innerHTML = `
    <dt class="line-kicker">${num} · ${kicker}</dt>
    <dd class="line-title">
      <span class="line-glyph" aria-hidden="true"></span>
      <span class="line-text">—</span>
    </dd>
  `;
  parent.append(row);
  const text = row.querySelector(".line-text") as HTMLElement;
  const glyphSlot = row.querySelector(".line-glyph") as HTMLElement;
  let lastMode: ModeKind | null = null;
  return {
    setValue(v, state, mode) {
      if (v == null || v === "") return;
      writeCell(text, v);
      row.classList.remove("is-active", "is-done", "is-empty");
      if (state) row.classList.add("is-" + state);

      row.classList.remove(...MODE_CLASSES);
      if (mode) {
        row.classList.add(`is-mode-${mode}`);
        if (mode !== lastMode) {
          glyphSlot.replaceChildren(modeGlyph(mode));
          glyphSlot.classList.add("is-set");
          lastMode = mode;
        }
      } else if (lastMode != null) {
        glyphSlot.replaceChildren();
        glyphSlot.classList.remove("is-set");
        lastMode = null;
      }
    },
  };
}

type AstralRow = {
  setValue(v: string | undefined): void;
};

function makeAstralRow(parent: HTMLElement, glyph: string, name: string): AstralRow {
  const row = document.createElement("div");
  row.className = "oracle-astral-row";
  row.innerHTML = `
    <span class="glyph">${glyph}</span>
    <span class="name">${name}</span>
    <span class="sep">·</span>
    <span class="val">—</span>
  `;
  parent.append(row);
  const val = row.querySelector(".val") as HTMLElement;
  return {
    setValue(v) {
      if (v == null || v === "") return;
      writeCell(val, v);
    },
  };
}

// ── metric cell (label + value) ───────────────────────
type Metric = {
  el: HTMLElement;
  setValue(v: string | undefined): void;
};

function makeMetric(glyph: string, label: string): Metric {
  const el = document.createElement("div");
  el.className = "oracle-metric";
  el.innerHTML = `
    <div class="oracle-metric-label">
      <span class="glyph">${glyph}</span>
      <span class="name">${label}</span>
    </div>
    <div class="oracle-metric-value">—</div>
  `;
  const val = el.querySelector(".oracle-metric-value") as HTMLElement;
  return {
    el,
    setValue(v) {
      if (v == null || v === "") return;
      writeCell(val, v);
      el.classList.remove("is-empty");
    },
  };
}

type Cadence = {
  el: HTMLElement;
  setFill(pct: number | undefined): void;
};

function makeCadence(): Cadence {
  const el = document.createElement("div");
  el.className = "oracle-metric oracle-cadence";
  el.innerHTML = `
    <div class="oracle-metric-label">
      <span class="name">CADENCE</span>
    </div>
    <div class="oracle-cadence-row">
      <span class="edge">•</span>
      <span class="moon"></span><span class="moon"></span><span class="moon"></span>
      <span class="moon"></span><span class="moon"></span>
      <span class="edge">•</span>
    </div>
  `;
  const moons = Array.from(el.querySelectorAll<HTMLElement>(".moon"));
  let lastLit = -1;
  return {
    el,
    setFill(pct) {
      if (pct == null) return;
      el.classList.remove("is-empty");
      const lit = Math.max(0, Math.min(moons.length, Math.round((pct / 100) * moons.length)));
      if (lit === lastLit) return;
      lastLit = lit;
      moons.forEach((m, i) => m.classList.toggle("is-lit", i < lit));
      pulseEl(el, "fill");
    },
  };
}

type OracleRefs = {
  footText: HTMLElement;
  termVoice: HTMLElement;
  dModel: DossierRow;
  dAgent: DossierRow;
  dCwd: DossierRow;
  dGit: DossierRow;
  dMode: DossierRow;
  aMercury: AstralRow;
  aSaturn: AstralRow;
  aSol: AstralRow;
  mMint: Metric;
  mCtx: Metric;
  mObols: Metric;
  mLifetime: Metric;
  m5h: Metric;
  cadence: Cadence;
};

function apply(info: SessionInfo, r: OracleRefs): void {
  // ── term voice (title or fallback) ─────
  if (info.title) {
    writeCell(r.termVoice, clampTitle(info.title, 70));
    r.termVoice.classList.add("is-title");
  } else {
    writeCell(r.termVoice, "The terminal speaketh");
    r.termVoice.classList.remove("is-title");
  }

  // ── dossier ─────
  r.dModel.setValue(info.model);
  r.dAgent.setValue(info.isClaudeCode ? "claude-code" : (info.binary || "generic tty"));
  const cwdLabel = info.cwd
    ? (info.cwd.split("/").filter(Boolean).pop() || info.cwd)
    : undefined;
  r.dCwd.setValue(cwdLabel);
  r.dGit.setValue(info.git && info.git !== "no git" ? info.git : (info.git === "no git" ? "no repo" : undefined));
  // ORDER row always shows a mode — default-mode strips the symbol from
  // the statusline so info.mode is undefined; we surface "default" so
  // the seeker sees there is no current edict, paired with the wedjat
  // glyph instead of an emoji.
  const oracleMode = describeMode(info.mode);
  r.dMode.setValue(oracleMode.label, "active", oracleMode.kind);

  // ── astral (live) ─────
  r.aMercury.setValue(info.isClaudeCode ? "claude-code" : (info.binary ?? "generic"));
  const lifetimeCost = info.aggregates.totalCost;
  r.aSaturn.setValue(lifetimeCost > 0 ? formatCost(lifetimeCost) : undefined);
  r.aSol.setValue(info.statusTime ?? info.timeHHMM);

  // ── metrics strip ─────
  r.mMint.setValue(info.tokensLabel);
  r.mCtx.setValue(info.ctxPct != null ? `${info.ctxPct}%` : undefined);
  r.mObols.setValue(info.costLabel ? `$${info.costLabel}` : undefined);
  r.mLifetime.setValue(
    info.aggregates.totalTokens > 0
      ? formatTokens(info.aggregates.totalTokens)
      : undefined,
  );
  r.m5h.setValue(info.block5hPct != null ? toRoman(info.block5hPct) : undefined);
  r.cadence.setFill(info.ctxPct);

  // ── footer ─────
  const bits: string[] = [];
  bits.push(info.isClaudeCode ? "claude code" : (info.binary ?? "generic"));
  if (info.model) bits.push(info.model);
  if (info.cwd) bits.push(`scroll of ${info.cwd.split("/").filter(Boolean).pop() || info.cwd}`);
  if (info.git && info.git !== "no git") bits.push(info.git);
  writeCell(r.footText, bits.length ? bits.join(" · ") : "the parchment listens · the terminal speaks");
}

function clampTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
