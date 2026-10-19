import React, { useState } from 'react';
import {
  Mail,
  Send,
  Copy,
  Check,
  X,
  Key,
  Users,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Calendar,
  MapPin
} from 'lucide-react';
import { Traveler } from '../types';
import { formatDisplayDate } from '../context/PlannerContext';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';

interface SendTripEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripName: string;
  destination: string;
  startDate: string;
  durationDays: number;
  tripCode: string;
  travelers: Traveler[];
}

export const SendTripEmailModal: React.FC<SendTripEmailModalProps> = ({
  isOpen,
  onClose,
  tripName,
  destination,
  startDate,
  durationDays,
  tripCode,
  travelers,
}) => {
  const [copied, setCopied] = useState(false);
  const [customEmails, setCustomEmails] = useState<string>('');

  // Extract registered emails
  const registeredEmails = travelers
    .map((t) => t.email?.trim())
    .filter((email): email is string => Boolean(email && email.length > 0));

  // Additional custom emails if user typed any
  const extraEmailsList = customEmails
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  const allEmails = Array.from(new Set([...registeredEmails, ...extraEmailsList]));
  const recipientsString = allEmails.join(',');

  const formattedStartDate = startDate ? formatDisplayDate(startDate, false) : 'A definir';

  const subject = `✈️ Convite & Código de Acesso da Viagem: ${tripName} (${tripCode})`;

  const messageBody = `Olá, Viajante!

Você foi convidado(a) para participar do planejamento da viagem no KingdomCompass Orlando Planner:

📌 Viagem: ${tripName}
✈️ Destino: ${destination}
📅 Data de Início: ${formattedStartDate}
⏱️ Duração: ${durationDays} dias
🔑 Código de Acesso da Viagem: ${tripCode}

--------------------------------------------------
COMO ACESSAR SEU ROTEIRO E DETALHES:
1. Acesse o aplicativo KingdomCompass Orlando Planner.
2. No topo da tela, clique no botão "Acesso por Código".
3. Insira seu e-mail cadastrado e o Código da Viagem: ${tripCode}

Dúvidas ou alterações? Entre em contato com o organizador da viagem.
Nos vemos em Orlando! 🏰✨`;

  const handleOpenMailClient = () => {
    const mailtoUrl = `mailto:${encodeURIComponent(recipientsString)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(messageBody)}`;
    window.open(mailtoUrl, '_blank');
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(messageBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: onClose,
    onSave: onClose,
  });

  // Dedicated direct listener for Enter and Escape keys on the modal
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden flex flex-col h-[90vh] max-h-[92vh] my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Compartilhamento • Convite de Acesso aos Integrantes
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Enviar Informações por E-mail
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto min-h-0 custom-scrollbar flex-1 text-xs">
          {/* Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5 font-serif">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                Resumo da Viagem
              </span>
              <span className="font-mono font-bold text-xs bg-white text-[#1A2B4C] px-2.5 py-1 rounded-lg border border-amber-300">
                🔑 {tripCode}
              </span>
            </div>

            <div className="space-y-1.5 text-slate-800 font-medium">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1A2B4C] text-sm">{tripName}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-600 text-[11px]">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                  {destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {formattedStartDate} ({durationDays} dias)
                </span>
              </div>
            </div>
          </div>

          {/* Recipients Section */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 block text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#1A2B4C]" />
                Destinatários ({allEmails.length} e-mails cadastrados):
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                Envia para todo o grupo
              </span>
            </label>

            {registeredEmails.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200 max-h-28 overflow-y-auto custom-scrollbar">
                {registeredEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-700 font-medium shadow-2xs"
                  >
                    <Mail className="w-3 h-3 text-amber-600" />
                    {email}
                  </span>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  Nenhum e-mail de integrante foi encontrado nesta viagem. Digite os e-mails no campo abaixo ou adicione os e-mails na lista de integrantes.
                </span>
              </div>
            )}

            {/* Custom/Additional emails input */}
            <div className="pt-1">
              <input
                type="text"
                placeholder="Adicionar outros e-mails (separados por vírgula)..."
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              />
            </div>
          </div>

          {/* Message Preview Box */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 block text-xs">
              Pré-visualização do Conteúdo do E-mail:
            </label>
            <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-800 custom-scrollbar select-all">
              <div className="text-amber-400 font-bold mb-2 pb-1.5 border-b border-slate-800">
                Assunto: {subject}
              </div>
              {messageBody}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2.5 shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <span>Fechar</span>
          </button>

          <button
            type="button"
            onClick={handleOpenMailClient}
            className="py-2.5 px-6 rounded-xl bg-[#1A2B4C] hover:bg-[#2C4475] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4 text-[#D4AF37]" />
            <span>Salvar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
