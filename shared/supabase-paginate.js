// PostgREST caps any single query at 1000 rows by default — a plain .select() silently
// truncates past that. Page through with .range() until a page comes back short.
// Any query that could return more than 1000 rows needs this — three separate places in
// this codebase (map.html's Load-from-Shop-DB, the Shop DB list, the Manage Datasets count)
// have hit this exact bug from a bare .select() call.
export async function fetchAllPages(buildQuery) {
  const PAGE_SIZE = 1000;
  let offset = 0, all = [];
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
