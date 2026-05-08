import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "../store/auth-store";

const navItems = [
  {
    to: "/",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm8-3a1 1 0 100-2 1 1 0 000 2zm-1 8V9h2v6H9z" />
      </svg>
    )
  },
  {
    to: "/drive-browser",
    label: "Drive Browser",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    )
  },
  {
    to: "/queue",
    label: "Content Queue",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h10a1 1 0 100-2H3z" />
      </svg>
    )
  },
  {
    to: "/posts",
    label: "Posts",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    to: "/businesses",
    label: "Businesses",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h6v4H7V5zm8 8v2h1v1H4v-1h1v-2H4v-1h12v1h-1z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    to: "/integrations",
    label: "Integrations",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    to: "/analytics",
    label: "Reports",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    )
  }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeBusinessId, setActiveBusinessId, clearSession } = useAuthStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeMembership = memberships.find(
    (m) => m.businessId._id === activeBusinessId
  );

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-slate-900">
      <div className="flex w-full gap-5 px-2 py-3 sm:px-3 sm:py-4">

        {/* ── Desktop Sidebar ─────────────────────────────── */}
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-[28px] border border-[#d7ddd4] bg-[#10332b] p-5 text-white shadow-[0_18px_55px_rgba(16,51,43,0.22)] lg:flex">
          <Link to="/" className="block">
            <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-300/70">Content Ops</p>
            <h1 className="mt-1.5 text-lg font-bold leading-tight tracking-tight">
              Instagram<br />Automation Suite
            </h1>
          </Link>

          {/* Nav */}
          <nav className="mt-8 flex-1 space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#dfe8c8] text-[#0e2c25] shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User card */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{user?.name}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/60">
                  {user?.globalRole}
                </p>
              </div>
            </div>

            {/* Business Switcher */}
            {memberships.length > 0 && (
              <div className="relative mt-3">
                <button
                  onClick={() => setSwitcherOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/10"
                >
                  <span className="truncate">
                    {activeMembership?.businessId.name ?? "Select workspace"}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className={`ml-2 size-3 shrink-0 text-slate-400 transition-transform ${switcherOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {switcherOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-xl border border-white/10 bg-[#0e2c25] shadow-xl">
                    {memberships.map((m) => (
                      <button
                        key={m.businessId._id}
                        onClick={() => {
                          setActiveBusinessId(m.businessId._id);
                          setSwitcherOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-white/10 ${
                          m.businessId._id === activeBusinessId
                            ? "text-emerald-300"
                            : "text-slate-300"
                        }`}
                      >
                        {m.businessId._id === activeBusinessId && (
                          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3 shrink-0 text-emerald-400">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                          </svg>
                        )}
                        <span className={`truncate ${m.businessId._id !== activeBusinessId ? "ml-5" : ""}`}>
                          {m.businessId.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={clearSession}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 2H13a1 1 0 011 1v10a1 1 0 01-1 1H10M6 5l-3 3 3 3M3 8h7" />
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────── */}
        <main className="min-w-0 flex-1">

          {/* Mobile header */}
          <div className="mb-4 rounded-[24px] border border-[#d7ddd4] bg-white p-4 shadow-sm lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-800/60">Content Ops</p>
                <h1 className="mt-0.5 text-base font-bold text-slate-950">IG Automation</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-[#f3f4ef] px-2.5 py-1.5 text-xs font-medium text-slate-700">
                  {activeMembership?.businessId.name ?? "No workspace"}
                </span>
                <button
                  onClick={() => setMobileNavOpen((o) => !o)}
                  className="flex size-9 items-center justify-center rounded-xl bg-[#10332b] text-white"
                >
                  {mobileNavOpen ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                      <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mobileNavOpen && (
              <nav className="mt-3 grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-3">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? "bg-[#10332b] text-white"
                          : "bg-[#f3f4ef] text-slate-700 hover:bg-[#e7ebe0]"
                      }`
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
                <button
                  onClick={clearSession}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600"
                >
                  Sign out
                </button>
              </nav>
            )}
          </div>

          <div className="mt-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
