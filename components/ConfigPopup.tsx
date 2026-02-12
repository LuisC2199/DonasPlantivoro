import React from "react";
import { Button } from "./Button";

type Range = { start: string; end: string };

type ConfigPopupProps = {
  open: boolean;
  title?: string;
  subtitle?: string;

  seasonalLabelInput: string;
  setSeasonalLabelInput: (v: string) => void;

  blockedEnabled: boolean;
  setBlockedEnabled: (v: boolean) => void;

  blockedMessage: string;
  setBlockedMessage: (v: string) => void;

  blockedRanges: Range[];
  setBlockedRanges: (v: Range[]) => void;

  saving: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
};

const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isRangeValid = (r: Range) => isISO(r.start) && isISO(r.end) && r.end >= r.start;

export default function ConfigPopup({
  open,
  title = "Configuración",
  subtitle = "Cambia el sabor de dona de temporada y bloquea fechas.",
  seasonalLabelInput,
  setSeasonalLabelInput,

  blockedEnabled,
  setBlockedEnabled,
  blockedMessage,
  setBlockedMessage,
  blockedRanges,
  setBlockedRanges,

  saving,
  onClose,
  onSave,
}: ConfigPopupProps) {
  const ranges = blockedRanges ?? [];

  const addRange = () => setBlockedRanges([...ranges, { start: "", end: "" }]);
  const updateRange = (i: number, patch: Partial<Range>) =>
    setBlockedRanges(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRange = (i: number) => setBlockedRanges(ranges.filter((_, idx) => idx !== i));

  const anyInvalidRange =
    blockedEnabled && ranges.some((r) => (r.start || r.end) && !isRangeValid(r));

  // Lock background scroll + ESC to close
  React.useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSave = !saving && seasonalLabelInput.trim() && !anyInvalidRange;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="button"
        aria-label="Cerrar modal"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
      />

      {/* Sheet/modal */}
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
        <div
          className="
            relative w-full sm:max-w-lg
            bg-white
            rounded-t-[2rem] sm:rounded-[2rem]
            shadow-2xl border border-stone-100
            flex flex-col
            max-h-[85vh] sm:max-h-[80vh]
            overflow-hidden
          "
        >
          {/* HEADER */}
          <div className="p-6 sm:p-8 border-b border-stone-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#40068B]">{title}</h3>
                <p className="text-sm text-stone-500 font-medium mt-1">{subtitle}</p>
              </div>

              <button
                onClick={onClose}
                className="h-10 w-10 rounded-2xl bg-stone-50 border border-stone-100 font-black text-stone-500 hover:bg-stone-100"
                aria-label="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          {/* BODY (scrollable) */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-6 sm:px-8 py-5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-6">
              {/* Seasonal label */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">
                  Sabor de temporada
                </label>

                <input
                  value={seasonalLabelInput}
                  onChange={(e) => setSeasonalLabelInput(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                  placeholder="Ej. Red Velvet"
                  autoFocus
                />

                <p className="mt-2 text-[11px] text-stone-400 font-medium">
                  Tip: el nombre debe coincidir con el archivo (minúsculas, sin espacios).
                </p>
              </div>

              {/* Blocked dates */}
              <div className="bg-stone-50 border border-stone-100 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-[#40068B]">Bloquear fechas</div>
                    <div className="text-xs text-stone-500 font-medium mt-1">
                      Evita pedidos en un rango (vacaciones, mantenimiento, etc).
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBlockedEnabled(!blockedEnabled)}
                    className={`shrink-0 h-10 px-3 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${
                      blockedEnabled
                        ? "bg-[#28CD7E] text-white border-[#28CD7E]"
                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {blockedEnabled ? "Activado" : "Desactivado"}
                  </button>
                </div>

                {blockedEnabled && (
                  <div className="mt-5 space-y-4">
                    {/* Message */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">
                        Aviso para clientes
                      </label>

                      <textarea
                        value={blockedMessage}
                        onChange={(e) => setBlockedMessage(e.target.value)}
                        className="w-full min-h-[90px] p-4 rounded-2xl bg-white border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                        placeholder="Estas fechas están bloqueadas. Elige otra fecha 🙏"
                      />

                      <p className="mt-2 text-[11px] text-stone-400 font-medium">
                        Este aviso aparece en la pantalla de fecha cuando el cliente elige un día bloqueado.
                      </p>
                    </div>

                    {/* Ranges */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
                          Rangos bloqueados
                        </label>

                        <button
                          type="button"
                          onClick={addRange}
                          className="text-xs font-black text-[#40068B] hover:underline"
                        >
                          + Agregar rango
                        </button>
                      </div>

                      {ranges.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-white border border-stone-100 text-stone-400 text-sm font-bold">
                          No hay rangos. Agrega uno para bloquear fechas.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {ranges.map((r, idx) => {
                            const invalid = (r.start || r.end) && !isRangeValid(r);

                            return (
                              <div
                                key={idx}
                                className={`p-4 rounded-2xl border bg-white ${
                                  invalid ? "border-red-200" : "border-stone-100"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 grid grid-cols-2 gap-3">
                                    <div>
                                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                                        Inicio
                                      </div>
                                      <input
                                        type="date"
                                        value={r.start}
                                        onChange={(e) => updateRange(idx, { start: e.target.value })}
                                        className="w-full h-11 px-3 rounded-2xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                                      />
                                    </div>

                                    <div>
                                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                                        Fin
                                      </div>
                                      <input
                                        type="date"
                                        value={r.end}
                                        onChange={(e) => updateRange(idx, { end: e.target.value })}
                                        className="w-full h-11 px-3 rounded-2xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => removeRange(idx)}
                                    className="h-11 w-11 rounded-2xl bg-stone-50 border border-stone-100 font-black text-stone-500 hover:bg-stone-100"
                                    aria-label="Eliminar rango"
                                    title="Eliminar rango"
                                  >
                                    🗑️
                                  </button>
                                </div>

                                {invalid && (
                                  <div className="mt-2 text-xs font-black text-red-500">
                                    Rango inválido. Asegúrate que fin ≥ inicio y ambas fechas existan.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {anyInvalidRange && (
                        <div className="mt-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-black">
                          Hay rangos inválidos. Corrígelos antes de guardar.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* bottom spacer so last inputs aren't tight */}
              <div className="h-2" />
            </div>
          </div>

          {/* FOOTER (always visible) */}
          <div className="p-6 sm:p-8 border-t border-stone-100 bg-white pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>

              <Button className="flex-1" disabled={!canSave} onClick={onSave}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
