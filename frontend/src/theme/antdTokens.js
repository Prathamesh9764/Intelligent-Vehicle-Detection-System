import { theme as antdThemeAlgorithm } from "antd";

export const ANTD_DARK_THEME = {
  algorithm: antdThemeAlgorithm.darkAlgorithm,
  token: {
    colorPrimary: "#38bdf8", // Electric Cyan
    colorBgContainer: "#0e1626", // Dark Navy Surface
    colorBgElevated: "#131f33", // Charcoal Navy Popover
    colorBorder: "rgba(56, 189, 248, 0.2)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.08)",
    colorText: "#f8fafc",
    colorTextPlaceholder: "#94a3b8",
    colorTextHeading: "#ffffff",
    borderRadius: 8,
    fontFamily: "'Outfit', 'Sora', system-ui, -apple-system, sans-serif",
  },
  components: {
    Select: {
      optionSelectedBg: "rgba(56, 189, 248, 0.18)",
      optionSelectedColor: "#38bdf8",
      selectorBg: "rgba(14, 22, 38, 0.8)",
    },
    DatePicker: {
      cellActiveWithRangeBg: "rgba(56, 189, 248, 0.18)",
    },
    Button: {
      borderRadius: 8,
    },
  },
};

export const ANTD_LIGHT_THEME = {
  algorithm: antdThemeAlgorithm.defaultAlgorithm,
  token: {
    colorPrimary: "#2563eb", // Electric Blue
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#cbd5e1",
    colorBorderSecondary: "#e2e8f0",
    colorText: "#0f172a", // High contrast Slate 900
    colorTextPlaceholder: "#64748b",
    colorTextHeading: "#0f172a",
    borderRadius: 8,
    fontFamily: "'Outfit', 'Sora', system-ui, -apple-system, sans-serif",
  },
  components: {
    Select: {
      optionSelectedBg: "#eff6ff", // Blue 50
      optionSelectedColor: "#1d4ed8", // Blue 700
      selectorBg: "#ffffff",
    },
    DatePicker: {
      cellActiveWithRangeBg: "#eff6ff",
    },
    Button: {
      borderRadius: 8,
    },
  },
};
