import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, loadSession, saveSession, Session, setUnauthorizedHandler } from "./api";

interface Me {
  role: Session["user"]["role"];
  employeeId: string | null;
  company: { id: string; name: string; legalName: string };
  employee: { id: string; code: string; name: string; designation: string } | null;
}

interface AuthState {
  session: Session | null;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [me, setMe] = useState<Me | null>(null);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
    setMe(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  useEffect(() => {
    if (session) api<Me>("/auth/me").then(setMe, () => undefined);
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const s = await api<Session>("/auth/login", { body: { email, password } });
    saveSession(s);
    setSession(s);
  };

  return <AuthContext.Provider value={{ session, me, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const isHrRole = (role?: string) => role === "OWNER" || role === "HR";
