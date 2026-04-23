# Plan: Per-Mod Voice Injection + Custom Tool-Call Rendering

## Context

Today every mod is purely visual chrome — it paints a frame around xterm and picks a color palette, but the underlying CLI agent behaves identically regardless of which mod is active. Two features extend mods to shape *what* the agent says and *how* tool calls render, without any persistence that leaks outside the modded session:

1. **Voice injection** — a mod can declare a tone/voice prompt (pirate, oracle, brainrot) that gets appended to the agent's system prompt at spawn time via `--append-system-prompt`. The instruction lives only in the spawned process's argv; nothing is written to disk, so closing the session evaporates it.
2. **Tool-call rendering** — when the agent prints a tool-use line, we detect it, swap in the mod's alias (e.g. oracle "Read" → "Scry", brainrot "Edit" → "skibidi-patch"), and restyle the line with per-mod ANSI decoration. Brainrot and oracle get full alias maps for the Claude Code tool set.

The two features share an extension pattern: `Mod` grows two optional capabilities (`voicePrompt`, `toolAliases` + `toolLineStyle`) that higher layers opt into. Non-voice / non-aliased mods keep working unchanged.

---

## Feature 1 — Voice injection

### Approach
Pass per-mod CLI args to `startPty()` at spawn time. No persistence, no file writes, no env vars — args live in the spawned process and die with it.

### Changes

**`src/mods/types.ts`** — extend `Mod`:
```ts
interface Mod {
  readonly id: ModId;
  readonly meta: ModMeta;
  readonly voicePrompt?: string;     // NEW — appended via --append-system-prompt
  readonly toolAliases?: Record<string, string>;  // NEW — see Feature 2
  readonly toolLineStyle?: ToolLineStyle;         // NEW — see Feature 2
  mount(root: HTMLElement, bus: TerminalBus): void;
  unmount(): void;
}
```

**`src/mods/<id>/index.ts`** — each factory sets `voicePrompt` on the returned object. Suggested copy:
- **neon**: short, cyberpunk-terse (e.g. *"Respond like a jaded netrunner. Short sentences. Occasional slang: 'choom', 'chromed', 'flatline'. No emoji."*)
- **oracle**: mystical, second-person, occasional Latin flourish (*"Speak as an oracle at a dim altar. Address the user as 'seeker'. Use archaic phrasing sparingly; never break character even in code."*)
- **editorial**: brutalist newsroom copy desk (*"Respond like a terse newspaper sub-editor. Lede-first. Active voice. Short grafs."*)
- **brainrot**: full gen-z brainrot (*"Respond in gen-z brainrot dialect: 'fr fr', 'no cap', 'skibidi', 'sigma', 'rizz'. Stay technically accurate. Minimal emoji."*)

**`electron/main.ts:49–88`** — extend `startPty()`:
- Add IPC handler `pty:set-mod-voice` that stores the current voice string in main-process memory (not settings).
- In `startPty()`, if a voice string is set, prepend `["--append-system-prompt", voice]` to `args` before calling `pty.spawn`.
- Voice is *not* written into `AppSettings.extraArgs`; it's a runtime-only field held alongside but separate.

**`electron/preload.ts`** — expose `window.cli.setModVoice(voice: string | null)`.

**`src/index.ts`** — when a mod mounts, call `window.cli.setModVoice(mod.voicePrompt ?? null)`. On mod unmount, clear it. The value is consulted only on next PTY spawn/restart.

### Session-scoping guarantees
- Voice string lives only in: main-process memory + spawned process argv. Never written to settings.json or any disk file.
- Quitting the app drops main-process memory; the child PTY is killed in `app.on("before-quit")` (already wired at `electron/main.ts` — verify during implementation).
- Mod swap mid-session does **not** re-inject (would require restarting the agent and losing state). The new voice takes effect on next `Cmd+R` restart. A small status line toast ("Mod voice will apply on next restart") clarifies this.

---

## Feature 2 — Custom tool-call rendering

### Approach
Stateful line-buffered transformer sits between `bus.onData` and `term.write`. It recognises Claude Code's tool-call pattern, swaps the tool name via the active mod's alias map, and rewrites the line with per-mod ANSI styling.

### Tool-call line shape
From `src/devtools/mock-replay.ts:39–46` the canonical shape is:
```
● <ToolName> <target/args>\r\n
  ✓ <result summary>\r\n
```
The `●` bullet is the reliable anchor. Match with `/^\x1b\[[0-9;]*m●\x1b\[[0-9;]*m\s+([A-Z][A-Za-z]+)\b/` after stripping / preserving ANSI appropriately, or strip SGR for matching then re-emit styled.

### New module — `src/mods/shared/tool-call-transformer.ts`
Exports `createToolCallTransformer(opts: { aliases: Record<string,string>; style: ToolLineStyle }): (chunk: string) => string`.
- Maintains a residual-line buffer (bytes after the last `\n`).
- On each chunk: concatenate residual + chunk, split on `\n`, hold the final non-terminated segment back as residual, transform completed lines, emit.
- For each complete line: if it matches the tool-call pattern, rebuild it using the alias + style. Otherwise pass through unchanged.
- `style` controls glyph (`●` default), colour SGR, prefix/suffix decoration (brainrot can use `⟪ skibidi-patch ⟫` with magenta; oracle can use `✦ Scry ✦` in warm gold).

### `src/mods/shared/xterm-host.ts:22–78` — extend options
Add `dataTransform?: (chunk: string) => string`. In the existing line 44 `bus.onData((d) => term.write(d))`, apply the transform first:
```ts
bus.onData((d) => term.write(opts.dataTransform ? opts.dataTransform(d) : d));
```
Also apply to the initial `bus.snapshot()` write on line 41–42 so replayed scrollback stays consistent.

### Per-mod wiring
Each mod that opts in builds the transformer in `mount()` and passes it into `mountXterm`:
```ts
const transform = createToolCallTransformer({
  aliases: this.toolAliases ?? {},
  style: this.toolLineStyle ?? DEFAULT_STYLE,
});
const xt = mountXterm(host, bus, { theme: …, dataTransform: transform });
```
Teardown is implicit — transformer is GC'd when the mod unmounts.

### Alias maps (cover the full Claude Code tool surface)

Tools we alias (from the documented Claude Code tool set): `Read, Write, Edit, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, TodoWrite, BashOutput, KillShell, SlashCommand, AskUserQuestion, ExitPlanMode`.

**Oracle** — mystical scribe register (`src/mods/oracle/aliases.ts`):
| Tool | Alias |
|---|---|
| Read | Scry |
| Write | Inscribe |
| Edit | Emend |
| Bash | Incant |
| Glob | Divine |
| Grep | Augur |
| Task | Summon |
| WebFetch | Seek Afar |
| WebSearch | Consult Stars |
| NotebookEdit | Annotate Codex |
| TodoWrite | Mark the Ledger |
| BashOutput | Hear the Echo |
| KillShell | Banish |
| SlashCommand | Invoke Rite |
| AskUserQuestion | Query the Seeker |
| ExitPlanMode | Break the Seal |

Style: `✦ {alias} ✦` in warm sepia (`\x1b[38;2;184;138;58m`), dim target in `\x1b[2;38;2;106;78;43m`.

**Brainrot** — gen-z meme register (`src/mods/brainrot/aliases.ts`):
| Tool | Alias |
|---|---|
| Read | peek 👀 |
| Write | yap into |
| Edit | skibidi-patch |
| Bash | run it fr |
| Glob | find that bussin |
| Grep | lowkey search |
| Task | delegate sigma |
| WebFetch | curl vibes |
| WebSearch | google cap |
| NotebookEdit | jot rizz |
| TodoWrite | todo no cap |
| BashOutput | catch output |
| KillShell | ggs |
| SlashCommand | /ohio |
| AskUserQuestion | ask chat |
| ExitPlanMode | ship it |

Style: `⟪ {alias} ⟫` in bright magenta (`\x1b[38;2;255;72;200m`), neon-green checkmark for `✓` follow-ups.

Neon and editorial get no tool aliases in v1 (they keep vanilla `● Read` output). Easy to add later by defining their map.

---

## Critical files

**New**
- `src/mods/shared/tool-call-transformer.ts`
- `src/mods/oracle/aliases.ts`
- `src/mods/brainrot/aliases.ts`

**Modified**
- `src/mods/types.ts` — add `voicePrompt`, `toolAliases`, `toolLineStyle`, `ToolLineStyle` type.
- `src/mods/shared/xterm-host.ts` — add `dataTransform` option; apply to both snapshot and onData writes.
- `src/mods/oracle/index.ts` — set `voicePrompt`, import aliases, pass transformer to `mountXterm`.
- `src/mods/brainrot/index.ts` — same.
- `src/mods/neon/index.ts`, `src/mods/editorial/index.ts` — set `voicePrompt` only.
- `electron/main.ts` — accept mod voice in `startPty()`, IPC handler `pty:set-mod-voice`.
- `electron/preload.ts` — `window.cli.setModVoice` binding.
- `src/index.ts` — call `setModVoice` on mod mount/unmount; maybe toast on mid-session swap.
- `src/types/events.ts` — if adding an IPC event type, extend here.

---

## Verification

1. **Voice, live agent**: `npm run dev`. Pick oracle; send "who are you?" — response should be in oracle register. Swap to brainrot with `Cmd+Shift+M` — first response still oracle (expected). `Cmd+R` to restart PTY — next response is brainrot.
2. **Voice isolation**: quit the app entirely. `cat "$(electron .app)/.../settings.json"` (or wherever userData lives on Darwin) — confirm `voicePrompt` text is NOT in the file. Confirm no env vars leaked: `ps -ax | grep claude` while running shows `--append-system-prompt` in argv — acceptable; disappears when the child dies.
3. **Tool rendering, mock**: `npm run dev:mock`. Mock replay prints `● Read auth/middleware.ts`. Under oracle, that line should render as `✦ Scry ✦ auth/middleware.ts` in warm gold. Under brainrot, `⟪ peek 👀 ⟫ auth/middleware.ts` in magenta. Under neon/editorial, unchanged.
4. **Mid-stream chunk split**: in `mock-replay.ts` temporarily emit a tool-call line split across two chunks (e.g. `● Re` then `ad foo.ts\r\n`). Confirm transformer buffers correctly and the rewritten line is still correct — no double-emit, no dropped bytes.
5. **Snapshot replay**: start under oracle with some tool output in scrollback, `Cmd+Shift+M` to brainrot. The replayed snapshot in the new mod should re-style with brainrot aliases (because the transform runs on `bus.snapshot()` too).
6. **Type check**: `npm run build` (runs `tsc --noEmit`).
7. **Non-alias mods unaffected**: under editorial, tool lines should pass through untouched (no transformer attached).

---

## Assumptions & trade-offs

- **Mid-session swap does not re-inject voice.** Restarting the agent mid-conversation would lose context; cleaner to apply voice at next PTY start. A toast informs the user.
- **Tool-call detection is regex on `●`**, not a full ANSI parser. If Claude Code changes its output format, aliases silently stop applying — acceptable; worst case is vanilla output, not broken output.
- **Transformer state is per-xterm-mount**, so it resets on mod swap (fine — the snapshot replay will re-run the transform on buffered bytes anyway).
- **`--append-system-prompt` is a Claude-Code-specific flag.** If the user configures a different binary (settings allows this), the flag is ignored or errors. v1 accepts this and documents it; v2 could gate voice injection on `binary.endsWith("claude")`.
