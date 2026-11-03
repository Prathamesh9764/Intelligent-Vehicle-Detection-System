import { useEffect, useState } from "react";
import { Plus, X, Camera } from "lucide-react";
import client from "../api/client";

export default function CameraManager() {
  const [cameras, setCameras] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    client.get("/cameras").then(({ data }) => setCameras(data));
  }

  useEffect(load, []);

  async function toggleActive(cam) {
    const { data } = await client.put(`/cameras/${cam.id}`, { is_active: !cam.is_active });
    setCameras((list) => list.map((x) => (x.id === cam.id ? data : x)));
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-full lg:max-w-5xl animate-rise">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
            Cameras
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">
            Configure surveillance camera endpoints and RTSP streams
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md shadow-amber-500/25 hover:shadow-lg transition-all w-full sm:w-auto justify-center"
        >
          <Plus size={16} /> Add camera
        </button>
      </div>

      <div className="glass-card top-accent-bar overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100/60 dark:bg-white/[0.04] text-slate-500 dark:text-indigo-200/70 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-bold">Name</th>
                <th className="text-left px-5 py-4 font-bold">RTSP URL</th>
                <th className="text-left px-5 py-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {cameras.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-slate-500">
                    No cameras configured yet.
                  </td>
                </tr>
              ) : (
                cameras.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-200/80 dark:border-white/10 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-4 text-slate-900 dark:text-slate-100 font-semibold">
                      {c.name}
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs max-w-[320px] truncate">
                      {c.rtsp_url}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => toggleActive(c)}
                        className={`text-xs px-3 py-1 rounded-full font-bold border transition-all inline-flex items-center gap-1.5 ${
                          c.is_active ? "badge-safe" : "badge-busy"
                        }`}
                      >
                        {c.is_active && <span className="radar-dot w-2 h-2" />}
                        {c.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <CameraModal
          onClose={() => setModalOpen(false)}
          onCreated={(cam) => {
            setCameras((list) => [cam, ...list]);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CameraModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", rtsp_url: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/cameras", form);
      onCreated(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create camera");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-rise">
      <form
        onSubmit={handleSubmit}
        className="glass-card top-accent-bar p-6 sm:p-7 w-full max-w-md space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera size={20} className="text-amber-500" /> Add camera
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
            Name
          </label>
          <input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input w-full"
            placeholder="Gate 1"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
            RTSP URL
          </label>
          <input
            required
            value={form.rtsp_url}
            onChange={(e) => setForm((f) => ({ ...f, rtsp_url: e.target.value }))}
            className="input w-full font-mono text-xs"
            placeholder="rtsp://user:pass@192.168.1.100:554/stream"
          />
        </div>

        {error && (
          <div className="text-xs p-3 rounded-xl badge-critical font-semibold">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold py-2.5 rounded-xl shadow-md shadow-amber-500/25 hover:shadow-lg transition-all disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add camera"}
        </button>
      </form>
    </div>
  );
}
