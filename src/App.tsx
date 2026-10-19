import React, { useState } from 'react';
import { PlannerProvider, usePlanner } from './context/PlannerContext';
import { Sidebar } from './components/Sidebar';
import { CollaboratorBar } from './components/CollaboratorBar';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { HomeTripsView } from './components/HomeTripsView';
import { Dashboard } from './components/Dashboard';
import { FinancialPlanner } from './components/FinancialPlanner';
import { ItineraryPlanner } from './components/ItineraryPlanner';
import { MonthsGuide } from './components/MonthsGuide';
import { Preparations } from './components/Preparations';
import { BaggagePlanner } from './components/BaggagePlanner';
import { ParksGuideView } from './components/ParksGuideView';
import { FlightsView } from './components/FlightsView';
import { TransportationView } from './components/TransportationView';
import { AccommodationsView } from './components/AccommodationsView';
import { MapView } from './components/MapView';
import { SummaryView } from './components/SummaryView';
import { TripAccessModal } from './components/TripAccessModal';
import { MasterOverviewModal } from './components/MasterOverviewModal';

const MainContent: React.FC = () => {
  const {
    activeTab,
    isAccessModalOpen,
    setIsAccessModalOpen,
    authSession,
    trips,
    activeTripId,
  } = usePlanner();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isTripUnlocked = Boolean(
    trips.length > 0 &&
    activeTripId &&
    authSession &&
    trips.some((t) => t.id === activeTripId)
  );

  const renderActiveView = () => {
    if (!isTripUnlocked || activeTab === 'home') {
      return <HomeTripsView />;
    }
    switch (activeTab) {
      case 'journey':
        return <Dashboard />;
      case 'summary':
      case 'itinerary':
        return <ItineraryPlanner />;
      case 'map':
        return <MapView />;
      case 'flights':
        return <FlightsView />;
      case 'transport':
        return <TransportationView />;
      case 'accommodations':
        return <AccommodationsView />;
      case 'financial':
        return <FinancialPlanner />;
      case 'schedule':
        return <MonthsGuide />;
      case 'preparations':
        return <Preparations />;
      case 'baggage':
        return <BaggagePlanner />;
      case 'parks':
        return <ParksGuideView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F7F2] font-sans text-slate-800 flex">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      {/* Main Area Container */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Collaborative Top Bar */}
        <CollaboratorBar onToggleMobileMenu={() => setMobileSidebarOpen(true)} />

        {/* Page Main Content with smooth fade */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 animate-in fade-in duration-200 overflow-x-hidden">
          {renderActiveView()}
        </main>
      </div>

      {/* Global Dynamic Variables Settings Modal */}
      <GlobalSettingsModal />

      {/* Code & Email Access Modal */}
      <TripAccessModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
      />

      {/* Global Master Overview Executive Modal */}
      <MasterOverviewModal />
    </div>
  );
};

export function App() {
  return (
    <PlannerProvider>
      <MainContent />
    </PlannerProvider>
  );
}

export default App;
