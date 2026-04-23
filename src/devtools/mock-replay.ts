import type { TerminalBus } from "../bus";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITAL = "\x1b[3m";
const FG_CYAN = "\x1b[36m";
const FG_MAGENTA = "\x1b[35m";
const FG_YELLOW = "\x1b[33m";
const FG_GREEN = "\x1b[32m";
const FG_WHITE = "\x1b[37m";
const FG_GRAY = "\x1b[90m";

type Step = { delay: number; data: string };

function script(): Step[] {
  const s: Step[] = [];
  const push = (delay: number, data: string) => s.push({ delay, data });

  push(60, `${FG_CYAN}claude${RESET} ${DIM}v2.1.114 — interactive session${RESET}\r\n`);
  push(80, `${FG_GRAY}cwd: /repo/auth-service${RESET}\r\n\r\n`);
  push(180, `${BOLD}${FG_MAGENTA}› ${RESET}${FG_WHITE}refactor auth/middleware.ts to use JWT with rotating keys${RESET}\r\n\r\n`);

  push(240, `${DIM}${ITAL}thinking…${RESET}\r\n`);
  push(220, `${FG_GRAY}  · considering 24h key rotation with 48h grace window${RESET}\r\n`);
  push(220, `${FG_GRAY}  · HS256 verification stays for existing tokens${RESET}\r\n`);
  push(220, `${FG_GRAY}  · introduce KeyRing interface + scheduled rotator${RESET}\r\n\r\n`);

  const assistant = [
    `I'll refactor the auth middleware to use JWT with rotating keys.\r\n`,
    `Let me start by reading the current middleware to map the surface area,\r\n`,
    `then introduce a JWKS-style key provider, plumb it through the verifier,\r\n`,
    `and ensure we rotate smoothly without invalidating live sessions.\r\n\r\n`,
  ];
  for (const chunk of assistant) {
    push(160, `${FG_WHITE}${chunk}${RESET}`);
  }

  push(220, `${FG_YELLOW}⏺ Read${RESET}${DIM}(auth/middleware.ts)${RESET}\r\n`);
  push(260, `  ${FG_GREEN}⎿${RESET}  ${DIM}read 142 lines${RESET}\r\n\r\n`);
  push(200, `${FG_YELLOW}⏺ Edit${RESET}${DIM}(auth/middleware.ts)${RESET}\r\n`);
  push(240, `  ${FG_GREEN}⎿${RESET}  ${DIM}+42 -18${RESET}\r\n\r\n`);
  push(200, `${FG_YELLOW}⏺ Write${RESET}${DIM}(auth/key-ring.ts)${RESET}\r\n`);
  push(240, `  ${FG_GREEN}⎿${RESET}  ${DIM}+87 new file${RESET}\r\n\r\n`);
  push(200, `${FG_YELLOW}⏺ Bash${RESET}${DIM}(npm test -- auth/)${RESET}\r\n`);
  push(240, `  ${FG_GREEN}⎿${RESET}  ${DIM}14 passed, 0 failed${RESET}\r\n`);
  push(160, `  ${FG_GREEN}⎿${RESET}  ${DIM}… +28 lines (ctrl+o to expand)${RESET}\r\n\r\n`);
  push(200, `${FG_YELLOW}⏺ Edit${RESET}${DIM}(auth/verifier.ts)${RESET}\r\n`);
  push(240, `  ${FG_GREEN}⎿${RESET}  ${DIM}+24 -9${RESET}\r\n\r\n`);

  push(280, `${FG_WHITE}Changes staged across 3 files.${RESET}\r\n`);
  push(220, `${FG_MAGENTA}?${RESET} apply 3 edits across auth/{middleware,verifier,key-ring}.ts ${DIM}[y/n]${RESET} `);
  push(1200, ``);
  push(60, `\r\n\r\n${DIM}── session · mock replay · loop ──${RESET}\r\n\r\n`);
  return s;
}

export type MockReplayHandle = { stop(): void };

export function startMockReplay(bus: TerminalBus, loop = true, speed = 1): MockReplayHandle {
  const steps = script();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scale = speed > 0 ? 1 / speed : 1;

  const run = async () => {
    while (!cancelled) {
      for (const { delay, data } of steps) {
        if (cancelled) return;
        await wait(Math.max(8, delay * scale), (t) => {
          timer = t;
        });
        if (cancelled) return;
        if (data) bus.write(data);
      }
      if (!loop) return;
      await wait(Math.max(200, 1600 * scale), (t) => {
        timer = t;
      });
      if (!cancelled) bus.clear();
    }
  };

  void run();

  return {
    stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function wait(ms: number, capture: (t: ReturnType<typeof setTimeout>) => void): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), ms);
    capture(t);
  });
}
