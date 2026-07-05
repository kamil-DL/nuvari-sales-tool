// Shared low-level CSV/TSV tokenizer, used by both map-v0.4.1.html's candidate-shop import
// and the Shop DB's CSV import — the two tools still build their own higher-level row objects
// on top of this (they need different final shapes), but the character-by-character parsing
// used to be two separate hand-rolled copies, one of which didn't handle an escaped "" quote
// correctly. This is the map planner's version (the one that handled it right).

export function detectDelimiter(headerLine) {
  return headerLine.includes('\t') ? '\t' : ',';
}

export function parseCSVLine(line, delim) {
  const res = [];
  let inQ = false, cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      res.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  res.push(cur);
  return res;
}
