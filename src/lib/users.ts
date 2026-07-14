import { AppUserAccount } from "../types";
import { api } from "./api";

interface MutationResponse {
  success?: boolean;
  error?: string;
  user?: AppUserAccount;
}

export async function fetchUsers(): Promise<AppUserAccount[]> {
  const data = await api.get<AppUserAccount[]>("/users");
  if (!Array.isArray(data)) throw new Error("Could not load users.");
  return data;
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
  const data = await api.post<MutationResponse>("/users", input);
  if (!data?.success || !data.user) throw new Error(data?.error || "Could not create user.");
  return data.user;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: "Coordinator" | "Admin" | "PM";
  state?: string;
  managedProjectIds?: string[];
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AppUserAccount> {
  const data = await api.put<MutationResponse>(`/users/${id}`, input);
  if (!data?.success || !data.user) throw new Error(data?.error || "Could not update user.");
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  const data = await api.del<MutationResponse>(`/users/${id}`);
  if (!data?.success) throw new Error(data?.error || "Could not delete user.");
}
