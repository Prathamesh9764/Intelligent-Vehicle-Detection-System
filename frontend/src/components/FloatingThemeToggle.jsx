import ThemeSwitcher from "./ThemeSwitcher";

export default function FloatingThemeToggle({ className = "" }) {
  return (
    <div className={`fixed bottom-4 right-4 z-40 ${className}`}>
      <div className="glass-card p-1 shadow-xl rounded-xl border border-slate-300 dark:border-cyan-500/20">
        <ThemeSwitcher size="sm" />
      </div>
    </div>
  );
}
