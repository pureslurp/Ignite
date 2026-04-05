"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const auth = getFirebaseAuth();
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
      return () => unsub();
    } catch {
      setLoading(false);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    async signIn(email, password) {
      if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    },
    async signUp(email, password) {
      if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
      await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    },
    async signInWithGoogle() {
      if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getFirebaseAuth(), provider);
    },
    async signOut() {
      if (!isFirebaseConfigured()) return;
      await fbSignOut(getFirebaseAuth());
    },
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
