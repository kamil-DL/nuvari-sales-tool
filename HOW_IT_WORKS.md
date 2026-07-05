# How the Nuvari Sales Tool works (plain-language version)

This is the non-technical version. For the detailed technical version, see [ARCHITECTURE.md](ARCHITECTURE.md).

## What this actually is

Nuvari Sales Tool is two things in one:

1. **A map** for planning where dealers/shops should be, and how well different areas are covered.
2. **A shop database and visit planner** — a list of every shop the team deals with, their status (not contacted yet, visited, partnered, etc.), and a schedule of who's visiting whom and when.

Both live on the same website, and both are used by the whole sales team through a normal web browser — nothing to install.

## Where is everything actually stored?

All the real information — every shop, every visit, every photo, every login — is stored by a company called **Supabase**. Think of it as a secure, professionally-run filing cabinet in the cloud: it handles storing the data safely, checking that only logged-in team members can see it, and keeping backups. Nobody on the team needs to think about this day-to-day — it just works quietly in the background.

## Why are there suddenly "two databases"?

This is the main thing worth understanding.

Up until now, there was only **one** filing cabinet — the real one, with all your actual shops and visits in it. That meant that any time we wanted to test a new feature (like the new dataset feature, or the region auto-fill), the testing happened directly on your real data. A few times, that caused actual mess — duplicate shop entries, stray test records — that then had to be manually cleaned up.

So now there are **two separate filing cabinets**:

- **Real Data** — this is the one everyone uses in day-to-day work. Nothing about this has changed. It has all your real shops, visits, and contacts.
- **Practice Copy** — an empty, second filing cabinet that exists purely so that new features can be built and tested without any risk of touching your real information.

**You never have to choose between them.** The app quietly decides which one to use on its own, depending on how it's being opened:
- Opened normally (the real website) → always uses **Real Data**.
- Opened as part of local development/testing on a developer's own computer → uses the **Practice Copy** instead.

If you're just using the tool day-to-day, this change is invisible to you — everything behaves exactly as before. It only matters when someone is actively building or testing a new feature.

## Why does this matter going forward?

- **Safer testing.** New features can now be tried out, broken, fixed, and tried again — without any chance of that affecting real shop or visit records.
- **A record of what the database looks like.** Previously, changes to how the data was organized were made by hand and never written down anywhere except inside Supabase itself. Now, every such change is saved as a text file in the project (in a folder called `supabase/migrations/`), so there's a permanent, readable history of how the data has been structured over time — useful if anything ever needs to be rebuilt or double-checked.

## What hasn't changed

- The website address you use day-to-day is exactly the same.
- Your login is exactly the same.
- All your existing shops, visits, and data are untouched and still exactly where they were.
- Nothing about how the tool looks or behaves has changed because of this — this was entirely a "behind the scenes" safety improvement.
