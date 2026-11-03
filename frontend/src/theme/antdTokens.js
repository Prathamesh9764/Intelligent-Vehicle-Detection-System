import { theme as antdThemeAlgorithm } from "antd";

export const ANTD_DARK_THEME = {
  algorithm: antdThemeAlgorithm.darkAlgorithm,
  token: {
    colorPrimary: "#ffc46b", // Luminous Temple Gold
    colorBgContainer: "rgba(18, 20, 36, 0.85)",
    colorBgElevated: "#0d0f20",
    colorBorder: "rgba(255, 255, 255, 0.12)",
    colorText: "#f1f5f9",
    colorTextPlaceholder: "rgba(199, 210, 254, 0.5)",
    borderRadius: 12,
    fontFamily: "'Outfit', 'Sora', sans-serif",
  },
  components: {
    Select: {
      optionSelectedBg: "rgba(255, 196, 107, 0.15)",
      optionSelectedColor: "#ffd98a",
      selectorBg: "rgba(255, 255, 255, 0.05)",
    },
    DatePicker: {
      cellActiveWithRangeBg: "rgba(255, 196, 107, 0.15)",
    },
  },
};

export const ANTD_LIGHT_THEME = {
  algorithm: antdThemeAlgorithm.defaultAlgorithm,
  token: {
    colorPrimary: "#d97706", // Sacred Saffron / Amber 600
    colorBgContainer: "rgba(255, 255, 255, 0.92)",
    colorBgElevated: "#ffffff",
    colorBorder: "rgba(226, 232, 240, 0.95)",
    colorText: "#0f172a", // Slate 900
    colorTextPlaceholder: "#64748b", // Slate 500
    borderRadius: 12,
    fontFamily: "'Outfit', 'Sora', sans-serif",
  },
  components: {
    Select: {
      optionSelectedBg: "#fef3c7", // Amber 100
      optionSelectedColor: "#92400e", // Amber 800
      selectorBg: "rgba(255, 255, 255, 0.92)",
    },
    DatePicker: {
      cellActiveWithRangeBg: "#fef3c7",
    },
  },
};
