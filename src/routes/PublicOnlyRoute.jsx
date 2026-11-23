// Shows its children only for logged-out users (e.g. the login page); otherwise goes to /.
import { Navigate } from "react-router-dom";
import { isLoggedIn } from "../services/session";

function PublicOnlyRoute({ children }) {
  if (isLoggedIn()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default PublicOnlyRoute;
