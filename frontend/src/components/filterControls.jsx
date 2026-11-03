import { DatePicker, TimePicker, ConfigProvider } from "antd";
import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import { useTheme, ANTD_LIGHT_THEME, ANTD_DARK_THEME } from "../context/ThemeContext";

export { ANTD_LIGHT_THEME, ANTD_DARK_THEME };

export function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

// Renders Start/End Date + Time as 2 separate pickers but still emits a
// single combined "YYYY-MM-DDTHH:mm" string via onChange.
export function SplitDateTime({ value, onChange, dateLabel, timeLabel, defaultTime }) {
  const { antdTheme } = useTheme();
  const dayjsValue = value ? dayjs(value, "YYYY-MM-DDTHH:mm") : null;

  const handleDateChange = (d) => {
    const time = dayjsValue ? dayjsValue.format("HH:mm") : defaultTime;
    onChange(d ? `${d.format("YYYY-MM-DD")}T${time}` : "");
  };

  const handleTimeChange = (t) => {
    const datePart = dayjsValue ? dayjsValue.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    onChange(t ? `${datePart}T${t.format("HH:mm")}` : "");
  };

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex gap-3">
        <Field label={dateLabel} className="flex-1 min-w-0">
          <DatePicker
            value={dayjsValue}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            className="w-full"
            suffixIcon={<Calendar size={14} className="text-slate-400" />}
            allowClear
          />
        </Field>
        <Field label={timeLabel} className="w-24 shrink-0">
          <TimePicker
            value={dayjsValue}
            onChange={handleTimeChange}
            format="HH:mm"
            className="w-full"
            allowClear={false}
          />
        </Field>
      </div>
    </ConfigProvider>
  );
}