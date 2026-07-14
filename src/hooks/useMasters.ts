import { useCallback, useEffect, useState } from "react";
import { MastersBundle } from "../types/masters";
import { api } from "../lib/api";

export function useMasters(activeOnly = true) {
  const [masters, setMasters] = useState<MastersBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = activeOnly ? "?activeOnly=true" : "";
    api.get<MastersBundle>(`/masters${qs}`)
      .then(data => {
        setMasters(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || "Could not load master data");
        setLoading(false);
      });
  }, [activeOnly]);

  useEffect(() => {
    load();
  }, [load]);

  return { masters, loading, error, reload: load };
}

export function useProjects() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/projects")
      .then(data => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { projects, loading };
}
