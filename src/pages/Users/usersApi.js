// All backend calls of the Users page.
// Docs: ../backend/doc/week1/users.txt + FRONTEND_WEEK1_UPDATE_2.txt (PART 1.3 roles, PART 4 errors)
// The API never returns passwords. Passwords are only sent, never logged or stored.
import api from "../../services/api";

export async function getUsers() {
  const response = await api.get("/users");
  return response.data.data;
}

// Employees: for the employee names in the table and the employee Select of the form.
export async function getEmployees() {
  const response = await api.get("/employees");
  return response.data.data;
}

// Branches: for the branch names in the table, the filter and the branch Select of the form.
export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// Only the documented fields: never id, lastLoginDate, timestamps or the confirm-password field.
// The form already sets branchId to the selected employee's branch.
function toUserBody(form, isEdit) {
  const body = {
    username: form.username.trim(),
    role: form.role,
  };

  // Create: always filled (required). Edit: only sent when a new password was typed,
  // otherwise the current password stays. Never trimmed: spaces can be part of a password.
  if (form.password) body.password = form.password;

  // Optional fields. email / employeeId are UNIQUE and email is validated by the backend,
  // so "" is never sent: create → left out when empty, edit → null clears the saved value.
  const optional = {
    email: form.email.trim(),
    employeeId: form.employeeId,
    branchId: form.branchId,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) {
      body[key] = value;
    } else if (isEdit) {
      body[key] = null;
    }
  }

  return body;
}

export async function createUser(form) {
  const response = await api.post("/users", toUserBody(form, false));
  return response.data.data;
}

export async function updateUser(id, form) {
  const response = await api.patch(`/users/${id}`, toUserBody(form, true));
  return response.data.data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}
