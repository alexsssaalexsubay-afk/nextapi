import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sidecarFetch, SidecarError } from "@/lib/sidecar";

export interface UserInfo {
  email: string;
  sessionToken: string;
  dashboardKey: string;
}

export interface AccountStatus {
  tier: string;
  authenticated: boolean;
  email?: string;
  credits: number;
  maxProjects: number;
  maxShotsPerProject: number;
  watermark: boolean;
}

interface AuthState {
  user: UserInfo | null;
  status: AccountStatus | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchStatus: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      status: null,
      isLoading: false,
      error: null,

      loginWithPassword: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await sidecarFetch<{ session_token?: string; dashboard_key?: { secret?: string } }>(
            "/auth/login",
            {
              method: "POST",
              body: JSON.stringify({ email, password }),
            }
          );

          if (!res.session_token || !res.dashboard_key?.secret) {
            throw new Error("Invalid response from server");
          }

          set({
            user: {
              email,
              sessionToken: res.session_token,
              dashboardKey: res.dashboard_key.secret,
            },
            isLoading: false,
          });

          await get().fetchStatus();
        } catch (err) {
          const msg = err instanceof SidecarError ? err.body : err instanceof Error ? err.message : "Login failed";
          let parsedMsg = msg;
          try {
            const parsed = JSON.parse(msg);
            if (parsed.detail) parsedMsg = parsed.detail;
          } catch {
            // keep raw msg
          }
          
          set({ error: parsedMsg, isLoading: false });
          throw err;
        }
      },

      logout: () => {
        set({ user: null, status: null });
      },

      fetchStatus: async () => {
        try {
          // You could pass the token to the sidecar here to get user-specific status
          const res = await sidecarFetch<any>("/auth/status");
          
          set({
            status: {
              tier: res.tier || "free",
              authenticated: !!get().user,
              email: get().user?.email,
              credits: res.credits || 0,
              maxProjects: res.max_projects || 3,
              maxShotsPerProject: res.max_shots_per_project || 5,
              watermark: res.watermark ?? true,
            },
          });
        } catch (err) {
          // ignore status fetch errors
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "nextcut-auth",
      partialize: () => ({ user: null, status: null }),
      merge: (_persisted, current) => ({ ...current, user: null, status: null }),
      onRehydrateStorage: () => () => {
        if (typeof localStorage !== "undefined") localStorage.removeItem("nextcut-auth");
      },
    }
  )
);
