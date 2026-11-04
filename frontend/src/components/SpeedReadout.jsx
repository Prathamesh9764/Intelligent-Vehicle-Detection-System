import { AlertTriangle, Zap } from "lucide-react";

export default function SpeedReadout({
  speed,
  limit = null,
  size = "text-sm",
  showBadge = false,
  className = "",
}) {
  if (speed === null || speed === undefined || speed === "") {
    return (
      <span className={`text-slate-400 dark:text-slate-500 font-mono text-xs ${className}`}>
        -- <span className="text-[10px] font-sans">km/h</span>
      </span>
    );
  }

  const numSpeed = Number(speed);
  const isOver = limit != null && numSpeed > limit;

  if (showBadge) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono font-bold text-xs border ${
          isOver
            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-sm"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
        } ${className}`}
        title={isOver ? `Over speed limit! Threshold: ${limit} km/h` : "Within legal speed limit"}
      >
        {isOver ? <AlertTriangle size={12} className="shrink-0" /> : <Zap size={12} className="shrink-0" />}
        <span>{numSpeed.toFixed(1)}</span>
        <span className="text-[9px] font-sans font-semibold opacity-80">km/h</span>
      </div>
    );
  }

  return (
    <span
      className={`font-mono tabular-nums font-bold tracking-tight inline-flex items-baseline ${size} ${
        isOver
          ? "text-rose-600 dark:text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.3)]"
          : "text-emerald-600 dark:text-emerald-400"
      } ${className}`}
      title={isOver ? `Velocity: ${numSpeed.toFixed(1)} km/h (Limit: ${limit} km/h)` : `${numSpeed.toFixed(1)} km/h`}
    >
      <span>{numSpeed.toFixed(1)}</span>
      <span className="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400 ml-1">
        km/h
      </span>
    </span>
  );
}
