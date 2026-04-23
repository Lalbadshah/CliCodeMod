const PAIRS: Array<[number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  let v = Math.max(0, Math.floor(n));
  if (v === 0) return "N"; // "nulla"
  if (v > 3999) return String(v);
  let out = "";
  for (const [val, sym] of PAIRS) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

export function romanDate(d = new Date()): string {
  const day = toRoman(d.getDate());
  const month = toRoman(d.getMonth() + 1);
  const year = toRoman(d.getFullYear());
  return `${day} · ${month} · ${year}`;
}
