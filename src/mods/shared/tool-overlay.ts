import type { TerminalBus } from "../../bus";
import type { ToolEvent } from "../../profiles/types";

// Typed lifecycle handlers — one per ToolEvent variant.
export type ToolFeedHandlers = {
  onStart?: (e: Extract<ToolEvent, { type: "tool_start" }>) => void;
  onOutput?: (e: Extract<ToolEvent, { type: "tool_output" }>) => void;
  onEnd?: (e: Extract<ToolEvent, { type: "tool_end" }>) => void;
  onAssistant?: (e: Extract<ToolEvent, { type: "assistant" }>) => void;
  onTurn?: (e: Extract<ToolEvent, { type: "turn" }>) => void;
};

export type ToolFeedOptions = ToolFeedHandlers & {
  bus: TerminalBus;
  // If provided, a pointer-events:none overlay div is created as a child.
  // Use it to render animated markers that float over the xterm canvas
  // (without intercepting terminal keystrokes).
  overlayHost?: HTMLElement;
  overlayClass?: string;
  // Replay bus.toolSnapshot() on mount so mid-session mod swaps catch up.
  // Default true.
  catchUp?: boolean;
};

export type ToolFeedHandle = {
  overlay: HTMLElement | null;
  prefersReducedMotion(): boolean;
  dispose(): void;
};

const motionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

// Attach a structured tool-event feed to a mod, and optionally place a
// non-interactive overlay layer above its xterm host so the mod can spawn
// in-console micro-animations without breaking the "PTY is raw bytes"
// invariant. Returns a handle with the overlay element and a disposer.
export function attachToolFeed(opts: ToolFeedOptions): ToolFeedHandle {
  const { bus } = opts;
  let overlay: HTMLElement | null = null;

  if (opts.overlayHost) {
    // If the host isn't already positioned, make it so — absolute children
    // need a containing block.
    const hostStyle = getComputedStyle(opts.overlayHost);
    if (hostStyle.position === "static") {
      opts.overlayHost.style.position = "relative";
    }
    overlay = document.createElement("div");
    overlay.className = opts.overlayClass ?? "mod-tool-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:3;overflow:hidden;";
    opts.overlayHost.append(overlay);
  }

  const dispatch = (e: ToolEvent): void => {
    try {
      switch (e.type) {
        case "tool_start":  opts.onStart?.(e);     break;
        case "tool_output": opts.onOutput?.(e);    break;
        case "tool_end":    opts.onEnd?.(e);       break;
        case "assistant":   opts.onAssistant?.(e); break;
        case "turn":        opts.onTurn?.(e);      break;
      }
    } catch (err) {
      console.error("[tool-feed] handler error", err);
    }
  };

  if (opts.catchUp !== false) {
    for (const e of bus.toolSnapshot()) dispatch(e);
  }

  const unsub = bus.onTool(dispatch);

  return {
    overlay,
    prefersReducedMotion(): boolean {
      return motionQuery?.matches ?? false;
    },
    dispose(): void {
      unsub();
      overlay?.remove();
      overlay = null;
    },
  };
}
