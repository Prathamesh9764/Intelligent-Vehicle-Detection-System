import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { ANTD_DARK_THEME, ANTD_LIGHT_THEME } from "../theme/antdTokens";

export { ANTD_DARK_THEME, ANTD_LIGHT_THEME };

const ThemeContext = createContext({
  mode: "dark",
  themeMode: "dark",
  theme: "dark",
  resolvedTheme: "dark",
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
  setThemeMode: () => {},
  antdTheme: ANTD_DARK_THEME,
});

function getInitialMode() {
  try {
    const saved = localStorage.getItem("theme") || localStorage.getItem("theme-mode");
    if (saved === "dark" || saved === "light" || saved === "system") {
      return saved;
    }
    const envDefault = import.meta.env.VITE_DEFAULT_THEME || import.meta.env.VITE_THEME;
    if (envDefault === "dark" || envDefault === "light" || envDefault === "system") {
      return envDefault;
    }
  } catch {
    // localStorage may be unavailable in private browsing mode
  }
  return "dark"; // Default theme is modern Dark Mode
}

function getSystemIsDark() {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(getInitialMode);
  const [systemIsDark, setSystemIsDark] = useState(getSystemIsDark);

  // Listen for operating system theme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e) => {
      setSystemIsDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const resolvedTheme = useMemo(() => {
    if (mode === "system") {
      return systemIsDark ? "dark" : "light";
    }
    return mode;
  }, [mode, systemIsDark]);

  const isDark = resolvedTheme === "dark";

  const applyThemeToDOM = useCallback((currentTheme) => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("theme-light", "theme-dark", "dark");
    body.classList.remove("theme-light", "theme-dark", "dark");

    if (currentTheme === "dark") {
      root.classList.add("theme-dark", "dark");
      body.classList.add("theme-dark", "dark");
      root.setAttribute("data-theme", "night");
      body.setAttribute("data-theme", "night");
      root.style.colorScheme = "dark";
    } else {
      root.classList.add("theme-light");
      body.classList.add("theme-light");
      root.setAttribute("data-theme", "day");
      body.setAttribute("data-theme", "day");
      root.style.colorScheme = "light";
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
    try {
      localStorage.setItem("theme", mode);
      localStorage.setItem("theme-mode", mode);
      localStorage.setItem("app-theme", resolvedTheme === "dark" ? "night" : "day");
    } catch {
      // storage unavailable
    }
  }, [mode, resolvedTheme, applyThemeToDOM]);

  const setThemeMode = useCallback((newMode) => {
    if (newMode === "dark" || newMode === "light" || newMode === "system") {
      setModeState(newMode);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  }, []);

  const antdThemeConfig = useMemo(() => {
    return isDark ? ANTD_DARK_THEME : ANTD_LIGHT_THEME;
  }, [isDark]);

  const value = useMemo(
    () => ({
      mode,
      themeMode: mode,
      theme: resolvedTheme,
      resolvedTheme,
      isDark,
      toggleTheme,
      setTheme: setThemeMode,
      setThemeMode,
      antdTheme: antdThemeConfig,
    }),
    [mode, resolvedTheme, isDark, toggleTheme, setThemeMode, antdThemeConfig]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
