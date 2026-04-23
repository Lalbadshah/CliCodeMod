import type { TerminalBus } from "../../bus";
import type { Mod } from "../types";
import { MOD_META } from "../registry";
import { mountSkyline } from "./skyline";
import { mountXterm } from "../shared/xterm-host";
import { writeCell } from "../shared/cell";
import {
  createSessionBridge,
  formatCost,
  formatTokens,
  type SessionInfo,
} from "../shared/session-info";
import { describeMode } from "../shared/mode";
import "./styles.css";

const NEON_VOICE =
  "Respond like a jaded netrunner. Short sentences. Occasional slang: 'choom', 'chromed', 'flatline', 'ice', 'wire'. No emoji. Stay terse even when explaining code.";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createNeonMod(): Mod {
  let teardown: (() => void) | null = null;

  return {
    id: "neon",
    meta: MOD_META.neon,
    voicePrompt: NEON_VOICE,

    mount(root: HTMLElement, bus: TerminalBus) {
      const shell = document.createElement("div");
      shell.className = "neon-shell";

      // ── HEADER ──────────────────────────────────
      const header = document.createElement("div");
      header.className = "neon-header";

      const faction = document.createElement("div");
      faction.className = "neon-faction";
      faction.innerHTML = `${factionGlyphSvg()}<div class="neon-faction-code">FAC/07 · 電脳神社</div>`;

      const target = document.createElement("div");
      target.className = "neon-target";
      target.innerHTML = `
        <span class="bracket">◤</span>
        <span class="label">NEON·SHRINE</span>
        <span class="sep">▌</span>
        <span class="value neon-target-model"></span>
        <span class="bracket">◥</span>
      `;
      const targetModel = target.querySelector(".neon-target-model") as HTMLElement;

      const stats = document.createElement("div");
      stats.className = "neon-stats";
      stats.innerHTML = `
        <span class="k">CTX</span><span class="v neon-stat-ctx">— —</span>
        <span class="k">5H</span><span class="v neon-stat-h5">— —</span>
        <span class="k">7D</span><span class="v neon-stat-d7">— —</span>
        <span class="k">PID</span><span class="v neon-stat-pid">----</span>
      `;
      const statCtx = stats.querySelector(".neon-stat-ctx") as HTMLElement;
      const statH5 = stats.querySelector(".neon-stat-h5") as HTMLElement;
      const statD7 = stats.querySelector(".neon-stat-d7") as HTMLElement;
      const statPid = stats.querySelector(".neon-stat-pid") as HTMLElement;

      const rec = document.createElement("div");
      rec.className = "neon-rec";
      rec.innerHTML = '<span class="neon-rec-dot"></span>REC';

      header.append(faction, target, stats, rec);

      // ── BODY ────────────────────────────────────
      const body = document.createElement("div");
      body.className = "neon-body";

      const grid = document.createElement("div");
      grid.className = "neon-grid";

      const traceryTL = makeTracery("tl");
      const traceryTR = makeTracery("tr");
      const traceryBL = makeTracery("bl");
      const traceryBR = makeTracery("br");

      const termWrap = document.createElement("div");
      termWrap.className = "neon-term-wrap";

      const termTab = document.createElement("div");
      termTab.className = "neon-term-tab";
      termTab.textContent = "TTY_01 / LIVE";

      const termHost = document.createElement("div");
      termHost.className = "neon-term-host";
      termWrap.append(termTab, termHost);

      // right: side panel
      const side = document.createElement("div");
      side.className = "neon-side";

      const clock = document.createElement("div");
      clock.className = "neon-clock";
      clock.innerHTML = `
        <div class="neon-clock-kicker">CORE_CLOCK · UTC⊹</div>
        <div class="neon-clock-date">— — — —/— —/— —</div>
        <div class="neon-clock-time">— —:— —:— —</div>
        <div class="neon-clock-seconds"><span class="neon-clock-sec-fill"></span></div>
      `;
      const clockDate = clock.querySelector(".neon-clock-date") as HTMLElement;
      const clockTime = clock.querySelector(".neon-clock-time") as HTMLElement;
      const clockSecFill = clock.querySelector(".neon-clock-sec-fill") as HTMLElement;

      const device = document.createElement("div");
      device.className = "neon-device";
      device.innerHTML = `
        <div class="neon-device-head">DEVICE_INFO</div>
        <div class="neon-device-row"><span class="neon-device-dot dot-ok"></span><span class="neon-device-k">STATUS</span><span class="neon-device-v ok neon-dev-status">STANDBY</span></div>
        <div class="neon-device-row"><span class="neon-device-dot"></span><span class="neon-device-k">AGENT</span><span class="neon-device-v neon-dev-agent">—</span></div>
        <div class="neon-device-row"><span class="neon-device-dot"></span><span class="neon-device-k">MODEL</span><span class="neon-device-v neon-dev-model">—</span></div>
        <div class="neon-device-row"><span class="neon-device-dot"></span><span class="neon-device-k">BRANCH</span><span class="neon-device-v neon-dev-branch">—</span></div>
        <div class="neon-device-row"><span class="neon-device-dot"></span><span class="neon-device-k">PATH</span><span class="neon-device-v neon-dev-path">—</span></div>
        <div class="neon-device-row"><span class="neon-device-dot"></span><span class="neon-device-k">LINK</span><span class="neon-device-v neon-dev-link">—</span></div>
      `;
      const devStatus = device.querySelector(".neon-dev-status") as HTMLElement;
      const devAgent = device.querySelector(".neon-dev-agent") as HTMLElement;
      const devModel = device.querySelector(".neon-dev-model") as HTMLElement;
      const devBranch = device.querySelector(".neon-dev-branch") as HTMLElement;
      const devPath = device.querySelector(".neon-dev-path") as HTMLElement;
      const devLink = device.querySelector(".neon-dev-link") as HTMLElement;

      const cctv = document.createElement("div");
      cctv.className = "neon-cctv";
      const art = document.createElement("div");
      art.className = "neon-art";
      const cctvScan = document.createElement("div");
      cctvScan.className = "neon-cctv-scan";
      cctv.append(art, cctvScan);

      const emblem = document.createElement("div");
      emblem.className = "neon-emblem";
      emblem.innerHTML = `
        ${emblemMarkSvg()}
        <div class="neon-emblem-text">
          <div class="big">SHRINE_07</div>
          <div class="small">神社 // ネット</div>
          <div class="neon-emblem-bar"><span class="neon-emblem-bar-fill"></span></div>
          <div class="small neon-emblem-tag">CONTAINMENT · ENGAGED</div>
        </div>
      `;

      side.append(clock, device, cctv, emblem);

      body.append(grid, traceryTL, traceryTR, traceryBL, traceryBR, termWrap, side);

      // ── HUD (3 cards: VITALS · LEDGER · STATUS) ──
      const hud = document.createElement("div");
      hud.className = "neon-hud";

      const scanner = document.createElement("div");
      scanner.className = "neon-scanner";
      hud.append(scanner);

      // card 1: VITALS — radial dial + 2 horizontal bars
      const vitals = document.createElement("div");
      vitals.className = "neon-card neon-vitals";
      vitals.innerHTML = `<div class="neon-card-tab">VITAL · SIGNS</div>`;
      const dial = makeDial("CTX");
      const bars = document.createElement("div");
      bars.className = "neon-bars";
      const bar5h = makeBar("5H");
      const bar7d = makeBar("7D");
      bars.append(bar5h.el, bar7d.el);
      const vitalsInner = document.createElement("div");
      vitalsInner.className = "neon-vitals-inner";
      vitalsInner.append(dial.el, bars);
      vitals.append(vitalsInner);

      // card 2: LEDGER — 3 big readouts + lifetime foot
      const ledger = document.createElement("div");
      ledger.className = "neon-card neon-ledger";
      ledger.innerHTML = `
        <div class="neon-card-tab">LEDGER · STREAM</div>
        <div class="neon-ledger-row">
          <div class="neon-ledger-cell">
            <div class="kicker"><span class="glyph">∑</span>TOKENS</div>
            <div class="big neon-ledger-tokens">— — — —</div>
          </div>
          <div class="neon-ledger-cell">
            <div class="kicker"><span class="glyph">$</span>COST</div>
            <div class="big neon-ledger-cost">— — — —</div>
          </div>
          <div class="neon-ledger-cell">
            <div class="kicker"><span class="glyph">⏱</span>CLOCK</div>
            <div class="big neon-ledger-time">— — : — —</div>
          </div>
        </div>
        <div class="neon-ledger-foot">
          <span class="k">Σ·LIFE</span>
          <span class="v neon-ledger-agg-tokens">—</span>
          <span class="dot">·</span>
          <span class="v neon-ledger-agg-cost">—</span>
          <span class="dot">·</span>
          <span class="k">UPD</span>
          <span class="v neon-ledger-updates">0</span>
        </div>
      `;
      const ledgerTokens = ledger.querySelector(".neon-ledger-tokens") as HTMLElement;
      const ledgerCost = ledger.querySelector(".neon-ledger-cost") as HTMLElement;
      const ledgerTime = ledger.querySelector(".neon-ledger-time") as HTMLElement;
      const ledgerAggTokens = ledger.querySelector(".neon-ledger-agg-tokens") as HTMLElement;
      const ledgerAggCost = ledger.querySelector(".neon-ledger-agg-cost") as HTMLElement;
      const ledgerUpdates = ledger.querySelector(".neon-ledger-updates") as HTMLElement;

      // card 3: STATUS — mode badge + status rows + link strip
      const status = document.createElement("div");
      status.className = "neon-card neon-status";
      status.innerHTML = `
        <div class="neon-card-tab">SYS · STATUS</div>
        <div class="neon-status-top">
          <div class="neon-sign">
            <span class="neon-sign-arrow">⏵⏵</span>
            <span class="neon-sign-text">STANDBY</span>
          </div>
          <div class="neon-status-code"><span class="neon-status-code-k">CODE</span><span class="neon-status-code-v">XCV·07</span></div>
        </div>
        <div class="neon-status-rows">
          <div class="neon-status-row"><span class="k">⊳ PATH</span><span class="v neon-status-path">—</span></div>
          <div class="neon-status-row"><span class="k">⊳ BRANCH</span><span class="v neon-status-branch">—</span></div>
          <div class="neon-status-row"><span class="k">⊳ AGENT</span><span class="v neon-status-agent">—</span></div>
        </div>
        <div class="neon-status-link">
          <span class="k">LINK</span>
          <span class="neon-status-link-bar"><span class="neon-status-link-fill"></span></span>
          <span class="v neon-status-link-v">— —</span>
        </div>
      `;
      const statusSign = status.querySelector(".neon-sign") as HTMLElement;
      const statusSignText = status.querySelector(".neon-sign-text") as HTMLElement;
      const statusPath = status.querySelector(".neon-status-path") as HTMLElement;
      const statusBranch = status.querySelector(".neon-status-branch") as HTMLElement;
      const statusAgent = status.querySelector(".neon-status-agent") as HTMLElement;
      const statusLinkV = status.querySelector(".neon-status-link-v") as HTMLElement;
      const statusLinkFill = status.querySelector(".neon-status-link-fill") as HTMLElement;

      hud.append(vitals, ledger, status);

      // ── FOOTER ──────────────────────────────────
      const footer = document.createElement("div");
      footer.className = "neon-footer";
      const footL = document.createElement("div");
      footL.className = "neon-foot-label";
      footL.innerHTML = `<span class="neon-foot-glyph">▸</span><span class="neon-foot-title">DIRECT TTY PASSTHROUGH</span>`;
      const footLTitle = footL.querySelector(".neon-foot-title") as HTMLElement;
      const footR = document.createElement("div");
      footR.className = "neon-foot-meta";
      footer.append(footL, footR);

      shell.append(header, body, hud, footer);
      root.append(shell);

      const killSkyline = mountSkyline(art);

      const xt = mountXterm(termHost, bus, {
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.25,
        theme: {
          background: "#000000",
          foreground: "#ffd86b",
          cursor: "#ffd400",
          cursorAccent: "#000000",
          selectionBackground: "rgba(255,183,0,0.32)",
          black: "#0a0600",
          red: "#ff3a1e",
          green: "#d6ff4a",
          yellow: "#ffd400",
          blue: "#ff9e4a",
          magenta: "#ff6b3a",
          cyan: "#ffd86b",
          white: "#ffe9b8",
          brightBlack: "#6a5a2a",
          brightRed: "#ff6b3a",
          brightGreen: "#e9ff7a",
          brightYellow: "#fff58a",
          brightBlue: "#ffba6e",
          brightMagenta: "#ff8a52",
          brightCyan: "#fff0bc",
          brightWhite: "#ffffff",
        },
      });

      const clockTimer = window.setInterval(() => updateClock(clockDate, clockTime, clockSecFill), 1000);
      updateClock(clockDate, clockTime, clockSecFill);

      const session = createSessionBridge(xt.term, bus);
      const unsub = session.subscribe((info) => apply(info, {
        targetModel, footR, footLTitle,
        statCtx, statH5, statD7, statPid,
        devStatus, devAgent, devModel, devBranch, devPath, devLink,
        dial, bar5h, bar7d,
        ledgerTokens, ledgerCost, ledgerTime, ledgerAggTokens, ledgerAggCost, ledgerUpdates,
        statusSign, statusSignText, statusPath, statusBranch, statusAgent,
        statusLinkV, statusLinkFill,
      }));

      teardown = () => {
        window.clearInterval(clockTimer);
        unsub();
        session.dispose();
        xt.dispose();
        killSkyline();
        shell.remove();
      };
    },

    unmount() {
      teardown?.();
      teardown = null;
    },
  };
}

/* ── radial dial ─────────────────────────────────── */

type Dial = {
  el: HTMLElement;
  setPct(p: number | undefined): void;
};

const DIAL_ARC_LEN = 179.07; // 2π · 38 · (270/360)

function makeDial(label: string): Dial {
  const el = document.createElement("div");
  el.className = "neon-dial";
  el.innerHTML = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="neon-dial-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#ffb700"/>
          <stop offset="0.65" stop-color="#ffd400"/>
          <stop offset="1" stop-color="#ff3a1e"/>
        </linearGradient>
      </defs>
      <g class="neon-dial-ticks" stroke="currentColor" stroke-width="1">${dialTicks(11).join("")}</g>
      <path class="neon-dial-track"
        d="M 23.1 76.9 A 38 38 0 1 1 76.9 76.9"
        fill="none" stroke="rgba(255,183,0,0.18)" stroke-width="5" stroke-linecap="butt"/>
      <path class="neon-dial-fill"
        d="M 23.1 76.9 A 38 38 0 1 1 76.9 76.9"
        fill="none" stroke="url(#neon-dial-grad)" stroke-width="5" stroke-linecap="butt"
        stroke-dasharray="${DIAL_ARC_LEN.toFixed(2)}"
        stroke-dashoffset="${DIAL_ARC_LEN.toFixed(2)}"/>
      <circle cx="50" cy="50" r="4" fill="#ff3a1e" stroke="#ffd400" stroke-width="0.6"/>
    </svg>
    <div class="neon-dial-num">
      <span class="num">— —</span>
      <span class="unit">${label}</span>
    </div>
  `;
  const fill = el.querySelector(".neon-dial-fill") as SVGPathElement;
  const num = el.querySelector(".num") as HTMLElement;
  return {
    el,
    setPct(p) {
      if (p == null) return;
      const c = Math.max(0, Math.min(100, p));
      writeCell(num, `${p}%`);
      fill.setAttribute("stroke-dashoffset", (DIAL_ARC_LEN * (1 - c / 100)).toFixed(2));
      el.classList.toggle("is-danger", p >= 85);
    },
  };
}

function dialTicks(count: number): string[] {
  const out: string[] = [];
  const cx = 50, cy = 50, rOuter = 48, rInner = 42, rInnerMajor = 40;
  const startDeg = 135;
  const endDeg = 405;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const major = i % 2 === 0;
    const ri = major ? rInnerMajor : rInner;
    const x1 = cx + rOuter * Math.cos(rad);
    const y1 = cy + rOuter * Math.sin(rad);
    const x2 = cx + ri * Math.cos(rad);
    const y2 = cy + ri * Math.sin(rad);
    const op = major ? 0.95 : 0.4;
    const col = i === count - 1 ? "#ff3a1e" : "currentColor";
    out.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-opacity="${op}"/>`,
    );
  }
  return out;
}

/* ── horizontal tick-marked bar ──────────────────── */

type Bar = {
  el: HTMLElement;
  setPct(p: number | undefined): void;
  setSub(s: string | undefined): void;
};

function makeBar(label: string): Bar {
  const el = document.createElement("div");
  el.className = "neon-bar-row";
  el.innerHTML = `
    <span class="k">${label}</span>
    <span class="neon-bar"><span class="neon-bar-fill"></span></span>
    <span class="v">— —</span>
    <span class="sub"></span>
  `;
  const fillEl = el.querySelector(".neon-bar-fill") as HTMLElement;
  const valEl = el.querySelector(".v") as HTMLElement;
  const subEl = el.querySelector(".sub") as HTMLElement;
  const barEl = el.querySelector(".neon-bar") as HTMLElement;
  return {
    el,
    setPct(p) {
      if (p == null) return;
      const c = Math.max(0, Math.min(100, p));
      fillEl.style.width = c + "%";
      writeCell(valEl, `${p}%`);
      barEl.classList.toggle("is-hot", p >= 85);
    },
    setSub(s) {
      if (s == null || s === "") return;
      writeCell(subEl, s);
    },
  };
}

/* ── decorative SVG bits ─────────────────────────── */

function factionGlyphSvg(): string {
  return `
    <svg class="neon-faction-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
      <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" />
      <polygon points="12,6 18,9 18,15 12,18 6,15 6,9" fill="currentColor" fill-opacity="0.15" />
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  `;
}

function emblemMarkSvg(): string {
  return `
    <svg class="neon-emblem-mark" viewBox="0 0 42 42" fill="none" stroke="#ffb700" stroke-width="1.2">
      <circle cx="21" cy="21" r="18" stroke-opacity="0.6"/>
      <circle cx="21" cy="21" r="14" />
      <path d="M21 6 L21 36" />
      <path d="M6 21 L36 21" stroke-opacity="0.5"/>
      <path d="M10 10 L32 32" stroke-opacity="0.3"/>
      <path d="M32 10 L10 32" stroke-opacity="0.3"/>
      <path d="M13 21 L21 13 L29 21 L21 29 Z" fill="#ff3a1e" fill-opacity="0.25" stroke="#ff3a1e"/>
      <circle cx="21" cy="21" r="2.5" fill="#ffd400"/>
    </svg>
  `;
}

function makeTracery(pos: "tl" | "tr" | "bl" | "br"): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `neon-tracery ${pos}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 180 60");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1");
  svg.innerHTML = `
    <path d="M0 12 L28 12 L36 4 L92 4 L100 12 L138 12" stroke-opacity="0.9"/>
    <path d="M0 26 L22 26 L30 34 L70 34 L78 26 L118 26" stroke-opacity="0.55"/>
    <path d="M8 44 L44 44 L52 52 L96 52" stroke-opacity="0.35"/>
    <circle cx="28" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="100" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="138" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="30" cy="34" r="1.2" fill="currentColor"/>
    <circle cx="78" cy="26" r="1.2" fill="currentColor"/>
    <rect x="106" y="1" width="22" height="6" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-opacity="0.6"/>
    <rect x="132" y="1" width="10" height="6" fill="currentColor" fill-opacity="0.6"/>
    <path d="M4 4 L4 54" stroke-opacity="0.25"/>
  `;
  wrap.append(svg);
  return wrap;
}

/* ── clock ───────────────────────────────────────── */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function updateClock(dateEl: HTMLElement, timeEl: HTMLElement, secFill: HTMLElement): void {
  const now = new Date();
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = now.getSeconds();
  writeCell(dateEl, `${y}/${mo}/${d}`);
  writeCell(timeEl, `${hh}:${mm}:${pad2(ss)}`);
  secFill.style.width = `${((ss + 1) / 60) * 100}%`;
}

/* ── session → ui ────────────────────────────────── */

type NeonRefs = {
  targetModel: HTMLElement;
  footR: HTMLElement;
  footLTitle: HTMLElement;
  statCtx: HTMLElement;
  statH5: HTMLElement;
  statD7: HTMLElement;
  statPid: HTMLElement;
  devStatus: HTMLElement;
  devAgent: HTMLElement;
  devModel: HTMLElement;
  devBranch: HTMLElement;
  devPath: HTMLElement;
  devLink: HTMLElement;
  dial: Dial;
  bar5h: Bar;
  bar7d: Bar;
  ledgerTokens: HTMLElement;
  ledgerCost: HTMLElement;
  ledgerTime: HTMLElement;
  ledgerAggTokens: HTMLElement;
  ledgerAggCost: HTMLElement;
  ledgerUpdates: HTMLElement;
  statusSign: HTMLElement;
  statusSignText: HTMLElement;
  statusPath: HTMLElement;
  statusBranch: HTMLElement;
  statusAgent: HTMLElement;
  statusLinkV: HTMLElement;
  statusLinkFill: HTMLElement;
};

function apply(info: SessionInfo, r: NeonRefs): void {
  const pidLabel = info.pid != null ? String(info.pid).padStart(4, "0") : "----";
  writeCell(r.targetModel, info.model ?? `v2.077 · PID:${pidLabel}`);

  // header compact stats
  writeCell(r.statCtx, info.ctxPct != null ? `${info.ctxPct}%` : "— —");
  writeCell(r.statH5, info.block5hPct != null ? `${info.block5hPct}%` : "— —");
  writeCell(r.statD7, info.block7dPct != null ? `${info.block7dPct}%` : "— —");
  writeCell(r.statPid, pidLabel);
  r.statCtx.classList.toggle("hot", (info.ctxPct ?? 0) >= 85);
  r.statH5.classList.toggle("hot", (info.block5hPct ?? 0) >= 85);
  r.statD7.classList.toggle("hot", (info.block7dPct ?? 0) >= 85);

  // mode sign (kind-aware)
  const modeViz = describeMode(info.mode);
  r.statusSign.classList.remove("is-idle", "is-plan", "is-accept", "is-auto", "is-default");
  if (info.mode) {
    r.statusSign.classList.add(`is-${modeViz.kind}`);
    writeCell(r.statusSignText, modeViz.labelUpper);
    writeCell(r.devStatus, modeViz.labelUpper);
    r.devStatus.classList.remove("dim");
  } else {
    r.statusSign.classList.add("is-idle");
    writeCell(r.statusSignText, "STANDBY");
    writeCell(r.devStatus, "STANDBY");
    r.devStatus.classList.add("dim");
  }

  // path / branch / agent
  const cwdParts = info.cwd ? info.cwd.split("/").filter(Boolean) : [];
  const pathTail = cwdParts.slice(-3).join("/");
  const pathShort = cwdParts.slice(-2).join("/");
  if (info.cwd) {
    writeCell(r.statusPath, pathTail || info.cwd);
    writeCell(r.devPath, "~/" + pathShort);
  }

  if (info.git && info.git !== "no git") {
    writeCell(r.statusBranch, info.git);
    writeCell(r.devBranch, info.git);
    r.devBranch.classList.remove("dim");
  } else if (info.git === "no git") {
    writeCell(r.statusBranch, "NO REPO");
    writeCell(r.devBranch, "NO REPO");
    r.devBranch.classList.add("dim");
  }

  const kindLabel = info.isClaudeCode ? "CLAUDE·CODE" : "GENERIC·TTY";
  writeCell(r.statusAgent, kindLabel);
  writeCell(r.devAgent, info.isClaudeCode ? "CLAUDE-CODE" : "SHELL");
  if (info.model) writeCell(r.devModel, info.model.toUpperCase());

  // ledger
  writeCell(r.ledgerTokens, info.tokensLabel);
  writeCell(r.ledgerCost, info.costLabel ? `$${info.costLabel}` : undefined);
  writeCell(r.ledgerTime, info.statusTime ?? info.timeHHMMSS);
  const totalTok = info.aggregates.totalTokens;
  const totalCost = info.aggregates.totalCost;
  writeCell(r.ledgerAggTokens, totalTok > 0 ? formatTokens(totalTok) : undefined);
  writeCell(r.ledgerAggCost, totalCost > 0 ? formatCost(totalCost) : undefined);
  writeCell(r.ledgerUpdates, String(info.aggregates.updates));

  // vitals
  r.dial.setPct(info.ctxPct);
  r.bar5h.setPct(info.block5hPct);
  r.bar5h.setSub(info.block5hLeft ? `↺ ${info.block5hLeft}` : undefined);
  r.bar7d.setPct(info.block7dPct);
  r.bar7d.setSub(info.block7dLeft ? `↺ ${info.block7dLeft}` : undefined);

  // link strip
  const mode = info.isMock ? "MOCK" : "LIVE";
  const linkLabel = `${mode} · ${info.isClaudeCode ? "CLAUDE-CODE" : "SHELL"} · XTERM-256COLOR`;
  writeCell(r.footR, linkLabel);
  writeCell(r.devLink, `${mode} · XTERM-256`);
  writeCell(r.statusLinkV, mode);
  r.statusLinkFill.style.width = info.isMock ? "50%" : "100%";
  r.statusLinkFill.classList.toggle("is-mock", !!info.isMock);

  if (info.title) {
    writeCell(r.footLTitle, clampTitle(info.title, 80).toUpperCase());
    r.footLTitle.classList.remove("is-empty");
  } else {
    writeCell(r.footLTitle, "DIRECT TTY PASSTHROUGH");
    r.footLTitle.classList.add("is-empty");
  }
}

function clampTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
