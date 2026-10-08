import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "educare.theme";
const ThemeContext = createContext(null);

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "system";
    } catch {
      return "system";
    }
  });
  const [resolved, setResolved] = useState(() => (theme === "system" ? (systemDark() ? "dark" : "light") : theme));

  useEffect(() => {
    const apply = () => {
      const next = theme === "system" ? (systemDark() ? "dark" : "light") : theme;
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    apply();
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle: () => setTheme(resolved === "dark" ? "light" : "dark") }),
    [theme, resolved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
