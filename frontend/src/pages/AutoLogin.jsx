import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

const AUTO_LOGIN_DATE_FROM = "2026-09-21 00:00";
const AUTO_LOGIN_DATE_TO = "2026-09-22 23:59";

/**
 * AutoLogin — reads ?token= and ?user= from the URL,
 * auto-authenticates into Intelligent-Vehicle-Detection-System
 * and redirects to the dashboard.
 */
export default function AutoLogin() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const userRaw = params.get("user");

    if (!token || !userRaw) {
      navigate("/login", { replace: true });
      return;
    }

    let user = null;
    try {
      user = JSON.parse(userRaw);
    } catch {
      try {
        user = JSON.parse(decodeURIComponent(userRaw));
      } catch {
        navigate("/login", { replace: true });
        return;
      }
    }

    signIn(token, user);

    let active = true;
    (async () => {
      try {
        await client.get("/auth/me");
      } catch (err) {
        if (err?.response?.status === 401 || err?.response?.status === 403) return;
      }
      if (active) {
        sessionStorage.setItem(DASHBOARD_KEEP_FLAG, "1");
        const nextParams = new URLSearchParams({
          date_from: AUTO_LOGIN_DATE_FROM,
          date_to: AUTO_LOGIN_DATE_TO,
        });
        navigate(`/?${nextParams.toString()}`, { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, signIn]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080c16] text-white p-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-3.5 animate-pulse">
        <ScanLine className="text-white" size={24} />
      </div>
      <p className="font-display text-base font-bold text-shimmer-blue tracking-wide mb-1.5">
        Intelligent-Vehicle-Detection-System
      </p>
      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
        <Loader2 size={15} className="animate-spin text-cyan-400" />
        <span>Authenticating remote telemetry session…</span>
      </div>
    </div>
  );
}
