// A message that hides by itself after a few seconds (the success Alert of the list pages).
//
// Usage:
//   const [successMessage, showSuccess, hideSuccess] = useAutoHideMessage(); // 4 seconds
//   showSuccess("تم حذف الفرع بنجاح");
//   {successMessage && <Alert type="success" onClose={hideSuccess}>{successMessage}</Alert>}
import { useEffect, useState } from "react";

function useAutoHideMessage(ms = 4000) {
  // Kept as an object, not just the text: showing the same text again is a new object,
  // so the timer starts again from zero.
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(timer);
  }, [shown, ms]);

  function show(text) {
    setShown({ text });
  }

  function clear() {
    setShown(null);
  }

  return [shown ? shown.text : "", show, clear];
}

export default useAutoHideMessage;
