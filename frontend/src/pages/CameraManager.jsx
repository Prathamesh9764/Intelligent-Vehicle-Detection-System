import { useEffect, useState } from "react";
import { Plus, X, Camera, ShieldAlert, Loader2 } from "lucide-react";
import client from "../api/client";

export default function CameraManager() {
  const [cameras, setCameras] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    client
      .get("/cameras")
      .then(({ data }) => setCameras(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleActive(cam) {
    try {
      const { data } = await client.put(`/cameras/${cam.id}`, { is_active: !cam.is_active });
      setCameras((list) => list.map((x) => (x.id === cam.id ? data : x)));
    } catch (err) {
      console.error("Could not toggle camera active state:", err);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-full lg:max-w-5xl animate-rise">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
            Surveillance Camera Nodes
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Configure surveillance camera endpoints, RTSP streams, and telemetry feeds
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm shadow-blue-500/25 transition-all w-full sm:w-auto justify-center active:scale-95"
        >
          <Plus size={15} /> Add Camera Node
        </button>
      </div>

      <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/20">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-cyan-500/15">
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Node Name
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  RTSP Stream Endpoint
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-t border-slate-200/80 dark:border-white/10"
                  >
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-60 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-20 bg-slate-200 dark:bg-white/10 rounded-full animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : cameras.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-14 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Camera size={26} className="opacity-30 text-cyan-500" />
                      <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                        No cameras configured yet
                      </p>
                      <p className="text-xs text-slate-400">
                        Click "Add Camera Node" above to connect an RTSP stream.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                cameras.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-200/80 dark:border-cyan-500/10 hover:bg-slate-50/80 dark:hover:bg-cyan-500/[0.04] transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-cyan-500">
                        <Camera size={15} />
                      </div>
                      <span>{c.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs max-w-[340px] truncate">
                      {c.rtsp_url}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(c)}
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-all inline-flex items-center gap-1.5 active:scale-95 ${
                          c.is_active ? "badge-safe" : "badge-busy"
                        }`}
                        title={c.is_active ? "Click to disable" : "Click to activate"}
                      >
                        {c.is_active && <span className="radar-dot w-1.5 h-1.5" />}
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
    if (!form.name.trim() || !form.rtsp_url.trim()) {
      setError("Please complete all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/cameras", form);
      onCreated(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not register camera endpoint.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-rise"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card top-accent-bar p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl border border-slate-300 dark:border-cyan-500/25"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-cyan-500/15">
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera size={18} className="text-cyan-500" /> Add Surveillance Node
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold">
            Camera Node Name
          </label>
          <input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input w-full text-xs"
            placeholder="e.g. North Gate Lane 1"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold">
            RTSP Stream URL
          </label>
          <input
            required
            value={form.rtsp_url}
            onChange={(e) => setForm((f) => ({ ...f, rtsp_url: e.target.value }))}
            className="input w-full font-mono text-xs"
            placeholder="rtsp://user:password@192.168.1.100:554/live"
          />
        </div>

        {error && (
          <div className="text-xs p-2.5 rounded-xl badge-critical font-semibold flex items-center gap-2">
            <ShieldAlert size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-2 rounded-xl shadow-md shadow-blue-500/25 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 text-xs"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin text-white" />
                <span>Registering…</span>
              </>
            ) : (
              <span>Add Node</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
