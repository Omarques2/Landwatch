// apps/web/src/features/admin/api/customers.ts
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
};

export type CreateCustomerPayload = {
  code: string;
  name: string;
  status?: "active" | "inactive";
};

export type UpdateCustomerPayload = {
  code?: string;
  name?: string;
};

export async function listCustomers() {
  const res = await http.get("/admin/customers");
  return unwrapData(res.data as ApiEnvelope<CustomerRow[]>);
}

export async function createCustomer(payload: CreateCustomerPayload) {
  const res = await http.post("/admin/customers", payload);
  return unwrapData(res.data as ApiEnvelope<CustomerRow>);
}

export async function updateCustomer(customerId: string, payload: UpdateCustomerPayload) {
  const res = await http.put(`/admin/customers/${customerId}`, payload);
  return unwrapData(res.data as ApiEnvelope<{ ok: boolean; customer: CustomerRow }>);
}

export async function setCustomerStatus(customerId: string, status: "active" | "inactive") {
  const res = await http.post(`/admin/customers/${customerId}/status`, { status });
  return unwrapData(
    res.data as ApiEnvelope<{
      ok: boolean;
      status: string;
      workspacesDeactivated?: number;
      reportsDeactivated?: number;
    }>,
  );
}

export type CustomerSummary = {
  customer: { id: string; code: string; name: string; status: string };
  users: { total: number; active: number; pending: number; disabled: number };
  workspacesActive: number;
  reportsActive: number;
  pageGroupsActive: number;
};

export async function getCustomerSummary(customerId: string) {
  const res = await http.get(`/admin/customers/${customerId}/summary`);
  return unwrapData(res.data as ApiEnvelope<CustomerSummary>);
}
