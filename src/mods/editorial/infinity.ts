/**
 * Renders the oversized black infinity loop used as a backdrop in the main area.
 * Also exports a small-scale version used as a sidebar accent.
 */
export function mountInfinity(container: HTMLElement): () => void {
  const wrap = document.createElement("div");
  wrap.className = "ed-infinity";
  wrap.innerHTML = `
    <svg viewBox="0 0 900 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <g class="ed-inf-spin" transform-origin="450 180">
        <path class="ed-inf-stroke"
              d="M 160 180
                 C 160  60, 360  60, 450 180
                 C 540 300, 740 300, 740 180
                 C 740  60, 540  60, 450 180
                 C 360 300, 160 300, 160 180 Z"/>
      </g>
    </svg>
  `;
  container.append(wrap);
  return () => { wrap.remove(); };
}

/** Small inline infinity for wordmarks (non-animated). */
export function makeWordmarkInfinity(): string {
  return `<svg viewBox="0 0 60 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M 8 14 C 8 4, 22 4, 30 14 C 38 24, 52 24, 52 14 C 52 4, 38 4, 30 14 C 22 24, 8 24, 8 14 Z"
          fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
  </svg>`;
}
