/**
 * NST → Google Sheet: planned visit dates.
 *
 * The team's sheet already has a 拜訪計畫 page that builds itself from the master tab
 * (經銷商總表): whatever date is in the master's 「預計拜訪日(298)」 column shows up there, sorted by
 * date. So this script does NOT write its own list — it only fills in (and clears) that one date
 * column in the master tab when someone plans a visit in NST. Nothing else in the sheet is touched.
 *
 * - NST plan saved   → every shop in the plan gets the plan's date in 預計拜訪日(298)
 * - shop removed from a plan / date changed / plan cancelled or deleted
 *                    → the old date is cleared again (only if the cell still holds that date)
 * - a cell that holds something else (e.g. an "X" or "V" mark) is never overwritten; it is reported back instead
 * - shops are matched to master rows by address (falls back to exact shop name)
 *
 * One-way (NST → sheet). Setup: tools/sheet-sync/README.md
 */

var MASTER_SHEET = '經銷商總表';
var COL_NAME = '店名';
var COL_ADDRESS = '地址';
var COL_DATE = '預計拜訪日(298)';

function doGet() {
  return json_({ ok: true, service: 'nst-sheet-sync' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('WEBHOOK_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
    if (!body.plan_id) return json_({ ok: false, error: 'no plan_id' });

    // pg_net delivery order isn't guaranteed — ignore a snapshot older than one already applied.
    var vkey = 'v_' + body.plan_id;
    var last = Number(props.getProperty(vkey) || 0);
    var version = Number(body.version || 0);
    if (version && version < last) return json_({ ok: true, skipped: 'stale' });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER_SHEET);
    if (!sheet) return json_({ ok: false, error: 'tab not found: ' + MASTER_SHEET });
    var result = applyPlan_(sheet, props, body);
    if (body.deleted) props.deleteProperty(vkey); else props.setProperty(vkey, String(version));
    return json_({ ok: true, matched: result.matched, unmatched: result.unmatched, skipped: result.skipped });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- matching helpers ------------------------------------------------------------------------
function addrKey_(a) {
  a = String(a || '').replace(/^\d{3,6}\s*/, '').replace(/臺/g, '台').replace(/台灣/g, '');
  a = a.replace(/([區鄉鎮市])[一-鿿]{1,3}[里村](?=[一-鿿])/g, '$1');   // drop the village after the district
  a = a.replace(/之/g, '-').replace(/一段/g, '1段').replace(/二段/g, '2段').replace(/三段/g, '3段')
       .replace(/四段/g, '4段').replace(/五段/g, '5段').replace(/六段/g, '6段');
  a = a.replace(/\d+樓.*$|\d+[Ff].*$|[,、].*$|號號/g, function (m) { return m === '號號' ? '號' : ''; });
  return a.replace(/[\s\-－.]/g, '');
}

function ymd_(d) {   // Date or 'yyyy-mm-dd' / 'yyyy/mm/dd' text → 'yyyymmdd' (or '' if it isn't a date)
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return isNaN(d) ? '' : String(d.getFullYear()) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(String(d).trim());
  return m ? m[1] + ('0' + m[2]).slice(-2) + ('0' + m[3]).slice(-2) : '';
}

function toDate_(y) { return new Date(Number(y.slice(0, 4)), Number(y.slice(4, 6)) - 1, Number(y.slice(6, 8))); }

/**
 * Apply one plan snapshot to the master tab. `store` is anything with getProperty/setProperty/deleteProperty
 * (Script Properties in production) — it remembers which cells a plan wrote, so a later snapshot can clear them.
 */
function applyPlan_(sheet, store, snap) {
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var cName = head.indexOf(COL_NAME) + 1, cAddr = head.indexOf(COL_ADDRESS) + 1, cDate = head.indexOf(COL_DATE) + 1;
  if (!cName || !cAddr || !cDate) throw new Error('column not found (need ' + [COL_NAME, COL_ADDRESS, COL_DATE].join(' / ') + ')');
  var n = Math.max(lastRow - 1, 0);
  var names = n ? sheet.getRange(2, cName, n, 1).getValues() : [];
  var addrs = n ? sheet.getRange(2, cAddr, n, 1).getValues() : [];
  var byAddr = {}, byName = {};
  for (var i = 0; i < n; i++) {
    var k = addrKey_(addrs[i][0]);
    if (k) (byAddr[k] = byAddr[k] || []).push(i + 2);
    var nm = String(names[i][0]).trim();
    if (nm) (byName[nm] = byName[nm] || []).push(i + 2);
  }
  function findRows(stop) {
    var rows = byAddr[addrKey_(stop.address)] || [];
    if (rows.length > 1) {   // several shops share one address → keep the one whose name matches
      var same = rows.filter(function (r) { return String(names[r - 2][0]).trim() === String(stop.name).trim(); });
      if (same.length) rows = same;
    }
    if (!rows.length) rows = (byName[String(stop.name).trim()] || []).length === 1 ? byName[String(stop.name).trim()] : [];
    return rows;
  }
  function keyFor(stop) { return addrKey_(stop.address) || ('n:' + String(stop.name).trim()); }
  function cell(r) { return sheet.getRange(r, cDate); }

  var storeKey = 'plan_' + snap.plan_id;
  var prev = []; try { prev = JSON.parse(store.getProperty(storeKey) || '[]'); } catch (e) { prev = []; }
  var date = snap.deleted ? '' : ymd_(snap.plan_date);
  var next = [];
  if (!snap.deleted && date) (snap.stops || []).forEach(function (s) { next.push({ k: keyFor(s), y: date, a: s.address, n: s.name }); });

  // 1) clear what an earlier version of this plan wrote and the new one no longer does
  var keepKey = {}; next.forEach(function (x) { keepKey[x.k + '|' + x.y] = true; });
  prev.forEach(function (p) {
    if (keepKey[p.k + '|' + p.y]) return;
    var rows = findRows({ address: p.a, name: p.n });
    rows.forEach(function (r) { if (ymd_(cell(r).getValue()) === p.y) cell(r).setValue(''); });
  });

  // 2) write the current plan
  var matched = [], unmatched = [], skipped = [];
  (snap.stops || []).forEach(function (s) {
    if (snap.deleted || !date) return;
    var rows = findRows(s);
    if (!rows.length) { unmatched.push(s.name); return; }
    rows.forEach(function (r) {
      var cur = cell(r).getValue();
      if (cur === '' || ymd_(cur)) { cell(r).setValue(toDate_(date)); cell(r).setNumberFormat('yyyy/mm/dd'); matched.push(s.name); }
      else skipped.push(s.name + '（儲存格已有「' + cur + '」，未覆寫）');
    });
  });

  if (next.length) store.setProperty(storeKey, JSON.stringify(next)); else store.deleteProperty(storeKey);
  return { matched: matched, unmatched: unmatched, skipped: skipped };
}

// ---- one-off helpers (run from the editor) ----------------------------------------------------
/** Run once: stores the shared secret (paste yours below, run, then delete it from the code). */
function saveSecret() {
  var SECRET = 'PASTE-THE-SAME-SECRET-HERE';
  if (SECRET.indexOf('PASTE') === 0) throw new Error('Edit SECRET first');
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_SECRET', SECRET);
  return 'saved';
}

/** Sanity check: shows which tab/columns the script will use. */
function checkSetup() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER_SHEET);
  if (!sheet) throw new Error('No tab named ' + MASTER_SHEET);
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  Logger.log([COL_NAME, COL_ADDRESS, COL_DATE].map(function (c) { return c + ' → column ' + (head.indexOf(c) + 1); }).join('\n'));
  Logger.log('secret saved: ' + !!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET'));
}

/**
 * Undo for the first (wrong) version of this script, which appended plan rows to the 拜訪計畫 tab:
 * deletes the rows that carry a plan id in column J and un-hides column J. Run once, only if you ran that version.
 */
function cleanupFirstVersion() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('拜訪計畫');
  if (!sheet) return 'no 拜訪計畫 tab';
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var last = sheet.getLastRow(), removed = 0;
  var col = last > 3 ? sheet.getRange(1, 10, last, 1).getValues() : [];
  for (var i = col.length - 1; i >= 3; i--) { if (uuid.test(String(col[i][0]))) { sheet.deleteRow(i + 1); removed++; } }
  sheet.unhideColumn(sheet.getRange(1, 10));
  return 'removed ' + removed + ' rows; column J visible again';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { applyPlan_: applyPlan_, addrKey_: addrKey_, ymd_: ymd_ };
