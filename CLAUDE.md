# CLAUDE.md — CLI Mods

Electron desktop app that runs any CLI coding agent (Claude Code, or any binary) inside a **real pseudo-terminal**, rendering its output with an `xterm.js` terminal emulator. Chrome around that terminal is swappable via **mods** — three ship today: **Neon Shrine** (cyberpunk CRT), **The Oracle** (mystical parchment), **Editorial** (brutalist newspaper). Mods don't rewrite the agent's output — whatever happens in the terminal is exactly what would happen in a normal shell. An optional **profile layer** parses the same byte stream into structured `ToolEvent`s (tool_start / tool_output / tool_end / assistant / turn) so mods can render side-panel widgets (recent-tool tickers, activity charts, diff counters) without re-parsing xterm's buffer.

## Architecture

```
┌──────────── Electron main ─────────────┐
│  node-pty.spawn(binary, args, …)       │
│       │   ↑                            │
│  PTY raw bytes  |  keystrokes + resize │
│       │   ↑                            │
│  IPC (pty:data | pty:write | pty:resize)│
└────────────────────────────────────────┘
                    │
┌─────────── Renderer ───────────────────┐
│  TerminalBus                            │
│   ├ write(data)        (from PTY)       │
│   ├ onData(cb)                          │
│   ├ sendInput(data)    (to PTY)         │
│   ├ resize(cols, rows)                  │
│   └ snapshot(): buffered PTY bytes      │
│                                         │
│  Active Mod mounts an xterm.js terminal │
│  via src/mods/shared/xterm-host.ts,     │
│  writes snapshot, subscribes to data,   │
│  forwards keystrokes, wires fit/resize. │
│                                         │
│  ModPicker overlay (Cmd+,)              │
└─────────────────────────────────────────┘
```

- **Main process** (`electron/main.ts`) owns the `BrowserWindow` and the PTY child. `node-pty.spawn(binary, extraArgs, {cols,rows,env:{TERM:"xterm-256color"}})` starts the process. Raw bytes stream back over `pty:data`; keystrokes flow in over `pty:write`; resize events over `pty:resize`.
- **Renderer** runs a single `TerminalBus` (`src/bus.ts`) that buffers PTY output and fans it out. Exactly one mod is mounted at a time. The mod creates an `xterm.js` Terminal via the shared helper `src/mods/shared/xterm-host.ts`, loads `FitAddon`, writes `bus.snapshot()` to catch up, subscribes to new data, and forwards input.
- **Mods** are chrome-only. Each paints its frame (headers, decorations, fonts, palette) around an `xterm.js` host, picks an `ITheme` for terminal colors, and provides a `dispose()` that cancels animations and tears down.
- **ModHost** manages mount/unmount with a 300ms black curtain between swaps. xterm re-mounts on each swap and replays `bus.snapshot()` so terminal state (scrollback, cursor, colors) reconstructs correctly.
- **Preview iframes** in the picker load `preview.html?mod=<id>` and feed a fake ANSI stream via `mock-replay`. Each card shows a live terminal preview.

## Directory layout

```
package.json              electron-builder config + scripts
electron-builder.yml      packaging; asarUnpack includes node-pty native
vite.config.ts            multi-entry: src/index.html + src/preview.html
tsconfig.json

electron/
  main.ts                 BrowserWindow, node-pty spawn/write/resize, IPC, menu
  preload.ts              contextBridge → window.cli (start/stop/send/resize/onData/…, llm.*)
  settings.ts             loadSettings / saveSettings / patchSettings (JSON in userData)
  llm/
    models.ts             hard-coded catalog (id, url, sha256, size, license, ctx window)
    downloader.ts         fetch → .partial → sha256 verify → rename; AbortController per id
    manager.ts            node-llama-cpp loader, single-session queue, AbortController per requestId
    ipc.ts                registers llm:* ipcMain.handle and event senders

src/
  index.html              main app entry
  index.ts                boots TerminalBus, mounts ModHost, wires picker + menu + keybindings
  preview.html            standalone entry loaded in picker iframes
  preview.ts              mounts one mod + mock-replay; reads ?mod=<id>
  bus.ts                  TerminalBus (write/onData/sendInput/resize/snapshot, llm ref, profile → onTool)
  picker.ts               full-screen picker overlay with live iframe previews
  settings-dialog.ts      first-run / Cmd+, settings form (binary + cwd + args + Local AI catalog)
  types/events.ts         AppSettings, WindowBounds, StatusEvent, ModSelection, LlmSettings ref
  devtools/
    mock-replay.ts        canned ANSI byte stream for dev:mock + picker previews
  profiles/
    types.ts              Profile, ProfileParser, ToolEvent (tool_start/output/end/assistant/turn)
    registry.ts           PROFILES list + detectProfile(binary) + getProfile(id)
    ansi.ts               stripAnsi + nextId helpers
    line-parser.ts        makeLineSplitter — buffers PTY chunks, emits plain-text lines
    claude.ts             Claude profile — ⏺ Tool(args) / ⎿ output transcript grammar
    codex.ts              Codex profile — • Verb args / └ result / ─ Worked for X ─
  llm/
    types.ts              shared LLM types (catalog entry, status, progress, options)
    client.ts             renderer LlmClient: wraps window.cli.llm + requestId stream dispatch
    prompts.ts            buildSessionSummary / buildBrainrotCaption / buildPetComment / buildToolAlias
  shared/
    ai-pet.ts             floating commentator bound to SessionBridge + bus.llm.stream()
  mods/
    types.ts              Mod interface, ModId = "neon" | "oracle" | "editorial" | "brainrot"
    registry.ts           ModHost, MOD_META, MOD_ORDER
    shared/
      xterm-host.ts       mountXterm(container, bus, {theme, fontFamily, …}) helper
      tool-overlay.ts     attachToolFeed({bus, overlayHost, onStart, onOutput, onEnd}) — subscribes + catches up from toolSnapshot, returns a pointer-events:none overlay div over the xterm host for in-console micro-animations
    neon/                 Neon Shrine mod — index.ts, skyline.ts, styles.css
    oracle/               The Oracle mod — index.ts, window.ts, zodiac.ts, roman.ts, styles.css
    editorial/            Editorial mod — index.ts, infinity.ts, token-rate.ts, styles.css
```

## Keyboard + menu

| shortcut | action | where wired |
|---|---|---|
| `Cmd+,` | Open picker | menu: `menu:open-picker`; renderer keydown |
| `Cmd+Shift+M` | Cycle to next mod | menu + keydown |
| `Cmd+R` | Restart PTY (new agent session) | menu click handler in `main.ts` |
| `Cmd+K` | Clear screen (sends `\x0c`) | menu handler |
| `Cmd+.` | Stop agent | menu only |
| `Cmd+Shift+R` | Browser reload (devtools) | menu `role: reload` |

Note: most "terminal" shortcuts (arrows, Ctrl+C, Tab completion, Ctrl+R history search, paste, scrollback via PageUp, etc.) go straight through `xterm.js` into the PTY. The shortcuts listed above are **app-level chrome**; everything else is the real terminal.

## Commands

```bash
npm install
npm run rebuild-native # rebuild node-pty for Electron's abi (see note below)
npm run dev            # live PTY — Vite + Electron
npm run dev:mock       # canned ANSI stream — used for mod design without spawning a real binary
npm run build          # tsc --noEmit + vite build (emits dist/ + dist-electron/)
npm run start          # electron . (requires build first)
npm run package        # electron-builder for current platform
npm run package:dmg    # mac dmg only
```

### Rebuilding node-pty

`node-pty` is a native module and must be rebuilt against Electron's Node ABI. On macOS the build needs a system Python and an SDK without the `__builtin_clzg`/`__builtin_ctzg` C++ intrinsics (Apple clang 16 chokes on the newest SDK's stdlib). The pattern that works today (Darwin 25.4, x64 under Rosetta):

```bash
PYTHON=/usr/bin/python3 npm_config_python=/usr/bin/python3 \
  SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk \
  npx electron-rebuild -f -w node-pty
```

Use `/usr/bin/python3` (Apple's system Python) because `/opt/homebrew/bin/python3` is arm64-only.

## Invariants / gotchas

- **Each mod owns one xterm instance.** On unmount, the shared helper's `dispose()` tears down the ResizeObserver, data-listener, and xterm.
- **Mid-session mod swaps** are supported because `bus.snapshot()` returns the full buffered PTY output (capped at 500 KB), and the next mod writes it into its fresh xterm. Most ANSI state reconstructs faithfully. Some edge cases (title-setting OSC codes, bracketed paste mode) are cumulative and may not perfectly reconstruct.
- **Mods MUST NOT intercept keyboard input meant for the terminal.** xterm.js captures keystrokes directly and forwards them to the PTY. Don't add `keydown` listeners on mod DOM that would swallow `Ctrl+C`, arrows, tab, etc. The only global shortcuts are the ones in the Keyboard table above, and they check `metaKey || ctrlKey` to distinguish.
- **Fit addon drives PTY resize.** A `ResizeObserver` on the terminal host element calls `fit.fit()` which recalculates `cols`/`rows`; the bus pushes those to main via `pty:resize`.
- **Fade curtain is attached to `document.body`** (z-index 900) so it sits above every mod's layout while staying below the picker (z-index 1000).
- **stdin framing is raw.** The PTY is a passthrough — `bus.sendInput(data)` writes the exact bytes. No JSON wrapping, no semantic translation. This is what gives us terminal-fidelity.
- **Window bounds are debounced 400ms** on `resize`/`move` and flushed on `close`. Bounds smaller than 640×400 are ignored on load.
- **Vite root is `src/`.** Paths like `preview.html?mod=neon` resolve both in dev and in packaged builds.
- **CSP in `index.html`** is `default-src 'self'` with `'unsafe-inline'` for script/style. `xterm.js` CSS is imported from `@xterm/xterm/css/xterm.css` inside the shared helper and bundled by Vite — no external URLs.
- **electron-builder packs node-pty** via `asarUnpack: node_modules/node-pty/**/*`. The native `pty.node` must be reachable at runtime; it can't live inside the asar archive.
- **node-llama-cpp is ESM and native.** Main process uses dynamic `import("node-llama-cpp")` inside `electron/llm/manager.ts`; the module is externalized in `vite.config.ts` and `asarUnpack`ed in `electron-builder.yml` along with its `@node-llama-cpp/*` platform binaries.

## Local LLM layer

Optional, opt-in, fully local. Users download one or more GGUF models from a curated catalog (Qwen3 4B Instruct 2507, Qwen3.5 4B, Gemma 4 E4B) and pick an active one. Models live in `app.getPath("userData") + "/models/<id>.gguf"`. Inference runs in the main process via `node-llama-cpp`; renderer never touches the model.

**IPC surface** (registered by `electron/llm/ipc.ts`):

| channel | direction | purpose |
|---|---|---|
| `llm:list` | invoke | public catalog + downloaded flags |
| `llm:status` | invoke | current `LlmStatus` |
| `llm:download` / `llm:cancel-download` | invoke | start/abort a download |
| `llm:delete` / `llm:set-active` / `llm:set-enabled` | invoke | model management |
| `llm:generate` | invoke | one-shot, returns `{text}` |
| `llm:stream` | invoke | streaming; returns immediately, tokens + end flow over events |
| `llm:cancel` | invoke | cancel an in-flight `requestId` |
| `llm:download-progress` | event → renderer | `{modelId, bytes, total, phase}` |
| `llm:status-changed` | event → renderer | full `LlmStatus` |
| `llm:token`, `llm:end` | event → renderer | per-request streaming tokens + terminal event |

**Request queue**: `LlmManager` serializes `generate()` calls on a single chat session (llama.cpp is single-threaded). Each request has a `requestId` + `AbortController`. Cancellation from the renderer rejects the pending promise with `AbortError`.

**Mod consumption**: every mod receives `bus.llm` (`LlmClient`). Usage pattern:

```ts
if (bus.llm?.isAvailable()) {
  const { text, cancel } = bus.llm.stream(
    buildBrainrotCaption(info),
    (tok) => caption.textContent += tok,
    { systemPrompt: BRAINROT_SYSTEM, maxTokens: 24, temperature: 1.15 },
  );
  teardowns.push(cancel);
  text.then((full) => caption.textContent = full.trim()).catch(() => {});
}
```

Always guard with `isAvailable()` and always track the returned `cancel()` so `unmount()` can abort in-flight requests. Use prompt helpers from `src/llm/prompts.ts` for consistent session-context framing.

### Rebuilding node-llama-cpp

node-llama-cpp ships prebuilt binaries for Mac/Windows/Linux, so normally no rebuild is needed. If the postinstall step fails to place the right platform binary, run:

```bash
npx --yes node-llama-cpp source download
```

On Apple Silicon this pulls a Metal-accelerated build; on Intel Macs / Linux / Windows it pulls the appropriate variant.

## Profile layer (tool-event stream)

Observational-only parsers that translate the PTY stream into structured tool-use events. Profiles never alter terminal output — they just run alongside it and emit events for mods to consume. Two ship today:

| profile | id | matches binary name | transcript grammar |
|---|---|---|---|
| Claude Code | `claude` | contains `claude` | `⏺ Tool(args)` / `⎿ output` / `⏺ prose` |
| Codex | `codex` | contains `codex` | `• Verb args` / `  └ result` / `─ Worked for X ─` |

**Detection**: `detectProfile(binary)` in `src/profiles/registry.ts` picks a profile from the configured binary. `index.ts` calls `bus.setProfile(detectProfile(bus.meta.binary))` after settings load and after the user changes the binary. `preview.ts` locks the Claude profile since the picker's mock replay is Claude-shaped.

**Bus surface**:

| member | purpose |
|---|---|
| `bus.setProfile(p)` | install/replace the active parser; flushes the prior one |
| `bus.profileId` | `"claude"` / `"codex"` / `null` |
| `bus.onTool(cb)` | subscribe to the live `ToolEvent` stream; returns unsubscribe |
| `bus.toolSnapshot()` | last ~500 events (for mods mounted mid-session) |

**Event shape** (`src/profiles/types.ts`):

```ts
type ToolEvent =
  | { type: "tool_start";  id; name; args?; rawLine; ts }
  | { type: "tool_output"; id; toolId; text; ts }
  | { type: "tool_end";    id; toolId; name; status?; summary?; ts }
  | { type: "assistant";   id; text; ts }
  | { type: "turn";        id; label?; ts };        // codex "Worked for 1m 20s"
```

**Mod consumption** — raw `onTool`:

```ts
const unsub = bus.onTool((e) => {
  if (e.type === "tool_start") addRow(e.name, e.args);
  if (e.type === "tool_end")   markDone(e.toolId, e.summary);
});
// also replay any events that fired before this mod mounted:
for (const e of bus.toolSnapshot()) /* … */;
teardowns.push(unsub);
```

**Shared helper** — `attachToolFeed` in `src/mods/shared/tool-overlay.ts` wraps catch-up + subscription + an optional in-console overlay layer:

```ts
const feed = attachToolFeed({
  bus,
  overlayHost: termHost,              // optional: pointer-events:none <div> over xterm
  onStart:  (e) => addChip(e),        // chip sidebar animates in
  onOutput: (e) => flashOutput(e),    // append + flash most recent line
  onEnd:    (e) => markOk(e.toolId, e.summary),
});
teardowns.push(() => feed.dispose());
```

The `overlayHost` option auto-adds `position:relative` to the host if needed and injects a `z-index:3;pointer-events:none` overlay element so mods can spawn floating badges/animations **inside** the terminal viewport without intercepting keystrokes (xterm keeps owning the keyboard). `feed.prefersReducedMotion()` reports the user's OS setting for JS-gated effects; CSS-driven animations should use `@media (prefers-reduced-motion: reduce)`. The Brainrot mod uses this pattern to render cooking/ok chip stickers in the sidebar and to float an emoji tool badge near the cursor on every `tool_start`.

**Adding a profile**: implement `Profile` + `ProfileParser` in `src/profiles/<id>.ts`, register in `PROFILES` in `registry.ts`, and give it a `matches(binary)` predicate. Use `makeLineSplitter` from `line-parser.ts` to get plain-text lines (ANSI-stripped, CRLF-normalized, in-place redraws collapsed) and feed them through your state machine.

**Gotchas**:

- Profiles are **observe-only**. The existing `tool-call-transformer.ts` (used by Oracle/Brainrot to restyle the `⏺ Tool` line) runs separately via xterm's `dataTransform` and still owns visual rewrites.
- Profile parsing runs once per byte — at the moment `bus.write()` is called — and every emitted event is retained in the tool-history ring (capped at 500). A mod mounted mid-session should call `bus.toolSnapshot()` on mount to catch up on past events before subscribing with `bus.onTool()`.
- The parser state resets on `bus.clear()` (Cmd+K) and on `setProfile()` swaps.

## Session layer (stats + statusline)

Mods get session stats through three independent observe-only channels — none of them push from main; the renderer **scrapes the agent's own statusline out of the xterm buffer** and re-emits it as typed snapshots.

| channel | source | shape | cadence |
|---|---|---|---|
| `bus.meta` | set once by main on PTY spawn | `{pid, isMock, cwd, binary}` | static |
| `createSessionBridge(term, bus)` | `watchStatusline` scans bottom rows of xterm's active buffer with regex against agent statusline glyphs, plus prompt scrape + OSC title + clocks + cumulative aggregates | `SessionInfo` (full catalog below) | debounced 180 ms after each `term.onRender`, plus a 1 s timer for clock/prompt refresh |
| `bus.onTool` / `bus.toolSnapshot()` | profile parser (claude/codex) | `ToolEvent` stream | per parsed PTY chunk |

**Statusline grammar** — `src/mods/shared/statusline.ts` matches glyph-prefixed segments on the bottom rows: `✷ model ✷`, `∑ tokens`, `$cost`, `◒ cwd`, `⏱ time`, `◈ ctx [..] N%`, `⧗ 5h […] N% ↺ left`, `⧗ 7d […] N% ↺ left`, `⏸/⏵⏵ mode`, plus the in-flight thinking line (`✻ Pondering… (12s · ↑ 3.2k tokens · esc to interrupt)`) — the `esc to interrupt` substring is the ground-truth busy flag. New agents that emit similar glyphs are picked up for free; agents that don't get a mostly-empty `Statusline` and mods fall back to `bus.meta` + tool stream.

**Mod consumption**:

```ts
const session = createSessionBridge(xt.term, bus);
const unsub = session.subscribe((info) => {
  if (info.ctxPct != null) gauge.style.width = info.ctxPct + "%";
  if (info.lastPrompt) title.textContent = info.lastPrompt;
});
teardowns.push(unsub, () => session.dispose());
```

`session.snapshot` is the latest emit (safe to read synchronously). `subscribe` immediately fires once with the current snapshot then on every change.

**Full `SessionInfo` catalog** (`src/mods/shared/session-info.ts`):

- **Identity / process** — `agentKind` (`"claude-code" | "other"`), `isClaudeCode`, `binary`, `pid`, `isMock` (mirrors `bus.meta`), `cwd`
- **Live statusline** (parsed from agent's bottom bar; all optional)
  - `model` — model display string
  - `tokensLabel` (raw, e.g. `"2.4k"`) + `tokensCount` (numeric)
  - `costLabel` (raw, e.g. `"0.42"`) + `costAmount` (numeric $)
  - `git` — branch / dirty marker
  - `statusTime` — clock string the agent itself rendered
  - `ctxPct` — context-window % used (0–100)
  - `block5hPct` + `block5hLeft` — 5h usage block % + time remaining
  - `block7dPct` + `block7dLeft` — 7d usage block % + time remaining
  - `mode` — `plan` / `accept edits` / `bypass permissions` / etc.
  - `statusline` — raw `Statusline` object with the same fields (escape hatch)
- **Thinking / processing state** (sourced from the same statusline scrape — Claude only renders the spinner line while a turn is in flight, so it doubles as a busy flag)
  - `busy` — `true` while Claude is processing the active prompt, `false` once the spinner row is gone (always defined; never `undefined`)
  - `busyVerb` — the rotating verb on the spinner line (`Pondering`, `Cogitating`, `Mulling`, …) when parseable
  - `busySeconds` — elapsed seconds reported by the agent's own pill
  - `busyTokens` — token label parsed off the pill (raw string, e.g. `"3.2k"`)
  - `busyStartedAt` — epoch ms recorded by the bridge on the `false → true` transition; cleared when busy flips back to false. Mods can render "thinking for `(nowMs - busyStartedAt)` ms" without tracking transitions themselves.
- **Clocks** — `nowMs` (epoch), `timeHHMM`, `timeHHMMSS`
- **Prompt scrape** (from xterm scrollback, not statusline) — `title` (first user turn, pinned once found), `lastPrompt` (most recent user turn), `terminalTitle` (sanitized OSC 0/2)
- **Aggregates** (module-level, persist across mod swaps within the window) — `aggregates.peakTokens`, `aggregates.peakCost`, `aggregates.totalTokens`, `aggregates.totalCost` (both handle in-session counter resets via base offsets), `aggregates.updates` (statusline change count), `aggregates.resets` (token-counter restart count), `aggregates.firstSeenAt`, `aggregates.lastUpdatedAt`
- **Tool stream** (separate channel) — `bus.profileId` plus `ToolEvent`s via `bus.onTool` / `bus.toolSnapshot()`
- **Raw bytes** (escape hatch for transcript-aware features like the brainrot bubble) — `bus.snapshot()` returns the capped 500 KB PTY tail; `bus.onData(cb)` streams live

**Helpers** — `formatTokens(n)` / `formatCost(n)` for display, `parseTokensLabel` / `parseCostLabel` to convert raw labels to numbers, `resetSessionAggregates()` to zero the module-level totals.

**Gotchas**:

- The bridge depends on the agent rendering its statusline near the bottom of the visible viewport. Agents that hide it (e.g. when running a long stdout-heavy command) will not refresh the fields until the statusline is back in view; aggregates therefore lag in those windows.
- `busy` is derived from the literal `esc to interrupt` substring on Claude's spinner row. Agents that don't print that string will read as permanently `busy=false`. To react to "Claude started thinking" / "Claude finished" inside a mod, watch for transitions in `session.subscribe`:

  ```ts
  let prevBusy = false;
  session.subscribe((info) => {
    if (info.busy && !prevBusy) onThinkingStart(info);
    if (!info.busy && prevBusy) onThinkingEnd(info);
    prevBusy = info.busy;
  });
  ```
- Aggregates are **module-scoped**, not per-mod. Mod swaps preserve totals/peaks; full PTY restart (`Cmd+R`) does not auto-reset them — call `resetSessionAggregates()` if a mod wants a clean slate.
- `tokensCount` / `costAmount` are best-effort parses of the agent's own label strings. They lose precision (`"2.4k"` becomes `2400`) and may be undefined if the agent uses unfamiliar units.

## Adding a mod

1. Create `src/mods/<id>/index.ts` exporting a factory that returns `Mod`:

   ```ts
   import { mountXterm } from "../shared/xterm-host";

   export function createMyMod(): Mod {
     let teardown: (() => void) | null = null;
     return {
       id: "mymod",
       meta: MOD_META.mymod,
       mount(root, bus) {
         // build your chrome DOM
         const host = document.createElement("div");
         host.className = "mymod-term-host";
         root.append(host /* + any frame, header, footer, decorations */);

         const xt = mountXterm(host, bus, {
           fontFamily: '"JetBrains Mono", monospace',
           theme: { background: "#…", foreground: "#…", … },
         });

         teardown = () => { xt.dispose(); /* + any other cleanup */ };
       },
       unmount() { teardown?.(); teardown = null; },
     };
   }
   ```

2. Widen `ModId` in `src/mods/types.ts` and `ModSelection` in `src/types/events.ts`.
3. Register in `src/mods/registry.ts`: add to `factories`, `MOD_ORDER`, `MOD_META`.
4. Add a menu entry in `electron/main.ts` `buildMenu()` under "Mod".
5. Picker card + live iframe preview pick it up from `MOD_META` automatically.

## Mock replay

`src/devtools/mock-replay.ts` emits a canned ANSI byte stream (colored output, simulated tool calls, prompt cursor) that loops forever. In `dev:mock`, the main process skips the real PTY and the renderer pipes mock bytes straight into `bus.write`. Use this for all visual design work — no real agent needed.

## Packaging

- Drop `build/icon.icns` (macOS), `build/icon.ico` (Windows), `build/icon.png` (Linux).
- `asarUnpack: dist-electron/**/*` keeps the preload reachable; the same entry covers `node_modules/node-pty/**/*` so the native `.node` binary can be loaded.
- `publish: null` prevents electron-builder from uploading.

## What does NOT exist yet

- No tests. Visual design happens against `dev:mock`.
- No CI.
- No auto-update.
- No per-mod settings.
- Cross-platform native rebuilds haven't been exercised beyond the dev machine.
