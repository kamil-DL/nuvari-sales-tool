// Local test for Code.gs with a tiny in-memory fake of the Sheet API.  Run: node tools/sheet-sync/test.js
const assert = require('assert');
// Code.gs is plain Apps Script (no .js extension) — load it into a module-like sandbox
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sandbox);
const { applyPlan_, buildRows_, HEADERS } = sandbox.module.exports;

class FakeSheet {
  constructor() { this.rows = [HEADERS.slice()]; }
  getLastRow() { return this.rows.length; }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = s.rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, k) => row[c - 1 + k] ?? '')); } return out; },
      setValues: (vals) => { vals.forEach((v, i) => { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; v.forEach((x, k) => { s.rows[r - 1 + i][c - 1 + k] = x; }); }); },
      setNumberFormat: () => {},
    };
  }
  insertRowsAfter(after, n) { this.rows.splice(after, 0, ...Array.from({ length: n }, () => [])); }
  deleteRows(at, n) { this.rows.splice(at - 1, n); }
  deleteRow(at) { this.rows.splice(at - 1, 1); }
}

const stop = (order, name, extra = {}) => ({ order, name, county: '台北市', address: name + '地址', phone: '02-1', priority: 'A', ...extra });
const plan = (id, stops, extra = {}) => ({ plan_id: id, plan_date: '2026-10-20', rep: 'Rain', plan_status: 'planned', plan_notes: '送樣品', stops, version: 1, ...extra });
const idCol = (sh) => sh.rows.slice(1).map(r => r[9]);
const names = (sh, id) => sh.rows.slice(1).filter(r => r[9] === id).map(r => r[1]);

const sh = new FakeSheet();
sh.rows.push(['2026-09-01', '手動店', '', '', '', '', '', '', '', '']);   // a row typed by hand — must survive

applyPlan_(sh, plan('P1', [stop(1, 'A店'), stop(2, 'B店'), stop(3, 'C店')]));
assert.deepStrictEqual(names(sh, 'P1'), ['A店', 'B店', 'C店']);
applyPlan_(sh, plan('P2', [stop(1, 'X店')], { rep: 'Devin' }));
// shrink P1 (middle row), then grow it, then reorder
applyPlan_(sh, plan('P1', [stop(1, 'A店'), stop(2, 'C店')]));
assert.deepStrictEqual(names(sh, 'P1'), ['A店', 'C店']);
assert.deepStrictEqual(names(sh, 'P2'), ['X店'], 'other plan untouched');
applyPlan_(sh, plan('P1', [stop(1, 'C店'), stop(2, 'A店'), stop(3, 'D店'), stop(4, 'E店')]));
assert.deepStrictEqual(names(sh, 'P1'), ['C店', 'A店', 'D店', 'E店']);
assert.deepStrictEqual(names(sh, 'P2'), ['X店']);
assert.strictEqual(sh.rows[1][1], '手動店', 'hand-typed row survived');
// P2's rows must still sit contiguously after P1's block
assert.deepStrictEqual(idCol(sh), ['', 'P1', 'P1', 'P1', 'P1', 'P2']);
// fields
const r = sh.rows.find(x => x[9] === 'P2');
assert.strictEqual(r[4], 'Devin'); assert.strictEqual(r[3], 'A'); assert.strictEqual(r[7], '20261020-01'); assert.strictEqual(r[8], '送樣品');
assert.ok(Object.prototype.toString.call(r[0]) === '[object Date]' && r[0].getFullYear() === 2026 && r[0].getMonth() === 9 && r[0].getDate() === 20, 'date is a real date');
// empty plan still visible, then delete
applyPlan_(sh, plan('P3', []));
assert.deepStrictEqual(names(sh, 'P3'), ['（尚未加入店家）']);
applyPlan_(sh, { plan_id: 'P3', deleted: true });
assert.deepStrictEqual(names(sh, 'P3'), []);
applyPlan_(sh, { plan_id: 'P1', deleted: true });
assert.deepStrictEqual(idCol(sh), ['', 'P2']);
// a sheet that someone sorted (scattered rows) is repaired, not corrupted
const sh2 = new FakeSheet();
sh2.rows.push(['d', 'a', '', '', '', '', '', '', '', 'P1'], ['d', 'zz', '', '', '', '', '', '', '', 'P9'], ['d', 'b', '', '', '', '', '', '', '', 'P1']);
applyPlan_(sh2, plan('P1', [stop(1, 'N1'), stop(2, 'N2')]));
assert.deepStrictEqual(names(sh2, 'P1'), ['N1', 'N2']); assert.deepStrictEqual(names(sh2, 'P9'), ['zz']);
assert.strictEqual(buildRows_(plan('Q', [stop(12, 'Z')]))[0][7], '20261020-12');
console.log('sheet-sync: all tests passed');
