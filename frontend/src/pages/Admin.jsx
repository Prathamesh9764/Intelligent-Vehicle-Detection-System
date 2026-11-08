import { useEffect, useState } from "react";
import { Plus, Trash2, X, Users, Loader2, AlertCircle } from "lucide-react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    client
      .get("/users")
      .then(({ data }) => setUsers(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleActive(u) {
    const { data } = await client.patch(`/users/${u.id}`, { is_active: !u.is_active });
    setUsers((list) => list.map((x) => (x.id === u.id ? data : x)));
  }

  async function changeRole(u, role) {
    const { data } = await client.patch(`/users/${u.id}`, { role });
    setUsers((list) => list.map((x) => (x.id === u.id ? data : x)));
  }

  async function remove(u) {
    if (!window.confirm(`Revoke console access and remove user "${u.username}"?`))
      return;
    await client.delete(`/users/${u.id}`);
    setUsers((list) => list.filter((x) => x.id !== u.id));
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-full lg:max-w-4xl animate-rise">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
            Operator Access Control
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
            Manage enforcement credentials, security roles, and console authorization
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm shadow-blue-500/25 transition-all w-full sm:w-auto justify-center active:scale-95"
        >
          <Plus size={15} /> New Operator
        </button>
      </div>

      <div className="glass-card top-accent-bar overflow-hidden shadow-sm border border-slate-200/90 dark:border-cyan-500/20">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-cyan-500/15">
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Operator Profile
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Role & Permissions
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Account Status
                </th>
                <th className="text-right px-4 py-3 font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Actions
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
                      <div className="h-3.5 w-28 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-6 w-24 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-20 bg-slate-200 dark:bg-white/10 rounded-full animate-pulse" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-3.5 w-12 ml-auto bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-200/80 dark:border-cyan-500/10 hover:bg-slate-50/80 dark:hover:bg-cyan-500/[0.04] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-cyan-400 font-bold flex items-center justify-center text-xs shrink-0">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isCurrent && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-blue-700 dark:text-cyan-300 font-bold">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                              ID: {u.id?.slice?.(0, 8) || u.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={u.role || "viewer"}
                          onChange={(e) => changeRole(u, e.target.value)}
                          disabled={isCurrent}
                          className={`input !py-0.5 !px-2 text-xs font-bold capitalize ${
                            isCurrent ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <option value="admin">Administrator</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer (Read-only)</option>
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={isCurrent}
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-all inline-flex items-center gap-1.5 ${
                            isCurrent ? "opacity-60 cursor-not-allowed" : "active:scale-95"
                          } ${u.is_active ? "badge-safe" : "badge-busy"}`}
                        >
                          {u.is_active && <span className="radar-dot w-1.5 h-1.5" />}
                          {u.is_active ? "Active" : "Disabled"}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => remove(u)}
                          disabled={isCurrent}
                          className="text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                          title={isCurrent ? "Cannot delete active session" : "Revoke user access"}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <NewUserModal
          onClose={() => setModalOpen(false)}
          onCreated={(u) => {
            setUsers((list) => [u, ...list]);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Please specify both username and password.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/users", form);
      onCreated(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not register operator account.");
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
        className="glass-card top-accent-bar p-5 sm:p-6 w-full max-w-sm space-y-3.5 shadow-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#0c1424]"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-cyan-500/15">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={16} className="text-cyan-500" /> New Operator Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
            Username / Badge ID
          </label>
          <input
            required
            autoFocus
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="input w-full text-xs font-medium"
            placeholder="e.g. op_patrol04"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
            Initial Access Password
          </label>
          <input
            required
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="input w-full font-mono text-xs"
            placeholder="••••••••••••"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold">
            Assigned Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="input w-full capitalize font-semibold cursor-pointer text-xs"
          >
            <option value="admin">Administrator (Full Access)</option>
            <option value="operator">Operator (Read & Update)</option>
            <option value="viewer">Viewer (Read Only)</option>
          </select>
        </div>

        {error && (
          <div className="text-xs p-2.5 rounded-xl badge-critical font-semibold flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
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
                <span>Creating…</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
