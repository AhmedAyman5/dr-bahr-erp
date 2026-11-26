// Runs a function only after the user stopped typing for `delay` ms (e.g. the search box of a paginated list:
// one request after the last key, not one per key).
//
// Usage:
//   const applySearch = useDebouncedCallback((text) => setFilters({ search: text.trim() }), 400);
//   <SearchInput value={searchText} onChange={(text) => { setSearchText(text); applySearch(text); }} />
//   applySearch.cancel();   // forget a call that is still waiting (e.g. "مسح الفلاتر")
//
// Why a debounced CALLBACK and not a debounced value: a value would need an effect that calls setFilters
// when it changes, and setFilters is a new function on every render (an effect loop or an eslint-disable).
// The waiting call is cancelled when the page closes. It always runs the newest version of `callback`.
import { useEffect, useRef, useState } from "react";

function useDebouncedCallback(callback, delay = 400) {
  const callbackRef = useRef(callback);
  const timerRef = useRef(null);

  // Keep the newest callback (it may use the newest state).
  useEffect(() => {
    callbackRef.current = callback;
  });

  // The page closes → a call still waiting never runs.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Created once, so the page gets the same function on every render.
  const [debounced] = useState(() => {
    function run(...args) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }
    run.cancel = () => clearTimeout(timerRef.current);
    return run;
  });

  return debounced;
}

export default useDebouncedCallback;
