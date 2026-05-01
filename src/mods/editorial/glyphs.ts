import type { ModeKind } from "../shared/mode";

const NS = "http://www.w3.org/2000/svg";

// Editorial-themed glyphs — newsroom/print-shop iconography. Drawn in
// `currentColor` so the pill's mode-tinted ink (white-on-red, bone-on-
// ink, white-on-green …) carries through. Each is sized to a 24x24
// viewBox and rendered ~13px tall inside the pill.

const GLYPH: Record<ModeKind, string> = {
  // Pilcrow ¶ — the typesetter's mark for a fresh paragraph.
  // Default mode = blank galley, awaiting copy.
  default: `
    <g fill="currentColor">
      <path d="M14.2 4 L19.5 4 L19.5 5.6 L17.8 5.6 L17.8 20 L16.2 20 L16.2 5.6 L14.2 5.6 L14.2 13 C 11.2 13, 9 10.8, 9 8 C 9 5.2, 11.2 4, 14.2 4 Z"/>
    </g>
  `,

  // Pencil drafting copy — leaded tip striking a margin rule.
  // Plan mode = the editor pauses to mark up the draft before press.
  plan: `
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M16.5 3.5 L20.5 7.5 L9 19 L4.5 19.5 L5 15 Z"/>
      <path d="M14 6 L18 10"/>
    </g>
    <path d="M4.5 19.5 L9 19 L7 21 Z" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.55">
      <path d="M2 8 L7 8"/>
      <path d="M2 12 L5 12"/>
    </g>
  `,

  // Proof stamp — APPROVED ✓ inside a slightly skewed rectangular die.
  // Accept = the page is signed off, ready for the press.
  accept: `
    <g transform="translate(12 12) rotate(-6) translate(-12 -12)">
      <rect x="3" y="6" width="18" height="12" rx="0.6"
            fill="none" stroke="currentColor" stroke-width="1.6"/>
      <rect x="5" y="8" width="14" height="8" rx="0.3"
            fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.55"/>
      <path d="M7 12.5 L10.5 15.5 L17 9.5"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  `,

  // Rotary press cylinder — two linked drums turning under a belt.
  // Auto = the press runs on its own, paper feeding without a pause.
  auto: `
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <circle cx="7.5" cy="12" r="4.5"/>
      <circle cx="16.5" cy="12" r="4.5"/>
    </g>
    <g fill="currentColor">
      <circle cx="7.5" cy="12" r="1.1"/>
      <circle cx="16.5" cy="12" r="1.1"/>
    </g>
    <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M3 7.5 L21 7.5"/>
      <path d="M3 16.5 L21 16.5"/>
    </g>
    <g stroke="currentColor" stroke-width="0.8" opacity="0.55" stroke-linecap="round">
      <path d="M5.5 10 L9.5 14"/>
      <path d="M14.5 10 L18.5 14"/>
    </g>
  `,
};

export function modeGlyph(kind: ModeKind): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", `ed-mode-glyph ed-mode-glyph-${kind}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = GLYPH[kind];
  return svg;
}
