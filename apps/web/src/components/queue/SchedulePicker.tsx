import { toInputDateTime } from "../../lib/media";

const PRESETS = [
  { label: "Now", offsetMs: 0 },
  { label: "+1h", offsetMs: 3_600_000 },
  { label: "+3h", offsetMs: 10_800_000 },
  { label: "Tmr 9am", offsetMs: null },
] as const;

function tomorrowAt9am() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

interface SchedulePickerProps {
  value?: string | null;
  onChange: (iso: string | null) => void;
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (preset.offsetMs === null) {
      onChange(tomorrowAt9am());
    } else if (preset.offsetMs === 0) {
      onChange(new Date().toISOString());
    } else {
      onChange(new Date(Date.now() + preset.offsetMs).toISOString());
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="datetime-local"
        value={toInputDateTime(value)}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-[#d7ddd4] bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {preset.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
