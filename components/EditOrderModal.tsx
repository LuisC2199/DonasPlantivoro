import React from "react";
import { Button } from "./Button";
import { Order, OrderQuantities } from "../types";

type Props = {
  open: boolean;
  order: Order;
  flavors: Array<{ key: keyof OrderQuantities; label: string }>;
  onClose: () => void;
  onSave: (quantities: OrderQuantities) => Promise<void>;
};

const clamp = (n: number) => Math.max(0, Math.min(999, n));

const validate = (q: OrderQuantities) => {
  const total = Object.values(q).reduce((a, b) => a + b, 0);
  if (total < 6) return "Mínimo 6 donas.";
  for (const [k, v] of Object.entries(q)) {
    if (v === 1) return `No se permiten donas individuales (${k}).`;
    if (v > 0 && v < 2) return `Mínimo 2 por sabor (${k}).`;
  }
  return "";
};

export default function EditOrderModal({ open, order, flavors, onClose, onSave }: Props) {
  const [q, setQ] = React.useState<OrderQuantities>(() => ({
    azucar: 0, cafe: 0, seasonal: 0, cheesecake: 0, chocolate: 0, oreo: 0, zanahoria: 0,
    ...(order.quantities as any),
  }));

  const [saving, setSaving] = React.useState(false);
  const error = validate(q);
  const total: number = (Object.values(q) as number[]).reduce((sum, v) => sum + (v || 0), 0);

  React.useEffect(() => {
    if (!open) return;
    setQ({
      azucar: 0, cafe: 0, seasonal: 0, cheesecake: 0, chocolate: 0, oreo: 0, zanahoria: 0,
      ...(order.quantities as any),
    });
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open, order]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />

      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
        <div className="
          w-full sm:max-w-lg
          bg-white
          rounded-[2rem]
          shadow-2xl border border-stone-100
          overflow-hidden
          flex flex-col
          max-h-[85vh] sm:max-h-[80vh]
        ">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-stone-100">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-xl font-black text-[#40068B] truncate">Editar pedido</h3>
                <p className="text-sm text-stone-500 font-medium mt-1 truncate">
                  {order.nombre} <span className="mx-2 text-stone-300">•</span> {order.fechaEntrega}
                </p>
              </div>
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-2xl bg-stone-50 border border-stone-100 font-black text-stone-500 hover:bg-stone-100"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5">
            <div className="space-y-4">
              {flavors.map((f) => (
                <div key={String(f.key)} className="flex items-center justify-between bg-stone-50 border border-stone-100 rounded-2xl p-4">
                  <div className="font-black text-stone-800">{f.label}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-2xl bg-white border border-stone-200 font-black text-stone-700"
                      onClick={() => setQ((prev) => ({ ...prev, [f.key]: clamp((prev[f.key] || 0) - 1) }))}
                    >
                      −
                    </button>
                    <div className="w-14 text-center font-black text-xl text-[#40068B]">
                      {q[f.key] || 0}
                    </div>
                    <button
                      type="button"
                      className="h-10 w-10 rounded-2xl bg-white border border-stone-200 font-black text-stone-700"
                      onClick={() => setQ((prev) => ({ ...prev, [f.key]: clamp((prev[f.key] || 0) + 1) }))}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs font-black uppercase tracking-widest text-stone-400">Total donas</div>
                <div className={`text-2xl font-black ${total >= 6 ? "text-[#28CD7E]" : "text-red-500"}`}>
                  {total}
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-black">
                  {error}
                </div>
              )}

              <div className="h-2" />
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 sm:p-8 border-t border-stone-100 bg-white">
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!!error || saving}
                onClick={async () => {
                  try {
                    setSaving(true);
                    await onSave(q);
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}