/* W2G AutoFill: finds the little "one letter per box" cells inside an area of a rendered form page.
 * Works on a grayscale pixel array, so the same code runs in the app and in the build tools. */
(function (root) {
  const DARK = 150;

  // px: Uint8 luminance (0 black .. 255 white), W/H: image size, r: {x, y, w, h} search area in pixels.
  // Returns cells as [{x, y, w, h}] in pixels, left to right then top to bottom.
  function detectCells(px, W, H, r) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(W - 1, Math.ceil(r.x + r.w)), y1 = Math.min(H - 1, Math.ceil(r.y + r.h));
    const dark = (x, y) => px[y * W + x] < DARK;

    // 1. Every vertical stroke in the area: per column, each dark run long enough to be a box side.
    const runs = [];
    for (let x = x0; x <= x1; x++) {
      let start = -1;
      for (let y = y0; y <= y1 + 1; y++) {
        const d = y <= y1 && dark(x, y);
        if (d && start < 0) start = y;
        if (!d && start >= 0) { if (y - start >= 6) runs.push({ x, y0: start, y1: y - 1 }); start = -1; }
      }
    }
    // 2. Merge strokes from neighbouring columns into lines (a 1pt line is a few pixels wide).
    runs.sort((a, b) => a.y0 - b.y0 || a.x - b.x);
    const lines = [];
    for (const s of runs) {
      const l = lines.find(l => s.x - l.xMax <= 1 && s.x >= l.xMin && Math.abs(s.y0 - l.y0) <= 3 && Math.abs(s.y1 - l.y1) <= 3);
      if (l) { l.xMax = s.x; l.y0 = Math.min(l.y0, s.y0); l.y1 = Math.max(l.y1, s.y1); }
      else lines.push({ xMin: s.x, xMax: s.x, y0: s.y0, y1: s.y1 });
    }
    // Thin strokes only (thick ones are letters or filled shapes), as tall as a box.
    const tall = lines.filter(l => l.xMax - l.xMin <= 6 && l.y1 - l.y0 >= 8);

    // 3. A cell is two neighbouring sides joined by a top and a bottom edge.
    const rowFill = (y, xa, xb) => { let n = 0; for (let x = xa; x <= xb; x++) if (dark(x, y) || (y > 0 && dark(x, y - 1)) || (y < H - 1 && dark(x, y + 1))) n++; return n / (xb - xa + 1); };
    const cells = [];
    const byRow = [];
    for (const l of tall) {
      const g = byRow.find(g => Math.abs(g.y0 - l.y0) <= 4 && Math.abs(g.y1 - l.y1) <= 4);
      if (g) g.lines.push(l); else byRow.push({ y0: l.y0, y1: l.y1, lines: [l] });
    }
    for (const g of byRow) {
      g.lines.sort((a, b) => a.xMin - b.xMin);
      for (let i = 0; i + 1 < g.lines.length; i++) {
        const a = g.lines[i], b = g.lines[i + 1];
        const top = Math.max(a.y0, b.y0), bot = Math.min(a.y1, b.y1), h = bot - top;
        const w = b.xMin - a.xMax;
        if (h < 8 || w < 0.4 * h || w > 2.6 * h) continue;
        const xa = a.xMax + 1, xb = b.xMin - 1;
        if (xb <= xa) continue;
        if (rowFill(top, xa, xb) > 0.85 && rowFill(bot, xa, xb) > 0.85)
          cells.push({ x: a.xMax + 1, y: top + 1, w: b.xMin - a.xMax - 1, h: h - 1 });
      }
    }
    // Drop specks (parts of printed letters) much smaller than the real boxes.
    const hs = cells.map(c => c.h).sort((a, b) => a - b), med = hs[hs.length >> 1] || 0;
    const real = cells.filter(c => c.h >= 0.6 * med);
    real.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));
    return real;
  }

  // Grayscale pixels from canvas ImageData.
  function toGray(img) {
    const d = img.data, g = new Uint8Array(img.width * img.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j + 3] < 128 ? 255 : (d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11);
    return g;
  }

  const api = { detectCells, toGray };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.W2GBoxes = api;
})(typeof self !== 'undefined' ? self : this);
