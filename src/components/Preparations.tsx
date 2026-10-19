import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  Users,
  UserCheck,
  Plane,
  CreditCard,
  Smartphone,
  Car,
  FileCheck,
  FileCheck2,
  Award,
  Check,
  CheckCheck,
  ArrowRight,
  TrendingUp,
  Clock,
  Trash2,
  Plus,
  X,
  Pencil
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { ChecklistSubItem, PreparationDocument, Traveler } from '../types';
import { useConfirmationKeyboard } from '../hooks/useConfirmationKeyboard';

export const Preparations: React.FC = () => {
  const { 
    prepDocuments, 
    toggleDocSubItem, 
    toggleDocCompleted, 
    toggleAllPrepForTraveler,
    deletePrepDocument, 
    updatePrepDocument,
    deletePrepTip,
    addPrepDocument,
    addPrepSubItem,
    deletePrepSubItem,
    updatePrepSubItem,
    settings, 
    currentUser 
  } = usePlanner();
  const travelers = settings.travelers || [];

  // Active traveler being viewed/edited
  const [selectedTravelerId, setSelectedTravelerId] = useState<string>(() => {
    const found = travelers.find((t) => t.id === currentUser?.id);
    return found ? found.id : travelers[0]?.id || '1';
  });

  const [expandedDocIds, setExpandedDocIds] = useState<string[]>([]);

  // Keep selected traveler valid if list changes
  useEffect(() => {
    if (travelers.length > 0 && !travelers.some((t) => t.id === selectedTravelerId)) {
      const found = travelers.find((t) => t.id === currentUser?.id);
      setSelectedTravelerId(found ? found.id : travelers[0].id);
    }
  }, [travelers, selectedTravelerId, currentUser]);

  // Keep expanded documents initialized
  useEffect(() => {
    const currentTravelerDocIds = prepDocuments
      .filter((d) => !d.travelerId || d.travelerId === selectedTravelerId)
      .map((d) => d.id);
    if (currentTravelerDocIds.length > 0 && expandedDocIds.length === 0) {
      setExpandedDocIds(currentTravelerDocIds);
    }
  }, [prepDocuments, selectedTravelerId]);

  // State for adding new items
  const [showAddDocForm, setShowAddDocForm] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocSubtitle, setNewDocSubtitle] = useState('');
  const [newSubItemTitles, setNewSubItemTitles] = useState<Record<string, string>>({});
  
  // Editing states for subitems
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubValue, setEditSubValue] = useState('');

  // Editing states for documents
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocSubtitle, setEditDocSubtitle] = useState('');

  // Confirmation states
  const [confirmDelete, setConfirmDelete] = useState<{ 
    type: 'doc' | 'sub' | 'tip'; 
    docId: string; 
    subId?: string; 
    tipIndex?: number;
    title: string 
  } | null>(null);

  useConfirmationKeyboard({
    isOpen: !!confirmDelete,
    onConfirm: () => {
      if (confirmDelete) {
        if (confirmDelete.type === 'doc') {
          deletePrepDocument(confirmDelete.docId);
        } else if (confirmDelete.type === 'sub' && confirmDelete.subId) {
          deletePrepSubItem(confirmDelete.docId, confirmDelete.subId);
        } else if (confirmDelete.type === 'tip' && confirmDelete.tipIndex !== undefined) {
          deletePrepTip(confirmDelete.docId, confirmDelete.tipIndex);
        }
        setConfirmDelete(null);
      }
    },
    onCancel: () => setConfirmDelete(null),
  });

  // Current selected traveler object
  const activeTraveler = useMemo(() => {
    return travelers.find((t) => t.id === selectedTravelerId) || travelers[0] || {
      id: '1',
      name: 'Viajante',
      email: '',
      avatarColor: '#E5A93C',
      role: 'traveler' as const,
    };
  }, [travelers, selectedTravelerId]);

  const toggleExpand = (id: string) => {
    if (expandedDocIds.includes(id)) {
      setExpandedDocIds(expandedDocIds.filter((docId) => docId !== id));
    } else {
      setExpandedDocIds([...expandedDocIds, id]);
    }
  };

  const expandAll = () => setExpandedDocIds(prepDocuments.filter(d => !d.travelerId || d.travelerId === selectedTravelerId).map((d) => d.id));
  const collapseAll = () => setExpandedDocIds([]);

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    addPrepDocument({
      title: newDocTitle,
      subtitle: newDocSubtitle || 'Documento personalizado',
      travelerId: selectedTravelerId,
      status: 'Pendente',
      completed: false,
      completedByTravelers: {},
      subItems: [],
      tips: [],
    });

    setNewDocTitle('');
    setNewDocSubtitle('');
    setShowAddDocForm(false);
  };

  const handleAddSubItem = (docId: string) => {
    const title = newSubItemTitles[docId];
    if (!title?.trim()) return;

    addPrepSubItem(docId, title.trim());
    setNewSubItemTitles(prev => ({ ...prev, [docId]: '' }));
  };

  const handleStartEdit = (sub: ChecklistSubItem) => {
    setEditingSubId(sub.id);
    setEditSubValue(sub.title);
  };

  const handleSaveEdit = (docId: string, subId: string) => {
    if (editSubValue.trim()) {
      updatePrepSubItem(docId, subId, editSubValue.trim());
    }
    setEditingSubId(null);
  };
  
  const handleStartEditDoc = (doc: PreparationDocument) => {
    setEditingDocId(doc.id);
    setEditDocTitle(doc.title);
    setEditDocSubtitle(doc.subtitle);
  };

  const handleSaveEditDoc = (docId: string) => {
    if (editDocTitle.trim()) {
      updatePrepDocument(docId, {
        title: editDocTitle.trim(),
        subtitle: editDocSubtitle.trim()
      });
    }
    setEditingDocId(null);
  };

  // Check if a subitem is completed for a specific traveler
  const isSubCompletedForTraveler = (sub: ChecklistSubItem, travelerId: string): boolean => {
    return Boolean(sub.completedByTravelers?.[travelerId]);
  };

  // Check if a document is completed for a specific traveler
  const isDocCompletedForTraveler = (doc: PreparationDocument, travelerId: string): boolean => {
    if (doc.subItems && doc.subItems.length > 0) {
      return doc.subItems.every((s) => isSubCompletedForTraveler(s, travelerId));
    }
    return Boolean(doc.completedByTravelers?.[travelerId]);
  };

  // Get status string for a doc for a specific traveler
  const getDocStatusForTraveler = (doc: PreparationDocument, travelerId: string): 'Concluído' | 'Em andamento' | 'Pendente' => {
    if (!doc.subItems || doc.subItems.length === 0) {
      return isDocCompletedForTraveler(doc, travelerId) ? 'Concluído' : 'Pendente';
    }
    const completedCount = doc.subItems.filter((s) => isSubCompletedForTraveler(s, travelerId)).length;
    if (completedCount === doc.subItems.length) return 'Concluído';
    if (completedCount > 0) return 'Em andamento';
    return 'Pendente';
  };

  // Total checklist items across all documents
  const totalSubitemsCount = useMemo(() => {
    return prepDocuments.reduce((acc, doc) => acc + (doc.subItems?.length || 1), 0);
  }, [prepDocuments]);

  const getDocIcon = (title: string) => {
    if (title.includes('Passaporte')) return '🛂';
    if (title.includes('Visto')) return '🇺🇸';
    if (title.includes('CNH')) return '🚗';
    if (title.includes('Seguro')) return '🏥';
    if (title.includes('Disney')) return '🏰';
    if (title.includes('Contas') || title.includes('Câmbio')) return '💳';
    return '📄';
  };

  // Traveler stats calculation
  const travelerStats = useMemo(() => {
    return travelers.map((traveler) => {
      let completedCount = 0;
      let totalCount = 0;
      const docStatuses: { docId: string; title: string; completed: boolean; icon: string }[] = [];

      // Filter documents specifically for this traveler or shared documents
      const travelerDocs = prepDocuments.filter(d => !d.travelerId || d.travelerId === traveler.id);

      travelerDocs.forEach((doc) => {
        const isDocDone = isDocCompletedForTraveler(doc, traveler.id);
        const subCount = doc.subItems?.length || 1;
        totalCount += subCount;

        if (doc.subItems && doc.subItems.length > 0) {
          doc.subItems.forEach((sub) => {
            if (isSubCompletedForTraveler(sub, traveler.id)) {
              completedCount++;
            }
          });
        } else if (isDocDone) {
          completedCount++;
        }

        docStatuses.push({
          docId: doc.id,
          title: doc.title,
          completed: isDocDone,
          icon: getDocIcon(doc.title),
        });
      });

      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      return {
        traveler,
        completedCount,
        totalCount,
        percentage,
        isFullyReady: percentage === 100,
        docStatuses,
      };
    });
  }, [travelers, prepDocuments]);

  // Active traveler completion percentage
  const activeTravelerStat = useMemo(() => {
    return travelerStats.find((s) => s.traveler.id === selectedTravelerId) || {
      completedCount: 0,
      totalCount: totalSubitemsCount,
      percentage: 0,
      isFullyReady: false,
      docStatuses: [],
    };
  }, [travelerStats, selectedTravelerId, totalSubitemsCount]);

  // Overall group completion average
  const groupAveragePercent = useMemo(() => {
    if (travelerStats.length === 0) return 0;
    const sum = travelerStats.reduce((acc, curr) => acc + curr.percentage, 0);
    return Math.round(sum / travelerStats.length);
  }, [travelerStats]);

  const readyTravelersCount = useMemo(() => {
    return travelerStats.filter((t) => t.isFullyReady).length;
  }, [travelerStats]);

  const scrollToTravelerSection = (travelerId: string) => {
    setSelectedTravelerId(travelerId);
    const element = document.getElementById('traveler-checklist-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner with Active Traveler Progress */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37] mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Conformidade Individual & Por Viajante</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
              Preparativos Essenciais & Documentos
            </h1>
            <p className="text-slate-200 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Checklist individualizado por viajante. Cada integrante gerencia seus passaportes, vistos, seguros e carteiras digitais com acompanhamento do grupo.
            </p>
          </div>

          {/* Active Traveler Progress Widget */}
          <div className="bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/15 min-w-[240px] shrink-0 text-right">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-300 font-bold">
                {activeTraveler.name}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] font-bold border border-[#D4AF37]/40">
                {activeTraveler.id === currentUser?.id ? 'Seu Checklist' : 'Viajante'}
              </span>
            </div>
            <div className="flex items-baseline justify-end gap-2 my-1">
              <span className="text-3xl font-serif font-black text-[#D4AF37]">
                {activeTravelerStat.percentage}%
              </span>
              <span className="text-xs text-slate-300 font-medium">Pronto</span>
            </div>
            <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeTravelerStat.percentage === 100
                    ? 'bg-emerald-400'
                    : activeTravelerStat.percentage >= 60
                    ? 'bg-gradient-to-r from-[#D4AF37] to-emerald-400'
                    : 'bg-gradient-to-r from-amber-400 to-[#D4AF37]'
                }`}
                style={{ width: `${activeTravelerStat.percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>{activeTravelerStat.completedCount} de {activeTravelerStat.totalCount} itens validados</span>
              <span className="text-[#D4AF37] font-semibold">
                {activeTravelerStat.percentage === 100 ? '100% Apto ✈️' : 'Pendente'}
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
              {activeTravelerStat.totalCount} Itens
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Validados
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-300 block mt-1.5">
              {activeTravelerStat.completedCount} validados
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Status do Viajante
            </span>
            <span className="text-xs sm:text-sm font-bold text-white block mt-1.5">
              {activeTravelerStat.percentage}% Concluído
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Viajante Ativo
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#D4AF37] block mt-1.5 truncate">
              {activeTraveler.name}
            </span>
          </div>
        </div>
      </div>

      {/* Traveler Selector Strip */}
      <div id="traveler-checklist-section" className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#1A2B4C] uppercase tracking-wider">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            <span>Selecione o Viajante para Preencher Documentos:</span>
          </div>

          {/* Quick Actions for Active Traveler */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <button
                type="button"
                onClick={expandAll}
                className="font-semibold text-slate-700 hover:text-[#1A2B4C] transition-colors cursor-pointer"
              >
                Expandir Todos
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="font-semibold text-slate-700 hover:text-[#1A2B4C] transition-colors cursor-pointer"
              >
                Recolher Todos
              </button>
            </div>

            {totalSubitemsCount > 0 && (
              <button
                type="button"
                onClick={() => toggleAllPrepForTraveler(selectedTravelerId)}
                className="px-3 py-1 rounded-lg bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{activeTravelerStat.percentage === 100 ? 'Desmarcar Todos' : 'Marcar Todos como Prontos'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Traveler Selection Pills */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {travelerStats.map(({ traveler, percentage, completedCount, totalCount }) => {
            const isSelected = traveler.id === selectedTravelerId;
            const isSelf = traveler.id === currentUser?.id;

            return (
              <button
                key={traveler.id}
                id={`btn-select-traveler-${traveler.id}`}
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
                    {completedCount}/{totalCount} ({percentage}%)
                  </span>
                </div>

                {percentage === 100 ? (
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

      {/* Add New Requirement Form (Assigned directly to selected traveler in separate frame) */}
      <form
        onSubmit={handleAddDocument}
        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center gap-3"
      >
        <div className="flex items-center gap-2 w-full sm:w-auto text-xs font-bold text-[#1A2B4C] shrink-0">
          <FileCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>Documentos de {activeTraveler.name}:</span>
        </div>

        <input
          type="text"
          required
          placeholder={`Adicionar novo requisito para ${activeTraveler.name} (ex: Visto Americano, Seguro Viagem, Chip eSIM...)`}
          value={newDocTitle}
          onChange={(e) => setNewDocTitle(e.target.value)}
          className="flex-1 w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-[#1A2B4C] bg-slate-50 focus:bg-white"
        />

        <input
          type="text"
          placeholder="Subtítulo ou Categoria (opcional)"
          value={newDocSubtitle}
          onChange={(e) => setNewDocSubtitle(e.target.value)}
          className="w-full sm:w-56 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-[#1A2B4C] bg-slate-50 focus:bg-white"
        />

        <button
          type="submit"
          className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#1A2B4C] text-[#D4AF37] font-bold text-xs hover:bg-[#253D6B] transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar</span>
        </button>
      </form>

      {/* Documents Accordion List for Selected Traveler */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-serif text-[#1A2B4C]">
              Documentos & Requisitos de {activeTraveler.name}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {prepDocuments.filter(d => !d.travelerId || d.travelerId === selectedTravelerId).length} Categorias
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Clique nos itens para marcar como concluído para <strong>{activeTraveler.name}</strong>
          </span>
        </div>

        {prepDocuments.filter(d => !d.travelerId || d.travelerId === selectedTravelerId).map((doc, dIdx) => {
          const isExpanded = expandedDocIds.includes(doc.id);
          const icon = getDocIcon(doc.title);
          const isDocDone = isDocCompletedForTraveler(doc, selectedTravelerId);
          const status = getDocStatusForTraveler(doc, selectedTravelerId);
          const completedSubsCount = (doc.subItems || []).filter((s) =>
            isSubCompletedForTraveler(s, selectedTravelerId)
          ).length;
          const totalSubs = doc.subItems?.length || 0;

          return (
            <div
              key={`${doc.id}-${dIdx}`}
              className={`bg-white rounded-2xl border shadow-2xs overflow-hidden transition-all ${
                isDocDone ? 'border-emerald-200 hover:border-emerald-300' : 'border-slate-200 hover:border-[#D4AF37]'
              }`}
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleExpand(doc.id)}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-2xl p-2.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs shrink-0">
                    {icon}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingDocId === doc.id ? (
                        <div className="flex flex-col gap-2 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editDocTitle}
                            onChange={(e) => setEditDocTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditDoc(doc.id);
                              if (e.key === 'Escape') setEditingDocId(null);
                            }}
                            autoFocus
                            placeholder="Título do documento"
                            className="w-full px-2 py-1 text-sm font-bold border border-[#D4AF37] rounded focus:ring-1 focus:ring-[#D4AF37] outline-none"
                          />
                          <input
                            type="text"
                            value={editDocSubtitle}
                            onChange={(e) => setEditDocSubtitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditDoc(doc.id);
                              if (e.key === 'Escape') setEditingDocId(null);
                            }}
                            placeholder="Subtítulo ou descrição curta"
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#D4AF37] outline-none"
                          />
                          <div className="flex gap-1 mt-1">
                            <button
                              onClick={() => handleSaveEditDoc(doc.id)}
                              className="px-2 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200 transition-colors"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => setEditingDocId(null)}
                              className="px-2 py-1 text-[10px] font-bold bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-bold text-base text-[#1A2B4C] font-serif">
                            {doc.title}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              status === 'Concluído'
                                ? 'bg-emerald-100 text-emerald-800'
                                : status === 'Em andamento'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {status}
                          </span>
                        </>
                      )}
                    </div>
                    {editingDocId !== doc.id && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{doc.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-xs font-semibold text-slate-500">
                    {completedSubsCount}/{totalSubs} subitens
                  </span>

                  <button
                    type="button"
                    id={`btn-toggle-doc-${doc.id}-${selectedTravelerId}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDocCompleted(doc.id, selectedTravelerId);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                      isDocDone
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isDocDone ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{isDocDone ? 'Validado' : `Validar para ${activeTraveler.name}`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditDoc(doc);
                    }}
                    className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 hover:border-slate-300 transition-all cursor-pointer"
                    title="Editar Documento"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    id={`btn-delete-doc-${doc.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({
                        type: 'doc',
                        docId: doc.id,
                        title: doc.title
                      });
                    }}
                    className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 hover:border-red-200 transition-all cursor-pointer"
                    title="Excluir Documento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="text-slate-400 p-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Sub-checklists & Tips Expanded Section */}
              {isExpanded && (
                <div className="p-5 border-t border-slate-100 space-y-4 bg-slate-50/50">
                  {/* Checklist Subitems */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Checklist Obrigatório ({activeTraveler.name})
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {completedSubsCount} de {totalSubs} concluídos
                      </span>
                    </div>

                    {doc.subItems.map((sub, sIdx) => {
                      const isCompletedForThisTraveler = isSubCompletedForTraveler(sub, selectedTravelerId);

                      return (
                        <div
                          key={`${sub.id}-${sIdx}`}
                          id={`subitem-row-${sub.id}-${selectedTravelerId}`}
                          onClick={() => toggleDocSubItem(doc.id, sub.id, selectedTravelerId)}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none group ${
                            isCompletedForThisTraveler
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            id={`check-subitem-${sub.id}-${selectedTravelerId}`}
                            type="checkbox"
                            checked={isCompletedForThisTraveler}
                            onChange={() => {
                              toggleDocSubItem(doc.id, sub.id, selectedTravelerId);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 w-4 h-4 rounded text-[#1A2B4C] focus:ring-[#1A2B4C] cursor-pointer shrink-0"
                          />
                          <div className="flex-1">
                            {editingSubId === sub.id ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editSubValue}
                                  onChange={(e) => setEditSubValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(doc.id, sub.id);
                                    if (e.key === 'Escape') setEditingSubId(null);
                                  }}
                                  autoFocus
                                  className="w-full px-2 py-1 text-xs border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                                />
                                <button
                                  onClick={() => handleSaveEdit(doc.id, sub.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingSubId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`text-xs leading-relaxed block ${
                                  isCompletedForThisTraveler
                                    ? 'line-through text-slate-400 font-medium'
                                    : 'font-medium text-slate-800'
                                }`}
                              >
                                {sub.title}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(sub);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Editar item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({
                                  type: 'sub',
                                  docId: doc.id,
                                  subId: sub.id,
                                  title: sub.title
                                });
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Remover subitem"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isCompletedForThisTraveler && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                              Pronto
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Subitem Form */}
                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubItemTitles[doc.id] || ''}
                        onChange={(e) => setNewSubItemTitles(prev => ({ ...prev, [doc.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubItem(doc.id);
                          }
                        }}
                        placeholder="Adicionar novo item ao checklist..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 outline-none bg-white/50"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubItem(doc.id)}
                        disabled={!newSubItemTitles[doc.id]?.trim()}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Tips Box */}
                  {doc.tips.length > 0 && (
                    <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5 border-l-4 border-l-[#D4AF37] shadow-2xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A2B4C] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Dicas de Especialista KingdomCompass
                      </span>
                      <ul className="space-y-1 text-xs text-slate-600 list-none p-0">
                        {doc.tips.map((tip, idx) => (
                          <li key={idx} className="leading-relaxed flex items-start gap-2 group/tip">
                            <div className="w-1 h-1 rounded-full bg-[#D4AF37] mt-2 shrink-0" />
                            <span className="flex-1">{tip}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDelete({
                                  type: 'tip',
                                  docId: doc.id,
                                  tipIndex: idx,
                                  title: tip.length > 30 ? tip.substring(0, 30) + '...' : tip
                                });
                              }}
                              className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover/tip:opacity-100"
                              title="Remover dica"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
                Deseja realmente excluir <strong>"{confirmDelete.title}"</strong>? Esta ação não poderá ser desfeita.
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
                    if (confirmDelete.type === 'doc') {
                      deletePrepDocument(confirmDelete.docId);
                    } else if (confirmDelete.type === 'sub' && confirmDelete.subId) {
                      deletePrepSubItem(confirmDelete.docId, confirmDelete.subId);
                    } else if (confirmDelete.type === 'tip' && confirmDelete.tipIndex !== undefined) {
                      deletePrepTip(confirmDelete.docId, confirmDelete.tipIndex);
                    }
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

    </div>
  );
};
