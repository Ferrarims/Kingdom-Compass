import React from 'react';
import { CreditCard, DollarSign, Users, AlertCircle, Info } from 'lucide-react';
import { MoneyInput } from './MoneyInput';

export type PaymentStatusType = 'Não informado' | 'Pendente' | 'Pago';

export interface TravelerOption {
  id: string;
  name: string;
  color?: string;
}

export interface PaymentSectionProps {
  /** Número e título da seção (padrão: "7. CUSTOS & PAGAMENTO") */
  sectionNumber?: number | string;
  sectionTitle?: string;
  /** Cotação do dólar configurada no roteiro */
  dollarRate: number;
  /** Valor unitário por viajante em USD */
  unitCostUSD: number | null;
  /** Valor unitário por viajante em BRL */
  unitCostBRL: number | null;
  /** Total calculado em USD */
  totalCostUSD: number | null;
  /** Total calculado em BRL */
  totalCostBRL: number | null;
  /** Callback disparado quando qualquer valor monetário for alterado */
  onChangeCosts: (
    unitUSD: number | null,
    unitBRL: number | null,
    totalUSD: number | null,
    totalBRL: number | null
  ) => void;
  /** Status do pagamento */
  paymentStatus: PaymentStatusType;
  onChangePaymentStatus: (status: PaymentStatusType) => void;
  /** Responsável pelo pagamento ('all' ou ID do viajante) */
  payerId: string;
  onChangePayerId: (payerId: string) => void;
  /** Lista de viajantes para seleção de pagador */
  travelers: TravelerOption[];
  /** Quantidade de viajantes incluídos */
  passengerCount?: number;
  /** Rótulo da unidade de viajante ('passageiro', 'viajante', 'hóspede', etc.) */
  passengerLabel?: string;
  /** Rótulo customizado do campo USD unitário */
  unitLabelUSD?: string;
  /** Rótulo customizado do campo BRL unitário */
  unitLabelBRL?: string;
  /** Modo de precificação: 'per_person' (multiplicado por viajante, ex: voos) ou 'total' (valor total fixo da estadia, ex: hospedagem) */
  pricingMode?: 'per_person' | 'total';
  /** Se deve exibir o seletor de responsável pelo pagamento */
  showPayerSelector?: boolean;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  sectionNumber = 7,
  sectionTitle = 'CUSTOS & PAGAMENTO',
  pricingMode = 'per_person',
  dollarRate = 5.75,
  unitCostUSD,
  unitCostBRL,
  totalCostUSD,
  totalCostBRL,
  onChangeCosts,
  paymentStatus,
  onChangePaymentStatus,
  payerId = 'all',
  onChangePayerId,
  travelers = [],
  passengerCount = 1,
  passengerLabel = 'passageiro',
  unitLabelUSD,
  unitLabelBRL,
  showPayerSelector = true,
}) => {
  const rate = dollarRate > 0 ? dollarRate : 5.75;
  const count = passengerCount > 0 ? passengerCount : 1;
  const isTotalMode = pricingMode === 'total';

  const defaultUSDLabel = isTotalMode ? 'Valor Total da Hospedagem (US$)' : 'Valor por Passageiro (US$)';
  const defaultBRLLabel = isTotalMode ? 'Valor Total da Hospedagem (R$)' : 'Valor por Passageiro (R$)';

  const displayUSDLabel = unitLabelUSD || defaultUSDLabel;
  const displayBRLLabel = unitLabelBRL || defaultBRLLabel;

  // Conversão quando o usuário digita em USD: atualiza BRL e recalcula os totais
  const handleUSDChange = (val: number | null) => {
    if (isTotalMode) {
      const calculatedBrl = val !== null ? Math.round(val * rate * 100) / 100 : null;
      const totUsd = val;
      const totBrl = calculatedBrl;
      const unitUsd = val !== null && count > 0 ? Math.round((val / count) * 100) / 100 : val;
      const unitBrl = calculatedBrl !== null && count > 0 ? Math.round((calculatedBrl / count) * 100) / 100 : calculatedBrl;
      onChangeCosts(unitUsd, unitBrl, totUsd, totBrl);
    } else {
      const calculatedBrl = val !== null ? Math.round(val * rate * 100) / 100 : null;
      const totUsd = val !== null ? val * count : null;
      const totBrl = calculatedBrl !== null ? calculatedBrl * count : null;
      onChangeCosts(val, calculatedBrl, totUsd, totBrl);
    }
  };

  // Conversão quando o usuário digita em BRL: atualiza USD e recalcula os totais
  const handleBRLChange = (val: number | null) => {
    if (isTotalMode) {
      const calculatedUsd = val !== null && rate > 0 ? Math.round((val / rate) * 100) / 100 : null;
      const totUsd = calculatedUsd;
      const totBrl = val;
      const unitUsd = calculatedUsd !== null && count > 0 ? Math.round((calculatedUsd / count) * 100) / 100 : calculatedUsd;
      const unitBrl = val !== null && count > 0 ? Math.round((val / count) * 100) / 100 : val;
      onChangeCosts(unitUsd, unitBrl, totUsd, totBrl);
    } else {
      const calculatedUsd = val !== null && rate > 0 ? Math.round((val / rate) * 100) / 100 : null;
      const totUsd = calculatedUsd !== null ? calculatedUsd * count : null;
      const totBrl = val !== null ? val * count : null;
      onChangeCosts(calculatedUsd, val, totUsd, totBrl);
    }
  };

  const pluralLabel = count === 1 ? passengerLabel : `${passengerLabel}s`;

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
        {sectionNumber}. {sectionTitle}
      </span>

      <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-4 sm:p-5 space-y-4">
        {/* Linha 1: Grade de 3 colunas para campos monetários e status do pagamento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Valor USD */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">
                {displayUSDLabel}
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {isTotalMode ? 'USD total' : 'USD/unidade'}
              </span>
            </div>
            <MoneyInput
              currency="USD"
              value={isTotalMode ? (totalCostUSD !== null && totalCostUSD !== undefined ? totalCostUSD : unitCostUSD) : unitCostUSD}
              className="!bg-white !border-slate-200 !rounded-lg !text-slate-800 !h-10 !text-xs !font-medium focus:!ring-[#D4AF37]/50 focus:!border-[#D4AF37]"
              onChange={handleUSDChange}
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Cotação: R$ {rate.toFixed(2)}
            </span>
          </div>

          {/* Valor BRL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">
                {displayBRLLabel}
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {isTotalMode ? 'BRL total' : 'BRL/unidade'}
              </span>
            </div>
            <MoneyInput
              currency="BRL"
              value={isTotalMode ? (totalCostBRL !== null && totalCostBRL !== undefined ? totalCostBRL : unitCostBRL) : unitCostBRL}
              className="!bg-white !border-slate-200 !rounded-lg !text-slate-800 !h-10 !text-xs !font-medium focus:!ring-[#D4AF37]/50 focus:!border-[#D4AF37]"
              onChange={handleBRLChange}
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Conversão automática
            </span>
          </div>

          {/* Status do Pagamento */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Status do Pagamento
            </label>
            <select
              value={paymentStatus || 'Não informado'}
              onChange={(e) => onChangePaymentStatus(e.target.value as PaymentStatusType)}
              className="w-full h-10 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] cursor-pointer transition-all"
            >
              <option value="Não informado">⚪ Não informado</option>
              <option value="Pendente">⏳ Pendente / Não pago</option>
              <option value="Pago">✅ Pago</option>
            </select>
            <span className="text-[10px] text-slate-400 block mt-1">
              Situação financeira do item
            </span>
          </div>
        </div>

        {/* Linha 2: Resumo e Totais */}
        <div className="pt-4 border-t border-slate-200/70 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80">
            <div className="text-xs text-slate-600 font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span>
                  {isTotalMode
                    ? 'Resumo da Hospedagem para '
                    : 'Total calculado para '}
                  <strong className="text-slate-800 font-semibold">{count}</strong> {pluralLabel}:
                </span>
                {isTotalMode ? (
                  <span className="block text-[10px] text-slate-400 font-normal">
                    Valor total fixo da estadia (não multiplicado pelo nº de {pluralLabel})
                    {count > 1 && totalCostBRL ? (
                      <span className="ml-1 text-[#1A2B4C] font-medium">
                        • Rateio informativo: ~ R$ {((totalCostBRL || 0) / count).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por {passengerLabel}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex flex-col items-end min-w-[110px]">
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Total USD</span>
                <span className="text-xs font-mono font-bold text-emerald-700">
                  US$ {(totalCostUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex flex-col items-end min-w-[110px]">
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Total BRL</span>
                <span className="text-xs font-mono font-bold text-[#1A2B4C]">
                  R$ {(totalCostBRL || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Linha 3: Responsável pelo Pagamento */}
          {showPayerSelector && (
            <div className="pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                <label className="text-xs font-semibold text-slate-700">
                  Responsável pelo Pagamento
                </label>
              </div>
              <select
                value={payerId || 'all'}
                onChange={(e) => onChangePayerId(e.target.value)}
                className="h-10 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] cursor-pointer min-w-[220px] transition-all"
              >
                <option value="all">👥 Dividido pelo grupo</option>
                {travelers.map((t) => (
                  <option key={t.id} value={t.id}>
                    👤 {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
