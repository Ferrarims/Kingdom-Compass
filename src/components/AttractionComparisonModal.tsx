import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  Users,
  Flame,
  Trophy,
  ArrowUpDown,
  Filter,
  Check,
  ChevronRight,
  Info,
  Percent,
  Scale,
  Copy,
} from 'lucide-react';
import { Traveler, ParkInfo, TravelerAttractionSelection } from '../types';
import { SupabaseService } from '../services/supabaseService';
import { usePlanner } from '../context/PlannerContext';
import { normalizeAttractionName, isAttractionMatch } from '../utils/attractionUtils';
import { useModalKeyboard } from '../hooks/useModalKeyboard';

interface AttractionComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelers: Traveler[];
  parksData: ParkInfo[];
  attractionSelections: Record<string, boolean>;
  onToggleSelection: (travelerId: string, parkId: string, attractionName: string) => void;
  tripId?: string;
}

export const AttractionComparisonModal: React.FC<AttractionComparisonModalProps> = ({
  isOpen,
  onClose,
  travelers,
  parksData,
  attractionSelections: propSelections,
  onToggleSelection,
  tripId: propTripId,
}) => {
  const { activeTripId, settings } = usePlanner();
  const effectiveTripId = propTripId || activeTripId || settings?.id || '';

  const [activeTab, setActiveTab] = useState<'parks_ranking' | 'by_traveler' | 'attractions_ranking' | 'matrix'>('parks_ranking');
  const [selectedParkFilter, setSelectedParkFilter] = useState<string>('all');
  const [parkSortBy, setParkSortBy] = useState<'weighted_score' | 'votes' | 'adhesion' | 'attractions'>('weighted_score');

  // Supabase direct data state
  const [dbSelections, setDbSelections] = useState<TravelerAttractionSelection[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(false);
  const [dbLoaded, setDbLoaded] = useState<boolean>(false);
  const [localSelections, setLocalSelections] = useState<Record<string, boolean>>(propSelections || {});

  // Load from Supabase directly whenever the modal opens
  const loadDbSelections = useCallback(async () => {
    if (!effectiveTripId) return;
    setIsLoadingDb(true);
    try {
      const selections = await SupabaseService.fetchTravelerAttractionSelections(effectiveTripId);
      setDbSelections(selections);
      setDbLoaded(true);

      // Build updated local map from DB selections
      const updatedMap: Record<string, boolean> = {};
      selections.forEach((s) => {
        if (s.selected && s.traveler_id && s.park_id && s.attraction_name) {
          updatedMap[`${s.traveler_id}::${s.park_id}::${s.attraction_name}`] = true;
          const norm = normalizeAttractionName(s.attraction_name);
          if (norm && norm !== s.attraction_name) {
            updatedMap[`${s.traveler_id}::${s.park_id}::${norm}`] = true;
          }
        }
      });

      setLocalSelections((prev) => ({
        ...prev,
        ...updatedMap,
      }));
    } catch (e) {
      console.warn('Could not load direct selections from Supabase:', e);
    } finally {
      setIsLoadingDb(false);
    }
  }, [effectiveTripId]);

  useEffect(() => {
    if (isOpen) {
      setLocalSelections((prev) => ({ ...prev, ...propSelections }));
      loadDbSelections();
    }
  }, [isOpen, effectiveTripId, loadDbSelections, propSelections]);

  useModalKeyboard({
    isOpen,
    onClose,
  });

  // Traveler matching helper (supports UUID or matching by name if IDs vary)
  const isTravelerMatch = useCallback(
    (targetTravelerId: string, candidateTravelerId: string) => {
      if (targetTravelerId === candidateTravelerId) return true;
      const t1 = travelers.find((t) => t.id === targetTravelerId);
      const t2 = travelers.find((t) => t.id === candidateTravelerId);
      if (t1 && t2 && t1.name.trim().toLowerCase() === t2.name.trim().toLowerCase()) {
        return true;
      }
      return false;
    },
    [travelers]
  );

  // Helper to check if an attraction is selected
  const isSelected = useCallback(
    (travelerId: string, parkId: string, attractionName: string) => {
      const normAtt = normalizeAttractionName(attractionName).toLowerCase();

      // 1. Check in DB records first if loaded
      if (dbSelections.length > 0) {
        const found = dbSelections.some(
          (s) =>
            s.selected &&
            s.park_id === parkId &&
            isTravelerMatch(travelerId, s.traveler_id) &&
            (s.attraction_name === attractionName ||
              normalizeAttractionName(s.attraction_name).toLowerCase() === normAtt)
        );
        if (found) return true;
      }

      // 2. Check local selections map
      if (isAttractionMatch(localSelections, travelerId, parkId, attractionName)) {
        return true;
      }

      // 3. Fallback to prop selections
      if (isAttractionMatch(propSelections, travelerId, parkId, attractionName)) {
        return true;
      }

      return false;
    },
    [dbSelections, isTravelerMatch, localSelections, propSelections]
  );

  // Toggle selection handler (saves directly to Supabase and calls parent handler)
  const handleToggleSelection = async (travelerId: string, parkId: string, attractionName: string) => {
    const currentlySelected = isSelected(travelerId, parkId, attractionName);
    const newSelected = !currentlySelected;
    const normAtt = normalizeAttractionName(attractionName);

    // Update local state immediately for instant response
    setLocalSelections((prev) => {
      const next = { ...prev };
      const keyExact = `${travelerId}::${parkId}::${attractionName}`;
      const keyNorm = `${travelerId}::${parkId}::${normAtt}`;
      if (newSelected) {
        next[keyExact] = true;
        next[keyNorm] = true;
      } else {
        delete next[keyExact];
        delete next[keyNorm];
      }
      return next;
    });

    // Update dbSelections state
    setDbSelections((prev) => {
      if (!newSelected) {
        return prev.filter(
          (s) =>
            !(
              isTravelerMatch(travelerId, s.traveler_id) &&
              s.park_id === parkId &&
              (s.attraction_name === attractionName ||
                normalizeAttractionName(s.attraction_name).toLowerCase() === normAtt.toLowerCase())
            )
        );
      } else {
        const existingIdx = prev.findIndex(
          (s) =>
            isTravelerMatch(travelerId, s.traveler_id) &&
            s.park_id === parkId &&
            (s.attraction_name === attractionName ||
              normalizeAttractionName(s.attraction_name).toLowerCase() === normAtt.toLowerCase())
        );
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = { ...copy[existingIdx], selected: true };
          return copy;
        } else {
          return [
            ...prev,
            {
              id: `temp-${Date.now()}`,
              trip_id: effectiveTripId,
              traveler_id: travelerId,
              park_id: parkId,
              attraction_name: normAtt || attractionName,
              selected: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
        }
      }
    });

    // Notify parent
    onToggleSelection(travelerId, parkId, normAtt || attractionName);

    // Save directly to Supabase
    if (effectiveTripId) {
      await SupabaseService.saveAttractionSelection(
        effectiveTripId,
        travelerId,
        parkId,
        normAtt || attractionName,
        newSelected
      );
    }
  };

  // Build the complete list of unique parks (including any present in the DB selections)
  const allParks = useMemo(() => {
    const list: ParkInfo[] = [...parksData];
    const existingIds = new Set(parksData.map((p) => p.id));

    // Check if dbSelections has any park_id not present in parksData
    dbSelections.forEach((s) => {
      if (s.park_id && !existingIds.has(s.park_id)) {
        existingIds.add(s.park_id);
        const nameFormatted = s.park_id
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        list.push({
          id: s.park_id,
          name: nameFormatted,
          resort: 'Outros Parques & Experiências',
          icon: '🎡',
          parkType: 'Temático',
          description: `Parque cadastrado ${nameFormatted}`,
          mustDoAttractions: [],
          bestDining: [],
          proTips: [],
        });
      }
    });

    return list;
  }, [parksData, dbSelections]);

  // Build the full set of attractions for each park combining DB records + park guide data
  const parkAttractionsMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    allParks.forEach((park) => {
      const attsSet = new Set<string>();

      // 1. All attractions from DB for this park
      dbSelections
        .filter((s) => s.park_id === park.id && s.selected)
        .forEach((s) => {
          const cleanName = normalizeAttractionName(s.attraction_name);
          if (cleanName) attsSet.add(cleanName);
        });

      // 2. All attractions from localSelections
      Object.entries(localSelections).forEach(([key, val]) => {
        if (val) {
          const parts = key.split('::');
          if (parts.length === 3 && parts[1] === park.id) {
            const cleanName = normalizeAttractionName(parts[2]);
            if (cleanName) attsSet.add(cleanName);
          }
        }
      });

      // 3. Known must-do attractions from park guide (normalized)
      (park.mustDoAttractions || []).forEach((rawAtt) => {
        const cleanName = normalizeAttractionName(rawAtt);
        if (cleanName) attsSet.add(cleanName);
      });

      map[park.id] = Array.from(attsSet);
    });

    return map;
  }, [allParks, dbSelections, localSelections]);

  // Calculate statistics per traveler based on all parks and their attractions
  const travelerStats = useMemo(() => {
    return travelers.map((trav) => {
      let totalSelected = 0;
      const parkCounts: Record<string, number> = {};
      const parkSelectedAttractions: Record<string, string[]> = {};

      allParks.forEach((park) => {
        const attractions = parkAttractionsMap[park.id] || [];
        const selectedInThisPark: string[] = [];

        attractions.forEach((att) => {
          if (isSelected(trav.id, park.id, att)) {
            selectedInThisPark.push(att);
            totalSelected++;
          }
        });

        parkCounts[park.id] = selectedInThisPark.length;
        parkSelectedAttractions[park.id] = selectedInThisPark;
      });

      return {
        traveler: trav,
        totalSelected,
        parkCounts,
        parkSelectedAttractions,
      };
    });
  }, [travelers, allParks, parkAttractionsMap, isSelected]);

  // Calculate attraction popularity across all travelers
  const attractionPopularity = useMemo(() => {
    const list: Array<{
      parkId: string;
      parkName: string;
      attractionName: string;
      interestedTravelers: Traveler[];
      votesCount: number;
    }> = [];

    allParks.forEach((park) => {
      if (selectedParkFilter === 'all' || park.id === selectedParkFilter) {
        const attractions = parkAttractionsMap[park.id] || [];
        attractions.forEach((att) => {
          const interested = travelers.filter((trav) => isSelected(trav.id, park.id, att));
          if (interested.length > 0) {
            list.push({
              parkId: park.id,
              parkName: park.name,
              attractionName: att,
              interestedTravelers: interested,
              votesCount: interested.length,
            });
          }
        });
      }
    });

    // Sort by most wanted, then alphabetically
    return list.sort((a, b) => {
      if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
      return a.attractionName.localeCompare(b.attractionName);
    });
  }, [allParks, selectedParkFilter, parkAttractionsMap, travelers, isSelected]);

  // Calculate PARK RANKINGS based on all traveler selections from the table
  const parkRankings = useMemo(() => {
    return allParks
      .filter((park) => selectedParkFilter === 'all' || park.id === selectedParkFilter)
      .map((park) => {
        const attractions = parkAttractionsMap[park.id] || [];

        const attractionVoteDetails = attractions.map((att) => {
          const interested = travelers.filter((trav) => isSelected(trav.id, park.id, att));
          return {
            attractionName: att,
            votesCount: interested.length,
            interestedTravelers: interested,
          };
        });

        const votedAttractions = attractionVoteDetails
          .filter((a) => a.votesCount > 0)
          .sort((a, b) => b.votesCount - a.votesCount);

        const unvotedAttractions = attractionVoteDetails.filter((a) => a.votesCount === 0);

        const interestedTravelersInPark = travelers.filter((trav) =>
          attractions.some((att) => isSelected(trav.id, park.id, att))
        );

        const totalVotes = votedAttractions.reduce((sum, a) => sum + a.votesCount, 0);
        const totalAttractionsCount = attractions.length;
        const totalTravelersCount = Math.max(1, travelers.length);

        // Ponderação pelo número de atrações mostradas:
        // Se um parque tem mais atrações (N maior), cada escolha vale menos (peso = 1 / N).
        // Total de escolhas possíveis no parque = N * T (onde N é atrações mostradas e T é viajantes)
        const maxPossibleVotes = totalAttractionsCount * totalTravelersCount;
        const rawWeightedPercentage =
          maxPossibleVotes > 0 ? (totalVotes / maxPossibleVotes) * 100 : 0;
        const weightedPercentage = Math.round(rawWeightedPercentage * 10) / 10;

        // Peso percentual de 1 atração sobre o catálogo mostrado do parque (1 / N)
        const singleAttractionWeightPercent =
          totalAttractionsCount > 0
            ? Math.round((1 / totalAttractionsCount) * 1000) / 10
            : 0;

        // Pontos ponderados obtidos pelo parque (soma de 1/N por escolha feita)
        const weightedPoints =
          totalAttractionsCount > 0
            ? Math.round((totalVotes / totalAttractionsCount) * 100) / 100
            : 0;

        const adhesionPercentage =
          travelers.length > 0
            ? Math.round((interestedTravelersInPark.length / travelers.length) * 100)
            : 0;

        return {
          park,
          totalVotes,
          votedAttractions,
          unvotedAttractions,
          votedAttractionsCount: votedAttractions.length,
          totalAttractionsCount: attractions.length,
          interestedTravelers: interestedTravelersInPark,
          interestedCount: interestedTravelersInPark.length,
          adhesionPercentage,
          weightedPercentage,
          singleAttractionWeightPercent,
          weightedPoints,
          maxPossibleVotes,
        };
      })
      .sort((a, b) => {
        if (parkSortBy === 'weighted_score') {
          if (b.weightedPercentage !== a.weightedPercentage) return b.weightedPercentage - a.weightedPercentage;
          if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
          return b.interestedCount - a.interestedCount;
        }
        if (parkSortBy === 'adhesion') {
          if (b.interestedCount !== a.interestedCount) return b.interestedCount - a.interestedCount;
          if (b.weightedPercentage !== a.weightedPercentage) return b.weightedPercentage - a.weightedPercentage;
          return b.totalVotes - a.totalVotes;
        }
        if (parkSortBy === 'attractions') {
          if (b.votedAttractionsCount !== a.votedAttractionsCount) return b.votedAttractionsCount - a.votedAttractionsCount;
          if (b.weightedPercentage !== a.weightedPercentage) return b.weightedPercentage - a.weightedPercentage;
          return b.totalVotes - a.totalVotes;
        }
        // Default: votes
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
        if (b.weightedPercentage !== a.weightedPercentage) return b.weightedPercentage - a.weightedPercentage;
        return b.interestedCount - a.interestedCount;
      });
  }, [allParks, selectedParkFilter, parkAttractionsMap, travelers, isSelected, parkSortBy]);

  const parksWithVotes = parkRankings.filter((p) => p.totalVotes > 0);
  const parksWithoutVotes = parkRankings.filter((p) => p.totalVotes === 0);

  const totalRegisteredDbVotes = useMemo(() => {
    return dbSelections.filter((s) => s.selected).length;
  }, [dbSelections]);

  const [copiedSummary, setCopiedSummary] = useState(false);

  const handleCopySummary = useCallback(() => {
    const validParks = parkRankings.filter((item) => item.totalVotes > 0);
    const lines: string[] = [];
    lines.push(`🏰 ORLANDO MAGIC PLANNER - RESUMO DA ORDEM ESCOLHIDA DOS PARQUES`);
    lines.push(`👥 Viajantes (${travelers.length}): ${travelers.map((t) => t.name).join(', ')}`);
    lines.push(
      `📊 Critério de Ordenação: ${
        parkSortBy === 'weighted_score'
          ? 'Score Ponderado (%)'
          : parkSortBy === 'adhesion'
          ? 'Adesão de Viajantes'
          : parkSortBy === 'attractions'
          ? 'Qtd. de Atrações Escolhidas'
          : 'Total de Votos'
      }`
    );
    lines.push(`--------------------------------------------------`);
    lines.push('');

    if (validParks.length === 0) {
      lines.push(`Nenhum parque possui escolhas registradas no momento.`);
      lines.push('');
    } else {
      validParks.forEach((item, index) => {
        const position = `${index + 1}º`;
        lines.push(`${position} LUGAR: ${item.park.name} (${item.park.resort || 'Parque'})`);
        lines.push(`   • Score Ponderado: ${item.weightedPercentage}%`);
        lines.push(`   • Adesão: ${item.interestedCount}/${travelers.length} viajantes (${item.adhesionPercentage}%)`);
        lines.push(`   • Total de Votos: ${item.totalVotes} votos (${item.votedAttractionsCount} atrações escolhidas)`);
        if (item.interestedTravelers.length > 0) {
          lines.push(`   • Viajantes: ${item.interestedTravelers.map((t) => t.name).join(', ')}`);
        }
        lines.push('');
      });
    }

    lines.push(`--------------------------------------------------`);
    lines.push(`Gerado em ${new Date().toLocaleDateString('pt-BR')} via KingdomCompass Orlando Planner`);

    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  }, [parkRankings, travelers, parkSortBy]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-6xl w-full h-[90vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Planejamento Colaborativo do Grupo • Preferências de Atrações
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Resumo e Comparativo de Desejos de Atrações
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

        {/* Sub-tabs & Park Filter */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('parks_ranking')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'parks_ranking'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Parques Mais Votados</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'parks_ranking' ? 'bg-[#D4AF37] text-[#1A2B4C]' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {parksWithVotes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('by_traveler')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'by_traveler'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              👤 Por Viajante ({travelers.length})
            </button>

            <button
              onClick={() => setActiveTab('attractions_ranking')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'attractions_ranking'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Ranking de Atrações ({attractionPopularity.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'matrix'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              📐 Matriz Comparativa
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Filtrar Parque:</span>
            <select
              value={selectedParkFilter}
              onChange={(e) => setSelectedParkFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-[#1A2B4C]"
            >
              <option value="all">Todos os Parques ({allParks.length})</option>
              {allParks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-6">
          {/* TAB 1: PARQUES MAIS VOTADOS */}
          {activeTab === 'parks_ranking' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span>Ranking dos Parques de Acordo com os Viajantes</span>
                  </h4>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {parkSortBy === 'weighted_score' ? (
                      <>
                        Ordenado por <strong>Porcentagem Ponderada de Atrações</strong>: o peso de cada escolha é inversamente proporcional ao total de atrações mostradas do parque (<span className="font-semibold">peso = 1/N</span>). Parques com mais atrações exigem proporcionalmente mais escolhas, equilibrando parques grandes e menores.
                      </>
                    ) : (
                      <>
                        Exibindo os votos registrados com as escolhas de todos os viajantes.
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-600">Ordenar por:</span>
                  <select
                    value={parkSortBy}
                    onChange={(e) => setParkSortBy(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer shadow-2xs"
                  >
                    <option value="weighted_score">Porcentagem Ponderada (%) [Recomendado]</option>
                    <option value="votes">Total de Votos Brutos</option>
                    <option value="adhesion">Adesão do Grupo (%)</option>
                    <option value="attractions">Qtd. Atrações Desejadas</option>
                  </select>
                </div>
              </div>

              {/* List of parks with votes */}
              {parksWithVotes.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                  <Trophy className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">Nenhum voto em atrações registrado ainda.</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Marque as preferências de cada viajante no Guia de Parques para que apareçam automaticamente aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {parksWithVotes.map((item, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <div
                        key={item.park.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isTop1
                            ? 'bg-gradient-to-br from-amber-50/50 via-white to-slate-50/70 border-amber-300 shadow-sm'
                            : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                        }`}
                      >
                        {/* Top Bar of Card */}
                        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                            {/* Rank Badge */}
                            <div className="shrink-0">
                              {isTop1 ? (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-amber-300">
                                  🥇 1º
                                </div>
                              ) : isTop2 ? (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-slate-300">
                                  🥈 2º
                                </div>
                              ) : isTop3 ? (
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-800 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-amber-500">
                                  🥉 3º
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-[#1A2B4C] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                                  #{idx + 1}
                                </div>
                              )}
                            </div>

                            {/* Park Details */}
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{item.park.icon}</span>
                                  <span>{item.park.name}</span>
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  {item.park.resort}
                                </span>
                                {item.park.parkType && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                    {item.park.parkType}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {item.weightedPercentage >= 80 ? (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-emerald-600" />
                                    <span>Altíssimo Desejo: {item.weightedPercentage}% Ponderado</span>
                                  </span>
                                ) : item.weightedPercentage >= 50 ? (
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                                    <Flame className="w-3 h-3 text-amber-600" />
                                    <span>Alta Prioridade: {item.weightedPercentage}% Ponderado</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md text-[10px] font-bold">
                                    Prioridade Moderada: {item.weightedPercentage}% Ponderado
                                  </span>
                                )}

                                {item.adhesionPercentage === 100 && (
                                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[10px] font-bold">
                                    Unânime (100% dos viajantes)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Stats Badges: 4 caixas na mesma linha, uma ao lado da outra */}
                          <div className="flex items-stretch gap-1.5 sm:gap-2 flex-nowrap shrink-0 overflow-x-auto custom-scrollbar pb-1 xl:pb-0">
                            {/* 1. Score Ponderado: Destaque Principal */}
                            <div className="px-3 py-1.5 bg-gradient-to-br from-amber-100/90 via-amber-50 to-amber-100/70 border-2 border-amber-400/80 rounded-xl text-center shadow-xs flex flex-col justify-center shrink-0 min-w-[125px]">
                              <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider flex items-center justify-center gap-1 whitespace-nowrap">
                                <Sparkles className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                Score Ponderado
                              </span>
                              <span className="text-sm sm:text-base font-black text-amber-950 font-mono leading-none my-0.5 block whitespace-nowrap">
                                {item.weightedPercentage}%
                              </span>
                              <span
                                className="text-[9px] text-amber-700 font-semibold whitespace-nowrap"
                                title={`Total: ${item.totalVotes} votos de ${item.maxPossibleVotes} possíveis. Cada escolha em ${item.park.name} vale 1/${item.totalAttractionsCount} (${item.singleAttractionWeightPercent}% do parque)`}
                              >
                                peso: 1/{item.totalAttractionsCount} por escolha
                              </span>
                            </div>

                            {/* 2. Adesão */}
                            <div className="px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col justify-center shrink-0 min-w-[90px] sm:min-w-[100px]">
                              <span className="text-[10px] text-slate-400 block font-medium whitespace-nowrap">Adesão</span>
                              <span className="text-xs sm:text-sm font-black text-[#1A2B4C] font-mono whitespace-nowrap mt-0.5">
                                {item.interestedCount}/{travelers.length} ({item.adhesionPercentage}%)
                              </span>
                            </div>

                            {/* 3. Total de Votos */}
                            <div className="px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col justify-center shrink-0 min-w-[85px] sm:min-w-[95px]">
                              <span className="text-[10px] text-slate-400 block font-medium whitespace-nowrap">Total de Votos</span>
                              <span className="text-xs sm:text-sm font-black text-slate-700 font-mono whitespace-nowrap mt-0.5">
                                {item.totalVotes} {item.totalVotes === 1 ? 'voto' : 'votos'}
                              </span>
                            </div>

                            {/* 4. Atrações Votadas */}
                            <div className="px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col justify-center shrink-0 min-w-[90px] sm:min-w-[100px]">
                              <span className="text-[10px] text-slate-400 block font-medium whitespace-nowrap">Atrações Votadas</span>
                              <span className="text-xs sm:text-sm font-black text-slate-800 font-mono whitespace-nowrap mt-0.5">
                                {item.votedAttractionsCount}/{item.totalAttractionsCount}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Interested Travelers Row */}
                        <div className="px-4 sm:px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-500">Viajantes interessados:</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.interestedTravelers.map((trav) => (
                                <span
                                  key={trav.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs"
                                >
                                  <span
                                    className="w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                                  >
                                    {trav.name.charAt(0).toUpperCase()}
                                  </span>
                                  <span>{trav.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Progress bar of weighted percentage */}
                          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-36">
                            <div className="flex items-center justify-between w-full text-[10px]">
                              <span className="text-slate-500 font-medium">Score Ponderado:</span>
                              <span className="font-bold font-mono text-[#1A2B4C]">{item.weightedPercentage}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  item.weightedPercentage >= 80
                                    ? 'bg-emerald-500'
                                    : item.weightedPercentage >= 50
                                    ? 'bg-gradient-to-r from-amber-400 to-[#D4AF37]'
                                    : 'bg-blue-600'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(5, item.weightedPercentage))}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Attractions Breakdown */}
                        <div className="p-4 sm:p-5 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                            <span className="font-bold text-slate-700 flex items-center gap-1">
                              <span>🎢 Atrações escolhidas pelos viajantes ({item.votedAttractions.length} de {item.totalAttractionsCount}):</span>
                            </span>
                            <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                              <Scale className="w-3 h-3 text-slate-400" />
                              <span>
                                Cada escolha: <strong className="text-slate-700">+{item.singleAttractionWeightPercent}%</strong> do parque (1/{item.totalAttractionsCount})
                              </span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {item.votedAttractions.map((att) => {
                              const attPercentage = Math.round(
                                (att.votesCount / Math.max(1, travelers.length)) * 100
                              );
                              return (
                                <div
                                  key={att.attractionName}
                                  className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 text-xs hover:border-slate-300 transition-colors"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="font-bold text-slate-900 truncate" title={att.attractionName}>
                                      {att.attractionName}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-semibold text-slate-500">
                                        {att.votesCount} {att.votesCount === 1 ? 'voto' : 'votos'} ({attPercentage}%)
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex -space-x-1 overflow-hidden shrink-0">
                                    {att.interestedTravelers.map((trav) => (
                                      <div
                                        key={trav.id}
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold border border-white shadow-2xs"
                                        style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                                        title={`${trav.name} escolheu esta atração`}
                                      >
                                        {trav.name.charAt(0).toUpperCase()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {item.unvotedAttractions.length > 0 && (
                            <div className="pt-1 text-[11px] text-slate-400">
                              <span>Outras atrações conhecidas deste parque sem votos: </span>
                              <span className="italic">
                                {item.unvotedAttractions.map((a) => a.attractionName).join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* List of parks with 0 votes */}
              {parksWithoutVotes.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <div className="text-xs font-bold text-slate-400 mb-2">
                    Demais Parques sem votos registrados ({parksWithoutVotes.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parksWithoutVotes.map((p) => (
                      <span
                        key={p.park.id}
                        className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200/80 flex items-center gap-1"
                      >
                        <span>{p.park.icon}</span>
                        <span>{p.park.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: POR VIAJANTE */}
          {activeTab === 'by_traveler' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {travelerStats.map(({ traveler, totalSelected, parkSelectedAttractions }) => (
                <div
                  key={traveler.id}
                  className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 hover:border-slate-300 transition-all shadow-2xs flex flex-col"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
                        style={{ backgroundColor: traveler.avatarColor || '#3B82F6' }}
                      >
                        {traveler.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                          {traveler.name}
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {traveler.role === 'admin' ? '👑 Administrador da Viagem' : '✈️ Viajante'}
                        </span>
                      </div>
                    </div>

                    <div className="px-3 py-1 bg-amber-100 text-amber-900 rounded-xl text-xs font-black font-mono">
                      {totalSelected} {totalSelected === 1 ? 'Atração' : 'Atrações'}
                    </div>
                  </div>

                  {/* List of parks and selected attractions for this traveler */}
                  <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1 flex-1">
                    {allParks
                      .filter((p) => selectedParkFilter === 'all' || p.id === selectedParkFilter)
                      .map((park) => {
                        const selectedInPark = parkSelectedAttractions[park.id] || [];
                        if (selectedInPark.length === 0) return null;

                        return (
                          <div key={park.id} className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A2B4C]">
                              <span>{park.icon}</span>
                              <span>{park.name}</span>
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                {selectedInPark.length}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {selectedInPark.map((att, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md text-[10px] font-semibold flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{att}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                    {totalSelected === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-6">
                        Nenhuma atração marcada por {traveler.name} ainda.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: RANKING DE ATRAÇÕES */}
          {activeTab === 'attractions_ranking' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center justify-between gap-2">
                <span>
                  Mostrando <strong className="text-slate-900">{attractionPopularity.length}</strong> atrações votadas, ordenadas pelo número de viajantes interessados.
                </span>
                <span className="text-[10px] font-bold text-slate-400">Total de votos: {totalRegisteredDbVotes}</span>
              </div>

              {attractionPopularity.map((item, idx) => {
                const count = item.interestedTravelers.length;
                const percentage = Math.round((count / Math.max(1, travelers.length)) * 100);

                return (
                  <div
                    key={`${item.parkId}-${item.attractionName}`}
                    className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-all shadow-2xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#1A2B4C] text-white font-mono">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          🎡 {item.parkName}
                        </span>
                        {percentage === 100 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                            <Sparkles className="w-3 h-3" /> Unânime
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{item.attractionName}</h4>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {item.interestedTravelers.map((trav) => (
                          <div
                            key={trav.id}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white shadow-xs"
                            style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                            title={`${trav.name} escolheu esta atração`}
                          >
                            {trav.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                      </div>
                      <div className="text-right min-w-[90px]">
                        <span className="text-xs font-bold text-[#1A2B4C] block font-mono">
                          {count} de {travelers.length} ({percentage}%)
                        </span>
                        <span className="text-[10px] text-slate-400">querem visitar</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: MATRIZ COMPARATIVA INTERATIVA */}
          {activeTab === 'matrix' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span>
                  💡 Você pode marcar ou desmarcar preferências na tabela abaixo. As alterações são sincronizadas automaticamente em tempo real.
                </span>
              </div>

              <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="p-3 font-bold">Atração & Parque</th>
                      {travelers.map((trav) => (
                        <th key={trav.id} className="p-3 font-bold text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-xs"
                              style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                            >
                              {trav.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[90px]">{trav.name}</span>
                          </div>
                        </th>
                      ))}
                      <th className="p-3 font-bold text-center">Consenso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {attractionPopularity.map((item, idx) => {
                      const interestedCount = item.interestedTravelers.length;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{item.attractionName}</span>
                            <span className="text-[10px] text-slate-400">{item.parkName}</span>
                          </td>
                          {travelers.map((trav) => {
                            const checked = isSelected(trav.id, item.parkId, item.attractionName);
                            return (
                              <td key={trav.id} className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleSelection(trav.id, item.parkId, item.attractionName)}
                                  className="w-4 h-4 rounded-md text-[#1A2B4C] focus:ring-[#1A2B4C] cursor-pointer"
                                />
                              </td>
                            );
                          })}
                          <td className="p-3 text-center font-bold font-mono text-slate-800">
                            {interestedCount}/{travelers.length}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 text-xs shrink-0">
          <button
            type="button"
            onClick={handleCopySummary}
            className={`px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs border ${
              copiedSummary
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-slate-100 text-[#1A2B4C] border-slate-300'
            }`}
            title="Copiar resumo do ranking e escolhas dos parques para a área de transferência"
          >
            {copiedSummary ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Resumo copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#D4AF37]" />
                <span>Copiar resumo</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold rounded-xl shadow-sm transition-colors cursor-pointer text-center"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
