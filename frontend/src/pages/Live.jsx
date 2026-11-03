import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, MapPin, WifiOff, ArrowLeft } from "lucide-react";
import { API_BASE } from "../api/client";
import client from "../api/client";

function CameraTile({ cameraId, name, frame, connected, onClick }) {
  return (
    <div
      className="glass-card overflow-hidden cursor-pointer group p-2.5 transition-all duration-300"
      onClick={() => onClick(cameraId)}
    >
      <div className="relative rounded-xl overflow-hidden aspect-video bg-black/40">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
            <Camera size={24} className="opacity-40" />
            <span>No stream available</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 py-2.5 flex items-center justify-between">
          <span className="text-white text-sm font-semibold truncate block drop-shadow-sm">
            {name}
          </span>
          {connected && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/40 text-[10px] font-bold text-teal-300">
              <span className="radar-dot w-2 h-2" /> LIVE
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
      const wsUrl = API_BASE.replace(/^http/, "ws") + `/cameras/${cameraId}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { if (mountedRef.current) setConnected(true); };
      ws.onclose = () => {
        setConnected(false);
        if (mountedRef.current) {
          setTimeout(() => { if (mountedRef.current) connectCam(); }, 3000);
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-300 dark:border-white/10 hover:border-amber-500/40 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all -ml-1"
            title="Back to all cameras"
          >
            <ArrowLeft size={18} />
          </button>
          <Camera size={22} className={connected ? "text-teal-500" : "text-slate-400"} />
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-shimmer-gold">
            {cameraName || "Live feed"}
          </h1>
        </div>

        <span
          className={`text-xs px-3 py-1 rounded-full border font-bold shrink-0 inline-flex items-center gap-1.5 ${
            connected ? "badge-safe" : "badge-busy"
          }`}
        >
          {connected && <span className="radar-dot" />}
          {connected ? "Connected" : "Disconnected"}
        </span>

        <button
          onClick={() => onCreateZone(cameraId)}
          className="text-xs flex items-center gap-1.5 shrink-0 bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 rounded-xl font-bold shadow-md shadow-amber-500/25 hover:shadow-lg transition-all sm:ml-auto"
        >
          <MapPin size={14} /> Create a New Zone
        </button>
      </div>

      {!connected && (
        <div className="flex items-center gap-2 text-xs font-semibold p-3.5 rounded-xl badge-critical">
          <WifiOff size={16} /> Camera stream not available
        </div>
      )}

      <div className="glass-card overflow-hidden p-3">
        <div className="rounded-xl overflow-hidden bg-black/60 relative">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ minHeight: "280px", maxHeight: "720px" }}
          />
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
              <Camera size={28} className="opacity-30" />
              <span>Waiting for camera telemetry stream…</span>
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

  // Fetch camera metadata once
  useEffect(() => {
    client.get("/cameras").then(({ data }) => setCameras(data));
  }, []);

  // Single batch WebSocket for grid view
  const wsRef = useRef(null);
  useEffect(() => {
    if (cameraId) return;
    const token = localStorage.getItem("token") || "";
    const wsUrl = API_BASE.replace(/^http/, "ws") + `/cameras/ws/stream?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const { cameras: camData } = JSON.parse(event.data);
        const frames = {};
        for (const c of camData) {
          frames[c.id] = { frame: c.frame, fps: c.fps, connected: c.connected, name: c.name };
        }
        setCameraFrames(frames);
      } catch (e) {
        // ignore parse errors
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
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-shimmer-gold leading-tight">
            Live Feed
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-indigo-200/70 mt-1 font-medium">
            Multi-camera real-time surveillance matrix
          </p>
        </div>

        <button
          onClick={() => navigate(`/zones?cameraId=${cameras[0]?.id || ""}`)}
          disabled={cameras.length === 0}
          className="text-xs flex items-center justify-center gap-2 shrink-0 bg-gradient-to-r from-amber-500 to-amber-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-amber-500/25 hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <MapPin size={15} /> Create a New Zone
        </button>
      </div>

      {cameras.length === 0 && (
        <div className="glass-card py-20 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
          <Camera size={26} className="opacity-40" />
          <span>No cameras available in matrix</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
