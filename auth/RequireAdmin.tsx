import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "./adminAuth";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/admin/login", { replace: true });
    else if (!isAdmin) navigate("/admin/denied", { replace: true });
  }, [loading, user, isAdmin, navigate]);

  if (loading) return <div className="p-8 font-black text-[#40068B]">Cargando…</div>;
  if (!user || !isAdmin) return null;
  return <>{children}</>;
}
