import { ScanLine } from "lucide-react";

export default function PageLoader({ text = "Loading Console Data…" }) {
  return (
    <div className="min-h-[55vh] flex-1 flex flex-col items-center justify-center p-6 animate-rise">
      <div className="relative flex flex-col items-center">
        {/* Glowing Pulsing Backdrop */}
        <div className="absolute -inset-4 rounded-full bg-cyan-500/15 blur-xl pointer-events-none animate-pulse" />

        {/* High-Tech Reticle Container */}
        <div className="relative w-16 h-16 rounded-2xl bg-white/80 dark:bg-[#0c1424]/90 border border-slate-200 dark:border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-500/10">
          {/* Corner brackets */}
          <span className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-500" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-500" />
          <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-500" />
          <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-500" />

          {/* Center Scan Icon */}
          <ScanLine className="text-cyan-500 dark:text-cyan-400 animate-pulse" size={26} />

          {/* Rotating Ring */}
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-cyan-400 animate-spin" />
        </div>

        {/* Loading Text & Telemetry Indicator */}
        <div className="mt-4 flex flex-col items-center gap-1.5 text-center">
          <p className="text-xs sm:text-sm font-mono font-bold tracking-wider text-slate-900 dark:text-white uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            {text}
          </p>
          <div className="w-36 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400"
              style={{
                width: "45%",
                animation: "laserScanHorizontal 1.4s ease-in-out infinite",
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400 dark:text-cyan-400/80">
            IVDS • NEURAL TELEMETRY STREAM
          </span>
        </div>
      </div>
    </div>
  );
}
