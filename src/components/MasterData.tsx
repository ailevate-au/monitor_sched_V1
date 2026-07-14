import React, { useState, useEffect, useCallback } from "react";
import ProgrammeSettingsPanel from "./ProgrammeSettingsPanel";
import {
  MasterItem,
  MasterType,
  MasterTabId,
  MASTER_TAB_META,
} from "../types/masters";
import { DollarSign, Map, Building2, Hammer, Building } from "lucide-react";
import { C } from "../lib/theme";
import { api } from "../lib/api";


type TabCounts = Record<MasterTabId, { active: number; total: number }>;

const TABS: { id: MasterTabId; icon: React.ReactNode }[] = [
  { id: "cost_categories", icon: <DollarSign size={14} /> },
  { id: "states", icon: <Map size={14} /> },
  { id: "sectors", icon: <Building2 size={14} /> },
  { id: "trades", icon: <Hammer size={14} /> },
  { id: "companies", icon: <Building size={14} /> },
];

function CostCategoriesPanel({ onRegistryChange }: { onRegistryChange?: () => void }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCategories = useCallback(() => {
    setLoading(true);
    api.get("/cost_categories")
      .then(data => {
        setCategories(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    api.post("/cost_categories", { name: newName.trim() })
      .then(data => {
        setCategories(data);
        setNewName("");
        onRegistryChange?.();
      })
      .catch(() => setErrorMsg("Could not add category."));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingName.trim()) return;
    api.post("/cost_categories", { id: editingId, name: editingName.trim() })
      .then(data => {
        setCategories(data);
        setEditingId(null);
        setEditingName("");
        onRegistryChange?.();
      })
      .catch(() => setErrorMsg("Could not edit category."));
  };

  const closeEditModal = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleToggle = (id: string) => {
    api.post(`/cost_categories/${id}/toggle`)
      .then(data => {
        setCategories(data);
        onRegistryChange?.();
      })
      .catch(() => setErrorMsg("Could not toggle category."));
  };

  return (
    <div>
      {errorMsg && (
        <div style={{ background: C.redBg, color: C.red, padding: "8px 12px", fontSize: 12, borderRadius: 8, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 1.5fr)", gap: 20 }}>
        <div style={{ background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 12px 0" }}>Add category</h3>
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Scaffolding Hire"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
            />
            <button
              type="submit"
              style={{ background: C.blue, color: C.white, border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Add category
            </button>
          </form>
        </div>
        <MasterTable
          loading={loading}
          columns={["ID", "Name", "Status", "Actions"]}
          rows={categories.map(cat => ({
            id: cat.id,
            cells: [
              cat.id,
              <span style={{ textDecoration: cat.is_active ? "none" : "line-through", color: cat.is_active ? C.text : C.gray }}>{cat.name}</span>,
              <StatusPill active={cat.is_active} />,
              <ActionButtons
                isSystem={false}
                isActive={cat.is_active}
                onEdit={() => {
                  setEditingId(cat.id);
                  setEditingName(cat.name);
                }}
                onToggle={() => handleToggle(cat.id)}
              />,
            ],
          }))}
        />
      </div>
      {editingId && (
        <Modal title="Edit category" onClose={closeEditModal}>
          <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              placeholder="Category name"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closeEditModal} style={{ border: `1px solid ${C.grayLight}`, background: C.white, color: C.gray, padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" style={{ border: "none", background: C.green, color: C.white, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 10,
        borderRadius: 12,
        fontWeight: 700,
        background: active ? C.greenBg : C.redBg,
        color: active ? C.greenDark : C.red,
      }}
    >
      {active ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}

function ActionButtons({
  isSystem,
  isActive,
  onEdit,
  onToggle,
  hideEdit,
}: {
  isSystem?: boolean;
  isActive: boolean;
  onEdit: () => void;
  onToggle: () => void;
  hideEdit?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      {!hideEdit && !isSystem && (
        <button type="button" onClick={onEdit} style={{ border: "none", background: "none", color: C.blue, cursor: "pointer", fontSize: 11.5 }}>
          Edit
        </button>
      )}
      {!isSystem && (
        <button
          type="button"
          onClick={onToggle}
          style={{ border: "none", background: "none", color: isActive ? C.red : C.green, cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}
        >
          {isActive ? "Deactivate" : "Activate"}
        </button>
      )}
      {isSystem && <span style={{ fontSize: 10, color: C.gray }}>System</span>}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: C.white,
          borderRadius: 12,
          border: `1px solid ${C.grayLight}`,
          boxShadow: "0 18px 44px rgba(15, 31, 61, 0.24)",
          padding: 18,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: C.navy, fontWeight: 700 }}>{title}</h4>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "#F8FAFC",
              color: C.gray,
              cursor: "pointer",
              width: 24,
              height: 24,
              borderRadius: 999,
              fontSize: 16,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MasterTable({
  loading,
  columns,
  rows,
}: {
  loading: boolean;
  columns: string[];
  rows: Array<{ id: string; cells: React.ReactNode[] }>;
}) {
  return (
    <div style={{ background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 12, padding: 16 }}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 20, fontSize: 12, color: C.gray }}>Loading...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {columns.map(h => (
                <th key={h} style={{ textAlign: h === "Actions" ? "right" : "left", padding: "8px 10px", color: C.gray, fontWeight: 600, borderBottom: `1px solid ${C.grayLight}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 16, textAlign: "center", color: C.gray }}>
                  No items yet.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} style={{ borderBottom: `0.5px solid ${C.grayLight}` }}>
                  {row.cells.map((cell, i) => (
                    <td key={i} style={{ padding: "10px", textAlign: columns[i] === "Actions" ? "right" : "left" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MasterListPanel({ type, onRegistryChange }: { type: MasterType; onRegistryChange?: () => void }) {
  const meta = MASTER_TAB_META[type];
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editValue, setEditValue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/masters/${type}`)
      .then(data => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const saveItem = (body: Record<string, string | undefined>) => {
    setErrorMsg(null);
    return api.post(`/masters/${type}`, body)
      .then(data => {
        if (data?.error) throw new Error(data.error || "Save failed");
        setItems(data);
        onRegistryChange?.();
      })
      .catch(err => setErrorMsg(err.message || "Could not save"));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    saveItem({ label, code: type === "states" ? code : undefined, value: type === "sectors" ? value || label : undefined }).then(() => {
      setLabel("");
      setCode("");
      setValue("");
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    saveItem({
      id: editingId,
      label: editLabel,
      code: type === "states" ? editCode : undefined,
      value: type === "sectors" ? editValue || editLabel : undefined,
    }).then(() => {
      setEditingId(null);
      setEditLabel("");
      setEditCode("");
      setEditValue("");
    });
  };

  const closeEditModal = () => {
    setEditingId(null);
    setEditLabel("");
    setEditCode("");
    setEditValue("");
  };

  const handleToggle = (id: string) => {
    api.post(`/masters/${type}/${id}/toggle`)
      .then(data => {
        if (data?.error) throw new Error(data.error);
        setItems(data);
        onRegistryChange?.();
      })
      .catch(err => setErrorMsg(err.message || "Could not toggle"));
  };

  const extraCol = type === "states" ? "Code" : type === "sectors" ? "Stored value" : null;
  const columns = extraCol ? ["ID", extraCol, "Label", "Status", "Actions"] : ["ID", "Label", "Status", "Actions"];

  return (
    <div>
      {errorMsg && (
        <div style={{ background: C.redBg, color: C.red, padding: "8px 12px", fontSize: 12, borderRadius: 8, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 1.5fr)", gap: 20 }}>
        <div style={{ background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "0 0 8px 0" }}>Add {meta.title.toLowerCase()}</h3>
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {type === "states" && (
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Code e.g. NSW"
                maxLength={3}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
              />
            )}
            {type === "sectors" && (
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Stored value (optional)"
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
              />
            )}
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Display label"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
            />
            <button
              type="submit"
              style={{ background: C.blue, color: C.white, border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Add item
            </button>
          </form>
        </div>
        <MasterTable
          loading={loading}
          columns={columns}
          rows={items.map(item => {
            const labelCell = <span style={{ textDecoration: item.is_active ? "none" : "line-through", color: item.is_active ? C.text : C.gray }}>{item.label}</span>;

            const cells: React.ReactNode[] = [item.id];
            if (type === "states") cells.push(item.code || "—");
            if (type === "sectors") cells.push(<span style={{ fontSize: 11, color: C.gray }}>{item.value || item.label}</span>);
            cells.push(labelCell);
            cells.push(<StatusPill active={item.is_active} />);
            cells.push(
              <ActionButtons
                isSystem={item.is_system}
                isActive={item.is_active}
                onEdit={() => {
                  setEditingId(item.id);
                  setEditLabel(item.label);
                  setEditCode(item.code || "");
                  setEditValue(item.value || "");
                }}
                onToggle={() => handleToggle(item.id)}
              />
            );
            return { id: item.id, cells };
          })}
        />
      </div>
      {editingId && (
        <Modal title={`Edit ${meta.title.toLowerCase()}`} onClose={closeEditModal}>
          <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {type === "states" && (
              <input
                value={editCode}
                onChange={e => setEditCode(e.target.value.toUpperCase())}
                placeholder="Code"
                maxLength={3}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
              />
            )}
            {type === "sectors" && (
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="Stored value"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
              />
            )}
            <input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              placeholder="Display label"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.grayLight}`, fontSize: 12 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closeEditModal} style={{ border: `1px solid ${C.grayLight}`, background: C.white, color: C.gray, padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" style={{ border: "none", background: C.green, color: C.white, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function countItems(items: { is_active?: boolean }[]) {
  return {
    active: items.filter(i => i.is_active !== false).length,
    total: items.length,
  };
}

export default function ScreenMasterData({ initialTab = "cost_categories" }: { initialTab?: MasterTabId }) {
  const [activeTab, setActiveTab] = useState<MasterTabId>(initialTab);
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const meta = MASTER_TAB_META[activeTab];

  const loadTabCounts = useCallback(() => {
    Promise.all([
      api.get("/masters"),
      api.get("/cost_categories"),
    ])
      .then(([masters, categories]) => {
        setTabCounts({
          cost_categories: countItems(Array.isArray(categories) ? categories : []),
          states: countItems(masters.states || []),
          sectors: countItems(masters.sectors || []),
          trades: countItems(masters.trades || []),
          companies: countItems(masters.companies || []),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    loadTabCounts();
  }, [loadTabCounts, activeTab]);

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: "0 0 6px 0" }}>Settings — Dropdown Lists</h2>
        <p style={{ fontSize: 12.5, color: C.gray, margin: 0, lineHeight: 1.5 }}>
          Set the dropdown choices used across projects, resources, and finance. Changes show up straight away on new forms; anything you've already saved keeps its current values.
        </p>
      </div>

      <ProgrammeSettingsPanel />

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: C.white,
            border: `0.5px solid ${C.grayLight}`,
            borderRadius: 12,
            padding: 8,
          }}
        >
          {TABS.map(tab => {
            const m = MASTER_TAB_META[tab.id];
            const selected = activeTab === tab.id;
            const counts = tabCounts?.[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  marginBottom: 2,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: selected ? 600 : 400,
                  color: selected ? C.blue : C.gray,
                  background: selected ? C.blueLight : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>{tab.icon}</span>
                <span style={{ flex: 1, lineHeight: 1.3 }}>{m.title}</span>
                {counts !== undefined && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 10,
                      background: selected ? C.white : "#E2E8F0",
                      color: selected ? C.blue : C.gray,
                      flexShrink: 0,
                    }}
                    title={`${counts.active} active / ${counts.total} total`}
                  >
                    {counts.active}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: "0 0 4px 0" }}>{meta.title}</h3>
            <p style={{ fontSize: 12, color: C.gray, margin: 0 }}>{meta.description}</p>
            <p style={{ fontSize: 11, color: C.amber, margin: "6px 0 0 0", fontWeight: 500 }}>Used in: {meta.usedIn}</p>
          </div>

          {activeTab === "cost_categories" && <CostCategoriesPanel onRegistryChange={loadTabCounts} />}
          {activeTab === "states" && <MasterListPanel type="states" onRegistryChange={loadTabCounts} />}
          {activeTab === "sectors" && <MasterListPanel type="sectors" onRegistryChange={loadTabCounts} />}
          {activeTab === "trades" && <MasterListPanel type="trades" onRegistryChange={loadTabCounts} />}
          {activeTab === "companies" && <MasterListPanel type="companies" onRegistryChange={loadTabCounts} />}
        </div>
      </div>
    </div>
  );
}
