// A success message sent by ANOTHER page through the router state, e.g. after saving a document form:
//   navigate(`/purchase-quotations/${id}`, { state: { successMessage: "تم حفظ التعديلات" } });
//
// The page that opens reads it once and shows it like useAutoHideMessage (hides after 4 seconds). The state is
// then removed from the browser history (a replace on the same address), so a refresh or coming back with the
// browser's buttons does not show it again.
//
// Usage (same return value as useAutoHideMessage, so the page can also show its own messages):
//   const [successMessage, showSuccessMessage, hideSuccessMessage] = useRouteMessage();
//   {successMessage && <Alert type="success" onClose={hideSuccessMessage}>{successMessage}</Alert>}
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAutoHideMessage from "./useAutoHideMessage";

function useRouteMessage() {
  const location = useLocation();
  const navigate = useNavigate();
  const message = location.state?.successMessage ?? "";
  // The message of the FIRST render starts the hiding timer (useAutoHideMessage reads it once).
  const result = useAutoHideMessage(4000, message);

  // Remove it from the history entry right away (same address, no new history entry).
  useEffect(() => {
    if (message) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
  }, [message, location.pathname, location.search, navigate]);

  return result;
}

export default useRouteMessage;
