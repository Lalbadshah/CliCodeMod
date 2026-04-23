# Open-source launch plan for CliCodeMod

## Context

CliCodeMod is an Electron app that runs any CLI coding agent (Claude Code, Codex, etc.) inside a real pseudo-terminal, with swappable "mod" chrome (Neon Shrine, The Oracle, Editorial, Brainrot). It also ships an opt-in local-LLM layer (node-llama-cpp + Qwen/Gemma 4B models) that powers ambient features like the Brainrot TV caption and floating "AI pet."

Today the project is a solo codebase with no public name, no tests, no CI, a partially-polished DMG build path, and a hardcoded registry of four mods. The goal of this plan is to turn it into a shippable, shareable open-source project: name + brand + DMG installer, a full documentation set (architecture + mod engine + LLM layer) with diagrams, an *external* mod-folder system so third parties can author mods without forking, a repeatable mod-creation skill/agent, and a release workflow.

This is a **multi-phase** program, not a single-session change. The plan below sequences the work so each phase produces a shippable artifact.

---

## Open decisions (resolved)

1. **Naming** — deferred. Work under the current `CliCodeMod` working name through all phases. Name + logo + wordmark become a **pre-launch blocker** (added to Phase A as "deferred sub-step"), not a dependency for building the rest.
2. **Scope of external mods** — **folder-based dynamic loading, full renderer trust** (v1). Subfolders of a user-configurable `modsDir` are mods; each runs with full access to the bus/LLM/DOM, like VSCode extensions. Sandboxing is v2.
3. **Cross-platform packaging** — **DMG-first** (macOS arm64 + x64). Windows `.exe` and Linux `AppImage` built via existing electron-builder config but marked "experimental / untested" until verified.
4. **Code signing** — **decide later**. Build everything assuming signing *will* exist (plumbing stubbed, env-var based); ship **unsigned builds in the meantime**. Phase F implementation below accounts for both paths:
   - **Unsigned path (now)**: DMG ships without signature. README gives users the `xattr -d com.apple.quarantine` incantation for the Gatekeeper warning. Auto-update degrades to a notification + "download latest from GitHub Releases" button (no in-place update, but we still detect and surface new versions).
   - **Signed path (later)**: flipping on notarization is one env-var change (`APPLE_ID`/`APPLE_ID_PASSWORD`/`CSC_LINK` set in CI secrets) + one electron-builder.yml flag. `electron-updater` becomes fully functional at that point.

---

## Phase A — Identity, license, repo hygiene *(1–2 sessions)*

Goal: the repo is presentable and legally shippable. Work proceeds under the working name **CliCodeMod**; naming + logo are deferred to a pre-launch sub-phase.

- [ ] **Deferred (pre-launch)**: name shortlist (5 candidates + domain/GitHub-org availability), logo + wordmark (primary mark for DMG icon + README hero, monochrome variant for favicons, horizontal wordmark), and `build/icon.{icns,ico,png}` derived from the logo. Until this sub-phase runs, the app ships with a placeholder icon and the working name "CliCodeMod" in README + DMG metadata.
- [ ] **LICENSE** — add `LICENSE` (Apache-2.0 recommended) at repo root; add SPDX headers? (optional; skip unless user wants it).
- [ ] **README.md (hero)** — hero GIF, one-paragraph pitch, three-mod screenshot strip, install link, `npm run dev` quickstart, link to docs site. Keep this separate from the deep docs.
- [ ] **CONTRIBUTING.md** — how to build locally, how to run `dev:mock`, how to propose a new built-in mod, how to submit a third-party mod to a future gallery.
- [ ] **CODE_OF_CONDUCT.md** — standard Contributor Covenant v2.1.
- [ ] **`.github/ISSUE_TEMPLATE/`** — bug / feature / new-mod-proposal templates.
- [ ] **`.github/PULL_REQUEST_TEMPLATE.md`** — checklist (build passes, lint passes, docs updated).

Critical files: `README.md` (rewrite), `LICENSE` (new), `CONTRIBUTING.md` (new), `build/icon.{icns,ico,png}` (new).

---

## Phase B — Documentation site *(3–5 sessions)*

Goal: anyone can understand the architecture, write a mod, and use the local-LLM layer without reading source.

**Hosting**: publish via GitHub Pages from a `docs/` folder using **Astro Starlight** or **mkdocs-material**. Starlight is my default — it's MDX-friendly and handles diagrams cleanly.

**Doc structure**:

```
docs/
├── index.md                    Landing page — what, why, install
├── getting-started/
│   ├── install.md              DMG / brew / build-from-source
│   ├── first-run.md            Settings dialog, binary picker, first mod pick
│   └── shortcuts.md            Cmd+, Cmd+Shift+M etc. table
├── mods/
│   ├── overview.md             What a mod is (chrome-only) + the 4 built-ins
│   ├── neon.md                 Neon Shrine walkthrough (screenshots + what it shows)
│   ├── oracle.md               The Oracle walkthrough
│   ├── editorial.md            Editorial walkthrough
│   └── brainrot.md             Brainrot walkthrough (incl. LLM features)
├── architecture/
│   ├── overview.md             The three-layer diagram (PTY / Bus / Mod)
│   ├── pty-layer.md            node-pty in main process, IPC channels
│   ├── bus-layer.md            TerminalBus, snapshot/replay, tool events
│   ├── mod-engine.md           ModHost, swap lifecycle, xterm-host helper
│   └── profile-layer.md        Claude / Codex parsers, ToolEvent stream
├── local-ai/
│   ├── overview.md             What local AI does, privacy posture
│   ├── models.md               Catalog, sizes, licenses, context windows
│   ├── ipc-reference.md        Every llm:* channel with payload shapes
│   ├── streaming.md            Sequence diagram: renderer → main → tokens
│   └── troubleshooting.md      Metal, rebuild, node-llama-cpp source download
├── building-mods/
│   ├── quickstart.md           scaffold → edit → reload (uses CLI scaffolder from Phase E)
│   ├── anatomy.md              Mod factory contract, mount/unmount, teardown checklist
│   ├── chrome-patterns.md      DOM shell, xterm theme, animations, reduced-motion
│   ├── session-info.md         createSessionBridge, SessionInfo shape
│   ├── tool-events.md          attachToolFeed patterns, overlay host, catch-up
│   ├── llm-integration.md      bus.llm.stream, prompt helpers, cancellation on unmount
│   ├── distribution.md         Manifest format, publishing to the gallery
│   └── troubleshooting.md      Common gotchas (keyboard capture, snapshot replay, leaks)
└── reference/
    ├── keyboard.md             Full shortcut table
    ├── settings-json.md        settings.json schema
    ├── mod-manifest.md         mod.json schema
    └── changelog.md            generated from releases
```

**Source material** (all captured in exploration, ready to write from):

- Mod engine: `src/mods/types.ts:27-35` (contract), `src/mods/registry.ts:57-167` (ModHost, curtain at z-index 900, race-token swap), `src/mods/shared/xterm-host.ts:23-79` (mountXterm + ResizeObserver-drives-PTY-resize invariant), `src/mods/shared/tool-overlay.ts:40-90` (attachToolFeed + catch-up).
- Bus: `src/bus.ts:15-118` (500KB buffer cap, 500-event tool-history cap, try/catch on every listener).
- PTY: `electron/main.ts:27-94` (spawn + mod-voice injection), `electron/main.ts:323-354` (IPC handlers), `electron/preload.ts:51-98` (contextBridge surface).
- LLM: `electron/llm/manager.ts:32-40` (dynamic ESM import), `electron/llm/manager.ts:28,169-174` (single-threaded queue), `electron/llm/manager.ts:131-160` (AbortController lifecycle), `electron/llm/downloader.ts:185-194` (sha256 gate — ready but inactive), `electron/llm/models.ts:3-38` (catalog), `src/llm/client.ts:29-32,159-180` (StreamHandle), `src/llm/prompts.ts` (all 4 prompt builders).
- Mods: Neon `src/mods/neon/skyline.ts` (rain/car/moon RAF), Oracle `src/mods/oracle/zodiac.ts` (zodiac rotation + star twinkle), Editorial `src/mods/editorial/token-rate.ts` (30-min sparkline), Brainrot `src/mods/brainrot/index.ts:449-590` (typing FX), `src/mods/brainrot/index.ts:603-642` (LLM alias generation), `src/mods/brainrot/index.ts:748-774` (debounced caption streaming), `src/shared/ai-pet.ts` (pet commentator).

**Writing order**: `architecture/` → `mods/` → `local-ai/` → `building-mods/`. Architecture first because every other page links into it.

---

## Phase C — Diagrams *(1 session after Phase B outlines exist)*

Goal: five canonical SVG diagrams embedded in the docs.

Use **Excalidraw** exports checked in as SVG (editable source `.excalidraw` lives next to the SVG). Alternative: Mermaid for sequence diagrams since Starlight renders it natively — recommended for the LLM streaming + mod-swap flows.

1. **System architecture** (top-level) — Electron main ↔ PTY ↔ IPC ↔ Renderer (Bus ↔ Mod ↔ xterm). Excalidraw.
2. **Mod swap lifecycle** (sequence) — user presses Cmd+, → picker → selection → curtain fade → old mod unmount → bus.snapshot() → new mod mount → xterm replay → curtain out. Mermaid sequence.
3. **Profile + tool-event stream** — PTY bytes → line-parser → profile state machine → ToolEvent → bus ring buffer → mod onTool subscribers. Excalidraw.
4. **LLM streaming request** (sequence) — renderer `bus.llm.stream()` → IPC `llm:stream` → manager queue → ChatSession → `llm:token` events → `llm:end` → promise settle. Include cancellation arrow. Mermaid sequence.
5. **Download + verify flow** — click download → `.partial` write + sha256 hash → rename on verify → event stream `downloading/verifying/done`. Mermaid flowchart.

Each diagram gets a 1-paragraph caption explaining what to notice.

---

## Phase I — Universal session-data extraction *(3–5 sessions; **distribution blocker**, must ship before public release)*

Goal: mods receive a stable `SessionInfo` (tokens, cost, ctx%, block budgets, model, cwd, git, mode, lastPrompt) from **any supported agent** — Claude Code, Codex, Gemini CLI — without the user having to install a bespoke custom statusline first.

**Current state (the gap you called out)**:
- `src/mods/shared/statusline.ts:18-27` parses a specific custom statusline with glyphs `✷ ∑ ◒ ⏱ ◈ ⧗ ⏵⏵` and a specific field layout. That's *your* statusline, not a standard.
- `src/mods/shared/session-info.ts` (`createSessionBridge`) sits on top of `watchStatusline` + terminal buffer scans. Every mod's data supply chain assumes the user has your custom statusline installed. Distributing the app to anyone else would give them mostly empty UI cells.
- The profile layer (`src/profiles/claude.ts`, `src/profiles/codex.ts`) already parses tool events per-agent, but it doesn't extract session metadata.

**Design — three-layer data supply**:

### Layer 1: Native-UI parsing per agent (baseline, works without any install)

Extend the `Profile` interface to emit `session_info` events alongside tool events:

```ts
type SessionInfoEvent = {
  type: "session_info";
  id: string;
  fields: Partial<SessionInfo>;   // only the fields this event knows about
  ts: number;
};
```

Each built-in profile parser reads whatever the agent natively displays and emits partial updates. The bus merges partials into a live `SessionInfo` snapshot; mods subscribe via `bus.onSession(cb)` / `bus.session()`.

- **Claude Code** (`src/profiles/claude.ts`): parse its default status banner, `/model` output, `/cost` output, `⏺ Tool` chrome. Extracts: `model`, `cost`, `tokens`, `cwd`, `mode` (plan/accept/auto). `ctxPct` available after `/cost`.
- **Codex** (`src/profiles/codex.ts`): parse its `─ Worked for X ─` turn markers, `• Verb args` chrome, settings banner. Extracts: `model`, `cost`, `cwd`, `mode`. Tokens if surfaced.
- **Gemini CLI** (new `src/profiles/gemini.ts`): research Gemini CLI's default UI (it's Google's `gemini-cli` npm package). Expected native fields: `model`, `cwd`. Tokens/cost likely not surfaced without a helper.

Parsers degrade gracefully — missing fields stay undefined, mods render placeholders. `SessionInfo` already supports optional fields, so mod-side changes are minimal.

### Layer 2: Optional CliCodeMod helper for richer data

Ship a tiny helper binary `clicodemod-statusline` (TypeScript, bundled with the app, exposed via `app.getPath("resources")`). When invoked by an agent, it emits a **single-line NDJSON token** on stdout with a stable schema:

```json
{"_clicodemod":1,"model":"claude-opus-4-7","tokens":178123,"cost":13.384,"ctxPct":10,"block5hPct":23,"block5hLeft":"1h54m","block7dPct":27,"block7dLeft":"122h54m","git":"main","cwd":"/Volumes/…","mode":"default","t":1737200000}
```

Parsers recognize the `{"_clicodemod":1,...}` sentinel and merge the whole object into `SessionInfo` in one event (source-of-truth; overrides native parsing).

**Agent-specific install paths** (Settings dialog adds one-click buttons per detected agent):

- **Claude Code**: writes `~/.claude/settings.json` `statusline` field to point at the helper binary. Claude Code invokes it every turn and renders the output in its status area; the raw JSON token is just printed near the agent's prompt and our profile parser picks it up from the PTY stream. Non-destructive: if the user already has a custom statusline, we offer to wrap it (our helper calls the user's existing statusline, appends the sentinel line).
- **Codex**: research if Codex has a statusline hook. If not, skip — Codex ships Layer-1 parsing only in v1.
- **Gemini CLI**: same — research hooks. If it has a `prompt` or `preamble` extension point, install there. Otherwise skip.

The helper reads from env (tokens, cost etc. are typically exposed as env vars by the invoking agent for statusline commands — this is how Claude Code does it per its docs). When an agent doesn't expose data via env, the helper reports only what it can.

### Layer 3: Settings-dialog agent detection + one-click install

Settings dialog gains a **"Data sources"** section:

- For each detected agent (binary the user has configured — Claude Code, Codex, Gemini), show:
  - Status row: "Layer 1 (native parsing) — active" / "Layer 2 (helper) — not installed / installed at ~/.claude/settings.json"
  - "Install helper" / "Uninstall helper" button
  - Preview of what fields are being populated right now (live)
- Auto-detect on first run; prompt user "Install CliCodeMod helper for Claude Code? (better data)" as an opt-in.

### Layer-0 contract: What a mod can safely assume

Document in `docs/building-mods/session-info.md`:

- **Always present**: `agent` (the binary name), `cwd` (fallback to process.cwd)
- **Usually present**: `model`, `git` (Layer-1 for Claude/Codex)
- **Sometimes present**: `tokens`, `cost`, `ctxPct`, `block5hPct`, `mode` (Layer-2 helper for Claude Code, partially via Layer-1)
- **Rarely present**: `block7dPct`, `lastPrompt` on non-Claude agents

Mods render placeholders (e.g., "—", "n/a", dimmed cells) when fields are missing. The existing session-info consumers already tolerate undefined fields; audit + tighten them during this phase.

### Critical files

- `src/profiles/types.ts` — add `SessionInfoEvent` to `ToolEvent` union; widen `ProfileParser` return type.
- `src/profiles/claude.ts`, `src/profiles/codex.ts` — emit `session_info` events. Add recognition of the `{"_clicodemod":1,…}` sentinel.
- `src/profiles/gemini.ts` — new; Gemini CLI parser with whatever fields its UI exposes.
- `src/profiles/registry.ts` — register Gemini; `detectProfile(binary)` matches on `gemini`.
- `src/profiles/sentinel.ts` — new; parse the CliCodeMod JSON sentinel, shared by all profiles.
- `src/bus.ts` — add `private sessionSnapshot: SessionInfo`; `onSession(cb)`, `session(): SessionInfo`. Merge partials from `session_info` events.
- `src/mods/shared/session-info.ts` — `createSessionBridge` becomes a thin adapter over `bus.onSession` for backwards compat. Deprecate `watchStatusline` for the user's custom format (keep as fallback only when profile is null).
- `src/mods/shared/statusline.ts` — demote to an optional "legacy custom statusline" parser gated by a setting. Not loaded by default for shipped builds.
- `helper/clicodemod-statusline/` — new small TypeScript package; bundled into the Electron app's resources; single executable entry that reads env + optional user-wrapped command and prints the sentinel line.
- `electron/agent-config.ts` — new; detect + install/uninstall helper in Claude Code / Codex / Gemini config files.
- `electron/main.ts` — expose `agents:detect`, `agents:install-helper`, `agents:uninstall-helper` IPC.
- `src/settings-dialog.ts` — "Data sources" section.

### Verification

- With no helper installed, launch each agent (Claude Code, Codex, Gemini CLI) — verify SessionInfo populates with at least `agent`, `cwd`, `model`, and enough fields for mods to not look broken.
- Install the helper into Claude Code via one click — verify `tokens`, `cost`, `ctxPct`, `block5h*`, `block7d*`, `mode` all populate live. Verify uninstall reverts the Claude Code settings file cleanly.
- Verify the user's existing custom statusline still works via the Layer-0 fallback when `clicodemod` sentinel isn't present.
- Kill the helper binary mid-session (simulate crash) — verify the app doesn't hang; data freezes at last known good values.
- Run `dev:mock` — verify mock stream fakes out a sentinel so all four mods render with complete data in development.

---

## Phase D — External mod-folder loader *(3–5 sessions; the biggest refactor)*

Goal: third parties can ship a mod as a folder without forking the repo.

**Design (folder format)**:

```
~/my-mod/
├── mod.json           manifest (id, name, blurb, preview, voicePrompt?, toolAliases?)
├── index.js           compiled ESM, default-exports a Mod factory
├── styles.css         optional; auto-injected into a <style> tag scoped by id
└── assets/            optional; accessible via file:// URLs the loader resolves
```

**`mod.json` schema** (documented under `reference/mod-manifest.md`):

```json
{
  "id": "neon-shrine-dark",
  "name": "Neon Shrine — Dark",
  "blurb": "Cyberpunk CRT, low-light palette",
  "version": "0.1.0",
  "author": "handle",
  "preview": { "bg": "#…", "accent": "#…", "ink": "#…", "label": "NEON·DARK" },
  "engine": "^1.0.0",
  "entry": "./index.js",
  "styles": "./styles.css"
}
```

**Loader design**:

- Settings gain a `modsDir: string` field (default `${app.getPath("userData")}/mods`, user-configurable from settings dialog — mirror the existing `modelsDir` pattern in `electron/settings.ts` and `electron/llm/ipc.ts`).
- Main process enumerates subfolders of `modsDir`, reads each `mod.json`, validates schema, and passes a list of `{ id, manifest, entryUrl, stylesUrl }` to the renderer via a new `mods:list` IPC channel + `mods:changed` watcher event.
- Renderer: new `src/mods/external-loader.ts` that, for each manifest, injects `<style>` from stylesUrl and `import(entryUrl)`s the factory. Loader registers the factory in `MOD_ORDER` + `MOD_META` alongside built-ins.
- `ModId` type changes from a string-union to `string`. Built-ins keep their stable ids (`"neon"`, `"oracle"`, etc.).
- CSP: `index.html` currently uses `default-src 'self'`. External mod JS must load from a file:// URL whitelisted via `webPreferences.webSecurity` or a custom protocol handler (`mod://`). Prefer the custom protocol — safer and keeps CSP clean.
- Engine-version gate: if `manifest.engine` doesn't satisfy the app's engine range, skip with a warning toast. Prevents old mods from breaking after breaking changes.

**Critical files to modify**:

- `electron/settings.ts` — add `modsDir` to `AppSettings`.
- `electron/main.ts` — add `mods:*` IPC + `mod://` protocol handler (app.protocol.registerFileProtocol).
- `electron/preload.ts` — expose `cli.mods.{list, onChanged, openDir, reveal}`.
- `src/mods/types.ts` — widen `ModId` to `string`; add `ModManifest` type.
- `src/mods/registry.ts` — ModHost consumes a combined factory map (built-ins + externals); `MOD_ORDER` becomes dynamic.
- `src/mods/external-loader.ts` — new; manifest fetch, style injection, dynamic import, factory registration.
- `src/settings-dialog.ts` — add "Mods folder" row with picker + "reveal in Finder" + "reload mods" buttons.
- `src/picker.ts` — show external mods in the grid with a small badge distinguishing them from built-ins.

**Migration**: built-in mods stay baked in — they're part of the app bundle. External loader is additive.

**Security posture (v1)**: external mods run with full renderer privileges (access to bus, LLM, IPC). This is documented clearly under `building-mods/distribution.md`. A sandboxed `<iframe>` execution mode is a future v2.

---

## Phase E — Mod-creation skill + scaffolder *(2 sessions)*

Goal: a user can go from "I want a mod" to a working mod folder in 5 minutes, with an AI agent doing the heavy lifting.

**Two deliverables**:

1. **CLI scaffolder** — `npx create-clicodemod-mod <name>` (or the project's chosen package name). Generates the folder structure above, pre-fills `mod.json`, stubs `index.ts` using a template that calls `mountXterm` + `attachToolFeed`, and sets up a local build script (esbuild bundle to `index.js`). Ships in the same monorepo under `packages/create-mod/`.

2. **Claude Code skill** — `.claude/skills/create-mod.md` in the repo, and a standalone downloadable version users can drop into their own `~/.claude/skills/`. The skill's system prompt gives Claude:
   - the mod factory contract (from `src/mods/types.ts`)
   - the xterm-host mount pattern
   - the session-info / tool-feed / LLM integration patterns (with code snippets from the built-in mods as few-shot examples)
   - a "mod author's checklist" covering teardown, reduced motion, keyboard pass-through, snapshot replay
   - canonical file structure to emit

   The skill's interaction model: user describes the aesthetic (e.g., "a minimalist zen mod with ink-wash brush strokes"), skill generates `mod.json` + `index.ts` + `styles.css`. User runs `npm run build` in the mod folder, drops it in `modsDir`, reloads.

**Critical files**: `packages/create-mod/` (new package), `.claude/skills/create-mod.md` (new), `docs/building-mods/quickstart.md` (already listed in Phase B — will reference this tooling).

**Repeatability** depends on the skill prompt being tight. Plan to iterate on it with 2–3 real "build me a mod" sessions and refine the prompt based on what Claude gets wrong.

---

## Phase F — Packaging & releases *(2 sessions)*

Goal: users can install from a real DMG (notarized) without running `npm install`.

- [ ] **App icons** — `build/icon.icns` (macOS, 1024x1024 source, all sizes), `build/icon.ico` (Windows), `build/icon.png` (Linux). Derived from the Phase A logo.
- [ ] **DMG polish** — background image, layout (drag to Applications), custom volume name. electron-builder's `mac.dmg` config.
- [ ] **Code signing + notarization** (macOS) — **plumbing stubbed, disabled by default**. `electron-builder.yml` reads `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `CSC_LINK` from env; when unset (the current case), builds skip signing and emit an unsigned DMG. When the Apple Developer account is eventually acquired, signing turns on by setting those secrets in GitHub Actions — no code changes needed. Ship unsigned DMGs in the interim and document the `xattr -d com.apple.quarantine /Applications/CliCodeMod.app` incantation in the README install section.
- [ ] **GitHub Actions release workflow** — on tag push `v*`, run `npm run build && npm run package:dmg` on macOS runners, upload the DMG as a release asset. Matrix over `darwin-arm64` and `darwin-x64`. Windows + Linux matrix entries as follow-up.
- [ ] **Version bumping** — use `standard-version` or manual; document the release cadence in `CONTRIBUTING.md`.

**Critical files**: `electron-builder.yml` (add dmg background, signing config), `.github/workflows/release.yml` (new), `build/icon.*` (new), `build/dmg-background.png` (new).

### Update delivery (how installed users get new versions)

Two tracks — recommend **shipping both** so users can pick their comfort level:

1. **In-app auto-update** (primary path when signed) — use `electron-updater` from the electron-builder family, backed by **GitHub Releases** as the update feed (no self-hosted update server; electron-builder uploads `latest-mac.yml` / `latest.yml` alongside DMGs/exes during `electron-builder --publish`).
   - **Two modes based on signing status**:
     - **Signed builds (future)**: full in-place auto-update. On launch, `autoUpdater.checkForUpdates()` fires after a 3s delay; background download; in-app toast "Restart to update" (never auto-restart without consent).
     - **Unsigned builds (current)**: `autoUpdater` cannot apply updates (Squirrel.Mac rejects unsigned apps). Downgrade to a lightweight **update-checker** — a simple `fetch('https://api.github.com/repos/<owner>/<repo>/releases/latest')` on launch + daily, compares tag to `app.getVersion()`, and when newer shows an in-app toast "v1.2.0 available — open release page" that deep-links to the GitHub Releases DMG. User downloads manually and drag-copies over the old app. Same UX promise (user is never surprised by a new version), just requires one extra step.
   - The code path is written once: a `UpdateProvider` abstraction with two implementations (`ElectronUpdaterProvider` and `GithubReleaseCheckerProvider`). A build-time flag (based on whether `CSC_LINK` is set) picks the provider. Flipping to full auto-update is zero code churn once signing lands.
   - **Settings**: "Updates" section with "Check now", channel selector (`latest` / `beta`), and an enable toggle.
   - **Channels**: `latest` (stable) and `beta` (prereleases tagged `v1.2.0-beta.1`). Default `latest`.
   - **Delta updates**: electron-updater supports block-map deltas on signed builds (a 1MB bump doesn't re-download the whole ~100MB DMG). N/A for unsigned path.
   - **Kill switch**: `updates.enabled` setting (default `true`) — disable checks for restricted networks.

2. **Homebrew Cask** (secondary path, macOS power users) — submit a cask to `homebrew/cask` so `brew install --cask <project-name>` works; `brew upgrade` pulls new versions. This is purely a convenience channel and rides on GitHub Releases; no extra infra. Defer to after the first two notarized releases (the cask requires a track record).

### Update delivery for external mods

Mods loaded from `modsDir` are independent of the app binary — they don't get updated by `electron-updater`. For those:

- **v1 (ship with launch)**: `mod.json` includes an optional `updateUrl` pointing at a manifest JSON. App has a "Check mods for updates" button in settings that fetches each `updateUrl`, compares `version`, and offers to download a new zip into `modsDir`. No auto-update for mods — user always confirms.
- **v2 (later)**: curated gallery inside the app.

### Update delivery for local LLM models

Models are downloaded once and live in `modelsDir`. Catalog changes (new model added, url changed) require an app update today because the catalog is baked into `electron/llm/models.ts`. Acceptable for v1 — new models are rare. If this becomes a pain point, promote the catalog to a `catalog.json` fetched from the releases CDN at startup (cache locally). Tracked as follow-up.

**Critical files for update system**: `electron/auto-update.ts` (new; wraps `electron-updater`, wires toast), `electron/ipc.ts` (new or extend main.ts) for `update:check` / `update:install-on-quit`, `src/settings-dialog.ts` (Updates section), `electron-builder.yml` (publish config pointing at GitHub provider).

---

## Phase G — Videos *(parallel, async; out-of-session content)*

Goal: 3 short videos embeddable in the README + docs.

1. **Hero trailer** — 45 seconds. Cold open on a boring default terminal → Cmd+, → picker → cycling through all 4 mods with sample agent output → end card with repo URL. Cut to music.
2. **Local AI in 90 seconds** — showing settings dialog → model download → brainrot caption + AI pet reacting to real agent activity.
3. **Build your own mod in 5 minutes** — scaffolder → Claude Code skill generating a mod → drop into `modsDir` → reload → new mod in picker.

**Deliverables for this session**: scripts + shot lists + asset requirements (fonts, music license, screen-capture resolution — 2560×1600 for Retina). Recording happens out-of-session using QuickTime + ffmpeg for post. Claude can draft scripts but can't record.

---

## Phase H — Community infrastructure *(1 session)*

Goal: the project looks maintained and is easy to contribute to.

- [ ] GitHub Discussions enabled; seeded with "Share your mods" sticky.
- [ ] Issue labels: `good-first-issue`, `mod-proposal`, `docs`, `bug`, `enhancement`.
- [ ] CI (GitHub Actions): on PR, run `npm run build` (= `tsc --noEmit + vite build`). No test suite yet — adding a smoke test is follow-up work, flagged here as known gap.
- [ ] Security policy (`SECURITY.md`) — how to report vulnerabilities privately. Matters because the app spawns arbitrary binaries and loads arbitrary JS from `modsDir`.
- [ ] Release notes template (`.github/release.yml`) — auto-categorize PRs by label.

---

## Verification / how to test each phase end-to-end

- **A**: Open README.md in GitHub's preview. Check DMG icon appears correctly in Finder after a local `npm run package:dmg`.
- **B**: Build the Starlight site (`npm run docs:build`) and browse every page; verify no broken internal links via `lychee` or Starlight's built-in link check.
- **C**: Each diagram renders in the docs site; captions read correctly; Mermaid diagrams render in GitHub's markdown preview.
- **D**: Create a minimal external mod in a throwaway folder, point settings at it, verify it shows up in the picker, mounts cleanly, swaps without leaking (check DevTools memory + event listener counts). Re-verify existing built-ins still work. Regression: Cmd+K, Cmd+R, Cmd+Shift+M, window resize all still drive PTY correctly.
- **E**: Run the scaffolder end-to-end; then run the Claude Code skill against 2–3 aesthetic prompts and verify the generated mod loads and runs.
- **F**: Download the release DMG on a clean Mac VM (or a colleague's machine), confirm no Gatekeeper warning appears, confirm app launches and the picker works.
- **G**: Scripts reviewed by the user; recording is out-of-scope for the session.
- **H**: Open a throwaway PR and confirm CI runs; file a test issue and confirm labels/templates appear.

---

## What's explicitly out of scope for this program

- Plugin sandboxing for external mods (v2).
- Cross-platform native rebuild CI (Windows/Linux runners — flagged experimental).
- Auto-update channel (beta/stable) — ship single channel first.
- Mod gallery / marketplace UI inside the app (v2 — for now, curated list in docs).
- Test suite. (Acknowledged gap; a smoke test for the mod engine and PTY spawn is the recommended first addition, tracked as follow-up.)

---

## Sequencing recommendation

**A** (repo hygiene, skip naming) → **I** (universal session data — **distribution blocker**) → **B** start (architecture + mods + local-ai docs) → **C** (diagrams) → **E** scaffolder → **D** (external loader) → **B** finish (building-mods pages now have real tooling to reference) → **E** (Claude skill, iterated on real mods) → **F** (packaging + updates) → **H** (community infra) → **G** (video scripts) → **A-deferred** (name + logo + icon assets just before first public release) → ship.

**Why Phase I comes first after A**: the app currently only produces rich data when the user has the author's bespoke custom statusline. Every downstream phase — docs, diagrams, external loader, scaffolder, Claude skill — describes mods consuming `SessionInfo`. If that contract isn't universal across agents, every artifact produced after would need rework. Fix the data supply first, then everything else stabilizes.

External loader (D) is the biggest technical refactor and highest risk — tackle it once docs + scaffolder give it a clear target shape, and after I has stabilized the `SessionInfo` contract it depends on.
