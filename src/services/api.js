// The ONLY axios instance in the app. Page API files import it:
//   import api from "../../services/api";
import axios from "axios";
import { clearSession, getToken } from "./session";

const LOGIN_URL = "/auth/login";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});

// Add the token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 = the session is no longer valid → log out and go to the login page.
// The login request itself is skipped: there a 401 means "wrong username/password".
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url === LOGIN_URL;

    if (status === 401 && !isLoginRequest) {
      clearSession();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default api;
