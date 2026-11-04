import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, MapPin, WifiOff, ArrowLeft, RefreshCw } from "lucide-react";
import { API_BASE } from "../api/client";
import client from "../api/client";

function CameraTile({ cameraId, name, frame, connected, onClick }) {
  return (
    <div
      className="glass-card top-accent-bar overflow-hidden cursor-pointer group p-2.5 transition-all duration-200 shadow-sm border border-slate-200/90 dark:border-cyan-500/15 hover:-translate-y-0.5"
      onClick={() => onClick(cameraId)}
    >
      <div className="relative rounded-xl overflow-hidden aspect-video bg-black/70 shadow-inner">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5">
            <Camera size={24} className="opacity-40 animate-pulse text-cyan-500" />
            <span className="font-medium text-slate-400 text-[11px]">Stream standby…</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 py-2 flex items-center justify-between">
          <span className="text-white text-xs font-bold truncate block drop-shadow-sm">
            {name}
          </span>
          {connected ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-bold text-emerald-300 shadow-sm">
              <span className="radar-dot w-1.5 h-1.5" /> LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/90 border border-slate-700/50 text-[9px] font-semibold text-slate-400">
              OFFLINE
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SingleCameraView({ cameraId, onBack, onCreateZone }) {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const mountedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [cameraName, setCameraName] = useState("");

  useEffect(() => {
    client.get(`/cameras/${cameraId}`).then(({ data }) => setCameraName(data.name));
  }, [cameraId]);

  useEffect(() => {
    if (!cameraId) return;
    mountedRef.current = true;
    wsRef.current?.close();

    function connectCam() {
      if (!mountedRef.current) return;
      const token = localStorage.getItem("token") || "";
      const wsUrl =
        API_BASE.replace(/^http/, "ws") +
        `/cameras/${cameraId}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) connectCam();
          }, 3000);
        }
      };
      ws.onerror = () => setConnected(false);

      ws.binaryType = "arraybuffer";
      ws.onmessage = (event) => {
        const blob = new Blob([event.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext("2d").drawImage(img, 0, 0);
          }
          URL.revokeObjectURL(url);
        };
        img.src = url;
      };
    }

    connectCam();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [cameraId]);

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl border border-slate-300 dark:border-white/10 hover:border-cyan-500/40 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all"
            title="Back to feeds"
            aria-label="Back to cameras"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-cyan-500">
            <Camera size={18} />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-shimmer-blue leading-tight">
              {cameraName || "Live Camera Stream"}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Real-time RTSP Telemetry Stream & Optical Recognition
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:self-auto self-start">
          <span
            className={`text-xs px-2.5 py-1 rounded-full border font-bold shrink-0 inline-flex items-center gap-1.5 ${
              connected ? "badge-safe" : "badge-busy"
            }`}
          >
            {connected && <span className="radar-dot" />}
            {connected ? "Stream Active" : "Connecting…"}
          </span>

          <button
            onClick={() => onCreateZone(cameraId)}
            className="text-xs flex items-center gap-1.5 shrink-0 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white px-3.5 py-1.5 rounded-lg font-bold shadow-sm shadow-blue-500/25 transition-all active:scale-95"
          >
            <MapPin size={13} /> Create Zone
          </button>
        </div>
      </div>

      {!connected && (
        <div className="flex items-center gap-2 text-xs font-semibold p-3 rounded-xl badge-busy animate-rise">
          <WifiOff size={15} className="shrink-0" />
          <span>Awaiting camera telemetry stream. Reconnecting automatically…</span>
        </div>
      )}

      <div className="glass-card top-accent-bar overflow-hidden p-2.5 shadow-md border border-slate-200/90 dark:border-cyan-500/20">
        <div className="rounded-xl overflow-hidden bg-black/90 relative scanline aspect-video max-h-[640px] flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ minHeight: "300px" }}
          />
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-slate-400 text-xs bg-black/60 backdrop-blur-sm">
              <RefreshCw size={24} className="opacity-40 animate-spin text-cyan-400" />
              <span className="font-medium">Connecting to surveillance telemetry feed…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Live() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cameraId = searchParams.get("cameraId");

  const [cameras, setCameras] = useState([]);
  const [cameraFrames, setCameraFrames] = useState({});

  useEffect(() => {
    client.get("/cameras").then(({ data }) => setCameras(data));
  }, []);

  const wsRef = useRef(null);
  useEffect(() => {
    if (cameraId) return;
    const token = localStorage.getItem("token") || "";
    const wsUrl =
      API_BASE.replace(/^http/, "ws") +
      `/cameras/ws/stream?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const { cameras: camData } = JSON.parse(event.data);
        const frames = {};
        for (const c of camData) {
          frames[c.id] = {
            frame: c.frame,
            fps: c.fps,
            connected: c.connected,
            name: c.name,
          };
        }
        setCameraFrames(frames);
      } catch (e) {
        // ignore parse error
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [cameraId]);

  if (cameraId) {
    return (
      <SingleCameraView
        cameraId={cameraId}
        onBack={() => navigate("/live")}
        onCreateZone={(id) => navigate(`/zones?cameraId=${id}`)}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-rise">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-shimmer-blue leading-tight">
            Live Surveillance Feeds
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Multi-node optical camera array and stream monitoring
          </p>
        </div>

        <button
          onClick={() => navigate(`/zones?cameraId=${cameras[0]?.id || ""}`)}
          disabled={cameras.length === 0}
          className="text-xs flex items-center justify-center gap-1.5 shrink-0 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white px-4 py-2 rounded-lg font-bold shadow-sm shadow-blue-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <MapPin size={14} /> Create a New Zone
        </button>
      </div>

      {cameras.length === 0 && (
        <div className="glass-card py-20 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 text-center border border-slate-200 dark:border-cyan-500/15">
          <Camera size={28} className="opacity-30 text-cyan-500 mb-1" />
          <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
            No camera streams configured
          </span>
          <span className="text-xs max-w-sm text-slate-400">
            Add surveillance camera RTSP endpoints in the Camera Nodes console.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {cameras.map((cam) => {
          const f = cameraFrames[cam.id];
          return (
            <CameraTile
              key={cam.id}
              cameraId={cam.id}
              name={cam.name}
              frame={f?.frame || null}
              connected={f?.connected || false}
              onClick={(id) => navigate(`/live?cameraId=${id}`)}
            />
          );
        })}
      </div>
    </div>
  );
}
