import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Trash2,
  ImageOff,
  Video,
  Play,
  Calendar,
  Camera,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import client, { API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import SpeedReadout from "../components/SpeedReadout";
import MediaModal from "../components/MediaModal";
import PlateBadge from "../components/PlateBadge";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";
  const [v, setV] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [mediaSrc, setMediaSrc] = useState(null);
  const [mediaType, setMediaType] = useState("image");
  const [mediaTitle, setMediaTitle] = useState("");

  useEffect(() => {
    sessionStorage.setItem(DASHBOARD_KEEP_FLAG, "1");
  }, []);

  useEffect(() => {
    client.get(`/vehicles/${id}`).then(({ data }) => {
      setV(data);
      setForm({
        vehicle_type: data.vehicle_type || "",
        speed: data.speed ?? "",
        license_plate_text: data.license_plate_text || "",
      });
    });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const payload = {
        vehicle_type: form.vehicle_type || null,
        speed: form.speed === "" ? null : Number(form.speed),
        license_plate_text: form.license_plate_text || null,
      };
      const { data } = await client.patch(`/vehicles/${id}`, payload);
      setV(data);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to permanently delete this capture record?"))
      return;
    await client.delete(`/vehicles/${id}`);
    navigate("/");
  }

  if (!v) {
    return (
      <div className="py-20 text-center text-slate-500 font-medium text-xs animate-pulse">
        Loading capture telemetry record…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4 sm:space-y-5 animate-rise">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-cyan-500 text-xs font-bold transition-colors"
      >
        <ArrowLeft size={15} /> Back to Dashboard
      </Link>

      {/* Record Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
              Vehicle Capture Record
            </h1>
            {v.license_plate_text && (
              <PlateBadge text={v.license_plate_text} size="sm" />
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Telemetry Record ID: {v.id}
          </p>
        </div>

        <div className="glass-card px-4 py-2 self-start sm:self-auto rounded-xl shadow-sm border border-slate-200/90 dark:border-cyan-500/20">
          <SpeedReadout speed={v.speed} limit={null} size="text-xl sm:text-2xl" />
        </div>
      </div>

      {/* Media Inspection Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        <ImagePanel
          title="Full Scene Snapshot"
          path={v.screenshot_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.screenshot_path}`);
            setMediaType("image");
            setMediaTitle(
              `Full Scene Capture${v.license_plate_text ? ` • ${v.license_plate_text}` : ""}`
            );
          }}
        />
        <ImagePanel
          title="License Plate Crop"
          path={v.license_plate_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.license_plate_path}`);
            setMediaType("image");
            setMediaTitle(
              v.license_plate_text
                ? `License Plate Inspection • ${v.license_plate_text}`
                : "License Plate Crop"
            );
          }}
        />
        <VideoPanel
          title="Motion Video Clip"
          path={v.video_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.video_path}`);
            setMediaType("video");
            setMediaTitle(
              `High-Speed Verification Video${v.license_plate_text ? ` • ${v.license_plate_text}` : ""}`
            );
          }}
        />
      </div>

      {/* Record Details Form */}
      <div className="glass-card top-accent-bar p-5 sm:p-6 space-y-4 shadow-md border border-slate-200/90 dark:border-cyan-500/20">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Telemetry Attributes
          </h2>
          {savedSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full animate-rise">
              <CheckCircle2 size={13} /> Saved successfully
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
              Vehicle Classification
            </label>
            <input
              value={form.vehicle_type}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              readOnly={isViewer}
              className={`input w-full capitalize font-semibold text-xs ${
                isViewer ? "cursor-not-allowed opacity-80" : ""
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
              Calculated Velocity (km/h)
            </label>
            <input
              type="number"
              step="0.1"
              value={form.speed}
              onChange={(e) => setForm((f) => ({ ...f, speed: e.target.value }))}
              readOnly={isViewer}
              className={`input w-full font-mono font-bold text-xs ${
                isViewer ? "cursor-not-allowed opacity-80" : ""
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
              Verified License Plate
            </label>
            <input
              value={form.license_plate_text}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  license_plate_text: e.target.value.toUpperCase(),
                }))
              }
              readOnly={isViewer}
              disabled={!v.license_plate_text}
              className={`input w-full font-mono uppercase tracking-wider font-bold text-xs ${
                isViewer || !v.license_plate_text ? "cursor-not-allowed opacity-80" : ""
              }`}
            />
          </div>

          {v.license_plate_raw_ocr && (
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
                Raw Neural OCR String
              </label>
              <div className="input w-full font-mono uppercase tracking-wider select-all text-xs bg-slate-100 dark:bg-black/30 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 font-semibold flex items-center !py-1">
                {v.license_plate_raw_ocr}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
              Camera Node
            </label>
            <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 text-xs font-semibold py-1">
              <Camera size={14} className="text-cyan-500" />
              <span>{v.camera_name || "—"}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
              Capture Timestamp
            </label>
            <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 text-xs font-mono py-1">
              <Calendar size={14} className="text-blue-500" />
              <span>{v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}</span>
            </div>
          </div>
        </div>

        {!isViewer && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-200/80 dark:border-white/10">
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 size={14} /> Delete Record
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs px-5 py-2 rounded-lg shadow-sm shadow-blue-500/25 transition-all disabled:opacity-60 active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin text-white" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {mediaSrc && (
        <MediaModal
          src={mediaSrc}
          type={mediaType}
          title={mediaTitle}
          onClose={() => {
            setMediaSrc(null);
            setMediaTitle("");
          }}
        />
      )}
    </div>
  );
}

function ImagePanel({ title, path, onOpen }) {
  return (
    <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/15">
      <div className="px-3.5 py-2 border-b border-slate-200/80 dark:border-cyan-500/15 text-[11px] uppercase tracking-wider font-bold text-slate-800 dark:text-slate-200 bg-slate-50/70 dark:bg-white/[0.02]">
        {title}
      </div>
      {path ? (
        <div
          className="w-full h-48 bg-black/70 flex items-center justify-center p-2 cursor-pointer group overflow-hidden"
          onClick={onOpen}
        >
          <img
            src={`${API_BASE}${path}`}
            alt={title}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-250"
          />
        </div>
      ) : (
        <div className="w-full h-48 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-1.5 text-xs bg-slate-100/70 dark:bg-slate-950/40">
          <ImageOff size={20} className="opacity-40" />
          <span>No image stored</span>
        </div>
      )}
    </div>
  );
}

function VideoPanel({ title, path, onOpen }) {
  return (
    <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/15">
      <div className="px-3.5 py-2 border-b border-slate-200/80 dark:border-cyan-500/15 text-[11px] uppercase tracking-wider font-bold text-slate-800 dark:text-slate-200 bg-slate-50/70 dark:bg-white/[0.02]">
        {title}
      </div>
      {path ? (
        <div
          className="w-full h-48 flex items-center justify-center bg-black/70 cursor-pointer group relative overflow-hidden"
          onClick={onOpen}
        >
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="rounded-full bg-black/60 p-3 group-hover:bg-blue-600/90 group-hover:scale-110 transition-all duration-200 shadow-xl border border-white/20">
              <Play size={22} className="text-white ml-0.5" />
            </div>
          </div>
          <video
            src={`${API_BASE}${path}`}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            preload="metadata"
          />
        </div>
      ) : (
        <div className="w-full h-48 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-1.5 text-xs bg-slate-100/70 dark:bg-slate-950/40">
          <Video size={20} className="opacity-40" />
          <span>No video capture stored</span>
        </div>
      )}
    </div>
  );
}
