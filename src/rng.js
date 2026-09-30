// Small seeded RNG (mulberry32) plus helpers.
export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return wrapRng(next);
}

// Unseeded RNG with the same helpers, for gameplay randomness.
export const rand = wrapRng(Math.random);

function wrapRng(next) {
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // entries: [[item, weight], ...]
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += w;
      if (total <= 0) return null;
      let r = next() * total;
      for (const [item, w] of entries) {
        r -= w;
        if (r <= 0) return item;
      }
      return entries[entries.length - 1][0];
    },
  };
}
