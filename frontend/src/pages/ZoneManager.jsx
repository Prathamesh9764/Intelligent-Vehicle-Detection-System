import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Arrow, Rect, Text } from 'react-konva';
import { ArrowLeft, Save, X, Trash2, BoxSelect, CheckCircle2, Cpu, MapPin, Ruler, Camera, Plus } from 'lucide-react';
import { API_BASE } from '../api/client';
import client from '../api/client';

const ASPECT = 16 / 9;

const P = {
  ROI: 'roi',
  GATE0: 'gate0',
  GATE1: 'gate1',
  DONE: 'done',
};

const COLORS = {
  bg: '#0a0820',
  card: '#121424',
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
  primary: '#d97706',
  roi: '#2dd4bf',
  gate0: '#ffc46b',
  gate1: '#fb7185',
  roiFill: 'rgba(45, 212, 191, 0.18)',
};

export default function ZoneManager() {
  const navigate = useNavigate();
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

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const narrow = window.innerWidth < 768;
    setIsNarrow(narrow);
    const padW = narrow ? 16 : 48;
    const padH = narrow ? 24 : 80;
    const availW = el.clientWidth - padW;
    const availH = el.clientHeight - padH;
    let w = Math.min(availW, availH * ASPECT);
    let h = w / ASPECT;
    setCanvasSize({ w: Math.floor(w), h: Math.floor(h) });
  }, []);

  useEffect(() => {
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateSize); };
  }, [updateSize]);

  const normPoint = (p) => frameSize.w ? [p[0] / frameSize.w, p[1] / frameSize.h] : p;
  const pixelPoint = (p) => [Math.round(p[0] * frameSize.w), Math.round(p[1] * frameSize.h)];

  const loadZones = useCallback(async () => {
    if (!selectedCam) return;
    try {
      const res = await client.get('/zones', { params: { camera_id: selectedCam, active_only: true } });
      setZones(res.data);
    } catch { console.warn('Failed to load zones'); }
  }, [selectedCam]);

  const [searchParams] = useSearchParams();
  const presetCamera = searchParams.get("cameraId");

  useEffect(() => {
    client.get("/cameras").then(({ data }) => {
      setCameras(data);
      if (data.length > 0) {
        if (presetCamera && data.find(c => c.id === presetCamera)) {
          setSelectedCam(presetCamera);
        } else {
          setSelectedCam(data[0].id);
        }
      }
    });
  }, [presetCamera]);

  useEffect(() => { if (selectedCam) loadZones(); }, [loadZones, selectedCam]);
  const captureSnapshot = useCallback(async () => {
    if (!selectedCam) return;
    setLoadingSnapshot(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API_BASE}/cameras/${selectedCam}/snapshot`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Snapshot failed');
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
  useEffect(() => { if (selectedCam) captureSnapshot(); }, [captureSnapshot, selectedCam]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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
      setRoiPoints(prev => [...prev, [nx, ny]]);
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
    if (phase === P.ROI) return { label: 'Draw ROI Polygon', desc: 'Click to place polygon vertices', color: COLORS.roi };
    if (phase === P.GATE0) return { label: 'Gate 0 (Entry)', desc: 'Click 2 points for the entry line', color: COLORS.gate0 };
    if (phase === P.GATE1) return { label: 'Gate 1 (Exit)', desc: 'Click 2 points for the exit line', color: COLORS.gate1 };
    return { label: 'Complete', desc: 'Configuration ready to save', color: COLORS.primary };
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
      setMessage({ type: 'success', text: 'Zone deleted' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete zone' });
    }
  };

  const handleSave = async () => {
    if (roiPoints.length < 3) return;
    setSaving(true);
    setMessage(null);
    try {
      // Delete all old zones, then create fresh
      for (const z of zones) {
        try { await client.delete(`/zones/${z.id}`); } catch {}
      }

      const roiCoords = roiPoints.map(p => pixelPoint(p));
      await client.post('/zones', { camera_id: selectedCam, name: 'ROI', zone_type: 'ROI', coords: roiCoords });

      if (gate0 && gate1) {
        const gateCoords = [gate0.map(p => pixelPoint(p)), gate1.map(p => pixelPoint(p))];
        await client.post('/zones', {
          camera_id: selectedCam, name: 'Speed Gates', zone_type: 'SPEED_GATE',
          coords: gateCoords, gate_distance_meters: gateDistance,
        });
      }

      await loadZones();
      setShowSavedZones(true);
      setMessage({ type: 'success', text: 'Configuration deployed successfully' });
      setPhase(P.DONE);
      setTimeout(() => navigate('/live'), 1500);
    } catch (e) {
      console.warn('Save failed:', e);
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const toScreen = (nx, ny) => [nx * W, ny * H];

  const info = phaseInfo();

  return (
    <div className="space-y-4 animate-rise">
      <button
        onClick={() => navigate('/live')}
        className="inline-flex items-center gap-2 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 text-sm font-semibold transition-colors py-1"
      >
        <ArrowLeft size={16} /> Go Back to Live Feed
      </button>
    <div className="glass-card overflow-hidden" style={{
      display: 'flex', flexDirection: isNarrow ? 'column' : 'row',
      height: isNarrow ? 'auto' : 'calc(100vh - 140px)',
      minHeight: isNarrow ? 'calc(100vh - 140px)' : undefined,
      width: '100%',
    }}>

      {/* ── Canvas ── */}
      <div ref={containerRef} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: isNarrow ? '12px' : '24px', position: 'relative',
        minWidth: 0, minHeight: isNarrow ? '280px' : 0, overflow: 'hidden',
      }}>

        {/* Phase indicator */}
        <div style={{
          position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '6px', backgroundColor: COLORS.card,
          padding: '6px 14px', borderRadius: '10px', border: '1px solid ' + COLORS.border,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10, alignItems: 'center',
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: info.color, display: 'inline-block',
          }} />
          <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, letterSpacing: '0.05em' }}>
            {info.label}
          </span>
          <span style={{ fontSize: '10px', color: COLORS.muted, marginLeft: '4px', display: isNarrow ? 'none' : 'inline' }}>
            {info.desc}
          </span>
          <span style={{ width: '1px', height: '14px', backgroundColor: COLORS.border, margin: '0 4px' }} />
          <button onClick={handleNewZone} style={{
            background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: '4px', color: COLORS.primary, fontSize: '10px',
            fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}>
            <Plus size={12} /> New Zone
          </button>
        </div>

        {/* Canvas container */}
        <div style={{
          position: 'relative', border: '2px solid ' + COLORS.border,
          borderRadius: '12px', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <Stage
            width={W}
            height={H}
            style={{ cursor: phase === P.DONE ? 'default' : 'crosshair', display: 'block' }}
          >
            <Layer>
              {bgImage && (
                <KonvaImage image={bgImage} width={W} height={H} />
              )}

              {/* Click capture layer — transparent rect catches all clicks reliably */}
              {phase !== P.DONE && (
                <Rect
                  x={0} y={0} width={W} height={H}
                  fill="transparent"
                  onClick={handleStageClick}
                  onTap={handleStageClick}
                />
              )}

              {/* Saved zones */}
              {showSavedZones && zones.map(z => {
                if (z.zone_type === 'ROI' && z.coords?.length >= 3) {
                  const pts = z.coords.flatMap(p => toScreen(p[0], p[1]));
                  return (
                    <Line key={z.id} points={pts} fill={COLORS.roiFill} stroke={COLORS.roi} strokeWidth={2} closed listening={false} />
                  );
                }
                if (z.zone_type === 'SPEED_GATE' && z.coords?.length === 2) {
                  return z.coords.map((g, gi) => {
                    const [x1, y1] = toScreen(g[0][0], g[0][1]);
                    const [x2, y2] = toScreen(g[1][0], g[1][1]);
                    return (
                      <Line key={z.id + '-' + gi}
                        points={[x1, y1, x2, y2]}
                        stroke={gi === 0 ? COLORS.gate0 : COLORS.gate1}
                        strokeWidth={3} lineCap="round" listening={false}
                      />
                    );
                  });
                }
                return null;
              })}

              {/* Drawing ROI */}
              {phase !== P.DONE && roiPoints.length >= 2 && (
                <Line
                  points={roiPoints.flatMap(p => toScreen(p[0], p[1]))}
                  stroke={COLORS.roi} strokeWidth={2} dash={[6, 4]} listening={false}
                />
              )}
              {roiPoints.length >= 3 && phase === P.ROI && (
                <Line
                  points={roiPoints.flatMap(p => toScreen(p[0], p[1]))}
                  fill={COLORS.roiFill} stroke={COLORS.roi} strokeWidth={2} closed dash={[6, 4]} listening={false}
                />
              )}
              {roiPoints.map((p, i) => {
                const [sx, sy] = toScreen(p[0], p[1]);
                return <Circle key={'r' + i} x={sx} y={sy} radius={5} fill={COLORS.roi} stroke="#fff" strokeWidth={1} listening={false} />;
              })}

              {/* Drawing Gate 0 */}
              {gate0 && gate0.length === 2 && (
                <Line
                  points={toScreen(gate0[0][0], gate0[0][1]).concat(toScreen(gate0[1][0], gate0[1][1]))}
                  stroke={COLORS.gate0} strokeWidth={3} lineCap="round" listening={false}
                />
              )}
              {gate0 && gate0[0] && (
                <Circle x={toScreen(gate0[0][0], gate0[0][1])[0]} y={toScreen(gate0[0][0], gate0[0][1])[1]} radius={5} fill={COLORS.gate0} stroke="#fff" strokeWidth={1} listening={false} />
              )}
              {gate0 && gate0.length === 2 && (
                <Circle x={toScreen(gate0[1][0], gate0[1][1])[0]} y={toScreen(gate0[1][0], gate0[1][1])[1]} radius={5} fill={COLORS.gate0} stroke="#fff" strokeWidth={1} listening={false} />
              )}

              {/* Drawing Gate 1 */}
              {gate1 && gate1.length === 2 && (
                <Line
                  points={toScreen(gate1[0][0], gate1[0][1]).concat(toScreen(gate1[1][0], gate1[1][1]))}
                  stroke={COLORS.gate1} strokeWidth={3} lineCap="round" listening={false}
                />
              )}
              {gate1 && gate1[0] && (
                <Circle x={toScreen(gate1[0][0], gate1[0][1])[0]} y={toScreen(gate1[0][0], gate1[0][1])[1]} radius={5} fill={COLORS.gate1} stroke="#fff" strokeWidth={1} listening={false} />
              )}
              {gate1 && gate1.length === 2 && (
                <Circle x={toScreen(gate1[1][0], gate1[1][1])[0]} y={toScreen(gate1[1][0], gate1[1][1])[1]} radius={5} fill={COLORS.gate1} stroke="#fff" strokeWidth={1} listening={false} />
              )}

              {!bgImage && (
                <Text
                  x={W / 2} y={H / 2}
                  text={loadingSnapshot ? 'Capturing snapshot...' : 'Click New Zone to capture'}
                  fontSize={13} fill={COLORS.muted}
                  align="center" verticalAlign="middle"
                  offsetX={120} offsetY={8}
                  listening={false}
                />
              )}
            </Layer>
          </Stage>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{
        width: isNarrow ? '100%' : '280px', flexShrink: 0, backgroundColor: COLORS.card,
        borderLeft: isNarrow ? 'none' : '1px solid ' + COLORS.border,
        borderTop: isNarrow ? '1px solid ' + COLORS.border : 'none',
        maxHeight: isNarrow ? '60vh' : 'none',
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 20px 16px', borderBottom: '1px solid ' + COLORS.border,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <div style={{ width: '28px', height: '28px', backgroundColor: COLORS.primary, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cpu size={14} color="#fff" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, margin: 0, letterSpacing: '-0.02em' }}>
                  Zone Engine
                </h3>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: COLORS.muted, margin: 0, paddingLeft: '36px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Camera size={11} /> Snapshot
            </p>
          </div>
          <select
            value={selectedCam}
            onChange={(e) => { setSelectedCam(e.target.value); handleNewZone(); }}
            style={{
              marginTop: '8px', width: '100%', background: '#0f1117', border: '1px solid ' + COLORS.border,
              borderRadius: '6px', padding: '6px 8px', color: COLORS.text,
              fontSize: '12px', fontWeight: '600', outline: 'none', cursor: 'pointer',
            }}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {phase !== P.ROI && roiPoints.length > 0 && (
            <button onClick={resetAll} style={{
              padding: '6px', borderRadius: '8px', border: 'none',
              backgroundColor: 'transparent', color: COLORS.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e2130'; e.currentTarget.style.color = COLORS.text; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = COLORS.muted; }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            margin: '12px 16px 0', padding: '8px 12px', borderRadius: '8px', flexShrink: 0,
            fontSize: '11px', fontWeight: '600',
            backgroundColor: message.type === 'success' ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.1)',
            border: '1px solid ' + (message.type === 'success' ? 'rgba(0,255,136,0.3)' : 'rgba(239,68,68,0.3)'),
            color: message.type === 'success' ? COLORS.roi : '#ef4444',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} style={{
              background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
              fontSize: '13px', opacity: 0.6, padding: '0 2px',
            }}>x</button>
          </div>
        )}

        {/* Close Polygon CTA */}
        {phase === P.ROI && roiPoints.length >= 3 && (
          <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
            <button onClick={finishPolygon} style={{
              width: '100%', backgroundColor: COLORS.primary, color: '#ffffff',
              fontWeight: '700', fontSize: '11px', padding: '11px 16px',
              borderRadius: '10px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '7px', letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              <CheckCircle2 size={14} /> Close Polygon
            </button>
          </div>
        )}

        {/* Zone list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
            <MapPin size={12} color={COLORS.primary} />
            <span style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: COLORS.muted }}>
              Configuration
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* ROI item */}
            <div style={{
              padding: '12px', backgroundColor: '#1a1d27',
              border: '1px solid ' + COLORS.border, borderRadius: '10px',
              borderLeft: '3px solid ' + COLORS.roi,
              opacity: roiPoints.length >= 3 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>ROI Polygon</span>
                  <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '2px' }}>
                    {roiPoints.length >= 3 ? roiPoints.length + ' points' : phase === P.ROI ? 'Click to add points...' : 'Not drawn'}
                  </div>
                </div>
                {roiPoints.length >= 3 && zones.find(z => z.zone_type === 'ROI') && (
                  <button onClick={() => deleteZone(zones.find(z => z.zone_type === 'ROI').id)} style={{
                    color: COLORS.dim, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px',
                    borderRadius: '4px', display: 'flex',
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = COLORS.dim}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Gate 0 */}
            <div style={{
              padding: '12px', backgroundColor: '#1a1d27',
              border: '1px solid ' + COLORS.border, borderRadius: '10px',
              borderLeft: '3px solid ' + COLORS.gate0,
              opacity: gate0 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>Gate 0 (Entry)</span>
                  <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '2px' }}>
                    {gate0 && gate0.length === 2 ? '2 points set' : phase === P.GATE0 ? 'Click 2 points...' : 'Not drawn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Gate 1 */}
            <div style={{
              padding: '12px', backgroundColor: '#1a1d27',
              border: '1px solid ' + COLORS.border, borderRadius: '10px',
              borderLeft: '3px solid ' + COLORS.gate1,
              opacity: gate1 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>Gate 1 (Exit)</span>
                  <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '2px' }}>
                    {gate1 && gate1.length === 2 ? '2 points set' : phase === P.GATE1 ? 'Click 2 points...' : 'Not drawn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Gate Distance */}
            <div style={{
              padding: '12px', backgroundColor: '#1a1d27',
              border: '1px solid ' + COLORS.border, borderRadius: '10px',
              borderLeft: '3px solid ' + COLORS.primary,
              opacity: gate0 && gate1 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>Gate Distance</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ruler size={14} color={COLORS.dim} />
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.1}
                  value={gateDistance}
                  onChange={e => setGateDistance(parseFloat(e.target.value) || 15.0)}
                  disabled={!gate0 || !gate1}
                  style={{
                    flex: 1, background: '#0f1117', border: '1px solid ' + COLORS.border,
                    borderRadius: '6px', padding: '6px 8px', color: COLORS.text,
                    fontSize: '12px', fontWeight: '600', outline: 'none',
                  }}
                />
                <span style={{ fontSize: '11px', color: COLORS.muted, fontWeight: '600' }}>m</span>
              </div>
            </div>
          </div>

          {/* Empty state */}
          {roiPoints.length === 0 && !gate0 && !gate1 && zones.length === 0 && (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              border: '2px dashed ' + COLORS.border, borderRadius: '12px', marginTop: '12px',
            }}>
              <BoxSelect size={22} color={COLORS.dim} style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.dim, margin: 0 }}>
                No configuration
              </p>
              <p style={{ fontSize: '11px', color: COLORS.dim, margin: '6px 0 0', lineHeight: 1.5 }}>
                Click on the canvas to draw the ROI polygon, then add speed gates
              </p>
            </div>
          )}
        </div>

        {/* Save button */}
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid ' + COLORS.border, flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={roiPoints.length < 3 || saving}
            style={{
              width: '100%',
              backgroundColor: roiPoints.length >= 3 && !saving ? COLORS.primary : '#1e2130',
              color: roiPoints.length >= 3 && !saving ? '#ffffff' : COLORS.dim,
              fontWeight: '700', fontSize: '11px', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '13px 16px', borderRadius: '10px',
              border: roiPoints.length >= 3 && !saving ? '1px solid transparent' : '1px solid ' + COLORS.border,
              cursor: roiPoints.length >= 3 && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: roiPoints.length >= 3 && !saving ? '0 4px 16px rgba(79,70,229,0.35)' : 'none',
            }}
            onMouseEnter={e => { if (roiPoints.length >= 3 && !saving) e.currentTarget.style.backgroundColor = '#4338ca'; }}
            onMouseLeave={e => { if (roiPoints.length >= 3 && !saving) e.currentTarget.style.backgroundColor = COLORS.primary; }}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Deploy Configuration'}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}