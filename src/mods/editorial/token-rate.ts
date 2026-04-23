import type { SessionInfo } from "../shared/session-info";

const WINDOW_MIN = 30;
const BUCKET_MS = 60_000;

export type RateSample = {
  /** ms-since-epoch at the end of this 1-minute bucket */
  t: number;
  /** tokens added during this minute */
  tokenDelta: number;
  /** cost added during this minute (USD) */
  costDelta: number;
  /** false until the bucket has rolled over — the trailing sample is live */
  sealed: boolean;
};

export type TokenRateSnapshot = {
  samples: RateSample[];
  maxTokenDelta: number;
  maxCostDelta: number;
  lastTokenDelta: number;
  lastCostDelta: number;
  avgTokenPerMin: number;
  avgCostPerMin: number;
};

export interface TokenRateTracker {
  sample(info: SessionInfo): void;
  snapshot(): TokenRateSnapshot;
  dispose(): void;
}

export function createTokenRateTracker(): TokenRateTracker {
  const sealed: RateSample[] = [];
  let currentBucket: number | null = null;
  let bucketStartTokens = 0;
  let bucketStartCost = 0;
  let lastTokens = 0;
  let lastCost = 0;

  function sample(info: SessionInfo): void {
    const tokens = info.aggregates.totalTokens;
    const cost = info.aggregates.totalCost;
    const bucket = Math.floor(Date.now() / BUCKET_MS);

    if (currentBucket == null) {
      currentBucket = bucket;
      bucketStartTokens = tokens;
      bucketStartCost = cost;
    } else if (bucket > currentBucket) {
      sealed.push({
        t: (currentBucket + 1) * BUCKET_MS,
        tokenDelta: Math.max(0, tokens - bucketStartTokens),
        costDelta: Math.max(0, cost - bucketStartCost),
        sealed: true,
      });
      // fill any skipped minutes with zero deltas so the x-axis stays linear
      for (let m = currentBucket + 1; m < bucket; m++) {
        sealed.push({ t: (m + 1) * BUCKET_MS, tokenDelta: 0, costDelta: 0, sealed: true });
      }
      while (sealed.length > WINDOW_MIN) sealed.shift();
      currentBucket = bucket;
      bucketStartTokens = tokens;
      bucketStartCost = cost;
    }

    lastTokens = tokens;
    lastCost = cost;
  }

  function snapshot(): TokenRateSnapshot {
    const all: RateSample[] = sealed.slice(-(WINDOW_MIN - 1));
    if (currentBucket != null) {
      all.push({
        t: (currentBucket + 1) * BUCKET_MS,
        tokenDelta: Math.max(0, lastTokens - bucketStartTokens),
        costDelta: Math.max(0, lastCost - bucketStartCost),
        sealed: false,
      });
    }

    let maxT = 0;
    let maxC = 0;
    let sumT = 0;
    let sumC = 0;
    for (const s of all) {
      if (s.tokenDelta > maxT) maxT = s.tokenDelta;
      if (s.costDelta > maxC) maxC = s.costDelta;
      sumT += s.tokenDelta;
      sumC += s.costDelta;
    }

    const last = all[all.length - 1];
    return {
      samples: all,
      maxTokenDelta: maxT,
      maxCostDelta: maxC,
      lastTokenDelta: last ? last.tokenDelta : 0,
      lastCostDelta: last ? last.costDelta : 0,
      avgTokenPerMin: all.length ? sumT / all.length : 0,
      avgCostPerMin: all.length ? sumC / all.length : 0,
    };
  }

  function dispose(): void {
    sealed.length = 0;
    currentBucket = null;
  }

  return { sample, snapshot, dispose };
}

export type SparkPaths = {
  tokens: string;
  cost: string;
};

/** Maps a rate snapshot to `points` strings for two polylines in a 160×42 viewport. */
export function renderSparkPaths(snap: TokenRateSnapshot, w = 160, h = 42): SparkPaths {
  const n = snap.samples.length;
  if (n === 0) return { tokens: "", cost: "" };

  const padTop = 3;
  const padBot = 3;
  const plotH = h - padTop - padBot;

  const maxT = snap.maxTokenDelta > 0 ? snap.maxTokenDelta : 1;
  const maxC = snap.maxCostDelta > 0 ? snap.maxCostDelta : 1;

  const px = (i: number): number => (n === 1 ? w : (i / (n - 1)) * w);
  const py = (v: number, m: number): number => padTop + (plotH - (v / m) * plotH);

  const tokens = snap.samples
    .map((s, i) => `${px(i).toFixed(1)},${py(s.tokenDelta, maxT).toFixed(1)}`)
    .join(" ");
  const cost = snap.samples
    .map((s, i) => `${px(i).toFixed(1)},${py(s.costDelta, maxC).toFixed(1)}`)
    .join(" ");

  return { tokens, cost };
}
