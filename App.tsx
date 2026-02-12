
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Order, TipoPedido, OrderQuantities } from './types';
import { FLAVORS, PUNTOS_RECOLECCION, PUNTOS_VENTA, HORARIOS_RECOLECCION } from './constants';
import { calculateOrderPrice, validateOrderDate, createOrder, getOrders, updateOrderStatus, getPublicConfig, PublicConfig, updateAdminConfig, deleteOrder, adminUpdateOrderQuantities } from './api';
import { Button } from './components/Button';
import { QuantityStepper } from './components/QuantityStepper';
import { RequireAdmin } from "./auth/RequireAdmin";
import AdminLogin from "./auth/pages/admin/AdminLogin";
import AdminDenied from "./auth/pages/admin/AdminDenied";
import { isValidEmail, isValidPhone } from "./utils/validation";
import ConfigPopup from "./components/ConfigPopup";
import EditOrderModal from "./components/EditOrderModal";
import AdminStats from "./pages/AdminStats";
import Toast from "./components/Toast";
import * as XLSX from "xlsx";

const toSeasonalSlug = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "")      // remove spaces & symbols
    .trim();

const seasonalImageSrc = (seasonalLabel: string) => `/images/flavors/${toSeasonalSlug(seasonalLabel)}.png`;

const isDateBlocked = ( iso: string, ranges: Array<{ start: string; end: string }>) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return ranges.some(r => iso >= r.start && iso <= r.end);
};


// --- Shared Components ---

const ProgressBar = ({ step }: { step: number }) => (
  <div className="fixed top-0 left-0 w-full h-1.5 bg-stone-100 z-50">
    <div 
      className="h-full bg-[#28CD7E] transition-all duration-500 ease-out"
      style={{ width: `${(step / 5) * 100}%` }}
    />
  </div>
);

const Header = () => (
  <header className="flex flex-col items-center py-8 px-4">
    <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center mb-3 ring-4 ring-[#40068B]/10 overflow-hidden">
      <img src="/images/brand/logo1.png" alt="Logo" className="w-full h-full object-cover" />
    </div>
    <h1 className="text-2xl font-black text-[#40068B] tracking-tight">El Plantívoro Donas</h1>
    <p className="text-sm text-[#28CD7E] font-bold uppercase tracking-widest">Vegan & Cruelty Free</p>
    <br></br>
        {/* Hero strip */}
    <div className="w-full h-44 overflow-hidden">
      <img
        src="/images/brand/hero.JPG"
        alt="Donas artesanales veganas"
        className="w-full h-full object-cover"
      />
    </div>

  </header>
);

// --- Wizard Steps ---

const Step1 = ({ data, update }: { data: Partial<Order>, update: (u: Partial<Order>) => void }) => {
  return (
    <div className="space-y-6 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-black text-stone-900 mb-2">¿Cómo será tu pedido?</h2>
        <p className="text-stone-500 font-medium">Selecciona el tipo de orden que deseas realizar.</p>
      </div>
      <div className="grid gap-4">
        {(['Personal', 'Punto de venta'] as TipoPedido[]).map((type) => (
          <button
            key={type}
            onClick={() => update({ tipoPedido: type })}
            className={`p-6 text-left rounded-3xl border-2 transition-all ${
              data.tipoPedido === type 
                ? 'border-[#28CD7E] bg-[#28CD7E]/5 ring-2 ring-[#28CD7E]/10' 
                : 'border-stone-100 bg-white hover:border-stone-200'
            }`}
          >
            <div className={`text-xl font-black mb-1 ${data.tipoPedido === type ? 'text-[#28CD7E]' : 'text-stone-800'}`}>{type}</div>
            <p className="text-sm text-stone-500 leading-relaxed">
              {type === 'Personal' 
                ? 'Ideal para disfrutar en casa, compartir con amigos or regalar en una ocasión especial.' 
                : 'Precio preferencial para cafeterías, tiendas y aliados comerciales.'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

const Step2 = ({ data, update, blocked, isAdmin, }: { data: Partial<Order>, update: (u: Partial<Order>) => void, blocked: PublicConfig["blocked"]; isAdmin: boolean;}) => {
  const [error, setError] = useState('');
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    const validation = validateOrderDate(date, isAdmin, blocked);
    if (!validation.valid) {
      setError(validation.message || '');
    } else {
      setError('');
    }
    update({ fechaEntrega: date });
  };

  return (
    <div className="space-y-6 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-black text-stone-900 mb-2">Fecha de entrega</h2>
        <p className="text-stone-500 font-medium">¿Cuándo quieres tus donas recién horneadas?</p>
      </div>
      <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
        <label className="block text-xs font-black text-[#40068B] uppercase tracking-wider mb-2">Día de entrega</label>
        <input 
          type="date" 
          value={data.fechaEntrega || ''}
          onChange={handleDateChange}
          className="w-full p-4 rounded-2xl bg-stone-50 border border-stone-100 text-lg font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20 focus:border-[#28CD7E] transition-all"
        />
        {error && <p className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">{error}</p>}
        <div className="mt-6 flex items-start gap-4 p-5 bg-[#40068B]/5 rounded-2xl border border-[#40068B]/10">
          <span className="text-xl">📆</span>
          <p className="text-xs font-bold text-[#40068B] leading-relaxed">
            Importante: No recibimos pedidos en domingo. <br/>
            Puedes pedir hoy para recibir mañana.
          </p>
        </div>

        {data.fechaEntrega && blocked?.enabled && isDateBlocked(data.fechaEntrega, blocked.ranges) && (
          <div className="mt-3 p-4 bg-amber-50 text-amber-900 rounded-2xl border border-amber-200 text-sm font-bold">
            {blocked.message}
          </div>
        )}
      </div>
    </div>
  );
};

const Step3 = ({
  data,
  update,
  onBack,
  onNext,
  canContinue,
  flavors,
}: {
  data: Partial<Order>;
  update: (u: Partial<Order>) => void;
  onBack: () => void;
  onNext: () => void;
  canContinue: boolean;
  flavors: typeof FLAVORS;
}) => {
  const quantities = data.quantities || {
    azucar: 0, cafe: 0, seasonal: 0, cheesecake: 0, chocolate: 0, oreo: 0, zanahoria: 0
  };

  const { total, price } = calculateOrderPrice(data.tipoPedido!, data.puntoVenta, quantities);
  const remaining = Math.max(0, 6 - total);

  const handleQtyChange = (key: keyof OrderQuantities, val: number) => {
    update({ quantities: { ...quantities, [key]: val } });
  };

  return (
    <div className="space-y-6 px-4 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-black text-stone-900 mb-2">Arma tu caja</h2>
        <p className="text-stone-500 font-medium">Mínimo 6 donas. Selecciona al menos 2 por sabor.</p>
      </div>
      
      <div className="grid gap-3">
        {flavors.map((f) => (
          <QuantityStepper 
            key={f.key} 
            label={f.label} 
            image={f.image}
            value={quantities[f.key]} 
            onChange={(v) => handleQtyChange(f.key, v)}
            colorClass={f.color}
          />
        ))}
      </div>

      <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-md border-t border-stone-100 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest">Subtotal estimado</div>
            <div className="text-3xl font-black text-[#40068B]">${price} <span className="text-xs font-bold text-stone-400">MXN</span></div>
            <div className={`text-xs font-black mt-0.5 ${total < 6 ? 'text-red-500' : 'text-[#28CD7E]'}`}>
              6 donas mínimo {total >= 6 ? '✓' : ''}
            </div>
            {total < 6 && (
              <div className="mt-1 text-[11px] text-stone-400 font-medium">
                Agrega{" "}
                <span className="font-black text-stone-600">
                  {remaining}
                </span>{" "}
                dona{remaining > 1 ? "s" : ""} más para continuar
              </div>
            )}
            <div className="flex gap-3 flex-shrink-0">
              <Button variant="outline" className="w-28" onClick={onBack}>
                Atrás
              </Button>
              <Button className="w-36" disabled={!canContinue} onClick={onNext}>
                Continuar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step4 = ({ data, update }: { data: Partial<Order>, update: (u: Partial<Order>) => void }) => {
  const isPersonal = data.tipoPedido === 'Personal';
  const selectedPunto = isPersonal ? data.puntoRecoleccion : null;

  return (
    <div className="space-y-6 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-black text-stone-900 mb-2">Datos de contacto</h2>
        <p className="text-stone-500 font-medium">Estamos a un paso de confirmar.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
        {isPersonal && (
          <div>
            <label className="block text-xs font-black text-[#40068B] uppercase tracking-wider mb-2">Nombre Completo</label>
            <input 
              type="text"
              placeholder="Ingresa tu nombre y apellido"
              value={data.nombre || ''}
              onChange={(e) => update({ nombre: e.target.value })}
              className="w-full p-4 rounded-2xl bg-stone-50 border border-stone-100 outline-none focus:ring-4 focus:ring-[#28CD7E]/20 transition-all"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-black text-[#40068B] uppercase tracking-wider mb-2">Email</label>
          <input 
            type="email"
            placeholder="correo@ejemplo.com"
            value={data.email || ''}
            onChange={(e) => update({ email: e.target.value })}
            className="w-full p-4 rounded-2xl bg-stone-50 border border-stone-100 outline-none focus:ring-4 focus:ring-[#28CD7E]/20 transition-all"
          />
          {data.email && !isValidEmail(data.email) && (
            <p className="text-xs text-red-500 font-bold mt-1">
              Ingresa un email válido
            </p>
          )}
        </div>
        {isPersonal && (
          <div>
            <label className="block text-xs font-black text-[#40068B] uppercase tracking-wider mb-2">Teléfono (WhatsApp)</label>
            <input 
              type="tel"
              placeholder="4441234567"
              value={data.telefono || ''}
              onChange={(e) => update({ telefono: e.target.value })}
              className="w-full p-4 rounded-2xl bg-stone-50 border border-stone-100 outline-none focus:ring-4 focus:ring-[#28CD7E]/20 transition-all"
            />
            {data.telefono && !isValidPhone(data.telefono) && (
              <p className="text-xs text-red-500 font-bold mt-1">
                El teléfono debe tener 10 dígitos
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-black text-[#40068B] uppercase tracking-wider mb-2">
            {isPersonal ? 'Punto de Recolección' : 'Punto de Venta'}
          </label>
          <div className="relative">
            <select 
              value={isPersonal ? (data.puntoRecoleccion || '') : (data.puntoVenta || '')}
              onChange={(e) => {
                const value = e.target.value;

                if (isPersonal) {
                  update({ puntoRecoleccion: value });
                } else {
                  update({
                    puntoVenta: value,
                    nombre: value, // 👈 auto-set name from punto de venta
                  });
                }
              }}
              className="w-full p-4 rounded-2xl bg-stone-50 border border-stone-100 outline-none focus:ring-4 focus:ring-[#28CD7E]/20 transition-all appearance-none font-bold"
            >
              <option value="">Selecciona una opción</option>
              {(isPersonal ? PUNTOS_RECOLECCION : PUNTOS_VENTA).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">▼</div>
          </div>
        </div>

        {isPersonal && selectedPunto && HORARIOS_RECOLECCION[selectedPunto] && (
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-100 animate-in fade-in slide-in-from-top-2 duration-300">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#40068B] mb-3 border-b border-[#40068B]/10 pb-1">
              {selectedPunto} – Horarios
            </h4>
            <div className="space-y-1.5">
              {HORARIOS_RECOLECCION[selectedPunto].map((line, idx) => (
                <div key={idx} className="flex justify-between text-xs font-medium text-stone-600">
                  <span>{line.split(':')[0]}</span>
                  <span className="font-bold text-stone-800">{line.split(':').slice(1).join(':').trim()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Step5 = ({ orderId, data, flavors, }: { orderId: string; data: Partial<Order>; flavors: typeof FLAVORS}) => {
  const isPersonal = data.tipoPedido === 'Personal';
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copiado!`);
  };

  const whatsappMessage = encodeURIComponent(
    `¡Hola! Soy ${data.nombre}, acabo de realizar mi pedido #${orderId}. Adjunto mi comprobante de pago.`
  );

  return (
    <div className="space-y-6 px-4 pb-12 animate-in fade-in zoom-in duration-700">
      <div className="text-center">
        <div className="w-20 h-20 bg-[#28CD7E]/10 text-[#28CD7E] rounded-full flex items-center justify-center text-4xl mx-auto mb-4 border-2 border-[#28CD7E]/20 shadow-inner">
          ✓
        </div>
        <h2 className="text-3xl font-black mb-2 text-[#40068B]">¡Pedido Recibido!</h2>
        <p className="text-stone-400 font-bold italic text-sm">N° Seguimiento: #{orderId}</p>
      </div>

      {isPersonal && (
        <div className="bg-[#40068B]/5 p-6 rounded-3xl border border-[#40068B]/10 space-y-4 shadow-sm">
          <h3 className="text-lg font-black text-[#40068B] border-b border-[#40068B]/10 pb-2">Instrucciones de Pago</h3>
          <div className="space-y-3 text-sm text-[#40068B] font-bold">
            <div className="flex justify-between"><span>Banco:</span> <span className="text-stone-800">BANREGIO</span></div>
            <div className="flex justify-between"><span>Tarjeta:</span> <span className="text-stone-800">4741 7429 3582 7066</span></div>
            <div className="flex justify-between"><span>CLABE:</span> <span className="text-stone-800">058597000059029937</span></div>
            <div className="flex justify-between"><span>Titular:</span> <span className="text-stone-800">HAYDEÉ CHOWELL GONZÁLEZ</span></div>
          </div>
          
          <div className="grid gap-2 pt-2">
            <Button variant="outline" size="sm" className="bg-white border-[#40068B]/20 text-[#40068B]" onClick={() => copyToClipboard('058597000059029937', 'CLABE')}>
              Copiar CLABE
            </Button>
            <Button variant="outline" size="sm" className="bg-white border-[#40068B]/20 text-[#40068B]" onClick={() => copyToClipboard('4741 7429 3582 7066', 'No. Tarjeta')}>
              Copiar No. Tarjeta
            </Button>
            <a 
              href={`https://wa.me/4441212253?text=${whatsappMessage}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full py-4 bg-[#28CD7E] text-white rounded-2xl text-center font-black text-sm shadow-lg shadow-[#28CD7E]/20 flex items-center justify-center gap-2"
            >
              <span>Enviar comprobante</span>
              <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" className="w-4 h-4 invert" alt="wa" />
            </a>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
        <h3 className="font-black text-[#40068B] mb-4 uppercase tracking-wider text-xs">Resumen del Pedido</h3>
        <div className="space-y-3">
          {flavors.map(f => {
            const qty = data.quantities?.[f.key] || 0;
            if (qty === 0) return null;
            return (
              <div key={f.key} className="flex justify-between items-center text-sm font-bold">
                <span className="text-stone-500">{f.label}</span>
                <span className="text-stone-800">{qty} pzas</span>
              </div>
            );
          })}
          <div className="border-t border-dashed pt-4 flex justify-between items-center font-black text-xl">
            <span className="text-[#40068B]">Total</span>
            <span className="text-[#28CD7E]">${data.precioTotal}</span>
          </div>
        </div>
      </div>

      <Button fullWidth variant="secondary" onClick={() => window.location.reload()}>
        Hacer otro pedido
      </Button>
    </div>
  );
};

// --- Wizard Logic ---
const OrderWizard = ({ publicConfig, seasonalSrc, isAdminWizard = false, }: { publicConfig: PublicConfig; seasonalSrc: string; isAdminWizard?: boolean; }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [data, setData] = useState<Partial<Order>>(() => {
    const saved = localStorage.getItem('plantivoro_draft');
    return saved ? JSON.parse(saved) : {
      tipoPedido: 'Personal',
      quantities: { azucar: 0, cafe: 0, seasonal: 0, cheesecake: 0, chocolate: 0, oreo: 0, zanahoria: 0 }
    };
  });
  const seasonalLabel = publicConfig.seasonalLabel;
  const blocked = publicConfig.blocked;

  useEffect(() => {
    localStorage.setItem('plantivoro_draft', JSON.stringify(data));
  }, [data]);

  const flavors = FLAVORS.map(f => ({
    ...f,
    label: f.key === "seasonal" ? seasonalLabel : f.label,
    image: f.key === "seasonal" ? seasonalSrc : f.image,
  }));


  const update = (updates: Partial<Order>) => setData(prev => ({ ...prev, ...updates }));

  const validateStep = () => {
    switch (step) {
      case 1: return !!data.tipoPedido;
      case 2: 
        return (
          !!data.fechaEntrega &&
          validateOrderDate(data.fechaEntrega, isAdminWizard, publicConfig.blocked).valid
        );
      case 3: 
        const quantities = (data.quantities ?? {}) as Partial<Record<keyof OrderQuantities, number>>;
        const total = Object.values(quantities).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
        return total >= 6;
      case 4: {
        const isPersonal = data.tipoPedido === "Personal";

        if (!data.email || !isValidEmail(data.email)) return false;

        if (isPersonal) {
          if ( !data.nombre || !data.telefono || !isValidPhone(data.telefono) || !data.puntoRecoleccion ) {
            return false;
          }
        } else {
          if (!data.puntoVenta) return false;
        }
        return true;
      }
      default: return true;
    }
  };

  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
      window.scrollTo(0, 0);
    } else {
      setLoading(true);
      const { price, total } = calculateOrderPrice(data.tipoPedido!, data.puntoVenta, data.quantities as OrderQuantities);
      const finalOrder: Order = {
        ...data as any,
        totalDonas: total,
        precioTotal: price,
        statusPagado: 'No pagado',
        statusOrder: 'Recibido',
        updatedAt: new Date().toISOString()
      };
      
      try {
        const result = await createOrder(finalOrder, isAdminWizard ? { allowPastDates: true } : undefined);
        setData(prev => ({
          ...prev,
          totalDonas: result.total,
          precioTotal: result.price,
        }));

        setOrderId(result.id);
        localStorage.removeItem('plantivoro_draft');
        setStep(5);
        window.scrollTo(0, 0);
      } catch (e) {
        alert('Error al crear pedido. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-stone-50 pb-20">
      <ProgressBar step={step} />
      <Header />
      
      <main className="pb-12">
        {step === 1 && <Step1 data={data} update={update} />}
        {step === 2 && <Step2 data={data} update={update} blocked={publicConfig.blocked} isAdmin={isAdminWizard} />}
        {step === 3 && (
          <Step3
            data={data}
            update={update}
            onBack={() => {
              setStep(2);
              window.scrollTo(0, 0);
            }}
            onNext={handleNext}
            canContinue={validateStep()}
            flavors={flavors}
          />
        )}
        {step === 4 && <Step4 data={data} update={update} />}
        {step === 5 && <Step5 orderId={orderId} data={data} flavors={flavors}/>}
      </main>

    {step < 5 && step !== 3 && (
      <div className="fixed bottom-0 left-0 w-full p-4 bg-white/80 backdrop-blur-lg border-t border-stone-100 z-50">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              Atrás
            </Button>
          )}
          <Button
            className="flex-[2]"
            disabled={!validateStep() || loading}
            onClick={handleNext}
          >
            {loading ? 'Procesando...' : step === 4 ? 'Confirmar Pedido' : 'Continuar'}
          </Button>
        </div>
      </div>
    )}

    </div>
  );
};

// --- Admin Dashboard & CSV Import ---

const AdminConsole = ({ publicConfig, refreshConfig, }: { publicConfig: PublicConfig; refreshConfig: () => Promise<PublicConfig>;}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'Hoy' | 'Mañana' | 'Todos'>('Hoy');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftSeasonalLabel, setDraftSeasonalLabel] = useState("");
  const [draftBlockedEnabled, setDraftBlockedEnabled] = useState(false);
  const [draftBlockedMessage, setDraftBlockedMessage] = useState("");
  const [draftBlockedRanges, setDraftBlockedRanges] = useState<Array<{start:string; end:string}>>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const now = new Date();

  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonthNum, setSelectedMonthNum] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedPuntoVenta, setSelectedPuntoVenta] = useState<string>("ALL");
  const seasonalLabel = publicConfig.seasonalLabel;
  const blocked = publicConfig.blocked;
  const [toast, setToast] = useState<{ open: boolean; message: string; variant?: "success" | "error" }>({
    open: false,
    message: "",
    variant: "success",
  });

  const monthOptions = React.useMemo(() => {
    const startYear = 2024;
    const startMonth = 7; // July
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1; // 1-12

    const opts: { value: string; label: string }[] = [];
    let y = startYear;
    let m = startMonth;

    while (y < endYear || (y === endYear && m <= endMonth)) {
      const value = `${y}-${String(m).padStart(2, "0")}`;
      const label = new Date(y, m - 1, 1).toLocaleString("es-MX", { month: "long", year: "numeric" });
      opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });

      m++;
      if (m === 13) { m = 1; y++; }
    }

    return opts;
  }, []);

  const selectedMonth = `${selectedYear}-${String(selectedMonthNum).padStart(2, "0")}`;

  const monthLabels = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  const years = React.useMemo(() => {
    const startYear = 2024;
    const now = new Date();
    const endYear = now.getFullYear();
    const arr: number[] = [];
    for (let y = startYear; y <= endYear; y++) arr.push(y);
    return arr;
  }, []);

  const allowedMonthsForYear = React.useMemo(() => {
    const now = new Date();
    const startYear = 2024;
    const startMonth = 7; // July
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;

    const y = selectedYear;

    let minM = 1;
    let maxM = 12;

    if (y === startYear) minM = startMonth;
    if (y === endYear) maxM = endMonth;

    const months: number[] = [];
    for (let m = minM; m <= maxM; m++) months.push(m);
    return months;
  }, [selectedYear]);

  const summary = React.useMemo(() => {
    const pedidos = orders.length;
    const donas = orders.reduce((sum, o) => sum + (o.totalDonas || 0), 0);
    const totalMXN = orders.reduce((sum, o) => sum + (o.precioTotal || 0), 0);

    return { pedidos, donas, totalMXN };
  }, [orders]);

  const chipKey = `${summary.pedidos}-${summary.donas}-${summary.totalMXN}`;
  const [, setSeasonalLabelInput] = useState("Seasonal");
  const adminFlavors = React.useMemo(() => {
    return FLAVORS.map(f => ({
      ...f,
      label: f.key === "seasonal" ? seasonalLabel : f.label,
    }));
  }, [seasonalLabel]);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ open: true, message, variant });
  };

  useEffect(() => {
    setSeasonalLabelInput(seasonalLabel);
  }, [seasonalLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsConfigOpen(false);
    };
    if (isConfigOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isConfigOpen]);

  useEffect(() => {
    if (!allowedMonthsForYear.includes(selectedMonthNum)) {
      setSelectedMonthNum(allowedMonthsForYear[allowedMonthsForYear.length - 1]); // last allowed month
    }
  }, [selectedYear, allowedMonthsForYear, selectedMonthNum]);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        if (tab === "Todos") {
          const all = await getOrders("Todos", {
            month: selectedMonth,              // "YYYY-MM"
            puntoVenta: selectedPuntoVenta,    // "ALL" or exact
          });
          setOrders(all);
        } else {
          const all = await getOrders(tab);
          setOrders(all);
        }
      } catch (err: any){
        console.error("getOrders failed:", err);
        alert(err?.message || "Error cargando pedidos");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [tab, selectedMonth, selectedPuntoVenta]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;

        const importedOrders: Order[] = [];

        // ✅ If Excel
        if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];

          // Convert to rows (objects keyed by headers)
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

          // Helper: find a column by partial match (Google Forms headers are long)
          const pick = (row: Record<string, any>, contains: string) => {
            const key = Object.keys(row).find((k) => k.toLowerCase().includes(contains.toLowerCase()));
            return key ? row[key] : "";
          };

          // Helper: parse quantities safely
          const num = (v: any) => {
            const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
            return Number.isFinite(n) ? n : 0;
          };

          // Helper: normalize date to YYYY-MM-DD (Excel can store dates as numbers)
          const toISODate = (v: any): string => {
            // Already ISO-ish
            if (typeof v === "string") {
              const s = v.trim();
              // if it's like 2024-08-01
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
              // if it's like 8/1/2024 or 01/08/2024 (ambiguous), try Date parse
              const d = new Date(s);
              if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
            }

            // Excel serial date number
            if (typeof v === "number") {
              const d = XLSX.SSF.parse_date_code(v);
              if (d && d.y && d.m && d.d) {
                return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
              }
            }

            // fallback
            const d2 = new Date(v);
            if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
            return "";
          };

          for (const row of rows) {
            // --- Identify fields (adapt these contains() strings to your actual sheet headings) ---
            const rawTipo = String(pick(row, "tipo de pedido") || "").toLowerCase();
            const tipoPedido: TipoPedido =
              rawTipo.includes("punto") ? "Punto de venta"
              : rawTipo.includes("personal") ? "Personal"
              : (pick(row, "punto de venta") ? "Punto de venta" : "Personal");

            const puntoVenta = pick(row, "punto de venta");
            const puntoRecoleccion = pick(row, "punto de recolección");
            const nombre = pick(row, "nombre completo") || (puntoVenta || "Importado");

            const email = pick(row, "email") || pick(row, "email address") || "no-email@test.com";
            let telefono = pick(row, "teléfono") || pick(row, "telefono");

            telefono = String(telefono || "").replace(/\D+/g, "");
            if (tipoPedido === "Personal" && !telefono) {
              telefono = "0000000000"; // or "4440000000"
            }
            const fechaEntrega = toISODate(pick(row, "fecha de entrega"));
            if (!fechaEntrega) continue; // skip invalid rows
            const d = new Date(fechaEntrega + "T00:00:00");
            if (d.getDay() === 0) continue;


            // --- Quantities (handle seasonal) ---
            const azucar = num(pick(row, "azúcar canela"));
            const cafe = num(pick(row, "café cold brew"));
            const cheesecake = num(pick(row, "cheesecake"));
            const chocolate = num(pick(row, "chocolate"));
            const oreo = num(pick(row, "oreo"));
            const zanahoria = num(pick(row, "zanahoria"));
            const seasonal = num(pick(row, "seasonal"));

            const quantities: OrderQuantities = {
              azucar,
              cafe,
              seasonal, // ✅ seasonal slot
              cheesecake,
              chocolate,
              oreo,
              zanahoria,
            };

            const { total, price } = calculateOrderPrice(
              tipoPedido,
              puntoVenta || undefined,
              quantities
            );

            const newOrder: Order = {
              tipoPedido,
              nombre,
              email,
              telefono: telefono || undefined,
              puntoRecoleccion: puntoRecoleccion || undefined,
              puntoVenta: puntoVenta || undefined,
              fechaEntrega,
              quantities,
              totalDonas: total,
              precioTotal: price,
              statusPagado: "No pagado",
              statusOrder: "Recibido",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),

              // ✅ add this to your Order type if you want to persist it:
              // seasonalFlavorName,
            } as any;
            const result = await createOrder(newOrder as any, { allowPastDates: true, allowSunday: true } as any);

            const savedOrder: Order = {
              ...newOrder,
              id: result.id,
              totalDonas: result.total,
              precioTotal: result.price,
            };

            importedOrders.push(savedOrder);
          }
        } else {
          // If CSV/TSV fallback — your existing logic could live here.
          alert("Para este importador, usa .xlsx/.xls (Excel).");
          return;
        }

        alert(`¡Éxito! Se importaron ${importedOrders.length} pedidos.`);
        const all = await getOrders(tab);
        setOrders(all);

        // Reset input so the same file can be re-imported if needed
        if (e.target) e.target.value = "";
      } catch (err: any) {
        console.error(err);
        alert(`Error al importar: ${err?.message || "desconocido"}`);
      }
    };

    // ✅ read as ArrayBuffer for Excel
    reader.readAsArrayBuffer(file);
  };

  const getFilteredOrders = () => {
    const now = new Date();
    // 12 PM cutoff
    const cutoffHour = 12;
    const operationalToday = new Date(now);

    if (now.getHours() >= cutoffHour) {
      operationalToday.setDate(operationalToday.getDate() + 1);
    }
    const todayStr = operationalToday.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    const operationalTomorrow = new Date(operationalToday);
    operationalTomorrow.setDate(operationalTomorrow.getDate() + 1);
    const tomorrowStr = operationalTomorrow.toLocaleDateString('en-CA');

    console.log("operational hoy:", todayStr);
    console.log("operational mañana:", tomorrowStr);

    if (tab === 'Hoy') return orders.filter(o => o.fechaEntrega === todayStr);
    if (tab === 'Mañana') return orders.filter(o => o.fechaEntrega === tomorrowStr);

    return orders;
  };


  // Fix: Explicitly type totalsByFlavor as Record<string, number> to avoid 'unknown' type issues when rendering values
  const totalsByFlavor = getFilteredOrders().reduce((acc: Record<string, number>, o) => {
    Object.entries(o.quantities).forEach(([k, v]) => {
      acc[k] = (acc[k] || 0) + (v as number);
    });
    return acc;
  }, {} as Record<string, number>);

  const togglePaid = async (id: string, current: string) => {
    const result: any = await updateOrderStatus(id, {});
    const next = result.statusPagado;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, statusPagado: next } : o));
  };

  const handleDeleteOrder = async (id: string) => {
    const ok = window.confirm("¿Eliminar este pedido? Esta acción no se puede deshacer.");
    if (!ok) return;

    try {
      await deleteOrder(id);

      // instantly remove from UI (affects current view + totals)
      setOrders((prev) => prev.filter((o) => o.id !== id));

      // optional: if you want to be extra safe and ensure it disappears everywhere,
      // you can refetch for current tab after delete.
      // (Not required because state is shared across tabs.)
      // const all = await getOrders
      //   ? { month: selectedMonth, puntoVenta: selectedPuntoVenta }
      //   : undefined
      // );
      // setOrders(all);
    } catch (e: any) {
      console.error(e);
      alert(`No se pudo eliminar: ${e?.message || "error"}`);
    }
  };

  const exportCSV = () => {
    const rows = orders.map(o => `${o.id},${o.nombre},${o.totalDonas},${o.precioTotal},${o.statusPagado}`);
    const csvContent = "data:text/csv;charset=utf-8,ID,Nombre,Donas,Precio,Status\n" + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
  };

  const copyMonthlySummary = async () => {
    const IVA_RATE = 0.16; // ✅ MX default

    // orders already filtered from server by month + puntoVenta
    const filtered = orders;

    const monthLabel =
      monthOptions.find((x) => x.value === selectedMonth)?.label ?? selectedMonth;

    const pvLabel =
      selectedPuntoVenta === "ALL" ? "Todos los puntos de venta" : selectedPuntoVenta;

    // Sort by date asc (then name)
    const sorted = [...filtered].sort((a, b) => {
      const da = (a.fechaEntrega || "").localeCompare(b.fechaEntrega || "");
      if (da !== 0) return da;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });

    const fmtMoney = (n: number) =>
      n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

    const ordersTotal = sorted.reduce((sum, o) => sum + (Number(o.precioTotal) || 0), 0);
    const iva = Math.round(ordersTotal * IVA_RATE);
    const totalConIva = ordersTotal + iva;

    // Helper to show flavors as "2 RED VELVET | 4 OREO"
    const flavorsForOrder = (o: Order) => {
      const entries = Object.entries(o.quantities || {})
        .map(([k, v]) => [k, Number(v) || 0] as const)
        .filter(([, qty]) => qty > 0)
        .sort((a, b) => b[1] - a[1]);

      return entries
        .map(([k, qty]) => {
          const label = adminFlavors.find((f) => f.key === k)?.label ?? k;
          return `${qty} ${label}`;
        })
        .join(" | ");
    };

    // --- 1) Pretty text (human-friendly) ---
    const pretty = [
      `Resumen mensual — ${monthLabel}`,
      `Punto de venta: ${pvLabel}`,
      ``,
      `Pedidos: ${sorted.length}`,
      `Total (sin IVA): $${fmtMoney(ordersTotal)} MXN`,
      `Total (con IVA): $${fmtMoney(totalConIva)} MXN`,
      ``,
      `Detalle por pedido:`,
      ...sorted.map((o) => {
        const date = o.fechaEntrega || "";
        const name = o.nombre || "";
        const totalDonas = o.totalDonas ?? 0;
        const total = `$${fmtMoney(Number(o.precioTotal) || 0)}`;
        return `• ${date} — ${flavorsForOrder(o)} — ${totalDonas} donas — ${total}`;
      }),
    ].join("\n");

    // Copy both: first pretty, then a blank line, then TSV
    const text = `${pretty}`;

    await navigator.clipboard.writeText(text);
    alert("Resumen copiado ✅");
  };

  const isKitchenMode = tab === "Hoy" || tab === "Mañana";

  const formatDateES = (iso?: string) => {
    if (!iso) return "";
    // iso is YYYY-MM-DD
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString("es-MX", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatMoney = (n?: number) =>
    (n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 });

  const getFlavorLabel = (key: string) => {
    const f = adminFlavors.find((x) => x.key === key);
    return f?.label ?? key;
  };

  const getFlavorColor = (key: string) => {
    const f = FLAVORS.find((x) => x.key === key);
    return f?.color ?? "bg-stone-50";
  };


  if (loading) return <div className="p-12 text-center font-black text-[#40068B]">Cargando El Plantívoro...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-[#40068B]">Dashboard</h1>
          <p className="text-[#28CD7E] font-bold uppercase tracking-widest text-xs mt-1">El Plantívoro Admin</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="file"
            hidden
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
          />

          <div className="flex gap-2">
            {/* Gear button */}
            <Button
              variant="outline"
              onClick={() => {    
                setDraftSeasonalLabel(publicConfig.seasonalLabel || "Seasonal");
                setDraftBlockedEnabled(Boolean(publicConfig.blocked?.enabled));
                setDraftBlockedMessage(publicConfig.blocked?.message || "Estas fechas están bloqueadas. Elige otra fecha 🙏");
                setDraftBlockedRanges(publicConfig.blocked?.ranges || []);
                setIsConfigOpen(true);
              }}
              className="h-10 w-10 inline-flex items-center justify-center rounded-2xl border border-stone-100 bg-white hover:bg-stone-50 active:scale-[0.98] transition"
              title="Configuración"
              aria-label="Configuración"
            >
              <span className="text-lg">⚙️</span>
            </Button>
            <Link to="/admin/stats" className="inline-flex">
              <Button variant="outline" size="sm">
                Estadísticas
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Importar
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={exportCSV}>
            Exportar
          </Button>

          <Link to="/admin/order" className="inline-flex">
            <Button variant="secondary" size="sm">
              Nuevo Pedido
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        {/* Tabs (left) */}
        <div className="flex gap-2 bg-stone-100 p-1 rounded-2xl w-fit">
          {(["Hoy", "Mañana", "Todos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-8 py-3 rounded-xl font-black text-sm transition-all ${
                tab === t
                  ? "bg-white text-[#40068B] shadow-sm"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Controls (right) - ONLY Todos */}
        {tab === "Todos" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Date */}
            <div className="bg-white rounded-2xl border border-stone-100 px-3 py-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                Fecha
              </label>

              <div className="flex items-center gap-2">
                {/* Month */}
                <select
                  value={selectedMonthNum}
                  onChange={(e) => setSelectedMonthNum(Number(e.target.value))}
                  className="flex-1 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                >
                  {allowedMonthsForYear.map((m) => (
                    <option key={m} value={m}>
                      {monthLabels[m - 1]}
                    </option>
                  ))}
                </select>

                {/* Divider */}
                <span className="text-stone-300 font-black">/</span>

                {/* Year */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-24 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Punto de venta */}
            <div className="bg-white rounded-2xl border border-stone-100 px-3 py-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                Punto de venta
              </label>
              <select
                value={selectedPuntoVenta}
                onChange={(e) => setSelectedPuntoVenta(e.target.value)}
                className="w-56 h-11 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none focus:ring-4 focus:ring-[#28CD7E]/20"
              >
                <option value="ALL">Todos los puntos</option>
                {PUNTOS_VENTA.map((pv) => (
                  <option key={pv} value={pv}>
                    {pv}
                  </option>
                ))}
              </select>
            </div>

            {/* Copy button (same line) */}
            <div className="sm:self-end">
              {/* Summary chip */}
              <Button
                variant="outline"
                size="sm"
                className="h-11 px-6 rounded-2xl"
                onClick={copyMonthlySummary}
                disabled={orders.length === 0}
                title={orders.length === 0 ? "No hay pedidos para copiar" : "Copiar resumen del filtro"}
              >
                Copiar resumen
              </Button>
            </div>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-8 rounded-[2rem] border border-stone-100 shadow-xl shadow-stone-200/50">
            <h2 className="text-xl font-black text-[#40068B] mb-6 flex items-center gap-2">
              <span>🍩</span> Producción
            </h2>
            <div className="space-y-4">
              {adminFlavors.map(f => (
                <div key={f.key} className="flex justify-between items-center text-sm font-bold p-2 hover:bg-stone-50 rounded-xl transition-colors">
                  <span className="text-stone-500">{f.label}</span>
                  <span className="bg-[#40068B] text-white px-4 py-1.5 rounded-full text-xs">
                    {totalsByFlavor[f.key] || 0}
                  </span>
                </div>
              ))}
              <div className="border-t border-dashed mt-6 pt-6 flex justify-between items-center font-black text-2xl text-[#28CD7E]">
                <span>Total Donas</span>
                {/* Fix: Explicitly type the result of the reduction as a number to prevent 'unknown' ReactNode errors */}
                <span>{Object.values(totalsByFlavor).reduce((a: number, b: number) => a + b, 0)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-2 space-y-6">
          <div
                key={chipKey}
                className={`h-11 px-4 rounded-2xl flex items-center whitespace-nowrap text-sm font-black
                  animate-in fade-in slide-in-from-bottom-1 duration-200
                  ${
                    orders.length > 0
                      ? "bg-[#40068B]/5 border border-[#40068B]/10 text-[#40068B]"
                      : "bg-stone-50 border border-stone-100 text-stone-400"
                  }`}
              >
                <span className="mr-2">{orders.length > 0 ? "📊" : "🍃"}</span>

                {orders.length > 0 ? (
                  <>
                    <span>{summary.pedidos} pedidos</span>
                    <span className="mx-2 text-stone-300">•</span>
                    <span>{summary.donas} donas</span>
                    <span className="mx-2 text-stone-300">•</span>
                    <span>${summary.totalMXN.toLocaleString("es-MX")} MXN</span>
                  </>
                ) : (
                  <span>Sin pedidos para este filtro</span>
                )}
          </div>
          <h2 className="text-xl font-black text-[#40068B] px-2 flex items-center gap-2">
            <span>📝</span> Listado de Pedidos
          </h2>
          <div className="grid gap-4">
            {getFilteredOrders().length === 0 ? (
              <div className="p-20 text-center text-stone-300 font-black bg-white rounded-[2rem] border-4 border-dashed border-stone-50">
                <div className="text-4xl mb-2">🍃</div>
                No hay pedidos registrados.
              </div>
            ) : (
              getFilteredOrders().map((o) => {
                const entries = Object.entries(o.quantities || {})
                  .map(([k, v]) => [k, Number(v) || 0] as const)
                  .filter(([, qty]) => qty > 0)
                  .sort((a, b) => b[1] - a[1]);

                return (
                  <div
                    key={o.id}
                    onClick={() => { if (tab === "Todos") setEditingOrder(o)}}
                    className={`bg-white rounded-[2rem] border shadow-sm hover:shadow-xl transition-all w-full max-w-full overflow-hidden
                      ${tab === "Todos" ? "cursor-pointer" : ""}
                      ${isKitchenMode ? "p-7 border-stone-200" : "p-6 border-stone-100"}
                    `}
                  >
                    {/* HEADER */}
                    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${isKitchenMode ? "mb-6" : "mb-5"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="font-black text-2xl text-stone-900 leading-tight sm:text-3xl">
                            {o.nombre}
                          </div>
                          <div className="hidden sm:flex flex-wrap items-center gap-3">
                            <span className="text-[11px] text-[#28CD7E] font-black uppercase tracking-widest bg-[#28CD7E]/10 border border-[#28CD7E]/20 px-3 py-1.5 rounded-full">
                              {o.tipoPedido}
                            </span>

                            {isKitchenMode && o.puntoVenta && (
                              <span className="text-[11px] text-stone-600 font-black uppercase tracking-widest bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-full">
                                {o.puntoVenta}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {/* Kitchen mode: prioritize date BIG, price smaller */}
                        {isKitchenMode ? (
                          <div className="flex flex-col gap-1 sm:text-right">
                            <div className="font-black text-sm text-stone-500 sm:text-base sm:text-stone-800">
                              {formatDateES(o.fechaEntrega)}
                            </div>

                            <div className="font-black text-3xl text-[#40068B]">
                              ${formatMoney(o.precioTotal)}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-black text-3xl text-[#40068B] leading-none">
                              ${formatMoney(o.precioTotal)}
                            </div>
                            <div className="mt-2 text-sm font-black text-stone-500 tracking-wide">
                              {o.fechaEntrega}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* FLAVORS */}
                    <div className={`flex flex-wrap ${isKitchenMode ? "gap-4 mb-7" : "gap-3 mb-6"}`}>
                      {entries.map(([k, qty]) => {
                        const label = getFlavorLabel(k);
                        const color = getFlavorColor(k);

                        return (
                          <span
                            key={k}
                            className={`border text-stone-900 font-black uppercase rounded-2xl ${
                              isKitchenMode
                                ? "text-lg px-5 py-3 border-stone-200"
                                : "text-sm px-4 py-2 border-stone-200"
                            } ${color}`}
                          >
                            {/* In kitchen mode: make quantity pop */}
                            {isKitchenMode ? (
                              <span className="flex flex-wrap items-center gap-3 min-w-0">
                                <span className="text-[#40068B]">{qty}</span>
                                <span className="tracking-tight">{label}</span>
                              </span>
                            ) : (
                              `${qty} ${label}`
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* FOOTER */}
                    <div className="flex items-center justify-between border-t border-stone-100 pt-5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePaid(o.id!, o.statusPagado);
                        }}
                        className={`text-xs font-black uppercase tracking-widest px-6 py-3 rounded-full transition-all ${
                          o.statusPagado === "Pagado"
                            ? "bg-[#28CD7E] text-white"
                            : "bg-red-50 text-red-600 border border-red-100"
                        }`}
                      >
                        {o.statusPagado}
                      </button>
                      {tab === "Todos" && (
                        <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                          Click para editar
                        </div>
                      )}
                      {/* Kitchen mode: show total donuts as a big prep cue */}
                      {isKitchenMode ? (
                        <div className="text-right">
                          <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                            Total
                          </div>
                          <div className="font-black text-2xl text-stone-900">
                            {o.totalDonas ?? 0} donas
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-stone-400">
                          {o.totalDonas ?? 0} donas
                        </span>
                      )}
                      {/* delete button only in Todos tab */}
                      {tab === "Todos" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(o.id!);
                          }}
                          className="h-11 w-11 rounded-2xl bg-stone-50 border border-stone-200 font-black text-red-600 hover:bg-red-50 hover:border-red-200 transition"
                          aria-label="Eliminar pedido"
                          title="Eliminar pedido"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <Toast
              open={toast.open}
              message={toast.message}
              variant={toast.variant}
              onClose={() => setToast((t) => ({ ...t, open: false }))}
            />
          </div>
        </div>
      </div>
      {isConfigOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsConfigOpen(false)}
            aria-label="Cerrar"
          />
          <ConfigPopup
            open={isConfigOpen}
            saving={savingConfig}
            onClose={() => setIsConfigOpen(false)}
            seasonalLabelInput={draftSeasonalLabel}
            setSeasonalLabelInput={setDraftSeasonalLabel}
            blockedEnabled={draftBlockedEnabled}
            setBlockedEnabled={setDraftBlockedEnabled}
            blockedMessage={draftBlockedMessage}
            setBlockedMessage={setDraftBlockedMessage}
            blockedRanges={draftBlockedRanges}
            setBlockedRanges={setDraftBlockedRanges}
            onSave={async () => {
              try {
                setSavingConfig(true);

                await updateAdminConfig({
                  seasonalLabel: draftSeasonalLabel.trim(),
                  blocked: {
                    enabled: draftBlockedEnabled,
                    message: draftBlockedMessage.trim(),
                    ranges: draftBlockedRanges,
                  },
                });
                await refreshConfig();

                setIsConfigOpen(false);
                alert("Configuración actualizada ✅");
              } finally {
                setSavingConfig(false);
              }
            }}
          />
        </div>
      )}
      {editingOrder && (
        <EditOrderModal
          open={!!editingOrder}
          order={editingOrder}
          flavors={adminFlavors.map(f => ({ key: f.key as any, label: f.label }))}
          onClose={() => setEditingOrder(null)}
          onSave={async (quantities) => {
            try {
              const res = await adminUpdateOrderQuantities(editingOrder.id!, quantities);
              // ✅ optimistic update in state (updates in all tabs because data source is same state)
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === editingOrder.id
                    ? {
                        ...o,
                        quantities: res.quantities,
                        totalDonas: res.totalDonas,
                        precioTotal: res.precioTotal,
                        updatedAt: new Date().toISOString(),
                      }
                    : o
                )
              );
              showToast("Pedido actualizado ✅", "success");
            } catch (e: any) {
              showToast(e?.message || "No se pudo actualizar el pedido", "error");
              throw e; // keep modal open if you want, or remove this to always close
            }
          }}
        />
      )}
    </div>
  );
};

// --- App Root ---

export default function App() {
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  const refreshConfig = async () => {
    const cfg = await getPublicConfig();
    setPublicConfig(cfg); // ✅ store full config
    return cfg;
  };

  useEffect(() => {
    refreshConfig();
  }, []);

  if (!publicConfig) return null;

  const seasonalSrc = seasonalImageSrc(publicConfig.seasonalLabel);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={<OrderWizard seasonalSrc={seasonalSrc} publicConfig={publicConfig} isAdminWizard={false} />}
        />
        <Route
          path="/order"
          element={<OrderWizard seasonalSrc={seasonalSrc} publicConfig={publicConfig} isAdminWizard={false} />}
        />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/denied" element={<AdminDenied />} />

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminConsole
                publicConfig={publicConfig}     // ✅ pass full config
                refreshConfig={refreshConfig}   // ✅ refresh from server
              />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/stats"
          element={
            <RequireAdmin>
              <AdminStats publicConfig={publicConfig} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/order"
          element={
            <RequireAdmin>
              <OrderWizard
                seasonalSrc={seasonalSrc}
                publicConfig={publicConfig}
                isAdminWizard={true}
              />
            </RequireAdmin>
          }
        />

      </Routes>
    </Router>
  );
}


