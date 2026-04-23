// Skin 3 — "EDITORIAL" (aino.agency-inspired)
// Swiss/editorial, oversized numerals, tight grid, black/bone palette,
// one accent (hot red). The animated art is a kinetic-typography marquee
// + a rotating display-serif numeral that overlaps the terminal.

function SkinEditorial() {
  const W = 1100, H = 720;
  const c = {
    bone: '#eeeae3',
    paper: '#f5f2ec',
    ink: '#111111',
    dim: '#6b6760',
    rule: '#1a1a1a',
    accent: '#ff3b1f',
    accent2: '#1a4cff',
  };
  const display = '"Canela","Tiempos Headline","GT Sectra","Fraunces",Georgia,serif';
  const sans = '"Neue Haas Grotesk Display Pro","Inter",Helvetica,Arial,sans-serif';
  const mono = '"Berkeley Mono","JetBrains Mono",ui-monospace,Menlo,monospace';

  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: c.bone, color: c.ink, fontFamily: sans,
      boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
    }}>
      {/* TOP BAR */}
      <div style={{
        height: 52, display: 'grid',
        gridTemplateColumns: '120px 1fr 1fr 180px',
        alignItems: 'center', borderBottom: `1px solid ${c.rule}`,
        position: 'relative', zIndex: 3, background: c.bone,
      }}>
        <div style={{
          padding: '0 18px', fontFamily: display,
          fontSize: 22, fontWeight: 500, letterSpacing: -1,
          borderRight: `1px solid ${c.rule}`, height: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10,
            background: c.accent, borderRadius: '50%',
          }}/>
          ∞dex
        </div>
        <div style={{
          padding: '0 18px', fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', color: c.dim,
          borderRight: `1px solid ${c.rule}`, height: '100%',
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <span><span style={{color: c.ink, fontWeight: 600}}>01</span> / session · refactor-auth</span>
          <span><span style={{color: c.ink, fontWeight: 600}}>02</span> / agent · claude.sonnet</span>
        </div>
        <div style={{
          padding: '0 18px', fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', color: c.dim, display: 'flex',
          alignItems: 'center', gap: 16, height: '100%',
          borderRight: `1px solid ${c.rule}`,
        }}>
          <span>ISSUE № 04·18·26</span>
          <span style={{
            padding: '2px 6px', background: c.accent, color: c.bone,
            fontWeight: 700, letterSpacing: 1,
          }}>LIVE</span>
        </div>
        <div style={{
          padding: '0 18px', fontSize: 10, letterSpacing: 2,
          display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 14, color: c.ink,
        }}>
          <span>−</span><span>▢</span><span>×</span>
        </div>
      </div>

      {/* MARQUEE kinetic typography */}
      <div style={{
        height: 34, overflow: 'hidden', background: c.ink, color: c.bone,
        borderBottom: `1px solid ${c.rule}`, position: 'relative', zIndex: 3,
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          display: 'flex', whiteSpace: 'nowrap',
          animation: 'editorialMarquee 38s linear infinite',
          fontFamily: display, fontSize: 22, fontStyle: 'italic',
          letterSpacing: -0.5,
        }}>
          {Array.from({length: 2}).map((_, k) => (
            <span key={k} style={{ paddingRight: 48 }}>
              Long form coding — <span style={{ color: c.accent }}>refactor-auth</span> · 127 turns ·
              &nbsp;<span style={{ fontFamily: sans, fontStyle: 'normal', fontSize: 13, letterSpacing: 3 }}>
                184,221 IN · 48,907 OUT
              </span> &nbsp;· <span style={{ color: c.accent }}>$3.42</span> spent ·
              &nbsp;412ms latency &nbsp;— &nbsp;<span style={{ color: c.accent }}>∞</span>&nbsp;
            </span>
          ))}
        </div>
        <style>{`@keyframes editorialMarquee { to { transform: translateX(-50%); } }`}</style>
      </div>

      {/* BODY */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        height: H - 52 - 34 - 86, position: 'relative', zIndex: 2,
      }}>
        {/* LEFT — sessions as an editorial index */}
        <div style={{
          borderRight: `1px solid ${c.rule}`, padding: '18px 0',
          background: c.paper,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 3, textTransform: 'uppercase',
            color: c.dim, padding: '0 18px 14px',
          }}>Contents / Sessions</div>
          {[
            { num: '01', t: 'Refactor Auth',  sub: 'middleware · jwt',   active: true },
            { num: '02', t: 'Migrate DB',     sub: 'pg · 14 → 16'                      },
            { num: '03', t: 'Memory Leak',    sub: 'worker/stream.ts'                  },
            { num: '04', t: 'Scrape Market',  sub: 'crawler · nightly'                 },
            { num: '05', t: 'Vector Search',  sub: 'pgvector · cosine'                 },
            { num: '06', t: 'LLM Router v3',  sub: 'fallback chain'                    },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '12px 18px',
              borderBottom: `1px solid ${c.rule}22`,
              background: s.active ? c.ink : 'transparent',
              color: s.active ? c.bone : c.ink,
              display: 'grid', gridTemplateColumns: '32px 1fr',
              gap: 10, alignItems: 'baseline', cursor: 'pointer',
            }}>
              <div style={{
                fontFamily: display, fontSize: 22, lineHeight: 1,
                color: s.active ? c.accent : c.ink,
              }}>{s.num}</div>
              <div>
                <div style={{
                  fontFamily: display, fontSize: 18, lineHeight: 1.1, letterSpacing: -0.4,
                }}>{s.t}</div>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
                  color: s.active ? '#b0a8a0' : c.dim, marginTop: 4,
                }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT — hero numeral + terminal */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>

          {/* Huge rotating display numeral — the "animated art" */}
          <div style={{
            position: 'absolute', top: -110, right: -60,
            fontFamily: display, fontSize: 720, lineHeight: 0.75,
            color: c.ink, letterSpacing: -40, zIndex: 1,
            pointerEvents: 'none', userSelect: 'none',
          }}>
            <span style={{
              display: 'inline-block',
              animation: 'editorialBreathe 6s ease-in-out infinite',
              transformOrigin: 'center',
            }}>∞</span>
          </div>
          <style>{`
            @keyframes editorialBreathe {
              0%,100% { transform: scale(1) rotate(0deg); }
              50%     { transform: scale(1.04) rotate(-3deg); }
            }
            @keyframes editorialDrift {
              0%,100% { transform: translateY(0) rotate(0deg); }
              50%     { transform: translateY(-6px) rotate(1deg); }
            }
          `}</style>

          {/* Secondary kinetic element — red tag */}
          <div style={{
            position: 'absolute', top: 40, right: 52, zIndex: 2,
            padding: '6px 10px', background: c.accent, color: c.bone,
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            animation: 'editorialDrift 4s ease-in-out infinite',
          }}>NOW THINKING · 62%</div>

          {/* Editorial title */}
          <div style={{
            padding: '30px 38px 10px', position: 'relative', zIndex: 2,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 3, textTransform: 'uppercase',
              color: c.dim,
            }}>A conversation · in progress · with Claude</div>
            <div style={{
              fontFamily: display, fontWeight: 500,
              fontSize: 56, lineHeight: 0.95, letterSpacing: -2,
              marginTop: 10, maxWidth: 620, textWrap: 'pretty',
            }}>
              Refactoring&nbsp;auth,<br/>
              <span style={{ color: c.accent, fontStyle: 'italic' }}>one rotation</span> at a time.
            </div>
          </div>

          {/* Terminal card — black on bone, newspaper column */}
          <div style={{
            position: 'absolute', left: 38, right: 38, bottom: 22, top: 220,
            background: c.ink, color: c.bone, zIndex: 3,
            padding: '20px 22px', fontFamily: mono, fontSize: 12.5, lineHeight: 1.7,
            boxShadow: `8px 8px 0 ${c.accent}`,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 9, letterSpacing: 3, textTransform: 'uppercase',
              color: '#a0998f', marginBottom: 10,
              borderBottom: '1px solid #333', paddingBottom: 8,
            }}>
              <span>/ terminal · zsh · claude-code</span>
              <span>~/repo/auth &nbsp; · &nbsp; main · +3</span>
            </div>
            <div>
              <span style={{ color: c.accent }}>$</span> claude refactor auth/middleware.ts --with "jwt rotating keys"
            </div>
            <div style={{ color: '#a0998f', marginTop: 6 }}>● analysing · <span style={{color: c.accent}}>▓▓▓▓▓▓▓░░</span> 62%</div>
            <div style={{ marginTop: 10 }}>
              I'll rewrite <span style={{ color: c.accent }}>auth/middleware.ts</span> to verify
              rotating-key JWTs via JWKS, and add a worker that
              rotates the signing key every 12h.
            </div>
            <div style={{ color: '#a0998f', marginTop: 10, fontSize: 11 }}>
              ┌ plan ────────────────────────────────────┐<br/>
              │  auth/middleware.ts  &nbsp;+42 &nbsp;−18&nbsp;  │<br/>
              │  auth/keys.ts        &nbsp;+81 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  │<br/>
              │  workers/rotate.ts   &nbsp;+64 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  │<br/>
              └──────────────────────────────────────────┘
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={{ color: c.accent }}>?</span> apply edits &nbsp;[<b style={{color:c.accent}}>y</b>/n] <span style={{
                display: 'inline-block', width: 9, height: 15, background: c.bone,
                verticalAlign: '-3px', animation: 'blink2 1s steps(2) infinite',
              }}/>
            </div>
            <style>{`@keyframes blink2 { 50% { opacity: 0; } }`}</style>
          </div>
        </div>
      </div>

      {/* STATS — footer, table of metrics with big display numerals */}
      <div style={{
        height: 86, borderTop: `1px solid ${c.rule}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr) 200px',
        position: 'relative', zIndex: 3, background: c.bone,
      }}>
        {[
          { l: 'Tokens · in',  v: '184,221',  sub: '+12,408 / 5min'},
          { l: 'Tokens · out', v: '48,907',  sub: '+2,311 / 5min', accent: true},
          { l: 'Cost',         v: '$3.42',   sub: 'rate  $0.018/min'},
          { l: 'Turns',        v: '127',     sub: 'avg 4.2 tool/turn'},
          { l: 'Latency',      v: '412',     sub: 'ms · p50'},
          { l: 'Files touched',v: '23',      sub: 'staged 3 · diff'},
        ].map((s, i) => (
          <div key={i} style={{
            padding: '10px 14px',
            borderRight: `1px solid ${c.rule}`,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{
              fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase',
              color: c.dim,
            }}>{s.l}</div>
            <div style={{
              fontFamily: display, fontSize: 32, fontWeight: 500, lineHeight: 1,
              letterSpacing: -1, color: s.accent ? c.accent : c.ink,
            }}>{s.v}</div>
            <div style={{
              fontFamily: mono, fontSize: 9, color: c.dim, letterSpacing: 1,
            }}>{s.sub}</div>
          </div>
        ))}
        {/* sparkline block */}
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: c.dim }}>
            Token rate · 30min
          </div>
          <svg viewBox="0 0 180 40" style={{ width: '100%', flex: 1, marginTop: 4 }} preserveAspectRatio="none">
            <polyline fill="none" stroke={c.ink} strokeWidth="1.5"
              points="0,30 12,28 24,22 36,26 48,18 60,22 72,14 84,20 96,10 108,16 120,8 132,14 144,6 156,12 168,4 180,10"/>
            <polyline fill="none" stroke={c.accent} strokeWidth="1.5" strokeDasharray="2 2"
              points="0,34 12,32 24,30 36,32 48,28 60,30 72,26 84,28 96,24 108,26 120,22 132,24 144,20 156,22 168,18 180,20"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

window.SkinEditorial = SkinEditorial;
