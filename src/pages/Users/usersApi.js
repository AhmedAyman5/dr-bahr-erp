// All backend calls of the Users page.
// Docs: ../backend/doc/week1/users.txt + FRONTEND_WEEK1_UPDATE_2.txt (PART 1.3 roles, PART 4 errors)
// The API never returns passwords. Passwords are only sent, never logged or stored.
import api from "../../services/api";
import { optionalField } from "../../utils/body";

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
    // Optional: left out on create when empty; null on edit when emptied (null clears / unlinks).
    // email / employeeId are UNIQUE, so "" is never sent.
    email: optionalField(form.email, isEdit),
    employeeId: optionalField(form.employeeId, isEdit),
    branchId: optionalField(form.branchId, isEdit),
  };

  // Create: always filled (required). Edit: only sent when a new password was typed,
  // otherwise the current password stays. Never trimmed: spaces can be part of a password.
  if (form.password) body.password = form.password;

  return body;
}

export async function createUser(form) {
  const response = await api.post("/users", toUserBody(form, false));
  return response.data.data;
}

// The employee / branch links are sent ONLY when they were changed in the form (initialForm =
// the form's starting values). A linked employee deleted later would otherwise be sent again
// and rejected (400 DOES_NOT_EXIST), so such a user could never be saved unchanged.
export async function updateUser(id, form, initialForm) {
  const body = toUserBody(form, true);
  if (form.employeeId === initialForm.employeeId) delete body.employeeId;
  if (form.branchId === initialForm.branchId) delete body.branchId;

  const response = await api.patch(`/users/${id}`, body);
  return response.data.data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}
