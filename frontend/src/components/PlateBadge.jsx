export default function PlateBadge({
  text,
  size = "md",
  countryCode = "IND",
  onClick,
  className = "",
}) {
  const isAvailable = Boolean(text && text.trim() && text.trim() !== "-");
  const displayText = isAvailable ? text.trim().toUpperCase() : "NO PLATE";

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5 gap-1 tracking-wider",
    md: "text-xs px-2 py-0.5 gap-1.5 tracking-widest",
    lg: "text-sm px-3 py-1 gap-2 tracking-widest",
  }[size] || "text-xs px-2 py-0.5 gap-1.5 tracking-widest";

  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={`
        inline-flex items-center font-mono font-bold select-none rounded border shadow-sm
        transition-all duration-150
        ${
          isAvailable
            ? "bg-gradient-to-b from-white to-slate-100 text-slate-900 border-slate-700/80 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
            : "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-dashed border-slate-300 dark:border-slate-700"
        }
        ${onClick ? "hover:scale-105 hover:shadow-md cursor-pointer active:scale-95 hover:border-cyan-500" : ""}
        ${sizeClasses}
        ${className}
      `}
      title={isAvailable ? `License Plate: ${displayText}` : "License plate unreadable"}
    >
      {isAvailable && (
        <span className="flex items-center justify-center font-sans font-bold text-[8px] px-0.5 rounded-sm bg-blue-700 text-white tracking-normal leading-tight">
          {countryCode}
        </span>
      )}
      <span className="truncate">{displayText}</span>
    </Component>
  );
}
