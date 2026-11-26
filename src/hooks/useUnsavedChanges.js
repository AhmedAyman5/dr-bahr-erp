// Protects a FULL-PAGE form (e.g. a document form with many lines) from losing typed data.
// (Forms inside a Modal don't need it: Modal has its own "تجاهل التغييرات" check.)
//
// While `dirty` is true:
// - an in-app navigation (Sidebar link, a link on the page, the browser's back button) is held and
//   <UnsavedChangesDialog> asks "تجاهل التغييرات" (leave) or "البقاء في الصفحة" (stay);
// - refreshing / closing the tab shows the browser's own "Leave site?" prompt (beforeunload).
// Never blocked: logout (a navigation to /login: the Header asks its own confirmation first) and a navigation
// that stays on the same page (search params, clearing the router state).
//
// Usage:
//   const guard = useUnsavedChanges(isDirty);
//   ...after a successful save (leave WITHOUT asking):
//   guard.allowNavigation();
//   navigate(`/purchase-quotations/${saved.id}`, { state: { successMessage: "تم حفظ التعديلات" } });
//   ...
//   <UnsavedChangesDialog guard={guard} />
//
// Needs the data router (createBrowserRouter in routes/AppRoutes.jsx): useBlocker does not work without it.
import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

function useUnsavedChanges(dirty) {
  // Set by allowNavigation() right before a navigate() call. A ref (not state): the navigation happens in the
  // same click, before React renders again, so the check below must already see it.
  const allowedRef = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allowedRef.current &&
      nextLocation.pathname !== currentLocation.pathname &&
      nextLocation.pathname !== "/login",
  );

  // Refresh / close the tab / type another address: the browser asks by itself.
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event) {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  return {
    blocked: blocker.state === "blocked",
    // "البقاء في الصفحة": cancel the navigation.
    stay: () => blocker.reset?.(),
    // "تجاهل التغييرات": go where the user wanted.
    leave: () => blocker.proceed?.(),
    allowNavigation: () => {
      allowedRef.current = true;
    },
  };
}

export default useUnsavedChanges;
