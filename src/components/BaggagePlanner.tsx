import React, { useState, useMemo, useEffect } from 'react';
import {
  Luggage,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Shirt,
  Footprints,
  BatteryCharging,
  Stethoscope,
  Users,
  Check,
  ArrowRight,
  RefreshCw,
  FolderSync,
  AlertTriangle,
  HelpCircle,
  FileCheck,
  CheckCheck,
  List,
  LayoutGrid,
  Sun,
  Snowflake,
  CloudRain,
  Calendar,
  Minus,
  SlidersHorizontal,
  X,
  Lock,
  RotateCcw,
  WashingMachine,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { BaggageItem, Traveler } from '../types';
import { detectGenderByName, Gender } from '../utils/genderDetector';
import { WeatherCondition, detectOrlandoWeatherFromTrip, DetectedTripWeatherInfo } from '../utils/baggageGenerator';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';

export const BaggagePlanner: React.FC = () => {
  const {
    baggageItems,
    toggleBaggageItem,
    addBaggageItem,
    updateBaggageItem,
    deleteBaggageItem,
    toggleAllBaggageForTraveler,
    resetBaggageTemplateForTraveler,
    settings,
    currentUser,
    accommodations,
  } = usePlanner();

  const travelers = settings.travelers || [];

  // Active traveler being viewed/edited
  const [selectedTravelerId, setSelectedTravelerId] = useState<string>(() => {
    const found = travelers.find((t) => t.id === currentUser?.id);
    return found ? found.id : travelers[0]?.id || '1';
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<BaggageItem['category']>('Parque');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Confirmation & Editing states
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [editingItem, setEditingItem] = useState<BaggageItem | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    category: BaggageItem['category'];
    quantity: number;
    travelerId: string;
    packed: boolean;
  }>({
    name: '',
    category: 'Roupas',
    quantity: 1,
    travelerId: '',
    packed: false,
  });

  const handleStartEdit = (item: BaggageItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      category: item.category,
      quantity: item.quantity || 1,
      travelerId: item.travelerId,
      packed: item.packed,
    });
  };

  const [isSaving, setIsSaving] = useState(false);
  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingItem || !editForm.name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await updateBaggageItem({
        ...editingItem,
        name: editForm.name.trim(),
        category: editForm.category,
        quantity: Math.max(1, editForm.quantity || 1),
        travelerId: editForm.travelerId,
        packed: editForm.packed,
      });
      setEditingItem(null);
    } catch (err) {
      console.error('Erro ao salvar bagagem:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Weather & duration detected automatically from "Planeje a Data"
  const detectedTripInfo: DetectedTripWeatherInfo = useMemo(() => {
    return detectOrlandoWeatherFromTrip(settings.startDate, settings.durationDays || 7);
  }, [settings.startDate, settings.durationDays]);

  // Trip days strictly determined by trip planner settings (cannot be altered as free choice)
  const tripDays = detectedTripInfo.durationDays;

  // Weather conditions default to the detection from "Planeje a Data"
  const [selectedWeather, setSelectedWeather] = useState<WeatherCondition[]>(
    () => detectedTripInfo.recommendedWeather
  );

  // Automatically synchronize weather when trip dates/planner change
  useEffect(() => {
    setSelectedWeather(detectedTripInfo.recommendedWeather);
  }, [detectedTripInfo.recommendedWeather]);

  const restoreDetectedWeather = () => {
    setSelectedWeather(detectedTripInfo.recommendedWeather);
  };

  const toggleWeather = (condition: WeatherCondition) => {
    setSelectedWeather((prev) => {
      if (condition === 'cold') {
        const withoutHot = prev.filter((c) => c !== 'hot');
        const next = withoutHot.includes('cold') ? withoutHot.filter((c) => c !== 'cold') : [...withoutHot, 'cold'];
        return next.length > 0 ? next : ['cold'];
      }
      if (condition === 'hot') {
        const withoutCold = prev.filter((c) => c !== 'cold');
        const next = withoutCold.includes('hot') ? withoutCold.filter((c) => c !== 'hot') : [...withoutCold, 'hot'];
        return next.length > 0 ? next : ['hot'];
      }
      // Rainy can be combined with hot or cold
      const next = prev.includes('rainy') ? prev.filter((c) => c !== 'rainy') : [...prev, 'rainy'];
      return next.length > 0 ? next : ['hot'];
    });
  };

  const { handleBackdropClick: handleDeleteConfirmBackdrop } = useModalKeyEvents({
    isOpen: !!confirmDelete,
    onCancel: () => setConfirmDelete(null),
    onSave: () => {
      if (confirmDelete) {
        deleteBaggageItem(confirmDelete.id);
        setConfirmDelete(null);
      }
    },
  });

  const { handleBackdropClick: handleEditItemBackdrop } = useModalKeyEvents({
    isOpen: !!editingItem && !confirmDelete,
    onCancel: () => setEditingItem(null),
    onSave: () => handleSaveEdit(),
  });

  const categories: { label: BaggageItem['category']; icon: any }[] = [
    { label: 'Roupas', icon: Shirt },
    { label: 'Calçados', icon: Footprints },
    { label: 'Eletrônicos', icon: BatteryCharging },
    { label: 'Farmacinha', icon: Stethoscope },
    { label: 'Parque', icon: Sparkles },
    { label: 'Documentos', icon: FileCheck },
  ];

  // State for collapsible category groups
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);

  const toggleCategoryExpand = (catLabel: string) => {
    setCollapsedCategories((prev) =>
      prev.includes(catLabel) ? prev.filter((c) => c !== catLabel) : [...prev, catLabel]
    );
  };

  const expandAllCategories = () => setCollapsedCategories([]);
  const collapseAllCategories = () => setCollapsedCategories(categories.map((c) => c.label));

  // Active traveler object
  const activeTraveler = useMemo(() => {
    return travelers.find((t) => t.id === selectedTravelerId) || travelers[0] || {
      id: '1',
      name: 'Viajante',
      email: '',
      avatarColor: '#E5A93C',
      role: 'traveler' as const,
    };
  }, [travelers, selectedTravelerId]);

  // Detected gender based on active traveler name
  const detectedGender = useMemo(() => detectGenderByName(activeTraveler.name), [activeTraveler.name]);
  const [selectedGenderMap, setSelectedGenderMap] = useState<Record<string, Gender>>({});
  const activeGender = selectedGenderMap[selectedTravelerId] || detectedGender;

  // Detect if any booked accommodation indicates washing machine / laundry amenities or house/airbnb
  const detectedLaundryInfo = useMemo(() => {
    const matchingAcc = (accommodations || []).find((acc) => {
      const isHouseOrAirbnb = acc.type === 'house' || acc.type === 'airbnb';
      const hasAmenity = (acc.amenities || []).some((amenity) =>
        /lavadora|secadora|máquina|maquina|laundry|lavanderia/i.test(amenity)
      );
      const hasInNotes = /lavadora|secadora|máquina|maquina|laundry|lavanderia/i.test(acc.notes || '');
      return isHouseOrAirbnb || hasAmenity || hasInNotes;
    });
    return {
      detected: !!matchingAcc,
      accName: matchingAcc?.name,
      accType: matchingAcc?.type,
    };
  }, [accommodations]);

  // Washing machine state (defaults to true if detected in accommodations, or can be toggled by user)
  const [hasWashingMachine, setHasWashingMachine] = useState<boolean>(() => {
    return detectedLaundryInfo.detected;
  });

  // Automatically enable washing machine if detected from accommodations
  useEffect(() => {
    if (detectedLaundryInfo.detected) {
      setHasWashingMachine(true);
    }
  }, [detectedLaundryInfo.detected]);

  const calculationSummary = useMemo(() => {
    const D = Math.max(1, tripDays);
    const isHot = selectedWeather.includes('hot') || (!selectedWeather.includes('cold') && !selectedWeather.includes('hot'));
    const isCold = selectedWeather.includes('cold');
    const isRainy = selectedWeather.includes('rainy');

    // Se tem máquina de lavar, calcula roupas para ciclo rotativo de ~7 a 8 dias
    const clothesDays = hasWashingMachine ? Math.min(D, 8) : D;

    const tshirts = isHot ? clothesDays + 2 : clothesDays + 1;
    const under = hasWashingMachine ? clothesDays + 2 : D + 3;
    const socks = isRainy
      ? (hasWashingMachine ? clothesDays + 3 : D + 5)
      : (hasWashingMachine ? clothesDays + 2 : D + 3);
    const shorts = isHot
      ? Math.max(3, Math.ceil(clothesDays * 0.7))
      : isCold
      ? 2
      : Math.max(2, Math.ceil(clothesDays * 0.5));
    const pants = isCold ? Math.max(3, Math.ceil(clothesDays * 0.6)) : 2;
    const ponchos = isRainy ? Math.max(2, Math.ceil(D / 4) + 1) : 2;

    return {
      tshirts,
      under,
      socks,
      shorts,
      pants,
      ponchos,
      clothesDays,
      isReduced: hasWashingMachine && D > 8,
    };
  }, [tripDays, selectedWeather, activeGender, hasWashingMachine]);

  const handleApplyEssentials = () => {
    resetBaggageTemplateForTraveler(selectedTravelerId, {
      gender: activeGender,
      weather: selectedWeather,
      days: tripDays,
      hasWashingMachine,
    });
  };

  // Baggage items belonging STRICTLY to active traveler
  const activeTravelerItems = useMemo(() => {
    return baggageItems.filter((item) => item.travelerId === selectedTravelerId);
  }, [baggageItems, selectedTravelerId]);

  // Group active traveler items by category for list view
  const groupedItems = useMemo(() => {
    const groups: Record<string, BaggageItem[]> = {};
    categories.forEach((cat) => {
      groups[cat.label] = [];
    });
    activeTravelerItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [activeTravelerItems, categories]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    addBaggageItem({
      travelerId: selectedTravelerId,
      name: newItemName.trim(),
      category: newItemCategory,
      packed: false,
      quantity: newItemQty || 1,
    });
    setNewItemName('');
    setNewItemQty(1);
  };

  const filteredItems = activeTravelerItems.filter((item) => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  const activePackedCount = activeTravelerItems.filter((i) => i.packed).length;
  const activeTotalCount = activeTravelerItems.length;
  const activeProgressPercent = activeTotalCount > 0 ? Math.round((activePackedCount / activeTotalCount) * 100) : 0;
  const isAllActivePacked = activeTotalCount > 0 && activePackedCount === activeTotalCount;

  // Traveler stats calculation for bottom comparison
  const travelerBaggageStats = useMemo(() => {
    return travelers.map((traveler) => {
      const items = baggageItems.filter((i) => i.travelerId === traveler.id);
      const totalCount = items.length;
      const packedCount = items.filter((i) => i.packed).length;
      const percentage = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;
      const isFullyPacked = totalCount > 0 && packedCount === totalCount;

      // Category breakdown
      const categoryCounts: Record<string, { total: number; packed: number }> = {};
      items.forEach((item) => {
        if (!categoryCounts[item.category]) {
          categoryCounts[item.category] = { total: 0, packed: 0 };
        }
        categoryCounts[item.category].total++;
        if (item.packed) categoryCounts[item.category].packed++;
      });

      return {
        traveler,
        items,
        totalCount,
        packedCount,
        percentage,
        isFullyPacked,
        categoryCounts,
      };
    });
  }, [travelers, baggageItems]);

  const groupAverageBaggagePercent = useMemo(() => {
    if (travelerBaggageStats.length === 0) return 0;
    const sum = travelerBaggageStats.reduce((acc, curr) => acc + curr.percentage, 0);
    return Math.round(sum / travelerBaggageStats.length);
  }, [travelerBaggageStats]);

  const readyLuggageCount = useMemo(() => {
    return travelerBaggageStats.filter((t) => t.isFullyPacked).length;
  }, [travelerBaggageStats]);

  const scrollToTravelerSection = (travelerId: string) => {
    setSelectedTravelerId(travelerId);
    const el = document.getElementById('baggage-traveler-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37] mb-1">
              <Luggage className="w-4 h-4" />
              <span>Mala Individual & Personalizada</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
              Mala Inteligente por Viajante
            </h1>
            <p className="text-slate-200 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Cada participante tem sua própria mala isolada. Adicione itens pessoais, marque o que já foi guardado e acompanhe a prontidão da bagagem de toda a família.
            </p>
          </div>

          {/* Active Traveler Bag Progress Card */}
          <div className="bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/15 min-w-[240px] shrink-0 text-right">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-300 font-bold">
                Mala de {activeTraveler.name}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] font-bold border border-[#D4AF37]/40">
                {activeTraveler.id === currentUser?.id ? 'Sua Mala' : 'Viajante'}
              </span>
            </div>
            <div className="flex items-baseline justify-end gap-2 my-1">
              <span className="text-3xl font-serif font-black text-[#D4AF37]">
                {activePackedCount}/{activeTotalCount}
              </span>
              <span className="text-xs text-slate-300 font-medium">({activeProgressPercent}%)</span>
            </div>
            <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeProgressPercent === 100
                    ? 'bg-emerald-400'
                    : activeProgressPercent >= 60
                    ? 'bg-gradient-to-r from-[#D4AF37] to-emerald-400'
                    : 'bg-gradient-to-r from-amber-400 to-[#D4AF37]'
                }`}
                style={{ width: `${activeProgressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>{activePackedCount} guardados</span>
              <span className="text-[#D4AF37] font-semibold">
                {activeProgressPercent === 100 ? 'Mala Pronta! 🧳' : `${activeTotalCount - activePackedCount} pendentes`}
              </span>
            </div>
          </div>
        </div>

        {/* Quick KPI Strip inside Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Total de Itens
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37] block mt-1">
              {activeTotalCount} Itens
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Itens Guardados
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-300 block mt-1.5">
              {activePackedCount} guardados
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Prontidão da Mala
            </span>
            <span className="text-xs sm:text-sm font-bold text-white block mt-1.5">
              {activeProgressPercent}% Concluído
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Viajante Selecionado
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#D4AF37] block mt-1.5 truncate">
              {activeTraveler.name}
            </span>
          </div>
        </div>
      </div>

      {/* Traveler Selector Strip */}
      <div id="baggage-traveler-section" className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#1A2B4C] uppercase tracking-wider">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            <span>Selecione a Mala do Viajante para Organizar:</span>
          </div>

          {/* Quick Actions for Active Traveler */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <button
                type="button"
                onClick={expandAllCategories}
                className="font-semibold text-slate-700 hover:text-[#1A2B4C] transition-colors cursor-pointer"
              >
                Expandir Todos
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={collapseAllCategories}
                className="font-semibold text-slate-700 hover:text-[#1A2B4C] transition-colors cursor-pointer"
              >
                Recolher Todos
              </button>
            </div>

            {activeTotalCount > 0 && (
              <button
                type="button"
                onClick={() => toggleAllBaggageForTraveler(selectedTravelerId)}
                className="px-3 py-1 rounded-lg bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isAllActivePacked ? 'Desmarcar Todos' : 'Marcar Todos na Mala'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Traveler Selection Pills */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {travelerBaggageStats.map(({ traveler, percentage, packedCount, totalCount, isFullyPacked }) => {
            const isSelected = traveler.id === selectedTravelerId;
            const isSelf = traveler.id === currentUser?.id;

            return (
              <button
                key={traveler.id}
                id={`btn-select-baggage-traveler-${traveler.id}`}
                onClick={() => setSelectedTravelerId(traveler.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all cursor-pointer shrink-0 text-left ${
                  isSelected
                    ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-md ring-2 ring-[#D4AF37]/50'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-2xs shrink-0"
                  style={{ backgroundColor: traveler.avatarColor || '#3B82F6' }}
                >
                  {traveler.name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs truncate">{traveler.name}</span>
                    {isSelf && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          isSelected ? 'bg-[#D4AF37] text-[#1A2B4C]' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        Você
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] block font-mono ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {packedCount}/{totalCount} ({percentage}%)
                  </span>
                </div>

                {isFullyPacked ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                ) : (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full font-mono shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-[#D4AF37]'
                        : percentage >= 50
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {percentage}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add New Item Form (Assigned directly to selected traveler) */}
      <form
        onSubmit={handleAddItem}
        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center gap-3"
      >
        <div className="flex items-center gap-2 w-full sm:w-auto text-xs font-bold text-[#1A2B4C] shrink-0">
          <Luggage className="w-4 h-4 text-[#D4AF37]" />
          <span>Mala de {activeTraveler.name}:</span>
        </div>

        <input
          type="text"
          required
          placeholder={`Adicionar novo item para ${activeTraveler.name} (ex: Capa de chuva, Tênis reserva...)`}
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          className="flex-1 w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-[#1A2B4C] bg-slate-50 focus:bg-white"
        />

        <select
          value={newItemCategory}
          onChange={(e) => setNewItemCategory(e.target.value as any)}
          className="w-full sm:w-44 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-[#1A2B4C] bg-slate-50 cursor-pointer"
        >
          {categories.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <span className="text-[11px] text-slate-500 font-medium sm:hidden">Qtd:</span>
          <input
            type="number"
            min="1"
            max="50"
            value={newItemQty}
            onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
            placeholder="Qtd"
            className="w-full sm:w-20 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-center focus:ring-2 focus:ring-[#1A2B4C] bg-slate-50"
          />
        </div>

        <button
          type="submit"
          className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#253D6B] flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4 text-[#D4AF37]" />
          <span>Adicionar</span>
        </button>
      </form>

      {/* View Mode & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Left Side: Filter Tabs if in Grid mode, or Title if in List mode */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {viewMode === 'grid' ? (
            <>
              <button
                id="filter-baggage-all"
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-[#1A2B4C] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todos ({activeTravelerItems.length})
              </button>

              {categories.map(({ label, icon: Icon }) => {
                const count = activeTravelerItems.filter((i) => i.category === label).length;
                const packedCatCount = activeTravelerItems.filter((i) => i.category === label && i.packed).length;

                return (
                  <button
                    key={label}
                    id={`filter-baggage-${label.toLowerCase()}`}
                    onClick={() => setSelectedCategory(label)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      selectedCategory === label
                        ? 'bg-[#1A2B4C] text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 opacity-75" />
                    <span>{label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        selectedCategory === label ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {packedCatCount}/{count}
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-[#1A2B4C] uppercase tracking-wider py-1">
              <List className="w-4 h-4 text-[#D4AF37]" />
              <span>Lista de Itens Separada por Tipo ({activeTravelerItems.length})</span>
            </div>
          )}
        </div>

        {/* Right Side: View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-[#1A2B4C] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <List className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Lista por Tipo</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white text-[#1A2B4C] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Grade com Filtros</span>
          </button>
        </div>
      </div>

      {/* Baggage Items Checklist Content */}
      {activeTravelerItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
            <Luggage className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg text-[#1A2B4C] font-serif">
              A mala de {activeTraveler.name} está vazia
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Utilizamos as informações do <strong>Planeje a Data</strong> ({detectedTripInfo.primaryMonth.month}, {tripDays} dias) para carregar e dimensionar automaticamente a quantidade ideal de roupas e itens essenciais para Orlando.
            </p>
          </div>

          {/* Configuração Inteligente de Itens Essenciais */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-left space-y-4 max-w-xl mx-auto">
            {/* 1. Homem ou Mulher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                1. Perfil / Gênero
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-empty-gender-male"
                  onClick={() => setSelectedGenderMap((prev) => ({ ...prev, [selectedTravelerId]: 'male' }))}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeGender === 'male'
                      ? 'bg-[#1A2B4C] text-white shadow-xs ring-2 ring-[#D4AF37]/60'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm">👨</span>
                  <span>Masculino (Homem)</span>
                </button>
                <button
                  type="button"
                  id="btn-empty-gender-female"
                  onClick={() => setSelectedGenderMap((prev) => ({ ...prev, [selectedTravelerId]: 'female' }))}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeGender === 'female'
                      ? 'bg-[#1A2B4C] text-white shadow-xs ring-2 ring-[#D4AF37]/60'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm">👩</span>
                  <span>Feminino (Mulher)</span>
                </button>
              </div>
            </div>

            {/* 2. Clima Previsto (Quente, Frio, Chuvoso) - Sincronizado com Planeje a Data */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  2. Clima em Orlando (Sincronizado com Planeje a Data)
                </label>
                <button
                  type="button"
                  onClick={restoreDetectedWeather}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Restaurar clima previsto para a época da viagem"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar Previsão</span>
                </button>
              </div>

              {/* Banner Informativo do Clima Detectado da Viagem */}
              <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 text-xs text-blue-900 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-[11px] text-[#1A2B4C]">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Época da Viagem: {detectedTripInfo.spannedMonthsText}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-800">
                    🌡️ {detectedTripInfo.tempCelsius}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <strong>{detectedTripInfo.climateType}</strong> • Chuva: <strong>{detectedTripInfo.rainLevel}</strong> ({detectedTripInfo.rainDescription}).
                </p>
                <div className="text-[10px] text-blue-800 bg-white/70 px-2 py-1 rounded-lg border border-blue-100">
                  💡 {detectedTripInfo.weatherTip}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  id="btn-empty-weather-hot"
                  onClick={() => toggleWeather('hot')}
                  className={`px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                    selectedWeather.includes('hot')
                      ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-300'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5" />
                    <span>Quente</span>
                  </div>
                  <span className={`text-[10px] font-normal ${selectedWeather.includes('hot') ? 'text-amber-100' : 'text-slate-400'}`}>
                    Sol & Calor
                  </span>
                  {detectedTripInfo.recommendedWeather.includes('hot') && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-600/60 text-white mt-0.5">
                      Sugerido
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  id="btn-empty-weather-cold"
                  onClick={() => toggleWeather('cold')}
                  className={`px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                    selectedWeather.includes('cold')
                      ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-300'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>Frio</span>
                  </div>
                  <span className={`text-[10px] font-normal ${selectedWeather.includes('cold') ? 'text-sky-100' : 'text-slate-400'}`}>
                    Inverno / Noites
                  </span>
                  {detectedTripInfo.recommendedWeather.includes('cold') && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-sky-700/60 text-white mt-0.5">
                      Sugerido
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  id="btn-empty-weather-rainy"
                  onClick={() => toggleWeather('rainy')}
                  className={`px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                    selectedWeather.includes('rainy')
                      ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Chuvoso</span>
                  </div>
                  <span className={`text-[10px] font-normal ${selectedWeather.includes('rainy') ? 'text-blue-100' : 'text-slate-400'}`}>
                    Tempestades
                  </span>
                  {detectedTripInfo.recommendedWeather.includes('rainy') && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-blue-700/60 text-white mt-0.5">
                      Sugerido
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 3. Quantidade de dias da viagem - Fixo de Planeje a Data (não como escolha manual) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  3. Duração da Viagem (Definida no Planejamento)
                </label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  <span>Definido no Planeje a Data</span>
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2.5 text-xs text-slate-700 pl-1">
                  <div className="p-2 rounded-lg bg-amber-50 text-[#1A2B4C] border border-amber-200/50">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#1A2B4C] flex items-center gap-2">
                      <span>{tripDays} {tripDays === 1 ? 'Dia' : 'Dias'} de Viagem</span>
                      <span className="text-[11px] font-medium text-slate-500">
                        ({detectedTripInfo.startDateFormatted} até {detectedTripInfo.endDateFormatted})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Cálculo de roupas e itens dimensionado automaticamente para o seu roteiro completo.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-[#1A2B4C] bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    {tripDays} dias
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Opção de Máquina de Lavar na Acomodação (Lavanderia) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  4. Máquina de Lavar na Acomodação
                </label>
                {detectedLaundryInfo.detected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Detectado na sua Hospedagem</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-washing-machine-yes"
                  onClick={() => setHasWashingMachine(true)}
                  className={`p-3 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer relative ${
                    hasWashingMachine
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs ring-2 ring-emerald-400/40'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 ${hasWashingMachine ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <WashingMachine className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>Sim, tem máquina de lavar</span>
                        {hasWashingMachine && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-600 text-white font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Lavar roupas durante a viagem (ciclo de ~8 dias). <strong className="text-emerald-700 font-bold">Reduz roupas em ~50%</strong> e economiza espaço para compras.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-washing-machine-no"
                  onClick={() => setHasWashingMachine(false)}
                  className={`p-3 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer relative ${
                    !hasWashingMachine
                      ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-2xs ring-2 ring-slate-400/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 ${!hasWashingMachine ? 'bg-[#1A2B4C] text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Luggage className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>Não tem máquina de lavar</span>
                        {!hasWashingMachine && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#1A2B4C] text-white font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Trazer roupas completas para todos os {tripDays} dias de viagem. Mala mais pesada na ida.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {detectedLaundryInfo.detected && detectedLaundryInfo.accName && (
                <div className="text-[10px] text-emerald-800 bg-emerald-50/80 px-2.5 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                  <span className="text-xs">💡</span>
                  <span>
                    Hospedagem cadastrada: <strong>{detectedLaundryInfo.accName}</strong> ({detectedLaundryInfo.accType === 'house' ? 'Casa' : detectedLaundryInfo.accType === 'airbnb' ? 'Airbnb' : 'Lavadora inclusa'}).
                  </span>
                </div>
              )}
            </div>

            {/* Pré-visualização do dimensionamento automático de roupas */}
            <div className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
              hasWashingMachine
                ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
                : 'bg-amber-50/70 border-amber-200/60 text-amber-900'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <Sparkles className={`w-3.5 h-3.5 ${hasWashingMachine ? 'text-emerald-600' : 'text-[#D4AF37]'}`} />
                  <span>Roupas e itens dimensionados para {tripDays} dias ({detectedTripInfo.startDateFormatted} a {detectedTripInfo.endDateFormatted}):</span>
                </div>
                {hasWashingMachine && calculationSummary.isReduced && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-2xs">
                    🧺 Modo Lavanderia: Economia de ~50% no espaço da mala
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>👕 <strong>{calculationSummary.tshirts}</strong> Camisetas</span>
                  {hasWashingMachine && calculationSummary.isReduced && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-1 py-0.2 rounded">
                      Reduzido
                    </span>
                  )}
                </span>
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>🩲 <strong>{calculationSummary.under}</strong> Peças íntimas</span>
                  {hasWashingMachine && calculationSummary.isReduced && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-1 py-0.2 rounded">
                      Reduzido
                    </span>
                  )}
                </span>
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>🧦 <strong>{calculationSummary.socks}</strong> Pares de meias</span>
                  {hasWashingMachine && calculationSummary.isReduced && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-1 py-0.2 rounded">
                      Reduzido
                    </span>
                  )}
                </span>
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>🩳 <strong>{calculationSummary.shorts}</strong> Shorts/Bermudas</span>
                </span>
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>👖 <strong>{calculationSummary.pants}</strong> Calças</span>
                  {hasWashingMachine && calculationSummary.isReduced && calculationSummary.pants < 8 && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-1 py-0.2 rounded">
                      Reduzido
                    </span>
                  )}
                </span>
                <span className="bg-white/95 px-2.5 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between">
                  <span>🌧️ <strong>{calculationSummary.ponchos}</strong> Capas de chuva</span>
                </span>
              </div>
            </div>
          </div>

          <div>
            <button
              id="btn-load-essential-items"
              onClick={handleApplyEssentials}
              className="px-6 py-3 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#253D6B] inline-flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-[1.01]"
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <span>
                Carregar Itens Essenciais para {activeTraveler.name}
                {hasWashingMachine && ' (com Máquina de Lavar)'}
              </span>
            </button>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW: Grouped by category/type */
        <div className="space-y-6">
          {categories.map(({ label, icon: Icon }) => {
            const items = groupedItems[label] || [];
            if (items.length === 0) return null; // hide empty categories to keep list extremely clean and elegant

            const count = items.length;
            const packedCount = items.filter((i) => i.packed).length;
            const isAllPacked = count > 0 && packedCount === count;
            const isCollapsed = collapsedCategories.includes(label);

            return (
              <div key={label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs transition-all">
                {/* Category Group Header (Clickable to collapse/expand) */}
                <div
                  onClick={() => toggleCategoryExpand(label)}
                  className={`flex items-center justify-between cursor-pointer select-none group ${
                    isCollapsed ? 'pb-0' : 'border-b border-slate-100 pb-3 mb-4'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#1A2B4C]/5 text-[#1A2B4C] rounded-lg">
                      <Icon className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <h3 className="font-bold text-sm text-[#1A2B4C] group-hover:text-blue-900 transition-colors">{label}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border transition-all ${
                      isAllPacked
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200/60'
                    }`}>
                      {packedCount}/{count} {isAllPacked ? '• Tudo Pronto! ✨' : 'guardados'}
                    </span>
                    <div className="p-1 text-slate-400 group-hover:text-slate-600 transition-colors">
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Items list for this Category (using clean 1-column layout) */}
                {!isCollapsed && (
                  <div className="flex flex-col gap-2">
                    {items.map((item, iIdx) => (
                    <div
                      key={`${item.id}-${iIdx}`}
                      onClick={() => toggleBaggageItem(item.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        item.packed
                          ? 'bg-emerald-50/40 border-emerald-200/70 text-slate-500'
                          : 'bg-slate-50/30 border-slate-200/60 hover:border-slate-300 text-slate-700 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          id={`check-baggage-list-${item.id}`}
                          type="checkbox"
                          checked={item.packed}
                          onChange={() => {}} // handled by parent container onClick
                          className="w-4 h-4 rounded text-[#1A2B4C] focus:ring-[#1A2B4C] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <span className={`text-xs font-semibold block truncate ${item.packed ? 'line-through text-slate-400 font-medium' : 'text-[#1A2B4C]'}`}>
                            {item.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.packed && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full shrink-0">
                            Na mala
                          </span>
                        )}
                        <button
                          type="button"
                          id={`btn-edit-baggage-list-${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(item);
                          }}
                          className="text-slate-400 hover:text-[#1A2B4C] p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
                          title="Editar item da mala"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          id={`btn-delete-baggage-list-${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({ id: item.id, title: item.name });
                          }}
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                          title="Remover item da mala"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* GRID VIEW WITH FILTERS: Original UI */
        filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
              <Luggage className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-[#1A2B4C] font-serif">
                Nenhum item nesta categoria para {activeTraveler.name}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Não há itens correspondentes ao filtro "{selectedCategory}". Selecione outra aba ou adicione novos itens.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item, fIdx) => (
              <div
                key={`${item.id}-${fIdx}`}
                onClick={() => toggleBaggageItem(item.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  item.packed
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-[#D4AF37] text-slate-700 shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    id={`check-baggage-grid-${item.id}`}
                    type="checkbox"
                    checked={item.packed}
                    onChange={() => {}} // handled by wrapper onClick
                    className="w-4 h-4 rounded text-[#1A2B4C] focus:ring-[#1A2B4C] cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${item.packed ? 'line-through text-slate-400' : 'text-[#1A2B4C]'}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {item.category}
                      </span>
                      {item.packed && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.2 rounded">
                          Na Mala
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    id={`btn-edit-baggage-grid-${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(item);
                    }}
                    className="text-slate-400 hover:text-[#1A2B4C] p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Editar item da mala"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    id={`btn-delete-baggage-grid-${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ id: item.id, title: item.name });
                    }}
                    className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    title="Remover item da mala"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Essential Park Packing Tips */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-4 border-l-4 border-l-[#D4AF37]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-base font-bold text-[#1A2B4C] font-serif">
            Dicas Cruciais de Bagagem para Viagem a Orlando & Parques
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <p className="font-bold text-[#1A2B4C] mb-1">🔋 Power Banks & Eletrônicos na Mala de Mão</p>
            <p className="leading-relaxed text-slate-600">
              Regra da FAA/TSA: Baterias de lítio e carregadores portáteis <strong>não podem</strong> ir na bagagem despachada, apenas na mala de mão/mochila.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <p className="font-bold text-[#1A2B4C] mb-1">👟 Dois Tênis Amaciados</p>
            <p className="leading-relaxed text-slate-600">
              Você andará entre 15.000 e 25.000 passos por dia. Alterne os pares de calçados para não sobrecarregar os mesmos pontos de pressão dos pés.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <p className="font-bold text-[#1A2B4C] mb-1">⚖️ Deixe Espaço para Compras (Outlets)</p>
            <p className="leading-relaxed text-slate-600">
              Limite internacional padrão é 23kg por mala despachada. Leve uma mala mais vazia na ida ou planeje comprar uma mala extra em Orlando.
            </p>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          onClick={handleDeleteConfirmBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#1A2B4C] mb-2 font-serif">Confirmar Exclusão</h3>
              <p className="text-sm text-slate-600 mb-6">
                Deseja realmente excluir o item <strong>"{confirmDelete.title}"</strong> da mala? Esta ação não poderá ser desfeita.
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
                    deleteBaggageItem(confirmDelete.id);
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

      {/* Edit Baggage Item Modal */}
      {editingItem && (
        <div
          onClick={handleEditItemBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[90vh] max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Pencil className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Checklist & Bagagem • Edição de Item
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Editar Item da Mala
                  </h2>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-edit-baggage-modal"
                onClick={() => setEditingItem(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 sm:p-6 space-y-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {/* Nome do Item */}
                <div className="space-y-1.5">
                  <label htmlFor="edit-baggage-name" className="text-xs font-bold text-slate-700 block">
                    Nome / Descrição do Item *
                  </label>
                  <input
                    id="edit-baggage-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Camisetas confortáveis para os parques..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#D4AF37] focus:outline-hidden transition-all"
                    required
                    autoFocus
                  />
                </div>

                {/* Categoria */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Categoria
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {categories.map((cat) => {
                      const CatIcon = cat.icon;
                      const isSelected = editForm.category === cat.label;
                      return (
                        <button
                          key={cat.label}
                          type="button"
                          id={`btn-edit-category-${cat.label}`}
                          onClick={() => setEditForm((prev) => ({ ...prev, category: cat.label }))}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'bg-[#1A2B4C] text-white border-[#1A2B4C] shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <CatIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                          <span className="text-[11px] font-bold truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quantidade e Viajante */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* Quantidade */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-baggage-qty" className="text-xs font-bold text-slate-700 block">
                      Quantidade
                    </label>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
                      <button
                        type="button"
                        id="btn-edit-qty-minus"
                        onClick={() => setEditForm((prev) => ({ ...prev, quantity: Math.max(1, (prev.quantity || 1) - 1) }))}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        id="edit-baggage-qty"
                        type="number"
                        min="1"
                        max="99"
                        value={editForm.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setEditForm((prev) => ({ ...prev, quantity: isNaN(val) ? 1 : Math.max(1, val) }));
                        }}
                        className="w-full text-center bg-transparent border-0 text-xs font-bold font-mono text-[#1A2B4C] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        id="btn-edit-qty-plus"
                        onClick={() => setEditForm((prev) => ({ ...prev, quantity: Math.min(99, (prev.quantity || 1) + 1) }))}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Viajante Responsável */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-baggage-traveler" className="text-xs font-bold text-slate-700 block">
                      Mala do Viajante
                    </label>
                    <select
                      id="edit-baggage-traveler"
                      value={editForm.travelerId}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, travelerId: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#D4AF37] focus:outline-hidden transition-all cursor-pointer"
                    >
                      {travelers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status: Já guardado na mala */}
                <div
                  onClick={() => setEditForm((prev) => ({ ...prev, packed: !prev.packed }))}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                    editForm.packed
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    id="edit-baggage-packed"
                    type="checkbox"
                    checked={editForm.packed}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, packed: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold block">
                      {editForm.packed ? 'Já guardado na mala ✨' : 'Ainda não guardado'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {editForm.packed ? 'O item será contabilizado como pronto para o checklist' : 'Marque quando embalar este item na mala'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  id="btn-cancel-edit-baggage"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  id="btn-save-edit-baggage"
                  className="px-5 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#253D6B] inline-flex items-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
                  ) : (
                    <Check className="w-4 h-4 text-[#D4AF37]" />
                  )}
                  <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

