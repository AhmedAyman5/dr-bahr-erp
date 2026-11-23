// Top bar: logged-in username + logout (the only logout button in the app).
import { useNavigate } from "react-router-dom";
import { LogOut, UserCircle } from "lucide-react";
import { clearSession, getUser } from "../../services/session";
import Button from "../ui/Button";

function Header() {
  const navigate = useNavigate();
  const user = getUser();

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-2 text-slate-700">
        <UserCircle size={24} className="text-slate-400" />
        <span className="text-sm font-medium">{user?.username}</span>
      </div>

      <Button variant="ghost" onClick={handleLogout}>
        <LogOut size={18} />
        تسجيل الخروج
      </Button>
    </header>
  );
}

export default Header;
