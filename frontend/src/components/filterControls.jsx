import { DatePicker, TimePicker, ConfigProvider } from "antd";
import dayjs from "dayjs";
import { Calendar, Clock } from "lucide-react";
import { useTheme, ANTD_LIGHT_THEME, ANTD_DARK_THEME } from "../context/ThemeContext";

export { ANTD_LIGHT_THEME, ANTD_DARK_THEME };

export function Field({ label, children, className = "" }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

/**
 * SplitDateTime: Renders Date + Time as two distinct pickers while emitting
 * a unified "YYYY-MM-DDTHH:mm" format via onChange.
 */
export function SplitDateTime({ value, onChange, dateLabel, timeLabel, defaultTime = "00:00" }) {
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
      <div className="flex flex-row items-end gap-1.5 w-full">
        <Field label={dateLabel} className="flex-1 min-w-[120px]">
          <DatePicker
            value={dayjsValue}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            className="w-full text-xs"
            suffixIcon={<Calendar size={13} className="text-slate-400" />}
            allowClear
          />
        </Field>
        <Field label={timeLabel} className="w-[90px] shrink-0">
          <TimePicker
            value={dayjsValue}
            onChange={handleTimeChange}
            format="HH:mm"
            className="w-full text-xs"
            suffixIcon={<Clock size={13} className="text-slate-400" />}
            allowClear={false}
          />
        </Field>
      </div>
    </ConfigProvider>
  );
}
