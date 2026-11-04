import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScanLine,
  AlertCircle,
  User,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Target,
  Activity,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ThemeSwitcher from "../components/ThemeSwitcher";

export default function Login() {
  const { login } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Dynamic telemetry metrics for real-time live animation
  const [latency, setLatency] = useState(8.2);
  const [vehicleCount, setVehicleCount] = useState(14892);
  const [activeCam, setActiveCam] = useState("CAM-01");

  useEffect(() => {
    const timer = setInterval(() => {
      setLatency(Number((7.8 + Math.random() * 0.9).toFixed(1)));
    }, 2500);

    const vehicleTimer = setInterval(() => {
      setVehicleCount((prev) => prev + 1);
    }, 4000);

    return () => {
      clearInterval(timer);
      clearInterval(vehicleTimer);
    };
  }, []);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your operator ID.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Authentication failed. Check credentials."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill() {
    setUsername("admin");
    setPassword("admin");
    setError("");
  }

  return (
    <div
      className={`w-full h-screen max-h-screen overflow-hidden flex flex-col lg:flex-row select-none transition-colors duration-300 ${
        isDark ? "theme-dark dark bg-[#060a14] text-slate-100" : "theme-light bg-[#f8fafc] text-slate-900"
      }`}
    >
      {/* ════════════════════════════════════════════════════════════════════════
          LEFT SECTION: HIGH-TECH AI SURVEILLANCE & TRAFFIC MONITORING ANIMATION
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[58%] xl:w-[62%] h-full flex-col justify-between p-3.5 sm:p-5 lg:p-6 relative overflow-hidden bg-gradient-to-br from-[#060a14] via-[#091122] to-[#040810] border-r border-slate-200/80 dark:border-cyan-500/20">
        {/* Ambient Glows */}
        <div className="absolute -top-28 -left-28 w-80 h-80 rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 -right-28 w-80 h-80 rounded-full bg-cyan-500/15 blur-[110px] pointer-events-none" />

        {/* Cyber Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035] dark:opacity-[0.06]"
          style={{
            backgroundImage: `linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />

        {/* ── TOP HUD HEADER ── */}
        <div className="relative z-10 flex items-center justify-between pb-2.5 border-b border-cyan-500/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-cyan-500/25 ring-1 ring-cyan-400/40 shrink-0">
              <ScanLine className="text-white" size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-sm sm:text-base font-extrabold tracking-tight text-white leading-none">
                  Intelligent-Vehicle-Detection-System
                </h1>
                <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  LIVE AI
                </span>
              </div>
              <p className="text-[10px] text-cyan-400 font-mono tracking-wider flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>RADAR & OPTICAL ANPR INFERENCE</span>
              </p>
            </div>
          </div>

          {/* Camera Feed Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-cyan-500/25 backdrop-blur-md">
            {["CAM-01", "CAM-02", "CAM-03"].map((cam) => (
              <button
                key={cam}
                type="button"
                onClick={() => setActiveCam(cam)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                  activeCam === cam
                    ? "bg-cyan-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-cyan-300"
                }`}
              >
                {cam}
              </button>
            ))}
          </div>
        </div>

        {/* ── CENTER: HIGHWAY SIMULATION & MULTI-VEHICLE TRACKING ── */}
        <div className="relative z-10 flex-1 my-2 flex flex-col justify-center min-h-0">
          <div className="relative w-full rounded-xl bg-[#080d1a]/95 border border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.12)] p-2.5 overflow-hidden scanline">
            {/* Viewport Status Line */}
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-cyan-500/20 text-[10px] font-mono">
              <div className="flex items-center gap-1.5 text-cyan-300">
                <Target size={12} className="text-cyan-400 animate-spin" />
                <span className="font-bold">{activeCam}: EXPRESSWAY CORRIDOR</span>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <Activity size={10} />
                  60 FPS
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-400 text-[9px]">
                <span className="text-cyan-400">{latency} ms</span>
                <span className="text-emerald-400 font-bold">99.8% CONF</span>
              </div>
            </div>

            {/* 3D Highway Perspective Canvas */}
            <div className="relative h-44 sm:h-52 lg:h-56 xl:h-60 w-full rounded-lg bg-gradient-to-b from-[#070b16] via-[#091122] to-[#040810] border border-cyan-500/20 overflow-hidden flex items-center justify-center">
              {/* Sky Glow */}
              <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-blue-900/30 to-transparent pointer-events-none" />

              {/* Perspective Road SVG */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 800 280"
                preserveAspectRatio="none"
              >
                <polygon points="300,0 500,0 740,280 60,280" fill="#0b1426" opacity="0.9" />
                <line x1="300" y1="0" x2="60" y2="280" stroke="#0ea5e9" strokeWidth="2" opacity="0.6" />
                <line x1="500" y1="0" x2="740" y2="280" stroke="#0ea5e9" strokeWidth="2" opacity="0.6" />

                {/* Animated Dashed Lane Dividers */}
                <line
                  x1="370"
                  y1="0"
                  x2="290"
                  y2="280"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="16 20"
                  style={{ animation: "roadDash 0.75s linear infinite" }}
                />
                <line
                  x1="430"
                  y1="0"
                  x2="510"
                  y2="280"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="16 20"
                  style={{ animation: "roadDash 0.75s linear infinite" }}
                />

                {/* Radar Gate Line */}
                <line
                  x1="90"
                  y1="165"
                  x2="710"
                  y2="165"
                  stroke="#f43f5e"
                  strokeWidth="1.2"
                  strokeDasharray="6 4"
                  opacity="0.75"
                />
                <text x="715" y="168" fill="#f43f5e" fontSize="8" fontFamily="monospace" fontWeight="bold">
                  RADAR GATE
                </text>
              </svg>

              {/* ── VEHICLE 1: SPEED VIOLATION (Coupe - Red) ── */}
              <div
                className="absolute top-6 left-[43%] -translate-x-1/2 z-20 flex flex-col items-center"
                style={{ animation: "violationPulse 2.8s ease-in-out infinite" }}
              >
                <div className="relative border-2 border-rose-500 bg-rose-950/80 rounded-md p-1.5 shadow-[0_0_20px_rgba(244,63,94,0.45)] min-w-[145px]">
                  <span className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-rose-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-rose-400" />
                  <span className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-rose-400" />
                  <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-rose-400" />

                  <div className="flex items-center justify-between text-[8px] font-mono font-bold pb-0.5 mb-1 border-b border-rose-500/40">
                    <span className="text-rose-300">TRK #908 • COUPE</span>
                    <span className="bg-rose-500 text-slate-950 px-1 rounded font-black text-[7px]">
                      VIOLATION
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <div className="bg-slate-950 px-1.5 py-0.2 rounded border border-rose-400/60 font-mono text-[10px] font-black text-white">
                      MH 12 EQ 8810
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px] font-black text-rose-400 flex items-center gap-0.5">
                        <Gauge size={10} />
                        118.4 km/h
                      </div>
                      <div className="text-[7px] font-mono text-rose-300/80">LIMIT: 80</div>
                    </div>
                  </div>
                </div>

                {/* Car Silhouette */}
                <div className="mt-0.5 flex flex-col items-center">
                  <div className="w-7 h-2.5 rounded-t bg-rose-500/90 shadow-[0_0_8px_#f43f5e]" />
                  <div className="w-10 h-3 rounded bg-rose-600 border border-rose-400 flex justify-between px-1 items-center">
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping" />
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping" />
                  </div>
                </div>
              </div>

              {/* ── VEHICLE 2: COMPLIANT SEDAN (Cyan / Emerald) ── */}
              <div
                className="absolute bottom-4 left-[20%] z-20 flex flex-col items-center"
                style={{ animation: "vehiclePulse 3.2s ease-in-out infinite" }}
              >
                <div className="relative border-2 border-cyan-400 bg-slate-950/85 rounded-md p-1.5 shadow-[0_0_15px_rgba(6,182,212,0.35)] min-w-[145px]">
                  <span className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-cyan-300" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-cyan-300" />
                  <span className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-cyan-300" />
                  <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-cyan-300" />

                  <div className="flex items-center justify-between text-[8px] font-mono font-bold pb-0.5 mb-1 border-b border-cyan-500/40">
                    <span className="text-cyan-300">TRK #842 • SEDAN</span>
                    <span className="bg-emerald-500 text-slate-950 px-1 rounded font-black text-[7px]">
                      COMPLIANT
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <div className="bg-slate-950 px-1.5 py-0.2 rounded border border-cyan-400/60 font-mono text-[10px] font-black text-cyan-100">
                      DL 04 AB 9120
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px] font-black text-emerald-400">
                        68.2 km/h
                      </div>
                      <div className="text-[7px] font-mono text-slate-400">99.4% CONF</div>
                    </div>
                  </div>
                </div>

                {/* Car Silhouette */}
                <div className="mt-0.5 flex flex-col items-center">
                  <div className="w-8 h-3 rounded-t bg-cyan-600/80 shadow-[0_0_8px_#06b6d4]" />
                  <div className="w-12 h-3.5 rounded bg-cyan-700 border border-cyan-400 flex justify-between px-1 items-center">
                    <span className="w-1 h-1 rounded-full bg-cyan-200" />
                    <span className="w-1 h-1 rounded-full bg-cyan-200" />
                  </div>
                </div>
              </div>

              {/* ── VEHICLE 3: COMMERCIAL SUV (Blue) ── */}
              <div className="absolute bottom-6 right-[16%] z-15 flex flex-col items-center opacity-85">
                <div className="relative border border-blue-400/80 bg-slate-950/85 rounded-md p-1 min-w-[125px]">
                  <div className="flex items-center justify-between text-[7px] font-mono pb-0.5 mb-0.5 border-b border-blue-500/30 text-blue-300 font-bold">
                    <span>TRK #715 • SUV</span>
                    <span className="text-emerald-400 font-bold">54 km/h</span>
                  </div>
                  <div className="bg-slate-950 px-1 py-0.2 rounded border border-blue-400/40 font-mono text-[9px] font-bold text-white text-center">
                    KA 01 MJ 3491
                  </div>
                </div>

                <div className="mt-0.5 flex flex-col items-center">
                  <div className="w-8 h-3 rounded-t bg-blue-700/80" />
                  <div className="w-11 h-3.5 rounded bg-blue-800 border border-blue-400 flex justify-between px-1 items-center">
                    <span className="w-1 h-1 rounded-full bg-blue-200" />
                    <span className="w-1 h-1 rounded-full bg-blue-200" />
                  </div>
                </div>
              </div>
            </div>

            {/* Inset Plate OCR Scanner */}
            <div className="mt-2 p-2 rounded-lg bg-slate-950/90 border border-cyan-500/25 flex items-center justify-between gap-2 relative overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-cyan-400 to-transparent pointer-events-none z-30"
                style={{ animation: "laserScanHorizontal 2.4s ease-in-out infinite" }}
              />

              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-yellow-400 text-black font-mono font-black text-xs tracking-wider border border-black shadow-sm shrink-0">
                  MH 12 EQ 8810
                </div>
                <div>
                  <div className="text-[9px] font-mono text-cyan-300 font-bold flex items-center gap-1">
                    <CheckCircle2 size={10} className="text-emerald-400" />
                    ANPR OCR (99.8% CONFIDENCE)
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 flex gap-1 mt-0.5">
                    <span>M:99%</span>
                    <span>H:99%</span>
                    <span>1:99%</span>
                    <span>2:99%</span>
                    <span>E:99%</span>
                    <span>Q:99%</span>
                    <span>8:99%</span>
                  </div>
                </div>
              </div>

              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1">
                <AlertTriangle size={10} />
                CITATION QUEUED
              </span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM TELEMETRY BAR ── */}
        <div className="relative z-10 pt-2 border-t border-cyan-500/15 grid grid-cols-3 gap-2">
          {/* Radar Pod */}
          <div className="p-2 rounded-lg bg-slate-900/60 border border-cyan-500/20 flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-full border border-cyan-500/40 bg-slate-950 flex items-center justify-center shrink-0 overflow-hidden">
              <div
                className="absolute inset-0 bg-gradient-to-r from-cyan-500/40 via-transparent to-transparent origin-center pointer-events-none"
                style={{ animation: "radarSweep 3s linear infinite" }}
              />
              <span className="w-1 h-1 rounded-full bg-cyan-400" />
            </div>
            <div>
              <div className="text-[9px] font-mono text-cyan-300 font-bold">RADAR SWEEP</div>
              <div className="text-[8px] text-slate-400 font-mono">3 TARGETS</div>
            </div>
          </div>

          {/* Neural Pipeline */}
          <div className="p-2 rounded-lg bg-slate-900/60 border border-cyan-500/20 flex flex-col justify-center">
            <div className="text-[9px] font-mono text-cyan-300 font-bold mb-0.5">NEURAL PIPELINE</div>
            <div className="flex items-center justify-between text-[8px] font-mono text-slate-300">
              <span>DETECT</span>
              <span className="text-cyan-400">➔</span>
              <span>SPEED</span>
              <span className="text-cyan-400">➔</span>
              <span>ANPR</span>
            </div>
          </div>

          {/* Metrics */}
          <div className="p-2 rounded-lg bg-slate-900/60 border border-cyan-500/20 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-mono text-cyan-300 font-bold">LOGGED TODAY</div>
              <div className="text-xs font-mono font-black text-white">
                {vehicleCount.toLocaleString()}
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-6">
              {[40, 75, 55, 90, 60, 80].map((h, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-cyan-400"
                  style={{
                    height: `${h}%`,
                    animation: `waveBar 1.2s ease-in-out infinite`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          RIGHT SECTION: COMPACT, SCROLL-FREE OPERATOR CONSOLE (NO EXTRA TEXT)
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[42%] xl:w-[38%] h-full flex flex-col justify-between px-5 py-4 sm:px-8 sm:py-6 lg:px-8 xl:px-12 lg:py-6 relative z-10 bg-white/95 dark:bg-[#090e1c]/95 backdrop-blur-xl overflow-hidden">
        {/* Top Header with Theme Switcher */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200/70 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="radar-dot" />
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-slate-600 dark:text-cyan-400">
              OPERATOR CONSOLE
            </span>
          </div>
          <ThemeSwitcher size="sm" />
        </div>

        {/* Center Form: Streamlined & Compact (Fits completely without vertical scroll) */}
        <div className="my-auto w-full max-w-sm mx-auto">
          {/* Title */}
          <div className="mb-4 sm:mb-5">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display leading-tight">
              Sign In
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Enter your operator credentials to access enforcement console
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5" noValidate>
            {/* Operator ID Field */}
            <div className="space-y-1">
              <label
                htmlFor="username"
                className="block text-[11px] uppercase tracking-wider font-bold text-slate-700 dark:text-slate-300 font-mono"
              >
                Operator ID
              </label>
              <div className="flex items-center rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-cyan-500/30 px-3 py-2.5 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
                <User
                  size={16}
                  className="text-slate-400 dark:text-cyan-400 shrink-0 mr-2.5"
                />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-medium"
                  placeholder="operator"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-[11px] uppercase tracking-wider font-bold text-slate-700 dark:text-slate-300 font-mono"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleQuickFill}
                  className="text-[10px] font-mono font-semibold text-blue-600 dark:text-cyan-400 hover:underline"
                >
                  Demo Fill
                </button>
              </div>
              <div className="flex items-center rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-cyan-500/30 px-3 py-2.5 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
                <Lock
                  size={16}
                  className="text-slate-400 dark:text-cyan-400 shrink-0 mr-2.5"
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-medium"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-cyan-300 transition-colors ml-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs font-semibold p-2.5 rounded-xl badge-critical animate-rise"
              >
                <AlertCircle size={15} className="shrink-0 text-rose-500" />
                <span className="flex-1 leading-tight">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 sm:py-3 px-4 rounded-xl font-bold tracking-wide text-xs sm:text-sm text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-md shadow-blue-500/25 hover:shadow-cyan-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>AUTHENTICATING…</span>
                </>
              ) : (
                <>
                  <span>ACCESS CONSOLE</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Minimal Subtle Footer (1 Line) */}
        <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span>Encrypted Session</span>
          </div>
          <div>IVDS Console v2.4</div>
        </div>
      </div>
    </div>
  );
}
