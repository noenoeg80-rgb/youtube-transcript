// Picks "important moments" from timed segments, for auto screenshots and quick insight.
// Heuristic, no AI call: scores ~20s windows by emphasis words, numbers/money and enumeration.

const RULES = [
  { tag: 'penekanan', weight: 3, re: /\b(penting|terpenting|kunci(nya)?|rahasia(nya)?|intinya|inti(nya)?|perhatikan|catat|ingat|wajib|harus|jangan|kesalahan|fatal|important|key|secret|remember|never|must|mistake)\b/gi },
  { tag: 'kesimpulan', weight: 3, re: /\b(kesimpulan(nya)?|jadi intinya|singkatnya|pada akhirnya|ringkasnya|in conclusion|bottom line|to summari[sz]e|the point is)\b/gi },
  { tag: 'strategi', weight: 2, re: /\b(strategi|cara|tips|trik|langkah|tahap|metode|rumus|formula|framework|sistem|step|strategy|how to)\b/gi },
  { tag: 'urutan', weight: 1, re: /\b(pertama|kedua|ketiga|keempat|kelima|nomor (satu|dua|tiga)|first(ly)?|second(ly)?|third(ly)?)\b/gi },
  { tag: 'angka', weight: 1, re: /(\brp\.?\s?\d|\$\s?\d|\d+(?:[.,]\d+)?\s?(%|persen|juta|ribu|miliar|triliun|million|billion|k\b))/gi },
  { tag: 'data', weight: 1, re: /\b(data(nya)?|riset|penelitian|statistik|survei|hasil(nya)?|omzet|profit|untung|rugi|revenue|research|study)\b/gi },
];

function windows(segments, windowSec) {
  const out = [];
  let cur = null;
  for (const s of segments) {
    if (!cur || s.start - cur.start >= windowSec) {
      if (cur) out.push(cur);
      cur = { start: s.start, parts: [] };
    }
    cur.parts.push(s.text);
  }
  if (cur) out.push(cur);
  return out.map((w) => ({ start: w.start, text: w.parts.join(' ').replace(/\s+/g, ' ').trim() }));
}

function score(text) {
  let total = 0;
  const tags = [];
  for (const r of RULES) {
    const hits = (text.match(r.re) || []).length;
    if (!hits) continue;
    total += r.weight * Math.min(hits, 3);
    tags.push(r.tag);
  }
  return { total, tags };
}

// segments: [{ start (s), text }] → [{ start, label, tags, score }] sorted by time.
export function pickMoments(segments, { max = 6, windowSec = 20, minGapSec = 60, minScore = 3 } = {}) {
  if (!Array.isArray(segments) || !segments.length) return [];
  const ranked = windows(segments, windowSec)
    .map((w) => ({ ...w, ...score(w.text) }))
    .filter((w) => w.total >= minScore)
    .sort((a, b) => b.total - a.total || a.start - b.start);

  const picked = [];
  for (const w of ranked) {
    if (picked.length >= max) break;
    if (picked.some((p) => Math.abs(p.start - w.start) < minGapSec)) continue;
    picked.push(w);
  }
  return picked
    .sort((a, b) => a.start - b.start)
    .map((w) => ({
      start: Math.floor(w.start),
      label: w.text.length > 160 ? `${w.text.slice(0, 157)}…` : w.text,
      tags: w.tags,
      score: w.total,
    }));
}
