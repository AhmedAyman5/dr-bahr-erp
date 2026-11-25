// Loads ONE page of a paginated Week 2 list (documents, stock movements) and keeps it on screen.
// Built on useLoadData: the same loading / error / reload / refresh behaviour (see useLoadData.js).
//
// Usage:
//   // <page>Api.js — receives { page, pageSize, ...filters } (empty filters already removed) and
//   // returns data = { items, meta }. Name the params explicitly: unknown params → 400.
//   export async function getPurchaseInvoices({ page, pageSize, status, supplierId }) {
//     const response = await api.get("/purchase-invoices", { params: { page, pageSize, status, supplierId } });
//     return response.data.data;
//   }
//
//   // <Page>.jsx — the filters the page uses, with their starting values ("" = all).
//   const { items, meta, filters, loading, error, refreshError, reload, refresh, setPage, setPageSize, setFilters } =
//     usePaginatedData(getPurchaseInvoices, { status: "", supplierId: "" });
//   <Select value={filters.status} onChange={(event) => setFilters({ status: event.target.value })} ... />
//   <DataTable rows={items} ... />
//   <Pagination meta={meta} onPageChange={setPage} onPageSizeChange={setPageSize} />
//
// What the page gets (besides what useLoadData gives):
// - items, meta       the rows of this page + { page, pageSize, total, totalPages }
// - filters           the current filter values (for the filter inputs)
// - setPage(n)        loads page n
// - setPageSize(n)    20 / 50 / 100 → back to page 1
// - setFilters(obj)   MERGES the changes into the filters → back to page 1
//                     (setFilters({ status: "POSTED" }) keeps the other filters)
// - refresh()         silent, after post / cancel / delete: the same page loads again with the table on screen.
//                     If that page no longer exists (its last row was deleted), the last page is loaded.
import { useState } from "react";
import useLoadData from "./useLoadData";

const DEFAULT_PAGE_SIZE = 20;

// { status: "", supplierId: "s1" } → { supplierId: "s1" }: an empty filter means "all" and is not sent
// (the API answers 400 to an empty value).
function removeEmptyFilters(filters) {
  const result = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value !== null && value !== undefined) result[key] = value;
  }
  return result;
}

function usePaginatedData(loadPage, initialFilters = {}) {
  const [query, setQuery] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, filters: initialFilters });
  const params = { page: query.page, pageSize: query.pageSize, ...removeEmptyFilters(query.filters) };

  // A new page, page size or filter = new params → a new (visible) load.
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(
    () => loadPage(params),
    [JSON.stringify(params)],
  );

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 };

  // The current page no longer exists (e.g. a refresh after deleting its last row): go to the last page.
  // Setting state while rendering is fine here: it only happens once, when the condition is true.
  const lastPage = Math.max(data?.meta?.totalPages ?? 1, 1);
  if (!loading && !error && data && query.page > lastPage) {
    setQuery({ ...query, page: lastPage });
  }

  function setPage(page) {
    setQuery((old) => ({ ...old, page }));
  }

  function setPageSize(pageSize) {
    setQuery((old) => ({ ...old, page: 1, pageSize }));
  }

  function setFilters(changes) {
    setQuery((old) => ({ ...old, page: 1, filters: { ...old.filters, ...changes } }));
  }

  return {
    items,
    meta,
    filters: query.filters,
    loading,
    error,
    refreshError,
    reload,
    refresh,
    setPage,
    setPageSize,
    setFilters,
  };
}

export default usePaginatedData;
