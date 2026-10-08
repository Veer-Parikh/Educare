import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, isDemoSession, loadDemo, setToken, setUnauthorizedHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? "loading" : "anonymous");

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus("anonymous");
    qc.clear();
  }, [qc]);

  // Block body: returning the handler would make React call logout() as the effect cleanup.
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const { user: me } = await api.get("/auth/me");
      setUser(me);
      setStatus("authenticated");
      return me;
    } catch (err) {
      if (err.status === 401) logout();
      else setStatus((s) => (s === "loading" ? "error" : s));
      return null;
    }
  }, [logout]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const acceptSession = useCallback(
    ({ token, user: u }) => {
      qc.clear();
      setToken(token);
      setUser(u);
      setStatus("authenticated");
      return u;
    },
    [qc],
  );

  const login = useCallback(async (identifier, password) => acceptSession(await api.post("/auth/login", { identifier, password })), [acceptSession]);

  /** Sign in to the in-browser demo as "TEACHER" or "STUDENT" — works with no backend. */
  const startDemo = useCallback(async (role) => acceptSession((await loadDemo()).startDemo(role)), [acceptSession]);

  /** Restore the demo's data to its starting state and refresh the signed-in user. */
  const resetDemo = useCallback(async () => {
    (await loadDemo()).resetDemo();
    const role = user?.role ?? "STUDENT";
    return acceptSession((await loadDemo()).startDemo(role));
  }, [acceptSession, user?.role]);

  const register = useCallback(
    async (data) => acceptSession(await api.post("/auth/register", { ...data, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })),
    [acceptSession],
  );

  const value = useMemo(
    () => ({
      user,
      status,
      isTeacher: user?.role === "TEACHER",
      isStudent: user?.role === "STUDENT",
      isDemo: Boolean(user) && isDemoSession(),
      login,
      startDemo,
      resetDemo,
      register,
      logout,
      refresh,
      setUser,
    }),
    [user, status, login, startDemo, resetDemo, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
