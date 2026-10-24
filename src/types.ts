export interface Traveler {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarIcon?: string;
  role: 'admin' | 'traveler';
}

export interface AuthSession {
  email: string;
  tripCode: string;
  tripId: string;
  travelerName: string;
  authenticatedAt: string;
}

export type ModuleReadinessStatus = 'ready' | 'pending' | 'not_needed';

export interface ModuleReadiness {
  flights?: ModuleReadinessStatus;
  accommodations?: ModuleReadinessStatus;
  parks?: ModuleReadinessStatus;
  transport?: ModuleReadinessStatus;
  docs?: ModuleReadinessStatus;
}

export interface GlobalSettings {
  id?: string;
  tripCode?: string;
  startDate: string; // YYYY-MM-DD (or reference start date)
  returnDate?: string; // YYYY-MM-DD (exact return date)
  durationDays: number;
  travelersCount: number;
  dollarRate: number; // e.g. 5.75 BRL per USD
  totalBudgetGoalBRL: number;
  tripName: string;
  destination: string;
  travelers: Traveler[];
  currentUserId: string;
  isFlexibleDates?: boolean;
  flexibleOutboundStart?: string; // YYYY-MM-DD (e.g. earliest departure date)
  flexibleOutboundEnd?: string;   // YYYY-MM-DD (e.g. latest departure date)
  flexibleInboundStart?: string;  // YYYY-MM-DD (e.g. earliest return date)
  flexibleInboundEnd?: string;    // YYYY-MM-DD (e.g. latest return date)
  flexibleMinDays?: number;       // min days planned (e.g. 10)
  flexibleMaxDays?: number;       // max days planned (e.g. 14)
  outboundFlexibility?: string;   // Summary or legacy text
  inboundFlexibility?: string;    // Summary or legacy text
  flexibilityNotes?: string;
  transportModality?: 'rental' | 'public' | 'uber' | 'mixed';
  moduleReadiness?: ModuleReadiness;
}

export interface Trip {
  id: string;
  tripCode: string;
  tripName: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD (exact return date)
  durationDays: number;
  isFlexibleDates: boolean;
  flexibleOutboundStart?: string;
  flexibleOutboundEnd?: string;
  flexibleInboundStart?: string;
  flexibleInboundEnd?: string;
  flexibleMinDays?: number;
  flexibleMaxDays?: number;
  outboundFlexibility: string;
  inboundFlexibility: string;
  flexibilityNotes?: string;
  travelers: Traveler[];
  travelersCount: number;
  dollarRate: number;
  totalBudgetGoalBRL: number;
  createdAt: string;
  status?: 'Planejando' | 'Confirmada' | 'Concluída';
  coverTheme?: string;
  settings: GlobalSettings;
  expenses: ExpenseItem[];
  rawDays: ItineraryDay[];
  prepDocuments: PreparationDocument[];
  bookingMilestones: Omit<BookingMilestone, 'targetDate'>[];
  baggageItems: BaggageItem[];
  flights: FlightSegment[];
  carRentals?: CarRentalBooking[];
  accommodations?: AccommodationBooking[];
  parkTickets?: ParkTicketPurchase[];
  attractionSelections?: Record<string, boolean>;
  moduleReadiness?: ModuleReadiness;
}

export interface TravelerAttractionSelection {
  id: string;
  trip_id: string;
  traveler_id: string;
  park_id: string;
  attraction_name: string;
  selected: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ExpenseCategory =
  | 'Passagens'
  | 'Hospedagem'
  | 'Ingressos'
  | 'Pacotes de Fotos'
  | 'Alimentação'
  | 'Compras'
  | 'Transporte'
  | 'Seguro'
  | 'Documentos';

export type ExpenseStatus = 'Pago' | 'Pendente' | 'Parcial' | 'Não informado' | 'Não iniciado';

export interface ExpenseItem {
  id: string;
  title: string;
  category: ExpenseCategory;
  estimatedValueUSD: number;
  estimatedValueBRL: number;
  paidValueBRL: number;
  paidValueUSD?: number;
  status: ExpenseStatus;
  travelerIds?: string[];
  responsibleTravelerId: string; // Legacy field, we'll favor payerId
  payerId?: string;
  sourceType?: 'flight' | 'accommodation' | 'car_rental' | 'park_ticket' | 'photo_package' | 'general';
  sourceId?: string;
  excluded: boolean; // "Não vou precisar desse gasto"
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ItineraryDayPeriod {
  where: string;
  dining: string;
  notes: string;
}

export interface HourlyScheduleItem {
  id: string;
  time: string; // e.g. "08:00", "09:00", "09:30"
  title: string; // e.g. "Pegar o carro na locadora", "Chegar na Disney", "Parque abre"
  location?: string;
  category?: 'transport' | 'park' | 'dining' | 'hotel' | 'airbnb' | 'shopping' | 'flight' | 'other';
  completed?: boolean;
  notes?: string;
  sourceType?: 'park' | 'accommodation' | 'flight' | 'car_rental' | 'manual' | 'show' | 'fastpass' | 'dining' | string;
  sourceId?: string;
}

export interface CustomRouteStop {
  id: string;
  name: string;
  category: 'hotel' | 'park' | 'dining' | 'shopping' | 'airport' | 'other';
  lat: number;
  lng: number;
  time?: string;
  notes?: string;
  location?: string;
  order: number;
}

export interface FastPassItem {
  id: string;
  attractionName: string;
  timeWindow: string; // e.g. "09:15 - 10:15"
  type: 'Lightning Lane Multi Pass' | 'Lightning Lane Single Pass' | 'Universal Express Pass' | 'Quick Queue' | 'Fila Virtual (Virtual Queue)' | 'Outro';
  tier?: 'Tier 1' | 'Tier 2' | 'Single Pass' | 'Universal Express';
  status: 'Agendado' | 'Concluído' | 'Pendente';
  partyMembers?: string; // e.g. "Todos do Grupo"
  notes?: string;
}

export interface DiningReservationItem {
  id: string;
  restaurantName: string;
  mealType: 'Café da Manhã (Breakfast)' | 'Almoço (Lunch)' | 'Jantar (Dinner)' | 'Lanche / Snack Especial';
  time: string; // e.g. "12:30"
  confirmationCode?: string;
  partySize?: number;
  tableService: boolean; // Table Service (com garçom) vs Quick Service
  status: 'Confirmada' | 'Pendente de Reserva' | 'Cancelada';
  cancellationPolicyNotes?: string;
  notes?: string;
}

export interface ShowReservationItem {
  id: string;
  showName: string;
  time: string;
  location?: string;
  reservedArea?: string; // e.g. "Área VIP", "Dessert Party", "Acesso Comum"
  status: 'Agendado' | 'Opcional';
  notes?: string;
}

export interface PhotoPackageItem {
  id: string;
  name: string; // e.g. "Disney Memory Maker (30 Dias)", "Memory Maker One Day", "Universal My Universal Photos", "SeaWorld PhotoKey"
  type: 'daily' | 'trip_30days' | 'multi_day' | 'annual';
  validityDescription?: string;
  complex?: 'Disney' | 'Universal' | 'SeaWorld' | 'Outro';
  includedParks: string[]; // e.g. ["Magic Kingdom", "EPCOT", "Disney's Hollywood Studios", "Disney's Animal Kingdom"]
  confirmationCode?: string;
  accountEmailOrUser?: string;
  costUSD?: number;
  costBRL?: number;
  // These fields are hydrated from the 'expenses' table at runtime
  paidValueBRL?: number;
  paidValueUSD?: number;
  status: 'Ativo' | 'Pendente' | 'Confirmado';
  paymentStatus?: ExpenseStatus;
  payerId?: string;
  travelerIds?: string[];
  notes?: string;
}

export interface ParkDayBooking {
  id: string;
  dayNumber: number;
  date: string; // YYYY-MM-DD
  parkName: string; // e.g. "Magic Kingdom"
  parkId?: string; // e.g. "loc-magic-kingdom" or "mk"
  parkHours?: {
    openingTime: string;
    closingTime: string;
    earlyEntryTime?: string;
    extendedHoursTime?: string;
  };
  parkPassStatus: 'Confirmado no App' | 'Não Requer Reserva' | 'Pendente' | 'Ingresso Hopper' | 'Previsão (Planejamento)' | 'Apenas Previsão';
  confirmationCode?: string;
  ticketType?: string; // e.g. "1-Day Magic Your Way", "Universal 2-Park", "SeaWorld Single"
  ropeDropPlan?: string;
  fastPasses: FastPassItem[];
  diningReservations: DiningReservationItem[];
  showsAndParades: ShowReservationItem[];
  hasPhotoPackage?: boolean;
  photoPackage?: PhotoPackageItem;
  notes?: string;
}

export interface ParkTicketPurchase {
  id: string;
  title: string; // e.g. "Ingressos Disney 4 Dias Park Hopper"
  type: 'individual' | 'combo';
  complex: 'Disney' | 'Universal' | 'SeaWorld' | 'Discovery Cove' | 'Legoland' | 'Kennedy Space Center' | 'Outro';
  parksIncluded: string[]; // e.g. ["Magic Kingdom", "EPCOT", "Hollywood Studios", "Animal Kingdom"]
  daysCount: number; // e.g. 4
  ticketOption?: string; // e.g. "Básico (1 Parque/Dia)", "Park Hopper", "Park-to-Park", "Com All-Day Dining"
  travelerIds: string[]; // traveler IDs or ['all']
  quantity: number; // number of people / tickets
  costUSD?: number;
  costBRL?: number;
  // These fields are hydrated from the 'expenses' table at runtime
  paidValueBRL?: number;
  paidValueUSD?: number;
  paymentStatus: ExpenseStatus;
  payerId?: string;
  confirmationCode?: string;
  seller?: string; // e.g. "Site Oficial Disney", "Civitatis", "Decolar", "Agência"
  notes?: string;
  createdAt?: string;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string; // YYYY-MM-DD (calculated from start date)
  title: string;
  park: string;
  completed: boolean;
  morning: ItineraryDayPeriod;
  afternoon: ItineraryDayPeriod;
  night: ItineraryDayPeriod;
  generalNotes: string;
  hourlySchedule?: HourlyScheduleItem[];
  customRouteStops?: CustomRouteStop[];
  parkBooking?: ParkDayBooking;
}

export type CrowdLevel = 'Baixa' | 'Média' | 'Alta' | 'Altíssima';
export type RainLevel = 'Seco' | 'Moderado' | 'Chuvoso' | 'Muito Chuvoso';

export interface MonthInfo {
  month: string;
  monthIndex: number;
  tempCelsius: string;
  tempFahrenheit: string;
  crowdLevel: CrowdLevel;
  crowdScore: number; // 1-10
  highlight: string;
  tips: string;
  events: string[];
  climateType?: string;
  rainLevel?: RainLevel;
  rainDescription?: string;
  rainyDays?: string;
  rainfallMm?: string;
  weatherTip?: string;
}

export interface ChecklistSubItem {
  id: string;
  title: string;
  completed: boolean;
  completedByTravelers?: Record<string, boolean>; // travelerId -> boolean
  assignedTravelerId?: string; // or 'all'
}

export interface PreparationDocument {
  id: string;
  travelerId?: string; // ID do viajante associado
  createdByTravelerId?: string; // ID do viajante que criou o documento
  title: string;
  subtitle: string;
  status: 'Concluído' | 'Em andamento' | 'Pendente';
  completed: boolean;
  completedByTravelers?: Record<string, boolean>; // travelerId -> boolean
  subItems: ChecklistSubItem[];
  tips: string[];
  links?: { title: string; url: string }[];
}

export interface BookingMilestone {
  id: string;
  title: string;
  daysBeforeTrip: number;
  targetDate: string; // calculated
  description: string;
  completed: boolean;
  category: 'hotel' | 'dining' | 'tickets' | 'lightning_lane' | 'checkin';
}

export interface BaggageItem {
  id: string;
  travelerId: string;
  category: 'Roupas' | 'Calçados' | 'Eletrônicos' | 'Farmacinha' | 'Parque' | 'Documentos';
  name: string;
  packed: boolean;
  quantity?: number;
}

export interface ParkInfo {
  id: string;
  name: string;
  resort: 'Walt Disney World' | 'Universal Orlando Resort' | 'SeaWorld Parks & Entertainment' | 'Outros Parques & Experiências' | 'Outros';
  icon: string;
  coverImage?: string;
  description: string;
  mustDoAttractions: string[];
  bestDining: string[];
  proTips: string[];
  nightShow?: string;
  parkType?: 'Temático' | 'Aquático' | 'Experiência Imersiva' | 'Ciência & Espaço';
}

export interface BaggageAllowance {
  personalItem?: boolean;
  carryOnQty?: number;
  checkedQty?: number;
  notes?: string;
}

export type FlightOperationalStatus =
  | 'Emitido / Confirmado'
  | 'Check-in Aberto'
  | 'Check-in Realizado'
  | 'Embarcado'
  | 'Concluído'
  | 'Reservado / Confirmado'
  | string;

export type FlightPaymentStatus = ExpenseStatus;

export interface FlightSegment {
  id: string;
  type: 'outbound' | 'inbound' | 'internal' | 'connection';
  typeLabel?: string;
  airline: string;
  airlineCode?: string;
  flightNumber: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  pnrLocator?: string;
  ticketCostUSD?: number;
  ticketCostBRL?: number;
  paidValueBRL?: number;
  paidValueUSD?: number;
  status: FlightOperationalStatus;
  paymentStatus?: FlightPaymentStatus;
  payerId?: string;
  travelerIds?: string[];
  notes?: string;
  passengers?: string[];
  originCity?: string;
  originAirport?: string;
  originCode?: string;
  destinationCity?: string;
  destinationAirport?: string;
  destinationCode?: string;
  cabinClass?: string;
  duration?: string;
  stopovers?: string;
  seats?: string;
  terminalOrigin?: string;
  terminalDestination?: string;
  gate?: string;
  baggageAllowance?: BaggageAllowance;
}

export type CarRentalOperationalStatus =
  | 'Reservado / Confirmado'
  | 'Confirmado'
  | 'Retirado / Em Uso'
  | 'Concluído / Devolvido'
  | 'Concluído'
  | 'Cancelado'
  | string;

export type CarRentalPaymentStatus = ExpenseStatus;

export interface CarRentalBooking {
  id: string;
  company: string; // e.g. 'Alamo Rent A Car'
  confirmationCode: string; // e.g. 'ALM-849201'
  category: string; // e.g. 'Minivan 7 Lugares'
  
  pickupLocation: string; // e.g. 'Aeroporto de Orlando (MCO)'
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:mm
  
  dropoffLocation: string; // e.g. 'Aeroporto de Orlando (MCO)'
  dropoffDate: string; // YYYY-MM-DD
  dropoffTime: string; // HH:mm
  
  costUSD?: number;
  costBRL?: number;
  paidValueBRL?: number;
  paidValueUSD?: number;
  status: CarRentalOperationalStatus;
  paymentStatus?: CarRentalPaymentStatus;
  payerId?: string;
  travelerIds?: string[];
  driverName?: string;
  includedInsurances?: string[];
  tollOption?: string; // e.g. 'Visitor Toll Pass (Gratuito MCO)'
  notes?: string;
}

export type AccommodationOperationalStatus =
  | 'Reservado / Confirmado'
  | 'Confirmado'
  | 'Check-in Realizado'
  | 'Concluído'
  | 'Cancelado'
  | string;

export type AccommodationPaymentStatus = ExpenseStatus;

export interface AccommodationBooking {
  id: string;
  type: 'hotel' | 'resort' | 'airbnb' | 'house' | 'other';
  name: string; // e.g., "Disney's Pop Century Resort" or "Villa Luxuosa Kissimmee Airbnb"
  confirmationCode: string; // e.g., "RES-DIS-98421" or "HM9284XQ2"
  address: string; // e.g., "1050 Century Dr, Lake Buena Vista, FL 32830"
  checkInDate: string; // YYYY-MM-DD
  checkInTime: string; // HH:mm
  checkOutDate: string; // YYYY-MM-DD
  checkOutTime: string; // HH:mm
  roomType?: string; // e.g., "2 Quartos Standard Preferred"
  costUSD?: number;
  costBRL?: number;
  paidValueBRL?: number;
  paidValueUSD?: number;
  status: AccommodationOperationalStatus;
  paymentStatus?: AccommodationPaymentStatus;
  payerId?: string;
  travelerIds?: string[];
  guestName?: string; // e.g., "Nome do Titular"
  totalGuests?: number;
  amenities?: string[];
  contactPhone?: string;
  notes?: string;
}

export interface ExchangeRateData {
  rate: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  pctChange?: number;
  varBid?: number;
  lastUpdated: string;
  source: string;
  isEstimate?: boolean;
}

export interface SyncNotification {
  id: string;
  travelerName: string;
  action: string;
  timestamp: string;
}

export interface SettlementPayment {
  id: string;
  tripId: string;
  fromTravelerId: string;
  toTravelerId: string;
  amountBrl: number;
  amountUsd?: number;
  description?: string;
  paymentDate: string;
  paymentMethod?: string;
  status: 'Concluído' | 'Pendente';
  createdAt?: string;
  updatedAt?: string;
}

export interface AiParsedData {
  summary?: string;
  tripUpdates?: {
    tripName?: string;
    destination?: string;
    startDate?: string;
    durationDays?: number;
    notes?: string;
  };
  flights?: Array<{
    type?: 'outbound' | 'return' | 'internal';
    airline?: string;
    flightNumber?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    departureDate?: string;
    departureTime?: string;
    arrivalDate?: string;
    arrivalTime?: string;
    confirmationCode?: string;
    baggageAllowance?: string;
    seatNumber?: string;
    stopoverInfo?: string;
    passengerNames?: string[];
    notes?: string;
  }>;
  carRentals?: Array<{
    company?: string;
    confirmationCode?: string;
    category?: string;
    pickupLocation?: string;
    pickupDate?: string;
    pickupTime?: string;
    dropoffLocation?: string;
    dropoffDate?: string;
    dropoffTime?: string;
    costUSD?: number;
    costBRL?: number;
    status?: string;
    notes?: string;
  }>;
  expenses?: Array<{
    title?: string;
    category?: ExpenseCategory;
    estimatedValueBRL?: number;
    estimatedValueUSD?: number;
    paidValueBRL?: number;
    status?: 'Pago' | 'Pendente';
    notes?: string;
    payerId?: string;
    travelerIds?: string[];
  }>;
  itineraryDays?: Array<{
    dayNumber?: number;
    date?: string;
    title?: string;
    park?: string;
    morningPlan?: string;
    afternoonPlan?: string;
    nightPlan?: string;
    generalNotes?: string;
  }>;
  bookingMilestones?: Array<{
    title?: string;
    category?: 'Reserva' | 'Pagamento' | 'Documento' | 'Parque';
    targetDate?: string;
    notes?: string;
  }>;
}
