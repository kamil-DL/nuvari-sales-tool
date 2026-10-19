/**
 * NST → Google Sheet: planned visits.  Two modes (see MODE below).
 *
 * MASTER mode — the team's sheet already has a 拜訪計畫 page that builds itself from the master tab
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

// MODE 'list'   : own 拜訪計畫 tab, one row per planned stop (use this in a fresh sheet)
// MODE 'master' : only fill in the date column of an existing master tab (the team sheet whose 拜訪計畫 page is formula-driven)
var MODE = 'list';

// ---- LIST mode -------------------------------------------------------------------------------
var SHEET_NAME = '拜訪計畫';
var HEADERS = ['拜訪日期', '店家名稱', '地址', '拜訪優先級', '負責業務', '電話', '縣市', '排序鍵(輔助)', '目的', '計畫ID(系統)'];
var ID_COL = HEADERS.length;   // 10 → column J

// ---- MASTER mode -----------------------------------------------------------------------------
var MASTER_SHEET = '經銷商總表';
var COL_NAME = '店名';
var COL_ADDRESS = '地址';
var COL_DATE = '預計拜訪日(298)';
var COL_PRIORITY = '拜訪優先級';     // optional: kept in step with the shop's priority in NST
var COL_REP = '負責業務(298)';       // optional: kept in step with the shop's sales rep in NST
var COL_PHONE = '電話';              // optional: only filled in when empty
var COL_COUNTY = '縣市';             // optional: only filled in when empty

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

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {};
    if (MODE === 'list') {
      var tab = ss.getSheetByName(SHEET_NAME);
      if (!tab) return json_({ ok: false, error: 'tab not found: ' + SHEET_NAME + ' — run setupSheet() first' });
      if (body.type === 'shop_date') return json_({ ok: true, skipped: 'shop dates are not used in list mode' });
      applyListPlan_(tab, body);
    } else {
      var master = ss.getSheetByName(MASTER_SHEET);
      if (!master) return json_({ ok: false, error: 'tab not found: ' + MASTER_SHEET });
      result = body.type === 'shop_date' ? applyShopDate_(master, body) : applyPlan_(master, props, body);
    }
    if (body.deleted) props.deleteProperty(vkey); else props.setProperty(vkey, String(version));
    return json_({ ok: true, mode: MODE, matched: result.matched, unmatched: result.unmatched, skipped: result.skipped });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- LIST mode: replace one plan's rows ------------------------------------------------------
/** Replace (or add / remove) every row belonging to one plan. */
function applyListPlan_(sheet, snap) {
  var n = HEADERS.length;
  var last = sheet.getLastRow();
  var ids = last > 1 ? sheet.getRange(2, ID_COL, last - 1, 1).getValues() : [];
  var planId = String(snap.plan_id);
  var first = -1, count = 0;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === planId) { if (first < 0) first = i + 2; count++; }
  }
  // A plan's rows are normally one contiguous block; if someone sorted the sheet they may be
  // scattered — then remove them all (bottom-up) and re-add the plan as a fresh block at the end.
  if (count > 0) {
    var contiguous = ids.slice(first - 2, first - 2 + count).every(function (r) { return String(r[0]) === planId; });
    if (!contiguous) {
      for (var j = ids.length - 1; j >= 0; j--) if (String(ids[j][0]) === planId) sheet.deleteRow(j + 2);
      first = -1; count = 0;
    }
  }

  var rows = snap.deleted ? [] : buildRows_(snap);
  if (count > 0) {
    if (rows.length > count) sheet.insertRowsAfter(first + count - 1, rows.length - count);
    else if (rows.length < count) sheet.deleteRows(first + rows.length, count - rows.length);
  } else {
    first = sheet.getLastRow() + 1;
  }
  if (rows.length) {
    sheet.getRange(first, 1, rows.length, n).setValues(rows);
    sheet.getRange(first, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(first, 6, rows.length, 1).setNumberFormat('@');   // keep phone numbers as text
  }
}
function buildRows_(snap) {
  var d = String(snap.plan_date || '').split('-');
  var date = d.length === 3 ? toDate_(d.join('')) : '';
  var ymd = d.length === 3 ? d.join('') : '';
  var stops = snap.stops || [];
  if (!stops.length) {   // an empty plan still shows up, so the day isn't silently missing
    return [[date, '（尚未加入店家）', '', '', snap.rep || '', '', '', ymd + '-00', snap.plan_notes || '', snap.plan_id]];
  }
  return stops.map(function (s) {
    var order = Number(s.order) || 0;
    return [date, s.name || '', s.address || '', s.priority || '', snap.rep || '', s.phone || '', s.county || '',
            ymd + '-' + (order < 10 ? '0' : '') + order, snap.plan_notes || '', snap.plan_id];
  });
}

/**
 * LIST mode only. Creates the 拜訪計畫 tab with the header row. Refuses to touch a tab that already has
 * other content (a first version of this script once overwrote a team page that had the same name).
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) {
    var a1 = String(sheet.getRange(1, 1).getValue()).trim();
    if (a1 && a1 !== HEADERS[0]) throw new Error('A tab named ' + SHEET_NAME + ' already exists with other content — not touching it.');
  } else {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
       .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2B547E').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 300);
  sheet.hideColumns(ID_COL);   // 計畫ID(系統) is the key the sync uses — kept, just hidden
  return 'ready';
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

/** The spreadsheet's own time zone (a script and its sheet can differ — that once shifted every date by a day). */
var TZ_ = null;
function sheetTz_() {
  if (TZ_ === null) TZ_ = (typeof SpreadsheetApp !== 'undefined') ? SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() : '';
  return TZ_;
}

function ymd_(d) {   // Date or 'yyyy-mm-dd' / 'yyyy/mm/dd' text → 'yyyymmdd' (or '' if it isn't a date)
  if (Object.prototype.toString.call(d) === '[object Date]') {
    if (isNaN(d)) return '';
    if (typeof Utilities !== 'undefined' && sheetTz_()) return Utilities.formatDate(d, sheetTz_(), 'yyyyMMdd');   // read the cell in the sheet's time zone
    return String(d.getFullYear()) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }
  var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(String(d).trim());
  return m ? m[1] + ('0' + m[2]).slice(-2) + ('0' + m[3]).slice(-2) : '';
}

function toDate_(y) {   // midnight of that day in the SHEET's time zone, so the cell shows exactly that date
  if (typeof Utilities !== 'undefined' && sheetTz_()) return Utilities.parseDate(y.slice(0, 4) + '/' + y.slice(4, 6) + '/' + y.slice(6, 8), sheetTz_(), 'yyyy/MM/dd');
  return new Date(Number(y.slice(0, 4)), Number(y.slice(4, 6)) - 1, Number(y.slice(6, 8)));
}

/**
 * Apply one plan snapshot to the master tab. `store` is anything with getProperty/setProperty/deleteProperty
 * (Script Properties in production) — it remembers which cells a plan wrote, so a later snapshot can clear them.
 */
/** Locate the master tab's columns and build the address → row lookup once per call. */
function masterContext_(sheet) {
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
  var cPrio = head.indexOf(COL_PRIORITY) + 1, cRep = head.indexOf(COL_REP) + 1;
  var cPhone = head.indexOf(COL_PHONE) + 1, cCounty = head.indexOf(COL_COUNTY) + 1;
  return {
    phoneCell: cPhone ? function (r) { return sheet.getRange(r, cPhone); } : null,
    countyCell: cCounty ? function (r) { return sheet.getRange(r, cCounty); } : null,
    findRows: findRows,
    cell: function (r) { return sheet.getRange(r, cDate); },
    // optional columns: undefined when the header isn't there (the sync then just skips that field)
    prioCell: cPrio ? function (r) { return sheet.getRange(r, cPrio); } : null,
    repCell: cRep ? function (r) { return sheet.getRange(r, cRep); } : null
  };
}

/** Fill a text cell from the database only if it is empty — never overwrites what the team typed. */
function fillIfEmpty_(cellFn, r, v, asText) {
  if (!cellFn || !v) return false;
  var c = cellFn(r);
  if (String(c.getValue()).trim() !== '') return false;
  if (asText) c.setNumberFormat('@');   // keep phone numbers like 02-2276-6698 as plain text
  c.setValue(v);
  return true;
}

/** Set a text cell to the DB value; clear it only if it still holds the value we are replacing. */
function syncText_(cellFn, r, oldV, newV) {
  if (!cellFn) return false;
  var c = cellFn(r), cur = String(c.getValue()).trim();
  if (newV) { if (cur !== String(newV)) { c.setValue(newV); return true; } return false; }
  if (oldV && cur === String(oldV)) { c.setValue(''); return true; }
  return false;
}

/**
 * A shop changed in NST / the map popup: its own 拜訪日期, 拜訪優先級 and/or 負責業務 (sales rep).
 * Same safety rules as plans — a date is only written into an empty/date cell, and anything is only
 * cleared if the cell still holds the old value.
 */
function applyShopDate_(sheet, snap) {
  var ctx = masterContext_(sheet);
  var rows = ctx.findRows({ name: snap.name, address: snap.address });
  if (!rows.length) return { matched: [], unmatched: [snap.name], skipped: [] };
  var nd = ymd_(snap.new_date), od = ymd_(snap.old_date);
  var matched = [], skipped = [];
  rows.forEach(function (r) {
    var changed = false;
    if (nd !== od) {
      var cur = ctx.cell(r).getValue();
      if (nd) {
        if (cur === '' || ymd_(cur)) { ctx.cell(r).setValue(toDate_(nd)); ctx.cell(r).setNumberFormat('yyyy/mm/dd'); changed = true; }
        else skipped.push(snap.name + '（儲存格已有「' + cur + '」，未覆寫）');
      } else if (od && ymd_(cur) === od) { ctx.cell(r).setValue(''); changed = true; }
    }
    if ((snap.new_priority || '') !== (snap.old_priority || '')) changed = syncText_(ctx.prioCell, r, snap.old_priority, snap.new_priority) || changed;
    if ((snap.new_rep || '') !== (snap.old_rep || '')) changed = syncText_(ctx.repCell, r, snap.old_rep, snap.new_rep) || changed;
    // fill-in-only: a shop that wasn't in the original sheet has empty priority / rep / phone / county — complete them
    changed = fillIfEmpty_(ctx.prioCell, r, snap.priority || snap.new_priority) || changed;
    changed = fillIfEmpty_(ctx.repCell, r, snap.sales_rep || snap.new_rep) || changed;
    changed = fillIfEmpty_(ctx.phoneCell, r, snap.phone, true) || changed;
    changed = fillIfEmpty_(ctx.countyCell, r, snap.county) || changed;
    if (changed) matched.push(snap.name);
  });
  return { matched: matched, unmatched: [], skipped: skipped };
}

function applyPlan_(sheet, store, snap) {
  var ctx = masterContext_(sheet), findRows = ctx.findRows, cell = ctx.cell;
  function keyFor(stop) { return addrKey_(stop.address) || ('n:' + String(stop.name).trim()); }

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
      if (s.priority) syncText_(ctx.prioCell, r, null, s.priority);   // keep the master's priority / rep in step with NST
      if (s.sales_rep) syncText_(ctx.repCell, r, null, s.sales_rep);
      fillIfEmpty_(ctx.phoneCell, r, s.phone, true);
      fillIfEmpty_(ctx.countyCell, r, s.county);
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

if (typeof module !== 'undefined') module.exports = { applyPlan_: applyPlan_, addrKey_: addrKey_, ymd_: ymd_, applyListPlan_: applyListPlan_, applyShopDate_: applyShopDate_, buildRows_: buildRows_, HEADERS: HEADERS };
