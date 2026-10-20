import React, { useState, useEffect } from 'react';
import { CurrencyType, formatInputDisplay, digitsToNumber, parseInputToNumber } from '../utils/currency';

interface MoneyInputProps {
  currency: CurrencyType;
  value: number | null | undefined;
  onChange: (val: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  currency,
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  required = false,
  id,
  name,
  autoFocus,
}) => {
  const [displayValue, setDisplayValue] = useState<string>('');

  useEffect(() => {
    if (value === null || value === undefined || isNaN(value)) {
      setDisplayValue('');
    } else {
      setDisplayValue(formatInputDisplay(value, currency));
    }
  }, [value, currency]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    
    // If empty
    if (!raw.trim()) {
      setDisplayValue('');
      onChange(required ? 0 : null);
      return;
    }

    // Check if user pasted a full formatted string or typed standard decimal
    // e.g. "1234.56" or "1.234,56" or "1,234.56"
    if (raw.includes('.') || raw.includes(',')) {
      const parsed = parseInputToNumber(raw, currency);
      onChange(parsed);
      setDisplayValue(formatInputDisplay(parsed, currency));
      return;
    }

    // Banking style right-to-left digit extraction
    const numericVal = digitsToNumber(raw);
    onChange(numericVal);
    setDisplayValue(formatInputDisplay(numericVal, currency));
  };

  const symbol = currency === 'BRL' ? 'R$' : '$';

  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-slate-400 font-medium text-sm pointer-events-none">
        {symbol}
      </span>
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={name}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder || (currency === 'BRL' ? '0,00' : '0.00')}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className={`w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${className}`}
      />
    </div>
  );
};
