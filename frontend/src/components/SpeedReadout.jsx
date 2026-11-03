export default function SpeedReadout({ speed, limit, size = "text-lg" }) {
  if (speed === null || speed === undefined) {
    return <span className="text-slate-500 font-mono text-sm">--</span>;
  }
  const over = limit != null && speed > limit;
  return (
    <span
      className={`font-mono tabular-nums font-semibold ${size} ${
        over ? "text-alert drop-shadow-[0_0_6px_rgba(228,87,46,0.6)]" : "text-live"
      }`}
    >
      {Number(speed).toFixed(1)}
      <span className="text-xs text-slate-400 font-body ml-1">km/h</span>
    </span>
  );
}
