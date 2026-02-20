
import { OrderQuantities } from './types';

export const FLAVORS: { key: keyof OrderQuantities; label: string; color: string; image: string }[] = [
  { 
    key: 'azucar', 
    label: 'Azúcar Canela', 
    color: 'bg-orange-50', 
    image: '/images/flavors/azucar.png' 
  },
  { 
    key: 'cafe', 
    label: 'Café Cold Brew', 
    color: 'bg-amber-50', 
    image: '/images/flavors/cafe.png' 
  },
  { 
    key: 'seasonal', 
    label: 'Sabor de temporada',
    color: 'bg-yellow-50', 
    image: '/images/flavors/redvelvet.png'
  },
  { 
    key: 'cheesecake', 
    label: 'Cheesecake', 
    color: 'bg-red-50', 
    image: '/images/flavors/cheesecake.png' 
  },
  { 
    key: 'chocolate', 
    label: 'Chocolate', 
    color: 'bg-stone-100', 
    image: '/images/flavors/chocolate.png'
  },
  { 
    key: 'oreo', 
    label: 'Oreo', 
    color: 'bg-gray-100', 
    image: '/images/flavors/oreo.png'
  },
  { 
    key: 'zanahoria', 
    label: 'Zanahoria', 
    color: 'bg-orange-50', 
    image: '/images/flavors/zanahoria.png'
  },
];

export const PUNTOS_RECOLECCION = ["Tipi'Oka Lomas", "Vegandra"];

export const HORARIOS_RECOLECCION: Record<string, string[]> = {
  "Vegandra": [
    "Lunes: 11:00 – 15:00",
    "Martes: 10:00 – 18:00",
    "Miércoles: 10:00 – 18:00",
    "Jueves: 10:00 – 18:00",
    "Viernes: 10:00 – 18:00",
    "Sábado: 10:00 – 15:00",
    "Domingo: Cerrado"
  ],
  "Tipi'Oka Lomas": [
    "Lunes: 10:00 – 21:00",
    "Martes: 10:00 – 21:00",
    "Miércoles: 10:00 – 21:00",
    "Jueves: 10:00 – 21:00",
    "Viernes: 10:00 – 21:00",
    "Sábado: 11:00 – 21:00",
    "Domingo: 11:00 – 21:00"
  ]
};

export const PUNTOS_VENTA = [
  "Café Canta'o", "Cafetería Ikbel", "Café Seroga", "Deju Café", 
  "El Plantívoro", "JC La Loma", "Karma Healthy Bar", 
  "Sattva", "Mocao", "Tipi'Oka Lomas", "Vegandra", "Wholejuice"
];

export const PRICING_RULES = {
  karenDonas: 15,
  puntoVentaGeneral: 20,
  personalTiers: {
    6: 160,
    7: 190,
    8: 220,
    9: 250,
    10: 280,
    11: 310,
    default: 25
  }
};
