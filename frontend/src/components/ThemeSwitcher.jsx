import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun, desc: "Clean and modern light interface" },
  { value: "dark", label: "Dark", icon: Moon, desc: "Professional dark interface (default)" },
  { value: "system", label: "System", icon: Laptop, desc: "Automatically match your OS theme" },
];

export default function ThemeSwitcher({ size = "md", showLabels = false, className = "" }) {
  const { mode, setThemeMode, resolvedTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode switcher"
      className={`inline-flex items-center p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300 dark:border-cyan-500/20 backdrop-blur-md shadow-inner transition-colors ${className}`}
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isSelected = mode === opt.value;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${opt.label} mode (${opt.desc})`}
            title={`${opt.label} Mode — ${opt.desc}${
              opt.value === "system" ? ` (Currently ${resolvedTheme})` : ""
            }`}
            onClick={() => setThemeMode(opt.value)}
            className={`
              relative flex items-center justify-center gap-1.5 rounded-lg transition-all duration-150 font-semibold
              ${size === "sm" ? "px-1.5 py-1 text-xs" : size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-1.5 text-xs"}
              ${
                isSelected
                  ? "bg-blue-600 text-white dark:bg-cyan-500/20 dark:text-cyan-300 shadow-sm border border-blue-500 dark:border-cyan-400/40 font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-white/5 border border-transparent"
              }
            `}
          >
            <Icon
              size={size === "sm" ? 13 : size === "lg" ? 16 : 14}
              className={`shrink-0 transition-transform ${isSelected ? "scale-105" : ""}`}
            />
            {showLabels && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
