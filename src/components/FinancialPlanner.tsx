import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  TrendingDown,
  PiggyBank,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  Cloud,
  RefreshCw,
  CreditCard,
  Scale,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { usePlanner } from '../context/PlannerContext';
import { ExpenseCategory, ExpenseItem, ExpenseStatus } from '../types';
import { LiveExchangeRateWidget } from './LiveExchangeRateWidget';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { parseInputToNumber, formatInputDisplay } from '../utils/currency';
import { generateDeterministicUUID } from '../utils/uuid';
import { TravelerSelector } from './TravelerSelector';
import { ExpenseSettlementModal } from './ExpenseSettlementModal';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';
import { MoneyInput } from './MoneyInput';

const CATEGORIES: ExpenseCategory[] = [
  'Passagens',
  'Hospedagem',
  'Ingressos',
  'Pacotes de Fotos',
  'Alimentação',
  'Compras',
  'Transporte',
  'Seguro',
  'Documentos',
];

export const FinancialPlanner: React.FC = () => {
  const {
    settings,
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    toggleExpenseExclusion,
    syncExpensesToSupabase,
    reloadExpensesFromSupabase,
    supabaseStatus,
    currencyView,
    financialSummary,
    daysCountdown,
    setIsSettingsOpen,
    parkTickets,
  } = usePlanner();

  // Auto-sync expenses to Supabase on mount if there are local expenses
  useEffect(() => {
    if (expenses.length > 0 && supabaseStatus.connected) {
      syncExpensesToSupabase();
    }
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState<boolean>(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Ingressos');
  const [estimatedValueUSD, setEstimatedValueUSD] = useState<number | null>(null);
  const [estimatedValueBRL, setEstimatedValueBRL] = useState<number | null>(null);
  const [paidValueBRL, setPaidValueBRL] = useState<number | null>(null);
  const [status, setStatus] = useState<ExpenseStatus>('Pendente');
  const [notes, setNotes] = useState('');
  const [responsibleTravelerId, setResponsibleTravelerId] = useState('all');
  const [travelerIds, setTravelerIds] = useState<string[]>(['all']);

  // Input formatting temporary states
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');

  // Confirmation states
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const expenseSubmitLockRef = useRef(false);

  useConfirmationKeyboard({
    isOpen: !!confirmDelete,
    onConfirm: () => {
      if (confirmDelete) {
        deleteExpense(confirmDelete.id);
        setConfirmDelete(null);
      }
    },
    onCancel: () => setConfirmDelete(null),
  });

  // Savings calculation (Months until trip)
  const monthsUntilTrip = Math.max(1, Math.round(daysCountdown / 30));
  const monthlySavingsTotalBRL = financialSummary.totalPendingBRL / monthsUntilTrip;
  const monthlySavingsPerPersonBRL = monthlySavingsTotalBRL / Math.max(1, settings.travelersCount);

  const formatCurrency = (valBRL: number, valUSD?: number) => {
    if (currencyView === 'USD') {
      const usd = valUSD !== undefined ? valUSD : valBRL / settings.dollarRate;
      return `$ ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `R$ ${valBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleOpenAddModal = () => {
    setEditingExpenseId(null);
    setTitle('');
    setCategory('Ingressos');
    setEstimatedValueUSD(null);
    setEstimatedValueBRL(null);
    setPaidValueBRL(null);
    setStatus('Pendente');
    setNotes('');
    setResponsibleTravelerId('all');
    setTravelerIds(['all']);
    setModalOpen(true);
  };

  const handleOpenEditModal = (exp: ExpenseItem) => {
    setEditingExpenseId(exp.id);
    setTitle(exp.title);
    setCategory(exp.category);
    setEstimatedValueUSD(exp.estimatedValueUSD ?? null);
    setEstimatedValueBRL(exp.estimatedValueBRL ?? null);
    setPaidValueBRL(exp.paidValueBRL ?? null);
    setStatus(exp.status);
    setNotes(exp.notes || '');
    setResponsibleTravelerId(exp.responsibleTravelerId || 'all');
    setTravelerIds(exp.travelerIds || [exp.responsibleTravelerId || 'all']);
    setModalOpen(true);
  };

  const handleUSDChange = (val: number | null) => {
    setEstimatedValueUSD(val);
    setEstimatedValueBRL(val !== null ? Math.round(val * settings.dollarRate * 100) / 100 : null);
  };

  const handleBRLChange = (val: number | null) => {
    setEstimatedValueBRL(val);
    setEstimatedValueUSD(val !== null ? Math.round((val / settings.dollarRate) * 100) / 100 : null);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseSubmitLockRef.current || isSaving) return;
    expenseSubmitLockRef.current = true;
    setIsSaving(true);
    try {
      const expenseTitle = title.trim() || 'Novo Gasto';
      const existingExp = editingExpenseId ? expenses.find((e) => e.id === editingExpenseId) : null;
      const finalSourceType = existingExp?.sourceType || 'general';
      const finalSourceId = existingExp?.sourceId;

      const expenseData: Omit<ExpenseItem, 'id'> = {
        title: expenseTitle,
        category,
        estimatedValueUSD: estimatedValueUSD ?? 0,
        estimatedValueBRL: estimatedValueBRL ?? 0,
        paidValueBRL: status === 'Pago' ? ((estimatedValueBRL ?? 0) || (paidValueBRL ?? 0)) : (status === 'Parcial' ? (paidValueBRL ?? 0) : 0),
        paidValueUSD: status === 'Pago' ? ((estimatedValueUSD ?? 0) || ((estimatedValueBRL ?? 0) / settings.dollarRate)) : (status === 'Parcial' ? ((paidValueBRL ?? 0) / settings.dollarRate) : 0),
        status,
        notes,
        payerId: responsibleTravelerId,
        responsibleTravelerId,
        travelerIds,
        excluded: existingExp?.excluded ?? false,
        sourceType: finalSourceType,
        sourceId: finalSourceId,
      };

      let res: { success: boolean; error?: string } | undefined;
      if (editingExpenseId) {
        res = await updateExpense(editingExpenseId, expenseData);
      } else {
        res = await addExpense(expenseData as ExpenseItem);
      }
      if (res && !res.success) {
        alert(`Erro ao salvar despesa: ${res.error || 'Erro desconhecido'}`);
        return;
      }
      setModalOpen(false);
    } catch (error: any) {
      console.error('Erro ao salvar despesa:', error);
      alert(`Erro inesperado ao salvar despesa: ${error?.message || 'Tente novamente.'}`);
    } finally {
      expenseSubmitLockRef.current = false;
      setIsSaving(false);
    }
  };

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen: modalOpen,
    onCancel: () => setModalOpen(false),
    onSave: () => handleSaveExpense({ preventDefault: () => {} } as React.FormEvent),
  });

  const categoryOrder: Record<string, number> = {
    'Passagens': 1,
    'Hospedagem': 2,
    'Ingressos': 3,
    'Pacotes de Fotos': 4,
    'Alimentação': 5,
    'Compras': 6,
    'Transporte': 7,
    'Seguro': 8,
    'Documentos': 9,
  };

  const filteredExpenses = expenses
    .filter((e) => selectedCategory === 'all' || e.category === selectedCategory)
    .sort((a, b) => (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99));

  const chartData = financialSummary.categoryTotals.filter((c) => c.estimatedBRL > 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Global Rate Callout */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37] mb-1.5">
              <DollarSign className="w-4 h-4" />
              <span>Orçamento Inteligente & Rateio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-serif text-white">
              Planejamento Financeiro KingdomCompass
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
              Cálculos em tempo real para <strong className="text-white font-semibold">{settings.travelersCount} viajantes</strong> com conversão em câmbio de{' '}
              <strong className="text-[#D4AF37] font-semibold">US$ 1,00 = R$ {settings.dollarRate.toFixed(2)}</strong>.
            </p>
          </div>

          <div className="flex flex-col items-end justify-center gap-2.5 self-end lg:self-auto ml-auto">
            <button
              id="btn-open-settlement-modal"
              onClick={() => setSettlementModalOpen(true)}
              className="px-4 py-2.5 bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5 whitespace-nowrap w-full sm:w-auto justify-center"
              title="Calcular quem deve pagar quem com compensação inteligente"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Quem Paga Quem (Acerto)</span>
            </button>

            <button
              id="btn-add-new-expense"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 bg-[#D4AF37] hover:bg-[#b8952b] text-[#1A2B4C] font-bold text-xs sm:text-sm rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5 whitespace-nowrap w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4 text-[#1A2B4C]" />
              <span>Adicionar Gasto</span>
            </button>
          </div>
        </div>

        {/* 4 Financial Highlight Cards inside Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 relative z-10 text-white">
          {/* Total do Orçamento */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
              Total do Orçamento
            </span>
            <p className="text-xl sm:text-2xl font-bold text-white font-serif">
              {formatCurrency(financialSummary.totalEstimatedBRL, financialSummary.totalEstimatedUSD)}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">
              {currencyView === 'BRL'
                ? `≈ US$ ${financialSummary.totalEstimatedUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                : `≈ R$ ${financialSummary.totalEstimatedBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
            </p>
          </div>

          {/* Total Quitado */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Total Pago (Quitado)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                {financialSummary.paidPercentage}%
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-300 font-serif">
              {formatCurrency(financialSummary.totalPaidBRL)}
            </p>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${financialSummary.paidPercentage}%` }}
              />
            </div>
          </div>

          {/* Falta Pagar */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
              Restante a Investir
            </span>
            <p className="text-xl sm:text-2xl font-bold text-amber-300 font-serif">
              {formatCurrency(financialSummary.totalPendingBRL)}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">
              Para atingir a meta total da viagem
            </p>
          </div>

          {/* Custo Médio por Viajante */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Custo por Pessoa ({settings.travelersCount}x)
              </span>
              <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-[#D4AF37] font-serif">
              {formatCurrency(financialSummary.costPerPersonBRL, financialSummary.costPerPersonUSD)}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">
              Rateio proporcional automático
            </p>
          </div>
        </div>
      </div>

      {/* API Exchange Rate Widget */}
      <LiveExchangeRateWidget />

      {/* Charts & Monthly Savings Planner Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart of Categories */}
        <div className="lg:col-span-7 bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#1A2B4C] font-serif">
                Distribuição de Gastos por Categoria
              </h3>
              <p className="text-xs text-slate-500">
                Visualize onde está concentrado o investimento da viagem
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Chart canvas */}
            <div className="sm:col-span-6 h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="estimatedBRL"
                    nameKey="category"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [`R$ ${val.toLocaleString('pt-BR')}`, 'Total']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend breakdown list */}
            <div className="sm:col-span-6 space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar text-xs">
              {financialSummary.categoryTotals.map((item) => (
                <div
                  key={item.category}
                  onClick={() => setSelectedCategory(selectedCategory === item.category ? 'all' : item.category)}
                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                    selectedCategory === item.category ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700">{item.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-[#1A2B4C] block leading-tight">
                      {formatCurrency(item.estimatedBRL)}
                    </span>
                    <span className="text-[10px] text-slate-400">{item.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Savings Calculator Card (Economia Mensal) */}
        <div className="lg:col-span-5 bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-5 border-t-4 border-t-[#D4AF37]">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xs bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#B8860B] flex items-center justify-center">
              <PiggyBank className="w-5 h-5 text-[#B8860B]" />
            </div>
            <h3 className="text-lg font-bold text-[#1A2B4C] font-serif">
              Planejamento de Poupança Mensal
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Faltam aproximadamente <strong className="font-bold text-[#1A2B4C]">{monthsUntilTrip} meses</strong> ({daysCountdown} dias) até a data do embarque.
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block">
                Meta Mensal do Grupo
              </span>
              <p className="text-xl font-bold text-[#1A2B4C] font-serif">
                {formatCurrency(monthlySavingsTotalBRL)} / mês
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <span className="text-[11px] uppercase tracking-wider font-bold text-[#D4AF37] block">
                Cota por Viajante ({settings.travelersCount} pessoas)
              </span>
              <p className="text-lg font-bold text-[#1A2B4C] font-serif">
                {formatCurrency(monthlySavingsPerPersonBRL)} / mês por pessoa
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span>Guardando esse valor mensalmente, a viagem estará 100% quitada no embarque!</span>
          </div>
        </div>
      </div>

      {/* Quick Settlement & Rebalance Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-[#1A2B4C] to-[#2A437E] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-serif text-white flex items-center gap-2">
              <span>Acerto de Contas & Compensação Mútua</span>
              <span className="text-[9px] font-mono bg-[#D4AF37] text-[#1A2B4C] px-1.5 py-0.2 rounded-full font-bold">
                Auto-Split
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Veja o que cada integrante gastou e quite dívidas no menor número de transferências.
            </p>
          </div>
        </div>

        <button
          id="btn-open-settlement-modal-bar"
          onClick={() => setSettlementModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2e] text-[#1A2B4C] text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Ver Quem Paga Quem</span>
        </button>
      </div>

      {/* Filter Tabs for Expense Categories */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        <button
          id="cat-filter-all"
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[#1A2B4C] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todas as Categorias ({expenses.length})
        </button>

        {CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat).length;
          return (
            <button
              key={cat}
              id={`cat-filter-${cat.toLowerCase()}`}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{cat}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expense Items List */}
      <div className="space-y-3">
        {filteredExpenses.map((expense, idx) => {
          const isGroupPaid = !expense.payerId || expense.payerId === 'all' || expense.payerId === 'grupo';
          const payer = !isGroupPaid ? settings.travelers.find((t) => t.id === expense.payerId) : undefined;
          const payerLabel = isGroupPaid ? 'Dividido pelo Grupo (Cada um pagou o seu)' : payer?.name || 'Não informado';

          // Resolver nomes e lista de quem divide o gasto
          const travelerIds = expense.travelerIds || ['all'];
          const isAllTravelers = travelerIds.includes('all') || travelerIds.length === 0;
          const beneficiaryTravelers = isAllTravelers
            ? settings.travelers
            : settings.travelers.filter((t) => travelerIds.includes(t.id));

          return (
            <div
              key={`${expense.id || 'exp'}-${idx}`}
              className={`p-4 sm:p-5 rounded-xl border transition-all ${
                expense.excluded
                  ? 'bg-slate-50/80 border-slate-200 opacity-60'
                  : 'bg-white border-slate-200 hover:border-[#D4AF37] shadow-2xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#1A2B4C]/10 text-[#1A2B4C]">
                      {expense.category}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        expense.status === 'Pago'
                          ? 'bg-emerald-100 text-emerald-800'
                          : expense.status === 'Parcial'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {expense.status}
                    </span>
                    {expense.excluded && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        Desconsiderado do Orçamento
                      </span>
                    )}
                    {isGroupPaid && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                        ✓ Cada um pagou o seu
                      </span>
                    )}
                    {expense.id.startsWith('exp-flight-') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                        ✈️ Voo Sincronizado
                      </span>
                    )}
                    {expense.id.startsWith('exp-acc-') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">
                        🏨 Hospedagem Sincronizada
                      </span>
                    )}
                    {expense.id.startsWith('exp-car-') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                        🚗 Transporte Sincronizado
                      </span>
                    )}
                    {expense.id.startsWith('exp-ticket-') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                        🎟️ Ingresso Sincronizado
                      </span>
                    )}
                  </div>

                  <h4 className={`text-base font-bold font-serif ${expense.excluded ? 'line-through text-slate-400' : 'text-[#1A2B4C]'}`}>
                    {expense.title}
                  </h4>

                  {expense.notes && (
                    <p className="text-[11px] text-slate-500 italic mt-1 leading-relaxed line-clamp-2">
                      {expense.notes}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 mt-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span className="font-medium">Pago por:</span>
                        <strong className={isGroupPaid ? "text-emerald-700 font-bold" : "text-slate-800 font-bold"}>
                          {payerLabel}
                        </strong>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Users className="w-3.5 h-3.5 text-blue-500" />
                        <span className="font-medium">Dividido com:</span>
                        <div className="flex flex-wrap gap-1">
                          {isAllTravelers ? (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold border border-blue-100">
                              Todo o Grupo ({settings.travelers.length || 1} viajantes)
                            </span>
                          ) : (
                            beneficiaryTravelers.map((t) => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold border border-slate-200"
                              >
                                {t.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {expense.updatedBy && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Atualizado por {expense.updatedBy} {expense.updatedAt ? `às ${expense.updatedAt}` : ''}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Values & Controls */}
                <div className="flex flex-row sm:flex-col items-end justify-between sm:justify-center gap-3 sm:gap-1">
                  <div className="text-right">
                    <p className="text-lg sm:text-xl font-bold text-[#1A2B4C] font-serif">
                      {formatCurrency(expense.estimatedValueBRL, expense.estimatedValueUSD)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Pago: <strong className="text-emerald-700">{formatCurrency(expense.paidValueBRL)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    {/* Toggle Exclude */}
                    <button
                      id={`btn-exclude-expense-${expense.id}`}
                      onClick={() => toggleExpenseExclusion(expense.id)}
                      title={expense.excluded ? 'Reativar no orçamento' : 'Não vou precisar desse gasto'}
                      className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                        expense.excluded
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {expense.excluded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span className="text-[10px] hidden sm:inline">
                        {expense.excluded ? 'Ativar' : 'Ignorar'}
                      </span>
                    </button>

                    {/* Edit */}
                    <button
                      id={`btn-edit-expense-${expense.id}`}
                      onClick={() => handleOpenEditModal(expense)}
                      className="p-2 rounded-lg text-slate-500 hover:text-[#1A2B4C] hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      id={`btn-delete-expense-${expense.id}`}
                      onClick={() => setConfirmDelete({ id: expense.id, title: expense.title })}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Money-Saving Tips Callout Section (KingdomCompass Hacks) */}
      <div className="bg-white rounded-xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-base font-bold text-[#1A2B4C] font-serif">
            Estratégias KingdomCompass de Economia Real
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-[#1A2B4C] text-sm">🎒 Snacks & Água nos Parques</h4>
            <p className="leading-relaxed">
              A Disney permite a entrada de alimentos e garrafas térmicas. Encha nos bebedouros de água gelada gratuitos e economize até US$ 30 por dia por pessoa.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-[#1A2B4C] text-sm">💳 Cartão Global Nomad / Wise</h4>
            <p className="leading-relaxed">
              Use contas globais com IOF de 1,1% e spread comercial em vez do cartão de crédito tradicional (IOF 4,38%). Economia direta de até 8% no total da viagem.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <h4 className="font-bold text-[#1A2B4C] text-sm">🚗 Visitor Toll Pass na Flórida</h4>
            <p className="leading-relaxed">
              Retire o tag gratuito no aeroporto MCO e pague pedágios na tarifa com desconto oficial sem as taxas abusivas das locadoras de veículos.
            </p>
          </div>
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {modalOpen && (
        <div
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
        >
          <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    {editingExpenseId ? 'Edição de Despesa' : 'Novo Lançamento'} • Orçamento & Gastos da Viagem
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    {editingExpenseId ? 'Editar Item Financeiro' : 'Adicionar Novo Gasto'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="flex flex-col flex-1 min-h-0 overflow-hidden text-slate-700">
              <div className="p-5 sm:p-6 space-y-8 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {/* 1. Informações Básicas */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  1. Informações Básicas do Gasto
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Título do Gasto
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Ingressos Universal 3 Dias"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 bg-white shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Categoria
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 bg-white shadow-2xs cursor-pointer"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Viajantes do Pacote */}
              <TravelerSelector
                label="2. Viajantes Associados a este Gasto"
                travelers={settings.travelers || []}
                selectedIds={travelerIds}
                onChange={(ids) => setTravelerIds(ids)}
              />

              {/* 3. Valor do Gasto */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  3. Valor & Pagamento
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Valor a Pagar (US$)
                      </label>
                      <MoneyInput
                        currency="USD"
                        value={estimatedValueUSD}
                        onChange={(val) => handleUSDChange(val)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Valor a Pagar (R$)
                      </label>
                      <MoneyInput
                        currency="BRL"
                        value={estimatedValueBRL}
                        onChange={(val) => handleBRLChange(val)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Status do Pagamento
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ExpenseStatus)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 bg-white shadow-2xs cursor-pointer h-[42px]"
                      >
                        <option value="Pago">✅ Pago</option>
                        <option value="Pendente">⏳ Pendente</option>
                        <option value="Parcial">💰 Parcial</option>
                        <option value="Não iniciado">⚪ Não iniciado</option>
                      </select>
                    </div>
                  </div>

                  {status === 'Parcial' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-slate-100">
                      <label className="block text-xs font-bold text-emerald-700 mb-1 uppercase tracking-wider">
                        Quanto já foi Pago? (R$)
                      </label>
                      <MoneyInput
                        currency="BRL"
                        value={paidValueBRL}
                        onChange={(val) => setPaidValueBRL(val)}
                      />
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                      <label className="text-xs font-bold text-slate-700">Responsável pelo Pagamento</label>
                    </div>
                    <select
                      value={responsibleTravelerId || 'all'}
                      onChange={(e) => setResponsibleTravelerId(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 min-w-[200px]"
                    >
                      <option value="all">👥 Dividido pelo grupo</option>
                      {settings.travelers.map((t) => (
                        <option key={t.id} value={t.id}>👤 {t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 4. Notas Adicionais */}
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  4. Notas & Detalhes Adicionais
                </label>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Reserva feita pela Disney, inclui café da manhã..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 bg-white shadow-2xs"
                  />
                </div>
              </div>
              </div>

              {/* Modal Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    'Salvando...'
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#1A2B4C] mb-2 font-serif">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-600 mb-6">
                Deseja realmente excluir o gasto <strong>"{confirmDelete.title}"</strong>? Esta ação removerá o lançamento do financeiro e também o item cadastrado original (ingresso, voo, hospedagem ou veículo).
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteExpense(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all text-sm cursor-pointer shadow-md shadow-red-100"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Settlement & Debt Compensation Modal */}
      <ExpenseSettlementModal
        isOpen={settlementModalOpen}
        onClose={() => setSettlementModalOpen(false)}
      />
    </div>
  );
};
