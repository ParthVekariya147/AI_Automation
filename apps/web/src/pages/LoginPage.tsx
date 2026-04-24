import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const response = await api.post("/auth/login", { email, password });
      setSession(response.data.data);
      navigate("/");
    } catch (err) {
      setError(extractApiError(err, "Login failed. Check your credentials and try again."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-glow px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-brand-600">Platform Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Sign in to manage brands</h1>
        <div className="mt-4 rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm leading-6 text-slate-700">
          Single admin login:
          <div className="mt-2">Use the admin account created during setup or from the Businesses page.</div>
        </div>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-brand-200 focus:ring-2"
            placeholder="Email"
            type="email"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-brand-200 focus:ring-2"
            placeholder="Password"
            type="password"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="w-full rounded-2xl bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700">
            Sign in
          </button>
        </form>
        <Link className="mt-4 block text-center text-sm text-brand-700" to="/setup">
          Create the first admin
        </Link>
      </div>
    </div>
  );
}
