"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ApiError,
  changeCurrentAdminPassword,
  deleteCurrentAdmin,
  getCurrentAdmin,
  logoutAdmin,
} from "@/lib/api";
import type { Administrator, AuthenticatedAdmin } from "@/lib/types";

const STORAGE_KEY = "course_coach_admin_access_token";
const PREVIEW_KEY = "course_coach_admin_preview";
type Status = "initializing" | "ready" | "unauthenticated" | "error";
interface AdminContextValue {
  admin: Administrator | null;
  status: Status;
  error: string;
  completeLogin: (account: AuthenticatedAdmin) => void;
  updateProfile: (profile: Administrator) => void;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  previewing: boolean;
  beginPreview: () => void;
  endPreview: () => void;
  retry: () => void;
  withAdmin: <T>(action: (token: string) => Promise<T>) => Promise<T>;
}
const Context = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Administrator | null>(null);
  const [status, setStatus] = useState<Status>("initializing");
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setAdmin(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* Session still clears in memory. */
    }
    setStatus("unauthenticated");
  }, []);

  const restore = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("initializing");
      setError("");
      let storedPreview: string | null = null;
      try {
        let token = tokenRef.current;
        try {
          token ??= window.localStorage.getItem(STORAGE_KEY);
          storedPreview = window.sessionStorage.getItem(PREVIEW_KEY);
          setPreviewing(Boolean(storedPreview));
        } catch {
          /* Browser storage is optional. */
        }
        if (!token) {
          clear();
          if (storedPreview) router.replace("/admin");
          return;
        }
        const profile = await getCurrentAdmin(token, signal);
        if (signal?.aborted) return;
        tokenRef.current = token;
        setAdmin(profile);
        setPreviewing(storedPreview === profile.admin_id);
        setStatus("ready");
      } catch (cause) {
        if (signal?.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clear();
          setError("管理员登录已过期，请重新登录。");
          if (storedPreview) router.replace("/admin");
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : "暂时无法验证管理员登录状态。",
          );
          setStatus("error");
        }
      }
    },
    [clear, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void restore(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [restore]);

  const completeLogin = useCallback((account: AuthenticatedAdmin) => {
    const { access_token: token, ...profile } = account;
    tokenRef.current = token;
    setAdmin(profile);
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      /* Keep this session available in memory. */
    }
    setError("");
    setStatus("ready");
    setPreviewing(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) await logoutAdmin(tokenRef.current);
    } finally {
      clear();
    }
  }, [clear]);
  const retry = useCallback(() => {
    void restore();
  }, [restore]);
  const withAdmin = useCallback(
    async <T,>(action: (token: string) => Promise<T>) => {
      const token = tokenRef.current;
      if (!token) throw new Error("请先登录管理员账户。");
      try {
        return await action(token);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clear();
          setError("管理员登录已过期，请重新登录。");
        }
        throw cause;
      }
    },
    [clear],
  );
  const deleteAccount = useCallback(
    async (password: string) => {
      await withAdmin((token) => deleteCurrentAdmin(token, password));
      clear();
      setError("");
    },
    [withAdmin, clear],
  );
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await withAdmin((token) =>
        changeCurrentAdminPassword(token, currentPassword, newPassword),
      );
      clear();
      setError("");
    },
    [withAdmin, clear],
  );
  const beginPreview = useCallback(() => {
    if (!admin) return;
    try {
      window.sessionStorage.setItem(PREVIEW_KEY, admin.admin_id);
    } catch {
      /* Keep preview in memory. */
    }
    setPreviewing(true);
  }, [admin]);
  const endPreview = useCallback(() => {
    try {
      window.sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* Clear in-memory preview below. */
    }
    if (pathname.startsWith("/admin") && pathname !== "/admin/preview") {
      setPreviewing(false);
    } else {
      router.replace("/admin");
    }
  }, [pathname, router]);
  useEffect(() => {
    if (
      !previewing ||
      !pathname.startsWith("/admin") ||
      pathname === "/admin/preview"
    )
      return;
    const timer = window.setTimeout(endPreview, 0);
    return () => window.clearTimeout(timer);
  }, [previewing, pathname, endPreview]);
  const updateProfile = useCallback(
    (profile: Administrator) => setAdmin(profile),
    [],
  );
  const value = useMemo(
    () => ({
      admin,
      status,
      error,
      completeLogin,
      updateProfile,
      logout,
      deleteAccount,
      changePassword,
      previewing,
      beginPreview,
      endPreview,
      retry,
      withAdmin,
    }),
    [
      admin,
      status,
      error,
      completeLogin,
      updateProfile,
      logout,
      deleteAccount,
      changePassword,
      previewing,
      beginPreview,
      endPreview,
      retry,
      withAdmin,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdmin() {
  const context = useContext(Context);
  if (!context) throw new Error("AdminProvider 未初始化");
  return context;
}
