import { MasterItem, MasterType, MastersBundle } from "../types/masters";
import { dbInstance } from "./db";

const MASTER_TYPES: MasterType[] = ["states", "sectors", "trades", "companies"];

export function isMasterType(type: string): type is MasterType {
  return MASTER_TYPES.includes(type as MasterType);
}

export function sortedMasters(list: MasterItem[]): MasterItem[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function getMastersBundle(activeOnly = false): MastersBundle {
  const bundle = dbInstance.masters;
  if (!activeOnly) {
    return {
      states: sortedMasters(bundle.states),
      sectors: sortedMasters(bundle.sectors),
      trades: sortedMasters(bundle.trades),
      companies: sortedMasters(bundle.companies),
    };
  }
  const filter = (items: MasterItem[]) => sortedMasters(items.filter(i => i.is_active));
  return {
    states: filter(bundle.states),
    sectors: filter(bundle.sectors),
    trades: filter(bundle.trades),
    companies: filter(bundle.companies),
  };
}

export function getMasterList(type: MasterType, activeOnly = false): MasterItem[] {
  const list = dbInstance.masters[type];
  const filtered = activeOnly ? list.filter(i => i.is_active) : list;
  return sortedMasters(filtered);
}

export function upsertMaster(type: MasterType, payload: {
  id?: string;
  label?: string;
  code?: string;
  value?: string;
}): MasterItem[] {
  const list = dbInstance.masters[type];
  const label = (payload.label || "").trim();
  if (!label) {
    throw new Error("Label is required");
  }

  if (payload.id) {
    const existing = list.find(i => i.id === payload.id);
    if (!existing) throw new Error("Master item not found");
    if (existing.is_system && payload.label !== existing.label) {
      throw new Error("System items cannot be renamed");
    }
    existing.label = label;
    if (type === "states" && payload.code) existing.code = payload.code.trim().toUpperCase();
    if (type === "sectors") {
      existing.value = (payload.value || label).trim();
    }
    dbInstance.save();
    return getMasterList(type);
  }

  const id = `${type.slice(0, 2)}-${Date.now()}`;
  const item: MasterItem = {
    id,
    label,
    is_active: true,
    sort_order: list.length + 1,
  };
  if (type === "states") {
    item.code = (payload.code || label).trim().toUpperCase().slice(0, 3);
  }
  if (type === "sectors") {
    item.value = (payload.value || label).trim();
  }

  list.push(item);
  dbInstance.save();
  return getMasterList(type);
}

export function toggleMaster(type: MasterType, id: string): MasterItem[] {
  const item = dbInstance.masters[type].find(i => i.id === id);
  if (!item) throw new Error("Master item not found");
  if (item.is_system) throw new Error("System items cannot be deactivated");
  item.is_active = !item.is_active;
  dbInstance.save();
  return getMasterList(type);
}
