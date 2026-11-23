// All backend calls of the Employees page.
// Docs: ../backend/doc/week1/employees.txt + FRONTEND_WEEK1_UPDATE_2.txt (PART 3)
import api from "../../services/api";

export async function getEmployees() {
  const response = await api.get("/employees");
  return response.data.data;
}

// Branches: for the branch names in the table, the filter and the form Select.
export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// Only the documented fields. branchId goes in the URL, never in the body.
// Empty optional fields are left out, so the employee is saved without them.
export async function createEmployee(branchId, form) {
  const body = { fullName: form.fullName.trim() };

  // nationalId is UNIQUE: "" would clash between two employees, so an empty one is left out.
  const nationalId = form.nationalId.trim();
  if (nationalId) body.nationalId = nationalId;

  const jobTitle = form.jobTitle.trim();
  if (jobTitle) body.jobTitle = jobTitle;

  // hireDate comes from <input type="date"> as "YYYY-MM-DD".
  if (form.hireDate) body.hireDate = form.hireDate;

  const response = await api.post(`/employees/branch/${branchId}`, body);
  return response.data.data;
}

// The branch of an employee cannot be changed: branchId is never sent.
export async function updateEmployee(id, form) {
  const body = {
    fullName: form.fullName.trim(),
    // nationalId is UNIQUE: send null (not "") when emptied, so many employees can have none.
    nationalId: form.nationalId.trim() || null,
    jobTitle: form.jobTitle.trim(), // "" when emptied — undefined would keep the old value
  };

  // The backend cannot clear a saved hireDate (it ignores empty values), so it is only
  // sent when filled. The form blocks emptying a saved date.
  if (form.hireDate) body.hireDate = form.hireDate;

  const response = await api.patch(`/employees/${id}`, body);
  return response.data.data;
}

export async function deleteEmployee(id) {
  await api.delete(`/employees/${id}`);
}
