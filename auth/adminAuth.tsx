import React, { createContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut, User, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { adminMe } from "../api";

type Ctx = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | null>(null);

const parseAllowlist = (): string[] => {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? "";
  return raw.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
};

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const allowlist = useMemo(() => parseAllowlist(), []);
  const isAdmin = !!user?.email && allowlist.includes(user.email.toLowerCase());

  useEffect(() => {
    // Handle redirect result on page load
    getRedirectResult(auth).catch(() => {
      // ignore if no redirect happened
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsub();
  }, []);


  const signInFn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
  };

  const signOutFn = async () => {
    await signOut(auth);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, isAdmin, signIn: signInFn, signOutUser: signOutFn }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = useMemo(() => {
    const p = new GoogleAuthProvider();
    // optional: always prompt account chooser
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will run and then we’ll call adminMe()
    } catch (e: any) {
      console.error("signIn error", e);
      setError(e?.message || "Error al iniciar sesión.");
      throw e;
    }
  };

  const signOutAdmin = async () => {
    setError(null);
    await signOut(auth);
    setIsAdmin(false);
    setUser(null);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const r = await adminMe(); // callable
        setIsAdmin(Boolean(r.isAdmin));
      } catch (e) {
        console.error("adminMe error", e);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { user, loading, isAdmin, signIn, signOutAdmin, error };
}