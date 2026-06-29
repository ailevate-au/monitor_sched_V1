export type MasterType = "states" | "sectors" | "trades" | "companies";

export type MasterTabId = MasterType | "cost_categories";

/** Optional intent passed alongside a navigation, e.g. pre-filtering a screen. */
export interface NavOptions {
  /** When navigating to the Gantt, seed its status filter (e.g. "problems", "conflict"). */
  ganttStatus?: string;
  /** When navigating to the Gantt, focus it on this exact set of task IDs. */
  ganttTaskIds?: string[];
  /** Plain-language label for what the Gantt is focused on (e.g. a problem title). */
  ganttFocusLabel?: string;
}

export type AppNavigate = (screen: string, masterTab?: MasterTabId, options?: NavOptions) => void;

export interface MasterItem {
  id: string;
  label: string;
  code?: string;
  value?: string;
  is_active: boolean;
  sort_order: number;
  is_system?: boolean;
}

export interface MastersBundle {
  states: MasterItem[];
  sectors: MasterItem[];
  trades: MasterItem[];
  companies: MasterItem[];
}

export const MASTER_TAB_META: Record<
  MasterType | "cost_categories",
  { title: string; description: string; usedIn: string }
> = {
  cost_categories: {
    title: "Cost Categories",
    description: "Ledger cost codes for financial variance and budget tracking.",
    usedIn: "Financial Dashboard",
  },
  states: {
    title: "Australian States & Territories",
    description: "Jurisdiction for public holidays, roster rules, and project location.",
    usedIn: "Add Project · Add Resource",
  },
  sectors: {
    title: "Project Sectors",
    description: "Commercial classification for portfolio reporting.",
    usedIn: "Add Project",
  },
  trades: {
    title: "Licensed Trades",
    description: "Site roles used for resource allocation and conflict matching.",
    usedIn: "Add Resource · Gantt assignee matching",
  },
  companies: {
    title: "Subcontractor Companies",
    description: "Employer / subcontractor names for the resource registry.",
    usedIn: "Add Resource · Resource detail",
  },
};
