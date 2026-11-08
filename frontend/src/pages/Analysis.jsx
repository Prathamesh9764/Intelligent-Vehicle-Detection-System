import { useCallback, useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { ConfigProvider, Select } from "antd";
import {
  Car,
  Gauge,
  Zap,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Camera,
  SlidersHorizontal,
  ChevronDown,
  Filter,
} from "lucide-react";
import client from "../api/client";
import { Field, SplitDateTime } from "../components/filterControls";
import { useTheme } from "../context/ThemeContext";
import { useCountUp } from "../hooks/useCountUp";

const PIECHART_COLORS = [
  "#38bdf8", // Cyan 400
  "#2563eb", // Blue 600
  "#06b6d4", // Cyan 500
  "#6366f1", // Indigo 500
  "#10b981", // Emerald 500
  "#f43f5e", // Rose 500
  "#8b5cf6", // Purple 500
];

const SPEED_RANGES = [
  { label: "All speeds", value: "" },
  { label: "10 — 20 km/h", value: "10-20" },
  { label: "20 — 40 km/h", value: "20-40" },
  { label: "40 — 60 km/h", value: "40-60" },
  { label: "60 — 80 km/h", value: "60-80" },
  { label: "80 — 100 km/h", value: "80-100" },
  { label: "100+ km/h", value: "100+" },
];

const RANGE_MAP = {
  "10-20": { min_speed: 10, max_speed: 20 },
  "20-40": { min_speed: 20, max_speed: 40 },
  "40-60": { min_speed: 40, max_speed: 60 },
  "60-80": { min_speed: 60, max_speed: 80 },
  "80-100": { min_speed: 80, max_speed: 100 },
  "100+": { min_speed: 100 },
};

const EMPTY_FILTERS = {
  camera_id: "",
  vehicle_type: "",
  date_from: "",
  date_to: "",
  speed_range: "",
};

function StatCard({ icon: Icon, label, value, accent, index = 0 }) {
  const rawNum =
    typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
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
      className="group relative glass-card top-accent-bar p-3 sm:p-4 flex items-center gap-3 overflow-hidden animate-rise shadow-sm border border-slate-200/90 dark:border-cyan-500/15"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className={`shrink-0 p-2 sm:p-2.5 rounded-xl bg-blue-500/10 dark:bg-cyan-500/15 ${accent} transition-transform duration-200 group-hover:scale-105 shadow-sm`}
      >
        <Icon size={18} className="sm:hidden" />
        <Icon size={20} className="hidden sm:block" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold truncate">
          {label}
        </p>
        <p className="font-display text-base sm:text-xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight truncate mt-0.5">
          {formattedDisplay}
        </p>
      </div>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  iconClass = "text-cyan-500",
  title,
  subtitle,
  children,
}) {
  return (
    <div className="glass-card top-accent-bar p-4 sm:p-5 shadow-sm border border-slate-200/90 dark:border-cyan-500/20 transition-all duration-200">
      <div className="mb-4">
        <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {Icon && <Icon size={16} className={iconClass} />}
          <span>{title}</span>
        </h2>
        {subtitle && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-cyan-500/20 rounded-xl px-3 py-2 shadow-xl text-xs min-w-[120px] z-50">
      {label && (
        <p className="text-slate-500 dark:text-slate-400 font-bold mb-1 pb-1 border-b border-slate-100 dark:border-white/10 text-[11px]">
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0 shadow-sm"
            style={{ background: p.color || p.fill }}
          />
          <span className="text-slate-600 dark:text-slate-300 capitalize font-medium text-xs">
            {p.name}
          </span>
          <span className="text-slate-900 dark:text-slate-100 font-mono font-bold ml-auto text-xs">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DailyColumnChart({ data = [], isDark }) {
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#475569";
  return (
    <ResponsiveContainer width="100%" height={230}>
      <RBarChart
        data={data}
        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
        barCategoryGap="28%"
      >
        <defs>
          <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={1} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
          angle={-20}
          textAnchor="end"
          height={35}
        />
        <YAxis
          tick={{ fill: tickColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={30}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? "#ffffff" : "#0f172a", opacity: isDark ? 0.04 : 0.05 }} />
        <Bar
          dataKey="count"
          name="Vehicles"
          fill="url(#dailyGradient)"
          radius={[5, 5, 0, 0]}
          maxBarSize={36}
          minPointSize={3}
          animationDuration={600}
        />
      </RBarChart>
    </ResponsiveContainer>
  );
}

function CameraBarChart({ data = [], isDark }) {
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#475569";
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <RBarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        barCategoryGap="28%"
      >
        <defs>
          <linearGradient id="cameraGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: tickColor, fontSize: 11 }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="camera_name"
          tick={{ fill: tickColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? "#ffffff" : "#0f172a", opacity: isDark ? 0.04 : 0.05 }} />
        <Bar
          dataKey="count"
          name="Vehicles"
          fill="url(#cameraGradient)"
          radius={[0, 5, 5, 0]}
          maxBarSize={22}
          minPointSize={3}
          animationDuration={600}
        />
      </RBarChart>
    </ResponsiveContainer>
  );
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
      <div className="space-y-4 animate-rise">
        <div className="h-7 w-40 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="glass-card p-3 sm:p-4 h-[72px] flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-16 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                <div className="h-4 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card h-[280px] rounded-2xl animate-pulse bg-slate-100/50 dark:bg-white/[0.02]" />
          <div className="glass-card h-[280px] rounded-2xl animate-pulse bg-slate-100/50 dark:bg-white/[0.02]" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 py-20 text-center">
        <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
          <AlertTriangle size={24} />
        </div>
        <p className="text-slate-800 dark:text-slate-200 text-sm font-bold">
          Could not load telemetry analytics
        </p>
        <button
          onClick={fetchData}
          className="mt-1 text-xs font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/25 transition-all"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const typeTotal = data.by_type.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-4 sm:space-y-5 animate-rise">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
          Traffic Velocity & Pattern Analytics
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
          Comprehensive velocity distributions, capture volumes, and vehicle classification insights
        </p>
      </div>

      {/* Filter Controls */}
      <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/20">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 sm:hidden active:bg-slate-100/50 dark:active:bg-white/5"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
            <SlidersHorizontal size={14} className="text-cyan-500" />
            <span>Filter Analytics</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </span>
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 ${
              filtersOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <div
          className={`${
            filtersOpen ? "block" : "hidden"
          } sm:block p-3.5 sm:p-4 ${
            filtersOpen ? "border-t border-slate-200/80 dark:border-cyan-500/15 sm:border-t-0" : ""
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 items-end">
            <div className="lg:col-span-3">
              <Field label="Camera">
                <ConfigProvider theme={antdTheme}>
                  <Select
                    value={filters.camera_id || undefined}
                    placeholder="All Cameras"
                    onChange={(v) => setFilters((f) => ({ ...f, camera_id: v || "" }))}
                    allowClear
                    className="w-full"
                    options={[
                      { value: "", label: "All Cameras" },
                      ...cameras.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </ConfigProvider>
              </Field>
            </div>

            <div className="lg:col-span-3">
              <Field label="Vehicle Type">
                <ConfigProvider theme={antdTheme}>
                  <Select
                    value={filters.vehicle_type || undefined}
                    placeholder="All Types"
                    onChange={(v) => setFilters((f) => ({ ...f, vehicle_type: v || "" }))}
                    allowClear
                    className="w-full"
                    options={[
                      { value: "", label: "All Types" },
                      ...vehicleTypes.map((t) => ({ value: t, label: t })),
                    ]}
                  />
                </ConfigProvider>
              </Field>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <SplitDateTime
                value={filters.date_from}
                onChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
                dateLabel="Start Date"
                timeLabel="Time"
                defaultTime="00:00"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <SplitDateTime
                value={filters.date_to}
                onChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
                dateLabel="End Date"
                timeLabel="Time"
                defaultTime="23:59"
              />
            </div>

            <div className="lg:col-span-3">
              <Field label="Speed Range">
                <ConfigProvider theme={antdTheme}>
                  <Select
                    value={filters.speed_range || undefined}
                    placeholder="All Speeds"
                    onChange={(v) => setFilters((f) => ({ ...f, speed_range: v || "" }))}
                    allowClear
                    className="w-full"
                    options={SPEED_RANGES.map((r) => ({ value: r.value, label: r.label }))}
                  />
                </ConfigProvider>
              </Field>
            </div>

            <div className="sm:col-span-2 lg:col-span-9 flex items-center gap-2 pt-1.5 border-t border-slate-200/80 dark:border-cyan-500/15 lg:border-t-0 lg:pt-0">
              <button
                type="button"
                onClick={applyFilters}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-sm shadow-blue-500/25 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Filter size={13} />
                <span>Apply Filters</span>
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20 transition-all active:scale-95 font-semibold"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <StatCard
          icon={Car}
          label="Tracked Vehicles"
          value={data.total}
          accent="text-blue-500 dark:text-cyan-400"
          index={0}
        />
        <StatCard
          icon={Gauge}
          label="Average Velocity"
          value={`${data.avg_speed} km/h`}
          accent="text-cyan-600 dark:text-cyan-300"
          index={1}
        />
        <StatCard
          icon={Zap}
          label="Peak Velocity"
          value={`${data.max_speed} km/h`}
          accent="text-indigo-500 dark:text-indigo-300"
          index={2}
        />
        <StatCard
          icon={AlertTriangle}
          label="Speed Violations"
          value={data.overspeed_count}
          accent="text-rose-500 dark:text-rose-400"
          index={3}
        />
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut Chart */}
        <ChartCard
          icon={Car}
          iconClass="text-blue-500 dark:text-cyan-400"
          title="Vehicle Classification Breakdown"
          subtitle="Relative distribution of detected vehicle classes"
        >
          <div className="flex flex-col sm:flex-row items-center sm:justify-center gap-4 py-1">
            <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_type}
                    dataKey="count"
                    nameKey="vehicle_type"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    onMouseEnter={(_, i) => setActiveSlice(i)}
                    onMouseLeave={() => setActiveSlice(null)}
                  >
                    {data.by_type.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIECHART_COLORS[i % PIECHART_COLORS.length]}
                        stroke={isDark ? "#0c1322" : "#ffffff"}
                        strokeWidth={2}
                        opacity={activeSlice === null || activeSlice === i ? 1 : 0.35}
                        style={{
                          transition: "opacity 150ms ease, filter 150ms ease",
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
                <span className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {typeTotal.toLocaleString()}
                </span>
                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                  Total
                </span>
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
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs transition-colors cursor-default ${
                      activeSlice === i
                        ? "bg-slate-100 dark:bg-white/10 font-bold"
                        : "hover:bg-slate-50 dark:hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ background: PIECHART_COLORS[i % PIECHART_COLORS.length] }}
                    />
                    <span className="text-slate-700 dark:text-slate-200 capitalize truncate mr-auto font-medium">
                      {d.vehicle_type}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 font-semibold text-[11px]">
                      {pct}%
                    </span>
                    <span className="text-slate-900 dark:text-slate-100 font-mono font-bold w-10 text-right tabular-nums text-xs">
                      {d.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>

        {/* Speed Distribution Chart */}
        <ChartCard
          icon={Gauge}
          iconClass="text-cyan-500"
          title="Velocity Distribution Spectrum"
          subtitle="Vehicle population counts categorized by velocity brackets"
        >
          <ResponsiveContainer width="100%" height={230}>
            <RBarChart
              data={data.by_speed_range}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              barCategoryGap="24%"
            >
              <defs>
                <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}
                vertical={false}
              />
              <XAxis
                dataKey="range"
                tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }}
                axisLine={{ stroke: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? "#ffffff" : "#0f172a", opacity: 0.04 }} />
              <Bar
                dataKey="count"
                name="Vehicles"
                fill="url(#speedGradient)"
                radius={[5, 5, 0, 0]}
                maxBarSize={40}
                minPointSize={3}
                animationDuration={600}
              />
            </RBarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Daily Captures Timeline */}
      <ChartCard
        icon={TrendingUp}
        iconClass="text-blue-500 dark:text-cyan-400"
        title="Daily Enforcement Volume Trend"
        subtitle="Chronological vehicle capture volume over the monitoring timeline"
      >
        <DailyColumnChart data={data.by_day} isDark={isDark} />
      </ChartCard>

      {/* Enforcement By Camera */}
      <ChartCard
        icon={Camera}
        iconClass="text-emerald-500"
        title="Enforcement Density by Camera Node"
        subtitle="Detection throughput distribution across deployed camera hardware"
      >
        <CameraBarChart data={data.by_camera} isDark={isDark} />
      </ChartCard>
    </div>
  );
}
