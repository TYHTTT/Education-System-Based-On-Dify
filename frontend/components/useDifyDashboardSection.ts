"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { message } from "@/components/AdminCourseForms";

/** Keep module refreshes independent, and discard responses for older scopes. */
export function useDifyDashboardSection<T>(
  key: string,
  load: (token: string, signal: AbortSignal) => Promise<T>,
  enabled: boolean,
) {
  const { status, withAdmin } = useAdmin();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ key: "", data: null, error: "", loading: true });
  useEffect(() => {
    if (status !== "ready" || !enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ key, data: null, error: "", loading: true });
      try {
        const data = await withAdmin((token) => load(token, controller.signal));
        if (!controller.signal.aborted)
          setState({ key, data, error: "", loading: false });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: message(cause), loading: false });
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, load, enabled, status, version, withAdmin]);
  function refresh() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setVersion((value) => value + 1);
  }
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : "",
    loading: enabled && (state.key !== key || state.loading),
    refresh,
  };
}
