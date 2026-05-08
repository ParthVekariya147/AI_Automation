import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";

export function BusinessesPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const currentUser = useAuthStore((state) => state.user);
  const [businessError, setBusinessError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [memberSuccess, setMemberSuccess] = useState("");
  const [businessForm, setBusinessForm] = useState({
    name: "",
    slug: "",
    timezone: "Asia/Kolkata"
  });
  const [memberForm, setMemberForm] = useState({
    businessId: activeBusinessId || "",
    name: "",
    email: "",
    password: ""
  });

  const { data: businesses } = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => (await api.get("/businesses")).data.data
  });

  useEffect(() => {
    setMemberForm((current) => ({
      ...current,
      businessId: current.businessId || activeBusinessId || ""
    }));
  }, [activeBusinessId]);

  async function createBusiness(event: React.FormEvent) {
    event.preventDefault();
    setBusinessError("");

    try {
      await api.post("/businesses", businessForm);
      setBusinessForm({ name: "", slug: "", timezone: "Asia/Kolkata" });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    } catch (error) {
      setBusinessError(extractApiError(error, "Business could not be created."));
    }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setMemberError("");
    setMemberSuccess("");

    try {
      await api.post("/businesses/members", memberForm);
      setMemberSuccess(
        `Admin login is ready. They can sign in at /login with ${memberForm.email}.`
      );
      setMemberForm({
        businessId: activeBusinessId || "",
        name: "",
        email: "",
        password: ""
      });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    } catch (error) {
      setMemberError(extractApiError(error, "Member could not be created."));
    }
  }

  const activeBusinessName = businesses?.find((b: any) => b._id === activeBusinessId)?.name;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Businesses</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage workspaces and admin access</p>
        </div>
        {currentUser && (
          <div className="flex items-center gap-2 rounded-full border border-[#d7ddd4] bg-white px-3.5 py-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-[#10332b] text-[10px] font-bold text-white">
              {currentUser.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <span className="text-xs font-medium text-slate-700">{currentUser.globalRole}</span>
          </div>
        )}
      </div>

      {/* Auth flow overview */}
      <Panel
        title="Admin auth flow"
        description="One shared login page for all admins. Access is granted through business membership."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FlowCard
            icon={
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5 text-emerald-600">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
              </svg>
            }
            title="First Admin"
            body="Created from /setup (runs once). Signs in at /login and creates the first business."
          />
          <FlowCard
            icon={
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5 text-blue-600">
                <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" />
              </svg>
            }
            title="Additional Admins"
            body="Created from this page with a password. They sign in at the same /login and get full workspace access."
          />
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f6f7f2] px-5 py-3.5 text-sm">
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0 text-slate-400">
            <path d="M8 1a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM4.5 8A4.5 4.5 0 01.087 13.7a.5.5 0 00.483.577h13.86a.5.5 0 00.483-.577A4.5 4.5 0 0011.5 8h-7z" />
          </svg>
          <span className="text-slate-600">Shared login page: <code className="rounded bg-white px-1.5 py-0.5 text-xs font-mono text-slate-800">/login</code></span>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {/* Businesses list */}
        <Panel
          title="Workspaces"
          description="All workspaces in this platform instance."
        >
          {!businesses?.length ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] py-10 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-8 text-slate-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <p className="text-sm text-slate-500">No workspaces yet. Create one using the form.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {businesses.map((business: any) => (
                <div
                  key={business._id}
                  className={`flex items-center justify-between rounded-2xl border px-5 py-4 transition ${
                    business._id === activeBusinessId
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-[#d7ddd4] bg-[#fbfbf8] hover:border-[#c5cebe]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#10332b] text-sm font-bold text-white">
                      {business.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{business.name}</p>
                        {business._id === activeBusinessId && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <code className="font-mono">{business.slug}</code>
                        <span className="mx-1.5 text-slate-300">·</span>
                        {business.timezone}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Forms column */}
        <div className="space-y-6">
          {/* Create business */}
          <Panel title="Create workspace">
            <form className="space-y-4" onSubmit={createBusiness}>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Business name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="Acme Inc."
                  value={businessForm.name}
                  onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Slug
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="acme-inc"
                  value={businessForm.slug}
                  onChange={(event) => setBusinessForm({ ...businessForm, slug: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Timezone
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="Asia/Kolkata"
                  value={businessForm.timezone}
                  onChange={(event) => setBusinessForm({ ...businessForm, timezone: event.target.value })}
                />
              </div>
              {businessError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="mt-0.5 size-3.5 shrink-0 text-red-500">
                    <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7.25a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-red-700">{businessError}</p>
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-[#10332b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0e2c25]"
              >
                Create workspace
              </button>
            </form>
          </Panel>

          {/* Create admin login */}
          <Panel
            title="Add admin login"
            description="Create another admin for the active workspace."
          >
            <form className="space-y-4" onSubmit={addMember}>
              <div className="flex items-center gap-2 rounded-xl bg-[#f6f7f2] px-4 py-3 text-sm">
                <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0 text-slate-400">
                  <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                </svg>
                <span className="text-slate-600">
                  Workspace: <span className="font-semibold text-slate-900">{activeBusinessName || "None selected"}</span>
                </span>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Full name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="Jane Smith"
                  value={memberForm.name}
                  onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Email address
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="jane@yourcompany.com"
                  type="email"
                  value={memberForm.email}
                  onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Password
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  placeholder="Choose a strong password"
                  type="password"
                  value={memberForm.password}
                  onChange={(event) => setMemberForm({ ...memberForm, password: event.target.value })}
                  required
                />
              </div>

              {memberError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="mt-0.5 size-3.5 shrink-0 text-red-500">
                    <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7.25a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-red-700">{memberError}</p>
                </div>
              )}
              {memberSuccess && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="mt-0.5 size-3.5 shrink-0 text-emerald-500">
                    <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.78 5.53a.75.75 0 00-1.06-1.06L7 9.19 5.28 7.47a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-emerald-800">{memberSuccess}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Create admin login
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FlowCard({
  icon,
  title,
  body
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f6f7f2] p-5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-white shadow-sm">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  );
}
