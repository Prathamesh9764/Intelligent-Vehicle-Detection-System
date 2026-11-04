import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Text } from "react-konva";
import {
  ArrowLeft,
  Save,
  X,
  Trash2,
  CheckCircle2,
  MapPin,
  Ruler,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { API_BASE } from "../api/client";
import client from "../api/client";
import { useTheme } from "../context/ThemeContext";

const ASPECT = 16 / 9;

const P = {
  ROI: "roi",
  GATE0: "gate0",
  GATE1: "gate1",
  DONE: "done",
};

export default function ZoneManager() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const [bgImage, setBgImage] = useState(null);
  const [phase, setPhase] = useState(P.ROI);
  const [zones, setZones] = useState([]);
  const [roiPoints, setRoiPoints] = useState([]);
  const [gate0, setGate0] = useState(null);
  const [gate1, setGate1] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 450 });
  const [frameSize, setFrameSize] = useState({ w: 1280, h: 720 });
  const [gateDistance, setGateDistance] = useState(15.0);
  const [showSavedZones, setShowSavedZones] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState("");

  const containerRef = useRef(null);
  const mountedRef = useRef(false);

  const colors = {
    primary: isDark ? "#38bdf8" : "#2563eb",
    roi: isDark ? "#2dd4bf" : "#0d9488",
    gate0: isDark ? "#38bdf8" : "#0284c7",
    gate1: isDark ? "#fb7185" : "#e11d48",
    roiFill: isDark ? "rgba(45, 212, 191, 0.2)" : "rgba(13, 148, 136, 0.16)",
    text: isDark ? "#f8fafc" : "#0f172a",
    muted: isDark ? "#94a3b8" : "#64748b",
  };

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const narrow = window.innerWidth < 1024;
    setIsNarrow(narrow);
    const padW = narrow ? 16 : 32;
    const padH = narrow ? 20 : 48;
    const availW = el.clientWidth - padW;
    const availH = el.clientHeight - padH;
    let w = Math.min(availW, availH * ASPECT);
    let h = w / ASPECT;
    if (w > 0 && h > 0) {
      setCanvasSize({ w: Math.floor(w), h: Math.floor(h) });
    }
  }, []);

  useEffect(() => {
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [updateSize]);

  const pixelPoint = (p) => [Math.round(p[0] * frameSize.w), Math.round(p[1] * frameSize.h)];

  const loadZones = useCallback(async () => {
    if (!selectedCam) return;
    try {
      const res = await client.get("/zones", {
        params: { camera_id: selectedCam, active_only: true },
      });
      setZones(res.data);
    } catch {
      console.warn("Failed to load zones");
    }
  }, [selectedCam]);

  const [searchParams] = useSearchParams();
  const presetCamera = searchParams.get("cameraId");

  useEffect(() => {
    client.get("/cameras").then(({ data }) => {
      setCameras(data);
      if (data.length > 0) {
        if (presetCamera && data.find((c) => c.id === presetCamera)) {
          setSelectedCam(presetCamera);
        } else {
          setSelectedCam(data[0].id);
        }
      }
    });
  }, [presetCamera]);

  useEffect(() => {
    if (selectedCam) loadZones();
  }, [loadZones, selectedCam]);

  const captureSnapshot = useCallback(async () => {
    if (!selectedCam) return;
    setLoadingSnapshot(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API_BASE}/cameras/${selectedCam}/snapshot`, {
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Snapshot failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        if (mountedRef.current) {
          setBgImage(img);
          setFrameSize({ w: img.naturalWidth, h: img.naturalHeight });
        }
        URL.revokeObjectURL(url);
        setLoadingSnapshot(false);
      };
      img.src = url;
    } catch {
      setLoadingSnapshot(false);
    }
  }, [selectedCam]);

  useEffect(() => {
    if (selectedCam) captureSnapshot();
  }, [captureSnapshot, selectedCam]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleNewZone = () => {
    setRoiPoints([]);
    setGate0(null);
    setGate1(null);
    setPhase(P.ROI);
    setMessage(null);
    setShowSavedZones(false);
    captureSnapshot();
  };

  const W = canvasSize.w;
  const H = canvasSize.h;

  const handleStageClick = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const nx = pos.x / W;
    const ny = pos.y / H;

    if (phase === P.ROI) {
      setRoiPoints((prev) => [...prev, [nx, ny]]);
    } else if (phase === P.GATE0) {
      if (!gate0) {
        setGate0([[nx, ny]]);
      } else if (gate0.length === 1) {
        setGate0([gate0[0], [nx, ny]]);
        setPhase(P.GATE1);
      }
    } else if (phase === P.GATE1) {
      if (!gate1) {
        setGate1([[nx, ny]]);
      } else if (gate1.length === 1) {
        setGate1([gate1[0], [nx, ny]]);
        setPhase(P.DONE);
      }
    }
  };

  const finishPolygon = () => {
    if (roiPoints.length < 3) return;
    setPhase(P.GATE0);
  };

  const phaseInfo = () => {
    if (phase === P.ROI)
      return {
        label: "1. Draw ROI Perimeter",
        desc: "Click inside video frame to set boundary vertices (min 3)",
        color: colors.roi,
      };
    if (phase === P.GATE0)
      return {
        label: "2. Set Entry Gate (Gate 0)",
        desc: "Click 2 points across the lane where vehicles enter",
        color: colors.gate0,
      };
    if (phase === P.GATE1)
      return {
        label: "3. Set Exit Gate (Gate 1)",
        desc: "Click 2 points across the lane where vehicles exit",
        color: colors.gate1,
      };
    return {
      label: "4. Distance Verification Complete",
      desc: "Specify distance in meters and deploy configuration",
      color: colors.primary,
    };
  };

  const resetAll = () => {
    setRoiPoints([]);
    setGate0(null);
    setGate1(null);
    setPhase(P.ROI);
    setMessage(null);
    setShowSavedZones(true);
  };

  const deleteZone = async (zoneId) => {
    try {
      await client.delete(`/zones/${zoneId}`);
      await loadZones();
      resetAll();
      setMessage({ type: "success", text: "Zone configuration removed" });
    } catch {
      setMessage({ type: "error", text: "Failed to delete zone" });
    }
  };

  const handleSave = async () => {
    if (roiPoints.length < 3) return;
    setSaving(true);
    setMessage(null);
    try {
      for (const z of zones) {
        try {
          await client.delete(`/zones/${z.id}`);
        } catch {}
      }

      const roiCoords = roiPoints.map((p) => pixelPoint(p));
      await client.post("/zones", {
        camera_id: selectedCam,
        name: "ROI",
        zone_type: "ROI",
        coords: roiCoords,
      });

      if (gate0 && gate1) {
        const gateCoords = [
          gate0.map((p) => pixelPoint(p)),
          gate1.map((p) => pixelPoint(p)),
        ];
        await client.post("/zones", {
          camera_id: selectedCam,
          name: "Speed Gates",
          zone_type: "SPEED_GATE",
          coords: gateCoords,
          gate_distance_meters: gateDistance,
        });
      }

      await loadZones();
      setShowSavedZones(true);
      setMessage({ type: "success", text: "Configuration deployed successfully" });
      setPhase(P.DONE);
      setTimeout(() => navigate("/live"), 1400);
    } catch (e) {
      console.warn("Save failed:", e);
      setMessage({ type: "error", text: "Failed to deploy configuration" });
    } finally {
      setSaving(false);
    }
  };

  const toScreen = (nx, ny) => [nx * W, ny * H];
  const info = phaseInfo();

  return (
    <div className="space-y-3.5 animate-rise">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/live")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-cyan-500 text-xs font-bold transition-colors py-1"
        >
          <ArrowLeft size={15} /> Return to Live Streams
        </button>

        <button
          onClick={captureSnapshot}
          disabled={loadingSnapshot}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 hover:border-cyan-500/40 text-slate-600 dark:text-slate-300 font-semibold"
          title="Refresh background video snapshot"
        >
          <RefreshCw size={13} className={loadingSnapshot ? "animate-spin" : ""} />
          <span>Refresh Snapshot</span>
        </button>
      </div>

      {/* Main Studio Frame */}
      <div className="glass-card top-accent-bar overflow-hidden shadow-lg border border-slate-200/90 dark:border-cyan-500/20 flex flex-col lg:flex-row min-h-[580px]">
        {/* Canvas Area */}
        <div
          ref={containerRef}
          className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 relative min-w-0 min-h-[300px] bg-slate-950/40 dark:bg-black/60 overflow-hidden"
        >
          {/* Phase HUD indicator */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-cyan-500/25 shadow-md z-20">
            <span
              className="w-2 h-2 rounded-full shrink-0 animate-pulse"
              style={{ backgroundColor: info.color }}
            />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {info.label}
            </span>
            <span className="hidden md:inline text-[11px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-white/10 pl-2">
              {info.desc}
            </span>
          </div>

          {/* Konva Stage Frame */}
          <div className="relative border-2 border-slate-400/25 dark:border-cyan-500/20 rounded-xl overflow-hidden shadow-xl bg-black">
            <Stage
              width={W}
              height={H}
              style={{ cursor: phase === P.DONE ? "default" : "crosshair", display: "block" }}
            >
              <Layer>
                {bgImage && <KonvaImage image={bgImage} width={W} height={H} />}

                {/* Click capture layer */}
                {phase !== P.DONE && (
                  <Rect
                    x={0}
                    y={0}
                    width={W}
                    height={H}
                    fill="transparent"
                    onClick={handleStageClick}
                    onTap={handleStageClick}
                  />
                )}

                {/* Saved zones */}
                {showSavedZones &&
                  zones.map((z) => {
                    if (z.zone_type === "ROI" && z.coords?.length >= 3) {
                      const pts = z.coords.flatMap((p) => toScreen(p[0], p[1]));
                      return (
                        <Line
                          key={z.id}
                          points={pts}
                          fill={colors.roiFill}
                          stroke={colors.roi}
                          strokeWidth={2}
                          closed
                          listening={false}
                        />
                      );
                    }
                    if (z.zone_type === "SPEED_GATE" && z.coords?.length === 2) {
                      return z.coords.map((g, gi) => {
                        const [x1, y1] = toScreen(g[0][0], g[0][1]);
                        const [x2, y2] = toScreen(g[1][0], g[1][1]);
                        return (
                          <Line
                            key={z.id + "-" + gi}
                            points={[x1, y1, x2, y2]}
                            stroke={gi === 0 ? colors.gate0 : colors.gate1}
                            strokeWidth={3}
                            lineCap="round"
                            listening={false}
                          />
                        );
                      });
                    }
                    return null;
                  })}

                {/* Drawing ROI */}
                {phase !== P.DONE && roiPoints.length >= 2 && (
                  <Line
                    points={roiPoints.flatMap((p) => toScreen(p[0], p[1]))}
                    stroke={colors.roi}
                    strokeWidth={2}
                    dash={[6, 4]}
                    listening={false}
                  />
                )}
                {roiPoints.length >= 3 && phase === P.ROI && (
                  <Line
                    points={roiPoints.flatMap((p) => toScreen(p[0], p[1]))}
                    fill={colors.roiFill}
                    stroke={colors.roi}
                    strokeWidth={2}
                    closed
                    dash={[6, 4]}
                    listening={false}
                  />
                )}
                {roiPoints.map((p, i) => {
                  const [sx, sy] = toScreen(p[0], p[1]);
                  return (
                    <Circle
                      key={"r" + i}
                      x={sx}
                      y={sy}
                      radius={5}
                      fill={colors.roi}
                      stroke="#fff"
                      strokeWidth={1.5}
                      listening={false}
                    />
                  );
                })}

                {/* Drawing Gate 0 */}
                {gate0 && gate0.length === 2 && (
                  <Line
                    points={toScreen(gate0[0][0], gate0[0][1]).concat(
                      toScreen(gate0[1][0], gate0[1][1])
                    )}
                    stroke={colors.gate0}
                    strokeWidth={3}
                    lineCap="round"
                    listening={false}
                  />
                )}
                {gate0 && gate0[0] && (
                  <Circle
                    x={toScreen(gate0[0][0], gate0[0][1])[0]}
                    y={toScreen(gate0[0][0], gate0[0][1])[1]}
                    radius={5}
                    fill={colors.gate0}
                    stroke="#fff"
                    strokeWidth={1.5}
                    listening={false}
                  />
                )}
                {gate0 && gate0.length === 2 && (
                  <Circle
                    x={toScreen(gate0[1][0], gate0[1][1])[0]}
                    y={toScreen(gate0[1][0], gate0[1][1])[1]}
                    radius={5}
                    fill={colors.gate0}
                    stroke="#fff"
                    strokeWidth={1.5}
                    listening={false}
                  />
                )}

                {/* Drawing Gate 1 */}
                {gate1 && gate1.length === 2 && (
                  <Line
                    points={toScreen(gate1[0][0], gate1[0][1]).concat(
                      toScreen(gate1[1][0], gate1[1][1])
                    )}
                    stroke={colors.gate1}
                    strokeWidth={3}
                    lineCap="round"
                    listening={false}
                  />
                )}
                {gate1 && gate1[0] && (
                  <Circle
                    x={toScreen(gate1[0][0], gate1[0][1])[0]}
                    y={toScreen(gate1[0][0], gate1[0][1])[1]}
                    radius={5}
                    fill={colors.gate1}
                    stroke="#fff"
                    strokeWidth={1.5}
                    listening={false}
                  />
                )}
                {gate1 && gate1.length === 2 && (
                  <Circle
                    x={toScreen(gate1[1][0], gate1[1][1])[0]}
                    y={toScreen(gate1[1][0], gate1[1][1])[1]}
                    radius={5}
                    fill={colors.gate1}
                    stroke="#fff"
                    strokeWidth={1.5}
                    listening={false}
                  />
                )}

                {!bgImage && (
                  <Text
                    x={W / 2}
                    y={H / 2}
                    text={
                      loadingSnapshot
                        ? "Capturing RTSP video snapshot…"
                        : "Click 'New Zone' or 'Refresh Snapshot'"
                    }
                    fontSize={12}
                    fill={colors.muted}
                    align="center"
                    verticalAlign="middle"
                    offsetX={120}
                    offsetY={8}
                    listening={false}
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-full lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 dark:border-cyan-500/15 flex flex-col justify-between bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-4 space-y-4">
          <div className="space-y-3.5">
            {/* Camera Select */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Select Camera Node
              </label>
              <select
                value={selectedCam}
                onChange={(e) => {
                  setSelectedCam(e.target.value);
                  handleNewZone();
                }}
                className="input w-full font-semibold cursor-pointer text-xs"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewZone}
                className="flex-1 py-1.5 px-3 rounded-lg bg-blue-500/10 text-blue-600 dark:text-cyan-400 font-bold text-xs hover:bg-blue-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={13} /> New Zone
              </button>
              {phase !== P.ROI && roiPoints.length > 0 && (
                <button
                  onClick={resetAll}
                  className="py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-semibold"
                  title="Reset points"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Status Message */}
            {message && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                  message.type === "success" ? "badge-safe" : "badge-critical"
                }`}
              >
                <span>{message.text}</span>
                <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Close Polygon CTA */}
            {phase === P.ROI && roiPoints.length >= 3 && (
              <button
                onClick={finishPolygon}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs py-2 rounded-lg shadow-sm shadow-teal-500/25 hover:shadow-md transition-all flex items-center justify-center gap-1.5 animate-rise"
              >
                <CheckCircle2 size={14} /> Lock In ROI Perimeter ({roiPoints.length} Points)
              </button>
            )}

            {/* Configuration Items List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <MapPin size={12} className="text-cyan-500" />
                <span>Zone Layers</span>
              </div>

              {/* ROI Polygon */}
              <div
                className={`p-2.5 rounded-xl border transition-all ${
                  roiPoints.length >= 3
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-800 dark:text-teal-200"
                    : "bg-slate-100/50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold block">1. ROI Polygon</span>
                    <span className="text-[10px] opacity-75">
                      {roiPoints.length >= 3
                        ? `${roiPoints.length} vertices captured`
                        : phase === P.ROI
                        ? "Click frame to place vertices…"
                        : "Pending"}
                    </span>
                  </div>
                  {roiPoints.length >= 3 && zones.find((z) => z.zone_type === "ROI") && (
                    <button
                      onClick={() =>
                        deleteZone(zones.find((z) => z.zone_type === "ROI").id)
                      }
                      className="text-rose-500 hover:text-rose-600 p-1 rounded-lg"
                      title="Delete ROI"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Gate 0 */}
              <div
                className={`p-2.5 rounded-xl border transition-all ${
                  gate0 && gate0.length === 2
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-cyan-200"
                    : "bg-slate-100/50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 text-slate-400"
                }`}
              >
                <span className="text-xs font-bold block">2. Gate 0 (Entry Line)</span>
                <span className="text-[10px] opacity-75">
                  {gate0 && gate0.length === 2
                    ? "2 boundary coordinates set"
                    : phase === P.GATE0
                    ? "Click 2 points for entry line…"
                    : "Pending"}
                </span>
              </div>

              {/* Gate 1 */}
              <div
                className={`p-2.5 rounded-xl border transition-all ${
                  gate1 && gate1.length === 2
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
                    : "bg-slate-100/50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 text-slate-400"
                }`}
              >
                <span className="text-xs font-bold block">3. Gate 1 (Exit Line)</span>
                <span className="text-[10px] opacity-75">
                  {gate1 && gate1.length === 2
                    ? "2 boundary coordinates set"
                    : phase === P.GATE1
                    ? "Click 2 points for exit line…"
                    : "Pending"}
                </span>
              </div>

              {/* Gate Distance Input */}
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  4. Distance Between Gates (m)
                </label>
                <div className="flex items-center gap-2">
                  <Ruler size={14} className="text-cyan-500 shrink-0" />
                  <input
                    type="number"
                    min={1}
                    max={200}
                    step={0.1}
                    value={gateDistance}
                    onChange={(e) => setGateDistance(parseFloat(e.target.value) || 15.0)}
                    disabled={!gate0 || !gate1}
                    className="input w-full font-mono font-bold text-xs !py-1"
                  />
                  <span className="text-xs font-bold text-slate-500">meters</span>
                </div>
              </div>
            </div>
          </div>

          {/* Deploy Save Button */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-white/10">
            <button
              onClick={handleSave}
              disabled={roiPoints.length < 3 || saving}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs py-2.5 px-3 rounded-lg shadow-sm shadow-blue-500/25 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin text-white" />
                  <span>Deploying…</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>Deploy Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
