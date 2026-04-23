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

## Package

```bash
npm run package
```

Produces a notarization-ready `.dmg` (macOS) / `.exe` (Windows) / `.AppImage` (Linux) in `release/`. `npm run package:dmg` restricts to macOS dmg only.

Drop a 1024×1024 `icon.icns` into `build/` before packaging for a branded icon.

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
