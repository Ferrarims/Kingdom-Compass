import React, { useState, useEffect, useRef } from 'react';
import { CurrencyType, formatInputDisplay, parseInputToNumber } from '../utils/currency';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === null || value === undefined || isNaN(value)) {
      setDisplayValue('');
    } else {
      setDisplayValue(formatInputDisplay(value, currency));
    }
  }, [value, currency]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '');

    if (!digits) {
      setDisplayValue('');
      onChange(required ? 0 : null);
      return;
    }

    // Banking right-to-left cent insertion
    const numericVal = parseInt(digits, 10) / 100;
    onChange(numericVal);
    setDisplayValue(formatInputDisplay(numericVal, currency));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text').trim();
    if (!pasteText) return;

    // Clean currency symbol if present
    const cleanPaste = pasteText.replace(currency === 'BRL' ? /^[R\$\s]*/i : /^[\$\s]*/, '').trim();
    
    // Strict validation using parseInputToNumber
    const parsedNum = parseInputToNumber(cleanPaste, currency);

    if (parsedNum !== null && !isNaN(parsedNum)) {
      onChange(parsedNum);
      setDisplayValue(formatInputDisplay(parsedNum, currency));
    } else {
      alert(`Valor colado inválido para o formato ${currency}. Esperado: ${currency === 'BRL' ? '1.234,56' : '1,234.56'}`);
    }
  };

  const symbol = currency === 'BRL' ? 'R$' : '$';

  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-slate-400 font-medium text-sm pointer-events-none">
        {symbol}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        id={id}
        name={name}
        value={displayValue}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder || (currency === 'BRL' ? '0,00' : '0.00')}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className={`w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${className}`}
      />
    </div>
  );
};
