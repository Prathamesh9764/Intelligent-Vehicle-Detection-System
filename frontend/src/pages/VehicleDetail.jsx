import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, ImageOff, Video, Play } from "lucide-react";
import client, { API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";

import SpeedReadout from "../components/SpeedReadout";
import MediaModal from "../components/MediaModal";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";
  const [v, setV] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
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
    try {
      const payload = {
        vehicle_type: form.vehicle_type || null,
        speed: form.speed === "" ? null : Number(form.speed),
        license_plate_text: form.license_plate_text || null,
      };
      const { data } = await client.patch(`/vehicles/${id}`, payload);
      setV(data);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this capture permanently?")) return;
    await client.delete(`/vehicles/${id}`);
    navigate("/");
  }

  if (!v) {
    return (
      <div className="py-20 text-center text-slate-500 font-medium text-sm">
        Loading capture record…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6 sm:space-y-8 animate-rise">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 text-sm font-semibold transition-colors"
      >
        <ArrowLeft size={16} /> Back to dashboard
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
            Capture Record
          </h1>
          <p className="text-xs text-slate-500 dark:text-indigo-200/70 font-mono mt-1">
            Telemetry ID: {v.id}
          </p>
        </div>
        <div className="glass-card px-4 py-2 self-start sm:self-auto rounded-xl">
          <SpeedReadout speed={v.speed} limit={null} size="text-2xl sm:text-3xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ImagePanel
          title="Full screenshot"
          path={v.screenshot_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.screenshot_path}`);
            setMediaType("image");
            setMediaTitle(`Full screenshot${v.license_plate_text ? ` • ${v.license_plate_text}` : ""}`);
          }}
        />
        <ImagePanel
          title="License plate crop"
          path={v.license_plate_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.license_plate_path}`);
            setMediaType("image");
            setMediaTitle(v.license_plate_text ? `License Plate • ${v.license_plate_text}` : "License plate crop");
          }}
        />
        <VideoPanel
          title="Video"
          path={v.video_path}
          onOpen={() => {
            setMediaSrc(`${API_BASE}${v.video_path}`);
            setMediaType("video");
            setMediaTitle(`Vehicle video${v.license_plate_text ? ` • ${v.license_plate_text}` : ""}`);
          }}
        />
      </div>

      <div className="glass-card top-accent-bar p-6 sm:p-7 space-y-6">
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
          Record Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
              Vehicle type
            </label>
            <input
              value={form.vehicle_type}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              readOnly={isViewer}
              className={`input w-full ${isViewer ? "cursor-not-allowed opacity-80" : ""}`}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
              Speed (km/h)
            </label>
            <input
              type="number"
              step="0.1"
              value={form.speed}
              onChange={(e) => setForm((f) => ({ ...f, speed: e.target.value }))}
              readOnly={isViewer}
              className={`input w-full font-mono ${isViewer ? "cursor-not-allowed opacity-80" : ""}`}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
              License Plate
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
              className={`input w-full font-mono uppercase tracking-wider ${
                isViewer || !v.license_plate_text ? "cursor-not-allowed opacity-80" : ""
              }`}
            />
          </div>
          {v.license_plate_raw_ocr && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
                Raw OCR
              </label>
              <p className="input w-full font-mono uppercase tracking-wider select-all">
                {v.license_plate_raw_ocr}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
              Camera
            </label>
            <p className="text-slate-900 dark:text-slate-100 text-sm font-semibold py-2">
              {v.camera_name || "—"}
            </p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
              Captured at
            </label>
            <p className="text-slate-900 dark:text-slate-100 text-sm font-mono py-2">
              {v.entry_time ? new Date(v.entry_time).toLocaleString() : "--"}
            </p>
          </div>
        </div>

        {!isViewer && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-white/10">
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-sm font-bold hover:underline"
            >
              <Trash2 size={16} /> Delete record
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md shadow-amber-500/25 hover:shadow-lg transition-all disabled:opacity-60"
            >
              <Save size={16} /> {saving ? "Saving…" : "Save changes"}
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
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-indigo-200/70">
        {title}
      </div>
      {path ? (
        <img
          src={`${API_BASE}${path}`}
          alt={title}
          className="w-full h-56 object-contain bg-black/40 cursor-pointer hover:scale-105 transition-transform duration-300"
          onClick={onOpen}
        />
      ) : (
        <div className="w-full h-56 flex items-center justify-center text-slate-500 gap-2 text-sm bg-black/20">
          <ImageOff size={18} /> No image
        </div>
      )}
    </div>
  );
}

function VideoPanel({ title, path, onOpen }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-white/10 text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-indigo-200/70">
        {title}
      </div>
      {path ? (
        <div
          className="w-full h-56 flex items-center justify-center bg-black/40 cursor-pointer group relative"
          onClick={onOpen}
        >
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="rounded-full bg-black/60 p-4 group-hover:bg-amber-500/90 group-hover:scale-110 transition-all duration-300 shadow-lg">
              <Play size={28} className="text-white ml-0.5" />
            </div>
          </div>
          <video src={`${API_BASE}${path}`} className="w-full h-full object-cover" preload="metadata" />
        </div>
      ) : (
        <div className="w-full h-56 flex items-center justify-center text-slate-500 gap-2 text-sm bg-black/20">
          <Video size={18} /> No video
        </div>
      )}
    </div>
  );
}
