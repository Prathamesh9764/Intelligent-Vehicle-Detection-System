import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`min-h-screen relative flex items-center justify-center px-4 overflow-hidden ${
        isDark ? "theme-dark dark" : "theme-light"
      }`}
    >
      <div className="w-full max-w-sm relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-teal-600 flex items-center justify-center shadow-md shadow-amber-500/25 mb-3.5">
            <ScanLine className="text-white" size={28} />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-wider bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 dark:from-amber-300 dark:via-amber-200 dark:to-amber-400 bg-clip-text text-transparent leading-none">
            SPEED·OCR
          </h1>
          <p className="text-xs text-slate-500 dark:text-indigo-200/70 tracking-widest uppercase font-semibold mt-1.5">
            Enforcement Console
          </p>
        </div>

        {/* Glass Card Form */}
        <form
          onSubmit={handleSubmit}
          className="glass-card top-accent-bar p-7 sm:p-8 space-y-4"
        >
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold block mb-1.5">
              Username
            </label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full"
              placeholder="operator id"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 font-bold block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs font-semibold p-3 rounded-xl badge-critical">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white font-display font-bold tracking-wider py-3 rounded-xl shadow-md shadow-amber-500/25 hover:shadow-lg disabled:opacity-60 active:scale-[0.98] mt-2 transition-transform"
          >
            {loading ? "Authenticating…" : "SIGN IN"}
          </button>
        </form>
      </div>
    </div>
  );
}
