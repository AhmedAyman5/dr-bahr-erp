// Loads a page's data from the API and keeps it on screen. Used by every list page.
//
// Usage:
//   const { data, loading, error, refreshError, reload, refresh } = useLoadData(getBranches);
//   const branches = data ?? []; // data is null until the first answer
//
//   // Several lists at once: load them together and return one object.
//   async function loadPageData() {
//     const [inventories, branches] = await Promise.all([getInventories(), getBranches()]);
//     return { inventories, branches };
//   }
//   const { data } = useLoadData(loadPageData);
//
//   // Load again whenever a value changes (deps = simple values: strings / numbers).
//   useLoadData(async () => (inventoryId ? getStock(inventoryId) : []), [inventoryId]);
//
// What the page gets:
// - loading       true until the answer arrives (first load, reload(), a deps change) → <LoadingState />
// - error         Arabic message when that load failed → <ErrorState onRetry={reload} />
// - reload()      loads again and shows LoadingState (the retry button).
// - refresh()     loads again SILENTLY: the table stays on screen while waiting (after add / edit /
//                 delete). If it fails, the old data stays and refreshError has the message
//                 → show it in an <Alert type="error">.
// - setData(value) puts a value you already have on screen, without loading (e.g. the record an action like
//                 "إرسال" returned): no LoadingState, no flash. A request still running is ignored.
// Only the answer of the newest request is used: an older, slower answer is ignored.
import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../utils/errors";

// Runs loadFn and passes its answer to onDone(data) or onFail(message), but only when no newer
// request started in the meantime. `counter` is a ref holding the number of the newest request.
async function runLatest(counter, loadFn, onDone, onFail) {
  counter.current += 1;
  const requestNumber = counter.current;
  try {
    const data = await loadFn();
    if (requestNumber === counter.current) onDone(data);
  } catch (err) {
    if (requestNumber === counter.current) onFail(getErrorMessage(err));
  }
}

function useLoadData(loadFn, deps = []) {
  // reload() adds 1 here, which starts a new (visible) load in the effect below.
  const [reloadCount, setReloadCount] = useState(0);
  // Names the data that should be on screen now: it changes with the deps and with reload().
  const requestKey = JSON.stringify([deps, reloadCount]);

  // The last answer and the requestKey it belongs to.
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const [refreshError, setRefreshError] = useState("");

  // Still waiting for the answer of the current requestKey → loading.
  const loading = result.key !== requestKey;
  const error = loading ? "" : result.error;

  const latestRequest = useRef(0);

  // loadFn is a new function on every render. The effect below must run only when requestKey
  // changes (not on every render), so it reads the newest loadFn from this ref.
  const loadFnRef = useRef(loadFn);
  useEffect(() => {
    loadFnRef.current = loadFn;
  });

  // First load, every deps change and every reload().
  useEffect(() => {
    runLatest(
      latestRequest,
      loadFnRef.current,
      (data) => {
        setResult({ key: requestKey, data, error: "" });
        setRefreshError("");
      },
      // Keep the old data; the page shows ErrorState instead of it.
      (message) => setResult((old) => ({ key: requestKey, data: old.data, error: message })),
    );
  }, [requestKey]);

  function reload() {
    setRefreshError("");
    setReloadCount((count) => count + 1);
  }

  function refresh() {
    // Nothing is on screen yet (first load still running or failed): a normal load instead.
    if (loading || error) {
      reload();
      return;
    }
    runLatest(
      latestRequest,
      loadFn,
      (data) => {
        setResult({ key: requestKey, data, error: "" });
        setRefreshError("");
      },
      (message) => setRefreshError(`تعذر تحديث البيانات: ${message}`),
    );
  }

  function setData(data) {
    // A load that is still running must not overwrite this newer value.
    latestRequest.current += 1;
    setResult({ key: requestKey, data, error: "" });
    setRefreshError("");
  }

  return { data: result.data, loading, error, refreshError, reload, refresh, setData };
}

export default useLoadData;
