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
        `Admin login is ready. They can use the same /login page with ${memberForm.email}.`
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

  return (
    <div className="space-y-6">
      <Panel
        title="Admin auth flow"
        description="The app now uses one admin role. Every admin uses the same login page and gets access through business membership."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FlowCard
            title="First Admin"
            body="Created from /setup. Uses /login afterward and can create the first business."
          />
          <FlowCard
            title="Additional Admin"
            body="Created from this page with a password. Uses the same /login page and gets full access inside the current workspace."
          />
        </div>
        <div className="mt-5 rounded-3xl bg-[#f6f7f2] px-5 py-4 text-sm text-slate-700">
          Current shared login page:
          <span className="ml-2 font-medium text-slate-950">`/login`</span>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Businesses"
          description="Admins can create businesses and manage admin access under each business."
        >
          <div className="space-y-3">
            {businesses?.map((business: any) => (
              <div
                key={business._id}
                className="rounded-3xl border border-[#d7ddd4] bg-[#fbfbf8] px-5 py-4 text-sm text-slate-700"
              >
                <p className="font-semibold text-slate-900">{business.name}</p>
                <p className="mt-1">{business.slug}</p>
                <p className="mt-1">{business.timezone}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Create business">
            <form className="grid gap-3" onSubmit={createBusiness}>
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="Business name"
                value={businessForm.name}
                onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })}
              />
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="business-slug"
                value={businessForm.slug}
                onChange={(event) => setBusinessForm({ ...businessForm, slug: event.target.value })}
              />
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="Timezone"
                value={businessForm.timezone}
                onChange={(event) =>
                  setBusinessForm({ ...businessForm, timezone: event.target.value })
                }
              />
              {businessError ? <p className="text-sm text-red-600">{businessError}</p> : null}
              <button className="rounded-2xl bg-[#10332b] px-4 py-3 text-white">
                Create business
              </button>
            </form>
          </Panel>

          <Panel
            title="Create admin login"
            description="Create another admin for the current workspace. They will use the same /login page as everyone else."
          >
            <form className="grid gap-3" onSubmit={addMember}>
              <div className="rounded-2xl border border-[#d7ddd4] bg-[#f6f7f2] px-4 py-3 text-sm text-slate-700">
                Workspace:
                <span className="ml-2 font-medium text-slate-950">
                  {businesses?.find((business: any) => business._id === activeBusinessId)?.name ||
                    "No workspace selected yet"}
                </span>
              </div>
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="Full name"
                value={memberForm.name}
                onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })}
              />
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="Email"
                type="email"
                value={memberForm.email}
                onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })}
              />
              <input
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                placeholder="Password"
                type="password"
                value={memberForm.password}
                onChange={(event) => setMemberForm({ ...memberForm, password: event.target.value })}
              />
              <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-700">
                Login flow:
                <div className="mt-2">1. Create the member here</div>
                <div>2. Share email + password with that member</div>
                <div>3. They sign in from the same `/login` page</div>
                <div>4. Their login opens their workspace automatically</div>
              </div>

              {memberError ? <p className="text-sm text-red-600">{memberError}</p> : null}
              {memberSuccess ? <p className="text-sm text-emerald-700">{memberSuccess}</p> : null}

              <button className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                Create admin login
              </button>
            </form>
          </Panel>
        </div>
      </div>

      <Panel
        title="What happens after login"
        description="The login page is shared. Access is now based on admin membership for the current workspace."
      >
        <div className="grid gap-4 md:grid-cols-1">
          <AuthResultCard
            role="admin"
            body="Sees workspace operations such as Drive Browser, queue planning, integrations, analytics, and member management for their login."
          />
        </div>
        <div className="mt-5 text-sm text-slate-600">
          Signed-in platform role right now:
          <span className="ml-2 font-medium text-slate-950">{currentUser?.globalRole || "-"}</span>
        </div>
      </Panel>
    </div>
  );
}

function FlowCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-[#f6f7f2] p-5">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  );
}

function AuthResultCard({ role, body }: { role: string; body: string }) {
  return (
    <div className="rounded-3xl border border-[#d7ddd4] bg-[#fbfbf8] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{role}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  );
}
