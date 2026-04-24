import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";

export function SetupPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const response = await api.post("/auth/bootstrap", form);
      setSession({ ...response.data.data, memberships: [] });
      navigate("/");
    } catch (err) {
      setError(
        extractApiError(
          err,
          "Bootstrap failed. If the platform is already initialized, use the login page."
        )
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-glow px-4">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-brand-600">Initial Setup</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Create the first super admin</h1>
        <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-brand-200 focus:ring-2"
            placeholder="Full name"
          />
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-brand-200 focus:ring-2"
            placeholder="Email"
            type="email"
          />
          <input
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-brand-200 focus:ring-2"
            placeholder="Password"
            type="password"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="rounded-2xl bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700">
            Bootstrap platform
          </button>
        </form>
      </div>
    </div>
  );
}
