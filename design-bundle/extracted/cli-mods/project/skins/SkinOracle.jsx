// Skin 2 — "ORACLE" mystical / arcane
// Parchment + deep ink, hand-drawn mountains and a revolving constellation,
// alchemical glyphs, session as tarot-card stack. Calm, slow animations.

function SkinOracle() {
  const W = 1100, H = 720;
  const c = {
    parch: '#efe6d2',
    parchDark: '#d8ccad',
    ink: '#201813',
    inkDim: '#5b4a3a',
    rust: '#8f3a1a',
    gold: '#b88632',
    blood: '#5a1414',
    deep: '#0f1a2a',
    starLayerBg: '#0d1226',
  };
  const serif = '"EB Garamond","Cormorant Garamond","Cardo",Georgia,serif';
  const mono = '"IBM Plex Mono",ui-monospace,Menlo,monospace';

  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: c.parch, color: c.ink, fontFamily: serif,
      boxShadow: '0 0 0 8px #2a1f14, 0 0 0 10px #8f6a32, 0 0 0 12px #2a1f14',
    }}>
      {/* paper texture */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(circle at 30% 20%, rgba(90,60,30,0.08) 0, transparent 60%),
                          radial-gradient(circle at 80% 70%, rgba(90,60,30,0.1) 0, transparent 55%),
                          radial-gradient(circle at 50% 50%, transparent 60%, rgba(60,40,20,0.25) 100%)`,
      }}/>
      {/* speckle */}
      <svg style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.25 }}
        width={W} height={H}>
        {Array.from({length: 180}).map((_, i) => (
          <circle key={i} cx={(i * 47) % W} cy={(i * 83) % H}
            r={Math.random() * 0.8 + 0.2} fill="#2a1810"/>
        ))}
      </svg>

      {/* TITLE — illuminated */}
      <div style={{
        height: 56, padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 20,
        borderBottom: `1px double ${c.inkDim}`,
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {['✦', '◉', '◯'].map((g, i) => (
            <div key={i} style={{
              width: 16, height: 16, display: 'grid', placeItems: 'center',
              border: `1px solid ${c.ink}`, borderRadius: '50%',
              fontSize: 10, color: c.ink,
            }}>{g}</div>
          ))}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            fontStyle: 'italic', fontSize: 22, letterSpacing: 6,
            color: c.ink, textTransform: 'uppercase',
          }}>
            ✧ &nbsp; The Oracle &nbsp; ✧
          </div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: c.inkDim, marginTop: 1 }}>
            A VESSEL · FOR · CLAUDE · CODE · · · · EDITIO · MMXXVI
          </div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: c.inkDim, letterSpacing: 2 }}>
          LUNA ◐  ·  IV·XVIII
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', height: H - 56 - 72, position: 'relative', zIndex: 1 }}>
        {/* SIDE RAIL — sessions as tarot stack */}
        <div style={{
          width: 200, padding: '24px 16px',
          borderRight: `1px solid ${c.inkDim}55`,
          background: `linear-gradient(180deg, transparent, rgba(120,80,40,0.07))`,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 4, color: c.inkDim,
            textTransform: 'uppercase', marginBottom: 14,
          }}>— Grimoire of Sessions —</div>
          {[
            { n: 'The Refactor', num: 'I', active: true },
            { n: 'The Migration', num: 'II' },
            { n: 'The Leak', num: 'III' },
            { n: 'The Scraper', num: 'IV' },
            { n: 'The Vector', num: 'V' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '10px 12px', marginBottom: 8,
              border: s.active ? `1px solid ${c.rust}` : `1px solid ${c.inkDim}33`,
              background: s.active ? 'rgba(143,58,26,0.08)' : 'transparent',
              position: 'relative', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: c.rust }}>
                {s.num} · ARCANA
              </div>
              <div style={{
                fontStyle: 'italic', fontSize: 15, color: c.ink,
                marginTop: 2, letterSpacing: 0.3,
              }}>{s.n}</div>
              {s.active && (
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 6, height: 6, borderRadius: '50%',
                  background: c.rust,
                  boxShadow: `0 0 0 3px rgba(143,58,26,0.25)`,
                }}/>
              )}
            </div>
          ))}
          <div style={{
            marginTop: 18, paddingTop: 12,
            borderTop: `1px dashed ${c.inkDim}66`,
            fontFamily: mono, fontSize: 10, color: c.inkDim, lineHeight: 1.9,
          }}>
            ☿ mercury · 0.42<br/>
            ♄ saturn · 1.08<br/>
            ☉ sol · 04h 22m
          </div>
        </div>

        {/* TERMINAL + MYSTICAL ART */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {/* The grand animated art — night sky window bleeding into parchment */}
          <div style={{
            position: 'absolute', top: 20, right: 30, width: 420, height: 520,
            borderRadius: '210px 210px 16px 16px',
            overflow: 'hidden',
            border: `2px solid ${c.ink}`,
            boxShadow: `0 0 0 6px ${c.parch}, 0 0 0 8px ${c.gold}, 0 20px 40px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.6)`,
            background: `linear-gradient(180deg, #050815 0%, #0d1a3a 60%, #2a1a40 100%)`,
            zIndex: 2,
          }}>
            <svg viewBox="0 0 420 520" width="100%" height="100%">
              <defs>
                <radialGradient id="moonG">
                  <stop offset="0%" stopColor="#fff8e0"/>
                  <stop offset="60%" stopColor="#f4e5b0"/>
                  <stop offset="100%" stopColor="#f4e5b0" stopOpacity="0"/>
                </radialGradient>
              </defs>
              {/* slow stars */}
              {Array.from({length: 80}).map((_, i) => {
                const x = (i * 37.3) % 420;
                const y = (i * 19.7) % 300;
                const r = Math.random() * 1.2 + 0.3;
                return <circle key={i} cx={x} cy={y} r={r} fill="#fff">
                  <animate attributeName="opacity"
                    values={`${0.3+Math.random()*0.3};1;${0.3+Math.random()*0.3}`}
                    dur={`${2+Math.random()*4}s`} repeatCount="indefinite"
                    begin={`${-Math.random()*3}s`}/>
                </circle>;
              })}
              {/* large rotating zodiac ring */}
              <g transform="translate(210, 180)">
                <g style={{ transformOrigin: 'center', animation: 'oracleRotate 120s linear infinite' }}>
                  <circle r="120" fill="none" stroke="#f4e5b0" strokeWidth="0.5" opacity="0.5"/>
                  <circle r="100" fill="none" stroke="#f4e5b0" strokeWidth="0.3" opacity="0.35"
                    strokeDasharray="2 6"/>
                  {Array.from({length: 12}).map((_, i) => {
                    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                    const x = Math.cos(a) * 110;
                    const y = Math.sin(a) * 110;
                    const sym = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'][i];
                    return <g key={i} transform={`translate(${x},${y})`}>
                      <text fontSize="14" fill="#f4e5b0" textAnchor="middle"
                        dominantBaseline="middle" opacity="0.9">{sym}</text>
                    </g>;
                  })}
                </g>
              </g>
              {/* moon */}
              <circle cx="120" cy="140" r="46" fill="url(#moonG)">
                <animate attributeName="cx" values="120;125;120" dur="18s" repeatCount="indefinite"/>
              </circle>
              <circle cx="132" cy="130" r="42" fill="#0d1a3a" opacity="0.55"/>
              {/* mist */}
              <ellipse cx="210" cy="360" rx="260" ry="30" fill="#fff" opacity="0.05"/>
              <ellipse cx="180" cy="380" rx="240" ry="20" fill="#fff" opacity="0.04"/>
              {/* mountains */}
              <path d="M0,440 L40,400 L80,420 L130,360 L180,410 L220,370 L270,400 L320,350 L370,390 L420,380 L420,520 L0,520 Z"
                fill="#1a1020" stroke="#0a0510" strokeWidth="1"/>
              <path d="M0,470 L50,440 L90,450 L150,410 L200,445 L250,420 L310,450 L360,430 L420,445 L420,520 L0,520 Z"
                fill="#0a0510"/>
              {/* owl silhouette */}
              <g transform="translate(340, 420)">
                <ellipse cx="0" cy="0" rx="8" ry="10" fill="#000"/>
                <circle cx="-3" cy="-3" r="1.2" fill={c.gold}>
                  <animate attributeName="opacity" values="1;0.2;1" dur="4s" repeatCount="indefinite"/>
                </circle>
                <circle cx="3" cy="-3" r="1.2" fill={c.gold}>
                  <animate attributeName="opacity" values="1;0.2;1" dur="4s" repeatCount="indefinite" begin="0.2s"/>
                </circle>
              </g>
              {/* glyph band */}
              <text x="210" y="500" textAnchor="middle" fontFamily="serif" fontSize="14"
                fill={c.gold} letterSpacing="8" opacity="0.85">☽  ☿  ♄  ✦  ☉  ♃  ♀</text>
            </svg>
            <style>{`@keyframes oracleRotate { to { transform: rotate(360deg); } }`}</style>
          </div>

          {/* arcane diagram scrawl that bleeds behind/over terminal */}
          <svg style={{
            position: 'absolute', left: 280, top: 380, width: 280, height: 280,
            zIndex: 3, pointerEvents: 'none', opacity: 0.5,
          }}>
            <g stroke={c.rust} fill="none" strokeWidth="0.8">
              <circle cx="140" cy="140" r="130"/>
              <circle cx="140" cy="140" r="90"/>
              <polygon points="140,20 260,210 20,210" />
              <polygon points="140,260 20,70 260,70" />
              <text x="140" y="15" textAnchor="middle" fontFamily="serif"
                fontSize="10" fill={c.rust} letterSpacing="4">SOLVE · COAGVLA</text>
            </g>
          </svg>

          {/* TERMINAL text — ink on parchment, monospace but with a typeset feel */}
          <div style={{
            position: 'absolute', left: 28, top: 26, right: 440, bottom: 20,
            fontFamily: mono, fontSize: 12.5, lineHeight: 1.75, color: c.ink,
            zIndex: 4,
          }}>
            <div style={{
              fontFamily: serif, fontStyle: 'italic', fontSize: 18,
              color: c.rust, marginBottom: 6,
            }}>∴ The terminal speaketh ∴</div>
            <div style={{ color: c.inkDim }}>── claude · sonnet · ctx.cc = 200,000 ──</div>
            <div style={{ marginTop: 14 }}>
              <span style={{ color: c.rust }}>❧</span>  <i>thou art asked:</i><br/>
              &nbsp;&nbsp;&nbsp;"refactor the auth middleware to use<br/>
              &nbsp;&nbsp;&nbsp;JWT with rotating keys"
            </div>
            <div style={{ marginTop: 12, color: c.inkDim }}>
              ✦ divining the codebase ·  ▰▰▰▰▰▱▱  71%
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={{ color: c.rust }}>✦</span>  i shall rewrite <u>auth/middleware.ts</u><br/>
              and conjure a rotation-worker. three<br/>
              scrolls shall be touched:
            </div>
            <div style={{ marginTop: 8, paddingLeft: 14, color: c.inkDim, fontSize: 11 }}>
              ◆ auth/middleware.ts &nbsp; <span style={{color: c.rust}}>+42 −18</span><br/>
              ◆ auth/keys.ts &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{color: c.rust}}>+81</span><br/>
              ◆ workers/rotate.ts &nbsp; <span style={{color: c.rust}}>+64</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <span style={{color: c.rust}}>❂</span>  dost thou consent?  [<b>y</b>/n]  <span style={{
                display: 'inline-block', width: 8, height: 14, background: c.ink,
                verticalAlign: '-2px', animation: 'blink 1s steps(2) infinite',
              }}/>
            </div>
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </div>
        </div>
      </div>

      {/* STATS — bottom, almanac style */}
      <div style={{
        height: 72, padding: '10px 24px',
        borderTop: `1px double ${c.inkDim}`,
        background: `linear-gradient(180deg, rgba(120,80,40,0.04), rgba(120,80,40,0.12))`,
        display: 'flex', alignItems: 'center', gap: 24,
        position: 'relative', zIndex: 3,
      }}>
        {[
          { l: 'TOKENS·IN',  v: '184,221', s: '☌' },
          { l: 'TOKENS·OUT', v: '48,907',  s: '☍' },
          { l: 'OBOLS·SPENT', v: '$3.42',  s: '☌' },
          { l: 'TURNS·TAKEN', v: 'CXXVII', s: '✦' },
          { l: 'LATENCIA',   v: '412 ms',  s: '⏳' },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '0 12px', position: 'relative',
            borderLeft: i ? `1px solid ${c.inkDim}55` : 'none',
          }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.inkDim, textTransform: 'uppercase' }}>
              {s.s}  {s.l}
            </div>
            <div style={{
              fontFamily: serif, fontStyle: 'italic',
              fontSize: 22, color: c.ink, marginTop: 2,
            }}>{s.v}</div>
          </div>
        ))}
        <div style={{ flex: 1 }}/>
        {/* moon phase strip */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: c.inkDim, letterSpacing: 2 }}>CADENCE</span>
          {['●','◐','○','◑','●','◐','○'].map((p, i) => (
            <span key={i} style={{
              fontSize: 14, color: i === 3 ? c.rust : c.inkDim,
              opacity: i === 3 ? 1 : 0.6,
            }}>{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

window.SkinOracle = SkinOracle;
