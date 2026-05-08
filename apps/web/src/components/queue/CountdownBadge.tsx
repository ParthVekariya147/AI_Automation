import { useEffect, useState } from "react";
import { formatRelativeTime } from "../../lib/media";

interface CountdownBadgeProps {
  scheduledTime?: string | null;
}

export function CountdownBadge({ scheduledTime }: CountdownBadgeProps) {
  const [label, setLabel] = useState(() => formatRelativeTime(scheduledTime));

  useEffect(() => {
    if (!scheduledTime) return;
    setLabel(formatRelativeTime(scheduledTime));
    const id = setInterval(() => setLabel(formatRelativeTime(scheduledTime)), 30_000);
    return () => clearInterval(id);
  }, [scheduledTime]);

  if (!scheduledTime || !label) return null;

  const isPast = new Date(scheduledTime).getTime() < Date.now();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isPast ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
      }`}
    >
      {label}
    </span>
  );
}
