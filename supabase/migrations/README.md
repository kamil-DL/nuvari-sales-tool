# Migrations

This is a plain historical record, not a CLI-managed migration system — there's no build step or Supabase CLI wired up yet. The convention:

- Every SQL script that gets run in the Supabase SQL editor is checked in here as a new numbered file, immediately after running it.
- Numbering is sequential (`0000_`, `0001_`, `0002_`, …), oldest first.
- Files are never edited after the fact — if a later change alters something from an earlier file (e.g. adding a column, changing a policy), that's a new numbered file, not an edit to the old one. The files are a log of what was actually run, in order.

This exists so the schema and RLS policies aren't only visible in the Supabase dashboard — anyone reading the repo can reconstruct what tables/columns/policies exist and why, without needing dashboard access.

`0000_initial_schema.sql` is the one exception to "log of what was actually run" — it predates this convention entirely, so it was reconstructed on 2026-07-05 by introspecting production's actual schema (`information_schema.columns` + `pg_policies`) rather than being a record of an SQL statement someone ran. See the comment at the top of that file for the one intentional fix made in the process (a stale column default).

To bootstrap a fresh project (e.g. a new dev/test project) from scratch, run every file here in order: `0000`, then `0001`, then `0002`, etc.
