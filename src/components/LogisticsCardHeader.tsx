import React, { useState } from 'react';
import {
  Copy,
  Check,
  Edit3,
  Trash2,
  ShieldCheck,
  Clock,
  AlertCircle,
} from 'lucide-react';

export interface ConfirmationCodeItem {
  code: string;
  label?: string;
}

export interface LogisticsCardHeaderProps {
  icon: React.ReactNode;
  categoryLabel: string;
  categoryBadgeColor?: string;
  status?: string;
  statusVariant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  confirmationCodes?: string | ConfirmationCodeItem[] | (string | undefined)[];
  codeLabel?: string;
  extraBadges?: React.ReactNode;
  extraActions?: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  editTitle?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTitle?: string;
  className?: string;
}

export const getStatusVariant = (
  status?: string
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (
    s.includes('confirmado') ||
    s.includes('emitido') ||
    s.includes('pago') ||
    s.includes('quitado') ||
    s.includes('concluído') ||
    s.includes('ativo')
  ) {
    return 'success';
  }
  if (
    s.includes('previsão') ||
    s.includes('pendente') ||
    s.includes('parcial') ||
    s.includes('falta')
  ) {
    return 'warning';
  }
  if (s.includes('cancelad') || s.includes('expirad') || s.includes('erro')) {
    return 'danger';
  }
  return 'info';
};

export const getStatusBadgeStyles = (variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral') => {
  switch (variant) {
    case 'success':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'warning':
      return 'bg-amber-400/20 text-amber-300 border border-amber-400/30';
    case 'danger':
      return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
    case 'info':
      return 'bg-blue-500/20 text-blue-300 border border-blue-400/30';
    case 'neutral':
    default:
      return 'bg-white/10 text-slate-200 border border-white/15';
  }
};

export const LogisticsCardHeader: React.FC<LogisticsCardHeaderProps> = ({
  icon,
  categoryLabel,
  categoryBadgeColor = 'bg-[#D4AF37] text-[#1A2B4C]',
  status,
  statusVariant,
  title,
  subtitle,
  confirmationCodes,
  codeLabel = 'Código / Voucher',
  extraBadges,
  extraActions,
  onEdit,
  editLabel = 'Editar',
  editTitle = 'Editar registro',
  onDelete,
  deleteLabel = 'Excluir',
  deleteTitle = 'Excluir registro',
  className = '',
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  // Normalize confirmation codes array
  const parsedCodes: ConfirmationCodeItem[] = React.useMemo(() => {
    if (!confirmationCodes) return [];
    if (typeof confirmationCodes === 'string') {
      const parts = confirmationCodes
        .split(/[,/•;\s]+/)
        .map((p) => p.trim())
        .filter((p) => Boolean(p && p !== 'N/A' && p !== 'N/D'));
      return parts.map((code) => ({ code }));
    }
    return (confirmationCodes as any[])
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed && trimmed !== 'N/A' ? { code: trimmed } : null;
        }
        return item.code ? item : null;
      })
      .filter(Boolean) as ConfirmationCodeItem[];
  }, [confirmationCodes]);

  const resolvedVariant = statusVariant || getStatusVariant(status);
  const statusStyles = getStatusBadgeStyles(resolvedVariant);

  return (
    <div
      className={`bg-gradient-to-r from-slate-900 via-[#1A2B4C] to-[#243B68] text-white p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D4AF37]/25 ${className}`}
    >
      {/* Left side: Icon + Category + Title + Subtitle */}
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[#D4AF37] flex items-center justify-center shrink-0 shadow-sm">
          {icon}
        </div>

        <div className="space-y-1 min-w-0 flex-1">
          {/* Category & Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] sm:text-[11px] uppercase tracking-wider shrink-0 shadow-2xs ${categoryBadgeColor}`}
            >
              {categoryLabel}
            </span>

            {status && (
              <span
                className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] sm:text-[11px] flex items-center gap-1 shrink-0 ${statusStyles}`}
              >
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>{status}</span>
              </span>
            )}

            {extraBadges}
          </div>

          {/* Main Title */}
          <div className="text-base sm:text-lg font-bold font-serif text-white tracking-tight leading-snug truncate">
            {title}
          </div>

          {/* Subtitle / Context info */}
          {subtitle && (
            <div className="text-xs text-slate-300 font-medium flex items-center gap-2 flex-wrap">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Confirmation code badge & Action buttons */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 self-end md:self-center flex-wrap">
        {/* PNR / Confirmation Codes Pill */}
        {parsedCodes.length > 0 && (
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs">
            <span className="text-[9px] uppercase text-slate-300 font-bold tracking-wider">
              {codeLabel}:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {parsedCodes.map((item, idx) => (
                <div
                  key={`${item.code}-${idx}`}
                  className="flex items-center gap-1 bg-black/20 hover:bg-black/30 px-2 py-0.5 rounded-md border border-white/10 transition-colors"
                >
                  <span className="font-mono font-bold text-xs text-[#D4AF37]">
                    {item.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.code)}
                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title={`Copiar ${item.code}`}
                    aria-label={`Copiar código ${item.code}`}
                  >
                    {copiedCode === item.code ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extra Action (e.g. Trocar Dia) */}
        {extraActions}

        {/* Edit Button */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-white/15 shadow-2xs"
            title={editTitle}
            aria-label={editTitle}
          >
            <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{editLabel}</span>
          </button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-rose-400/20 shadow-2xs"
            title={deleteTitle}
            aria-label={deleteTitle}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleteLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
