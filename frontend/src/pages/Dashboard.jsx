import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Select, ConfigProvider } from "antd";
import dayjs from "dayjs";
import {
  Car,
  Camera,
  FileDown,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Image,
  SlidersHorizontal,
  ChevronDown,
  ArrowRight,
  X,
  Search,
  Filter,
} from "lucide-react";
import client, { API_BASE } from "../api/client";
import { DASHBOARD_FILTERS_KEY, DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

import SpeedReadout from "../components/SpeedReadout";
import MediaModal from "../components/MediaModal";
import PlateBadge from "../components/PlateBadge";
import { Field, SplitDateTime } from "../components/filterControls";
import { useTheme } from "../context/ThemeContext";
import { useCountUp } from "../hooks/useCountUp";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
  license_plate: "",
  date_from: "",
  date_to: "",
  speed_range: "",
};

const readStoredState = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable
  }
  return null;
};

const persistState = (state) => {
  try {
    sessionStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable
  }
};

export default function Dashboard() {
  const { antdTheme } = useTheme();
  const stored = readStoredState();
  const [keepFilters] = useState(() => {
    const flag = sessionStorage.getItem(DASHBOARD_KEEP_FLAG);
    sessionStorage.removeItem(DASHBOARD_KEEP_FLAG);
    return flag === "1";
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(stored?.page || 1);
  const [pageSize, setPageSize] = useState(stored?.pageSize || 20);
  const [goToPage, setGoToPage] = useState("");
  const [stats, setStats] = useState(null);
  const [cameraCounts, setCameraCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  const filtersFromParams = useCallback(() => {
    const get = (k, dflt = "") => {
      const v = searchParams.get(k);
      return v === null ? dflt : v;
    };
    return {
      camera_id: get("camera_id"),
      vehicle_type: get("vehicle_type"),
      license_plate: get("license_plate"),
      date_from: get("date_from"),
      date_to: get("date_to"),
      speed_range: get("speed_range"),
    };
  }, [searchParams]);

  const initialFilters = (() => {
    if (!keepFilters) return { ...EMPTY_FILTERS };
    const hasParams = [...searchParams.keys()].length > 0;
    if (hasParams) return filtersFromParams();
    if (stored) return { ...EMPTY_FILTERS, ...(stored.filters || stored) };
    return filtersFromParams();
  })();

  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [imageModal, setImageModal] = useState(null);

  useEffect(() => {
    client.get("/vehicles/types").then(({ data }) => setVehicleTypes(data));
    client.get("/cameras").then(({ data }) => setCameras(data));
  }, []);

  const buildParams = useCallback((f) => {
    const params = {};
    Object.entries(f).forEach(([k, v]) => {
      if (v === "" || v === false) return;
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
    return params;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = { page, page_size: pageSize, ...buildParams(appliedFilters) };
    try {
      const { data } = await client.get("/vehicles", { params });
      setRows(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch vehicles:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedFilters, buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    persistState({ filters: appliedFilters, page, pageSize });
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    client.get("/vehicles/stats").then(({ data }) => setStats(data));
    client
      .get("/vehicles/camera-counts", { params: buildParams(appliedFilters) })
      .then(({ data }) => {
        setCameraCounts(data.filter((c) => c.count > 0));
      });
  }, [appliedFilters, buildParams]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageNumbers = useMemo(() => {
    const delta = 1;
    const range = [];
    const rangeWithDots = [];
    let last;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        range.push(i);
      }
    }
    for (const i of range) {
      if (last) {
        if (i - last === 2) rangeWithDots.push(last + 1);
        else if (i - last > 2) rangeWithDots.push("...");
      }
      rangeWithDots.push(i);
      last = i;
    }
    return rangeWithDots;
  }, [page, totalPages]);

  const handleGoToPage = () => {
    const n = parseInt(goToPage, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n);
    }
    setGoToPage("");
  };

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v !== "");
  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPage(1);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    setSearchParams(params, { replace: true });
    setFiltersOpen(false);
  };

  const resetFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setPage(1);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const exportXlsx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = buildParams(appliedFilters);
      const res = await client.get("/vehicles/export", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `IVDS_detection_report_${dayjs().format("YYYY-MM-DD_HHmm")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!keepFilters) {
      setSearchParams({}, { replace: true });
      sessionStorage.removeItem(DASHBOARD_FILTERS_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="space-y-4 sm:space-y-5 animate-rise">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
              Intelligent-Vehicle-Detection-System
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Real-time vehicle detection, optical speed tracking, and automated ANPR telemetry
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={exportXlsx}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl border border-cyan-500/40 text-blue-600 dark:text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-400 transition-all active:scale-95 disabled:opacity-50 font-bold"
            >
              <FileDown size={14} />
              <span>{exporting ? "Exporting…" : "Export XLSX"}</span>
            </button>
          </div>
        </div>

        {/* Stat cards grid (compact & responsive) */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
          <StatCard
            icon={Car}
            label="Total Captures"
            value={total}
            accent="text-blue-500 dark:text-cyan-400"
            index={0}
          />
          {cameraCounts.map((c, idx) => (
            <StatCard
              key={c.camera_name}
              icon={Camera}
              label={c.camera_name}
              value={c.count}
              accent="text-cyan-600 dark:text-cyan-300"
              index={idx + 1}
            />
          ))}
        </div>

        {/* Filter Controls Card */}
        <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/20">
          {/* Mobile collapsible toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 sm:hidden active:bg-slate-100/50 dark:active:bg-white/5"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <SlidersHorizontal size={14} className="text-cyan-500" />
              <span>Filter Telemetry</span>
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

          {/* Form fields */}
          <div
            className={`${
              filtersOpen ? "block" : "hidden"
            } sm:block p-3.5 sm:p-4 ${
              filtersOpen ? "border-t border-slate-200/80 dark:border-cyan-500/15 sm:border-t-0" : ""
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 items-end">
              {/* Camera Filter */}
              <div className="lg:col-span-2">
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

              {/* Vehicle Type Filter */}
              <div className="lg:col-span-2">
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

              {/* License Plate Search */}
              <div className="lg:col-span-2">
                <Field label="License Plate">
                  <div className="relative flex items-center">
                    <Search
                      size={13}
                      className="absolute left-2.5 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={filters.license_plate}
                      onChange={(e) => setFilters((f) => ({ ...f, license_plate: e.target.value }))}
                      placeholder="Search plate…"
                      className="input w-full pl-7 pr-7 text-xs font-mono"
                    />
                    {filters.license_plate && (
                      <button
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, license_plate: "" }))}
                        className="absolute right-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                        title="Clear license plate search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </Field>
              </div>

              {/* Date From */}
              <div className="sm:col-span-2 lg:col-span-2">
                <SplitDateTime
                  value={filters.date_from}
                  onChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
                  dateLabel="Start Date"
                  timeLabel="Time"
                  defaultTime="00:00"
                />
              </div>

              {/* Date To */}
              <div className="sm:col-span-2 lg:col-span-2">
                <SplitDateTime
                  value={filters.date_to}
                  onChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
                  dateLabel="End Date"
                  timeLabel="Time"
                  defaultTime="23:59"
                />
              </div>

              {/* Speed Range Filter */}
              <div className="lg:col-span-2">
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

              {/* Action Buttons */}
              <div className="sm:col-span-2 lg:col-span-12 flex items-center gap-2 pt-1.5 border-t border-slate-200/80 dark:border-cyan-500/15">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-sm shadow-blue-500/25 hover:shadow-md transition-all active:scale-95 flex items-center gap-1.5"
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
                {activeFilterCount > 0 && (
                  <span className="text-[11px] text-slate-500 dark:text-cyan-400 ml-auto font-medium">
                    {activeFilterCount} active filter{activeFilterCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Results Section */}
        <div className="glass-card overflow-hidden shadow-md border border-slate-200/90 dark:border-cyan-500/20">
          {/* Mobile view: list of cards */}
          <div className="md:hidden divide-y divide-slate-200/80 dark:divide-white/10">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <VehicleCardSkeleton key={i} />)
            ) : rows.length === 0 ? (
              <EmptyState />
            ) : (
              rows.map((v) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  speedLimit={stats?.speed_limit_kmh}
                  onImage={setImageModal}
                />
              ))
            )}
          </div>

          {/* Desktop view: structured table with responsive column sizing */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs table-fixed min-w-[760px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Captured Time
                  </th>
                  <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Camera
                  </th>
                  <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    License Plate
                  </th>
                  <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Velocity
                  </th>
                  <th className="text-center px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Snapshot
                  </th>
                  <th className="text-right px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr
                      key={i}
                      className="border-t border-slate-200/80 dark:border-white/10"
                    >
                      <td className="px-4 py-3">
                        <div className="h-3 w-28 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-12 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 w-24 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-16 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-6 w-6 mx-auto bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12">
                      <EmptyState />
                    </td>
                  </tr>
                ) : (
                  rows.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-slate-200/80 dark:border-cyan-500/10 hover:bg-slate-50/80 dark:hover:bg-cyan-500/[0.04] transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100 font-semibold truncate">
                        {v.camera_name || "—"}
                      </td>
                      <td className="px-4 py-2.5 capitalize text-slate-700 dark:text-slate-300 font-medium">
                        {v.vehicle_type || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <PlateBadge
                          text={v.license_plate_text}
                          size="sm"
                          onClick={
                            v.license_plate_path
                              ? () =>
                                  setImageModal({
                                    path: v.license_plate_path,
                                    title: v.license_plate_text
                                      ? `License Plate • ${v.license_plate_text}`
                                      : "License Plate Crop",
                                  })
                              : undefined
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SpeedReadout
                          speed={v.speed}
                          limit={stats?.speed_limit_kmh}
                          showBadge
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center">
                          {v.screenshot_path ? (
                            <button
                              onClick={() =>
                                setImageModal({
                                  path: v.screenshot_path,
                                  title: `Vehicle Snapshot${
                                    v.license_plate_text ? ` • ${v.license_plate_text}` : ""
                                  }`,
                                })
                              }
                              className="p-1 rounded-lg text-slate-500 hover:text-cyan-500 hover:bg-cyan-500/10 transition-colors"
                              title="View snapshot image"
                            >
                              <Image size={16} />
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          to={`/vehicles/${v.id}`}
                          className="group inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-cyan-400 hover:text-blue-700 dark:hover:text-cyan-300 transition-colors"
                        >
                          <span>Details</span>
                          <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                            →
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar (Responsive & Clean on all viewports) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 border-t border-slate-200/80 dark:border-cyan-500/15 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-white/[0.01]">
            <span className="shrink-0 font-medium">
              Total{" "}
              <span className="text-blue-600 dark:text-cyan-400 font-bold">{total}</span>{" "}
              captures
              {total > 0 && (
                <>
                  {" "}
                  | Showing{" "}
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">
                    {(page - 1) * pageSize + 1}
                  </span>{" "}
                  to{" "}
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">
                    {Math.min(page * pageSize, total)}
                  </span>
                </>
              )}
            </span>

            <div className="flex items-center flex-wrap justify-between sm:justify-end gap-2">
              {/* Prev / Numbers / Next */}
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:text-blue-600 dark:hover:text-cyan-400 hover:border-cyan-500/40 transition-colors active:scale-95"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Numbered pager */}
                <div className="hidden sm:flex items-center gap-1">
                  {pageNumbers.map((n, i) =>
                    n === "..." ? (
                      <span key={`dots-${i}`} className="px-1 text-slate-400 select-none text-xs">
                        ···
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`flex items-center justify-center min-w-[26px] h-7 px-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${
                          n === page
                            ? "bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 border-blue-600 dark:border-cyan-400 shadow-sm font-bold"
                            : "border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 hover:text-blue-600 dark:hover:text-cyan-400"
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                </div>

                <span className="sm:hidden text-slate-800 dark:text-slate-200 font-bold px-1.5 text-xs">
                  {page} / {totalPages}
                </span>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:text-blue-600 dark:hover:text-cyan-400 hover:border-cyan-500/40 transition-colors active:scale-95"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Page size & Go to */}
              <div className="flex items-center gap-1.5 sm:border-l sm:border-slate-300 dark:sm:border-white/10 sm:pl-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input !py-0.5 !px-1.5 text-xs h-7 font-medium cursor-pointer"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} / page
                    </option>
                  ))}
                </select>

                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Go to
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
                    onBlur={handleGoToPage}
                    className="input !py-0.5 !px-1 text-xs h-7 w-11 text-center font-bold"
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {imageModal && (
        <MediaModal
          src={`${API_BASE}${typeof imageModal === "string" ? imageModal : imageModal.path}`}
          title={typeof imageModal === "object" ? imageModal.title : undefined}
          type="image"
          onClose={() => setImageModal(null)}
        />
      )}
    </>
  );
}

function StatCard({ icon: Icon, label, value, accent, index = 0 }) {
  const numericVal = typeof value === "number" ? value : parseInt(value, 10);
  const animatedVal = useCountUp(isNaN(numericVal) ? 0 : numericVal);
  const displayVal = isNaN(numericVal) ? value : animatedVal.toLocaleString();

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
          {displayVal}
        </p>
      </div>
    </div>
  );
}

function VehicleCard({ vehicle: v, speedLimit, onImage }) {
  return (
    <div className="p-3.5 active:bg-slate-100/60 dark:active:bg-white/[0.03] transition-colors">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 font-semibold">
            <Camera size={13} className="text-cyan-500 shrink-0" />
            <span className="truncate">{v.camera_name || "—"}</span>
            <span className="text-slate-400">•</span>
            <span className="capitalize truncate font-bold">{v.vehicle_type || "—"}</span>
          </div>
        </div>
        <Link
          to={`/vehicles/${v.id}`}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-cyan-400 hover:bg-blue-600 hover:text-white transition-all active:scale-95"
          aria-label="View vehicle details"
        >
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <PlateBadge
          text={v.license_plate_text}
          size="sm"
          onClick={
            v.license_plate_path
              ? () =>
                  onImage({
                    path: v.license_plate_path,
                    title: v.license_plate_text
                      ? `License Plate • ${v.license_plate_text}`
                      : "License Plate Crop",
                  })
              : undefined
          }
        />

        <div className="flex items-center gap-2 shrink-0">
          <SpeedReadout speed={v.speed} limit={speedLimit} showBadge />
          {v.screenshot_path ? (
            <button
              onClick={() =>
                onImage({
                  path: v.screenshot_path,
                  title: `Vehicle Snapshot${
                    v.license_plate_text ? ` • ${v.license_plate_text}` : ""
                  }`,
                })
              }
              className="p-1 rounded-lg text-slate-500 hover:text-cyan-500 hover:bg-cyan-500/10 transition-colors"
              aria-label="View snapshot image"
            >
              <Image size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VehicleCardSkeleton() {
  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <div className="h-3 w-28 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
        </div>
        <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 animate-pulse" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-5 w-24 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
        <div className="h-5 w-16 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center text-center">
      <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-cyan-400 flex items-center justify-center mb-2.5">
        <Car size={22} />
      </div>
      <p className="text-slate-900 dark:text-slate-100 text-sm font-bold">
        No vehicle captures match these telemetry filters
      </p>
      <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 max-w-sm">
        Try adjusting the camera node, timestamp boundaries, vehicle classification, or velocity brackets.
      </p>
    </div>
  );
}
