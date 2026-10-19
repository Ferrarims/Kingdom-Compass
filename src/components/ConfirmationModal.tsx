import React from 'react';
import { Trash2, AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  icon?: 'trash' | 'warning' | 'help' | React.ReactNode;
  detailsBox?: React.ReactNode;
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  confirmText = 'Salvar',
  cancelText = 'Cancelar',
  confirmVariant = 'danger',
  icon = 'trash',
  detailsBox,
  isLoading = false,
}) => {
  const displayConfirmText = confirmText === 'Confirmar' 
    ? (confirmVariant === 'danger' || icon === 'trash' ? 'Excluir' : 'Salvar')
    : confirmText;
  useConfirmationKeyboard({
    isOpen,
    onConfirm: () => {
      if (!isLoading) {
        onConfirm();
      }
    },
    onCancel: onClose,
  });

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return {
          btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 focus:ring-rose-400',
          iconBg: 'bg-rose-100 text-rose-600',
          titleColor: 'text-slate-900',
        };
      case 'warning':
        return {
          btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200 focus:ring-amber-400',
          iconBg: 'bg-amber-100 text-amber-600',
          titleColor: 'text-slate-900',
        };
      case 'primary':
      default:
        return {
          btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 focus:ring-indigo-400',
          iconBg: 'bg-indigo-100 text-indigo-600',
          titleColor: 'text-slate-900',
        };
    }
  };

  const styles = getVariantStyles();

  const renderIcon = () => {
    if (React.isValidElement(icon)) return icon;
    if (icon === 'trash') return <Trash2 className="w-5 h-5" />;
    if (icon === 'warning') return <AlertTriangle className="w-5 h-5" />;
    return <HelpCircle className="w-5 h-5" />;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          title="Fechar (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
          >
            {renderIcon()}
          </div>
          <div className="pr-6">
            <h3 className={`font-bold text-base ${styles.titleColor}`}>{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {description && (
          <div className="text-xs text-slate-600 leading-relaxed">{description}</div>
        )}

        {detailsBox && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            {detailsBox}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono text-slate-600 shadow-2xs">
              Enter
            </kbd>
            <span>confirmar</span>
            <span className="text-slate-300">•</span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono text-slate-600 shadow-2xs">
              Esc
            </kbd>
            <span>cancelar</span>
          </div>

          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5 ${styles.btn}`}
            >
              {icon === 'trash' && <Trash2 className="w-3.5 h-3.5" />}
              <span>{isLoading ? 'Processando...' : displayConfirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
