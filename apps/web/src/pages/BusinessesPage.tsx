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
    password: "",
    role: "admin"
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
        `${memberForm.role} login is ready. They can use the same /login page with ${memberForm.email}.`
      );
      setMemberForm({
        businessId: activeBusinessId || "",
        name: "",
        email: "",
        password: "",
        role: "admin"
      });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    } catch (error) {
      setMemberError(extractApiError(error, "Member could not be created."));
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Role-wise auth flow"
        description="Every role uses the same login page. The difference comes from who created the account and what business membership that account has."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <FlowCard
            title="Super Admin"
            body="Created only from /setup. Uses /login afterward. Can create businesses and manage platform structure."
          />
          <FlowCard
            title="Business Admin"
            body="Created from this page with role = admin and a password. Uses the same /login page, then gets admin access inside the selected business."
          />
          <FlowCard
            title="Normal User"
            body="Created from this page with role = user and a password. Uses the same /login page, but gets limited access based on the business membership."
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
          description="Only the super admin should create new businesses. Admin and user logins are created under a business."
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
            title="Create admin or user login"
            description="This form now includes the missing password field. The created member will use the same /login page as everyone else."
          >
            <form className="grid gap-3" onSubmit={addMember}>
              <select
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                value={memberForm.businessId}
                onChange={(event) => setMemberForm({ ...memberForm, businessId: event.target.value })}
              >
                <option value="">Select business</option>
                {businesses?.map((business: any) => (
                  <option key={business._id} value={business._id}>
                    {business.name}
                  </option>
                ))}
              </select>
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
              <select
                className="rounded-2xl border border-[#d7ddd4] px-4 py-3"
                value={memberForm.role}
                onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>

              <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-700">
                Login flow:
                <div className="mt-2">1. Create the member here</div>
                <div>2. Share email + password with that member</div>
                <div>3. They sign in from the same `/login` page</div>
                <div>4. Role + business membership controls what they can access</div>
              </div>

              {memberError ? <p className="text-sm text-red-600">{memberError}</p> : null}
              {memberSuccess ? <p className="text-sm text-emerald-700">{memberSuccess}</p> : null}

              <button className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                Create member login
              </button>
            </form>
          </Panel>
        </div>
      </div>

      <Panel
        title="What happens after login"
        description="The login page is shared. The platform decides the experience after login using the role and business membership."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <AuthResultCard
            role="super_admin"
            body="Sees platform-level business management. Can create businesses and oversee the whole workspace."
          />
          <AuthResultCard
            role="admin"
            body="Sees business operations such as Drive Browser, queue planning, integrations, and member management for that business."
          />
          <AuthResultCard
            role="user"
            body="Uses the same login page, but should stay limited to allowed business-scoped operations."
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
