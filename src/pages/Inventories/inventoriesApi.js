// All backend calls of the Inventories (warehouses) page.
// Docs: ../backend/doc/week1/inventory.txt
import api from "../../services/api";

// Only the documented fields. branchId goes in the URL (create only), never in the body.
function toInventoryBody(form) {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
  };
}

export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

// Branches: for the branch names in the table, the filter and the form Select.
export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

export async function createInventory(branchId, form) {
  const response = await api.post(`/inventory/branch/${branchId}`, toInventoryBody(form));
  return response.data.data;
}

// The branch of a warehouse cannot be changed: only name and address are sent.
export async function updateInventory(id, form) {
  const response = await api.patch(`/inventory/${id}`, toInventoryBody(form));
  return response.data.data;
}

export async function deleteInventory(id) {
  await api.delete(`/inventory/${id}`);
}
