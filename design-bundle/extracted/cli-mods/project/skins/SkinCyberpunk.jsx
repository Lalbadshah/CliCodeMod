// Skin 1 — "NEON SHRINE" cyberpunk
// Maximalist: scanlines, glitch title bar, neon magenta/cyan, CRT vignette,
// animated cityscape + rain, holographic stats, session tokens as LEDs.

function SkinCyberpunk() {
  const W = 1100, H = 720;
  const c = {
    bg: '#0a0514',
    panel: '#10082a',
    ink: '#e7d8ff',
    dim: '#7a6a9c',
    neonPink: '#ff2ea6',
    neonCyan: '#22f0ff',
    neonYellow: '#f6ff3c',
    neonLime: '#7cff4a',
    grid: 'rgba(255,46,166,0.18)',
  };
  const mono = '"JetBrains Mono","Berkeley Mono",ui-monospace,Menlo,monospace';
  const display = '"Orbitron","Chakra Petch",ui-sans-serif,system-ui';

  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: c.bg, color: c.ink, fontFamily: mono, fontSize: 13,
      boxShadow: `0 0 0 1px ${c.neonPink}, 0 0 40px ${c.neonPink}55, inset 0 0 140px rgba(34,240,255,0.08)`,
    }}>
      {/* scanlines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)',
        mixBlendMode: 'overlay',
      }}/>
      {/* vignette */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)',
      }}/>

      {/* TITLE BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 42,
        padding: '0 16px', gap: 16,
        background: `linear-gradient(90deg, ${c.panel}, #1a0a3a 60%, ${c.panel})`,
        borderBottom: `1px solid ${c.neonPink}55`,
        position: 'relative',
      }}>
        {/* traffic as diamonds */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[c.neonPink, c.neonYellow, c.neonLime].map((col, i) => (
            <div key={i} style={{
              width: 10, height: 10, transform: 'rotate(45deg)',
              background: col, boxShadow: `0 0 8px ${col}`,
            }}/>
          ))}
        </div>
        <div style={{
          fontFamily: display, fontSize: 12, letterSpacing: 4,
          color: c.neonCyan, textShadow: `0 0 6px ${c.neonCyan}`,
          flex: 1, textAlign: 'center', fontWeight: 700,
        }}>
          ░ NEON·SHRINE ▓ v2.077 ░ CLAUDE.CODE ░ PID:4097 ░
        </div>
        <div style={{ fontSize: 10, color: c.dim, letterSpacing: 2 }}>◉ REC</div>
        <div style={{
          fontSize: 10, color: c.neonPink, letterSpacing: 2,
          textShadow: `0 0 4px ${c.neonPink}`,
        }}>▲ ▽ ✕</div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', height: H - 42 - 64 }}>
        {/* SIDE RAIL — sessions */}
        <div style={{
          width: 180, borderRight: `1px solid ${c.neonPink}33`,
          background: 'linear-gradient(180deg, rgba(255,46,166,0.04), transparent)',
          padding: '16px 0', fontSize: 11,
        }}>
          <div style={{
            padding: '0 14px 10px', color: c.neonPink, letterSpacing: 3,
            fontFamily: display, fontWeight: 700,
          }}>◣ SESSIONS</div>
          {[
            { n: 'refactor-auth', active: true, tag: 'HOT' },
            { n: 'migrate-db', tag: 'IDLE' },
            { n: 'fix-memory-leak', tag: '···' },
            { n: 'scrape-market', tag: 'DONE' },
            { n: 'vector-search', tag: 'IDLE' },
            { n: 'llm-router-v3', tag: 'HOT' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '8px 14px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', position: 'relative',
              color: s.active ? c.neonCyan : c.ink,
              background: s.active ? 'rgba(34,240,255,0.08)' : 'transparent',
              borderLeft: s.active ? `2px solid ${c.neonCyan}` : '2px solid transparent',
              textShadow: s.active ? `0 0 6px ${c.neonCyan}` : 'none',
            }}>
              <span>▸ {s.n}</span>
              <span style={{
                fontSize: 8, letterSpacing: 1,
                color: s.tag === 'HOT' ? c.neonPink : s.tag === 'DONE' ? c.neonLime : c.dim,
              }}>{s.tag}</span>
            </div>
          ))}
          <div style={{ padding: '14px', marginTop: 20, color: c.dim, fontSize: 9, letterSpacing: 2 }}>
            ╳ GPU: 87%<br/>
            ╳ TOKENS: 1.2M<br/>
            ╳ UPTIME: 04:22
          </div>
        </div>

        {/* TERMINAL + OVERLAPPING ART */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#070212' }}>
          {/* grid backdrop */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(${c.grid} 1px, transparent 1px), linear-gradient(90deg, ${c.grid} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}/>

          {/* ART: animated cityscape silhouette with rain + glow */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: '58%', height: '100%' }}>
            <svg viewBox="0 0 500 600" preserveAspectRatio="xMaxYMax slice" width="100%" height="100%">
              <defs>
                <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#1a0230"/>
                  <stop offset="60%" stopColor="#ff2ea6" stopOpacity="0.35"/>
                  <stop offset="100%" stopColor="#22f0ff" stopOpacity="0.15"/>
                </linearGradient>
                <radialGradient id="moon" cx="0.5" cy="0.5">
                  <stop offset="0%" stopColor="#fff0ff"/>
                  <stop offset="60%" stopColor="#ff2ea6"/>
                  <stop offset="100%" stopColor="#ff2ea6" stopOpacity="0"/>
                </radialGradient>
                <filter id="glow1"><feGaussianBlur stdDeviation="3"/></filter>
              </defs>
              <rect width="500" height="600" fill="url(#sky)"/>
              {/* pulsating moon */}
              <circle cx="360" cy="140" r="70" fill="url(#moon)">
                <animate attributeName="r" values="66;74;66" dur="4s" repeatCount="indefinite"/>
              </circle>
              {/* sun lines */}
              {[0,1,2,3,4,5,6].map(i => (
                <line key={i} x1="290" x2="430" y1={180+i*8} y2={180+i*8}
                  stroke="#ff2ea6" strokeWidth={1.2 - i*0.1} opacity={0.8 - i*0.1}/>
              ))}
              {/* skyline back */}
              <g fill="#0a0420" opacity="0.9">
                <polygon points="0,600 0,380 40,380 40,350 80,350 80,410 130,410 130,330 170,330 170,360 210,360 210,300 260,300 260,380 300,380 300,320 350,320 350,290 400,290 400,360 450,360 450,340 500,340 500,600"/>
              </g>
              {/* skyline front with lit windows */}
              <g>
                <rect x="20" y="430" width="70" height="170" fill="#02010a"/>
                <rect x="110" y="400" width="50" height="200" fill="#02010a"/>
                <rect x="180" y="380" width="90" height="220" fill="#02010a"/>
                <rect x="290" y="420" width="60" height="180" fill="#02010a"/>
                <rect x="370" y="360" width="80" height="240" fill="#02010a"/>
              </g>
              {/* windows grid */}
              {Array.from({length: 90}).map((_, i) => {
                const col = i % 9;
                const row = Math.floor(i / 9);
                const x = 25 + col * 50;
                const y = 440 + row * 16;
                if (x > 440) return null;
                const on = (i * 7) % 5 < 3;
                return <rect key={i} x={x} y={y} width="6" height="4"
                  fill={on ? (i % 3 === 0 ? c.neonCyan : c.neonPink) : '#1a0a2a'}
                  opacity={on ? 0.9 : 0.3}>
                  {on && i % 13 === 0 && (
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur={`${2 + (i%5)*0.3}s`} repeatCount="indefinite"/>
                  )}
                </rect>;
              })}
              {/* neon vertical sign */}
              <g transform="translate(180, 390)">
                <rect x="0" y="0" width="4" height="210" fill={c.neonPink} filter="url(#glow1)"/>
                <text x="10" y="30" fill={c.neonCyan} fontFamily={mono} fontSize="14"
                  style={{textShadow: `0 0 4px ${c.neonCyan}`, letterSpacing: 3, writingMode: 'vertical-rl'}}>
                  電脳
                </text>
              </g>
              {/* rain */}
              {Array.from({length: 40}).map((_, i) => {
                const x = (i * 37) % 500;
                return <line key={i} x1={x} x2={x - 4} y1="0" y2="12"
                  stroke={c.neonCyan} strokeWidth="0.6" opacity="0.5">
                  <animate attributeName="y1" from="-30" to="620" dur={`${0.8 + (i%5)*0.2}s`}
                    repeatCount="indefinite" begin={`${-(i%10)*0.1}s`}/>
                  <animate attributeName="y2" from="-18" to="632" dur={`${0.8 + (i%5)*0.2}s`}
                    repeatCount="indefinite" begin={`${-(i%10)*0.1}s`}/>
                </line>;
              })}
              {/* flying car */}
              <g>
                <rect x="-20" y="220" width="18" height="4" fill={c.neonYellow}>
                  <animate attributeName="x" from="-40" to="540" dur="14s" repeatCount="indefinite"/>
                </rect>
                <circle cx="-12" cy="222" r="1.5" fill={c.neonPink}>
                  <animate attributeName="cx" from="-32" to="548" dur="14s" repeatCount="indefinite"/>
                </circle>
              </g>
            </svg>
          </div>

          {/* TERMINAL content — left side, art overlaps from right */}
          <div style={{
            position: 'absolute', left: 24, top: 24, right: 280, bottom: 24,
            fontFamily: mono, fontSize: 12, lineHeight: 1.65,
            color: c.ink, zIndex: 2,
          }}>
            <div style={{ color: c.neonCyan, textShadow: `0 0 6px ${c.neonCyan}88` }}>
              ╭─ claude@shrine ───────────────────────────╮
            </div>
            <div style={{ color: c.neonPink }}>│ ◆ model: claude-sonnet-4.5 · ctx 200k     │</div>
            <div style={{ color: c.neonCyan, textShadow: `0 0 6px ${c.neonCyan}88` }}>
              ╰───────────────────────────────────────────╯
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={{ color: c.neonLime }}>▸</span> refactor the auth middleware to use
              <span style={{ color: c.neonYellow }}> JWT</span> with rotating keys
            </div>
            <div style={{ color: c.dim, marginTop: 8 }}>● thinking ▓▓▓▓▓▓░░░░ 62%</div>
            <div style={{ marginTop: 10, color: c.ink }}>
              I'll restructure <span style={{ color: c.neonPink }}>auth/middleware.ts</span> and
              <br/>add a key-rotation worker. Touching 3 files:
            </div>
            <div style={{ marginTop: 8, paddingLeft: 10, color: c.dim, fontSize: 11 }}>
              <div>◇ auth/middleware.ts     <span style={{color: c.neonLime}}>+42 −18</span></div>
              <div>◇ auth/keys.ts           <span style={{color: c.neonLime}}>+81 −0</span></div>
              <div>◇ workers/rotate.ts      <span style={{color: c.neonLime}}>+64 −0</span></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span style={{color: c.neonPink}}>╳</span>  apply edits? [<span style={{color:c.neonLime}}>y</span>/<span style={{color:c.neonPink}}>n</span>] <span style={{
                display: 'inline-block', width: 8, height: 14, background: c.neonCyan,
                verticalAlign: '-2px', boxShadow: `0 0 6px ${c.neonCyan}`,
              }}/>
            </div>
          </div>
        </div>
      </div>

      {/* STATS — bottom */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center',
        borderTop: `1px solid ${c.neonPink}55`,
        background: `linear-gradient(90deg, #1a0030, ${c.panel})`,
        padding: '0 18px', gap: 28, fontSize: 10, letterSpacing: 2,
        position: 'relative', zIndex: 5,
      }}>
        {[
          { l: 'TOKENS·IN',  v: '184,221', c: c.neonCyan },
          { l: 'TOKENS·OUT', v: '48,907',  c: c.neonPink },
          { l: 'COST',       v: '$3.42',   c: c.neonYellow },
          { l: 'TURNS',      v: '127',     c: c.neonLime },
          { l: 'LATENCY',    v: '412ms',   c: c.neonCyan },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ color: c.dim, fontSize: 8 }}>▸ {s.l}</div>
            <div style={{
              color: s.c, fontSize: 16, fontFamily: display, fontWeight: 700,
              textShadow: `0 0 6px ${s.c}`, marginTop: 2,
            }}>{s.v}</div>
          </div>
        ))}
        {/* waveform */}
        <div style={{ flex: 1 }}/>
        <svg width="220" height="36" style={{ opacity: 0.9 }}>
          {Array.from({length: 48}).map((_, i) => {
            const h = 6 + Math.abs(Math.sin(i * 0.7)) * 24 + (i % 5);
            return <rect key={i} x={i * 4.5} y={(36 - h) / 2} width="2.5" height={h}
              fill={i % 2 ? c.neonPink : c.neonCyan} opacity="0.85">
              <animate attributeName="height" values={`${h};${h*0.3};${h}`}
                dur={`${0.7 + (i%4)*0.2}s`} repeatCount="indefinite" begin={`${-i*0.03}s`}/>
              <animate attributeName="y" values={`${(36-h)/2};${(36-h*0.3)/2};${(36-h)/2}`}
                dur={`${0.7 + (i%4)*0.2}s`} repeatCount="indefinite" begin={`${-i*0.03}s`}/>
            </rect>;
          })}
        </svg>
      </div>
    </div>
  );
}

window.SkinCyberpunk = SkinCyberpunk;
