import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Scale,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Share2,
  Users,
  CreditCard,
  DollarSign,
  Plus,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeftRight,
  Receipt,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { ExpenseItem, Traveler, SettlementPayment } from '../types';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { SupabaseService } from '../services/supabaseService';
import { MoneyInput } from './MoneyInput';

interface CustomAdjustment {
  id: string;
  fromTravelerId: string; // Quem deve / paga o desconto
  toTravelerId: string; // Quem recebe o desconto / crédito
  amount: number;
  description: string;
  paymentDate?: string;
  paymentMethod?: string;
  status?: string;
}

interface SettlementTransfer {
  fromTraveler: Traveler;
  toTraveler: Traveler;
  amountBRL: number;
  amountUSD: number;
}

interface TravelerSummary {
  traveler: Traveler;
  expensesPaidBRL: number;
  expensesPaidUSD: number;
  expensesOwedBRL: number;
  expensesOwedUSD: number;
  directSentBRL: number;
  directSentUSD: number;
  directReceivedBRL: number;
  directReceivedUSD: number;
  totalPaidBRL: number;
  totalPaidUSD: number;
  totalOwedBRL: number;
  totalOwedUSD: number;
  netBalanceBRL: number;
  netBalanceUSD: number;
  status: 'creditor' | 'debtor' | 'settled';
  paidExpensesCount: number;
  beneficiaryExpensesCount: number;
}

interface ExpenseSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpenseSettlementModal: React.FC<ExpenseSettlementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, expenses, currencyView } = usePlanner();
  const travelers = settings.travelers || [];
  const dollarRate = settings.dollarRate || 5.15;

  // Configuration States
  const [calcMode, setCalcMode] = useState<'paid_only' | 'total_estimated'>('paid_only');
  const [includeExcluded, setIncludeExcluded] = useState<boolean>(false);
  const [selectedCurrency, setSelectedCurrency] = useState<'BRL' | 'USD'>(currencyView);
  const [activeTab, setActiveTab] = useState<'travelers' | 'expenses' | 'adjustments'>('travelers');
  
  // Custom Adjustments / Discounts
  const [adjustments, setAdjustments] = useState<CustomAdjustment[]>([]);
  const [newAdjFrom, setNewAdjFrom] = useState<string>(travelers[0]?.id || '');
  const [newAdjTo, setNewAdjTo] = useState<string>(travelers[1]?.id || travelers[0]?.id || '');
  const [newAdjAmount, setNewAdjAmount] = useState<number | null>(null);
  const [newAdjDesc, setNewAdjDesc] = useState<string>('');
  const [newAdjMethod, setNewAdjMethod] = useState<string>('PIX');
  const [newAdjDate, setNewAdjDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState<boolean>(false);
  const [isSavingAdjustment, setIsSavingAdjustment] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load adjustments directly from Supabase settlement_payments
  useEffect(() => {
    if (!isOpen || !settings.id) return;
    let isMounted = true;
    setIsLoadingAdjustments(true);

    SupabaseService.fetchSettlementPayments(settings.id)
      .then((payments) => {
        if (!isMounted) return;
        setAdjustments(
          payments.map((p) => ({
            id: p.id,
            fromTravelerId: p.fromTravelerId,
            toTravelerId: p.toTravelerId,
            amount: p.amountBrl,
            description: p.description || 'Ajuste / Desconto direto',
            paymentDate: p.paymentDate,
            paymentMethod: p.paymentMethod || 'PIX',
            status: p.status || 'Concluído',
          }))
        );
      })
      .catch((err) => {
        console.warn('Erro ao carregar acertos de contas:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingAdjustments(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, settings.id]);

  // UI state
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [expandedTravelerId, setExpandedTravelerId] = useState<string | null>(null);

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: onClose,
  });

  // 1. Filter active expenses for calculation
  // Despesas já divididas e pagas individualmente no ato da compra (payerId === 'all' / cada um pagou o seu)
  // ou pagas por um viajante exclusivamente para si mesmo (sem terceiros nem rateio)
  // são exibidas na Tabela de Gastos principal, mas NÃO entram no demonstrativo de rateio/acerto de contas entre viajantes.
  const relevantExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const rawPayerId = (e.payerId || e.responsibleTravelerId || 'all').trim();
      if (rawPayerId === 'all' || rawPayerId === 'grupo') return false;

      if (!includeExcluded && e.excluded) return false;
      if (calcMode === 'paid_only') {
        const isPaid = (e.paidValueBRL || 0) > 0 || e.status === 'Pago' || e.status === 'Parcial';
        if (!isPaid) return false;
      } else {
        if ((e.estimatedValueBRL || 0) <= 0) return false;
      }

      // Identifica o pagador da despesa
      const matchedPayer = travelers.find(
        (t) => t.id === rawPayerId || (rawPayerId && t.name.trim().toLowerCase() === rawPayerId.toLowerCase())
      );
      const payerId = matchedPayer ? matchedPayer.id : rawPayerId;
      const payerName = matchedPayer ? matchedPayer.name.trim().toLowerCase() : rawPayerId.toLowerCase();

      // Identifica os beneficiários da despesa
      const tIds = e.travelerIds || ['all'];
      if (!tIds.includes('all') && tIds.length > 0) {
        const targetTravelers = travelers.filter(
          (t) =>
            tIds.includes(t.id) ||
            (t.name && tIds.some((idOrName) => idOrName.trim().toLowerCase() === t.name.trim().toLowerCase()))
        );

        if (targetTravelers.length > 0) {
          // Se todos os beneficiários forem unicamente o próprio pagador, é despesa 100% individual
          // (ex: Mateus pagou sua própria passagem e só para ele mesmo) -> Não entra no rateio
          const isOnlySelf = targetTravelers.every(
            (t) => t.id === payerId || t.name.trim().toLowerCase() === payerName
          );
          if (isOnlySelf) return false;
        } else {
          // Fallback caso targetTravelers não resolva via array de viajantes
          const isOnlySelf = tIds.every((id) => {
            const norm = id.trim().toLowerCase();
            return norm === payerId.toLowerCase() || norm === payerName;
          });
          if (isOnlySelf) return false;
        }
      }

      return true;
    });
  }, [expenses, includeExcluded, calcMode, travelers]);

  // 2. Calculate balance per traveler
  const { travelerSummaries, settlementTransfers, totalVolumeBRL, totalVolumeUSD } = useMemo(() => {
    const paidMap: Record<string, { brl: number; usd: number; count: number }> = {};
    const owedMap: Record<string, { brl: number; usd: number; count: number }> = {};

    travelers.forEach((t) => {
      paidMap[t.id] = { brl: 0, usd: 0, count: 0 };
      owedMap[t.id] = { brl: 0, usd: 0, count: 0 };
    });

    let volBRL = 0;
    let volUSD = 0;

    relevantExpenses.forEach((exp) => {
      let costBRL = 0;
      let costUSD = 0;

      if (calcMode === 'paid_only') {
        if (exp.status === 'Pago') {
          costBRL = exp.paidValueBRL && exp.paidValueBRL > 0 ? exp.paidValueBRL : (exp.estimatedValueBRL || 0);
          costUSD = exp.paidValueUSD && exp.paidValueUSD > 0 ? exp.paidValueUSD : (exp.estimatedValueUSD || (costBRL / dollarRate));
        } else {
          costBRL = exp.paidValueBRL && exp.paidValueBRL > 0 ? exp.paidValueBRL : (exp.estimatedValueBRL || 0);
          costUSD = exp.paidValueUSD && exp.paidValueUSD > 0 ? exp.paidValueUSD : (exp.estimatedValueUSD || (costBRL / dollarRate));
        }
      } else {
        costBRL = exp.estimatedValueBRL || 0;
        costUSD = exp.estimatedValueUSD || (costBRL / dollarRate);
      }

      if (costBRL <= 0) return;

      volBRL += costBRL;
      volUSD += costUSD;

      // Payer attribution
      const rawPayerId = exp.payerId || exp.responsibleTravelerId || 'all';
      const matchedTraveler = travelers.find(
        (t) => t.id === rawPayerId || (rawPayerId && t.name.trim().toLowerCase() === rawPayerId.trim().toLowerCase())
      );
      const payerId = matchedTraveler ? matchedTraveler.id : rawPayerId;

      if (payerId === 'all' || payerId === 'grupo') {
        // Group paid from common pool -> split payer attribution across all travelers
        const count = travelers.length || 1;
        travelers.forEach((t) => {
          paidMap[t.id].brl += costBRL / count;
          paidMap[t.id].usd += costUSD / count;
        });
      } else if (paidMap[payerId]) {
        paidMap[payerId].brl += costBRL;
        paidMap[payerId].usd += costUSD;
        paidMap[payerId].count += 1;
      }

      // Beneficiaries attribution
      const tIds = exp.travelerIds || ['all'];
      let targetTravelers: Traveler[] = [];

      if (tIds.includes('all') || tIds.length === 0) {
        targetTravelers = travelers;
      } else {
        targetTravelers = travelers.filter((t) => tIds.includes(t.id));
      }

      if (targetTravelers.length === 0) {
        targetTravelers = travelers;
      }

      const splitCount = targetTravelers.length;
      const shareBRL = costBRL / splitCount;
      const shareUSD = costUSD / splitCount;

      targetTravelers.forEach((t) => {
        if (owedMap[t.id]) {
          owedMap[t.id].brl += shareBRL;
          owedMap[t.id].usd += shareUSD;
          owedMap[t.id].count += 1;
        }
      });
    });

    // Track direct payments / adjustments
    const directSentMap: Record<string, { brl: number; usd: number; count: number }> = {};
    const directReceivedMap: Record<string, { brl: number; usd: number; count: number }> = {};

    travelers.forEach((t) => {
      directSentMap[t.id] = { brl: 0, usd: 0, count: 0 };
      directReceivedMap[t.id] = { brl: 0, usd: 0, count: 0 };
    });

    adjustments.forEach((adj) => {
      const amtBRL = adj.amount;
      const amtUSD = amtBRL / dollarRate;
      // fromTravelerId transferred money directly out of pocket (reduces debt / increases contribution)
      if (directSentMap[adj.fromTravelerId]) {
        directSentMap[adj.fromTravelerId].brl += amtBRL;
        directSentMap[adj.fromTravelerId].usd += amtUSD;
        directSentMap[adj.fromTravelerId].count += 1;
      }
      // toTravelerId received direct payment (reduces receivable / offsets credit)
      if (directReceivedMap[adj.toTravelerId]) {
        directReceivedMap[adj.toTravelerId].brl += amtBRL;
        directReceivedMap[adj.toTravelerId].usd += amtUSD;
        directReceivedMap[adj.toTravelerId].count += 1;
      }
    });

    // Summaries array
    const summaries: TravelerSummary[] = travelers.map((t) => {
      const expensesPaidBRL = paidMap[t.id]?.brl || 0;
      const expensesPaidUSD = paidMap[t.id]?.usd || 0;
      const expensesOwedBRL = owedMap[t.id]?.brl || 0;
      const expensesOwedUSD = owedMap[t.id]?.usd || 0;

      const directSentBRL = directSentMap[t.id]?.brl || 0;
      const directSentUSD = directSentMap[t.id]?.usd || 0;
      const directReceivedBRL = directReceivedMap[t.id]?.brl || 0;
      const directReceivedUSD = directReceivedMap[t.id]?.usd || 0;

      // Total contributed = expenses paid directly + direct payments sent to other travelers
      const totalPaidBRL = expensesPaidBRL + directSentBRL;
      const totalPaidUSD = expensesPaidUSD + directSentUSD;

      // Total consumption/reimbursed = consumption share of expenses + direct payments received from other travelers
      const totalOwedBRL = expensesOwedBRL + directReceivedBRL;
      const totalOwedUSD = expensesOwedUSD + directReceivedUSD;

      // Net balance = Total Paid - Total Owed
      const netBRL = totalPaidBRL - totalOwedBRL;
      const netUSD = totalPaidUSD - totalOwedUSD;

      let status: 'creditor' | 'debtor' | 'settled' = 'settled';
      if (netBRL > 0.05) status = 'creditor';
      else if (netBRL < -0.05) status = 'debtor';

      return {
        traveler: t,
        expensesPaidBRL,
        expensesPaidUSD,
        expensesOwedBRL,
        expensesOwedUSD,
        directSentBRL,
        directSentUSD,
        directReceivedBRL,
        directReceivedUSD,
        totalPaidBRL,
        totalPaidUSD,
        totalOwedBRL,
        totalOwedUSD,
        netBalanceBRL: netBRL,
        netBalanceUSD: netUSD,
        status,
        paidExpensesCount: (paidMap[t.id]?.count || 0) + (directSentMap[t.id]?.count || 0),
        beneficiaryExpensesCount: owedMap[t.id]?.count || 0,
      };
    });

    // 3. Greedy Minimum Cash Flow Settlement Algorithm (Debt Simplification)
    // Positive balance = Creditor (receives money)
    // Negative balance = Debtor (pays money)
    interface BalanceEntry {
      traveler: Traveler;
      balance: number; // in BRL
    }

    const creditors: BalanceEntry[] = [];
    const debtors: BalanceEntry[] = [];

    summaries.forEach((s) => {
      if (s.netBalanceBRL > 0.05) {
        creditors.push({ traveler: s.traveler, balance: s.netBalanceBRL });
      } else if (s.netBalanceBRL < -0.05) {
        debtors.push({ traveler: s.traveler, balance: Math.abs(s.netBalanceBRL) });
      }
    });

    // Sort descending by amount
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);

    const transfers: SettlementTransfer[] = [];
    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settledAmountBRL = Math.min(debtor.balance, creditor.balance);

      if (settledAmountBRL > 0.01) {
        transfers.push({
          fromTraveler: debtor.traveler,
          toTraveler: creditor.traveler,
          amountBRL: settledAmountBRL,
          amountUSD: settledAmountBRL / dollarRate,
        });
      }

      debtor.balance -= settledAmountBRL;
      creditor.balance -= settledAmountBRL;

      if (debtor.balance < 0.05) i++;
      if (creditor.balance < 0.05) j++;
    }

    return {
      travelerSummaries: summaries,
      settlementTransfers: transfers,
      totalVolumeBRL: volBRL,
      totalVolumeUSD: volUSD,
    };
  }, [travelers, relevantExpenses, calcMode, dollarRate, adjustments]);

  if (!isOpen) return null;

  const formatMoney = (valBRL: number, valUSD?: number) => {
    if (selectedCurrency === 'USD') {
      const usd = valUSD !== undefined ? valUSD : valBRL / dollarRate;
      return `$ ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `R$ ${valBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = newAdjAmount || 0;
    if (!num || isNaN(num) || num <= 0 || newAdjFrom === newAdjTo) {
      setSaveError('Dados inválidos. Verifique o valor e os integrantes.');
      return;
    }

    setSaveError(null);
    setIsSavingAdjustment(true);

    const tempId = 'adj-' + Date.now();
    const desc = newAdjDesc.trim() || 'Ajuste / Pagamento direto';
    const payDate = newAdjDate || new Date().toISOString().split('T')[0];
    const payMethod = newAdjMethod || 'PIX';

    const newPayment: SettlementPayment = {
      id: tempId,
      tripId: settings.id!,
      fromTravelerId: newAdjFrom,
      toTravelerId: newAdjTo,
      amountBrl: num,
      amountUsd: Number((num / dollarRate).toFixed(2)),
      description: desc,
      paymentDate: payDate,
      paymentMethod: payMethod,
      status: 'Concluído',
    };

    // Optimistic UI update
    setAdjustments((prev) => [
      ...prev,
      {
        id: tempId,
        fromTravelerId: newAdjFrom,
        toTravelerId: newAdjTo,
        amount: num,
        description: desc,
        paymentDate: payDate,
        paymentMethod: payMethod,
        status: 'Concluído',
      },
    ]);
    setNewAdjAmount('');
    setNewAdjDesc('');

    // Persist to Supabase
    try {
      const res = await SupabaseService.saveSettlementPayment(settings.id, newPayment, {
        tripCode: settings.tripCode,
        tripName: settings.tripName,
        destination: settings.destination,
        travelers: settings.travelers,
      });
      if (res.success && res.data) {
        const savedId = res.data.id;
        setAdjustments((prev) =>
          prev.map((a) => (a.id === tempId ? { ...a, id: savedId } : a))
        );
      } else {
        throw new Error(res.error || 'Erro ao salvar ajuste.');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Erro inesperado ao salvar ajuste.');
      // Revert optimistic update
      setAdjustments((prev) => prev.filter((a) => a.id !== tempId));
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    // Optimistic UI removal
    setAdjustments((prev) => prev.filter((a) => a.id !== id));

    // Delete from Supabase
    try {
      await SupabaseService.deleteSettlementPayment(id);
    } catch (err) {
      console.error('Erro ao excluir ajuste do Supabase:', err);
    }
  };

  // WhatsApp formatted message generator
  const handleCopyWhatsAppSummary = () => {
    const lines: string[] = [];
    lines.push(`📊 *ACERTO DE CONTAS & BALANÇO - ${settings.tripName || 'ORLANDO'}*`);
    lines.push(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);
    lines.push(`💵 Câmbio Base: US$ 1,00 = R$ ${dollarRate.toFixed(2)}`);
    lines.push(`💰 Base de Cálculo: ${calcMode === 'paid_only' ? 'Gastos Efetivamente Pagos' : 'Orçamento Total'}`);
    lines.push(`💸 Volume Total Analisado: ${formatMoney(totalVolumeBRL, totalVolumeUSD)}`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('👤 *RESUMO INDIVIDUAL POR VIAJANTE:*');
    travelerSummaries.forEach((s) => {
      const saldoStr = s.status === 'creditor'
        ? `🟢 A RECEBER: ${formatMoney(s.netBalanceBRL, s.netBalanceUSD)}`
        : s.status === 'debtor'
        ? `🔴 A PAGAR: ${formatMoney(Math.abs(s.netBalanceBRL), Math.abs(s.netBalanceUSD))}`
        : `⚪ QUITADO (R$ 0,00)`;

      lines.push(`• *${s.traveler.name}*:`);
      lines.push(`   - Pagou: ${formatMoney(s.totalPaidBRL, s.totalPaidUSD)}`);
      lines.push(`   - Sua Cota: ${formatMoney(s.totalOwedBRL, s.totalOwedUSD)}`);
      lines.push(`   - Saldo: ${saldoStr}`);
    });
    if (adjustments.length > 0) {
      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💳 *PAGAMENTOS & AJUSTES REGISTRADOS:*');
      adjustments.forEach((adj, idx) => {
        const fromT = travelers.find((t) => t.id === adj.fromTravelerId);
        const toT = travelers.find((t) => t.id === adj.toTravelerId);
        lines.push(`${idx + 1}️⃣ *${fromT?.name || 'Viajante'}* 👉 transferiu *R$ ${adj.amount.toFixed(2)}* para *${toT?.name || 'Viajante'}* (${adj.paymentMethod || 'PIX'} - ${adj.description})`);
      });
    }
    lines.push('');
    lines.push('✨ Gerado automaticamente pelo *KingdomCompass Planner*');

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] max-h-[92vh] my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Rateio & Balanço Financeiro • Divisão entre Viajantes
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Demonstrativo de Gastos & Ajustes
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar (Calculation modes, currency & export) */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode: Apenas Gastos Já Pagos */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <span className="px-3 py-1.5 rounded-lg font-bold bg-[#1A2B4C] text-white shadow-xs select-none">
                Apenas Gastos Já Pagos
              </span>
            </div>

            {/* Currency selector */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                onClick={() => setSelectedCurrency('BRL')}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedCurrency === 'BRL' ? 'bg-[#D4AF37] text-[#1A2B4C]' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                R$ Real
              </button>
              <button
                onClick={() => setSelectedCurrency('USD')}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedCurrency === 'USD' ? 'bg-[#D4AF37] text-[#1A2B4C]' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                US$ Dólar
              </button>
            </div>

            {/* Excluded toggle */}
            <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none font-medium">
              <input
                type="checkbox"
                checked={includeExcluded}
                onChange={(e) => setIncludeExcluded(e.target.checked)}
                className="w-3.5 h-3.5 text-[#1A2B4C] rounded-sm focus:ring-[#1A2B4C]"
              />
              <span>Incluir ignoradas</span>
            </label>
          </div>

          {/* Action button: Copy WhatsApp */}
          <button
            onClick={handleCopyWhatsAppSummary}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
          >
            {copiedSummary ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedSummary ? 'Copiado para WhatsApp!' : 'Copiar Resumo / WhatsApp'}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 bg-white overflow-x-auto custom-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('travelers')}
            className={`px-4 py-2.5 border-b-2 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'travelers'
                ? 'border-[#1A2B4C] text-[#1A2B4C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4 text-blue-500" />
            <span>Gastos por Viajante ({travelers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2.5 border-b-2 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'expenses'
                ? 'border-[#1A2B4C] text-[#1A2B4C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4 text-emerald-500" />
            <span>Lista de Despesas ({relevantExpenses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-4 py-2.5 border-b-2 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'adjustments'
                ? 'border-[#1A2B4C] text-[#1A2B4C]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4 text-amber-500" />
            <span>Pagamentos & Ajustes {adjustments.length > 0 && `(${adjustments.length})`}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto min-h-0 custom-scrollbar flex-1 space-y-6">
          {saveError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}
          
          {/* TAB 1: GASTOS POR VIAJANTE */}
          {activeTab === 'travelers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#1A2B4C]">
                    Demonstrativo Individual de Gastos e Participação
                  </h3>
                  <p className="text-xs text-slate-500">
                    Balanço líquido de cada participante baseado nas despesas pagas e cotas de consumo.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('adjustments')}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-700" />
                  <span>Novo Pagamento / Ajuste</span>
                </button>
              </div>

              <div className="space-y-3">
                {travelerSummaries.map((summary, sIdx) => {
                  const isExpanded = expandedTravelerId === summary.traveler.id;
                  const paidExpenses = relevantExpenses.filter((e) => {
                    const p = (e.payerId || e.responsibleTravelerId || '').trim();
                    return p === summary.traveler.id || (summary.traveler.name && p.toLowerCase() === summary.traveler.name.trim().toLowerCase());
                  });
                  const beneficiaryExpenses = relevantExpenses.filter((e) => {
                    const tIds = e.travelerIds || ['all'];
                    return (
                      tIds.includes('all') ||
                      tIds.includes(summary.traveler.id) ||
                      (summary.traveler.name &&
                        tIds.some((id) => id.trim().toLowerCase() === summary.traveler.name.trim().toLowerCase()))
                    );
                  });

                  return (
                    <div
                      key={`${summary.traveler.id}-${sIdx}`}
                      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                    >
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-xs"
                            style={{ backgroundColor: summary.traveler.avatarColor || '#1A2B4C' }}
                          >
                            {summary.traveler.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[#1A2B4C]">
                                {summary.traveler.name}
                              </h4>
                              {summary.traveler.role === 'organizer' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                  Organizador
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {summary.traveler.email || 'Viajante'} • Pagou {paidExpenses.length} {paidExpenses.length === 1 ? 'gasto' : 'gastos'} • Participou de {beneficiaryExpenses.length}
                            </p>
                          </div>
                        </div>

                        {/* Metrics & Net Balance */}
                        <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 block font-medium uppercase">
                              Pagou do Bolso
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {formatMoney(summary.totalPaidBRL, summary.totalPaidUSD)}
                            </span>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 block font-medium uppercase">
                              Sua Cota (Consumo)
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {formatMoney(summary.totalOwedBRL, summary.totalOwedUSD)}
                            </span>
                          </div>

                          <div className="text-right min-w-[110px]">
                            <span className="text-[10px] font-bold uppercase tracking-wider block">
                              {summary.status === 'creditor' && <span className="text-emerald-600">A Receber</span>}
                              {summary.status === 'debtor' && <span className="text-rose-600">A Pagar</span>}
                              {summary.status === 'settled' && <span className="text-slate-400">Saldo Quitado</span>}
                            </span>
                            <span
                              className={`text-sm sm:text-base font-bold font-serif ${
                                summary.status === 'creditor'
                                  ? 'text-emerald-700'
                                  : summary.status === 'debtor'
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              {formatMoney(Math.abs(summary.netBalanceBRL), Math.abs(summary.netBalanceUSD))}
                            </span>
                          </div>

                          <button
                            onClick={() => setExpandedTravelerId(isExpanded ? null : summary.traveler.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable details */}
                      {isExpanded && (
                        <div className="p-4 sm:p-5 bg-slate-50/80 border-t border-slate-200 text-xs space-y-4">
                          {/* Despesas Pagas */}
                          <div>
                            <span className="font-bold text-slate-700 block mb-2 flex items-center gap-1.5">
                              <span>🧾 Despesas pagas por {summary.traveler.name}:</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({formatMoney(summary.expensesPaidBRL, summary.expensesPaidUSD)})
                              </span>
                            </span>
                            {paidExpenses.length === 0 ? (
                              <p className="text-slate-400 italic">Nenhuma despesa de grupo paga individualmente.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {paidExpenses.map((exp, pIdx) => (
                                  <div
                                    key={`${exp.id}-${pIdx}`}
                                    className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 text-[10px] font-bold">
                                        {exp.category}
                                      </span>
                                      <span className="font-medium text-slate-800">{exp.title}</span>
                                    </div>
                                    <strong className="text-slate-900 font-mono">
                                      {formatMoney(exp.estimatedValueBRL, exp.estimatedValueUSD)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Pagamentos Diretos Enviados (Transferências) */}
                          {summary.directSentBRL > 0 && (
                            <div className="pt-2 border-t border-slate-200/80">
                              <span className="font-bold text-rose-700 block mb-2 flex items-center gap-1.5">
                                <span>💳 Pagamentos / Transferências enviadas a outros viajantes:</span>
                                <span className="text-[10px] text-rose-600 font-normal font-mono">
                                  (+{formatMoney(summary.directSentBRL, summary.directSentUSD)})
                                </span>
                              </span>
                              <div className="space-y-1.5">
                                {adjustments
                                  .filter((a) => a.fromTravelerId === summary.traveler.id)
                                  .map((adj) => {
                                    const toT = travelers.find((t) => t.id === adj.toTravelerId);
                                    return (
                                      <div
                                        key={adj.id}
                                        className="p-2 rounded-lg bg-rose-50/50 border border-rose-200/60 flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-800 text-[10px] font-bold">
                                            {adj.paymentMethod || 'PIX'}
                                          </span>
                                          <span className="text-slate-700">
                                            Transferiu para <strong>{toT?.name || 'Viajante'}</strong>
                                            {adj.description && <span className="text-slate-500"> ({adj.description})</span>}
                                          </span>
                                        </div>
                                        <strong className="text-rose-700 font-mono">
                                          {formatMoney(adj.amount, adj.amount / dollarRate)}
                                        </strong>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Pagamentos Diretos Recebidos (Reembolsos) */}
                          {summary.directReceivedBRL > 0 && (
                            <div className="pt-2 border-t border-slate-200/80">
                              <span className="font-bold text-emerald-700 block mb-2 flex items-center gap-1.5">
                                <span>💰 Reembolsos / Pagamentos recebidos de outros viajantes:</span>
                                <span className="text-[10px] text-emerald-600 font-normal font-mono">
                                  (-{formatMoney(summary.directReceivedBRL, summary.directReceivedUSD)})
                                </span>
                              </span>
                              <div className="space-y-1.5">
                                {adjustments
                                  .filter((a) => a.toTravelerId === summary.traveler.id)
                                  .map((adj) => {
                                    const fromT = travelers.find((t) => t.id === adj.fromTravelerId);
                                    return (
                                      <div
                                        key={adj.id}
                                        className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/60 flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                            {adj.paymentMethod || 'PIX'}
                                          </span>
                                          <span className="text-slate-700">
                                            Recebeu de <strong>{fromT?.name || 'Viajante'}</strong>
                                            {adj.description && <span className="text-slate-500"> ({adj.description})</span>}
                                          </span>
                                        </div>
                                        <strong className="text-emerald-700 font-mono">
                                          {formatMoney(adj.amount, adj.amount / dollarRate)}
                                        </strong>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: LISTA DE DESPESAS */}
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A2B4C]">
                  Despesas Computadas no Cálculo
                </h3>
                <span className="text-xs text-slate-500">
                  Total: {relevantExpenses.length} itens ({formatMoney(totalVolumeBRL, totalVolumeUSD)})
                </span>
              </div>

              <div className="p-3 bg-blue-50/80 border border-blue-200/60 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <span className="text-base leading-none">💡</span>
                <p className="leading-relaxed">
                  Apenas despesas compartilhadas pagas por um viajante para terceiros ou para o grupo entram no rateio de dívidas. 
                  Gastos individuais pagos pelo próprio viajante exclusivamente para si mesmo, ou selecionados como <strong>"Dividido pelo Grupo (Cada um pagou o seu)"</strong>, 
                  constam normalmente na <strong>Tabela de Gastos principal</strong> e não geram saldos pendentes entre viajantes.
                </p>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {relevantExpenses.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="font-bold text-slate-700">Nenhuma despesa compartilhada para rateio.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Despesas pagas individualmente por um participante para si mesmo constam na tabela financeira principal e não geram pendências.
                    </p>
                  </div>
                ) : (
                  relevantExpenses.map((exp, rIdx) => {
                    const rawPayer = exp.payerId || exp.responsibleTravelerId || 'all';
                    const payer = travelers.find(
                      (t) => t.id === rawPayer || (rawPayer && t.name.trim().toLowerCase() === rawPayer.trim().toLowerCase())
                    );
                    const payerName = rawPayer === 'all' || rawPayer === 'grupo'
                      ? 'Grupo (Fundo Comum)'
                      : payer?.name || rawPayer || 'Não informado';

                    const tIds = exp.travelerIds || ['all'];
                    const isAll = tIds.includes('all');
                    const targetTravelers = isAll
                      ? travelers
                      : travelers.filter(
                          (t) =>
                            tIds.includes(t.id) ||
                            (t.name && tIds.some((idOrName) => idOrName.trim().toLowerCase() === t.name.trim().toLowerCase()))
                        );

                  const costBRL = calcMode === 'paid_only'
                    ? (exp.status === 'Pago' ? exp.estimatedValueBRL : (exp.paidValueBRL || 0))
                    : (exp.estimatedValueBRL || 0);

                  const costUSD = calcMode === 'paid_only'
                    ? (exp.status === 'Pago' ? exp.estimatedValueUSD : (exp.paidValueUSD || costBRL / dollarRate))
                    : (exp.estimatedValueUSD || costBRL / dollarRate);

                  return (
                    <div
                      key={`${exp.id}-${rIdx}`}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold px-2 py-0.5 rounded-md bg-[#1A2B4C]/10 text-[#1A2B4C] text-[10px]">
                            {exp.category}
                          </span>
                          <span className="font-bold text-slate-800">{exp.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            exp.status === 'Pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {exp.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>Pago por: <strong className="text-slate-800">{payerName}</strong></span>
                          <span>•</span>
                          <span>Dividido entre: <strong className="text-slate-800">{isAll ? 'Todos os Viajantes' : targetTravelers.map((t) => t.name).join(', ')}</strong> ({targetTravelers.length}x)</span>
                        </div>
                      </div>

                      <div className="text-right sm:shrink-0">
                        <span className="font-bold text-slate-900 font-serif text-sm block">
                          {formatMoney(costBRL, costUSD)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatMoney(costBRL / Math.max(1, targetTravelers.length))} / pessoa
                        </span>
                      </div>
                    </div>
                  );
                }))}
              </div>
            </div>
          )}

          {/* TAB 4: DESCONTOS & AJUSTES EXTRAS */}
          {activeTab === 'adjustments' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#1A2B4C]">
                  Adicionar Desconto ou Ajuste Direto entre Integrantes
                </h3>
                <p className="text-xs text-slate-500">
                  Compense adiantamentos, empréstimos ou descontos negociados entre dois viajantes sem alterar a planilha de gastos original.
                </p>
              </div>

              {/* Form Add Adjustment */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Adicionar Ajuste</h4>
                <form onSubmit={handleAddAdjustment} className="p-4 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Devedor (Pagador)</label>
                      <select
                        value={newAdjFrom}
                        onChange={(e) => setNewAdjFrom(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white"
                      >
                        {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Credor (Beneficiário)</label>
                      <select
                        value={newAdjTo}
                        onChange={(e) => setNewAdjTo(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white"
                      >
                        {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Valor (R$)</label>
                      <MoneyInput currency="BRL" value={newAdjAmount} onChange={(val) => setNewAdjAmount(val)} />
                    </div>
                    <div className="sm:col-span-2">
                       <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Motivo</label>
                       <input type="text" placeholder="Ex: Ajuste de despesa, reembolso..." value={newAdjDesc} onChange={(e) => setNewAdjDesc(e.target.value)} className="w-full text-xs p-2.5 rounded-lg border border-slate-200" />
                    </div>
                  </div>
                  <button type="submit" disabled={isSavingAdjustment} className="w-full py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] disabled:opacity-50">
                    {isSavingAdjustment ? 'Salvando...' : 'Adicionar Ajuste'}
                  </button>
                </form>
              </div>

              {/* Adjustments list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 block">
                    Pagamentos & Ajustes Registrados no Banco ({adjustments.length})
                  </span>
                  {isLoadingAdjustments && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" /> Sincronizando com Supabase...
                    </span>
                  )}
                </div>

                {isLoadingAdjustments && adjustments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-[#1A2B4C]" />
                    <span>Carregando pagamentos e compensações salvas...</span>
                  </div>
                ) : adjustments.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-400 text-xs">
                    Nenhum pagamento ou ajuste manual registrado até o momento.
                  </div>
                ) : (
                  adjustments.map((adj, aIdx) => {
                    const fromT = travelers.find((t) => t.id === adj.fromTravelerId);
                    const toT = travelers.find((t) => t.id === adj.toTravelerId);
                    return (
                      <div
                        key={`${adj.id}-${aIdx}`}
                        className="p-3.5 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-300 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            {fromT?.name || 'Viajante'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {toT?.name || 'Viajante'}
                          </span>
                          <span className="text-slate-600 font-medium ml-1">• {adj.description}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {adj.paymentMethod || 'PIX'}
                          </span>
                          {adj.paymentDate && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(adj.paymentDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                          <div className="text-right">
                            <span className="font-bold text-emerald-700 font-mono text-sm block">
                              R$ {adj.amount.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ≈ US$ {(adj.amount / dollarRate).toFixed(2)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveAdjustment(adj.id)}
                            title="Excluir pagamento"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-sm shadow-md transition-all cursor-pointer active:scale-95"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
