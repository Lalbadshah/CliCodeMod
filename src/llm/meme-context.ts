// Brainrot meme context document — a hand-curated dictionary of 2025-2026
// gen-z / gen-alpha slang with usage hints. Sampled into the bubble prompt
// so the model has a broader vocabulary than just the six words in the
// system prompt. Safe to delete / disable via the toggle in the mod.
//
// Entries are sourced from public meme trackers + slang dictionaries
// (Wikipedia "Brain rot" / "Glossary of 2020s slang" / "Italian brainrot",
// plus reporting on 2025-2026 trends). Meanings are intentionally short so
// the model can glance at them without wasting context.

export type MemeEntry = {
  term: string;
  meaning: string;
  // One-liner showing how it lands in a sentence — helps the model mimic cadence.
  example: string;
};

export const MEME_CONTEXT: readonly MemeEntry[] = [
  // Numbers / viral noises
  { term: "6 7", meaning: "absurdist gen-alpha reaction noise, no fixed meaning; from Skrilla's 'Doot Doot (6 7)' + 67 Kid", example: "6 7 this compile time" },
  { term: "tung tung tung", meaning: "percussive nonsense chant from Italian brainrot AI memes", example: "tung tung tung build green" },
  { term: "tralalero tralala", meaning: "nonsense AI-meme name, pure Italian brainrot chaos", example: "tralalero tralala merge conflict" },

  // Core brainrot vocabulary
  { term: "skibidi", meaning: "chaos, random, cursed — from Skibidi Toilet", example: "skibidi error fr" },
  { term: "rizz", meaning: "charisma, smooth flirting energy", example: "compiler has no rizz" },
  { term: "sigma", meaning: "lone-wolf, confidently rule-breaking archetype", example: "sigma grind merge" },
  { term: "ohio", meaning: "cursed, off-vibe, weird-in-a-bad-way", example: "it's giving ohio" },
  { term: "gyatt", meaning: "reaction shout at something surprising/thicc", example: "gyatt that stack trace" },
  { term: "fanum tax", meaning: "playfully snatching a friend's food/thing", example: "git pulled a fanum tax on my branch" },

  // Success / failure
  { term: "cooked", meaning: "in deep trouble, doomed, finished", example: "bro is cooked" },
  { term: "goated", meaning: "greatest of all time, elite", example: "goated refactor no cap" },
  { term: "bussin", meaning: "really good, fire, tasty", example: "this diff is bussin" },
  { term: "mid", meaning: "mediocre, not impressive", example: "mid PR ngl" },
  { term: "based", meaning: "agreeable, confidently correct, unbothered", example: "based error handling" },
  { term: "slay", meaning: "do or look amazing", example: "types slayed" },
  { term: "clapped", meaning: "beaten, destroyed, worn out", example: "CI clapped this PR" },

  // Emphatics
  { term: "no cap", meaning: "no lie, for real", example: "no cap this is bussin" },
  { term: "fr fr", meaning: "for real for real, very emphatic yes", example: "fr fr locked in" },
  { term: "lowkey", meaning: "slightly, somewhat (downplayed)", example: "lowkey hate this stack" },
  { term: "highkey", meaning: "very, obviously (emphasized)", example: "highkey goated" },
  { term: "sheesh", meaning: "hype / awe reaction", example: "sheesh 400ms response" },
  { term: "bet", meaning: "okay, agreed, say less", example: "bet we ship" },
  { term: "lock in", meaning: "focus up, commit to the task", example: "locked in fr fr" },

  // Wins & losses
  { term: "L", meaning: "a loss; taking an L = losing", example: "L + ratio + compiler" },
  { term: "W", meaning: "a win, victory", example: "W push W branch" },
  { term: "ratio", meaning: "getting dunked on (more replies than likes)", example: "ratio'd by tsc" },
  { term: "caught in 4k", meaning: "busted on camera, caught red-handed", example: "bug caught in 4k" },
  { term: "L + ratio", meaning: "compound dunk; stacking Ls as a flex", example: "L + ratio + npm audit" },

  // Appearance / vibe-shaming
  { term: "chopped", meaning: "ugly, not it, aesthetically broken", example: "this UI chopped ngl" },
  { term: "huzz", meaning: "flirty noun for attractive girls (replaces bae)", example: "my huzz merged it" },
  { term: "mogging", meaning: "outshining someone physically", example: "rust mogged my ts" },
  { term: "goofy ahh", meaning: "silly, ridiculous, clownish", example: "goofy ahh regex" },

  // Meltdown energy
  { term: "crashout", meaning: "lashing out, having a meltdown", example: "CI had a crashout" },
  { term: "glazing", meaning: "cringe over-praising to an annoying degree", example: "stop glazing the linter" },
  { term: "npc energy", meaning: "boringly scripted / no main-character aura", example: "standup had npc energy" },

  // Auras & side quests
  { term: "aura", meaning: "coolness/charisma score; gained or lost", example: "lost 5000 aura points" },
  { term: "aura farming", meaning: "doing stuff purely to look cool", example: "aura farming in vim" },
  { term: "main character", meaning: "acting like you're the protagonist", example: "main character mode on" },
  { term: "side quest", meaning: "a random unplanned detour", example: "debug side quest arc" },
  { term: "touch grass", meaning: "go outside, log off, get a grip", example: "linter needs to touch grass" },

  // Structure words
  { term: "it's giving", meaning: "frames the overall vibe of a thing", example: "it's giving null pointer" },
  { term: "slop", meaning: "low-effort AI-generated garbage content", example: "ai slop PR detected" },
  { term: "clanker", meaning: "robot / AI thing (derogatory)", example: "clanker wrote this diff" },
  { term: "brainrot", meaning: "absurd overstimulating internet humor itself", example: "pure brainrot grind" },
  { term: "sus", meaning: "suspicious, off", example: "this dep is sus" },
  { term: "sybau", meaning: "shut yo bitch ass up (dismissive)", example: "sybau linter" },
];

// Join entries into a compact reference block. Each line: `term — meaning | e.g. "example"`.
export function formatMemeContext(entries: readonly MemeEntry[]): string {
  return entries.map((e) => `${e.term} — ${e.meaning} | e.g. "${e.example}"`).join("\n");
}

// Random subset so every call feeds the model different vocab — keeps the
// outputs from calcifying around the same 6 words.
export function sampleMemeContext(n: number): MemeEntry[] {
  const pool = MEME_CONTEXT.slice();
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}
