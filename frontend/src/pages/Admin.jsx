import { useEffect, useState } from "react";
import { Plus, Trash2, X, Users } from "lucide-react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    client.get("/users").then(({ data }) => setUsers(data));
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
    if (!confirm(`Remove user "${u.username}"?`)) return;
    await client.delete(`/users/${u.id}`);
    setUsers((list) => list.filter((x) => x.id !== u.id));
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-full lg:max-w-4xl animate-rise">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
            User Access
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">
            Manage operator permissions, security roles, and console access
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md shadow-amber-500/25 hover:shadow-lg transition-all w-full sm:w-auto justify-center"
        >
          <Plus size={16} /> New user
        </button>
      </div>

      <div className="glass-card top-accent-bar overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100/60 dark:bg-white/[0.04] text-slate-500 dark:text-indigo-200/70 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-bold">Username</th>
                <th className="text-left px-5 py-4 font-bold">Role</th>
                <th className="text-left px-5 py-4 font-bold">Status</th>
                <th className="text-right px-5 py-4 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-slate-200/80 dark:border-white/10 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-5 py-4 text-slate-900 dark:text-slate-100 font-semibold">
                    {u.username}
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={u.role || "viewer"}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={u.id === currentUser.id}
                      className="input !py-1 !px-2.5 text-xs font-semibold capitalize"
                    >
                      <option value="admin">admin</option>
                      <option value="operator">operator</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={u.id === currentUser.id}
                      className={`text-xs px-3 py-1 rounded-full font-bold border transition-all inline-flex items-center gap-1.5 ${
                        u.is_active ? "badge-safe" : "badge-busy"
                      }`}
                    >
                      {u.is_active && <span className="radar-dot w-2 h-2" />}
                      {u.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => remove(u)}
                      disabled={u.id === currentUser.id}
                      className="text-rose-600 dark:text-rose-400 hover:underline text-xs font-bold inline-flex items-center gap-1 ml-auto disabled:opacity-30 disabled:hover:no-underline"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
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
    setSaving(true);
    setError("");
    try {
      const { data } = await client.post("/users", form);
      onCreated(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-rise">
      <form
        onSubmit={handleSubmit}
        className="glass-card top-accent-bar p-6 sm:p-7 w-full max-w-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-amber-500" /> New user
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
            Username
          </label>
          <input
            required
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="input w-full"
            placeholder="operator id"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
            Password
          </label>
          <input
            required
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="input w-full"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold mb-1.5">
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="input w-full capitalize"
          >
            <option value="admin">admin</option>
            <option value="operator">operator</option>
            <option value="viewer">viewer</option>
          </select>
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
          {saving ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
