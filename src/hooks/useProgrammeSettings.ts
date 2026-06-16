import { useCallback, useEffect, useState } from "react";

const AUTO_CASCADE_KEY = "flowiq.programme.autoCascade";

function readAutoCascade(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(AUTO_CASCADE_KEY);
  if (stored === null) return true;
  return stored === "true";
}

/** Programme-wide preferences (browser localStorage). */
export function useProgrammeSettings() {
  const [autoCascadeDependents, setAutoCascadeDependentsState] = useState(readAutoCascade);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTO_CASCADE_KEY) {
        setAutoCascadeDependentsState(readAutoCascade());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setAutoCascadeDependents = useCallback((value: boolean) => {
    setAutoCascadeDependentsState(value);
    localStorage.setItem(AUTO_CASCADE_KEY, String(value));
  }, []);

  return { autoCascadeDependents, setAutoCascadeDependents };
}
