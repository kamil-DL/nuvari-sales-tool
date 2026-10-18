# NST → Google Sheet (live visit-plan mirror)

When someone saves a visit plan in NST (add/remove/reorder shops, change the date, cancel it), the
Sheet updates itself within a few seconds. **One-way**: NST → Sheet. Change plans in NST, not in
the Sheet. Rows you type yourself (no plan id in the hidden last column) are never touched.

**What it does.** The team's sheet already has a 拜訪計畫 page that builds itself from the master tab
(經銷商總表) using the date column `預計拜訪日(298)`. So the sync does not write its own list: it only fills in
(and clears) that one date column in the master tab:
- plan saved in NST → each shop in the plan gets the plan's date
- shop removed / date changed / plan cancelled or deleted → the old date is cleared again (only if the cell still holds it)
- a cell holding something else (e.g. an `X` or `V` mark) is never overwritten; it is reported back instead
- shops are matched to master rows by address (fallback: exact shop name). Shops that aren't in the master are reported, not added.

## Setup (≈ 10 min, once)

### 0. The file must be a real Google Sheet
If the file's name shows `.xlsx` in Drive, open it and use **File → Save as Google Sheets** first
(Apps Script doesn't exist for Excel files).

### 1. Apps Script
1. In the Sheet: **Extensions → Apps Script**. Delete the sample code, paste all of `Code.gs`.
2. Check the top of the code: `MASTER_SHEET` must be the exact name of the master tab (`經銷商總表`) and the column
   names below it must match the master's header row. Run `checkSetup()` to verify (see the Execution log).
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
Create or edit a plan in NST → within ~5–10 s the shops' 預計拜訪日(298) cells in 經銷商總表 change, and the 拜訪計畫 page picks them up.
Look at `select * from net._http_response order by created desc limit 5;` in the SQL editor if nothing
arrives (status 200 + `{"ok":true}` = working; `unauthorized` = the two secrets differ).

## Notes
- Saving a plan never fails because of the sync — errors are only logged.
- Out-of-order deliveries are handled (each snapshot carries a version; stale ones are ignored).
- Test the script logic locally: `node tools/sheet-sync/test.js`.
- To stop syncing: `delete from public.sheet_sync_config;`
