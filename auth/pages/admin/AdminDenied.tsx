import React from "react";
import { useAdminAuth } from "../../adminAuth";

export default function AdminDenied() {
  const { user, signOutUser } = useAdminAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-50">
      <div className="w-full max-w-md rounded-3xl border bg-white p-6">
        <h1 className="text-xl font-black text-[#40068B]">Acceso denegado</h1>
        <p className="text-sm text-stone-600 mt-2">
          {user?.email ? <>Tu correo <b>{user.email}</b> no está autorizado.</> : <>No tienes acceso.</>}
        </p>
        <button
          onClick={() => signOutUser()}
          className="mt-5 w-full rounded-2xl border py-3 font-black"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
