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
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live feed", icon: Radio },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/cameras", label: "Cameras", icon: Camera, viewerHidden: true },
  { to: "/admin", label: "Users", icon: Users, adminOnly: true },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!location.pathname.startsWith("/vehicles/")) {
      sessionStorage.removeItem(DASHBOARD_KEEP_FLAG);
    }
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div
      className={`min-h-screen relative flex overflow-x-hidden ${
        isDark ? "theme-dark dark" : "theme-light"
      }`}
    >
      {/* Ambient Glowing Nebula Orbs in Background */}
      <div
        className="ambient-nebula-orb w-[500px] h-[500px] -top-32 -left-20 opacity-30 dark:opacity-25"
        style={{
          background: isDark
            ? "radial-gradient(circle, #3b1d6e 0%, transparent 70%)"
            : "radial-gradient(circle, #fef3c7 0%, transparent 70%)",
        }}
      />
      <div
        className="ambient-nebula-orb w-[600px] h-[600px] -bottom-32 -right-20 opacity-30 dark:opacity-20"
        style={{
          background: isDark
            ? "radial-gradient(circle, #0f3a4d 0%, transparent 70%)"
            : "radial-gradient(circle, #fed7aa 0%, transparent 70%)",
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

      {/* Frosted Glass Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-all duration-300 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          border-r border-slate-200/80 dark:border-white/10
          bg-white/90 dark:bg-[#0a0820]/90 backdrop-blur-xl shadow-xl lg:shadow-none
        `}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-200/80 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-teal-600 flex items-center justify-center shadow-md shadow-amber-500/25 shrink-0">
              <ScanLine className="text-white" size={20} />
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-wider text-shimmer-gold leading-none">
                SPEED·OCR
              </p>
              <p className="text-[10px] text-slate-500 dark:text-indigo-200/70 tracking-widest uppercase font-semibold mt-1">
                Enforcement Console
              </p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3.5 py-6 space-y-1.5 overflow-y-auto">
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
                  `flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30 font-bold"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/5"
                  }`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
        </nav>
      </aside>

      {/* Main Canvas */}
      <main className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Frosted Topbar */}
        <header className="h-16 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between px-4 sm:px-6 lg:px-10 bg-white/70 dark:bg-[#0a0820]/70 backdrop-blur-xl shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/5 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold min-w-0 text-slate-600 dark:text-slate-300">
              <span className="radar-dot shrink-0" />
              <Gauge size={14} className="text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate hidden sm:inline">Traffic telemetry active</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
            {/* Refresh Button */}
            <button
              onClick={() => location.reload()}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/5 hover:border-amber-500/40"
              title="Refresh console"
            >
              <RefreshCw size={14} />
            </button>

            {/* Live Indicator Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[11px] font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span>LIVE</span>
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10 mx-0.5 sm:mx-1" />

            {/* User Profile Info */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-500/40 flex items-center justify-center text-amber-800 dark:text-amber-200 text-xs font-bold uppercase shrink-0 shadow-sm">
                {user?.username?.slice(0, 2)}
              </div>
              <div className="hidden sm:block text-left leading-tight min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
                  {user?.username}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-indigo-200/70 uppercase tracking-wider font-bold">
                  {user?.role}
                </p>
              </div>
            </div>

            {/* Sign-out button */}
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors font-semibold p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/5 hover:border-red-500/40 hover:bg-red-50/50 dark:hover:bg-rose-950/20 active:scale-95"
              title="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* Breathable Centered Container */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-[1400px] mx-auto px-4 pb-16 pt-6 sm:px-6 lg:px-10 space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
