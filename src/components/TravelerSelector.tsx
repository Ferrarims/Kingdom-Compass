import React from 'react';
import { Users } from 'lucide-react';
import { Traveler } from '../types';

interface TravelerSelectorProps {
  travelers: Traveler[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  showQuantity?: boolean;
  quantity?: number;
  onQuantityChange?: (qty: number) => void;
}

export const TravelerSelector: React.FC<TravelerSelectorProps> = ({
  travelers,
  selectedIds,
  onChange,
  label = 'Viajantes do Pacote',
  showQuantity = false,
  quantity,
  onQuantityChange,
}) => {
  const toggleTraveler = (id: string) => {
    if (id === 'all') {
      onChange(['all']);
      if (onQuantityChange) onQuantityChange(travelers.length);
      return;
    }

    let current = selectedIds.filter((sid) => sid !== 'all');
    if (current.includes(id)) {
      current = current.filter((sid) => sid !== id);
      if (current.length === 0) current = ['all'];
    } else {
      current.push(id);
    }

    onChange(current);
    if (onQuantityChange) {
      if (current.includes('all')) {
        onQuantityChange(travelers.length);
      } else {
        onQuantityChange(current.length);
      }
    }
  };

  const isAllSelected = selectedIds.includes('all');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
          {label}
        </label>
        {showQuantity && onQuantityChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Quantidade:</span>
            <input
              type="number"
              min="1"
              max="50"
              value={quantity || 1}
              onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
            />
          </div>
        )}
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleTraveler('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              isAllSelected
                ? 'bg-[#1A2B4C] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className={`w-3.5 h-3.5 ${isAllSelected ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
            <span>Todos ({travelers.length})</span>
          </button>

          {travelers.map((trv) => {
            const isSelected = isAllSelected || selectedIds.includes(trv.id);
            return (
              <button
                key={trv.id}
                type="button"
                onClick={() => toggleTraveler(trv.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isSelected && !isAllSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: trv.avatarColor || '#3B82F6' }}
                />
                <span>{trv?.name || 'Viajante'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
