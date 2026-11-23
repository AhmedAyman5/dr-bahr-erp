// The ONLY file that reads/writes the session in localStorage.
// user = { id, username, role } (from the login response).

const TOKEN_KEY = "drbahr_token";
const USER_KEY = "drbahr_user";

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const saved = localStorage.getItem(USER_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

// ---- Keeping the Header in sync ----
// When the logged-in user edits their own account (Users page), the stored user is updated
// and every listener (the Header) is told to read it again.
const USER_CHANGED_EVENT = "drbahr:user-changed";

// changes = e.g. { username: "new.name", role: "SUPERADMIN" }. The token stays the same.
export function updateSessionUser(changes) {
  const user = getUser();
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, ...changes }));
  window.dispatchEvent(new Event(USER_CHANGED_EVENT));
}

// Calls `callback` every time updateSessionUser runs. Returns a function that stops listening
// (so it can be returned directly from a useEffect).
export function onSessionUserChange(callback) {
  window.addEventListener(USER_CHANGED_EVENT, callback);
  return () => window.removeEventListener(USER_CHANGED_EVENT, callback);
}
