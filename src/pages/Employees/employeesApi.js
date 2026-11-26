// All backend calls of the Employees page.
// Docs: ../backend/doc/week1/employees.txt
import api from "../../services/api";
import { optionalField } from "../../utils/body";

export async function getEmployees() {
  const response = await api.get("/employees");
  return response.data.data;
}

// Branches: for the branch names in the table, the filter and the form Select.
export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// Only the documented fields. branchId goes in the URL (create only), never in the body.
// Optional fields: left out on create when empty; null on edit when emptied (null clears them).
// nationalId is UNIQUE, so it is never sent as "" (many employees can have none).
function toEmployeeBody(form, isEdit) {
  return {
    fullName: form.fullName.trim(),
    nationalId: optionalField(form.nationalId, isEdit),
    jobTitle: optionalField(form.jobTitle, isEdit),
    // hireDate comes from DateInput as "YYYY-MM-DD".
    hireDate: optionalField(form.hireDate, isEdit),
  };
}

export async function createEmployee(branchId, form) {
  const response = await api.post(`/employees/branch/${branchId}`, toEmployeeBody(form, false));
  return response.data.data;
}

// The branch of an employee cannot be changed: branchId is never sent.
export async function updateEmployee(id, form) {
  const response = await api.patch(`/employees/${id}`, toEmployeeBody(form, true));
  return response.data.data;
}

export async function deleteEmployee(id) {
  await api.delete(`/employees/${id}`);
}
