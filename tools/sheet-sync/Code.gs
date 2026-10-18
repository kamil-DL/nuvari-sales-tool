/**
 * NST → Google Sheet: live mirror of visit plans.
 *
 * Receives a complete snapshot of ONE visit plan from the Supabase database
 * (supabase/migrations/0019_sheet_sync.sql) and rewrites that plan's rows in the sheet.
 * One-way only: edits made in the sheet do not flow back to NST — change a plan in NST.
 * Rows without a plan id in the hidden last column (e.g. rows you typed yourself) are never touched.
 *
 * Columns (same as the team's sheet):
 *   拜訪日期 | 店家名稱 | 地址 | 拜訪優先級 | 負責業務 | 電話 | 縣市 | 排序鍵(輔助) | 目的 | 計畫ID(系統)
 *   - 負責業務 = the rep who is doing the visit (the plan's owner in NST)
 *   - 排序鍵(輔助) = yyyymmdd-NN (visit date + stop order) for sorting
 *   - 目的 = the plan's notes field in NST
 *
 * Setup: see tools/sheet-sync/README.md
 */

var SHEET_NAME = '拜訪計畫';
var HEADERS = ['拜訪日期', '店家名稱', '地址', '拜訪優先級', '負責業務', '電話', '縣市', '排序鍵(輔助)', '目的', '計畫ID(系統)'];
var ID_COL = HEADERS.length;   // 10 → column J

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
    var key = 'v_' + body.plan_id;
    var last = Number(props.getProperty(key) || 0);
    var version = Number(body.version || 0);
    if (version && version < last) return json_({ ok: true, skipped: 'stale' });

    applyPlan_(getSheet_(), body);
    if (body.deleted) props.deleteProperty(key); else props.setProperty(key, String(version));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Replace (or add / remove) every row belonging to one plan. */
function applyPlan_(sheet, snap) {
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
  var date = d.length === 3 ? new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2])) : '';
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

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { setupSheet(); sheet = ss.getSheetByName(SHEET_NAME); }
  return sheet;
}

/** Run once from the editor: creates the tab with the header row. Safe to re-run (headers only). */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
       .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2B547E').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 300);
  sheet.hideColumns(ID_COL);   // 計畫ID(系統) is the key the sync uses — keep it, just hidden
  return 'ready';
}

/** Run once from the editor after pasting your own secret, then delete the secret from the code. */
function saveSecret() {
  var SECRET = 'PASTE-THE-SAME-SECRET-HERE';
  if (SECRET.indexOf('PASTE') === 0) throw new Error('Edit SECRET first');
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_SECRET', SECRET);
  return 'saved';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { applyPlan_: applyPlan_, buildRows_: buildRows_, HEADERS: HEADERS };
