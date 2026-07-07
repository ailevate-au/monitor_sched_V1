import { AppUserAccount } from "../types";

const BASE = "/api/v1/users";

export async function fetchUsers(): Promise<AppUserAccount[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error("Could not load users.");
  return (await res.json()) as AppUserAccount[];
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: "Coordinator" | "Admin" | "PM";
  state?: string;
  managedProjectIds?: string[];
  alsoResource?: boolean;
  trade?: string;
  rate?: number;
}

export async function createUser(input: CreateUserInput): Promise<AppUserAccount> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Could not create user.");
  return data.user as AppUserAccount;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: "Coordinator" | "Admin" | "PM";
  state?: string;
  managedProjectIds?: string[];
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AppUserAccount> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Could not update user.");
  return data.user as AppUserAccount;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Could not delete user.");
}
