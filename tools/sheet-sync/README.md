# NST → Google Sheet (live visit-plan mirror)

When someone saves a visit plan in NST (add/remove/reorder shops, change the date, cancel it), the
Sheet updates itself within a few seconds. **One-way**: NST → Sheet. Change plans in NST, not in
the Sheet. Rows you type yourself (no plan id in the hidden last column) are never touched.

Columns: `拜訪日期 | 店家名稱 | 地址 | 拜訪優先級 | 負責業務 | 電話 | 縣市 | 排序鍵(輔助) | 目的 | 計畫ID(系統)`
- 負責業務 = the rep doing the visit (plan owner) · 排序鍵 = `yyyymmdd-NN` (date + stop order)
- 目的 = the plan's notes field in NST · 計畫ID(系統) = hidden key the sync uses

The Sheet is never shared with anyone outside your company: the script lives *inside* the Sheet and
only **receives** data. The Supabase database never reads the Sheet.

## Setup (≈ 10 min, once)

### 0. The file must be a real Google Sheet
If the file's name shows `.xlsx` in Drive, open it and use **File → Save as Google Sheets** first
(Apps Script doesn't exist for Excel files).

### 1. Apps Script
1. In the Sheet: **Extensions → Apps Script**. Delete the sample code, paste all of `Code.gs`.
2. Line 1 of the code: `SHEET_NAME` — the tab to write into. Set it to the **exact name of your existing
   tab** (or leave `拜訪計畫` and run `setupSheet()` to create a new tab with the header row).
3. Pick a long random secret (e.g. 40 random characters — a password manager works). In `saveSecret()`
   replace `PASTE-THE-SAME-SECRET-HERE` with it, select `saveSecret` in the toolbar and press **Run**
   (approve the permissions). Then **delete the secret from the code again** — it now lives in Script Properties.
4. **Deploy → New deployment → type "Web app"** · Execute as **Me** · Who has access **Anyone** → Deploy.
   Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
   - Opening that URL in a browser should show `{"ok":true,"service":"nst-sheet-sync"}`.
   - "Anyone" only lets a caller *send* data; without your secret the script rejects it.
     If your Google Workspace admin blocks "Anyone", ask IT to allow it for this one script (or tell me and
     I'll switch to an Edge Function + service account instead).

### 2. Database (Supabase SQL Editor — production)
1. Run `supabase/migrations/0019_sheet_sync.sql`.
2. Run (with **your** URL and the **same secret**):
   ```sql
   insert into public.sheet_sync_config (id, webhook_url, secret)
   values (1, 'https://script.google.com/macros/s/XXXX/exec', 'THE-SAME-SECRET')
   on conflict (id) do update set webhook_url = excluded.webhook_url, secret = excluded.secret;
   ```
3. Fill the sheet with all existing plans once: `select public.sheet_sync_all();`

### 3. Check
Create or edit a plan in NST → within ~5–10 s its rows appear/update in the Sheet.
Look at `select * from net._http_response order by created desc limit 5;` in the SQL editor if nothing
arrives (status 200 + `{"ok":true}` = working; `unauthorized` = the two secrets differ).

## Notes
- Saving a plan never fails because of the sync — errors are only logged.
- A plan with no shops yet shows one row "（尚未加入店家）"; cancelling or deleting a plan removes its rows.
- Out-of-order deliveries are handled (each snapshot carries a version; stale ones are ignored).
- Test the script logic locally: `node tools/sheet-sync/test.js`.
- To stop syncing: `delete from public.sheet_sync_config;`
