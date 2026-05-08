import type { ReactNode } from "react";

// Icon factory
import type { CSSProperties } from "react";
type IconProps = { size?: number; className?: string; strokeWidth?: number; style?: CSSProperties };
const I = (paths: ReactNode) => function Icon({ size = 18, className = "", strokeWidth = 1.6, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {paths}
    </svg>
  );
};

export const Icons = {
  Home: I(<><path d="M3 11l9-8 9 8"/><path d="M5 9.5V21h14V9.5"/></>),
  Folder: I(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>),
  Layers: I(<><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/></>),
  Image: I(<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5L4 21"/></>),
  Bolt: I(<><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></>),
  Building: I(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M9 11h.01M9 15h.01M14 7h.01M14 11h.01M14 15h.01"/></>),
  Plug: I(<><path d="M9 2v6"/><path d="M15 2v6"/><path d="M5 8h14v3a5 5 0 0 1-5 5h-1v6h-2v-6h-1a5 5 0 0 1-5-5z"/></>),
  Bar: I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>),
  Calendar: I(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>),
  Inbox: I(<><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></>),
  Search: I(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>),
  Plus: I(<><path d="M12 5v14M5 12h14"/></>),
  Check: I(<><path d="M5 12l5 5L20 7"/></>),
  X: I(<><path d="M6 6l12 12M18 6 6 18"/></>),
  Chevron: I(<><path d="m9 6 6 6-6 6"/></>),
  ChevronDown: I(<><path d="m6 9 6 6 6-6"/></>),
  ChevronLeft: I(<><path d="m15 6-6 6 6 6"/></>),
  ChevronRight: I(<><path d="m9 6 6 6-6 6"/></>),
  Switch: I(<><path d="M16 3h5v5"/><path d="m4 20 17-17"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/></>),
  Dots: I(<><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>),
  Filter: I(<><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>),
  Sort: I(<><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4"/></>),
  Grid: I(<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>),
  List: I(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>),
  Mosaic: I(<><rect x="3" y="3" width="9" height="13" rx="1.5"/><rect x="14" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="11" width="7" height="6" rx="1.5"/><rect x="3" y="18" width="18" height="3" rx="1"/></>),
  Heart: I(<><path d="M20 8.5c0 4-8 11-8 11s-8-7-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 8.5z"/></>),
  Bell: I(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></>),
  Settings: I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>),
  Sparkles: I(<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 14l.7 1.9L22 17l-2.3.8L19 20l-.7-2.2L16 17l2.3-1.1z"/></>),
  Send: I(<><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>),
  Pause: I(<><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>),
  Play: I(<><path d="M8 5v14l11-7z"/></>),
  Refresh: I(<><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/></>),
  Drive: I(<><path d="M9 3h6l7 12-3 6H5l-3-6z"/><path d="M9 3 2 15M15 3l7 12M5 21 9 9h6l4 12"/></>),
  Instagram: I(<><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></>),
  AlertTriangle: I(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>),
  CircleCheck: I(<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>),
  Clock: I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  Trash: I(<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></>),
  Edit: I(<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></>),
  External: I(<><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></>),
  Eye: I(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
  Download: I(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>),
  ArrowRight: I(<><path d="M5 12h14M13 5l7 7-7 7"/></>),
  ArrowLeft: I(<><path d="M19 12H5M11 5 4 12l7 7"/></>),
  Logout: I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>),
  Globe: I(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>),
  Comment: I(<><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>),
  Save: I(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>),
  Folder2: I(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>),
  Tag: I(<><path d="M20 13.5 13.5 20a2 2 0 0 1-2.8 0L3 12.3V3h9.3L20 10.7a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/></>),
  User: I(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
  Users: I(<><circle cx="9" cy="8" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-5-5.9"/></>),
  Sun: I(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
  Moon: I(<><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></>),
  Film: I(<><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/></>),
  Carousel: I(<><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M21 9v6M3 9v6"/></>),
  Reels: I(<><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18M9 3v5M15 3v5M10 13l5 3-5 3z"/></>),
};

// Avatar
export function Avatar({ name = "?", size = 32, tone = "var(--accent)" }: { name?: string; size?: number; tone?: string }) {
  const initials = (name || "?").split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="relative inline-flex items-center justify-center text-white font-semibold rounded-full overflow-hidden shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, background: tone }}
    >
      {initials}
    </div>
  );
}

// Tabs
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex items-center p-1 rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={"px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition flex items-center gap-1.5 " + (value === t.id ? "tab-active" : "text-[var(--ink-2)] hover:text-[var(--ink)]")}>
          {t.label}
          {t.count != null && (
            <span className={"px-1.5 rounded-md text-[11px] font-mono " + (value === t.id ? "bg-white/20 text-white" : "text-[var(--muted)]")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Pill
export function Pill({ tone = "muted", children, dot = true }: { tone?: string; children: ReactNode; dot?: boolean }) {
  const map: Record<string, { bg: string; fg: string }> = {
    ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    err: { bg: "var(--err-soft)", fg: "var(--err)" },
    info: { bg: "var(--info-soft)", fg: "var(--info)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
    muted: { bg: "var(--bg)", fg: "var(--ink-2)" },
  };
  const s = map[tone] || map.muted;
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {dot && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.fg }} />}
      {children}
    </span>
  );
}

// StatusPill
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    new: { tone: "muted", label: "New" },
    draft: { tone: "muted", label: "Draft" },
    scheduled: { tone: "info", label: "Scheduled" },
    posting: { tone: "warn", label: "Posting" },
    live: { tone: "ok", label: "Live" },
    error: { tone: "err", label: "Failed" },
    running: { tone: "info", label: "Running" },
    paused: { tone: "warn", label: "Paused" },
    finished: { tone: "ok", label: "Finished" },
    idle: { tone: "muted", label: "Idle" },
    manual_review: { tone: "err", label: "Needs review" },
  };
  const s = map[status] || { tone: "muted", label: status };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// MediaThumb — gradient placeholder
export function MediaThumb({ seed = 0, type = "image", className = "", live = false }: { seed?: number; type?: string; className?: string; live?: boolean }) {
  const palettes = [
    ["#FFE6DF", "#FFD3B5", "#FF9B7A"],
    ["#E2EAF8", "#C8D9F4", "#7AA4E8"],
    ["#D8F0E0", "#B6E2C8", "#6CB48A"],
    ["#FAEBC9", "#F5D78A", "#D6A24A"],
    ["#EDE4FF", "#D8C4FB", "#A07BE3"],
    ["#FFE1F1", "#FFB7DC", "#E26AB1"],
    ["#F0EBE2", "#D8D2C2", "#B0A78F"],
    ["#FFD6CE", "#F09E89", "#C25D44"],
  ];
  const p = palettes[seed % palettes.length];
  return (
    <div className={"relative overflow-hidden rounded-xl " + className}
      style={{ background: `linear-gradient(135deg,${p[0]},${p[1]} 55%,${p[2]})` }}>
      <div className="absolute inset-0">
        <svg viewBox="0 0 200 200" className="w-full h-full" preserveAspectRatio="none">
          <circle cx="160" cy="40" r="40" fill={p[2]} opacity=".5" />
          <circle cx="40" cy="160" r="60" fill={p[0]} opacity=".7" />
        </svg>
      </div>
      {type === "video" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center">
            <Icons.Play size={16} />
          </div>
        </div>
      )}
      {type === "carousel" && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-semibold flex items-center gap-1">
          <Icons.Carousel size={11} /> CAROUSEL
        </div>
      )}
      {type === "reel" && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-semibold flex items-center gap-1">
          <Icons.Reels size={11} /> REEL
        </div>
      )}
      {live && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-semibold flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE
        </div>
      )}
    </div>
  );
}

// Section
export function Section({ title, eyebrow, action, children, className = "" }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={"space-y-3 " + className}>
      {(title || eyebrow || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {eyebrow && <div className="section-eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// PageHeader
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        {eyebrow && <div className="section-eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[34px] leading-[1.1] tracking-tight" style={{ letterSpacing: "-0.015em", color: "var(--ink)" }}>{title}</h1>
        {subtitle && <p className="mt-2 text-[14px]" style={{ color: "var(--muted)" }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
