import api from "../../services/api";

// POST /auth/login → data = { access_token, user: { id, username, role } }
export async function login(form) {
  const response = await api.post("/auth/login", {
    username: form.username.trim(),
    password: form.password,
  });
  return response.data.data;
}
