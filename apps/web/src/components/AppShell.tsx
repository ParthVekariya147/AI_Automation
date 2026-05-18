import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth-store";
import { Icons, Avatar } from "../lib/ds";

type NavGroup = {
  label: string;
  items: { to: string; label: string; icon: React.ReactNode; end?: boolean }[];
};

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: <Icons.Home size={15} />, end: true },
      { to: "/studio", label: "Studio", icon: <Icons.Layers size={15} /> },
      { to: "/posts", label: "Posts", icon: <Icons.Image size={15} /> },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { to: "/drive-browser", label: "Drive", icon: <Icons.Drive size={15} /> },
      { to: "/automations", label: "Automations", icon: <Icons.Bolt size={15} /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Reports", icon: <Icons.Bar size={15} /> },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/businesses", label: "Businesses", icon: <Icons.Building size={15} /> },
      { to: "/integrations", label: "Integrations", icon: <Icons.Plug size={15} /> },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeBusinessId, setActiveBusinessId, clearSession } = useAuthStore();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const activeMembership = memberships.find(
    (m) => m.businessId._id === activeBusinessId
  );

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next === "dark" ? "dark" : "");
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r lg:flex"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="ig-grad w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
              <Icons.Instagram size={14} className="text-white" />
            </div>
            <span className="font-display text-[20px] leading-none" style={{ color: "var(--ink)" }}>
              Postlane
            </span>
          </Link>
        </div>

        {/* Business switcher */}
        {memberships.length > 0 && (
          <div className="px-3 pb-3">
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen((o) => !o)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <div
                  className="w-6 h-6 rounded-lg shrink-0 ig-grad flex items-center justify-center text-[10px] font-bold text-white"
                />
                <span className="flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>
                  {activeMembership?.businessId.name ?? "Select workspace"}
                </span>
                <Icons.ChevronDown
                  size={13}
                  className={`shrink-0 transition-transform ${switcherOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--muted)" } as React.CSSProperties}
                />
              </button>

              {switcherOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 overflow-hidden rounded-xl z-50 shadow-xl"
                  style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
                >
                  {memberships.map((m) => (
                    <button
                      key={m.businessId._id}
                      onClick={() => {
                        setActiveBusinessId(m.businessId._id);
                        setSwitcherOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] transition"
                      style={{
                        color: m.businessId._id === activeBusinessId ? "var(--accent)" : "var(--ink-2)",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {m.businessId._id === activeBusinessId && (
                        <Icons.Check size={12} className="shrink-0" />
                      )}
                      <span className={`truncate font-medium ${m.businessId._id !== activeBusinessId ? "ml-5" : ""}`}>
                        {m.businessId.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-4 scrollbar-thin">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="section-eyebrow px-2 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${
                        isActive
                          ? "bg-[var(--ink)] text-white"
                          : "hover:bg-[var(--bg)]"
                      }`
                    }
                    style={({ isActive }) => ({
                      color: isActive ? "#fff" : "var(--ink-2)",
                    })}
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 mt-2 space-y-1" style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
          {/* User */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user?.name ?? "?"} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>
                {user?.name}
              </p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                {user?.globalRole}
              </p>
            </div>
          </div>

          <button
            onClick={clearSession}
            className="btn-ghost w-full justify-start text-[12px]"
            style={{ color: "var(--err)" }}
          >
            <Icons.Logout size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 border-b"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          {/* Mobile logo */}
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <div className="ig-grad w-6 h-6 rounded-md flex items-center justify-center">
              <Icons.Instagram size={12} className="text-white" />
            </div>
            <span className="font-display text-[17px]" style={{ color: "var(--ink)" }}>Postlane</span>
          </Link>

          {/* Active workspace name (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="section-eyebrow">{activeMembership?.businessId.name ?? "No workspace"}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search placeholder */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] cursor-pointer"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            <Icons.Search size={13} />
            <span>Search…</span>
            <span className="kbd ml-2">⌘K</span>
          </div>

          {/* Theme toggle */}
          <button onClick={toggleTheme} className="btn-ghost p-2" title="Toggle theme">
            {theme === "dark" ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
          </button>

          {/* Notifications */}
          <button className="btn-ghost p-2 relative" title="Notifications">
            <Icons.Bell size={15} />
          </button>

          {/* New post */}
          <button
            onClick={() => navigate("/posts")}
            className="btn-primary hidden sm:inline-flex"
          >
            <Icons.Plus size={14} />
            New Post
          </button>

          {/* Avatar / mobile menu toggle */}
          <button
            onClick={() => setMobileNavOpen((o) => !o)}
            className="lg:hidden btn-ghost p-1.5"
          >
            <Avatar name={user?.name ?? "?"} size={26} />
          </button>
        </header>

        {/* Mobile Nav Drawer */}
        {mobileNavOpen && (
          <div
            className="lg:hidden border-b px-4 py-3"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}
          >
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {navGroups.flatMap((g) => g.items).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-[var(--ink)] text-white"
                        : "hover:bg-[var(--bg)]"
                    }`
                  }
                  style={({ isActive }) => ({
                    color: isActive ? "#fff" : "var(--ink-2)",
                  })}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>

            {memberships.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {memberships.map((m) => (
                  <button
                    key={m.businessId._id}
                    onClick={() => setActiveBusinessId(m.businessId._id)}
                    className="px-2.5 py-1 rounded-lg text-[12px] font-medium transition"
                    style={{
                      background: m.businessId._id === activeBusinessId ? "var(--ink)" : "var(--bg)",
                      color: m.businessId._id === activeBusinessId ? "#fff" : "var(--ink-2)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {m.businessId.name}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={clearSession}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium"
              style={{ background: "var(--err-soft)", color: "var(--err)", border: "1px solid var(--err-soft)" }}
            >
              <Icons.Logout size={14} />
              Sign out
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 min-w-0 p-4 lg:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
