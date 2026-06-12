import { MasterItem, MastersBundle } from "../types/masters";

export const DEFAULT_MASTERS: MastersBundle = {
  states: [
    { id: "st-nsw", code: "NSW", label: "New South Wales (NSW)", is_active: true, sort_order: 1 },
    { id: "st-vic", code: "VIC", label: "Victoria (VIC)", is_active: true, sort_order: 2 },
    { id: "st-qld", code: "QLD", label: "Queensland (QLD)", is_active: true, sort_order: 3 },
    { id: "st-wa", code: "WA", label: "Western Australia (WA)", is_active: true, sort_order: 4 },
    { id: "st-sa", code: "SA", label: "South Australia (SA)", is_active: true, sort_order: 5 },
    { id: "st-tas", code: "TAS", label: "Tasmania (TAS)", is_active: true, sort_order: 6 },
    { id: "st-act", code: "ACT", label: "Australian Capital Territory (ACT)", is_active: true, sort_order: 7 },
    { id: "st-nt", code: "NT", label: "Northern Territory (NT)", is_active: true, sort_order: 8 },
  ],
  sectors: [
    {
      id: "sec-commercial",
      value: "Commercial building construction",
      label: "Commercial Tower",
      is_active: true,
      sort_order: 1,
    },
    {
      id: "sec-residential",
      value: "Residential multi-storey construction",
      label: "Residential Apartment",
      is_active: true,
      sort_order: 2,
    },
    {
      id: "sec-civil",
      value: "Civil and infrastructure development",
      label: "Civil Highway / Infrastructure",
      is_active: true,
      sort_order: 3,
    },
    {
      id: "sec-mixed",
      value: "Mixed use commercial retail",
      label: "Mixed Use & Retail",
      is_active: true,
      sort_order: 4,
    },
  ],
  trades: [
    { id: "tr-formwork", label: "Formwork Foreman", is_active: true, sort_order: 1 },
    { id: "tr-structural", label: "Structural Foreman", is_active: true, sort_order: 2 },
    { id: "tr-site-mgr", label: "Site Manager", is_active: true, sort_order: 3 },
    { id: "tr-piling", label: "Piling Subcontractor", is_active: true, sort_order: 4 },
    { id: "tr-services", label: "Services Coordinator", is_active: true, sort_order: 5 },
    { id: "tr-interior", label: "Interior Foreman", is_active: true, sort_order: 6 },
    { id: "tr-qs", label: "Quantity Surveyor", is_active: true, sort_order: 7 },
    { id: "tr-hse", label: "HSE Officer", is_active: true, sort_order: 8 },
    { id: "tr-coord", label: "Project Coordinator", is_active: true, sort_order: 9 },
  ],
  companies: [
    { id: "co-direct", label: "Direct Hire", is_active: true, sort_order: 1 },
    { id: "co-lendlease", label: "Lendlease Subbies", is_active: true, sort_order: 2 },
    { id: "co-apex", label: "Apex Foundations Ltd", is_active: true, sort_order: 3 },
    { id: "co-multiplex", label: "Multiplex Hire Ltd", is_active: true, sort_order: 4 },
    { id: "co-elite", label: "Elite Formwork Ltd", is_active: true, sort_order: 5 },
    { id: "co-probuild", label: "Probuild Mechanical Group", is_active: true, sort_order: 6 },
    {
      id: "co-custom",
      label: "Custom / Other Subcontractor...",
      is_active: true,
      sort_order: 99,
      is_system: true,
    },
  ],
};

export function cloneDefaultMasters(): MastersBundle {
  return JSON.parse(JSON.stringify(DEFAULT_MASTERS));
}

export function mergeMasters(partial: Partial<MastersBundle> | undefined): MastersBundle {
  const base = cloneDefaultMasters();
  if (!partial) return base;
  (["states", "sectors", "trades", "companies"] as const).forEach(key => {
    if (Array.isArray(partial[key]) && partial[key]!.length > 0) {
      base[key] = partial[key]!;
    }
  });
  return base;
}
