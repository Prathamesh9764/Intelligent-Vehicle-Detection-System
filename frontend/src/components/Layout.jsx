import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Gauge,
  LayoutDashboard,
  Radio,
  Users,
  LogOut,
  ScanLine,
  Menu,
  X,
  BarChart3,
  Camera,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";
import ThemeSwitcher from "./ThemeSwitcher";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live Feeds", icon: Radio },
  { to: "/analysis", label: "Analytics", icon: BarChart3 },
  { to: "/cameras", label: "Camera Nodes", icon: Camera, viewerHidden: true },
  { to: "/admin", label: "Operators", icon: Users, adminOnly: true },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  useEffect(() => {
    if (!showSignOutDialog) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowSignOutDialog(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSignOutDialog]);

  useEffect(() => {
    if (!location.pathname.startsWith("/vehicles/")) {
      sessionStorage.removeItem(DASHBOARD_KEEP_FLAG);
    }
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 200);
  };

  return (
    <div
      className={`min-h-screen relative flex overflow-x-hidden transition-colors duration-250 ${
        isDark ? "theme-dark dark bg-[#080c16]" : "theme-light bg-[#f8fafc]"
      }`}
    >
      {/* Ambient Glowing Nebula Orbs in Background */}
      <div
        className="ambient-nebula-orb w-[460px] h-[460px] -top-32 -left-20 opacity-25 dark:opacity-20"
        style={{
          background: isDark
            ? "radial-gradient(circle, #1e3a8a 0%, transparent 70%)"
            : "radial-gradient(circle, #dbeafe 0%, transparent 70%)",
        }}
      />
      <div
        className="ambient-nebula-orb w-[520px] h-[520px] -bottom-32 -right-20 opacity-25 dark:opacity-15"
        style={{
          background: isDark
            ? "radial-gradient(circle, #0e7490 0%, transparent 70%)"
            : "radial-gradient(circle, #cffafe 0%, transparent 70%)",
          animationDelay: "-8s",
        }}
      />

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Modern Charcoal/Navy Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-56 sm:w-60 flex flex-col transition-all duration-300 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          border-r border-slate-200/90 dark:border-cyan-500/15
          bg-white/95 dark:bg-[#0b1120]/95 backdrop-blur-xl shadow-xl lg:shadow-none
        `}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/80 dark:border-cyan-500/15">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0">
              <ScanLine className="text-white" size={17} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                IVDS Console
              </p>
              <p className="text-[9px] text-blue-600 dark:text-cyan-400 tracking-wider uppercase font-bold truncate">
                Vehicle Detection
              </p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .filter((item) => !item.viewerHidden || user?.role !== "viewer")
            .map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/25"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-cyan-500/10"
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
        </nav>

        {/* Sidebar Footer Node Badge */}
        <div className="p-3 mx-2.5 mb-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-cyan-500/15 text-[11px]">
          <div className="flex items-center justify-between font-semibold text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5 text-[10px]">
              <Cpu size={13} className="text-cyan-500 shrink-0" />
              <span>IVDS Node</span>
            </span>
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
              v2.4 Online
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-200/90 dark:border-cyan-500/15 flex items-center justify-between px-3 sm:px-5 lg:px-6 bg-white/80 dark:bg-[#080c16]/80 backdrop-blur-xl shrink-0 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold min-w-0 text-slate-700 dark:text-slate-300">
              <span className="radar-dot shrink-0" />
              <Gauge size={14} className="text-cyan-500 shrink-0" />
              <span className="truncate font-bold hidden sm:inline text-xs">
                Intelligent-Vehicle-Detection-System
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 text-xs shrink-0">
            {/* Theme Mode Switcher */}
            <ThemeSwitcher size="sm" />

            {/* Refresh Console Button */}
            <button
              onClick={handleRefresh}
              className={`text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all p-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 hover:border-cyan-500/40 ${
                isRefreshing ? "animate-spin text-cyan-500" : ""
              }`}
              title="Refresh telemetry"
              aria-label="Refresh telemetry"
            >
              <RefreshCw size={13} />
            </button>

            {/* Live Indicator Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE</span>
            </div>

            {/* Divider */}
            <div className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-0.5" />

            {/* User Profile Badge */}
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600/15 dark:bg-cyan-500/15 border border-blue-500/30 dark:border-cyan-400/30 text-blue-600 dark:text-cyan-300 flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                {user?.username?.slice(0, 2) || "OP"}
              </div>
              <div className="hidden md:block text-left leading-tight min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[110px]">
                  {user?.username}
                </p>
                <p className="text-[9px] text-slate-500 dark:text-cyan-400 uppercase tracking-wider font-semibold">
                  {user?.role}
                </p>
              </div>
            </div>

            {/* Sign-out button */}
            <button
              onClick={() => setShowSignOutDialog(true)}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors font-semibold p-1.5 sm:px-2 sm:py-1 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 hover:border-red-500/30 cursor-pointer"
              title="Sign out of console"
              aria-label="Sign out"
            >
              <LogOut size={13} />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Viewport Container */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1500px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
            {children}
          </div>
        </div>
      </main>

      {/* Sign Out Confirmation Dialog */}
      {showSignOutDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-rise"
          onClick={() => setShowSignOutDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
        >
          <div
            className="relative w-full max-w-sm glass-card p-5 sm:p-6 shadow-2xl border border-slate-200/90 dark:border-cyan-500/25 rounded-2xl bg-white dark:bg-[#0b1220]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <LogOut size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="signout-dialog-title"
                  className="text-base font-bold text-slate-900 dark:text-white font-display"
                >
                  Confirm Sign Out
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Are you sure you want to sign out?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignOutDialog(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors -mr-1 -mt-1 cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-3 border-t border-slate-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowSignOutDialog(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSignOutDialog(false);
                  logout();
                  navigate("/login");
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-md shadow-rose-500/25 hover:shadow-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <LogOut size={13} />
                <span>Confirm Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
