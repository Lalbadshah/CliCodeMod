import type { ModeKind } from "../shared/mode";

const NS = "http://www.w3.org/2000/svg";

// Oracle-themed glyphs for the four claude-code mode kinds. Drawn in
// `currentColor` so the dossier row's mode-tinted ink (default-gold,
// plan-ruby, accept-olive, auto-gold) carries through. Each is sized
// to a 24x24 viewBox and meant to be rendered around 20px tall.

const GLYPH: Record<ModeKind, string> = {
  // The Wedjat — open eye of the augur. Watching, no edict yet.
  default: `
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.5 12 C 6 6.5, 18 6.5, 21.5 12 C 18 17.5, 6 17.5, 2.5 12 Z"/>
      <circle cx="12" cy="12" r="3.4"/>
    </g>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.7">
      <path d="M5 6 L3.2 4"/>
      <path d="M19 6 L20.8 4"/>
      <path d="M12 4 L12 2"/>
    </g>
  `,

  // Sealed scroll bound by ribbon, wax-seal at center. Action withheld.
  plan: `
    <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
      <rect x="3.5" y="6.5" width="17" height="11" rx="1.2"/>
      <path d="M3.5 9.2 L20.5 9.2" stroke-width="0.9" opacity="0.6"/>
      <path d="M3.5 14.8 L20.5 14.8" stroke-width="0.9" opacity="0.6"/>
    </g>
    <circle cx="12" cy="12" r="2.7" fill="currentColor" opacity="0.92"/>
    <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <g stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none" stroke-linecap="round">
      <path d="M10.6 11.6 L11.7 12.7"/>
      <path d="M11.7 12.7 L13.4 10.7"/>
    </g>
    <path d="M9.5 17.5 L8 21 L10 19.6 L11.2 21.2 L12 19.4 L12.8 21.2 L14 19.6 L16 21 L14.5 17.5 Z"
          fill="currentColor" opacity="0.55" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
  `,

  // Chalice / receiving vessel. The seeker's offering is accepted.
  accept: `
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 4.5 L19 4.5"/>
      <path d="M5.5 4.5 C 5.5 11, 8 13, 12 13 C 16 13, 18.5 11, 18.5 4.5"/>
      <path d="M12 13 L12 18.5"/>
      <path d="M7.5 19.5 L16.5 19.5"/>
      <path d="M12 18.5 C 9.5 18.5, 8 19, 7.5 19.5"/>
      <path d="M12 18.5 C 14.5 18.5, 16 19, 16.5 19.5"/>
    </g>
    <circle cx="12" cy="8" r="1.4" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="0.9" stroke-linecap="round" opacity="0.7">
      <path d="M9.5 6 L9.8 6.6"/>
      <path d="M14.5 6 L14.2 6.6"/>
    </g>
  `,

  // Sun-wheel / wheel of fortune turning under its own motion.
  auto: `
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <circle cx="12" cy="12" r="8"/>
      <circle cx="12" cy="12" r="3"/>
    </g>
    <g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
      <path d="M12 1.8 L12 4.5"/>
      <path d="M12 19.5 L12 22.2"/>
      <path d="M1.8 12 L4.5 12"/>
      <path d="M19.5 12 L22.2 12"/>
    </g>
    <g stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.7">
      <path d="M5 5 L6.8 6.8"/>
      <path d="M17.2 17.2 L19 19"/>
      <path d="M5 19 L6.8 17.2"/>
      <path d="M17.2 6.8 L19 5"/>
    </g>
  `,
};

export function modeGlyph(kind: ModeKind): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", `oracle-mode-glyph oracle-mode-glyph-${kind}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = GLYPH[kind];
  return svg;
}
