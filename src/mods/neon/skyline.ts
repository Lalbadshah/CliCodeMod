const SVG = "http://www.w3.org/2000/svg";

type WindowSpec = {
  el: SVGRectElement;
  phase: number;
  speed: number;
  lit: boolean;
};

export function mountSkyline(container: HTMLElement): () => void {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 500 600");
  svg.setAttribute("preserveAspectRatio", "xMaxYMax slice");

  svg.innerHTML = `
    <defs>
      <linearGradient id="neon-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#1a0a00"/>
        <stop offset="55%" stop-color="#ff3a1e" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#ffb700" stop-opacity="0.18"/>
      </linearGradient>
      <radialGradient id="neon-moon" cx="0.5" cy="0.5">
        <stop offset="0%" stop-color="#fff5c0"/>
        <stop offset="55%" stop-color="#ffb700"/>
        <stop offset="100%" stop-color="#ffb700" stop-opacity="0"/>
      </radialGradient>
      <filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
    </defs>
    <rect width="500" height="600" fill="url(#neon-sky)"/>
    <circle id="neon-moon-circle" cx="360" cy="140" r="70" fill="url(#neon-moon)"/>
    <g id="neon-sun-lines" stroke="#ff3a1e" stroke-linecap="round"></g>
    <g fill="#050302" opacity="0.95">
      <polygon points="0,600 0,380 40,380 40,350 80,350 80,410 130,410 130,330 170,330 170,360 210,360 210,300 260,300 260,380 300,380 300,320 350,320 350,290 400,290 400,360 450,360 450,340 500,340 500,600"/>
    </g>
    <g>
      <rect x="20"  y="430" width="70" height="170" fill="#000000"/>
      <rect x="110" y="400" width="50" height="200" fill="#000000"/>
      <rect x="180" y="380" width="90" height="220" fill="#000000"/>
      <rect x="290" y="420" width="60" height="180" fill="#000000"/>
      <rect x="370" y="360" width="80" height="240" fill="#000000"/>
    </g>
    <g id="neon-windows"></g>
    <g transform="translate(180, 390)">
      <rect x="0" y="0" width="4" height="210" fill="#ff3a1e" filter="url(#neon-glow)"/>
      <text x="10" y="30" fill="#ffb700" font-family="JetBrains Mono, monospace" font-size="14"
        style="letter-spacing:3px;writing-mode:vertical-rl;text-shadow:0 0 4px #ffb700">電脳</text>
    </g>
    <g id="neon-rain"></g>
    <g id="neon-car">
      <rect x="-30" y="220" width="20" height="4" fill="#ffd400" filter="url(#neon-glow)"/>
      <circle cx="-20" cy="222" r="2" fill="#ff3a1e"/>
      <line x1="-28" x2="-10" y1="222" y2="222" stroke="#ffd400" stroke-width="0.7" opacity="0.7"/>
    </g>
  `;

  const sunLines = svg.querySelector<SVGGElement>("#neon-sun-lines")!;
  for (let i = 0; i < 8; i++) {
    const l = document.createElementNS(SVG, "line");
    l.setAttribute("x1", "285");
    l.setAttribute("x2", "435");
    l.setAttribute("y1", String(180 + i * 9));
    l.setAttribute("y2", String(180 + i * 9));
    l.setAttribute("stroke-width", String(1.3 - i * 0.12));
    l.setAttribute("opacity", String(0.85 - i * 0.1));
    sunLines.append(l);
  }

  const moon = svg.querySelector<SVGCircleElement>("#neon-moon-circle")!;

  const windowsG = svg.querySelector<SVGGElement>("#neon-windows")!;
  const windows: WindowSpec[] = [];
  for (let i = 0; i < 96; i++) {
    const col = i % 9;
    const row = Math.floor(i / 9);
    const x = 25 + col * 50;
    const y = 440 + row * 16;
    if (x > 440 || y > 590) continue;
    const lit = (i * 7) % 5 < 3;
    const rect = document.createElementNS(SVG, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", "6");
    rect.setAttribute("height", "4");
    const color = lit ? (i % 3 === 0 ? "#ffd400" : "#ff3a1e") : "#1a1000";
    rect.setAttribute("fill", color);
    rect.setAttribute("opacity", lit ? "0.9" : "0.3");
    windowsG.append(rect);
    windows.push({
      el: rect,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.8,
      lit,
    });
  }

  const rainG = svg.querySelector<SVGGElement>("#neon-rain")!;
  type RainDrop = {
    el: SVGLineElement;
    x: number;
    y: number;
    speed: number;
  };
  const rain: RainDrop[] = [];
  for (let i = 0; i < 48; i++) {
    const line = document.createElementNS(SVG, "line");
    const x = Math.random() * 500;
    const y = Math.random() * 620;
    const speed = 240 + Math.random() * 280;
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x - 4));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y + 14));
    line.setAttribute("stroke", "#ffb700");
    line.setAttribute("stroke-width", "0.6");
    line.setAttribute("opacity", "0.35");
    rainG.append(line);
    rain.push({ el: line, x, y, speed });
  }

  const car = svg.querySelector<SVGGElement>("#neon-car")!;

  container.append(svg);

  let start = performance.now();
  let last = start;
  let running = true;
  let raf = 0;

  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;

    // moon pulse
    const r = 70 + Math.sin(t * 1.2) * 4;
    moon.setAttribute("r", r.toFixed(2));

    // windows flicker (only animate a subset)
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (!w.lit || i % 4 !== 0) continue;
      const op = 0.45 + (Math.sin(t * w.speed + w.phase) + 1) * 0.25;
      w.el.setAttribute("opacity", op.toFixed(2));
    }

    // rain
    for (const d of rain) {
      d.y += d.speed * dt;
      if (d.y > 620) {
        d.y = -20;
        d.x = Math.random() * 500;
        d.el.setAttribute("x1", String(d.x));
        d.el.setAttribute("x2", String(d.x - 4));
      }
      d.el.setAttribute("y1", String(d.y));
      d.el.setAttribute("y2", String(d.y + 14));
    }

    // flying car: one streak every 14s
    const cycle = 14;
    const phase = (t % cycle) / cycle;
    const carX = -60 + phase * 620;
    const dip = Math.sin(phase * Math.PI) * 8;
    car.setAttribute("transform", `translate(${carX.toFixed(1)}, ${dip.toFixed(2)})`);

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame((t) => {
    last = t;
    tick(t);
  });

  const onVis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVis);
    svg.remove();
  };
}
