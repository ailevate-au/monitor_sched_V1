import React, { useEffect, useState } from "react";
import { AppUserAccount, Project } from "../types";
import { Btn, Card } from "./Dashboard";
import { fetchUsers, createUser, updateUser, deleteUser, CreateUserInput } from "../lib/users";
import { Plus, Pencil, Trash2, Users as UsersIcon } from "lucide-react";

const C = {
  navy: "#0F1F3D", blue: "#1A5FA8", blueLight: "#E6F0FB",
  green: "#1D9E75", greenBg: "#ECFDF5", greenDark: "#2D6A0A",
  amber: "#B87316", amberBg: "#FEF3C7",
  red: "#E04A4A", redDark: "#9B2C2C", redBg: "#FEF2F2",
  gray: "#64748B", grayLight: "#E2E8F0", text: "#1E293B",
  bgSecond: "#EEF2F8", white: "#FFFFFF",
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  Owner: { bg: "#F0EEFF", color: "#4A3DB0" },
  Coordinator: { bg: C.blueLight, color: C.blue },
  Admin: { bg: C.amberBg, color: C.amber },
  PM: { bg: C.greenBg, color: C.greenDark },
};

const RoleBadge = ({ role }: { role: string }) => {
  const c = ROLE_COLORS[role] || { bg: C.bgSecond, color: C.gray };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: c.bg, color: c.color }}>
      {role}
    </span>
  );
};

const emptyForm: CreateUserInput = {
  name: "", email: "", role: "PM", state: "NSW", managedProjectIds: [],
  alsoResource: false, trade: "", rate: 65,
};

export default function ScreenUsers() {
  const [users, setUsers] = useState<AppUserAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AppUserAccount | null>(null);
  const [form, setForm] = useState<CreateUserInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchUsers(), fetch("/api/v1/projects").then(r => r.json())])
      .then(([u, p]) => { setUsers(u); setProjects(Array.isArray(p) ? p : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (u: AppUserAccount) => {
    setEditing(u);
    setForm({
      name: u.name, email: u.email, role: u.role as "Coordinator" | "Admin" | "PM",
      state: u.state || "NSW", managedProjectIds: u.managedProjectIds || [],
      alsoResource: false, trade: "", rate: 65,
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateUser(editing.id, {
          name: form.name, email: form.email, role: form.role,
          state: form.state, managedProjectIds: form.managedProjectIds,
        });
      } else {
        await createUser(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: AppUserAccount) => {
    if (!window.confirm(`Remove ${u.name} (${u.email})? They will no longer be able to sign in.`)) return;
    try {
      await deleteUser(u.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete user.");
    }
  };

  if (loading) return <div style={{ padding: 20, color: C.gray }}>Loading users…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <UsersIcon size={16} /> Accounts
          </div>
          <div style={{ fontSize: 11.5, color: C.gray, marginTop: 4 }}>
            Create and manage Coordinator, Admin and Project Manager sign-ins. The Owner account is fixed.
          </div>
        </div>
        <Btn primary small onClick={openCreate}><Plus size={13} /> New user</Btn>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.bgSecond, textAlign: "left" }}>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}>Name</th>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}>Email</th>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}>Role</th>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}>State</th>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}>Manages</th>
              <th style={{ padding: "10px 14px", fontSize: 11, color: C.gray, fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const managedNames = (u.managedProjectIds || [])
                .map(id => projects.find(p => p.id === id)?.name)
                .filter(Boolean);
              return (
                <tr key={u.id} style={{ borderTop: `0.5px solid ${C.grayLight}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{u.name}</td>
                  <td style={{ padding: "10px 14px", color: C.gray }}>{u.email}</td>
                  <td style={{ padding: "10px 14px" }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: "10px 14px", color: C.gray }}>{u.state || "—"}</td>
                  <td style={{ padding: "10px 14px", color: C.gray }}>
                    {u.role === "PM" ? (managedNames.length ? managedNames.join(", ") : "No projects assigned") : "All projects"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {u.role !== "Owner" && (
                      <>
                        <button onClick={() => openEdit(u)} title="Edit" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: C.blue }}><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(u)} title="Delete" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: C.red }}><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,31,61,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99 }}>
          <div style={{ background: C.white, borderRadius: 12, width: 420, padding: 22, border: `0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>{editing ? "Edit user" : "New user"}</div>

            {error && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: C.redBg, color: C.redDark, border: `1px solid ${C.red}` }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Role *</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}
                  style={{ width: "100%", fontSize: 12, padding: "7px 6px", borderRadius: 6, border: `0.5px solid ${C.grayLight}` }}>
                  <option value="Coordinator">Project Coordinator</option>
                  <option value="Admin">Admin</option>
                  <option value="PM">Project Manager</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>State</label>
                <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
              </div>
            </div>

            {form.role === "PM" && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Manages these projects</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 120, overflowY: "auto", border: `0.5px solid ${C.grayLight}`, borderRadius: 6, padding: 8 }}>
                  {projects.map(p => {
                    const checked = (form.managedProjectIds || []).includes(p.id);
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.text }}>
                        <input type="checkbox" checked={checked} onChange={e => {
                          const ids = new Set(form.managedProjectIds || []);
                          if (e.target.checked) ids.add(p.id); else ids.delete(p.id);
                          setForm({ ...form, managedProjectIds: Array.from(ids) });
                        }} />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {!editing && (
              <div style={{ marginTop: 6, marginBottom: 4, padding: "10px 12px", borderRadius: 8, background: C.bgSecond, border: `0.5px solid ${C.grayLight}` }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: form.alsoResource ? 8 : 0 }}>
                  <input type="checkbox" checked={!!form.alsoResource} onChange={e => setForm({ ...form, alsoResource: e.target.checked })} />
                  Also add as a schedulable resource
                </label>
                {form.alsoResource && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10.5, color: C.gray, display: "block", marginBottom: 3 }}>Trade</label>
                      <input type="text" placeholder="e.g. Site Manager" value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })}
                        style={{ width: "100%", fontSize: 11.5, padding: "6px 8px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: C.gray, display: "block", marginBottom: 3 }}>Rate (A$/hr)</label>
                      <input type="number" value={form.rate} onChange={e => setForm({ ...form, rate: parseInt(e.target.value) || 0 })}
                        style={{ width: "100%", fontSize: 11.5, padding: "6px 8px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn primary onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create user"}</Btn>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
