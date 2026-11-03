import { useEffect } from "react";
import { X, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

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
      ? "License Plate"
      : "Image Preview");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-rise"
      onClick={onClose}
    >
      <div
        className="relative max-w-[92vw] max-h-[90vh] min-w-[280px] sm:min-w-[380px] glass-card p-3 sm:p-4 shadow-2xl flex flex-col hover:transform-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar: title and close button placed outside/above the media */}
        <div className="flex items-center justify-between gap-4 pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            {type === "video" ? (
              <VideoIcon size={16} className="text-amber-500 shrink-0" />
            ) : (
              <ImageIcon size={16} className="text-amber-500 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-semibold tracking-wide truncate">
              {displayTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Media content */}
        <div className="flex items-center justify-center overflow-auto rounded-xl bg-black/40 p-1 sm:p-2 min-h-[80px]">
          {type === "video" ? (
            <video
              src={src}
              controls
              autoPlay
              className="rounded-lg max-w-full max-h-[76vh] bg-black"
            />
          ) : (
            <img
              src={src}
              alt={displayTitle}
              className="rounded-lg max-w-full max-h-[76vh] object-contain shadow-inner"
            />
          )}
        </div>
      </div>
    </div>
  );
}

