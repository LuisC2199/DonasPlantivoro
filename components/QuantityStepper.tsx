
import React from 'react';

interface QuantityStepperProps {
  label: string;
  value: number;
  image?: string;
  onChange: (newValue: number) => void;
  colorClass?: string;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({ label, value, image, onChange, colorClass = 'bg-white' }) => {
  const handleDecrement = () => {
    if (value === 2) onChange(0);
    else if (value > 2) onChange(value - 1);
  };

  const handleIncrement = () => {
    if (value === 0) onChange(2);
    else onChange(value + 1);
  };

  return (
    <div className={`flex items-center gap-4 p-3 rounded-3xl ${colorClass} border border-stone-100 shadow-sm transition-all duration-300 ${value > 0 ? 'ring-2 ring-[#28CD7E]/30 scale-[1.02]' : ''}`}>
      {image && (
        <img src={image} alt={label} className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
      )}
      <div className="flex-1">
        <span className="font-bold text-stone-800 block text-sm">{label}</span>
        <div className="flex items-center gap-3 mt-1">
          <button 
            onClick={handleDecrement}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-stone-200 text-stone-600 text-lg font-bold active:bg-stone-50 transition-colors"
          >
            –
          </button>
          <span className={`w-6 text-center font-black text-lg ${value > 0 ? 'text-[#28CD7E]' : 'text-stone-300'}`}>
            {value}
          </span>
          <button 
            onClick={handleIncrement}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#28CD7E] text-white text-lg font-bold active:bg-[#22b16d] transition-colors"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
