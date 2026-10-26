import React, { useState } from 'react';
import {
  Compass,
  Printer,
  Search,
  X,
  Plane,
  Hotel,
  Car,
  Ticket,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Layers,
  Utensils,
  Download,
  Copy,
  Check,
  ExternalLink,
  Info,
  ShieldCheck,
  DollarSign,
  Users,
  AlertCircle,
  FileText,
  Zap,
  Camera,
} from 'lucide-react';
import {
  usePlanner,
  formatDisplayDate,
  getTripEndDate,
  isDayEffectivelyCompleted,
} from '../context/PlannerContext';
import { isDayWithPark } from '../utils/parkScheduleUtils';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { FlightSegment } from '../types';
import { isArrivalInBrazilDay } from './ItineraryPlanner';
import { getRealPhotoPackagesList, getPhotoPackageForDay } from '../utils/photoPackageUtils';

interface MasterOverviewModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onPrintPdf?: (section?: string) => void;
}

const cleanText = (text?: string): string => {
  if (!text) return '';
  return text.replace(/^sugest[ãa]o:\s*/i, '').trim();
};

const isPeriodProgrammed = (day: any, periodKey?: 'morning' | 'afternoon' | 'night'): boolean => {
  if (!day) return false;

  // 1. Theme park assigned
  if (day.park && day.park !== 'Sem Parque' && !/^(sem parque|descanso|livre|compras)$/i.test(day.park)) {
    return true;
  }

  // 2. Scheduled hourly items or park booking
  if (day.hourlySchedule && day.hourlySchedule.length > 0) return true;
  if (day.parkBooking) return true;

  // 3. Flight / Arrival / Departure / Registered activity keywords
  const titleText = (day.title || '').toLowerCase();
  const whereText = periodKey ? (day[periodKey]?.where || '').toLowerCase() : `${day.morning?.where || ''} ${day.afternoon?.where || ''} ${day.night?.where || ''}`.toLowerCase();
  const diningText = periodKey ? (day[periodKey]?.dining || '').toLowerCase() : `${day.morning?.dining || ''} ${day.afternoon?.dining || ''} ${day.night?.dining || ''}`.toLowerCase();
  const notesText = periodKey ? (day[periodKey]?.notes || '').toLowerCase() : `${day.morning?.notes || ''} ${day.afternoon?.notes || ''} ${day.night?.notes || ''}`.toLowerCase();

  const combined = `${titleText} ${whereText} ${diningText} ${notesText}`;

  const flightAndEventKeywords = [
    'voo', 'flight', 'desembarque', 'embarque', 'check-in', 'checkin', 'aeroporto',
    'mco', 'arajet', 'latam', 'gol', 'azul', 'american', 'delta', 'united', 'copa',
    'transfer', 'uber', 'locadora', 'retirada', 'devolução', 'chegada', 'partida',
    'reserva', 'ingresso', 'ticket', 'agendado', 'agendamento'
  ];

  if (flightAndEventKeywords.some(kw => combined.includes(kw))) {
    return true;
  }

  return false;
};

export const MasterOverviewModal: React.FC<MasterOverviewModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onPrintPdf,
}) => {
  const {
    isOverviewModalOpen,
    closeOverviewModal,
    overviewCategory,
    setOverviewCategory,
    itineraryDays,
    settings,
    flights,
    carRentals,
    accommodations,
    parkTickets,
    expenses,
  } = usePlanner();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isOverviewModalOpen;
  const handleClose = propOnClose || closeOverviewModal;

  const [overviewSearchQuery, setOverviewSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: handleClose,
  });

  const resolveTicketName = (ticketTypeIdOrName?: string) => {
    if (!ticketTypeIdOrName) return '';
    const found = (parkTickets || []).find(
      (t) => t.id === ticketTypeIdOrName || t.title === ticketTypeIdOrName
    );
    if (found) return found.title;
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(ticketTypeIdOrName);
    if (isUUID) return 'Ingresso Vinculado';
    return ticketTypeIdOrName;
  };

  const photoPackagesList = React.useMemo(() => {
    return getRealPhotoPackagesList(itineraryDays, expenses, parkTickets);
  }, [itineraryDays, expenses, parkTickets]);

  const sortedAccommodations = React.useMemo(() => {
    if (!accommodations) return [];
    return [...accommodations].sort((a, b) => {
      const dateA = a.checkInDate || '';
      const dateB = b.checkInDate || '';
      return dateA.localeCompare(dateB);
    });
  }, [accommodations]);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const tripEndDate =
    itineraryDays[itineraryDays.length - 1]?.date ||
    getTripEndDate(settings.startDate, settings.durationDays);

  const fullPeriodText = settings.isFlexibleDates
    ? `Data Não Definida (${settings.durationDays} dias)`
    : `${formatDisplayDate(settings.startDate, false)} até ${formatDisplayDate(tripEndDate, false)}`;

  const totalScheduleItems = itineraryDays.reduce(
    (acc, d) => acc + (d.hourlySchedule?.length || 0),
    0
  );
  const completedDaysCount = itineraryDays.filter((d) =>
    isDayEffectivelyCompleted(d, settings.isFlexibleDates)
  ).length;

  const filteredDays = itineraryDays.filter((d) => {
    if (!overviewSearchQuery.trim()) return true;
    const q = overviewSearchQuery.toLowerCase();
    const matchTitle = (d.title || '').toLowerCase().includes(q);
    const matchPark = (d.park || '').toLowerCase().includes(q);
    const matchPeriods =
      (d.morning.where || '').toLowerCase().includes(q) ||
      (d.morning.dining || '').toLowerCase().includes(q) ||
      (d.afternoon.where || '').toLowerCase().includes(q) ||
      (d.afternoon.dining || '').toLowerCase().includes(q) ||
      (d.night.where || '').toLowerCase().includes(q) ||
      (d.night.dining || '').toLowerCase().includes(q) ||
      (d.generalNotes || '').toLowerCase().includes(q);
    const matchHourly = (d.hourlySchedule || []).some(
      (item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.time || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q)
    );
    return matchTitle || matchPark || matchPeriods || matchHourly;
  });

  // Group flight segments
  const norm = (s?: string) => (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const flightGroups: { [key: string]: { flight: FlightSegment; pnrs: Set<string>; passengers: Set<string> } } = {};

  (flights || []).forEach((f) => {
    const airline = norm(f.airline);
    const flightNumber = norm(f.flightNumber);
    const origin = norm(f.originCode || f.originAirport || f.originCity);
    const dest = norm(f.destinationCode || f.destinationAirport || f.destinationCity);
    const depDate = norm(f.departureDate);
    const depTime = norm(f.departureTime);
    const type = norm(f.type);

    let groupKey = '';
    if (flightNumber) {
      groupKey = `${type}_${airline}_${flightNumber}_${depDate}_${origin}_${dest}`;
    } else {
      groupKey = `${type}_${airline}_${origin}_${dest}_${depDate}_${depTime}`;
    }

    if (!flightGroups[groupKey]) {
      flightGroups[groupKey] = {
        flight: f,
        pnrs: new Set<string>(),
        passengers: new Set<string>(),
      };
    }

    const rawPnr = (f.pnrLocator || (f as any).confirmationCode || '').trim();
    if (rawPnr && rawPnr !== 'N/A' && rawPnr !== 'N/D') {
      rawPnr.split(/[,/•;\s]+/).forEach((p) => {
        const clean = p.trim().toUpperCase();
        if (clean && clean !== 'N/A' && clean !== 'N/D') {
          flightGroups[groupKey].pnrs.add(clean);
        }
      });
    }

    if (f.passengers && Array.isArray(f.passengers)) {
      f.passengers.forEach((p) => {
        if (p && p.trim()) flightGroups[groupKey].passengers.add(p.trim());
      });
    }
  });

  const groupedFlightSegments = Object.values(flightGroups);
  const mainAccommodation = sortedAccommodations.length > 0 ? sortedAccommodations[0] : null;
  const mainCarRental = carRentals && carRentals.length > 0 ? carRentals[0] : null;

  // Dynamic modal title based on category
  const categoryTitles: { [key: string]: string } = {
    all: 'Resumo Executivo da Viagem',
    flights: 'Visão Geral — Passagens Aéreas & Voos',
    accommodations: 'Visão Geral — Hospedagens & Estadias',
    parks: 'Visão Geral — Parques, Ingressos & Experiências',
    transport: 'Visão Geral — Transporte & Mobilidade',
    itinerary: 'Visão Geral — Programação Completa Dia a Dia',
  };

  const categoryTabNames: { [key: string]: string } = {
    all: 'Geral & Dossiê',
    itinerary: 'Programação Completa',
    flights: 'Passagens Aéreas',
    accommodations: 'Hospedagens',
    parks: 'Parques & Ingressos',
    transport: 'Transporte',
  };

  const buildCategoryPdfHtml = (catKey: string): string => {
    const tripTitle = settings.tripTitle || 'Roteiro de Viagem — Orlando';
    const destination = settings.destination || 'Orlando, Flórida';
    const duration = settings.durationDays || itineraryDays.length || 1;
    const travelers = settings.travelersCount || 1;
    const dollarRate = settings.dollarRate ? settings.dollarRate.toFixed(2) : '5.50';

    const formatItemCategoryLabel = (c?: string) => {
      switch (c) {
        case 'airbnb': return 'Airbnb';
        case 'hotel': return 'Hotel & Resort';
        case 'transport': return 'Transporte';
        case 'park': return 'Parque & Atração';
        case 'dining': return 'Refeição';
        case 'flight': return 'Voo';
        case 'shopping': return 'Compras';
        default: return c || 'Geral';
      }
    };

    const catLabels: { [key: string]: { title: string; subtitle: string; icon: string } } = {
      all: {
        title: 'DOSSIÊ EXECUTIVO & GERAL DA VIAGEM',
        subtitle: 'Resumo completo de voos, hospedagens, aluguel de veículos, ingressos e cronograma.',
        icon: '🧭',
      },
      itinerary: {
        title: 'PROGRAMAÇÃO COMPLETA DIA A DIA',
        subtitle: 'Cronograma hora a hora, turnos do dia, atrações e detalhes de cada data.',
        icon: '📅',
      },
      flights: {
        title: 'DOSSIÊ DE PASSAGENS AÉREAS & VOOS',
        subtitle: 'Bilhetes, trechos, horários de embarque, portões, companhias e códigos PNR.',
        icon: '✈️',
      },
      accommodations: {
        title: 'DOSSIÊ DE HOSPEDAGENS & ESTADIAS',
        subtitle: 'Hotéis, resorts, endereços, check-in, check-out e códigos de confirmação.',
        icon: '🏨',
      },
      parks: {
        title: 'DOSSIÊ DE PARQUES & INGRESSOS',
        subtitle: 'Parques temáticos, atrações agendadas, vouchers e vínculo de aplicativos.',
        icon: '🎟️',
      },
      transport: {
        title: 'DOSSIÊ DE TRANSPORTE & MOBILIDADE',
        subtitle: 'Veículos alugados, retiradas, devoluções, pedágios SunPass e estacionamentos.',
        icon: '🚗',
      },
    };

    const info = catLabels[catKey] || catLabels['all'];
    let mainContentHtml = '';

    // Render option 1: all
    if (catKey === 'all') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Duração Total</span>
            <div class="metric-val">${duration} Dias</div>
            <span class="metric-sub">${fullPeriodText}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Passageiros</span>
            <div class="metric-val">${travelers} Viajantes</div>
            <span class="metric-sub">Grupo da Viagem</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Destino Principal</span>
            <div class="metric-val">${destination}</div>
            <span class="metric-sub">Flórida, EUA</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Câmbio Base</span>
            <div class="metric-val">R$ ${dollarRate}</div>
            <span class="metric-sub">Dólar Comercial</span>
          </div>
        </div>

        <div class="section-box">
          <h2 class="section-title">✈️ Passagens Aéreas (${groupedFlightSegments.length} Trechos)</h2>
          ${groupedFlightSegments.length === 0 ? '<p class="empty-msg">Nenhum voo cadastrado.</p>' : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Companhia / Voo</th>
                  <th>Origem ➔ Destino</th>
                  <th>Datas & Horários</th>
                  <th>Localizador (PNR)</th>
                </tr>
              </thead>
              <tbody>
                ${groupedFlightSegments.map(grp => {
                  const f = grp.flight;
                  const pnrs = Array.from(grp.pnrs).join(', ') || 'N/A';
                  return `
                    <tr>
                      <td><strong>${f.type === 'outbound' ? 'Ida' : f.type === 'inbound' ? 'Volta' : 'Interno'}</strong></td>
                      <td><strong>${f.airline} ${f.flightNumber}</strong><br/><small>${f.cabinClass || 'Econômica'}</small></td>
                      <td>${f.originCity || f.originCode} ➔ ${f.destinationCity || f.destinationCode}</td>
                      <td>Partida: ${formatDisplayDate(f.departureDate, false)} ${f.departureTime || ''}<br/>Chegada: ${formatDisplayDate(f.arrivalDate || f.departureDate, false)} ${f.arrivalTime || ''}</td>
                      <td><span class="pnr-badge">${pnrs}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="section-box">
          <h2 class="section-title">🏨 Hospedagem (${sortedAccommodations.length} Reservas)</h2>
          ${(!sortedAccommodations || sortedAccommodations.length === 0) ? '<p class="empty-msg">Nenhuma hospedagem cadastrada.</p>' : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Hotel / Resort</th>
                  <th>Endereço</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Reserva</th>
                </tr>
              </thead>
              <tbody>
                ${sortedAccommodations.map(acc => `
                  <tr>
                    <td><strong>${acc.name}</strong></td>
                    <td>${acc.address || 'N/A'}</td>
                    <td>${formatDisplayDate(acc.checkInDate, false)} ${acc.checkInTime || ''}</td>
                    <td>${formatDisplayDate(acc.checkOutDate, false)} ${acc.checkOutTime || ''}</td>
                    <td><span class="pnr-badge">${acc.confirmationCode || 'N/A'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="section-box">
          <h2 class="section-title">🚗 Transporte e Aluguel de Veículos (${carRentals?.length || 0})</h2>
          ${(!carRentals || carRentals.length === 0) ? '<p class="empty-msg">Nenhum veículo cadastrado.</p>' : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Locadora</th>
                  <th>Categoria</th>
                  <th>Retirada</th>
                  <th>Devolução</th>
                  <th>Reserva</th>
                </tr>
              </thead>
              <tbody>
                ${carRentals.map(car => `
                  <tr>
                    <td><strong>${car.company}</strong></td>
                    <td>${car.category || 'Standard'}</td>
                    <td>${car.pickupLocation || 'Aeroporto'} — ${formatDisplayDate(car.pickupDate, false)} ${car.pickupTime || ''}</td>
                    <td>${car.returnLocation || 'Aeroporto'} — ${formatDisplayDate(car.returnDate, false)} ${car.returnTime || ''}</td>
                    <td><span class="pnr-badge">${car.confirmationCode || 'N/A'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        ${parkTickets && parkTickets.length > 0 ? `
          <div class="section-box">
            <h2 class="section-title">🎟️ Ingressos & Vouchers de Parques (${parkTickets.length})</h2>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Atração / Combo</th>
                  <th>Complexo</th>
                  <th>Voucher / Código</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${parkTickets.map(tk => `
                  <tr>
                    <td><strong>${tk.title || tk.parkName || 'Ingresso'}</strong><br/><small>${tk.type === 'combo' ? 'Combo Multi-Parques' : 'Individual'}</small></td>
                    <td>${tk.complex || 'N/A'}</td>
                    <td><span class="pnr-badge">${tk.confirmationCode || tk.ticketCode || 'N/A'}</span></td>
                    <td><span class="status-tag">${tk.paymentStatus || 'Pago'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${photoPackagesList.length > 0 ? `
          <div class="section-box">
            <h2 class="section-title">📸 Pacotes de Fotos & Memory Maker (${photoPackagesList.length})</h2>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Pacote / Serviço</th>
                  <th>Complexo / Parques</th>
                  <th>Voucher / Código</th>
                  <th>Status</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                ${photoPackagesList.map(pkg => `
                  <tr>
                    <td><strong>${pkg.name}</strong>${pkg.notes ? `<br/><small>${pkg.notes}</small>` : ''}</td>
                    <td>${pkg.complex || 'N/A'}${pkg.parks && pkg.parks.length > 0 ? `<br/><small>${pkg.parks.join(', ')}</small>` : ''}</td>
                    <td><span class="pnr-badge">${pkg.code || 'Ativo'}</span></td>
                    <td><span class="status-tag">${pkg.status || 'Confirmado'}</span></td>
                    <td><small>${pkg.source || 'Geral'}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="section-box">
          <h2 class="section-title">📅 Programação Completa Dia a Dia (${itineraryDays.length} Dias)</h2>
          <div class="space-y">
            ${itineraryDays.map(day => {
              const dateStr = formatDisplayDate(day.date, false);
              const items = day.hourlySchedule || [];
              const photoPkg = getPhotoPackageForDay(day, photoPackagesList);
              const hasPhoto = Boolean(photoPkg);
              return `
                <div class="day-card">
                  <div class="day-header">
                    <div>
                      <span class="day-badge">DIA ${day.dayNumber}</span>
                      <strong class="day-title">${day.title || day.park || 'Sem Parque'}</strong>
                      ${!settings.isFlexibleDates ? `<span class="day-date">(${dateStr})</span>` : ''}
                    </div>
                    <span class="status-tag">${isDayWithPark(day) ? '🏰 Parque' : '🛍️ Compras / Livre'}</span>
                  </div>

                  ${isArrivalInBrazilDay(day) ? `
                    <div class="info-guide-box" style="margin: 10px 0; background: #f1f5f9; border-color: #cbd5e1; color: #475569;">
                      <strong>🛬 Chegada ao Brasil — Viagem Concluída:</strong> Atividades finalizadas.
                    </div>
                  ` : ''}

                  ${cleanText(day.generalNotes) ? `
                    <div class="info-guide-box" style="margin: 8px 0; background: #fffbeb; border-color: #fde68a; color: #78350f;">
                      <strong>📝 Observação do Dia:</strong> ${cleanText(day.generalNotes)}
                    </div>
                  ` : ''}

                  ${isDayWithPark(day) && cleanText(day.parkBooking?.notes) && cleanText(day.parkBooking?.notes) !== cleanText(day.generalNotes) ? `
                    <div class="info-guide-box" style="margin: 8px 0; background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a;">
                      <strong>🏰 Observação do Parque (${day.park}${resolveTicketName(day.parkBooking?.ticketType) ? ` — ${resolveTicketName(day.parkBooking?.ticketType)}` : ''}):</strong> ${cleanText(day.parkBooking?.notes)}
                    </div>
                  ` : ''}

                  ${isDayWithPark(day) && cleanText(day.parkBooking?.ropeDropPlan) ? `
                    <div class="info-guide-box" style="margin: 8px 0; background: #faf5ff; border-color: #e9d5ff; color: #581c87;">
                      <strong>⚡ Estratégia de Entrada (Rope Drop):</strong> ${cleanText(day.parkBooking?.ropeDropPlan)}
                    </div>
                  ` : ''}

                  ${hasPhoto ? `
                    <div class="info-guide-box" style="margin: 8px 0; background: #faf5ff; border-color: #e9d5ff; color: #581c87;">
                      <strong>📸 Pacote de Fotos / PhotoPass:</strong> ${photoPkg?.name || 'Memory Maker / PhotoPass Incluído'}${photoPkg?.code ? ` — Código: ${photoPkg.code}` : ''}
                    </div>
                  ` : ''}

                  ${items.length > 0 ? `
                    <div class="schedule-sub">
                      <strong>🕒 Tabela Detalhada Hora a Hora:</strong>
                      <table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Horário</th>
                            <th>Atividade / Atração</th>
                            <th>Categoria</th>
                            <th>Local</th>
                            <th>Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${items.map(item => `
                            <tr>
                              <td><span class="time-badge">${item.time}</span></td>
                              <td><strong>${item.title}</strong></td>
                              <td>${formatItemCategoryLabel(item.category)}</td>
                              <td>${item.location || '-'}</td>
                              <td>${item.notes || '-'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Render option 2: itinerary
    else if (catKey === 'itinerary') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Dias Totais</span>
            <div class="metric-val">${itineraryDays.length} Dias</div>
            <span class="metric-sub">${fullPeriodText}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Parques Agendados</span>
            <div class="metric-val">${itineraryDays.filter(d => isDayWithPark(d)).length} Parques</div>
            <span class="metric-sub">Ingressos vinculados</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Dias Livres</span>
            <div class="metric-val">${itineraryDays.filter(d => !isDayWithPark(d)).length} Dias</div>
            <span class="metric-sub">Compras & Descanso</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Atividades</span>
            <div class="metric-val">${totalScheduleItems} Horários</div>
            <span class="metric-sub">Cronograma Hora a Hora</span>
          </div>
        </div>

        <div class="space-y">
          ${itineraryDays.map(day => {
            const dateStr = formatDisplayDate(day.date, false);
            const items = day.hourlySchedule || [];
            const photoPkg = getPhotoPackageForDay(day, photoPackagesList);
            const hasPhoto = Boolean(photoPkg);
            return `
              <div class="day-card">
                <div class="day-header">
                  <div>
                    <span class="day-badge">DIA ${day.dayNumber}</span>
                    <strong class="day-title">${day.title || day.park || 'Sem Parque'}</strong>
                    ${!settings.isFlexibleDates ? `<span class="day-date">(${dateStr})</span>` : ''}
                  </div>
                  <span class="status-tag">${isDayWithPark(day) ? '🏰 Parque' : '🛍️ Compras / Livre'}</span>
                </div>

                ${isArrivalInBrazilDay(day) ? `
                  <div class="info-guide-box" style="margin: 10px 0; background: #f1f5f9; border-color: #cbd5e1; color: #475569;">
                    <strong>🛬 Chegada ao Brasil — Viagem Concluída:</strong> Atividades finalizadas.
                  </div>
                ` : ''}

                ${cleanText(day.generalNotes) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #fffbeb; border-color: #fde68a; color: #78350f;">
                    <strong>📝 Observação do Dia:</strong> ${cleanText(day.generalNotes)}
                  </div>
                ` : ''}

                ${isDayWithPark(day) && cleanText(day.parkBooking?.notes) && cleanText(day.parkBooking?.notes) !== cleanText(day.generalNotes) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a;">
                    <strong>🏰 Observação do Parque (${day.park}${resolveTicketName(day.parkBooking?.ticketType) ? ` — ${resolveTicketName(day.parkBooking?.ticketType)}` : ''}):</strong> ${cleanText(day.parkBooking?.notes)}
                  </div>
                ` : ''}

                ${isDayWithPark(day) && cleanText(day.parkBooking?.ropeDropPlan) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #faf5ff; border-color: #e9d5ff; color: #581c87;">
                    <strong>⚡ Estratégia de Entrada (Rope Drop):</strong> ${cleanText(day.parkBooking?.ropeDropPlan)}
                  </div>
                ` : ''}

                ${hasPhoto ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #faf5ff; border-color: #e9d5ff; color: #581c87;">
                    <strong>📸 Pacote de Fotos / PhotoPass:</strong> ${photoPkg?.name || 'Memory Maker / PhotoPass Incluído'}${photoPkg?.code ? ` — Código: ${photoPkg.code}` : ''}
                  </div>
                ` : ''}

                ${items.length > 0 ? `
                  <div class="schedule-sub">
                    <strong>🕒 Tabela Detalhada Hora a Hora:</strong>
                    <table class="data-table compact">
                      <thead>
                        <tr>
                          <th>Horário</th>
                          <th>Atividade / Atração</th>
                          <th>Categoria</th>
                          <th>Local</th>
                          <th>Observações</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${items.map(item => `
                          <tr>
                            <td><span class="time-badge">${item.time}</span></td>
                            <td><strong>${item.title}</strong></td>
                            <td>${formatItemCategoryLabel(item.category)}</td>
                            <td>${item.location || '-'}</td>
                            <td>${item.notes || '-'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Render option 3: flights
    else if (catKey === 'flights') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Total de Trechos</span>
            <div class="metric-val">${groupedFlightSegments.length} Trechos</div>
            <span class="metric-sub">Voos Cadastrados</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Companhias</span>
            <div class="metric-val">${Array.from(new Set((flights || []).map(f => f.airline).filter(Boolean))).join(', ') || 'N/A'}</div>
            <span class="metric-sub">Companhias Aéreas</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Localizadores</span>
            <div class="metric-val">${Array.from(new Set((flights || []).map(f => f.pnrLocator).filter(p => p && p !== 'N/A'))).length} PNRs</div>
            <span class="metric-sub">Códigos de Reserva</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Viajantes</span>
            <div class="metric-val">${travelers} Pessoas</div>
            <span class="metric-sub">Passageiros Com Bilhete</span>
          </div>
        </div>

        <div class="space-y">
          ${groupedFlightSegments.length === 0 ? '<p class="empty-msg">Nenhum voo cadastrado no sistema.</p>' : groupedFlightSegments.map((grp) => {
            const f = grp.flight;
            const pnrsArr = Array.from(grp.pnrs);
            const passArr = Array.from(grp.passengers);
            return `
              <div class="card-box">
                <div class="card-header">
                  <span class="card-badge blue">${f.type === 'outbound' ? '🛫 VOO DE IDA' : f.type === 'inbound' ? '🛬 VOO DE VOLTA' : '✈️ VOO INTERNO'}</span>
                  <strong class="card-title">${f.airline} ${f.flightNumber}</strong>
                  <span class="card-sub">${f.cabinClass || 'Classe Econômica'}</span>
                </div>

                <div class="flight-route-grid">
                  <div class="route-box">
                    <span class="route-label">ORIGEM</span>
                    <div class="route-city">${f.originCity || f.originAirport || 'Origem'}</div>
                    <div class="route-code">${f.originCode || ''}</div>
                    <p class="route-time">🕒 Partida: <strong>${f.departureTime || '--:--'}</strong> (${formatDisplayDate(f.departureDate, false)})</p>
                  </div>
                  <div class="route-arrow">➔</div>
                  <div class="route-box">
                    <span class="route-label">DESTINO</span>
                    <div class="route-city">${f.destinationCity || f.destinationAirport || 'Destino'}</div>
                    <div class="route-code">${f.destinationCode || ''}</div>
                    <p class="route-time">🛬 Chegada: <strong>${f.arrivalTime || '--:--'}</strong> (${formatDisplayDate(f.arrivalDate || f.departureDate, false)})</p>
                  </div>
                </div>

                <div class="pnr-highlight-box">
                  <strong>CÓDIGO DE RESERVA / PNR (LOCALIZADOR):</strong>
                  <div class="pnr-code-list">
                    ${pnrsArr.length > 0 ? pnrsArr.map(code => `<span class="pnr-badge-lg">${code}</span>`).join(' ') : '<span class="pnr-badge-lg">Sem PNR cadastrado</span>'}
                  </div>
                </div>

                ${passArr.length > 0 ? `
                  <div class="passengers-box" style="margin-top: 8px;">
                    <strong>👥 Passageiros Vinculados:</strong> ${passArr.join(' • ')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Render option 4: accommodations
    else if (catKey === 'accommodations') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Hospedagens</span>
            <div class="metric-val">${sortedAccommodations.length} Locais</div>
            <span class="metric-sub">Hotéis / Resorts</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Estadia Principal</span>
            <div class="metric-val">${mainAccommodation?.name || 'Não informada'}</div>
            <span class="metric-sub">${mainAccommodation?.address || 'Orlando, FL'}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Confirmação</span>
            <div class="metric-val">${mainAccommodation?.confirmationCode || 'N/A'}</div>
            <span class="metric-sub">Código da Reserva</span>
          </div>
        </div>

        <div class="space-y">
          ${(!sortedAccommodations || sortedAccommodations.length === 0) ? '<p class="empty-msg">Nenhuma hospedagem cadastrada.</p>' : sortedAccommodations.map(acc => `
            <div class="card-box">
              <div class="card-header">
                <span class="card-badge gold">🏨 HOTEL / RESORT</span>
                <strong class="card-title">${acc.name}</strong>
              </div>
              <p style="margin-bottom: 6px;">📍 <strong>Endereço:</strong> ${acc.address || 'Não informado'}, ${acc.city || 'Orlando'}, ${acc.state || 'FL'}</p>
              <div class="grid-2">
                <div>
                  <strong>🔑 Check-In:</strong> ${formatDisplayDate(acc.checkInDate, false)} às ${acc.checkInTime || '15:00'}
                </div>
                <div>
                  <strong>🔑 Check-Out:</strong> ${formatDisplayDate(acc.checkOutDate, false)} às ${acc.checkOutTime || '11:00'}
                </div>
              </div>
              <div class="pnr-highlight-box">
                <strong>CÓDIGO DE CONFIRMAÇÃO / RESERVA:</strong><br/>
                <span class="pnr-badge-lg">${acc.confirmationCode || 'N/A'}</span>
              </div>
              ${acc.notes ? `<p style="margin-top: 8px;"><strong>Observações & Políticas:</strong> ${acc.notes}</p>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Render option 5: parks
    else if (catKey === 'parks') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Ingressos & Parques</span>
            <div class="metric-val">${parkTickets?.length || 0} Ingressos</div>
            <span class="metric-sub">Cadastrados no Sistema</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Parques no Roteiro</span>
            <div class="metric-val">${itineraryDays.filter(d => isDayWithPark(d)).length} Dias de Parque</div>
            <span class="metric-sub">Programação Ativa</span>
          </div>
        </div>

        <div class="space-y">
          ${(!parkTickets || parkTickets.length === 0) ? '<p class="empty-msg">Nenhum ingresso/reserva de parque cadastrado individualmente. Verifique os dias do roteiro.</p>' : parkTickets.map(t => `
            <div class="card-box">
              <div class="card-header">
                <span class="card-badge gold">🎟️ INGRESSO / ATRAÇÃO</span>
                <strong class="card-title">${t.parkName || t.title || 'Ingresso'}</strong>
              </div>
              <p style="margin-bottom: 4px;"><strong>Tipo / Categoria:</strong> ${t.ticketType || 'Ingresso Standard'}</p>
              <p style="margin-bottom: 4px;"><strong>Titular / Passageiros:</strong> ${t.assignedTo || 'Grupo completo'}</p>
              <div class="pnr-highlight-box">
                <strong>CÓDIGO DO INGRESSO / VOUCHER:</strong><br/>
                <span class="pnr-badge-lg">${t.ticketCode || t.confirmationCode || 'N/A'}</span>
              </div>
              ${t.notes ? `<p style="margin-top: 8px;"><strong>Instruções de Vínculo:</strong> ${t.notes}</p>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="section-box" style="margin-top: 20px;">
          <h2 class="section-title">🏰 Parques Agendados no Roteiro (${itineraryDays.filter(d => isDayWithPark(d)).length} Dias)</h2>
          <div class="space-y">
            ${itineraryDays.filter(d => isDayWithPark(d)).map(day => `
              <div class="day-card">
                <div class="day-header">
                  <div>
                    <span class="day-badge">DIA ${day.dayNumber}</span>
                    <strong class="day-title">${day.park}</strong>
                    ${!settings.isFlexibleDates ? `<span class="day-date">(${formatDisplayDate(day.date, false)})</span>` : ''}
                  </div>
                  <span class="status-tag">🏰 Parque Temático</span>
                </div>
                ${cleanText(day.parkBooking?.notes) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a;">
                    <strong>🏰 Observação do Parque:</strong> ${cleanText(day.parkBooking?.notes)}
                  </div>
                ` : ''}
                ${cleanText(day.parkBooking?.ropeDropPlan) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #faf5ff; border-color: #e9d5ff; color: #581c87;">
                    <strong>⚡ Estratégia de Entrada (Rope Drop):</strong> ${cleanText(day.parkBooking?.ropeDropPlan)}
                  </div>
                ` : ''}
                ${cleanText(day.generalNotes) && cleanText(day.generalNotes) !== cleanText(day.parkBooking?.notes) ? `
                  <div class="info-guide-box" style="margin: 8px 0; background: #fffbeb; border-color: #fde68a; color: #78350f;">
                    <strong>📝 Observação do Dia:</strong> ${cleanText(day.generalNotes)}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Render option 6: transport
    else if (catKey === 'transport') {
      mainContentHtml = `
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Veículos / Transporte</span>
            <div class="metric-val">${carRentals?.length || 0} Veículo(s)</div>
            <span class="metric-sub">Locação Alugada</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Locadora Principal</span>
            <div class="metric-val">${mainCarRental?.company || 'Não informada'}</div>
            <span class="metric-sub">${mainCarRental?.category || 'Standard'}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Reserva</span>
            <div class="metric-val">${mainCarRental?.confirmationCode || 'N/A'}</div>
            <span class="metric-sub">Código da Locadora</span>
          </div>
        </div>

        <div class="space-y">
          ${(!carRentals || carRentals.length === 0) ? '<p class="empty-msg">Nenhum veículo de aluguel ou transfer cadastrado.</p>' : carRentals.map(car => `
            <div class="card-box">
              <div class="card-header">
                <span class="card-badge gold">🚗 ALUGUEL DE VEÍCULO</span>
                <strong class="card-title">${car.company}</strong>
              </div>
              <p style="margin-bottom: 6px;"><strong>Categoria do Veículo:</strong> ${car.category || 'Standard'}</p>
              <div class="grid-2">
                <div>
                  <strong>📍 Retirada:</strong> ${car.pickupLocation || 'Aeroporto'} <br/>
                  📅 ${formatDisplayDate(car.pickupDate, false)} às ${car.pickupTime || '12:00'}
                </div>
                <div>
                  <strong>📍 Devolução:</strong> ${car.returnLocation || 'Aeroporto'} <br/>
                  📅 ${formatDisplayDate(car.returnDate, false)} às ${car.returnTime || '12:00'}
                </div>
              </div>
              <div class="pnr-highlight-box">
                <strong>CÓDIGO DE RESERVA DA LOCADORA:</strong><br/>
                <span class="pnr-badge-lg">${car.confirmationCode || 'N/A'}</span>
              </div>
              ${car.notes ? `<p style="margin-top: 8px;"><strong>Observações da Locação:</strong> ${car.notes}</p>` : ''}
            </div>
          `).join('')}

          <div class="info-guide-box">
            <h3>ℹ️ Dicas Importantes de Pedágios & Estacionamentos na Flórida:</h3>
            <ul>
              <li><strong>Pedágios Automáticos (SunPass / TollPass):</strong> As rodovias de acesso aos aeroportos e parques possuem pedágios eletrônicos. O valor é debitado no cartão da locadora.</li>
              <li><strong>Estacionamento nos Parques:</strong> Custam aproximadamente US$ 30/dia nos parques Disney e Universal (grátis para hóspedes dos resorts oficiais Disney).</li>
            </ul>
          </div>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${info.title} — ${tripTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      padding: 30px;
      font-size: 13px;
      line-height: 1.5;
    }
    .no-print {
      margin-bottom: 25px;
      text-align: right;
    }
    .btn-print {
      background-color: #1A2B4C;
      color: #ffffff;
      border: 2px solid #D4AF37;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .btn-print:hover { background-color: #243860; }
    .header-box {
      background: linear-gradient(135deg, #1A2B4C 0%, #0d172a 100%);
      color: #ffffff;
      padding: 24px;
      border-radius: 16px;
      border: 2px solid #D4AF37;
      margin-bottom: 25px;
      box-shadow: 0 4px 12px rgba(26,43,76,0.15);
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(212,175,55,0.3);
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .header-badge {
      background: rgba(212,175,55,0.2);
      color: #D4AF37;
      font-weight: bold;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(212,175,55,0.4);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-date {
      font-size: 11px;
      color: #e2e8f0;
    }
    .header-title {
      font-size: 22px;
      font-weight: bold;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .header-sub {
      font-size: 12px;
      color: #cbd5e1;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 25px;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .metric-label {
      font-size: 10px;
      font-weight: bold;
      color: #64748b;
      text-transform: uppercase;
      display: block;
    }
    .metric-val {
      font-size: 16px;
      font-weight: bold;
      color: #1A2B4C;
      margin: 4px 0 2px 0;
    }
    .metric-sub {
      font-size: 10px;
      color: #94a3b8;
    }
    .section-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #1A2B4C;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .data-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 11px;
      font-weight: bold;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
    }
    .data-table td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      font-size: 11px;
      vertical-align: top;
    }
    .pnr-badge {
      background: #fef3c7;
      color: #78350f;
      font-family: monospace;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #fde68a;
    }
    .pnr-badge-lg {
      background: #fef3c7;
      color: #78350f;
      font-family: monospace;
      font-weight: bold;
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #fde68a;
      display: inline-block;
      margin-top: 4px;
    }
    .status-tag {
      background: #e0f2fe;
      color: #0369a1;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .card-box {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f1f5f9;
    }
    .card-badge {
      font-size: 10px;
      font-weight: bold;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .card-badge.blue { background: #dbeafe; color: #1e40af; }
    .card-badge.gold { background: #fef3c7; color: #92400e; }
    .card-title { font-size: 14px; color: #1A2B4C; }
    .card-sub { font-size: 11px; color: #64748b; margin-left: auto; }
    .flight-route-grid {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      margin: 10px 0;
      border: 1px solid #f1f5f9;
    }
    .route-box { flex: 1; }
    .route-arrow { font-size: 18px; color: #3b82f6; font-weight: bold; padding: 0 15px; }
    .route-label { font-size: 9px; font-weight: bold; color: #94a3b8; }
    .route-city { font-size: 13px; font-weight: bold; color: #0f172a; }
    .route-code { font-size: 11px; font-weight: bold; color: #2563eb; font-family: monospace; }
    .route-time { font-size: 11px; color: #475569; margin-top: 4px; }
    .pnr-highlight-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      padding: 10px;
      border-radius: 8px;
      margin-top: 10px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0; }
    .info-guide-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 14px;
      border-radius: 10px;
      margin-top: 15px;
      font-size: 11px;
    }
    .info-guide-box h3 { font-size: 12px; color: #1e40af; margin-bottom: 6px; }
    .info-guide-box ul { padding-left: 18px; }
    .day-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .day-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .day-badge {
      background: #1A2B4C;
      color: #D4AF37;
      font-weight: bold;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      margin-right: 8px;
    }
    .day-title { font-size: 14px; color: #0f172a; }
    .day-date { font-size: 11px; color: #64748b; margin-left: 6px; }
    .periods-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 10px;
    }
    .period-box {
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 11px;
    }
    .period-box.morning { background: #fffbeb; border: 1px solid #fef3c7; }
    .period-box.afternoon { background: #eff6ff; border: 1px solid #dbeafe; }
    .period-box.night { background: #e0e7ff; border: 1px solid #c7d2fe; }
    .schedule-sub { margin-top: 10px; }
    .time-badge { background: #334155; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 10px; }
    .empty-msg { color: #64748b; font-style: italic; padding: 10px 0; }
    .space-y > * + * { margin-top: 14px; }
    
    @media print {
      body { background: #ffffff; padding: 0; }
      .no-print { display: none !important; }
      .header-box { border: 1px solid #000; box-shadow: none; }
      .metrics-grid { page-break-inside: avoid; }
      .card-box, .day-card, .section-box { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  </div>

  <div class="header-box">
    <div class="header-top">
      <span class="header-badge">${info.icon} ${info.title}</span>
      <span class="header-date">Emitido em: ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
    <div class="header-title">${tripTitle}</div>
    <div class="header-sub">📍 ${destination} • 📅 ${fullPeriodText} • 👤 ${travelers} Viajante(s)</div>
  </div>

  ${mainContentHtml}

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`;
  };

  const handleGeneratePdf = (catKey: string) => {
    const htmlContent = buildCategoryPdfHtml(catKey);

    // Strategy 1: Open a dedicated print window
    try {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.focus();
        return;
      }
    } catch (e) {
      console.warn('window.open blocked, trying Blob URL...', e);
    }

    // Strategy 2: Blob URL download/open
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener,noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 2000);
      return;
    } catch (e) {
      console.warn('Blob fallback failed, trying DOM print...', e);
    }

    // Strategy 3: Fallback standard print
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div
      id="modal-master-overview-backdrop"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
    >
      <div
        id="modal-master-overview-content"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[90vh] max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 bg-[#D4AF37]/15 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start sm:items-center gap-3.5 relative z-10">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-md shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                  Visão Geral
                </span>
                <span className="text-[10px] bg-white/20 px-2.5 py-0.5 rounded-full text-white font-semibold">
                  {settings.durationDays} Dias de Viagem
                </span>
                <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full text-slate-200">
                  {settings.travelersCount} {settings.travelersCount === 1 ? 'Viajante' : 'Viajantes'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight">
                {categoryTitles[overviewCategory] || 'Visão Geral da Viagem'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-200 font-medium">
                📍 <strong>{settings.destination || 'Orlando, Flórida'}</strong> • 📅 {fullPeriodText}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10 shrink-0">
            {/* PDF Generator Button next to Close button for current active tab */}
            <button
              type="button"
              onClick={() => handleGeneratePdf(overviewCategory)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c4a02e] text-[#1A2B4C] font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer border border-amber-300 active:scale-95 shrink-0"
              title={`Gerar PDF da aba ativa: ${categoryTabNames[overviewCategory] || 'Geral'}`}
              id="btn-generate-tab-pdf"
            >
              <Printer className="w-4 h-4 text-[#1A2B4C]" />
              <span className="hidden sm:inline">Gerar PDF ({categoryTabNames[overviewCategory] || 'Geral'})</span>
              <span className="sm:hidden">PDF</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Fechar (Esc)"
              aria-label="Fechar"
              id="btn-close-overview-modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>



        {/* Modal Body with Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-800 flex-1 custom-scrollbar">

          {/* Category Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setOverviewCategory('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'all'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Geral & Dossiê</span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewCategory('itinerary')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'itinerary'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Programação Completa</span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewCategory('flights')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'flights'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Passagens Aéreas</span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewCategory('accommodations')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'accommodations'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Hotel className="w-3.5 h-3.5" />
              <span>Hospedagens</span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewCategory('parks')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'parks'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Parques & Ingressos</span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewCategory('transport')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                overviewCategory === 'transport'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Transporte</span>
            </button>
          </div>

          {/* TAB: PASSAGENS AÉREAS */}
          {overviewCategory === 'flights' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Flights Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Total de Voos</span>
                  <div className="text-lg font-bold font-serif text-blue-950 mt-0.5">
                    {flights?.length || 0} {flights?.length === 1 ? 'Bilhete' : 'Bilhetes'}
                  </div>
                  <span className="text-[10px] text-blue-700">
                    {groupedFlightSegments.length} {groupedFlightSegments.length === 1 ? 'Trecho agrupado' : 'Trechos agrupados'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-600 block">Companhias Aéreas</span>
                  <div className="text-lg font-bold font-serif text-slate-900 mt-0.5 truncate">
                    {Array.from(new Set((flights || []).map((f) => f.airline).filter(Boolean))).join(', ') || 'N/A'}
                  </div>
                  <span className="text-[10px] text-slate-500">Operando sua viagem</span>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Localizadores (PNR)</span>
                  <div className="text-lg font-bold font-serif text-amber-900 mt-0.5">
                    {Array.from(new Set((flights || []).map((f) => f.pnrLocator).filter((p) => p && p !== 'N/A'))).length || 0} Códigos
                  </div>
                  <span className="text-[10px] text-amber-700">Prontos para check-in</span>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">Passageiros Com Bilhete</span>
                  <div className="text-lg font-bold font-serif text-emerald-900 mt-0.5">
                    {settings.travelersCount} Viajantes
                  </div>
                  <span className="text-[10px] text-emerald-700">Documentação vinculada</span>
                </div>
              </div>

              {/* Flights Detailed List */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Plane className="w-4 h-4 text-blue-600" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Dossiê Completo de Voos ({groupedFlightSegments.length} Trechos)
                  </h4>
                </div>

                {groupedFlightSegments.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    Nenhum voo cadastrado no sistema ainda. Vá na aba "Passagens Aéreas" para adicionar.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupedFlightSegments.map((grp, idx) => {
                      const f = grp.flight;
                      const pnrsArr = Array.from(grp.pnrs);
                      const passengersArr = Array.from(grp.passengers);
                      const isOutbound = f.type === 'outbound';
                      const isInbound = f.type === 'inbound';

                      return (
                        <div
                          key={idx}
                          className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 shadow-xs hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <span className="flex items-center gap-1.5 font-bold text-xs text-[#1A2B4C]">
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[11px]">
                                {isOutbound ? '🛫 VOO DE IDA' : isInbound ? '🛬 VOO DE VOLTA' : '✈️ VOO INTERNO'}
                              </span>
                              <span className="text-blue-900 font-mono font-bold">
                                {f.airline} {f.flightNumber}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-slate-600 font-mono">
                              {f.cabinClass || 'Econômica'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Origem</span>
                              <p className="font-bold text-slate-900">{f.originCity || f.originAirport || 'Origem'}</p>
                              {f.originCode && <p className="text-[10px] font-mono text-blue-700 font-bold">{f.originCode}</p>}
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                🕒 Departure: <strong>{f.departureTime || '--:--'}</strong> ({formatDisplayDate(f.departureDate, false)})
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Destino</span>
                              <p className="font-bold text-slate-900">{f.destinationCity || f.destinationAirport || 'Destino'}</p>
                              {f.destinationCode && <p className="text-[10px] font-mono text-blue-700 font-bold">{f.destinationCode}</p>}
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                🛬 Arrival: <strong>{f.arrivalTime || '--:--'}</strong> ({formatDisplayDate(f.arrivalDate || f.departureDate, false)})
                              </p>
                            </div>
                          </div>

                          {/* PNR & Localizadores with Individual Copy Buttons */}
                          <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2">
                            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                              Código de Reserva / PNR (Localizador)
                            </span>
                            {pnrsArr.length > 0 ? (
                              <div className="space-y-1.5">
                                {pnrsArr.map((pnrCode, pnrIdx) => (
                                  <div
                                    key={pnrIdx}
                                    className="flex items-center justify-between gap-2 bg-amber-100/70 hover:bg-amber-100 p-2 rounded-lg border border-amber-200/80 transition-colors"
                                  >
                                    <span className="font-mono font-bold text-amber-950 text-sm tracking-wide">
                                      {pnrCode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(pnrCode)}
                                      className="px-2.5 py-1 rounded-md bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
                                      title={`Copiar PNR ${pnrCode}`}
                                    >
                                      {copiedCode === pnrCode ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                                          <span>Copiado!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>Copiar PNR</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 bg-amber-100/70 p-2 rounded-lg border border-amber-200/80">
                                <span className="font-mono font-bold text-amber-950 text-sm">
                                  {f.pnrLocator || 'N/A'}
                                </span>
                                {f.pnrLocator && f.pnrLocator !== 'N/A' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(f.pnrLocator)}
                                    className="px-2.5 py-1 rounded-md bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                                  >
                                    {copiedCode === f.pnrLocator ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>Copiado!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copiar PNR</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Passengers */}
                          {passengersArr.length > 0 && (
                            <div className="text-xs space-y-1 pt-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Users className="w-3 h-3 text-slate-400" /> Passageiros Vinculados ({passengersArr.length})
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {passengersArr.map((pName, pIdx) => (
                                  <span key={pIdx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-medium border border-slate-200">
                                    {pName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {f.baggageAllowance && (
                            <div className="text-[11px] text-slate-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100 flex items-center gap-1.5 flex-wrap">
                              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="font-bold text-slate-700">Bagagem:</span>
                              {typeof f.baggageAllowance === 'string' ? (
                                <span>{f.baggageAllowance}</span>
                              ) : typeof f.baggageAllowance === 'object' ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {f.baggageAllowance.personalItem && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Item Pessoal</span>
                                  )}
                                  {f.baggageAllowance.carryOnQty > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">{f.baggageAllowance.carryOnQty}x Mão (10kg)</span>
                                  )}
                                  {f.baggageAllowance.checkedQty > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">{f.baggageAllowance.checkedQty}x Despachada (23kg)</span>
                                  )}
                                  {f.baggageAllowance.notes && <span className="text-slate-500 italic">({f.baggageAllowance.notes})</span>}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: HOSPEDAGENS */}
          {overviewCategory === 'accommodations' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Accommodations Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Reservas de Hotel</span>
                  <div className="text-lg font-bold font-serif text-amber-950 mt-0.5">
                    {sortedAccommodations.length} {sortedAccommodations.length === 1 ? 'Hospedagem' : 'Hospedagens'}
                  </div>
                  <span className="text-[10px] text-amber-700">Confirmadas no sistema</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-600 block">Hotel Principal</span>
                  <div className="text-lg font-bold font-serif text-slate-900 mt-0.5 truncate">
                    {mainAccommodation?.name || 'Nenhuma'}
                  </div>
                  <span className="text-[10px] text-slate-500 truncate block">
                    {mainAccommodation?.address || 'Orlando, FL'}
                  </span>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Check-in Programado</span>
                  <div className="text-lg font-bold font-serif text-blue-950 mt-0.5">
                    {mainAccommodation ? formatDisplayDate(mainAccommodation.checkInDate, false) : '--/--'}
                  </div>
                  <span className="text-[10px] text-blue-700">
                    A partir das {mainAccommodation?.checkInTime || '15:00'}
                  </span>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">Check-out Programado</span>
                  <div className="text-lg font-bold font-serif text-emerald-950 mt-0.5">
                    {mainAccommodation ? formatDisplayDate(mainAccommodation.checkOutDate, false) : '--/--'}
                  </div>
                  <span className="text-[10px] text-emerald-700">
                    Até as {mainAccommodation?.checkOutTime || '11:00'}
                  </span>
                </div>
              </div>

              {/* Accommodations Detailed List */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Hotel className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Dossiê Completo de Hospedagem & Estadias ({sortedAccommodations.length})
                  </h4>
                </div>

                {!sortedAccommodations || sortedAccommodations.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    Nenhuma hospedagem cadastrada. Vá na aba "Hospedagens" para adicionar seu hotel ou casa.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedAccommodations.map((acc) => {
                      const mapsUrl = acc.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.name + ' ' + acc.address)}` : null;

                      return (
                        <div key={acc.id} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 shadow-xs hover:border-amber-300 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px]">
                                  {acc.type === 'disney_resort' ? '🏰 Resort Disney' : acc.type === 'universal_resort' ? '🎢 Resort Universal' : acc.type === 'vacation_home' ? '🏡 Casa de Temporada' : '🏨 Hotel Partner'}
                                </span>
                                <h5 className="font-serif font-bold text-slate-900 text-base">{acc.name}</h5>
                              </div>
                              {acc.address && (
                                <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{acc.address}</span>
                                  {mapsUrl && (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline flex items-center gap-0.5 font-semibold text-[11px] ml-1"
                                    >
                                      Maps <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </p>
                              )}
                            </div>

                            {acc.confirmationCode && (
                              <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 shrink-0">
                                <div className="text-right">
                                  <span className="text-[9px] uppercase font-bold text-amber-800 block">Voucher / Reserva</span>
                                  <span className="font-mono font-bold text-amber-950 text-xs">{acc.confirmationCode}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(acc.confirmationCode || '')}
                                  className="p-1 rounded-md bg-amber-200 hover:bg-amber-300 text-amber-900 transition-colors cursor-pointer"
                                  title="Copiar Código"
                                >
                                  {copiedCode === acc.confirmationCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Entrada (Check-in)</span>
                              <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(acc.checkInDate, false)}</p>
                              <p className="text-slate-600 text-[11px]">Horário previsto: <strong>{acc.checkInTime || '15:00'}</strong></p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Saída (Check-out)</span>
                              <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(acc.checkOutDate, false)}</p>
                              <p className="text-slate-600 text-[11px]">Horário limite: <strong>{acc.checkOutTime || '11:00'}</strong></p>
                            </div>
                          </div>

                          {acc.roomType && (
                            <div className="text-xs text-slate-700 pt-1">
                              <strong>Tipo de Acomodação:</strong> {acc.roomType}
                            </div>
                          )}

                          {acc.amenities && acc.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {acc.amenities.map((amenity, aIdx) => (
                                <span key={aIdx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                                  ✓ {amenity}
                                </span>
                              ))}
                            </div>
                          )}

                          {acc.notes && (
                            <p className="text-xs text-slate-600 bg-amber-50/40 p-2.5 rounded-xl border border-amber-100 italic">
                              "{acc.notes}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PARQUES & INGRESSOS */}
          {overviewCategory === 'parks' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Parks Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200">
                  <span className="text-[10px] font-bold uppercase text-purple-800 block">Pacotes de Ingressos</span>
                  <div className="text-lg font-bold font-serif text-purple-950 mt-0.5">
                    {parkTickets?.length || 0} Ingressos/Combos
                  </div>
                  <span className="text-[10px] text-purple-700">Comprados e vinculados</span>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Dias com Parque</span>
                  <div className="text-lg font-bold font-serif text-amber-900 mt-0.5">
                    {itineraryDays.filter((d) => isDayWithPark(d)).length} Dias Agendados
                  </div>
                  <span className="text-[10px] text-amber-700">Parques temáticos na Flórida</span>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Atividades Agendadas</span>
                  <div className="text-lg font-bold font-serif text-blue-900 mt-0.5">
                    {totalScheduleItems} Atrações
                  </div>
                  <span className="text-[10px] text-blue-700">Com horários na agenda</span>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">Status dos Ingressos</span>
                  <div className="text-lg font-bold font-serif text-emerald-900 mt-0.5">
                    {parkTickets?.filter((t) => t.paymentStatus === 'Pago').length || 0} / {parkTickets?.length || 0} Pagos
                  </div>
                  <span className="text-[10px] text-emerald-700">Vouchers prontos</span>
                </div>
              </div>

              {/* Section A: Ingressos Comprados & Vouchers */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Ticket className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Vouchers & Ingressos Cadastrados ({parkTickets?.length || 0})
                  </h4>
                </div>

                {!parkTickets || parkTickets.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    Nenhum pacote de ingresso cadastrado ainda. Vá na aba "Parques e Ingressos" para adicionar.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {parkTickets.map((tk) => (
                      <div key={tk.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 shadow-xs hover:border-purple-300 transition-colors">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                              {tk.complex || 'Complexo'}
                            </span>
                            <h5 className="font-bold text-slate-900 text-xs mt-1">{tk.title}</h5>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tk.paymentStatus === 'Pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {tk.paymentStatus || 'Pendente'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-purple-50/60 p-2 rounded-xl border border-purple-100 text-xs">
                          <div>
                            <span className="text-[9px] font-bold uppercase text-purple-900 block">Voucher / Confirmação</span>
                            <span className="font-mono font-bold text-purple-950 text-xs">{tk.confirmationCode || 'Não informado'}</span>
                          </div>
                          {tk.confirmationCode && (
                            <button
                              type="button"
                              onClick={() => handleCopy(tk.confirmationCode || '')}
                              className="px-2 py-1 rounded-md bg-purple-200 hover:bg-purple-300 text-purple-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedCode === tk.confirmationCode ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                              <span>Copiar</span>
                            </button>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600 space-y-0.5">
                          <p><strong>Tipo:</strong> {tk.type === 'combo' ? 'Combo Multi-Parques' : 'Ingresso Individual'} ({tk.daysCount} {tk.daysCount === 1 ? 'dia' : 'dias'})</p>
                          {tk.parksIncluded && tk.parksIncluded.length > 0 && (
                            <p><strong>Parques:</strong> {tk.parksIncluded.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section A2: Pacotes de Fotos & Memory Maker */}
              {photoPackagesList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <Camera className="w-4 h-4 text-purple-600" />
                    <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                      Pacotes de Fotos & Memory Maker ({photoPackagesList.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {photoPackagesList.map((pkg) => (
                      <div key={pkg.id} className="p-3.5 bg-white rounded-2xl border border-purple-200 space-y-2.5 shadow-xs hover:border-purple-400 transition-colors">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                              <Camera className="w-4 h-4" />
                            </span>
                            <div>
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                                {pkg.complex || 'Complexo'}
                              </span>
                              <h5 className="font-bold text-slate-900 text-xs mt-0.5">{pkg.name}</h5>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {pkg.status || 'Ativo'}
                          </span>
                        </div>

                        {pkg.code && (
                          <div className="flex items-center justify-between bg-purple-50 p-2 rounded-xl border border-purple-100 text-xs">
                            <div>
                              <span className="text-[9px] font-bold uppercase text-purple-900 block">Voucher / Confirmação</span>
                              <span className="font-mono font-bold text-purple-950 text-xs">{pkg.code}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(pkg.code || '')}
                              className="px-2 py-1 rounded-md bg-purple-200 hover:bg-purple-300 text-purple-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              {copiedCode === pkg.code ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                              <span>Copiar</span>
                            </button>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-600 space-y-0.5">
                          {pkg.notes && <p><strong>Detalhes:</strong> {pkg.notes}</p>}
                          {pkg.source && <p className="text-[10px] text-slate-400">Origem: {pkg.source}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section B: Cronograma Diário de Parques */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Cronograma de Parques Agendados no Roteiro
                  </h4>
                </div>

                <div className="space-y-3">
                  {itineraryDays.filter((d) => isDayWithPark(d)).map((day) => (
                    <div key={day.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-[#1A2B4C] text-[#D4AF37] font-bold text-xs">
                            DIA {day.dayNumber}
                          </span>
                          <span className="font-serif font-bold text-slate-900 text-sm">
                            {day.park}
                          </span>
                          {!settings.isFlexibleDates && (
                            <span className="text-xs text-slate-500 font-medium">
                              ({formatDisplayDate(day.date, false)})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                          Parque Temático
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="font-bold text-[#1A2B4C] block text-[10px]">🌅 Rope Drop / Manhã</span>
                          <p className="text-slate-700 text-[11px]">{day.morning.where || 'Abertura do parque'}</p>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="font-bold text-[#1A2B4C] block text-[10px]">☀️ Tarde & Atrações</span>
                          <p className="text-slate-700 text-[11px]">{day.afternoon.where || 'Passeio pelo parque'}</p>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="font-bold text-[#1A2B4C] block text-[10px]">🌙 Encerramento / Shows</span>
                          <p className="text-slate-700 text-[11px]">{day.night.where || 'Show noturno'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TRANSPORTE */}
          {overviewCategory === 'transport' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Transport Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">Modalidade Principal</span>
                  <div className="text-lg font-bold font-serif text-emerald-950 mt-0.5 truncate">
                    {carRentals && carRentals.length > 0
                      ? 'Carro Alugado'
                      : settings.transportModality === 'uber'
                      ? 'Uber / Aplicativos'
                      : settings.transportModality === 'public'
                      ? 'Transporte Público'
                      : settings.transportModality === 'mixed'
                      ? 'Misto / Variante'
                      : settings.transportModality === 'rental'
                      ? 'Carro Alugado'
                      : 'Não Informada'}
                  </div>
                  <span className="text-[10px] text-emerald-700 block truncate">
                    {carRentals && carRentals.length > 0
                      ? `${carRentals.length} ${carRentals.length === 1 ? 'reserva cadastrada' : 'reservas cadastradas'}`
                      : settings.transportModality
                      ? 'Definido no planejamento'
                      : 'Pendente de cadastro'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-600 block">Locadora de Veículos</span>
                  <div className="text-lg font-bold font-serif text-slate-900 mt-0.5 truncate">
                    {mainCarRental?.company || 'Não cadastrada'}
                  </div>
                  <span className="text-[10px] text-slate-500 block truncate">
                    {mainCarRental?.pickupLocation || (mainCarRental ? 'Local de retirada não informado' : 'Nenhuma locadora cadastrada')}
                  </span>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Categoria do Veículo</span>
                  <div className="text-lg font-bold font-serif text-blue-950 mt-0.5 truncate">
                    {mainCarRental?.category || 'Não informada'}
                  </div>
                  <span className="text-[10px] text-blue-700 block truncate">
                    {mainCarRental?.driverName ? `Motorista: ${mainCarRental.driverName}` : (mainCarRental ? 'Categoria cadastrada' : 'Sem categoria')}
                  </span>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Voucher do Carro</span>
                  <div className="text-lg font-bold font-serif text-amber-900 mt-0.5 truncate font-mono">
                    {mainCarRental?.confirmationCode || 'Sem voucher'}
                  </div>
                  <span className="text-[10px] text-amber-700 block truncate">
                    {mainCarRental?.confirmationCode ? 'Código cadastrado' : (mainCarRental ? 'Aguardando código' : 'Nenhum voucher cadastrado')}
                  </span>
                </div>
              </div>

              {/* Transport Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Car className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Dossiê Completo de Locação & Mobilidade
                  </h4>
                </div>

                {!carRentals || carRentals.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    Nenhum carro alugado cadastrado no sistema. Vá na aba "Transporte" para cadastrar sua locadora.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {carRentals.map((car) => (
                      <div key={car.id} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 shadow-xs hover:border-emerald-300 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-bold text-xs">
                              🚗 {car.company || 'Locadora'}
                            </span>
                            <h5 className="font-bold text-slate-900 text-base">{car.category || 'Veículo Alugado'}</h5>
                          </div>

                          {car.confirmationCode && (
                            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                              <div className="text-right">
                                <span className="text-[9px] uppercase font-bold text-emerald-800 block">Código da Reserva</span>
                                <span className="font-mono font-bold text-emerald-950 text-xs">{car.confirmationCode}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(car.confirmationCode || '')}
                                className="p-1 rounded-md bg-emerald-200 hover:bg-emerald-300 text-emerald-900 transition-colors cursor-pointer"
                                title="Copiar Voucher"
                              >
                                {copiedCode === car.confirmationCode ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Retirada (Pick-Up)</span>
                            <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(car.pickupDate, false)} às {car.pickupTime || '--:--'}</p>
                            <p className="text-slate-600 text-[11px] mt-0.5">📍 {car.pickupLocation || 'Local não informado'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Devolução (Drop-Off)</span>
                            <p className="font-bold text-slate-900 text-sm">{formatDisplayDate(car.dropoffDate, false)} às {car.dropoffTime || '--:--'}</p>
                            <p className="text-slate-600 text-[11px] mt-0.5">📍 {car.dropoffLocation || 'Local não informado'}</p>
                          </div>
                        </div>

                        {/* Driver & Insurance info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {car.primaryDriver && (
                            <p className="text-slate-700"><strong>Motorista Principal:</strong> {car.primaryDriver}</p>
                          )}
                          {car.insuranceOption && (
                            <p className="text-slate-700"><strong>Seguro Incluído:</strong> {car.insuranceOption}</p>
                          )}
                        </div>

                        {/* Tolls & Parking Guide */}
                        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs space-y-1">
                          <span className="font-bold text-blue-900 flex items-center gap-1.5 text-[11px]">
                            <Info className="w-3.5 h-3.5 text-blue-600" /> Dicas Rápidas de Pedágio e Estacionamento
                          </span>
                          <p className="text-slate-600 text-[11px]">
                            • <strong>Pedágios na Flórida:</strong> A maioria das rodovias (como a SR-528 e 417 do aeroporto) usa pedágio automático (SunPass / TollPass).
                          </p>
                          <p className="text-slate-600 text-[11px]">
                            • <strong>Estacionamento nos Parques:</strong> Custam US$ 30/dia nos parques Disney e Universal (grátis para hóspedes dos resorts oficiais Disney).
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ROTEIRO DIA A DIA */}
          {overviewCategory === 'itinerary' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Quick Metrics Bar / Cardes Superiores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Duração Total</span>
                  <div className="text-lg font-bold font-serif text-[#1A2B4C] mt-0.5">
                    {settings.durationDays} Dias
                  </div>
                  <span className="text-[10px] text-slate-500 truncate block">
                    Início: {formatDisplayDate(settings.startDate, false)}
                  </span>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">Progresso do Roteiro</span>
                  <div className="text-lg font-bold font-serif text-emerald-800 mt-0.5">
                    {completedDaysCount} / {itineraryDays.length} Dias
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    {Math.round((completedDaysCount / (itineraryDays.length || 1)) * 100)}% concluído
                  </span>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Parques e Atrações</span>
                  <div className="text-lg font-bold font-serif text-amber-900 mt-0.5">
                    {itineraryDays.filter((d) => isDayWithPark(d)).length} Parques
                  </div>
                  <span className="text-[10px] text-amber-700">
                    {itineraryDays.filter((d) => !isDayWithPark(d)).length} Dias Livres/Compras
                  </span>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Tabela Hora a Hora</span>
                  <div className="text-lg font-bold font-serif text-blue-900 mt-0.5">
                    {totalScheduleItems} {totalScheduleItems === 1 ? 'Atividade' : 'Atividades'}
                  </div>
                  <span className="text-[10px] text-blue-700">
                    Dólar Base: R$ {(settings.dollarRate || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                    Programação Completa dos {itineraryDays.length} Dias
                  </h4>
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={overviewSearchQuery}
                    onChange={(e) => setOverviewSearchQuery(e.target.value)}
                    placeholder="Filtrar por parque, atração, horário..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]"
                  />
                  {overviewSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOverviewSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {filteredDays.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    Nenhum dia ou atividade encontrada para "{overviewSearchQuery}".
                  </div>
                ) : (
                  filteredDays.map((day) => {
                    const dayHasPark = isDayWithPark(day);
                    const items = day.hourlySchedule || [];
                    const dateStr = formatDisplayDate(day.date, false);

                    return (
                      <div
                        key={day.id}
                        className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-lg bg-[#1A2B4C] text-[#D4AF37] font-bold text-xs">
                              DIA {day.dayNumber}
                            </span>
                            <span className="font-serif font-bold text-slate-900 text-sm sm:text-base">
                              {day.title || day.park || 'Sem Parque'}
                            </span>
                            {!settings.isFlexibleDates && (
                              <span className="text-xs text-slate-500 font-medium">
                                ({dateStr})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                dayHasPark
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              {day.park || 'Sem Parque'}
                            </span>
                            {day.completed && (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Concluído
                              </span>
                            )}
                          </div>
                        </div>

                        {isArrivalInBrazilDay(day) && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs font-semibold text-slate-600">
                            🛬 Chegada ao Brasil — Viagem concluída.
                          </div>
                        )}

                        {/* Observação do Dia (Todos os dias) */}
                        {cleanText(day.generalNotes) && (
                          <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                            <div className="font-bold flex items-center gap-1.5 text-amber-900 text-[11px] uppercase tracking-wider">
                              <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Observação do Dia</span>
                            </div>
                            <p className="text-amber-950 font-medium whitespace-pre-line leading-relaxed">
                              {cleanText(day.generalNotes)}
                            </p>
                          </div>
                        )}

                        {/* Observação do Parque (Dias de Parque) */}
                        {dayHasPark && cleanText(day.parkBooking?.notes) && cleanText(day.parkBooking?.notes) !== cleanText(day.generalNotes) && (
                          <div className="p-3 bg-blue-50/90 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
                            <div className="font-bold flex items-center justify-between gap-1.5 text-blue-900 text-[11px] uppercase tracking-wider">
                              <span className="flex items-center gap-1.5">
                                <Ticket className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                <span>Observação do Parque ({day.park})</span>
                              </span>
                              {day.parkBooking?.ticketType && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                                  {resolveTicketName(day.parkBooking.ticketType)}
                                </span>
                              )}
                            </div>
                            <p className="text-blue-950 font-medium whitespace-pre-line leading-relaxed">
                              {cleanText(day.parkBooking?.notes)}
                            </p>
                          </div>
                        )}

                        {/* Estratégia de Entrada / Rope Drop (Dias de Parque) */}
                        {dayHasPark && cleanText(day.parkBooking?.ropeDropPlan) && (
                          <div className="p-3 bg-purple-50/90 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                            <div className="font-bold flex items-center gap-1.5 text-purple-900 text-[11px] uppercase tracking-wider">
                              <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>Estratégia de Entrada (Rope Drop)</span>
                            </div>
                            <p className="text-purple-950 font-medium whitespace-pre-line leading-relaxed">
                              {cleanText(day.parkBooking?.ropeDropPlan)}
                            </p>
                          </div>
                        )}

                        {/* Pacote de Fotos / PhotoPass (se houver e for registrado) */}
                        {(() => {
                          const dayPhotoPkg = getPhotoPackageForDay(day, photoPackagesList);
                          if (!dayPhotoPkg) return null;
                          return (
                            <div className="p-3 bg-purple-50/90 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                              <div className="font-bold flex items-center justify-between gap-1.5 text-purple-900 text-[11px] uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                  <Camera className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                  <span>Pacote de Fotos (PhotoPass / Memory Maker)</span>
                                </span>
                                {dayPhotoPkg.code && (
                                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                    #{dayPhotoPkg.code}
                                  </span>
                                )}
                              </div>
                              <p className="text-purple-950 font-medium leading-relaxed">
                                {dayPhotoPkg.name || 'Pacote de Fotos Ativo'}
                                {dayPhotoPkg.notes && ` — ${dayPhotoPkg.notes}`}
                              </p>
                            </div>
                          );
                        })()}

                        {items.length > 0 && (
                          <div className="pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                              Horários Agendados ({items.length})
                            </span>
                            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden text-xs">
                              {items.map((item) => (
                                <div key={item.id} className="p-2 sm:px-3 flex items-start gap-3 hover:bg-slate-50">
                                  <span className="px-2 py-0.5 rounded-md bg-[#1A2B4C] text-[#D4AF37] font-mono font-bold text-[11px] shrink-0 mt-0.5">
                                    {item.time || '08:00'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-900 truncate">{item.title}</span>
                                      {item.location && (
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                                          <MapPin className="w-3 h-3" /> {item.location}
                                        </span>
                                      )}
                                    </div>
                                    {item.notes && (
                                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{item.notes}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB: GERAL (ALL) */}
          {overviewCategory === 'all' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Duração Total</span>
                  <div className="text-lg font-bold font-serif text-[#1A2B4C] mt-0.5">
                    {settings.durationDays} Dias
                  </div>
                  <span className="text-[10px] text-slate-500 truncate block">
                    Início: {formatDisplayDate(settings.startDate, false)}
                  </span>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">Progresso do Roteiro</span>
                  <div className="text-lg font-bold font-serif text-emerald-800 mt-0.5">
                    {completedDaysCount} / {itineraryDays.length} Dias
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    {Math.round((completedDaysCount / (itineraryDays.length || 1)) * 100)}% concluído
                  </span>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Parques e Atrações</span>
                  <div className="text-lg font-bold font-serif text-amber-900 mt-0.5">
                    {itineraryDays.filter((d) => isDayWithPark(d)).length} Parques
                  </div>
                  <span className="text-[10px] text-amber-700">
                    {itineraryDays.filter((d) => !isDayWithPark(d)).length} Dias Livres/Compras
                  </span>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Tabela Hora a Hora</span>
                  <div className="text-lg font-bold font-serif text-blue-900 mt-0.5">
                    {totalScheduleItems} {totalScheduleItems === 1 ? 'Atividade' : 'Atividades'}
                  </div>
                  <span className="text-[10px] text-blue-700">
                    Dólar Base: R$ {(settings.dollarRate || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Quick Logistics Dossier (Flights, Hotel, Car) */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  <Plane className="w-4 h-4 text-[#D4AF37]" />
                  <span>Dossiê Rápido de Logística & Transportes</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
                  {/* Flight Box */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs flex flex-col justify-between min-h-[160px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1.5 shrink-0">
                      <span className="flex items-center gap-1.5">
                        <Plane className="w-3.5 h-3.5 text-blue-600" />
                        Passagens Aéreas
                      </span>
                      {groupedFlightSegments && groupedFlightSegments.length > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-semibold">
                          {groupedFlightSegments.length} {groupedFlightSegments.length === 1 ? 'Trecho' : 'Trechos'}
                        </span>
                      )}
                    </div>

                    {groupedFlightSegments && groupedFlightSegments.length > 0 ? (
                      <div className="space-y-2 text-xs flex-1">
                        {groupedFlightSegments.map((grp, idx) => {
                          const f = grp.flight;
                          const pnrsArr = Array.from(grp.pnrs);
                          return (
                            <div key={idx} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between font-bold text-slate-800 text-[11px]">
                                <span>{f.type === 'outbound' ? '🛫 Ida' : f.type === 'inbound' ? '🛬 Volta' : '✈️ Voo'}</span>
                                <span className="text-blue-700 font-mono">{f.airline} {f.flightNumber}</span>
                              </div>
                              <div className="text-[10px] text-slate-600 font-medium leading-tight">
                                {f.originCity || f.originAirport} ➔ {f.destinationCity || f.destinationAirport}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                <span>{formatDisplayDate(f.departureDate, false)} às {f.departureTime || '--:--'}</span>
                                <span className="font-mono font-bold text-slate-700">
                                  LOC: {pnrsArr.length > 0 ? pnrsArr.join(', ') : (f.pnrLocator || 'N/A')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-[11px] py-2">Nenhum voo cadastrado.</p>
                    )}
                  </div>

                  {/* Hotel Box */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs flex flex-col justify-between min-h-[160px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1.5 shrink-0">
                      <span className="flex items-center gap-1.5">
                        <Hotel className="w-3.5 h-3.5 text-amber-600" />
                        Hospedagem & Hotel
                      </span>
                      {accommodations && accommodations.length > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold">
                          {accommodations.length} {accommodations.length === 1 ? 'Reserva' : 'Reservas'}
                        </span>
                      )}
                    </div>

                    {accommodations && accommodations.length > 0 ? (
                      <div className="space-y-2 text-xs flex-1">
                        {accommodations.map((acc, idx) => (
                          <div key={acc.id || idx} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 shadow-2xs">
                            <p className="font-bold text-slate-900 text-xs leading-snug">{acc.name}</p>
                            <p className="text-[10px] text-slate-600 leading-snug">{acc.address || 'Endereço não informado'}</p>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                              <span>In: {formatDisplayDate(acc.checkInDate, false)}</span>
                              <span>Out: {formatDisplayDate(acc.checkOutDate, false)}</span>
                            </div>
                            {acc.confirmationCode && (
                              <p className="text-[10px] text-amber-700 font-mono font-semibold pt-0.5">
                                Cod: {acc.confirmationCode}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-[11px] py-2">Nenhuma hospedagem cadastrada.</p>
                    )}
                  </div>

                  {/* Car Box */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs flex flex-col justify-between min-h-[160px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1.5 shrink-0">
                      <span className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-emerald-600" />
                        Locação de Carro
                      </span>
                      {carRentals && carRentals.length > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold">
                          {carRentals.length} {carRentals.length === 1 ? 'Reserva' : 'Reservas'}
                        </span>
                      )}
                    </div>

                    {carRentals && carRentals.length > 0 ? (
                      <div className="space-y-2 text-xs flex-1">
                        {carRentals.map((car, idx) => (
                          <div key={car.id || idx} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 shadow-2xs">
                            <p className="font-bold text-slate-900 text-xs leading-snug">
                              {car.company || 'Locadora'} • {car.category || 'Veículo'}
                            </p>
                            <p className="text-[10px] text-slate-600 leading-snug">
                              Retirada: {car.pickupLocation || 'Local não informado'}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                              <span>{formatDisplayDate(car.pickupDate, false)}</span>
                              <span>{formatDisplayDate(car.dropoffDate, false)}</span>
                            </div>
                            {car.confirmationCode && (
                              <p className="text-[10px] text-emerald-700 font-mono font-semibold pt-0.5">
                                Reserva: {car.confirmationCode}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-[11px] py-2">Nenhum carro alugado cadastrado.</p>
                    )}
                  </div>

                  {/* Photo Package Box */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs flex flex-col justify-between min-h-[160px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#1A2B4C] border-b border-slate-200 pb-1.5 shrink-0">
                      <span className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-purple-600" />
                        Pacote de Fotos
                      </span>
                      {photoPackagesList.length > 0 && (
                        <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-semibold">
                          {photoPackagesList.length} {photoPackagesList.length === 1 ? 'Ativo' : 'Ativos'}
                        </span>
                      )}
                    </div>

                    {photoPackagesList.length > 0 ? (
                      <div className="space-y-2 text-xs flex-1">
                        {photoPackagesList.map((pkg, idx) => (
                          <div key={pkg.id || idx} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 shadow-2xs">
                            <p className="font-bold text-slate-900 text-xs leading-snug">
                              {pkg.name}
                            </p>
                            <p className="text-[10px] text-purple-700 font-semibold leading-snug">
                              {pkg.complex || 'Memory Maker'}
                            </p>
                            {pkg.code && (
                              <p className="text-[10px] text-slate-700 font-mono font-semibold pt-1 border-t border-slate-100">
                                Voucher: {pkg.code}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-[11px] py-2">Nenhum pacote de fotos cadastrado.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Detailed Day-by-Day Itinerary Table */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                    <h4 className="text-sm font-bold text-[#1A2B4C] uppercase tracking-wider">
                      Programação Completa dos {itineraryDays.length} Dias
                    </h4>
                  </div>

                  <div className="relative min-w-[240px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={overviewSearchQuery}
                      onChange={(e) => setOverviewSearchQuery(e.target.value)}
                      placeholder="Filtrar por parque, atração, horário..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]"
                    />
                    {overviewSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setOverviewSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {filteredDays.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                      Nenhum dia ou atividade encontrada para "{overviewSearchQuery}".
                    </div>
                  ) : (
                    filteredDays.map((day) => {
                      const dayHasPark = isDayWithPark(day);
                      const items = day.hourlySchedule || [];
                      const dateStr = formatDisplayDate(day.date, false);

                      return (
                        <div
                          key={day.id}
                          className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 hover:border-slate-300 transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                            <div className="flex items-center gap-2.5">
                              <span className="px-2.5 py-1 rounded-lg bg-[#1A2B4C] text-[#D4AF37] font-bold text-xs">
                                DIA {day.dayNumber}
                              </span>
                              <span className="font-serif font-bold text-slate-900 text-sm sm:text-base">
                                {day.title || day.park || 'Sem Parque'}
                              </span>
                              {!settings.isFlexibleDates && (
                                <span className="text-xs text-slate-500 font-medium">
                                  ({dateStr})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  dayHasPark
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-slate-200 text-slate-700 border-slate-300'
                                }`}
                              >
                                {day.park || 'Sem Parque'}
                              </span>
                              {day.completed && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Concluído
                                </span>
                              )}
                            </div>
                          </div>

                          {isArrivalInBrazilDay(day) && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs font-semibold text-slate-600">
                              🛬 Chegada ao Brasil — Viagem concluída.
                            </div>
                          )}

                          {/* Observação do Dia (Todos os dias) */}
                          {cleanText(day.generalNotes) && (
                            <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                              <div className="font-bold flex items-center gap-1.5 text-amber-900 text-[11px] uppercase tracking-wider">
                                <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Observação do Dia</span>
                              </div>
                              <p className="text-amber-950 font-medium whitespace-pre-line leading-relaxed">
                                {cleanText(day.generalNotes)}
                              </p>
                            </div>
                          )}

                          {/* Observação do Parque (Dias de Parque) */}
                          {dayHasPark && cleanText(day.parkBooking?.notes) && cleanText(day.parkBooking?.notes) !== cleanText(day.generalNotes) && (
                            <div className="p-3 bg-blue-50/90 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
                              <div className="font-bold flex items-center justify-between gap-1.5 text-blue-900 text-[11px] uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                  <Ticket className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                  <span>Observação do Parque ({day.park})</span>
                                </span>
                                {day.parkBooking?.ticketType && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                                    {resolveTicketName(day.parkBooking.ticketType)}
                                  </span>
                                )}
                              </div>
                              <p className="text-blue-950 font-medium whitespace-pre-line leading-relaxed">
                                {cleanText(day.parkBooking?.notes)}
                              </p>
                            </div>
                          )}

                          {/* Estratégia de Entrada / Rope Drop (Dias de Parque) */}
                          {dayHasPark && cleanText(day.parkBooking?.ropeDropPlan) && (
                            <div className="p-3 bg-purple-50/90 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                              <div className="font-bold flex items-center gap-1.5 text-purple-900 text-[11px] uppercase tracking-wider">
                                <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span>Estratégia de Entrada (Rope Drop)</span>
                              </div>
                              <p className="text-purple-950 font-medium whitespace-pre-line leading-relaxed">
                                {cleanText(day.parkBooking?.ropeDropPlan)}
                              </p>
                            </div>
                          )}

                          {/* Pacote de Fotos / PhotoPass (se houver e for registrado) */}
                          {dayHasPark && (() => {
                            const dayPhotoPkg = getPhotoPackageForDay(day, photoPackagesList);
                            if (!dayPhotoPkg) return null;
                            return (
                              <div className="p-3 bg-purple-50/90 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                                <div className="font-bold flex items-center justify-between gap-1.5 text-purple-900 text-[11px] uppercase tracking-wider">
                                  <span className="flex items-center gap-1.5">
                                    <Camera className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    <span>Pacote de Fotos (PhotoPass / Memory Maker)</span>
                                  </span>
                                  {dayPhotoPkg.code && (
                                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                      #{dayPhotoPkg.code}
                                    </span>
                                  )}
                                </div>
                                <p className="text-purple-950 font-medium leading-relaxed">
                                  {dayPhotoPkg.name || 'Pacote de Fotos Ativo'}
                                  {dayPhotoPkg.notes && ` — ${dayPhotoPkg.notes}`}
                                </p>
                              </div>
                            );
                          })()}

                          {items.length > 0 && (
                            <div className="pt-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                                Horários Agendados ({items.length})
                              </span>
                              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden text-xs">
                                {items.map((item) => (
                                  <div key={item.id} className="p-2 sm:px-3 flex items-start gap-3 hover:bg-slate-50">
                                    <span className="px-2 py-0.5 rounded-md bg-[#1A2B4C] text-[#D4AF37] font-mono font-bold text-[11px] shrink-0 mt-0.5">
                                      {item.time || '08:00'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-900 truncate">{item.title}</span>
                                        {item.location && (
                                          <span className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                                            <MapPin className="w-3 h-3" /> {item.location}
                                          </span>
                                        )}
                                      </div>
                                      {item.notes && (
                                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{item.notes}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 rounded-2xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-sm shadow-md transition-all cursor-pointer active:scale-95"
            id="btn-close-overview-footer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
