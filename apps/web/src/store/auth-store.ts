import { create } from "zustand";
import { api, setApiToken } from "../lib/api";
import type { Membership, SessionUser } from "../lib/types";

interface AuthState {
  token?: string;
  user?: SessionUser;
  memberships: Membership[];
  activeBusinessId?: string;
  setSession: (payload: {
    token: string;
    user: SessionUser;
    memberships: Membership[];
  }) => void;
  clearSession: () => void;
  setActiveBusinessId: (businessId: string) => void;
  hydrateMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  memberships: [],
  setSession: ({ token, user, memberships }) => {
    setApiToken(token);
    const fallbackBusinessId = memberships[0]?.businessId?._id;
    set({
      token,
      user,
      memberships,
      activeBusinessId: fallbackBusinessId
    });
    localStorage.setItem("automation.session", JSON.stringify({ token }));
  },
  clearSession: () => {
    setApiToken(undefined);
    localStorage.removeItem("automation.session");
    localStorage.removeItem("automation.activeBusinessId");
    set({
      token: undefined,
      user: undefined,
      memberships: [],
      activeBusinessId: undefined
    });
  },
  setActiveBusinessId: (activeBusinessId) => {
    localStorage.setItem("automation.activeBusinessId", activeBusinessId);
    set({ activeBusinessId });
  },
  hydrateMe: async () => {
    const raw = localStorage.getItem("automation.session");
    if (!raw) return;

    const session = JSON.parse(raw) as { token?: string };
    if (!session.token) return;

    setApiToken(session.token);
    const response = await api.get("/auth/me");
    set({
      token: session.token,
      user: response.data.data.user,
      memberships: response.data.data.memberships,
      activeBusinessId: response.data.data.memberships[0]?.businessId?._id
    });
  }
}));
