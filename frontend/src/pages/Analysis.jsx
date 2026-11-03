import { useCallback, useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart as RBarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { ConfigProvider, Select } from "antd";
import { Car, Gauge, Zap, TrendingUp, AlertTriangle, RotateCcw, Camera, SlidersHorizontal, ChevronDown } from "lucide-react";
import client from "../api/client";
import { Field, SplitDateTime } from "../components/filterControls";
import { useTheme } from "../context/ThemeContext";
import { useCountUp } from "../hooks/useCountUp";

const PIECHART_COLORS = ["#d97706", "#0d9488", "#2dd4bf", "#f59e0b", "#818cf8", "#fb7185", "#ea580c"];

const SPEED_RANGES = [
  { label: "All speeds", value: "" },
  { label: "10 — 20 km/h", value: "10-20" },
  { label: "20 — 40 km/h", value: "20-40" },
  { label: "40 — 60 km/h", value: "40-60" },
  { label: "60 — 80 km/h", value: "60-80" },
  { label: "80 — 100 km/h", value: "80-100" },
  { label: "100 or more", value: "100+" },
];

const RANGE_MAP = {
  "10-20": { min_speed: 10, max_speed: 20 },
  "20-40": { min_speed: 20, max_speed: 40 },
  "40-60": { min_speed: 40, max_speed: 60 },
  "60-80": { min_speed: 60, max_speed: 80 },
  "80-100": { min_speed: 80, max_speed: 100 },
  "100+": { min_speed: 100 },
};

const EMPTY_FILTERS = { camera_id: "", vehicle_type: "", date_from: "", date_to: "", speed_range: "" };

function StatCard({ icon: Icon, label, value, accent, glow, index = 0 }) {
  const rawNum = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  const animatedNum = useCountUp(isNaN(rawNum) ? 0 : rawNum);

  let formattedDisplay = value;
  if (!isNaN(rawNum)) {
    if (String(value).includes("km/h")) {
      formattedDisplay = `${animatedNum.toFixed(1)} km/h`;
    } else {
      formattedDisplay = animatedNum.toLocaleString();
    }
  }

  return (
    <div
      className="group relative glass-card top-accent-bar p-4 sm:p-5 flex items-center gap-4 overflow-hidden animate-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className={`shrink-0 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 ${accent} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-indigo-200/70 uppercase tracking-wider font-bold truncate">
          {label}
        </p>
        <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight truncate mt-0.5">
          {formattedDisplay}
        </p>
      </div>
    </div>
  );
}

/** Shared card shell so every chart panel gets the same premium treatment. */
function ChartCard({ icon: Icon, iconClass = "text-amber-600 dark:text-amber-400", title, subtitle, children }) {
  return (
    <div className="glass-card p-5 sm:p-6 transition-all duration-300">
      <div className="mb-5">
        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {Icon && <Icon size={18} className={iconClass} />}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** One consistent tooltip style reused across the donut and area chart. */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-asphalt-800/95 backdrop-blur-sm border border-asphalt-600 rounded-lg px-3 py-2 shadow-xl text-xs min-w-[120px]">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill }} />
          <span className="text-slate-300 capitalize">{p.name}</span>
          <span className="text-slate-100 font-mono font-medium ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Column chart — daily captures over time. */
function DailyColumnChart({ data = [], isDark }) {
  const gridColor = isDark ? "#2d3148" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RBarChart data={data} margin={{ top: 10, right: 10, left: -12, bottom: 0 }} barCategoryGap="28%">
        <defs>
          <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
          angle={-30}
          textAnchor="end"
          height={40}
        />
        <YAxis tick={{ fill: tickColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff", opacity: 0.04 }} />
        <Bar dataKey="count" name="Vehicles" fill="url(#dailyGradient)" radius={[6, 6, 0, 0]} maxBarSize={36} minPointSize={3} animationDuration={600} />
      </RBarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bar chart — vehicles by camera, easier to read long camera names. */
function CameraBarChart({ data = [], isDark }) {
  const gridColor = isDark ? "#2d3148" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 42)}>
      <RBarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        barCategoryGap="28%"
      >
        <defs>
          <linearGradient id="cameraGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d97706" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#d97706" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
        <XAxis type="number" tick={{ fill: tickColor, fontSize: 12 }} axisLine={{ stroke: gridColor }} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="camera_name"
          tick={{ fill: tickColor, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff", opacity: 0.04 }} />
        <Bar dataKey="count" name="Vehicles" fill="url(#cameraGradient)" radius={[0, 6, 6, 0]} maxBarSize={22} minPointSize={3} animationDuration={600} />
      </RBarChart>
    </ResponsiveContainer>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-asphalt-700/60 rounded-md ${className}`} />;
}

export default function Analysis() {
  const { antdTheme, isDark } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });
  const [activeSlice, setActiveSlice] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    client.get("/cameras").then(({ data }) => setCameras(data));
    client.get("/vehicles/types").then(({ data }) => setVehicleTypes(data));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = {};
    Object.entries(appliedFilters).forEach(([k, v]) => {
      if (!v) return;
      if (k.startsWith("date")) {
        params[k] = `${v}:00`;
      } else if (k === "speed_range") {
        const range = RANGE_MAP[v];
        if (range) {
          if (range.min_speed !== undefined) params.min_speed = range.min_speed;
          if (range.max_speed !== undefined) params.max_speed = range.max_speed;
        }
      } else {
        params[k] = v;
      }
    });
    try {
      const { data } = await client.get("/vehicles/analysis", { params });
      setData(data);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [appliedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v);
  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  };

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-4 sm:p-5 h-[84px] flex items-center gap-4">
              <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
        <Skeleton className="h-[240px] rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="p-3 rounded-full bg-alert/10 text-alert">
          <AlertTriangle size={22} />
        </div>
        <p className="text-slate-300 text-sm font-medium">Couldn't load analysis data</p>
        <p className="text-slate-500 text-xs max-w-xs">Check your connection and try again.</p>
        <button
          onClick={fetchData}
          className="mt-1 text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25 hover:shadow-lg transition-all"
        >
          Try again
        </button>
      </div>
    );
  }

  const typeTotal = data.by_type.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
          Analysis
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">
          Traffic patterns and vehicle activity across your cameras
        </p>
      </div>

      <div className="glass-card overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 sm:hidden active:bg-slate-100/50 dark:active:bg-white/5"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <SlidersHorizontal size={15} className="text-amber-600 dark:text-amber-400" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
        </button>

        <div className={`${filtersOpen ? "block" : "hidden"} sm:block p-4 sm:p-5 ${filtersOpen ? "border-t border-slate-200/80 dark:border-white/10 sm:border-t-0" : ""}`}>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4 sm:items-end">
            <Field label="Camera">
              <ConfigProvider theme={antdTheme}>
                <Select
                  value={filters.camera_id || undefined}
                  placeholder="All"
                  onChange={(v) => setFilters((f) => ({ ...f, camera_id: v || "" }))}
                  allowClear
                  className="w-full sm:min-w-[140px]"
                  options={[
                    { value: "", label: "All" },
                    ...cameras.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </ConfigProvider>
            </Field>

            <Field label="Vehicle type">
              <ConfigProvider theme={antdTheme}>
                <Select
                  value={filters.vehicle_type || undefined}
                  placeholder="All"
                  onChange={(v) => setFilters((f) => ({ ...f, vehicle_type: v || "" }))}
                  allowClear
                  className="w-full sm:min-w-[140px]"
                  options={[
                    { value: "", label: "All" },
                    ...vehicleTypes.map((t) => ({ value: t, label: t })),
                  ]}
                />
              </ConfigProvider>
            </Field>

            <div className="col-span-2 sm:col-span-2">
              <SplitDateTime
                value={filters.date_from}
                onChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
                dateLabel="Start Date"
                timeLabel="Time"
                defaultTime="00:00"
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <SplitDateTime
                value={filters.date_to}
                onChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
                dateLabel="End Date"
                timeLabel="Time"
                defaultTime="23:59"
              />
            </div>

            <Field label="Speed" className="col-span-2 sm:col-span-1">
              <ConfigProvider theme={antdTheme}>
                <Select
                  value={filters.speed_range || undefined}
                  placeholder="All speeds"
                  onChange={(v) => setFilters((f) => ({ ...f, speed_range: v || "" }))}
                  allowClear
                  className="w-full sm:min-w-[140px]"
                  options={SPEED_RANGES.map((r) => ({ value: r.value, label: r.label }))}
                />
              </ConfigProvider>
            </Field>

            <div className="col-span-2 sm:col-span-1 flex gap-2 flex-wrap w-full sm:w-auto">
              <button
                onClick={applyFilters}
                className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm shadow-amber-500/25 hover:shadow-md hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                Apply
              </button>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 text-sm px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 transition-all active:scale-95 font-semibold"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Car} label="Total vehicles" value={data.total} accent="text-amber-600 dark:text-amber-400" glow="bg-amber-500" index={0} />
        <StatCard icon={Gauge} label="Avg speed" value={`${data.avg_speed} km/h`} accent="text-teal-600 dark:text-teal-400" glow="bg-teal-500" index={1} />
        <StatCard icon={Zap} label="Max speed" value={`${data.max_speed} km/h`} accent="text-amber-600 dark:text-amber-400" glow="bg-amber-500" index={2} />
        <StatCard icon={AlertTriangle} label="Overspeed" value={data.overspeed_count} accent="text-rose-600 dark:text-rose-400" glow="bg-rose-500" index={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard icon={Car} iconClass="text-lane" title="By vehicle type" subtitle="Share of tracked vehicles this period">
          <div className="flex flex-col sm:flex-row items-center sm:justify-center gap-5">
            <div className="relative shrink-0" style={{ width: 190, height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_type}
                    dataKey="count"
                    nameKey="vehicle_type"
                    cx="50%" cy="50%"
                    innerRadius={58} outerRadius={86}
                    paddingAngle={3}
                    onMouseEnter={(_, i) => setActiveSlice(i)}
                    onMouseLeave={() => setActiveSlice(null)}
                  >
                    {data.by_type.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIECHART_COLORS[i % PIECHART_COLORS.length]}
                        stroke={isDark ? "#12141f" : "#ffffff"}
                        strokeWidth={2}
                        opacity={activeSlice === null || activeSlice === i ? 1 : 0.35}
                        style={{
                          transition: "opacity 200ms ease, filter 200ms ease",
                          filter: activeSlice === i ? "brightness(1.15)" : "none",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-display text-2xl font-semibold text-slate-100">{typeTotal.toLocaleString()}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Total</span>
              </div>
            </div>

            <div className="w-full sm:w-56 space-y-1">
              {data.by_type.map((d, i) => {
                const pct = typeTotal ? Math.round((d.count / typeTotal) * 100) : 0;
                return (
                  <div
                    key={d.vehicle_type}
                    onMouseEnter={() => setActiveSlice(i)}
                    onMouseLeave={() => setActiveSlice(null)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-default ${
                      activeSlice === i ? "bg-asphalt-900" : ""
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: PIECHART_COLORS[i % PIECHART_COLORS.length] }}
                    />
                    <span className="text-slate-300 capitalize truncate mr-auto">{d.vehicle_type}</span>
                    <span className="text-slate-500 text-xs">{pct}%</span>
                    <span className="text-slate-200 font-mono text-xs w-10 text-right tabular-nums">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>

        <ChartCard icon={Gauge} iconClass="text-live" title="Speed distribution" subtitle="Vehicle count per speed band">
          <ResponsiveContainer width="100%" height={260}>
            <RBarChart data={data.by_speed_range} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barCategoryGap="24%">
              <defs>
                <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#2d3148" : "#e2e8f0"} vertical={false} />
              <XAxis dataKey="range" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 12 }} axisLine={{ stroke: isDark ? "#2d3148" : "#e2e8f0" }} tickLine={false} />
              <YAxis tick={{ fill: isDark ? "#e2e8f0" : "#1e293b", fontSize: 13 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff", opacity: 0.04 }} />
              <Bar
                dataKey="count"
                name="Vehicles"
                fill="url(#speedGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                minPointSize={3}
                animationDuration={600}
              />
            </RBarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard icon={TrendingUp} iconClass="text-lane" title="Daily captures" subtitle="Vehicles tracked per day, last 14 days">
        <DailyColumnChart data={data.by_day} isDark={isDark} />
      </ChartCard>

      <ChartCard icon={Camera} iconClass="text-lane" title="By camera" subtitle="Vehicles tracked per camera">
        <CameraBarChart data={data.by_camera} isDark={isDark} />
      </ChartCard>
    </div>
  );
}