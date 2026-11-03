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
  Gauge,
  ArrowRight,
  X,
} from "lucide-react";
import client, { API_BASE } from "../api/client";
import { DASHBOARD_FILTERS_KEY, DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

import SpeedReadout from "../components/SpeedReadout";
import MediaModal from "../components/MediaModal";
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

const EMPTY_FILTERS = { camera_id: "", vehicle_type: "", license_plate: "", date_from: "", date_to: "", speed_range: "" };

const readStoredState = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted or unavailable storage — fall through to defaults
  }
  return null;
};

const persistState = (state) => {
  try {
    sessionStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — state just won't persist
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

  const filtersFromParams = () => {
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
  };

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

  // Single source of truth for translating filter state into API params.
  // Used by the data fetch, the camera-count cards, and the XLSX export so
  // the exported rows always match what the Dashboard shows.
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
    const { data } = await client.get("/vehicles", { params });
    setRows(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [page, pageSize, appliedFilters, buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    persistState({ filters: appliedFilters, page, pageSize });
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    client.get("/vehicles/stats").then(({ data }) => setStats(data));
    client.get("/vehicles/camera-counts", { params: buildParams(appliedFilters) }).then(({ data }) => {
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
      link.download = `vehicle_detection_report_${dayjs().format("YYYY-MM-DD_HHmm")}.xlsx`;
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
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">
            Live capture feed across all lanes and cameras
          </p>
        </div>

        {/* Stat cards — 2-up on mobile, 4-up on desktop */}
        <div
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <StatCard icon={Car} label="Total captures" value={total} accent="text-amber-600 dark:text-amber-400" glow="bg-amber-500" index={0} />
          {cameraCounts.map((c, idx) => (
            <StatCard key={c.camera_name} icon={Camera} label={c.camera_name} value={c.count} accent="text-teal-600 dark:text-teal-400" glow="bg-teal-500" index={idx + 1} />
          ))}
        </div>

        {/* Filters */}
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
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-lane text-asphalt-950 text-[10px] font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
          </button>

          <div className={`${filtersOpen ? "block" : "hidden"} sm:block p-3 sm:p-4 ${filtersOpen ? "border-t border-asphalt-700 sm:border-t-0" : ""}`}>
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

              <Field label="License Plate" className="col-span-2 sm:col-span-1">
                <div className="relative">
                  <input
                    type="text"
                    value={filters.license_plate}
                    onChange={(e) => setFilters((f) => ({ ...f, license_plate: e.target.value }))}
                    placeholder="Search plate (partial ok)"
                    className="input w-full pr-8"
                  />
                  {filters.license_plate && (
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, license_plate: "" }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
                      title="Clear license plate search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
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
                <button
                  onClick={exportXlsx}
                  disabled={exporting || loading}
                  className="flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  <FileDown size={14} /> {exporting ? "Exporting…" : "Export XLSX"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="glass-card overflow-hidden">
          {/* Mobile / tablet: stacked cards */}
          <div className="md:hidden divide-y divide-slate-200/80 dark:divide-white/10">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <VehicleCardSkeleton key={i} />)
            ) : rows.length === 0 ? (
              <EmptyState />
            ) : (
              rows.map((v) => (
                <VehicleCard key={v.id} vehicle={v} speedLimit={stats?.speed_limit_kmh} onImage={setImageModal} />
              ))
            )}
          </div>

          {/* Desktop / large tablet: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[760px]">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/60 dark:bg-white/[0.04] text-slate-500 dark:text-indigo-200/70 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3.5 font-bold">Captured</th>
                  <th className="text-left px-4 py-3.5 font-bold">Camera</th>
                  <th className="text-left px-4 py-3.5 font-bold">Type</th>
                  <th className="text-left px-4 py-3.5 font-bold">
                    License Plate
                  </th>
                  <th className="text-left px-4 py-3.5 font-bold">Speed</th>
                  <th className="text-center px-4 py-3.5 font-bold">Vehicle Image</th>
                  <th className="text-left px-4 py-3.5 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-200/80 dark:border-white/10">
                      <td className="px-4 py-3.5"><div className="h-3 w-32 bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-14 bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-16 bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-6 mx-auto bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-10 ml-auto bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                      <td className="px-4 py-3.5"></td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="p-3 rounded-full bg-asphalt-900 text-slate-600">
                          <Car size={20} />
                        </div>
                        <p className="text-slate-400 text-sm font-medium">No captures match these filters</p>
                        <p className="text-slate-600 text-xs">Try adjusting the camera, type, date, or speed filters.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((v) => (
                    <tr key={v.id} className="border-t border-asphalt-700 hover:bg-asphalt-700/40 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs whitespace-nowrap">
                        {v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{v.camera_name || "—"}</td>
                      <td className="px-4 py-3 capitalize text-slate-300">{v.vehicle_type || "—"}</td>
                      <td className="px-4 py-3">
                        {v.license_plate_path ? (
                          <button
                            onClick={() =>
                              setImageModal({
                                path: v.license_plate_path,
                                title: v.license_plate_text
                                  ? `License Plate • ${v.license_plate_text}`
                                  : "License Plate",
                              })
                            }
                            className="font-mono text-slate-100 tracking-wider hover:text-lane hover:underline"
                            title="View license plate image"
                          >
                            {v.license_plate_text || "View plate"}
                          </button>
                        ) : (
                          <span className="font-mono text-slate-100 tracking-wider">
                            {v.license_plate_text || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SpeedReadout speed={v.speed} limit={stats?.speed_limit_kmh} />
                      </td>
                      <td className="px-4 py-3">
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
                              className="p-1.5 rounded-md text-slate-400 hover:text-lane hover:bg-asphalt-700/60 transition-colors"
                              title="View snapshot"
                            >
                              <Image size={18} />
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/vehicles/${v.id}`} className="group inline-flex items-center gap-1 text-lane text-xs hover:underline">
                          View <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 px-3 sm:px-4 py-3 border-t border-asphalt-700 text-xs text-slate-400">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="shrink-0">
                Total <span className="text-lane font-semibold">{total}</span> records
                {total > 0 && (
                  <>
                    {" "}| Showing <span className="text-slate-200 font-medium">{(page - 1) * pageSize + 1}</span> to{" "}
                    <span className="text-slate-200 font-medium">{Math.min(page * pageSize, total)}</span>
                  </>
                )}
              </span>

              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                {/* Pager: prev / numbers / next */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-md border border-asphalt-600 disabled:opacity-30 disabled:cursor-not-allowed hover:text-lane hover:border-lane/50 transition-colors active:scale-95"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {/* Full numbered pager — tablet and up */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {pageNumbers.map((n, i) =>
                      n === "..." ? (
                        <span key={`dots-${i}`} className="px-1 text-slate-600 select-none">
                          ···
                        </span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => setPage(n)}
                          className={`flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md border text-xs font-medium transition-colors active:scale-95 ${n === page
                            ? "bg-lane text-asphalt-950 border-lane"
                            : "border-asphalt-600 text-slate-300 hover:text-lane hover:border-lane/50"
                            }`}
                        >
                          {n}
                        </button>
                      )
                    )}
                  </div>

                  {/* Compact page indicator — phones only */}
                  <span className="sm:hidden text-slate-300 font-medium">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-md border border-asphalt-600 disabled:opacity-30 disabled:cursor-not-allowed hover:text-lane hover:border-lane/50 transition-colors active:scale-95"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Page size + jump */}
                <div className="flex items-center gap-2 sm:gap-3 sm:border-l sm:border-asphalt-700 sm:pl-3">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="input !py-1 !px-2 text-xs h-8 sm:h-7"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s} / page</option>
                    ))}
                  </select>

                  <span className="hidden sm:flex items-center gap-1.5">
                    Go to
                    <input
                      type="text"
                      inputMode="numeric"
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value.replace(/[^0-9]/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
                      onBlur={handleGoToPage}
                      className="input !py-1 !px-2 text-xs h-7 w-12 text-center"
                    />
                    Page
                  </span>
                </div>
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

function StatCard({ icon: Icon, label, value, accent, glow, index = 0 }) {
  const numericVal = typeof value === "number" ? value : parseInt(value, 10);
  const animatedVal = useCountUp(isNaN(numericVal) ? 0 : numericVal);
  const displayVal = isNaN(numericVal) ? value : animatedVal.toLocaleString();

  return (
    <div
      className="group relative glass-card top-accent-bar p-3.5 sm:p-5 flex items-center gap-3.5 sm:gap-4 overflow-hidden animate-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className={`shrink-0 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 ${accent} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
        <Icon size={18} className="sm:hidden" />
        <Icon size={22} className="hidden sm:block" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-indigo-200/70 uppercase tracking-wider font-bold truncate">
          {label}
        </p>
        <p className="font-display text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight truncate mt-0.5">
          {displayVal}
        </p>
      </div>
    </div>
  );
}

function VehicleCard({ vehicle: v, speedLimit, onImage }) {
  return (
    <div className="p-3.5 active:bg-asphalt-700/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
            {v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <Camera size={12} className="text-slate-500 shrink-0" />
            <span className="truncate">{v.camera_name || "—"}</span>
            <span className="text-slate-700">•</span>
            <span className="capitalize truncate">{v.vehicle_type || "—"}</span>
          </div>
        </div>
        <Link
          to={`/vehicles/${v.id}`}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-lane bg-asphalt-900 hover:bg-lane hover:text-asphalt-950 transition-colors active:scale-95"
          aria-label="View details"
        >
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {v.license_plate_path ? (
          <button
            onClick={() =>
              onImage({
                path: v.license_plate_path,
                title: v.license_plate_text
                  ? `License Plate • ${v.license_plate_text}`
                  : "License Plate",
              })
            }
            className="font-mono text-base text-slate-100 tracking-wider hover:text-lane"
            title="View license plate image"
          >
            {v.license_plate_text || "View plate"}
          </button>
        ) : (
          <span className="font-mono text-base text-slate-100 tracking-wider">
            {v.license_plate_text || "—"}
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-slate-400">
            <Gauge size={12} />
            <SpeedReadout speed={v.speed} limit={speedLimit} />
          </div>
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
              className="p-1.5 rounded-md text-slate-400 bg-asphalt-900 hover:text-lane transition-colors active:scale-95"
              aria-label="View vehicle image"
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
    <div className="p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-2.5 w-28 bg-asphalt-700/60 rounded animate-pulse" />
          <div className="h-2.5 w-20 bg-asphalt-700/60 rounded animate-pulse" />
        </div>
        <div className="w-8 h-8 rounded-lg bg-asphalt-700/60 animate-pulse" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-asphalt-700/60 rounded animate-pulse" />
        <div className="h-4 w-16 bg-asphalt-700/60 rounded animate-pulse" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="p-3 rounded-full bg-asphalt-900 text-slate-600">
          <Car size={20} />
        </div>
        <p className="text-slate-400 text-sm font-medium">No captures match these filters</p>
        <p className="text-slate-600 text-xs">Try adjusting the camera, type, date, or speed filters.</p>
      </div>
    </div>
  );
}