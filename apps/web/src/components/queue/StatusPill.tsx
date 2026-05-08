import { getStatusColor, type WorkflowStatus } from "../../lib/media";

const labels: Record<WorkflowStatus, string> = {
  new: "New",
  scheduled: "Scheduled",
  posting: "Posting",
  live: "Live",
  error: "Error",
};

interface StatusPillProps {
  status: WorkflowStatus;
  size?: "sm" | "md";
  pulse?: boolean;
}

export function StatusPill({ status, size = "md", pulse }: StatusPillProps) {
  const { bg, text, dot } = getStatusColor(status);
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.14em] ${textSize} ${padding} ${bg} ${text}`}>
      <span
        className={`size-1.5 rounded-full ${dot} ${pulse && status === "posting" ? "animate-pulse" : ""}`}
      />
      {labels[status]}
    </span>
  );
}
