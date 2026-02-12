import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../adminAuth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../../firebase";

export default function AdminLogin() {
  const { signIn, user, loading, isAdmin, error } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      console.log("AUTH USER:", u?.email, u?.uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (loading) return;

    // If signed in and allowed, go to admin
    if (user && isAdmin) {
      navigate("/admin", { replace: true });
      return;
    }

    // If signed in but NOT allowed, go to denied
    if (user && !isAdmin) {
      navigate("/admin/denied", { replace: true });
      return;
    }
  }, [user, isAdmin, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-50">
      <div className="w-full max-w-md rounded-3xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-black text-[#40068B]">Admin</h1>
        <p className="text-sm text-stone-500 font-medium mt-2">
          Iniciar sesión con Google. Solo correos autorizados pueden entrar.
        </p>

        <button
          onClick={() => signIn()}
          className="mt-5 w-full rounded-2xl bg-black text-white py-3 font-black"
        >
          Iniciar sesión con Google
        </button>

        {error && (
          <div className="mt-3 p-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {!loading && user && (
          <p className="mt-4 text-xs text-stone-500">
            Sesión detectada: <b>{user.email}</b>
          </p>
        )}
      </div>
    </div>
  );
}
