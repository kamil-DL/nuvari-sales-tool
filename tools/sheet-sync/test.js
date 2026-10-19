// Local test for Code.gs with a tiny in-memory fake of the Sheet API.  Run: node tools/sheet-sync/test.js
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sandbox);
const { applyPlan_, addrKey_, ymd_, applyShopDate_ } = sandbox.module.exports;

const HEAD = ['編號', '店名', '地址', '預計拜訪日(298)', '已建入系統(298)'];
class FakeSheet {
  constructor(rows) { this.rows = [HEAD.slice(), ...rows]; this.fmt = {}; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return HEAD.length; }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, k) => (s.rows[r - 1 + i] || [])[c - 1 + k] ?? '')),
      getValue: () => (s.rows[r - 1] || [])[c - 1] ?? '',
      setValue: (v) => { s.rows[r - 1][c - 1] = v; },
      setNumberFormat: (f) => { s.fmt[r + ',' + c] = f; },
    };
  }
}
const store = () => { const m = {}; return { getProperty: (k) => m[k] ?? null, setProperty: (k, v) => { m[k] = v; }, deleteProperty: (k) => { delete m[k]; }, _m: m }; };
const D = (y, m, d) => new Date(y, m - 1, d);
const dateCol = (sh) => sh.rows.slice(1).map(r => (Object.prototype.toString.call(r[3]) === '[object Date]' ? ymd_(r[3]) : r[3]));
const plan = (id, date, stops, extra = {}) => ({ plan_id: id, plan_date: date, stops, deleted: false, ...extra });
const st = (name, address) => ({ name, address });

// master rows: note the different address spellings between NST and the sheet
const sh = new FakeSheet([
  [1, '甲店', '106臺北市大安區新生南路3段20號', '', '否'],
  [2, '乙店', '台北市中山區農安街271巷5號', D(2026, 10, 1), '否'],      // already has an (old) date
  [3, '丙店', '241新北市三重區福德北路55之1號1樓', 'X', '否'],           // a non-date mark — must never be overwritten
  [4, '丁店', '桃園市中壢區民族路二段95號', '', '否'],
  [5, '戊店甲', '高雄市前鎮區草衙三路8號', '', '否'],                    // two shops, one address
  [6, '戊店乙', '806高雄市前鎮區明義里草衙三路8號', '', '否'],
]);
const S = store();

// 1) plan → dates written (addresses match despite 臺/台, zip, 里, 之/-, floor)
let r = applyPlan_(sh, S, plan('P1', '2026-10-20', [
  st('甲店', '106臺北市大安區新生南路三段20號'), st('乙店', '台北市中山區農安街271巷5號'),
  st('丙店', '新北市三重區福德北路55-1號'), st('不存在的店', '台中市某路1號'), st('戊店乙', '806高雄市前鎮區明義里草衙三路8號')]));
assert.deepStrictEqual(dateCol(sh), ['20261020', '20261020', 'X', '', '', '20261020']);
assert.strictEqual(JSON.stringify(r.unmatched), JSON.stringify(['不存在的店']));
assert.strictEqual(r.skipped.length, 1); assert.ok(r.skipped[0].startsWith('丙店'));
assert.strictEqual(sh.fmt['2,4'], 'yyyy/mm/dd');

// 2) move one shop out, change nothing else → that shop is cleared, others keep the date
r = applyPlan_(sh, S, plan('P1', '2026-10-20', [st('甲店', '106臺北市大安區新生南路三段20號'), st('乙店', '台北市中山區農安街271巷5號')]));
assert.deepStrictEqual(dateCol(sh), ['20261020', '20261020', 'X', '', '', '']);

// 3) plan date changes → old date replaced
applyPlan_(sh, S, plan('P1', '2026-10-25', [st('甲店', '106臺北市大安區新生南路三段20號'), st('乙店', '台北市中山區農安街271巷5號')]));
assert.deepStrictEqual(dateCol(sh), ['20261025', '20261025', 'X', '', '', '']);

// 4) a person typed a different date by hand in between → we don't clear/override-clear it
sh.rows[1][3] = D(2026, 11, 30);
applyPlan_(sh, S, plan('P1', '2026-10-25', [st('乙店', '台北市中山區農安街271巷5號')]));   // 甲店 removed, but its cell no longer holds our date
assert.strictEqual(ymd_(sh.rows[1][3]), '20261130', 'hand-typed date kept');

// 5) cancel/delete → everything this plan wrote is cleared
applyPlan_(sh, S, { plan_id: 'P1', deleted: true });
assert.strictEqual(sh.rows[2][3], '', 'cleared on delete');
assert.strictEqual(sh.rows[3][3], 'X', 'X mark untouched');

// 6) a second plan on another date doesn't disturb the first plan's cells
applyPlan_(sh, S, plan('A', '2026-10-21', [st('丁店', '桃園市中壢區民族路二段95號')]));
applyPlan_(sh, S, plan('B', '2026-10-22', [st('戊店甲', '高雄市前鎮區草衙三路8號')]));
assert.strictEqual(ymd_(sh.rows[4][3]), '20261021'); assert.strictEqual(ymd_(sh.rows[5][3]), '20261022');
assert.strictEqual(sh.rows[6][3], '', '戊店乙 (same address, other name) not touched');

assert.strictEqual(addrKey_('241新北市三重區大德里福德北路55之1號1樓'), addrKey_('新北市三重區福德北路55-1號'));
assert.throws(() => applyPlan_(new FakeSheet([]) && { getLastRow: () => 1, getLastColumn: () => 1, getRange: () => ({ getValues: () => [['x']] }) }, S, plan('Z', '2026-10-20', [])), /column not found/);

// 7) a single shop's own visit date (map popup): set, change, clear, never overwrite an X
const sh3 = new FakeSheet([[1, '甲店', '106臺北市大安區新生南路3段20號', '', '否'], [2, '乙店', '台北市中山區農安街271巷5號', 'X', '否']]);
let q = applyShopDate_(sh3, { name: '甲店', address: '台北市大安區新生南路三段20號', old_date: null, new_date: '2026-11-02' });
assert.strictEqual(ymd_(sh3.rows[1][3]), '20261102'); assert.strictEqual(q.matched.length, 1);
applyShopDate_(sh3, { name: '甲店', address: '台北市大安區新生南路三段20號', old_date: '2026-11-02', new_date: '2026-11-09' });
assert.strictEqual(ymd_(sh3.rows[1][3]), '20261109');
applyShopDate_(sh3, { name: '甲店', address: '台北市大安區新生南路三段20號', old_date: '2026-11-09', new_date: null });
assert.strictEqual(sh3.rows[1][3], '', 'cleared');
sh3.rows[1][3] = D(2026, 12, 1);   // someone typed another date → clearing the old popup date must not remove it
applyShopDate_(sh3, { name: '甲店', address: '台北市大安區新生南路三段20號', old_date: '2026-11-09', new_date: null });
assert.strictEqual(ymd_(sh3.rows[1][3]), '20261201');
q = applyShopDate_(sh3, { name: '乙店', address: '台北市中山區農安街271巷5號', old_date: null, new_date: '2026-11-02' });
assert.strictEqual(sh3.rows[2][3], 'X'); assert.strictEqual(q.skipped.length, 1);
q = applyShopDate_(sh3, { name: '沒有的店', address: '高雄市某路9號', old_date: null, new_date: '2026-11-02' });
assert.strictEqual(q.unmatched.length, 1);
console.log('sheet-sync: all tests passed');
