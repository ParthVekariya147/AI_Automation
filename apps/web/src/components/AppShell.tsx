import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "../store/auth-store";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/drive-browser", label: "Drive Browser" },
  { to: "/queue", label: "Content Queue" },
  { to: "/posts", label: "Posts" },
  { to: "/businesses", label: "Businesses" },
  { to: "/integrations", label: "Integrations" },
  { to: "/analytics", label: "Analytics" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeBusinessId, clearSession } = useAuthStore();

  const activeMembership = memberships.find(
    (membership) => membership.businessId._id === activeBusinessId
  );

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-slate-900">
      <div className="mx-auto flex max-w-[1500px] gap-6 px-3 py-4 sm:px-4 sm:py-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-72 shrink-0 rounded-[28px] border border-[#d7ddd4] bg-[#10332b] p-6 text-white shadow-[0_18px_55px_rgba(16,51,43,0.18)] lg:block">
          <Link to="/" className="block">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">
              Content Ops
            </p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight">
              Instagram Automation Suite
            </h1>
          </Link>

          <div className="mt-8 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-[#dfe8c8] text-[#10332b]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold">{user?.name}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-emerald-200/70">
              {user?.globalRole}
            </p>
            <p className="mt-4 text-xs text-slate-300">
              {activeMembership
                ? `${activeMembership.businessId.name} workspace`
                : "Create a business to activate the workflow"}
            </p>
            <button
              onClick={clearSession}
              className="mt-5 rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-100 transition hover:border-[#dfe8c8] hover:text-[#dfe8c8]"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[24px] border border-[#d7ddd4] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] lg:hidden">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-800/70">
                  Content Ops
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-950">
                  Instagram Automation Suite
                </h1>
              </div>
              <div className="w-full rounded-2xl border border-[#d7ddd4] bg-white px-4 py-3 text-sm text-slate-800">
                {activeMembership?.businessId.name || "No business assigned yet"}
              </div>

              <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-[#10332b] text-white"
                          : "bg-[#f3f4ef] text-slate-700 hover:bg-[#e7ebe0]"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          <header className="rounded-[28px] border border-[#d7ddd4] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-800/70">
                  Workflow control
                </p>
                <h2 className="mt-2 text-3xl font-semibold leading-tight text-slate-950">
                  Drive files, queue planning, and posting in one workspace
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="rounded-2xl bg-[#f3f4ef] px-4 py-3 text-sm text-slate-600">
                  {activeMembership
                    ? `Workspace: ${activeMembership.businessId.name}`
                    : "No business assigned yet"}
                </div>
                <div className="min-w-[240px] rounded-2xl border border-[#d7ddd4] bg-white px-4 py-3 text-sm text-slate-800 max-lg:hidden">
                  {activeMembership?.businessId.name || "No business assigned yet"}
                </div>
              </div>
            </div>
          </header>

          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
