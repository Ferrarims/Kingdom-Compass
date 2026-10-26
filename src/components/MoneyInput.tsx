import React, { useState, useEffect, useRef } from 'react';
import { CurrencyType, formatInputDisplay, coerceToNumber } from '../utils/currency';

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
  variant?: 'dark' | 'light';
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
  variant = 'dark',
}) => {
  const [displayValue, setDisplayValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEmittedValueRef = useRef<number | null>(null);

  // Synchronize displayValue with external value prop
  useEffect(() => {
    if (value === null || value === undefined || value === '') {
      if (!isFocused || displayValue !== '') {
        setDisplayValue('');
        lastEmittedValueRef.current = null;
      }
      return;
    }

    const num = coerceToNumber(value);
    if (num === null) {
      if (!isFocused) {
        setDisplayValue('');
        lastEmittedValueRef.current = null;
      }
      return;
    }

    // If user is actively typing and the incoming value matches what was just emitted,
    // do not clobber the user's typing in-progress
    if (
      isFocused &&
      lastEmittedValueRef.current !== null &&
      Math.abs(num - lastEmittedValueRef.current) < 0.0001
    ) {
      return;
    }

    lastEmittedValueRef.current = num;

    if (isFocused) {
      // While focused, format without thousand separators so user can edit cleanly
      const decSep = currency === 'BRL' ? ',' : '.';
      setDisplayValue(num.toFixed(2).replace('.', decSep));
    } else {
      // While blurred, format with full currency formatting (thousand separators + 2 decimals)
      setDisplayValue(formatInputDisplay(num, currency));
    }
  }, [value, currency, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Auto-select text on focus so user can immediately type to overwrite or click to position
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);

    if (displayValue.trim() === '') {
      if (required) {
        lastEmittedValueRef.current = 0;
        onChange(0);
        setDisplayValue(formatInputDisplay(0, currency));
      } else {
        lastEmittedValueRef.current = null;
        onChange(null);
        setDisplayValue('');
      }
      return;
    }

    const num = coerceToNumber(displayValue);
    if (num === null) {
      if (required) {
        lastEmittedValueRef.current = 0;
        onChange(0);
        setDisplayValue(formatInputDisplay(0, currency));
      } else {
        lastEmittedValueRef.current = null;
        onChange(null);
        setDisplayValue('');
      }
    } else {
      lastEmittedValueRef.current = num;
      onChange(num);
      setDisplayValue(formatInputDisplay(num, currency));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    if (!raw.trim()) {
      setDisplayValue('');
      lastEmittedValueRef.current = required ? 0 : null;
      onChange(required ? 0 : null);
      return;
    }

    const decSep = currency === 'BRL' ? ',' : '.';
    const altSep = currency === 'BRL' ? '.' : ',';

    // Filter allowed characters: digits and separators
    let cleaned = raw.replace(/[^\d.,]/g, '');

    // Normalize alternate separator to canonical decimal separator
    cleaned = cleaned.split(altSep).join(decSep);

    // If starts with decimal separator (e.g. ",50"), prepend "0"
    if (cleaned.startsWith(decSep)) {
      cleaned = '0' + cleaned;
    }

    // Only allow a single decimal separator and at most 2 decimal digits
    const parts = cleaned.split(decSep);
    let intPart = parts[0] || '0';
    let decPart = parts.length > 1 ? parts.slice(1).join('') : null;

    // Remove leading zeros from integer part, keeping a single 0 if empty
    if (intPart.length > 1 && intPart.startsWith('0')) {
      intPart = intPart.replace(/^0+/, '') || '0';
    }

    // Limit decimal digits to 2
    if (decPart !== null && decPart.length > 2) {
      decPart = decPart.slice(0, 2);
    }

    const newDisplay = decPart !== null ? `${intPart}${decSep}${decPart}` : intPart;
    setDisplayValue(newDisplay);

    // Calculate numeric value
    const numStr = decPart !== null ? `${intPart}.${decPart}` : intPart;
    const parsedNum = parseFloat(numStr);
    const validNum = isNaN(parsedNum) || !isFinite(parsedNum) ? null : parsedNum;

    lastEmittedValueRef.current = validNum;
    onChange(validNum);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text').trim();
    if (!pasteText) return;

    const parsedNum = coerceToNumber(pasteText);
    if (parsedNum !== null && !isNaN(parsedNum)) {
      lastEmittedValueRef.current = parsedNum;
      onChange(parsedNum);
      const decSep = currency === 'BRL' ? ',' : '.';
      setDisplayValue(parsedNum.toFixed(2).replace('.', decSep));
      if (inputRef.current) {
        requestAnimationFrame(() => {
          inputRef.current?.select();
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  const symbol = currency === 'BRL' ? 'R$' : '$';

  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-slate-400 font-medium text-sm pointer-events-none select-none">
        {symbol}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        id={id}
        name={name}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || (currency === 'BRL' ? '0,00' : '0.00')}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
          variant === 'light'
            ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-[#D4AF37]/50'
            : 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500'
        } ${className}`}
      />
    </div>
  );
};
