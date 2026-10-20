import React, { useState, useEffect } from 'react';
import { CurrencyType, formatInputDisplay } from '../utils/currency';

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
    const digits = raw.replace(/\D/g, '');
    
    if (!digits) {
      setDisplayValue('');
      onChange(required ? 0 : null);
      return;
    }

    const numericVal = parseInt(digits, 10) / 100;
    onChange(numericVal);
    setDisplayValue(formatInputDisplay(numericVal, currency));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text').trim();
    if (!pasteText) return;

    const cleanPaste = pasteText.replace(currency === 'BRL' ? /^[R\$\s]*/i : /^[\$\s]*/, '').trim();
    let isValid = false;
    let parsedNum = 0;

    if (currency === 'BRL') {
      const brlRegex = /^(\d{1,3}(\.\d{3})*|\d+)(,\d{2})?$/;
      if (brlRegex.test(cleanPaste)) {
        isValid = true;
        const numStr = cleanPaste.replace(/\./g, '').replace(',', '.');
        parsedNum = Number(numStr);
      }
    } else {
      const usdRegex = /^(\d{1,3}(,\d{3})*|\d+)(\.\d{2})?$/;
      if (usdRegex.test(cleanPaste)) {
        isValid = true;
        const numStr = cleanPaste.replace(/,/g, '');
        parsedNum = Number(numStr);
      }
    }

    if (isValid && !isNaN(parsedNum)) {
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
