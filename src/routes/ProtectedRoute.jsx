// Shows its children only when the user is logged in; otherwise goes to /login.
import { Navigate } from "react-router-dom";
import { isLoggedIn } from "../services/session";

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
