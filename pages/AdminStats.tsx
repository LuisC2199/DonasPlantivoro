import React from "react";
import { Link } from "react-router-dom";
import { getOrders } from "../api";
import { FLAVORS } from "../constants";
import type { Order } from "../types";
import { Button } from "../components/Button";
import type { PublicConfig } from "../api";

type Props = { publicConfig: PublicConfig };

const monthKey = (iso?: string) => {
  // iso: YYYY-MM-DD
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "unknown";
  return iso.slice(0, 7); // YYYY-MM
};

const formatMonthES = (yyyyMM: string) => {
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) return yyyyMM;
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("es-MX", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());
};

const formatMoney = (n: number) =>
  n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

export default function AdminStats({ publicConfig }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const seasonalLabel = publicConfig.seasonalLabel || "Seasonal";

  const flavors = React.useMemo(() => {
    return FLAVORS.map((f) => ({
      ...f,
      label: f.key === "seasonal" ? seasonalLabel : f.label,
    }));
  }, [seasonalLabel]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // minimal: fetch ALL orders (no month filter)
        const all = await getOrders("Todos");
        setOrders(all);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = React.useMemo(() => {
    const totalOrders = orders.length;
    const totalDonas = orders.reduce((sum, o) => sum + (o.totalDonas || 0), 0);
    const totalMXN = orders.reduce((sum, o) => sum + (o.precioTotal || 0), 0);

    // flavors totals
    const byFlavor: Record<string, number> = {};
    for (const o of orders) {
      for (const [k, v] of Object.entries(o.quantities || {})) {
        byFlavor[k] = (byFlavor[k] || 0) + (Number(v) || 0);
      }
    }

    // orders per month
    const byMonthOrders: Record<string, number> = {};
    const byMonthDonas: Record<string, number> = {};
    const byMonthRevenue: Record<string, number> = {};
    for (const o of orders) {
      const mk = monthKey(o.fechaEntrega);
      byMonthOrders[mk] = (byMonthOrders[mk] || 0) + 1;
      byMonthDonas[mk] = (byMonthDonas[mk] || 0) + (o.totalDonas || 0);
      byMonthRevenue[mk] = (byMonthRevenue[mk] || 0) + (o.precioTotal || 0);
    }

    const topMonths = Object.entries(byMonthOrders)
      .filter(([k]) => k !== "unknown")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const topFlavors = flavors
      .map((f) => ({ key: f.key, label: f.label, qty: byFlavor[f.key] || 0 }))
      .sort((a, b) => b.qty - a.qty);

    // a couple extra useful KPIs
    const avgDonasPerOrder = totalOrders ? totalDonas / totalOrders : 0;
    const avgTicket = totalOrders ? totalMXN / totalOrders : 0;

    return {
      totalOrders,
      totalDonas,
      totalMXN,
      avgDonasPerOrder,
      avgTicket,
      topMonths,
      topFlavors,
      byMonthDonas,
      byMonthRevenue,
    };
  }, [orders, flavors]);

  if (loading) {
    return (
      <div className="p-12 text-center font-black text-[#40068B]">
        Cargando estadísticas…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-[#40068B]">Stats</h1>
          <p className="text-[#28CD7E] font-bold uppercase tracking-widest text-xs mt-1">
            Visión general del negocio
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              ← Volver
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
            Pedidos totales
          </div>
          <div className="mt-2 text-4xl font-black text-stone-900">
            {totals.totalOrders}
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
            Donas totales
          </div>
          <div className="mt-2 text-4xl font-black text-stone-900">
            {totals.totalDonas}
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
            Ingresos totales
          </div>
          <div className="mt-2 text-4xl font-black text-[#40068B]">
            ${formatMoney(totals.totalMXN)}
          </div>
          <div className="mt-1 text-xs font-bold text-stone-400">MXN</div>
        </div>

        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
            Promedios
          </div>
          <div className="mt-2 text-lg font-black text-stone-900">
            {totals.avgDonasPerOrder.toFixed(1)} donas / pedido
          </div>
          <div className="mt-1 text-lg font-black text-stone-900">
            ${formatMoney(totals.avgTicket)} / pedido
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flavors */}
        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-[#40068B]">Suma por sabor</h2>
            <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">
              (piezas)
            </span>
          </div>

          <div className="space-y-3">
            {totals.topFlavors.map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 border border-stone-100"
              >
                <div className="font-black text-stone-800">{f.label}</div>
                <div className="font-black text-[#40068B] text-xl">{f.qty}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Months */}
        <div className="bg-white rounded-[2rem] border border-stone-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-[#40068B]">Meses top</h2>
            <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">
              pedidos / donas / $
            </span>
          </div>

          {totals.topMonths.length === 0 ? (
            <div className="p-8 rounded-2xl bg-stone-50 border border-stone-100 text-stone-400 font-bold">
              Aún no hay suficientes pedidos para calcular meses top.
            </div>
          ) : (
            <div className="space-y-3">
              {totals.topMonths.map(([mk, count]) => (
                <div
                  key={mk}
                  className="p-4 rounded-2xl bg-stone-50 border border-stone-100"
                >
                  <div className="flex items-end justify-between">
                    <div className="font-black text-stone-900">
                      {formatMonthES(mk)}
                    </div>
                    <div className="font-black text-[#28CD7E]">
                      {count} pedidos
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm font-bold text-stone-600">
                    <span>{totals.byMonthDonas[mk] || 0} donas</span>
                    <span>${formatMoney(totals.byMonthRevenue[mk] || 0)} MXN</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* tiny footer note */}
      <div className="mt-8 text-xs font-bold text-stone-400">
        Nota: Esta vista calcula stats a partir de los pedidos cargados (modo MVP).
      </div>
    </div>
  );
}
