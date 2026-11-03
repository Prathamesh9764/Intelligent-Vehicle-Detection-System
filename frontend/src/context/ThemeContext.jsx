import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { ANTD_DARK_THEME, ANTD_LIGHT_THEME } from "../theme/antdTokens";

export { ANTD_DARK_THEME, ANTD_LIGHT_THEME };

const ThemeContext = createContext({
  theme: "dark",
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
  antdTheme: ANTD_DARK_THEME,
});

function getInitialTheme() {
  const envDefault = import.meta.env.VITE_DEFAULT_THEME || import.meta.env.VITE_THEME;
  if (envDefault === "dark" || envDefault === "light") {
    return envDefault;
  }
  return "dark"; // Default to night (dark) theme
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

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
    applyThemeToDOM(theme);
    try {
      localStorage.setItem("app-theme", theme === "dark" ? "night" : "day");
      localStorage.setItem("theme", theme);
    } catch {
      // storage unavailable in private browsing
    }
  }, [theme, applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === "dark" || newTheme === "light") {
      setThemeState(newTheme);
    }
  }, []);

  const antdThemeConfig = useMemo(() => {
    return theme === "dark" ? ANTD_DARK_THEME : ANTD_LIGHT_THEME;
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      toggleTheme,
      setTheme,
      antdTheme: antdThemeConfig,
    }),
    [theme, toggleTheme, setTheme, antdThemeConfig]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
