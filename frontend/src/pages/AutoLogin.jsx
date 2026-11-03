import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { DASHBOARD_KEEP_FLAG } from "../utils/filterStorage";

// Date range to pre-filter the Dashboard when arriving via AutoLogin.
const AUTO_LOGIN_DATE_FROM = "2026-09-21 00:00";
const AUTO_LOGIN_DATE_TO   = "2026-09-22 23:59";

/**
 * AutoLogin — reads ?token= and ?user= from the URL,
 * stores them (same keys as the normal login flow) and updates the
 * AuthContext, then redirects to the dashboard without showing the login form.
 *
 * Used by the MoodScope Analytic Dashboard to auto-authenticate
 * when opening Speed OCR from the project card.
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
        // 401/403: interceptor already clears storage and redirects to /login
        if (err?.response?.status === 401 || err?.response?.status === 403) return;
      }
      if (active) {
        // Set the keep-filters flag so Dashboard won't clear the URL params.
        sessionStorage.setItem(DASHBOARD_KEEP_FLAG, "1");
        const params = new URLSearchParams({
          date_from: AUTO_LOGIN_DATE_FROM,
          date_to: AUTO_LOGIN_DATE_TO,
        });
        navigate(`/?${params.toString()}`, { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, signIn]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-asphalt-900">
      <p className="text-slate-400 text-sm tracking-wide animate-pulse">
        Authenticating…
      </p>
    </div>
  );
}
