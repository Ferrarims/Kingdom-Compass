import React, { useState, useEffect, useRef } from 'react';
import { CurrencyType, formatInputDisplay, parseInputToNumber, coerceToNumber } from '../utils/currency';

interface MoneyInputProps {
  currency: CurrencyType;
  value: number | string | null | undefined;
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
    if (value === null || value === undefined || value === '') {
      setDisplayValue('');
    } else {
      const num = coerceToNumber(value);
      if (num === null) {
        setDisplayValue('');
      } else {
        setDisplayValue(formatInputDisplay(num, currency));
      }
    }
  }, [value, currency]);

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const raw = target.value;
    const selectionEnd = target.selectionEnd || 0;

    // Count digits before cursor in raw input
    const digitsBeforeCursor = raw.slice(0, selectionEnd).replace(/\D/g, '').length;

    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setDisplayValue('');
      onChange(required ? 0 : null);
      return;
    }

    // Banking right-to-left cent insertion
    const numericVal = parseInt(digits, 10) / 100;
    onChange(numericVal);
    const formatted = formatInputDisplay(numericVal, currency);
    setDisplayValue(formatted);

    // Restore cursor position based on digit index
    requestAnimationFrame(() => {
      if (inputRef.current) {
        let digitCount = 0;
        let newCursorPos = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++;
            if (digitCount === digitsBeforeCursor) {
              newCursorPos = i + 1;
              break;
            }
          }
        }
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text').trim();
    if (!pasteText) return;

    // Clean currency symbols and prefixes
    const cleanPaste = pasteText
      .replace(/^(R\$|US\$|\$|BRL|USD)\s*/i, '')
      .replace(/\s*(BRL|USD)$/i, '')
      .trim();
    
    // Strict validation using parseInputToNumber with coerceToNumber fallback
    const parsedNum = parseInputToNumber(cleanPaste, currency) ?? coerceToNumber(cleanPaste);

    if (parsedNum !== null && !isNaN(parsedNum)) {
      onChange(parsedNum);
      setDisplayValue(formatInputDisplay(parsedNum, currency));
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
        onInput={handleInput}
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
