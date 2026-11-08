import { useEffect } from "react";
import { X, Image as ImageIcon, Video as VideoIcon, ExternalLink } from "lucide-react";

export default function MediaModal({ src, type = "image", title, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const displayTitle =
    title ||
    (type === "video"
      ? "Video Recording"
      : src?.toLowerCase().includes("plate")
      ? "License Plate Crop"
      : "High-Resolution Capture");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 animate-rise"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] glass-card p-3.5 sm:p-4 shadow-2xl flex flex-col hover:transform-none border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#0c1424]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-cyan-500/15 text-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-cyan-500 shrink-0">
              {type === "video" ? <VideoIcon size={16} /> : <ImageIcon size={16} />}
            </div>
            <span className="text-xs sm:text-sm font-bold tracking-tight truncate">
              {displayTitle}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {src && (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                title="Open file in new tab"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Media content */}
        <div className="flex items-center justify-center overflow-auto rounded-xl bg-slate-950/90 p-2 min-h-[140px] max-h-[75vh]">
          {type === "video" ? (
            <video
              src={src}
              controls
              autoPlay
              className="rounded-lg max-w-full max-h-[70vh] bg-black shadow-lg"
            />
          ) : (
            <img
              src={src}
              alt={displayTitle}
              className="rounded-lg max-w-full max-h-[70vh] object-contain shadow-lg"
            />
          )}
        </div>
      </div>
    </div>
  );
}
