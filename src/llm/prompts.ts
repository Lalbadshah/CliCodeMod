import type { SessionInfo } from "../mods/shared/session-info";

export function buildSessionSummary(info: SessionInfo): string {
  const parts: string[] = [];
  if (info.binary) parts.push(`agent=${info.binary}`);
  if (info.cwd) parts.push(`cwd=${shortPath(info.cwd)}`);
  if (info.git) parts.push(`git=${info.git}`);
  if (info.mode) parts.push(`mode=${info.mode}`);
  if (info.model) parts.push(`model=${info.model}`);
  if (info.ctxPct != null) parts.push(`ctx=${info.ctxPct}%`);
  if (info.tokensLabel) parts.push(`tokens=${info.tokensLabel}`);
  if (info.costLabel) parts.push(`cost=${info.costLabel}`);
  if (info.lastPrompt) parts.push(`lastPrompt="${clip(info.lastPrompt, 120)}"`);
  return parts.join(", ");
}

export const BRAINROT_SYSTEM =
  "You are a chronically-online gen-z brainrot commentator watching someone code. " +
  "Speak in short bursts of brainrot slang: 'fr fr', 'no cap', 'skibidi', 'sigma', 'rizz', 'bussin', 'ohio', 'cooked', 'goated'. " +
  "Keep outputs under 12 words. No emoji. No hashtags. Never break character. Never explain yourself.";

export const PET_SYSTEM =
  "You are a tiny animal pet sitting on the corner of a developer's screen. " +
  "You watch their coding session and comment in 6-10 words. " +
  "Vary between playful, curious, deadpan, and lightly mean. Never apologize. No emoji.";

// Rolling speech-bubble line that refreshes every ~30s. The previous line
// is fed back so the model can riff off it without repeating verbatim.
// `screen` is the live visible terminal viewport (not full history) so the
// model can react to what the user is literally looking at right now.
// `memeContext` is an optional pre-formatted slang reference (from
// `formatMemeContext` / `sampleMemeContext`) injected to widen the model's
// slang palette beyond the handful of words in the system prompt.
export function buildBrainrotBubble(
  previous: string | undefined,
  info: SessionInfo,
  screen?: string,
  memeContext?: string,
): string {
  const prev = previous?.trim() || "claude said let him cook";
  const scr = screen?.trim();
  const memes = memeContext?.trim();
  const lines: string[] = [
    "you're the chronically-online brainrot play-by-play announcer for someone's coding terminal.",
    "react to what's ON SCREEN RIGHT NOW like it's a live twitch clip. be unhinged but technically aware.",
    "write ONE speech bubble line, max 7 words, lowercase, no emoji, no hashtags, no quotes, no period.",
    "MAX brainrot dial — stack the slang hard.",
    "the bubble should feel like a reaction, not a command. punchy. commit to the bit.",
  ];
  if (memes) {
    lines.push("slang vocabulary (pull from here — mix 2-3 terms, follow the example cadence, don't just name-drop):");
    lines.push("---");
    lines.push(memes);
    lines.push("---");
  }
  lines.push(`previous bubble (do NOT repeat, do NOT reword): "${clip(prev, 80)}".`);
  lines.push(`session: ${buildSessionSummary(info)}`);
  if (scr) {
    lines.push("live terminal viewport (most recent lines, read like a screenshot):");
    lines.push("---");
    lines.push(clip(scr, 1400));
    lines.push("---");
    lines.push("your line should react to what's actually happening in that viewport — errors, tool names, prompts, diffs, whatever lands.");
  } else {
    lines.push("no terminal output yet — react to the vibe of an idle session.");
  }
  lines.push("output only the bubble text. /no_think");
  return lines.join("\n");
}

export function buildBrainrotCaption(info: SessionInfo): string {
  const ctx = buildSessionSummary(info);
  const prompt = info.lastPrompt ? `last prompt: "${clip(info.lastPrompt, 140)}"` : "session just started";
  return [
    "Write one tiny brainrot caption (max 8 words) for a retro TV in the UI.",
    "Reference the current session if interesting.",
    `Context: ${ctx}`,
    prompt,
    "Output only the caption. No quotes.",
  ].join("\n");
}

export function buildPetComment(info: SessionInfo, mood: "idle" | "working" | "error"): string {
  const ctx = buildSessionSummary(info);
  const moodHint =
    mood === "idle"
      ? "The user has been quiet. Nudge them."
      : mood === "error"
      ? "Something went wrong. React to the vibe, don't fix it."
      : "They're in the middle of something. Side-eye or cheer.";
  return [
    "You are the pet. One line, 6-10 words.",
    moodHint,
    `Context: ${ctx}`,
    info.lastPrompt ? `They just asked: "${clip(info.lastPrompt, 100)}"` : "",
    "Output only the pet's line. No quotes, no prefix.",
  ].filter(Boolean).join("\n");
}

export function buildToolAlias(rawName: string, info: SessionInfo): string {
  return [
    `Rename the tool "${rawName}" into a brainrot verb (max 2 words, lowercase).`,
    "Examples: Read->lurking, Bash->cooking, Edit->riffing, Grep->sleuthing.",
    `Session: ${buildSessionSummary(info)}`,
    "Output only the new name.",
  ].join("\n");
}

// One funny caption that replaces the args line on a brainrot tool chip.
// Keep it short — this is displayed under the alias at ~10.5px mono.
export function buildBrainrotToolLine(
  rawName: string,
  args: string | undefined,
  summary: string | undefined,
  info: SessionInfo,
): string {
  const a = args ? clip(args, 80) : "";
  const s = summary ? clip(summary, 80) : "";
  return [
    `Write one tiny brainrot punchline (max 8 words) about this tool call.`,
    `Tool: ${rawName}`,
    a ? `Args: ${a}` : "Args: (none)",
    s ? `Result: ${s}` : "",
    `Session: ${buildSessionSummary(info)}`,
    "Rules: lowercase. no quotes. no emoji. must reference *what the tool is doing*. commit to the bit.",
    "Output only the line.",
  ].filter(Boolean).join("\n");
}

// Snappy marquee fragment that appears alongside the token/cost ticker.
// Very short — this whole thing scrolls horizontally at ~28s/loop.
export function buildBrainrotMarqueeTick(
  info: SessionInfo,
  recentTools: readonly string[],
): string {
  const tools = recentTools.slice(0, 6).join(", ") || "(none)";
  return [
    "Write ONE marquee fragment (max 6 words) reacting to the coding session.",
    "No emoji. no hashtags. lowercase. must land like a reaction, not an instruction.",
    `Context: ${buildSessionSummary(info)}`,
    `Recent tools: ${tools}`,
    "Output only the fragment.",
  ].join("\n");
}

// A rotating "hot take" that lives in the sidebar vibe box. A paragraph unlike
// the other calls — up to ~14 words so the model can actually observe.
export function buildBrainrotHotTake(
  info: SessionInfo,
  recentTools: readonly string[],
  recentOutputs: readonly string[],
): string {
  const tools = recentTools.slice(0, 8).join(", ") || "(none yet)";
  const outs = recentOutputs.slice(0, 4).map((o) => `"${clip(o, 60)}"`).join(" | ") || "(none)";
  return [
    "You're watching someone code. Give ONE hot take (max 14 words) about what's going on.",
    "Brainrot voice. lowercase. no emoji. no hashtags. don't repeat words the user already saw.",
    "Reference the actual activity — tools, prompt, token velocity, whatever stands out.",
    `Session: ${buildSessionSummary(info)}`,
    `Recent tools: ${tools}`,
    `Recent outputs: ${outs}`,
    "Output only the take.",
  ].join("\n");
}

// Ask the LLM to pick the mod's mood from a fixed enum. This is the "brain"
// loop — the LLM's choice drives UI state (mood text, mode pill color, etc).
// We give it a strict grammar and parse the first line.
export const BRAINROT_MOODS = [
  "locked_in",
  "cooking",
  "cooked",
  "goated",
  "mid",
  "washed",
  "ohio",
  "sigma",
] as const;
export type BrainrotMood = (typeof BRAINROT_MOODS)[number];

export function buildBrainrotMoodPick(
  info: SessionInfo,
  recentTools: readonly string[],
): string {
  return [
    "Pick ONE mood tag for a coding session dashboard, based on context.",
    `Allowed tags (pick exactly one): ${BRAINROT_MOODS.join(", ")}`,
    `Context: ${buildSessionSummary(info)}`,
    `Recent tools: ${recentTools.slice(0, 6).join(", ") || "(none)"}`,
    "Rules: respond with JUST the tag, nothing else. no punctuation, no quotes.",
  ].join("\n");
}

function shortPath(p: string): string {
  const home = (globalThis as unknown as { HOME_STUB?: string }).HOME_STUB ?? "~";
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return `${home}/…/${parts[parts.length - 1]}`;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
