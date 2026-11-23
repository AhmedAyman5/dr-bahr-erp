import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import logo from "../../assets/logo.png";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { saveSession } from "../../services/session";
import { getErrorMessage } from "../../utils/errors";
import { login } from "./loginApi";

const EMPTY_FORM = { username: "", password: "" };

function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!form.username.trim()) errors.username = "اسم المستخدم مطلوب";
    if (!form.password) errors.password = "كلمة المرور مطلوبة";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await login(form);
      saveSession(data.access_token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, { context: "login" }));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={logo} alt="د. بحر" className="h-16 w-16 object-contain" />
          <h1 className="text-xl font-bold text-slate-900">تسجيل الدخول</h1>
          <p className="text-sm text-slate-500">نظام د. بحر لإدارة الموارد</p>
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="اسم المستخدم"
            name="username"
            value={form.username}
            onChange={handleChange}
            error={fieldErrors.username}
            autoComplete="username"
            autoFocus
            required
          />
          <Input
            label="كلمة المرور"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            error={fieldErrors.password}
            autoComplete="current-password"
            required
          />

          <Button type="submit" loading={loading} className="w-full">
            {!loading && <LogIn size={18} />}
            {loading ? "جارٍ تسجيل الدخول..." : "دخول"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default Login;
