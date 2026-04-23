# CLI Mods — Modable GUI wrapper for Claude Code

## Context

We are building a desktop application that wraps a live CLI coding agent (Claude Code first; Codex / Kilo / generic later) and presents its session through swappable, visually ambitious "mods." The three designs — **Neon Shrine** (cyberpunk CRT), **Oracle** (mystical parchment), and **Editorial** (brutalist newspaper) — are not three apps; they are three skins on top of a single core that parses the agent's stream and re-renders it in each mod's visual voice.

The design API URL for the design bundle returned 404 via WebFetch, so this plan is built from the three screenshots and the user's spec in chat. The working directory is empty — this is a from-scratch build.

**Key decisions already made with the user:**
- Host platform: **Electron** (main owns child process, renderer draws the mod)
- Rendering strategy: **semantic event parser → mod-specific renderers** (not xterm passthrough)
- Day-one agent support: **Claude Code** + **generic passthrough** fallback

**Why this architecture:** The mods don't just re-skin chrome — they rewrite the voice of the output (Oracle: "thou art asked: …" / "dost thou consent? [y/n]"; Editorial: magazine headlines from session topics; Neon: LED-burn stats). That only works if the app understands the agent's output semantically, not as raw ANSI bytes. Claude Code's `--output-format stream-json` already emits structured events; we build a pluggable `Adapter` layer so other agents can normalize into the same `AgentEvent` vocabulary.

---

## Execution protocol

**The executing agent completes exactly ONE milestone per run, then stops and reports back.** Each milestone below is self-contained, independently testable, and ends in a working app state. Do not begin milestone N+1 in the same session that finishes milestone N.

At the start of each milestone, the agent should re-read this plan file to reground on the overall architecture, then focus only on that milestone's scope.

---

## Architecture overview

```
┌─────────────── Electron main process ───────────────┐
│  child_process.spawn("claude", ["--output-format",  │
│                      "stream-json", ...])           │
│           │                                         │
│     Adapter (claude-code | passthrough)             │
│           │                                         │
│     normalized AgentEvent stream                    │
│           │  (IPC)                                  │
└───────────┼─────────────────────────────────────────┘
            │
┌───────────▼─────────── Renderer ────────────────────┐
│     EventBus  ── subscribed by active Mod           │
│           │                                         │
│     Mod.mount(root, bus)  ── Neon | Oracle | Edit.  │
│           │                                         │
│     mod-specific HTML + CSS + animations            │
│                                                     │
│     ModPicker overlay (Cmd+, or first launch)       │
└─────────────────────────────────────────────────────┘
```

**AgentEvent vocabulary (v1):**
- `session_start` / `session_end` — session boundaries with id, title, model
- `user_prompt` — text the user sent
- `thinking` — streamed thinking tokens with a progress percentage
- `assistant_text` — streamed response chunks
- `tool_call_start` / `tool_call_end` — name, args, result summary
- `file_edit` — path, +added / -removed lines
- `confirmation_request` — e.g. "apply edits? [y/n]"
- `metrics` — tokens_in, tokens_out, cost, turns, latency, files_touched
- `raw` — escape hatch for adapters that can't categorize (passthrough)

Mods subscribe to whichever events they care about and render them in their voice. Mods never speak directly to the child process — they call `bus.sendInput(text)` which is forwarded to main → stdin.

---

## Milestones

### Milestone 1 — Electron shell, Claude Code adapter, debug renderer
**Goal:** Prove the pipe end-to-end with an unstyled renderer.

- Scaffold Electron + TypeScript + Vite (`electron-vite` template or equivalent).
- `electron/main.ts`: spawn `claude --output-format stream-json --input-format stream-json --verbose`, manage child lifecycle, pipe stdin/stdout over IPC.
- `electron/adapters/claude-code.ts`: line-delimited JSON parser → `AgentEvent` objects. Map Claude Code's `message`, `tool_use`, `tool_result`, `result` event shapes to our vocabulary.
- `electron/adapters/passthrough.ts`: for non-Claude binaries, emit each line as a `raw` event. Not wired in yet, stub only.
- `electron/preload.ts`: expose `window.cli.send(text)`, `window.cli.onEvent(cb)`.
- `src/renderers/debug.ts`: plain list view of every `AgentEvent` with a bottom input box. No styling.
- First-run settings dialog: binary path (default `claude`), working directory.

**Verify:** `npm run dev` → type "list files" → see `user_prompt`, streaming `assistant_text`, `tool_call_*`, and `metrics` events in the debug list. Child terminates cleanly on app quit.

**Critical files:** `package.json`, `electron/main.ts`, `electron/preload.ts`, `electron/adapters/claude-code.ts`, `electron/adapters/passthrough.ts`, `src/renderers/debug.ts`, `src/types/events.ts`.

---

### Milestone 2 — Mod system, picker, mock replay
**Goal:** Ship the mod-loading infrastructure with three empty mod stubs. No visual design yet — just architecture.

- `src/bus.ts`: `EventBus` with `subscribe(type|"*", handler)`, `emit(event)`, `sendInput(text)`.
- `src/mods/types.ts`: `Mod` interface — `id`, `meta { name, blurb, preview }`, `mount(root, bus)`, `unmount()`.
- `src/mods/registry.ts`: registered mods, `loadMod(id)` tears down current and mounts next.
- `src/picker.ts`: full-screen overlay with three cards (title + blurb + static preview image per mod). Shown on first launch or via Cmd+,. Persist choice to `electron-store`.
- `src/devtools/mock-replay.ts`: hardcoded `AgentEvent[]` matching the screenshots' session (refactor-auth → JWT rotating keys). `npm run dev:mock` flag bypasses the child process and plays this script into the bus on a timer. **This is what milestones 3–5 are built and tested against.**
- Three stub mods: `src/mods/{neon,oracle,editorial}/index.ts`, each renders a label "neon: N events received" that updates on every event. No styling.
- Keyboard: Cmd+, reopens picker, Cmd+Shift+M cycles to next mod.

**Verify:** Launch → picker appears → pick Neon → stub renders → Cmd+Shift+M swaps to Oracle stub → Cmd+, reopens picker. `npm run dev:mock` plays the canned session into whichever stub is active.

**Critical files:** `src/bus.ts`, `src/mods/types.ts`, `src/mods/registry.ts`, `src/picker.ts`, `src/devtools/mock-replay.ts`, `src/mods/{neon,oracle,editorial}/index.ts`.

---

### Milestone 3 — Neon Shrine mod (full)
**Goal:** Pixel-close to screenshot 1. Built against `dev:mock`.

- Palette: `#0e0315` bg, `#ff2ea0` magenta, `#00e0ff` cyan, `#ffed4a` amber; CRT scanlines overlay + vignette.
- Header: `NEON-SHRINE █ v2.077 █ CLAUDE.CODE █ PID:####` pulled from real pid; `● REC` pill on the right.
- Sessions sidebar: list with `HOT` / `IDLE` / `DONE` tags; active session shows a rotating `▶`. Session state derived from `session_start` events and event recency.
- Terminal region: mono green-on-dark; streaming `assistant_text` tokens fade in with cyan glow; file diffs render as `auth/middleware.ts +42 -18` with magenta/cyan number glows.
- Animated art (right edge): SVG rainy-zodiac skyline with lit windows pulsing at variable cadence, flying car sprite that streaks across every 14s, pink sunset circle. Runs via `requestAnimationFrame` — pause on `visibilitychange`.
- Bottom-left corner stats: `GPU 87%`, `TOKENS 1.2M`, `UPTIME hh:mm` (tokens from latest `metrics` event).
- Footer: tokens-in / tokens-out / cost / turns / latency, rendered as LED burn-in (slight glow, segmented font).
- Waveform on the right of the footer, reacts to incoming `assistant_text` chunk rate.

**Verify:** `npm run dev:mock` + Neon selected → animation matches screenshot-1 within reasonable tolerance, all metrics update live, flying car appears on schedule, waveform pulses with streaming text.

**Critical files:** `src/mods/neon/{index.ts, styles.css, skyline.ts, waveform.ts, sessions.ts}`, asset folder `src/mods/neon/assets/` for skyline SVG layers.

---

### Milestone 4 — Oracle mod (full)
**Goal:** Pixel-close to screenshot 2.

- Palette: `#f3ecd8` parchment, `#2a1e0e` ink, `#b88a3a` gold; subtle noise texture.
- Header: `✦ THE ORACLE ✦` centered, subtitle `A · VESSEL · FOR · CLAUDE · CODE · EDITIO · MMXXVI`, top-right moon-phase + roman date.
- Left column: `— GRIMOIRE OF SESSIONS —`, items as `I · ARCANA / The Refactor`, `II · ARCANA / The Migration`, etc. Labels mapped from session titles via a small thesaurus (refactor → "The Refactor", leak → "The Leak"; fallback "The Working").
- Astral panel (bottom-left): `☿ mercury · 0.42`, `♄ saturn · 1.08`, `☉ sol · 04h 22m` — values derived from metrics (latency → mercury, cost → saturn, session age → sol).
- Voice-over layer: each `assistant_text` emission is preceded by a serif italic phrase pulled from a small rotation (`∴ The terminal speaketh ∴`, `✦ thou art asked:`, `† i shall rewrite`, `○ dost thou consent? [y/n]`). The mono response follows below.
- Animated art (right): arched SVG window framing a night sky. Moon with craters; 12-sign zodiac ring rotating once every 2 min (CSS `animation: rotate 120s linear infinite`); ~40 twinkling stars (randomized opacity loops); periodic owl blink sprite in the mountains; drifting mist layers at 2 different speeds.
- SOLVE · COAGULA diagram: faded sacred-geometry SVG bleeding from corner into the terminal region.
- Footer: `♃ TOKENS·IN`, `♇ TOKENS·OUT`, `◈ OBOLS·SPENT`, `✦ TURNS·TAKEN` (roman numerals), `⟡ LATENCIA`, `CADENCE ● ◐ ○ ◐ ● ○` (small indicator chart of recent latencies).

**Verify:** Oracle selected + mock replay → matches screenshot-2, zodiac ring rotates, stars twinkle, voice-over italic line appears before each response chunk group, turns count renders as roman numeral.

**Critical files:** `src/mods/oracle/{index.ts, styles.css, zodiac.ts, window.ts, voiceover.ts, thesaurus.ts, roman.ts}`, assets for parchment texture, moon, mountains, owl, mist.

---

### Milestone 5 — Editorial mod (full)
**Goal:** Pixel-close to screenshot 3.

- Palette: `#ebe8e0` bone paper, `#141414` ink, `#e63922` red; hairline 1px rules everywhere.
- Masthead: `●●● ∞dex` wordmark left, `01 / SESSION · <name>` + `02 / AGENT · claude.sonnet` center, `ISSUE № <MM-DD-YY>` + `● LIVE` pill right.
- Kinetic marquee bar under the masthead: `$3.42 spent · 412ms latency — ∞ Long form coding — refactor-auth · 127 turns — 184,221 IN · 48,907 OUT — $3.42 …` scrolling left infinitely. Reverses every reload. Red/black typography.
- Contents sidebar: `01 Refactor Auth / MIDDLEWARE · JWT`, `02 Migrate DB / PG · 14 → 16`, etc. Active item reversed (black bg, bone text).
- Main column headline: giant display serif (Tiempos / PP Editorial New look) derived from the current session's topic: `Refactoring auth, one rotation at a time.` Red italic accent on one phrase.
- Giant rotating `∞` SVG bleeding behind the headline, slow rotation + subtle breathing scale. Z-layer below the terminal.
- Drifting red pill `NOW THINKING · 62%` — visible only while a `thinking` event is active, floats with a slow sine wave, % updates live.
- Terminal block: black bg, red offset shadow (4px x, 4px y), mono. Shows `/ TERMINAL · ZSH · CLAUDE-CODE` header and file plan table (path / +added / -removed) rendered as ASCII box.
- Footer: 7-column stats table with hairline rules between columns (`TOKENS IN`, `TOKENS OUT`, `COST`, `TURNS`, `LATENCY`, `FILES TOUCHED`, `TOKEN RATE · 30MIN`). Last column is an inline SVG sparkline of the last 30 minutes of token rate (collect samples from `metrics` events into a rolling buffer).

**Verify:** Editorial selected + mock replay → matches screenshot-3, marquee scrolls, ∞ rotates and breathes, thinking pill only appears during `thinking` events and tracks the percentage, sparkline updates live.

**Critical files:** `src/mods/editorial/{index.ts, styles.css, marquee.ts, infinity.ts, sparkline.ts, thinking-pill.ts, headline.ts}`, web fonts for display serif.

---

### Milestone 6 — Polish, passthrough fallback, packaging
**Goal:** Ship-ready build.

- Mod switch transition: fade through a neutral black for 300ms while unmount/mount happens, so mods don't clash visually mid-swap.
- `src/mods/picker.ts` polish: live-preview each mod card by mounting it into a tiny iframe with mock-replay running.
- Wire the passthrough adapter: a "Generic" option in settings lets the user point at any binary (`codex`, `kilo`, `bash`, …). Passthrough emits `raw` events; mods render `raw` events inside a minimal mono block wrapped in their chrome — no semantic decoration, but the frame still reads as modded.
- Persistent settings via `electron-store`: last mod, last binary, last cwd, window bounds.
- Menu + shortcuts: Cmd+, picker, Cmd+Shift+M next mod, Cmd+R reload session, Cmd+K clear.
- Packaging: `electron-builder` config, app icon, macOS dmg target. Basic `README.md` with install + run + add-a-mod instructions.

**Verify:** `npm run package` produces a dmg; installed app launches, remembers last choice, mod-picker preview cards animate, passthrough adapter with `echo hello` prints inside the selected mod's chrome.

**Critical files:** `src/mods/picker.ts` (preview iframes), `electron/settings.ts`, `electron-builder.yml`, `README.md`.

---

## Repository layout (target)

```
package.json
electron-builder.yml
electron/
  main.ts
  preload.ts
  settings.ts
  adapters/
    claude-code.ts
    passthrough.ts
src/
  index.html
  index.ts
  bus.ts
  picker.ts
  types/events.ts
  renderers/debug.ts
  devtools/mock-replay.ts
  mods/
    types.ts
    registry.ts
    neon/
    oracle/
    editorial/
```

## End-to-end verification (post-milestone-6)

1. `npm install && npm run dev` → picker appears, pick Neon.
2. Type "refactor auth/middleware.ts to use JWT with rotating keys" → Claude Code runs, events stream in, UI animates in Neon voice.
3. Cmd+Shift+M → swap to Oracle mid-session → state preserved, new voice.
4. Cmd+, → pick Editorial → marquee + ∞ take over.
5. Quit + relaunch → last mod restored.
6. Change binary to `bash` in settings → passthrough adapter, `echo hi` renders `raw` line inside current mod chrome.
7. `npm run package` → dmg installs and runs standalone.
