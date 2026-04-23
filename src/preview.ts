import { TerminalBus } from "./bus";
import { createNeonMod } from "./mods/neon";
import { createOracleMod } from "./mods/oracle";
import { createEditorialMod } from "./mods/editorial";
import { createBrainrotMod } from "./mods/brainrot";
import type { Mod, ModId } from "./mods/types";
import { startMockReplay } from "./devtools/mock-replay";
import { LlmClient } from "./llm/client";
import { getProfile } from "./profiles/registry";

const root = document.getElementById("preview-root");
if (!root) throw new Error("missing #preview-root");

const params = new URLSearchParams(window.location.search);
const modId = (params.get("mod") as ModId) || "neon";

const factories: Record<ModId, () => Mod> = {
  neon: createNeonMod,
  oracle: createOracleMod,
  editorial: createEditorialMod,
  brainrot: createBrainrotMod,
};

const factory = factories[modId] ?? createNeonMod;
const bus = new TerminalBus();
bus.meta.pid = 4097;
bus.meta.isMock = true;
bus.meta.binary = "claude";
bus.setSender(() => {});
bus.setResizer(() => {});
bus.setLlm(new LlmClient(undefined));
bus.setProfile(getProfile("claude"));

const mod = factory();
mod.mount(root as HTMLElement, bus);

startMockReplay(bus, true, 2.2);
