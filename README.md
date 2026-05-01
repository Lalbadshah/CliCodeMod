# CLI Mods

A modable GUI wrapper for Claude Code and other CLI coding agents. One core parses the agent's semantic event stream; swappable **mods** re-render it in wildly different visual voices.

Three mods ship day one:

| id | name | voice |
|---|---|---|
| `neon` | **Neon Shrine** | Cyberpunk CRT — rainy-zodiac skyline, LED-burn stats, flying cars. |
| `oracle` | **The Oracle** | Mystical parchment — zodiac ring, serif voice-overs, *thou art asked* copy. |
| `editorial` | **Editorial** | Brutalist newspaper — kinetic marquee, giant rotating ∞, file-plan ASCII box. |

## Install

Requires Node 20+ and an `claude` binary on PATH (for semantic parsing) or any other CLI for passthrough mode.

```bash
npm install
```

## Run

**Dev with a live Claude Code session:**

```bash
npm run dev
```

On first launch a settings dialog asks for the binary (default `claude`) and working directory. Then the mod picker appears — pick one and the session streams into it.

**Dev without an agent (mock replay):**

```bash
npm run dev:mock
```

Plays a canned `refactor-auth` session into whichever mod is active. Handy for designing a mod without burning tokens.

## Package & distribute (macOS)

The simplest path is an unsigned **universal DMG** distributed via GitHub Releases. No Apple Developer account needed.

```bash
npm run package:mac              # build only → release/CLI Mods-X.Y.Z-universal.dmg
GH_TOKEN=ghp_… npm run package:mac:publish   # build + push to GitHub Releases
```

`scripts/build-mac.sh` runs the SDKROOT workaround needed for `node-pty` on macOS, rebuilds the native module for both `arm64` and `x64`, and merges into one universal DMG via `electron-builder`.

The publish form requires `repository.url` in `package.json` to point at the target repo and a `GH_TOKEN` Personal Access Token with `repo` scope.

Drop a 1024×1024 `icon.icns` into `build/` before packaging for a branded icon (build still succeeds with the default Electron icon).

### Installing on a teammate's Mac

The build is unsigned, so macOS Gatekeeper would block the app on first launch. `scripts/install.sh` handles the install + Gatekeeper bypass in one shot:

```bash
# from a local DMG
bash scripts/install.sh ~/Downloads/CLI-Mods-0.1.0-universal.dmg

# or directly from a GitHub release
bash scripts/install.sh https://github.com/Lalbadshah/CliCodeMod/releases/download/v0.1.0/CLI-Mods-0.1.0-universal.dmg
```

It mounts the DMG, copies `CLI Mods.app` into `/Applications`, ejects, and clears the `com.apple.quarantine` xattr so the app launches cleanly.

### Auto-update

Installed copies poll GitHub Releases on launch + every hour. When a newer tag exists, the app downloads the universal DMG to `~/Downloads/` in the background and shows a banner ("Update vX.Y.Z available — Install"). Clicking **Install** writes a one-shot shell script to `/tmp` that waits for the app to quit, swaps `/Applications/CLI Mods.app`, clears quarantine, and relaunches — ~5 seconds end to end.

The updater is notify-only and works for unsigned builds. If you later get an Apple Developer ID, swap `electron/auto-update.ts` for an `electron-updater`-backed implementation; the published `latest-mac.yml` artifact is already compatible.

## Keyboard

| shortcut | action |
|---|---|
| `Cmd+,` | Open mod picker |
| `Cmd+Shift+M` | Cycle to next mod |
| `Cmd+R` | Reload session (restart the agent, clear the feed) |
| `Cmd+K` | Clear the feed |
| `Cmd+.` | Stop the agent |

## Passthrough mode

Point the binary at anything that writes to stdout (`bash`, `zsh`, `codex`, `kilo`, …) and its output renders as `raw` events inside the current mod's chrome. The passthrough adapter does no semantic parsing — you get monochrome lines framed in the mod's visual language.

## Adding a mod

A mod is a folder under `src/mods/<id>/` with an `index.ts` that exports a factory returning `{ id, meta, mount, unmount }`:

```ts
import type { Mod } from "../types";

export function createMyMod(): Mod {
  return {
    id: "mymod",
    meta: { id: "mymod", name: "My Mod", blurb: "…", preview: { bg, accent, ink, label } },
    mount(root, bus) {
      root.innerHTML = "<div>hello</div>";
      bus.subscribe("*", (evt) => {
        // render evt in your voice
      });
    },
    unmount() {
      // clean up rAF / timers here
    },
  };
}
```

Then register it in `src/mods/registry.ts` (add to `factories`, `MOD_ORDER`, `MOD_META`) and widen `ModId` in `src/mods/types.ts`. The picker and menu pick up the new mod automatically. A live preview of the mod appears in the picker via `/preview.html?mod=<id>` running against `dev:mock`.

## Architecture

```
┌──────────── Electron main ─────────────┐
│  child_process.spawn("claude", …)      │
│       │                                │
│  Adapter  (claude-code | passthrough)  │
│       │                                │
│  normalized AgentEvent stream ───IPC─► │
└────────────────────────────────────────┘
                        │
┌───────────────── Renderer ─────────────┐
│  EventBus ── active Mod subscribes     │
│       │                                │
│  Mod.mount(root, bus)                  │
│                                        │
│  ModPicker overlay (Cmd+,)             │
└────────────────────────────────────────┘
```

Mods never speak to the child process directly — they call `bus.sendInput(text)` and the main process forwards to stdin.

`AgentEvent` vocabulary: `session_start`, `session_end`, `user_prompt`, `thinking`, `assistant_text`, `tool_call_start`, `tool_call_end`, `file_edit`, `confirmation_request`, `metrics`, `raw`.
