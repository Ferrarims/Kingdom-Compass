import React from 'react';
import {
  Home,
  Compass,
  CalendarDays,
  MapPin,
  Plane,
  Car,
  Hotel,
  Map,
  FileText,
  DollarSign,
  CheckSquare,
  Luggage,
  Sparkles,
  Users,
  ChevronRight,
  Clock,
  Lock,
  LogOut,
} from 'lucide-react';
import { usePlanner, formatDisplayDate } from '../context/PlannerContext';
import { isDayWithPark } from '../utils/parkScheduleUtils';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const {
    activeTab,
    setActiveTab,
    settings,
    daysCountdown,
    overallProgress,
    setIsSettingsOpen,
    currentUser,
    flights,
    carRentals,
    accommodations = [],
    trips,
    activeTripId,
    selectTrip,
    authSession,
    logoutCode,
    itineraryDays = [],
  } = usePlanner();

  const tripDaysWithParks = itineraryDays.filter(isDayWithPark);

  const isTripUnlocked = Boolean(
    trips.length > 0 &&
    activeTripId &&
    authSession &&
    trips.some((t) => t.id === activeTripId)
  );

  const menuSections = [
    {
      category: 'Geral',
      items: [
        { id: 'home', label: 'Minhas Viagens', icon: Home },
        { id: 'journey', label: 'Painel da Viagem', icon: Compass },
      ],
    },
    {
      category: 'Roteiro & Programação',
      items: [
        { id: 'schedule', label: 'Planeje a Data', icon: CalendarDays },
        { id: 'itinerary', label: 'Roteiro Dia a Dia', icon: MapPin, badge: `${settings.durationDays}d` },
        { id: 'map', label: 'Mapa da Viagem', icon: Map },
      ],
    },
    {
      category: 'Reservas & Logística',
      items: [
        { id: 'flights', label: 'Passagens Aéreas', icon: Plane, badge: `${flights.length}` },
        { id: 'accommodations', label: 'Hospedagem', icon: Hotel, badge: `${accommodations.length}` },
        { id: 'transport', label: 'Transporte', icon: Car, badge: `${carRentals.length}` },
        { id: 'parks', label: 'Parques', icon: Sparkles, badge: `${tripDaysWithParks.length}` },
      ],
    },
    {
      category: 'Preparação & Custos',
      items: [
        { id: 'preparations', label: 'Preparativos & Docs', icon: CheckSquare },
        { id: 'baggage', label: 'Minha Mala', icon: Luggage },
        { id: 'financial', label: 'Planejamento Financeiro', icon: DollarSign },
      ],
    },
  ];

  const handleSelectTab = (id: string, isLocked: boolean) => {
    if (isLocked) return;
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          id="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#1A2B4C] text-white flex flex-col justify-between shrink-0 border-r border-[#D4AF37]/30 shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#D4AF37]/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8952B] flex items-center justify-center text-[#1A2B4C] shadow-md shrink-0">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-[#D4AF37] font-serif text-lg leading-tight font-bold tracking-tight">
              KingdomCompass
            </h1>
            <span className="text-slate-300 text-xs font-sans tracking-wide">Orlando Magic Planner</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {menuSections.map((section, idx) => (
            <div key={section.category || idx} className="space-y-1">
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold tracking-wider text-[#D4AF37]/80 uppercase">
                {section.category}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isHome = item.id === 'home';
                const isLocked = !isHome && !isTripUnlocked;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => handleSelectTab(item.id, isLocked)}
                    disabled={isLocked}
                    title={isLocked ? 'Bloqueado: Acesse ou cadastre uma viagem no Portal para liberar' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left group ${
                      isLocked
                        ? 'opacity-35 text-slate-500 cursor-not-allowed select-none bg-transparent hover:bg-transparent'
                        : isActive
                        ? 'bg-[#D4AF37]/15 text-white border-l-4 border-[#D4AF37] font-semibold cursor-pointer'
                        : 'text-slate-300 hover:bg-white/5 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div
                        className={`w-5 h-5 rounded-xs flex items-center justify-center shrink-0 transition-all ${
                          isLocked
                            ? 'border border-slate-700/60 bg-slate-800/40 text-slate-500'
                            : isActive
                            ? 'bg-[#D4AF37] text-[#1A2B4C]'
                            : 'border border-slate-500 text-slate-400'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs sm:text-sm truncate">{item.label}</span>
                    </div>

                    {isLocked ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
                    ) : item.badge ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 shrink-0 ${
                          isActive
                            ? 'bg-[#D4AF37] text-[#1A2B4C]'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Sair da Viagem Button */}
          {authSession && (
            <div className="pt-2 border-t border-[#D4AF37]/10 mt-2">
              <button
                id="nav-logout"
                onClick={() => {
                  logoutCode();
                  setActiveTab('home');
                  setMobileOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left text-red-300 hover:bg-red-500/10 hover:text-red-100 cursor-pointer group"
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className="w-5 h-5 rounded-xs flex items-center justify-center shrink-0 border border-red-500/30 text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all">
                    <LogOut className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs sm:text-sm truncate font-medium">Sair da Viagem</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
