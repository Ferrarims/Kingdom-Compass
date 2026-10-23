import React, { useState, useEffect, useRef } from 'react';
import {
  Ticket,
  X,
  Trash2,
  Users,
  CheckCircle2,
  Info,
  AlertCircle,
} from 'lucide-react';
import { ParkTicketPurchase, Traveler } from '../types';
import { usePlanner } from '../context/PlannerContext';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import { PaymentSection, PaymentStatusType } from './PaymentSection';

interface ParkTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketToEdit?: ParkTicketPurchase | null;
  onSave: (ticket: Omit<ParkTicketPurchase, 'id'>, editId?: string) => Promise<{ success: boolean; error?: string } | void> | void;
  onDelete?: (id: string) => Promise<{ success: boolean; error?: string } | void> | void;
}

const COMPLEX_OPTIONS: {
  id: ParkTicketPurchase['complex'];
  label: string;
  badgeColor: string;
  icon: string;
  defaultParks: string[];
  suggestedOptions: string[];
}[] = [
  {
    id: 'Disney',
    label: 'Walt Disney World Resort',
    badgeColor: 'bg-blue-500 text-white',
    icon: '🏰',
    defaultParks: [
      'Magic Kingdom',
      'EPCOT',
      'Disney\'s Hollywood Studios',
      'Disney\'s Animal Kingdom',
      'Disney\'s Blizzard Beach',
      'Disney\'s Typhoon Lagoon',
    ],
    suggestedOptions: [
      'Básico (1 Parque por Dia)',
      'Park Hopper (Troca de parque no mesmo dia)',
      'Park Hopper Plus (Inclui Parques Aquáticos e Mini-Golf)',
      'Ingresso de Festa Especial (Mickey\'s Very Merry / Not-So-Scary)',
    ],
  },
  {
    id: 'Universal',
    label: 'Universal Orlando Resort',
    badgeColor: 'bg-indigo-600 text-white',
    icon: '⭐',
    defaultParks: [
      'Universal Studios Florida',
      'Universal\'s Islands of Adventure',
      'Universal\'s Epic Universe',
      'Universal\'s Volcano Bay',
    ],
    suggestedOptions: [
      '14 Dias Acesso Ilimitado (All Parks Park-to-Park)',
      '14 Dias Acesso Ilimitado (3 Parques Park-to-Park)',
      'Park-to-Park (Permite trem Hogwarts Express)',
      'Base (1 Parque por Dia)',
      '3-Park Explorer (Inclui Volcano Bay Aquático)',
      'Halloween Horror Nights (Evento Especial)',
    ],
  },
  {
    id: 'SeaWorld',
    label: 'SeaWorld Parks & Entertainment',
    badgeColor: 'bg-teal-600 text-white',
    icon: '🐬',
    defaultParks: [
      'SeaWorld Orlando',
      'Busch Gardens Tampa Bay',
      'Aquatica Orlando',
    ],
    suggestedOptions: [
      'Ingresso 1 Dia SeaWorld',
      'Ingresso 1 Dia com All-Day Dining Deal',
      'Combo 2 Parques (Sem Alimentação)',
      'Combo 2 Parques com All-Day Dining Deal',
      'Combo 3 Parques (Sem Alimentação)',
      'Combo 3 Parques com All-Day Dining Deal',
      'Passe Ilimitado 14 Dias (SeaWorld + Busch + Aquatica)',
    ],
  },
  {
    id: 'Discovery Cove',
    label: 'Discovery Cove',
    badgeColor: 'bg-cyan-600 text-white',
    icon: '🌴',
    defaultParks: ['Discovery Cove'],
    suggestedOptions: [
      'Day Resort All-Inclusive (Com nado com golfinhos)',
      'Day Resort All-Inclusive (Sem nado com golfinhos)',
      'Pacote Discovery Cove + SeaWorld + Aquatica',
    ],
  },
  {
    id: 'Legoland',
    label: 'Legoland Florida Resort',
    badgeColor: 'bg-amber-600 text-white',
    icon: '🧱',
    defaultParks: [
      'Legoland Florida Theme Park',
      'Legoland Water Park',
      'Peppa Pig Theme Park',
    ],
    suggestedOptions: [
      '1-Day Legoland Theme Park',
      'Combo 1-Day Legoland + Peppa Pig Park',
      'Combo 2-Day 3-Parks (Legoland + Water Park + Peppa Pig)',
    ],
  },
  {
    id: 'Kennedy Space Center',
    label: 'Kennedy Space Center (NASA)',
    badgeColor: 'bg-slate-800 text-white',
    icon: '🚀',
    defaultParks: ['Kennedy Space Center Visitor Complex'],
    suggestedOptions: [
      'Ingresso Admissão Geral NASA',
      'Ingresso com Astronaut Training Experience (ATX)',
      'Ingresso com Almoço com Astronauta',
    ],
  },
  {
    id: 'Outro',
    label: 'Outras Atrações & Parques',
    badgeColor: 'bg-purple-600 text-white',
    icon: '🎡',
    defaultParks: [
      'Cirque du Soleil: Drawn to Life',
      'Gatorland',
      'Madame Tussauds + SEA LIFE Orlando',
      'Icon Park The Wheel',
    ],
    suggestedOptions: [
      'Ingresso Regular Individual',
      'Combo de Atrações',
      'Passe Turístico (Go City Orlando Pass)',
    ],
  },
];

interface PredefinedPackage {
  id: string;
  name: string;
  description: string;
  type: 'individual' | 'combo';
  daysCount: number;
  ticketOption: string;
  parksIncluded: string[];
  recommendedUSD: string;
}

const getParkEmoji = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('magic')) return '🏰';
  if (n.includes('epcot')) return '🌐';
  if (n.includes('hollywood')) return '🎬';
  if (n.includes('animal')) return '🦁';
  if (n.includes('blizzard')) return '❄️';
  if (n.includes('typhoon')) return '🌊';
  if (n.includes('universal studios')) return '⭐';
  if (n.includes('islands')) return '🦖';
  if (n.includes('epic')) return '🚀';
  if (n.includes('volcano')) return '🌋';
  if (n.includes('seaworld')) return '🐬';
  if (n.includes('busch')) return '🎢';
  if (n.includes('aquatica')) return '🏊';
  if (n.includes('discovery')) return '🌴';
  if (n.includes('legoland') || n.includes('peppa')) return '🧱';
  if (n.includes('kennedy') || n.includes('nasa')) return '🚀';
  return '🎟️';
};

const getPackagesForComplex = (
  complexId: ParkTicketPurchase['complex'],
  defaultParks: string[]
): PredefinedPackage[] => {
  const list: PredefinedPackage[] = [];

  if (complexId === 'Disney') {
    list.push({
      id: 'disney-4d-hopper',
      name: 'Combo Disney: 4 Dias Park Hopper',
      description: 'Permite trocar de parque no mesmo dia. Escolha 4 dias entre os parques do complexo Disney.',
      type: 'combo',
      daysCount: 4,
      ticketOption: 'Park Hopper (Troca de parque no mesmo dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '580',
    });
    list.push({
      id: 'disney-4d-basic',
      name: 'Combo Disney: 4 Dias Básicos',
      description: 'Acesso a 1 parque por dia (total de 4 dias de parque entre os disponíveis).',
      type: 'combo',
      daysCount: 4,
      ticketOption: 'Básico (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '490',
    });
    list.push({
      id: 'disney-3d-hopper',
      name: 'Combo Disney: 3 Dias Park Hopper',
      description: 'Permite trocar de parque no mesmo dia durante 3 dias de visita entre os parques Disney.',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Park Hopper (Troca de parque no mesmo dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '465',
    });
    list.push({
      id: 'disney-3d-basic',
      name: 'Combo Disney: 3 Dias Básicos',
      description: 'Acesso a 1 parque por dia (total de 3 dias de parque).',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Básico (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '410',
    });
    list.push({
      id: 'disney-5d-hopper',
      name: 'Combo Disney: 5 Dias Park Hopper',
      description: 'Permite trocar de parque no mesmo dia durante 5 dias de visita entre os parques Disney.',
      type: 'combo',
      daysCount: 5,
      ticketOption: 'Park Hopper (Troca de parque no mesmo dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '630',
    });
    list.push({
      id: 'disney-5d-basic',
      name: 'Combo Disney: 5 Dias Básicos',
      description: 'Acesso a 1 parque por dia (total de 5 dias de parque).',
      type: 'combo',
      daysCount: 5,
      ticketOption: 'Básico (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '530',
    });
    list.push({
      id: 'disney-2d-basic',
      name: 'Combo Disney: 2 Dias Básicos',
      description: 'Acesso a 1 parque por dia (total de 2 dias de visita).',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Básico (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '320',
    });
    list.push({
      id: 'disney-1d-individual',
      name: 'Ingresso Individual: 1 Dia',
      description: 'Acesso a 1 dia em qualquer parque do complexo Disney (definido no Roteiro Dia a Dia).',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Básico (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '149',
    });
    list.push({
      id: 'disney-special-party',
      name: 'Ingresso de Festa Especial Noturna',
      description: 'Ingresso especial noturno para festas sazonais no Magic Kingdom (Mickey\'s Very Merry Christmas / Not-So-Scary).',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso de Festa Especial (Mickey\'s Very Merry / Not-So-Scary)',
      parksIncluded: ['Magic Kingdom'],
      recommendedUSD: '179',
    });
  } else if (complexId === 'Universal') {
    list.push({
      id: 'universal-14d-allparks',
      name: 'Combo Universal: 14 Dias All Parks (Acesso Ilimitado)',
      description: 'Acesso ilimitado aos 4 parques (Studios Florida, Islands of Adventure, Epic Universe e Volcano Bay) por 14 dias consecutivos com troca livre no mesmo dia (Park-to-Park e trem Hogwarts Express).',
      type: 'combo',
      daysCount: 14,
      ticketOption: '14 Dias Acesso Ilimitado (All Parks Park-to-Park)',
      parksIncluded: defaultParks,
      recommendedUSD: '530',
    });
    list.push({
      id: 'universal-14d-3parks-adventure',
      name: 'Combo Universal: Ingresso Aventura 3 Parques em 14 Dias',
      description: 'Acesso ilimitado aos 3 parques temáticos (Studios Florida, Islands of Adventure e Epic Universe) por 14 dias consecutivos com Park-to-Park e trem Hogwarts Express (não inclui Volcano Bay).',
      type: 'combo',
      daysCount: 14,
      ticketOption: '14 Dias Acesso Ilimitado (3 Parques Park-to-Park)',
      parksIncluded: [
        'Universal Studios Florida',
        'Universal\'s Islands of Adventure',
        'Universal\'s Epic Universe',
      ],
      recommendedUSD: '470',
    });
    list.push({
      id: 'universal-2d-p2p',
      name: 'Combo Universal: 2 Dias Park-to-Park',
      description: 'Visite múltiplos parques Universal no mesmo dia, incluindo viagem no trem Hogwarts Express.',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Park-to-Park (Permite trem Hogwarts Express)',
      parksIncluded: defaultParks,
      recommendedUSD: '315',
    });
    list.push({
      id: 'universal-2d-base',
      name: 'Combo Universal: 2 Dias Base',
      description: 'Acesso a 1 parque por dia (total de 2 dias de visita).',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Base (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '260',
    });
    list.push({
      id: 'universal-3p-explorer',
      name: 'Combo Universal: 3-Park Explorer (Com Epic Universe)',
      description: 'Inclui acesso aos 3 parques temáticos principais e ao parque aquático Volcano Bay.',
      type: 'combo',
      daysCount: 3,
      ticketOption: '3-Park Explorer (Inclui Volcano Bay Aquático)',
      parksIncluded: defaultParks,
      recommendedUSD: '450',
    });
    list.push({
      id: 'universal-3d-base',
      name: 'Combo Universal: 3 Dias Base',
      description: 'Acesso a 1 parque por dia (total de 3 dias de visita).',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Base (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '360',
    });
    list.push({
      id: 'universal-4d-p2p',
      name: 'Combo Universal: 4 Dias Park-to-Park',
      description: 'Acesso aos parques Universal com troca livre de parque no mesmo dia por 4 dias.',
      type: 'combo',
      daysCount: 4,
      ticketOption: 'Park-to-Park (Permite trem Hogwarts Express)',
      parksIncluded: defaultParks,
      recommendedUSD: '480',
    });
    list.push({
      id: 'universal-1d-individual',
      name: 'Ingresso Individual: 1 Dia',
      description: 'Acesso a 1 dia em qualquer parque Universal (definido no Roteiro Dia a Dia).',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Base (1 Parque por Dia)',
      parksIncluded: defaultParks,
      recommendedUSD: '135',
    });
    list.push({
      id: 'universal-hhn',
      name: 'Halloween Horror Nights (Evento Especial)',
      description: 'Ingresso especial de uma noite para o evento de terror Halloween Horror Nights.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Halloween Horror Nights (Evento Especial)',
      parksIncluded: defaultParks,
      recommendedUSD: '99',
    });
  } else if (complexId === 'SeaWorld') {
    list.push({
      id: 'seaworld-2p-combo',
      name: 'Combo 2 Parques SeaWorld (Sem Alimentação)',
      description: 'Acesso a 2 dias de parque de sua escolha entre SeaWorld, Busch Gardens e Aquatica.',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Combo 2 Parques (Sem Alimentação)',
      parksIncluded: defaultParks,
      recommendedUSD: '135',
    });
    list.push({
      id: 'seaworld-2p-dining',
      name: 'Combo 2 Parques com All-Day Dining',
      description: 'Acesso a 2 parques do grupo SeaWorld com plano de alimentação All-Day Dining incluso para refeições a cada 90 minutos.',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Combo 2 Parques com All-Day Dining Deal',
      parksIncluded: defaultParks,
      recommendedUSD: '175',
    });
    list.push({
      id: 'seaworld-3p-combo',
      name: 'Combo 3 Parques SeaWorld (Sem Alimentação)',
      description: 'Acesso a 3 dias de parque de sua escolha entre SeaWorld, Busch Gardens e Aquatica.',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Combo 3 Parques (Sem Alimentação)',
      parksIncluded: defaultParks,
      recommendedUSD: '155',
    });
    list.push({
      id: 'seaworld-3p-dining',
      name: 'Combo 3 Parques com All-Day Dining',
      description: 'Acesso a 3 parques do grupo SeaWorld com plano de alimentação All-Day Dining incluso para comer o dia todo.',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Combo 3 Parques com All-Day Dining Deal',
      parksIncluded: defaultParks,
      recommendedUSD: '199',
    });
    list.push({
      id: 'seaworld-14d-unlimited',
      name: 'Passe Ilimitado 14 Dias (4 Parques)',
      description: 'Visitas ilimitadas por 14 dias no SeaWorld, Aquatica, Busch Gardens e Adventure Island (inclui estacionamento grátis).',
      type: 'combo',
      daysCount: 14,
      ticketOption: 'Passe Ilimitado 14 Dias (SeaWorld + Busch + Aquatica)',
      parksIncluded: defaultParks,
      recommendedUSD: '240',
    });
    list.push({
      id: 'seaworld-1d-individual',
      name: 'Ingresso Individual: 1 Dia (Sem Alimentação)',
      description: 'Acesso a 1 dia em qualquer parque do grupo SeaWorld.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso 1 Dia SeaWorld',
      parksIncluded: defaultParks,
      recommendedUSD: '99',
    });
    list.push({
      id: 'seaworld-1d-dining',
      name: 'Ingresso 1 Dia com All-Day Dining',
      description: 'Acesso a 1 dia em qualquer parque do grupo SeaWorld com plano de alimentação All-Day Dining incluso.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso 1 Dia com All-Day Dining Deal',
      parksIncluded: defaultParks,
      recommendedUSD: '139',
    });
  } else if (complexId === 'Discovery Cove') {
    list.push({
      id: 'discovery-cove-basic',
      name: 'Day Resort All-Inclusive (Sem Nado com Golfinhos)',
      description: 'Acesso de um dia com alimentação, lanches, bebidas alcoólicas e snorkeling inclusos.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Day Resort All-Inclusive (Sem nado com golfinhos)',
      parksIncluded: defaultParks,
      recommendedUSD: '199',
    });
    list.push({
      id: 'discovery-cove-dolphin',
      name: 'Day Resort All-Inclusive (Com Nado com Golfinhos)',
      description: 'Experiência completa no Discovery Cove incluindo a sessão especial de nado e interação com golfinhos.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Day Resort All-Inclusive (Com nado com golfinhos)',
      parksIncluded: defaultParks,
      recommendedUSD: '299',
    });
    list.push({
      id: 'discovery-cove-ultimate',
      name: 'Pacote Discovery Cove + SeaWorld + Aquatica',
      description: 'Dia All-Inclusive no Discovery Cove + 14 dias ilimitados no SeaWorld e Aquatica.',
      type: 'combo',
      daysCount: 3,
      ticketOption: 'Pacote Discovery Cove + SeaWorld + Aquatica',
      parksIncluded: ['Discovery Cove', 'SeaWorld Orlando', 'Aquatica Orlando'],
      recommendedUSD: '279',
    });
  } else if (complexId === 'Legoland') {
    list.push({
      id: 'legoland-combo-peppa',
      name: 'Combo Legoland: Theme Park + Peppa Pig Park',
      description: 'Acesso de 1 dia para o parque temático da Legoland e o parque da Peppa Pig.',
      type: 'combo',
      daysCount: 1,
      ticketOption: 'Combo 1-Day Legoland + Peppa Pig Park',
      parksIncluded: defaultParks,
      recommendedUSD: '104',
    });
    list.push({
      id: 'legoland-2d-3p',
      name: 'Combo Legoland: 2 Dias 3 Parques',
      description: 'Acesso de 2 dias aos 3 parques: Legoland Theme Park, Water Park e Peppa Pig Park.',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Combo 2-Day 3-Parks (Legoland + Water Park + Peppa Pig)',
      parksIncluded: defaultParks,
      recommendedUSD: '139',
    });
    list.push({
      id: 'legoland-1d-individual',
      name: 'Ingresso Individual: 1 Dia',
      description: 'Acesso a 1 dia no Legoland Florida Theme Park.',
      type: 'individual',
      daysCount: 1,
      ticketOption: '1-Day Legoland Theme Park',
      parksIncluded: defaultParks,
      recommendedUSD: '84',
    });
  } else if (complexId === 'Kennedy Space Center') {
    list.push({
      id: 'ksc-general',
      name: 'Ingresso Admissão Geral NASA (1 Dia)',
      description: 'Acesso completo de 1 dia ao complexo de visitantes da NASA Kennedy Space Center.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso Admissão Geral NASA',
      parksIncluded: defaultParks,
      recommendedUSD: '75',
    });
    list.push({
      id: 'ksc-atx',
      name: 'Ingresso NASA com Astronaut Training Experience',
      description: 'Admissão ao Kennedy Space Center com simulação imersiva de treinamento de astronauta.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso com Astronaut Training Experience (ATX)',
      parksIncluded: defaultParks,
      recommendedUSD: '180',
    });
  } else {
    list.push({
      id: 'other-combo',
      name: 'Combo Especial Multiatrações',
      description: 'Acesso combinado a múltiplas atrações e experiências.',
      type: 'combo',
      daysCount: 2,
      ticketOption: 'Combo de Atrações',
      parksIncluded: defaultParks,
      recommendedUSD: '119',
    });
    list.push({
      id: 'other-1d-individual',
      name: 'Ingresso Individual: 1 Dia / Atração',
      description: 'Acesso a 1 dia ou atração avulsa.',
      type: 'individual',
      daysCount: 1,
      ticketOption: 'Ingresso Regular Individual',
      parksIncluded: defaultParks,
      recommendedUSD: '65',
    });
  }

  return list;
};

export const ParkTicketModal: React.FC<ParkTicketModalProps> = ({
  isOpen,
  onClose,
  ticketToEdit,
  onSave,
  onDelete,
}) => {
  const { settings, deleteParkTicket } = usePlanner();
  const dollarRate = settings.dollarRate || 5.75;
  const travelers: Traveler[] = settings.travelers || [];

  // Form states
  const [complex, setComplex] = useState<ParkTicketPurchase['complex']>('Disney');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'individual' | 'combo'>('combo');
  const [parksIncluded, setParksIncluded] = useState<string[]>([]);
  const [daysCount, setDaysCount] = useState<number>(4);
  const [ticketOption, setTicketOption] = useState<string>('Park Hopper');
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>(['all']);
  const [payerId, setPayerId] = useState<string>('all');
  const [quantity, setQuantity] = useState<number>(travelers.length || 1);
  const [unitCostUSD, setUnitCostUSD] = useState<number | null>(null);
  const [unitCostBRL, setUnitCostBRL] = useState<number | null>(null);
  const [paidValueBRL, setPaidValueBRL] = useState<number | undefined>(undefined);
  const [paidValueUSD, setPaidValueUSD] = useState<number | undefined>(undefined);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusType>('Não informado');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [seller, setSeller] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const currentComplexConfig = COMPLEX_OPTIONS.find((c) => c.id === complex) || COMPLEX_OPTIONS[0];

  const eligibleParks = React.useMemo(() => {
    const defaults = currentComplexConfig.defaultParks;
    const existing = parksIncluded && parksIncluded.length > 0 ? parksIncluded : [];
    return Array.from(new Set([...defaults, ...existing]));
  }, [currentComplexConfig.defaultParks, parksIncluded]);

  const availablePackages = React.useMemo(() => {
    return getPackagesForComplex(complex, currentComplexConfig.defaultParks);
  }, [complex, currentComplexConfig.defaultParks]);

  const currentPackageId = React.useMemo(() => {
    const found = availablePackages.find(
      (pkg) =>
        title === pkg.name &&
        type === pkg.type &&
        daysCount === pkg.daysCount &&
        ticketOption === pkg.ticketOption
    );
    return found ? found.id : 'custom';
  }, [availablePackages, title, type, daysCount, ticketOption]);

  const selectPackage = (pkg: PredefinedPackage) => {
    setTitle(pkg.name);
    setType(pkg.type);
    setDaysCount(pkg.daysCount);
    setTicketOption(pkg.ticketOption);
    setParksIncluded(pkg.parksIncluded);

    const num = parseFloat(pkg.recommendedUSD) || 0;
    setUnitCostUSD(num);
    setUnitCostBRL(Math.round(num * dollarRate * 100) / 100);
  };

  const handleComplexChange = (newComplex: ParkTicketPurchase['complex']) => {
    setComplex(newComplex);
    const compConfig = COMPLEX_OPTIONS.find((c) => c.id === newComplex) || COMPLEX_OPTIONS[0];
    const pkgs = getPackagesForComplex(newComplex, compConfig.defaultParks);
    if (pkgs.length > 0) {
      selectPackage(pkgs[0]);
    } else {
      setTitle(`Ingressos ${compConfig.label}`);
      setType('combo');
      setParksIncluded(compConfig.defaultParks);
      setDaysCount(4);
      setTicketOption(compConfig.suggestedOptions[0] || 'Básico');
    }
  };

  const wasOpenRef = useRef<boolean>(false);
  const lastTicketIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      const ticketId = ticketToEdit?.id || null;
      if (!wasOpenRef.current || lastTicketIdRef.current !== ticketId) {
        wasOpenRef.current = true;
        lastTicketIdRef.current = ticketId;

        if (ticketToEdit) {
          setTitle(ticketToEdit.title);
          setType(ticketToEdit.type || 'combo');
          setComplex(ticketToEdit.complex || 'Disney');
          setParksIncluded(ticketToEdit.parksIncluded || []);
          setDaysCount(ticketToEdit.daysCount || 1);
          setTicketOption(ticketToEdit.ticketOption || '');
          setSelectedTravelerIds(ticketToEdit.travelerIds || ['all']);
          setPayerId(ticketToEdit.payerId || 'all');

          const q = ticketToEdit.quantity || travelers.length || 1;
          setQuantity(q);

          if (ticketToEdit.costUSD !== undefined && ticketToEdit.costUSD !== null && ticketToEdit.costUSD > 0) {
            setUnitCostUSD(ticketToEdit.costUSD / q);
          } else {
            setUnitCostUSD(null);
          }
          if (ticketToEdit.costBRL !== undefined && ticketToEdit.costBRL !== null && ticketToEdit.costBRL > 0) {
            setUnitCostBRL(ticketToEdit.costBRL / q);
          } else {
            setUnitCostBRL(null);
          }

          setPaidValueBRL(ticketToEdit.paidValueBRL);
          setPaidValueUSD(ticketToEdit.paidValueUSD);

          const rawStatus = ticketToEdit.paymentStatus;
          if (rawStatus === 'Pago' || rawStatus === 'Pendente' || rawStatus === 'Parcial' || rawStatus === 'Não informado') {
            setPaymentStatus(rawStatus);
          } else {
            setPaymentStatus('Não informado');
          }

          setConfirmationCode(ticketToEdit.confirmationCode || '');
          setSeller(ticketToEdit.seller || '');
          setNotes(ticketToEdit.notes || '');
        } else {
          // Default new ticket
          setComplex('Disney');
          setPayerId('all');

          const disneyObj = COMPLEX_OPTIONS.find((c) => c.id === 'Disney')!;
          const initialPackages = getPackagesForComplex('Disney', disneyObj.defaultParks);

          const defaultQty = travelers.length || 1;
          setQuantity(defaultQty);

          if (initialPackages.length > 0) {
            const firstPkg = initialPackages[0];
            setTitle(firstPkg.name);
            setType(firstPkg.type);
            setDaysCount(firstPkg.daysCount);
            setTicketOption(firstPkg.ticketOption);
            setParksIncluded(firstPkg.parksIncluded);

            const num = parseFloat(firstPkg.recommendedUSD) || 0;
            setUnitCostUSD(num);
            setUnitCostBRL(Math.round(num * dollarRate * 100) / 100);
          } else {
            setTitle('Combo Disney: 4 Dias Park Hopper');
            setType('combo');
            setParksIncluded([
              'Magic Kingdom',
              'EPCOT',
              'Disney\'s Hollywood Studios',
              'Disney\'s Animal Kingdom',
              'Disney\'s Blizzard Beach',
              'Disney\'s Typhoon Lagoon',
            ]);
            setDaysCount(4);
            setTicketOption('Park Hopper (Troca de parque no mesmo dia)');
            setUnitCostUSD(580);
            setUnitCostBRL(Math.round(580 * dollarRate * 100) / 100);
          }

          setSelectedTravelerIds(['all']);
          setPaymentStatus('Não informado');
          setConfirmationCode('');
          setSeller('Site Oficial Walt Disney World');
          setNotes('');
        }
        setSaveError(null);
      }
    } else {
      wasOpenRef.current = false;
      lastTicketIdRef.current = undefined;
    }
  }, [isOpen, ticketToEdit, travelers.length, dollarRate]);

  const totalUSD = React.useMemo(() => {
    return unitCostUSD !== null && unitCostUSD > 0 ? unitCostUSD * quantity : null;
  }, [unitCostUSD, quantity]);

  const totalBRL = React.useMemo(() => {
    return unitCostBRL !== null && unitCostBRL > 0 ? unitCostBRL * quantity : null;
  }, [unitCostBRL, quantity]);

  const toggleTraveler = (tId: string) => {
    if (tId === 'all') {
      setSelectedTravelerIds(['all']);
      setQuantity(travelers.length || 1);
      return;
    }

    let current = selectedTravelerIds.filter((id) => id !== 'all');
    if (current.includes(tId)) {
      current = current.filter((id) => id !== tId);
      if (current.length === 0) current = ['all'];
    } else {
      current.push(tId);
    }

    setSelectedTravelerIds(current);
    if (current.includes('all')) {
      setQuantity(travelers.length || 1);
    } else {
      setQuantity(current.length);
    }
  };

  const handleDelete = async () => {
    if (!ticketToEdit?.id || isSaving) return;
    if (window.confirm(`Tem certeza que deseja excluir o pacote de ingressos "${ticketToEdit.title}"?`)) {
      setSaveError(null);
      setIsSaving(true);
      try {
        if (onDelete) {
          const res = await onDelete(ticketToEdit.id);
          if (res && typeof res === 'object' && 'success' in res && !res.success) {
            setSaveError(res.error || 'Erro ao excluir o ingresso.');
            return;
          }
        } else {
          const res = await deleteParkTicket(ticketToEdit.id);
          if (res && typeof res === 'object' && 'success' in res && !res.success) {
            setSaveError(res.error || 'Erro ao excluir o ingresso.');
            return;
          }
        }
        onClose();
      } catch (err: any) {
        setSaveError(err?.message || 'Erro inesperado ao excluir o ingresso.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    setSaveError(null);

    const usdVal = totalUSD !== null ? totalUSD : 0;
    const brlVal = totalBRL !== null ? totalBRL : (usdVal > 0 ? usdVal * dollarRate : 0);

    if (paymentStatus === 'Parcial') {
      const totBRL = brlVal || 0;
      const totUSD = usdVal || 0;
      const pBRL = paidValueBRL || 0;
      const pUSD = paidValueUSD || 0;

      const hasBRL = totBRL > 0;
      const hasUSD = totUSD > 0;

      let isValid = true;
      if (hasBRL && (pBRL <= 0 || pBRL >= totBRL)) isValid = false;
      if (hasUSD && (pUSD <= 0 || pUSD >= totUSD)) isValid = false;
      if (!hasBRL && !hasUSD) isValid = false;

      if (!isValid) {
        setSaveError('Para pagamento Parcial, o valor pago deve ser maior que zero e menor que o valor total.');
        return;
      }
    }

    setIsSaving(true);

    try {
      const ticketData: Omit<ParkTicketPurchase, 'id'> = {
        title: title.trim() || `${complex} - Ingressos`,
        type,
        complex,
        parksIncluded: eligibleParks.length > 0 ? eligibleParks : [complex],
        daysCount: Math.max(1, daysCount),
        ticketOption: ticketOption.trim(),
        travelerIds: selectedTravelerIds,
        quantity: Math.max(1, quantity),
        costUSD: usdVal > 0 ? usdVal : undefined,
        costBRL: brlVal > 0 ? brlVal : undefined,
        paidValueBRL: paidValueBRL,
        paidValueUSD: paidValueUSD,
        paymentStatus,
        payerId,
        confirmationCode: confirmationCode.trim() || undefined,
        seller: seller.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await onSave(ticketData, ticketToEdit?.id);
      if (res && typeof res === 'object' && 'success' in res && !res.success) {
        setSaveError(res.error || 'Erro ao salvar os ingressos. Tente novamente.');
        return;
      }

      onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Erro inesperado ao salvar os ingressos.');
    } finally {
      setIsSaving(false);
    }
  };

  useModalKeyEvents({ isOpen, onClose, onSave: () => handleSave() });

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[90vh] max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        id="modal-park-ticket"
      >
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                {ticketToEdit ? 'Edição de Ingressos' : 'Cadastro de Ingressos'} • {type === 'combo' ? 'Combo Multi-Parques' : 'Ingresso Individual'}
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                {ticketToEdit ? 'Editar Pacote de Ingressos' : 'Cadastrar Compra de Ingressos'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
            id="btn-close-ticket-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden text-slate-700">
          {saveError && (
            <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2.5 text-rose-700 text-xs font-medium">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{saveError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="p-1 hover:bg-rose-100 rounded text-rose-500 cursor-pointer"
                aria-label="Dispensar erro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar">
            
            {/* 1. SELEÇÃO DO COMPLEXO & INGRESSOS DISPONÍVEIS */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                1. Complexo & Ingressos Disponíveis
              </span>
              <div className="bg-slate-50/80 p-4 sm:p-5 rounded-xl border border-slate-200/90 space-y-4">
                {/* Complex Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block flex items-center justify-between">
                    <span>Complexo / Título de Parques</span>
                    <span className="text-[11px] font-normal text-slate-500">Selecione o complexo desejado</span>
                  </label>
                  <select
                    value={complex}
                    onChange={(e) => handleComplexChange(e.target.value as ParkTicketPurchase['complex'])}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] cursor-pointer"
                    id="select-ticket-complex"
                  >
                    {COMPLEX_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Parks Badges */}
                <div className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Parques do Complexo</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
                        {currentComplexConfig.defaultParks.length}
                      </span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Elegíveis para alocação no roteiro
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentComplexConfig.defaultParks.map((pName) => (
                      <div
                        key={pName}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-800 border border-slate-200 flex items-center gap-1.5"
                      >
                        <span className="text-base leading-none">{getParkEmoji(pName)}</span>
                        <span>{pName}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Available Packages */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                  <label className="text-xs font-semibold text-slate-700 block flex items-center justify-between">
                    <span>Ingressos & Pacotes Disponíveis</span>
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-md">
                      {type === 'individual' ? 'Ingresso Individual (1 Dia)' : `Combo (${daysCount} Dias)`}
                    </span>
                  </label>
                  <select
                    value={currentPackageId}
                    onChange={(e) => {
                      const val = e.target.value;
                      const pkg = availablePackages.find((p) => p.id === val);
                      if (pkg) selectPackage(pkg);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] cursor-pointer"
                    id="select-ticket-package"
                  >
                    {availablePackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} — {pkg.daysCount} {pkg.daysCount === 1 ? 'Dia' : 'Dias'} (~ USD ${pkg.recommendedUSD})
                      </option>
                    ))}
                  </select>
                  {currentPackageId !== 'custom' && (
                    <div className="text-[11px] text-slate-600 bg-white border border-slate-200/80 rounded-lg p-3 mt-1.5 leading-relaxed">
                      <span className="font-semibold text-slate-700 block mb-0.5 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-blue-500" />
                        Descrição do ingresso:
                      </span>
                      {availablePackages.find((p) => p.id === currentPackageId)?.description}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. DETALHES DO INGRESSO & VOUCHER */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                2. Detalhes do Ingresso & Voucher
              </span>
              <div className="bg-slate-50/80 p-4 sm:p-5 rounded-xl border border-slate-200/90 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nome / Título do Pacote
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Combo Disney 4 Dias Park Hopper"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                      id="input-ticket-title"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Tipo de Ingresso
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as 'individual' | 'combo')}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] cursor-pointer"
                      id="select-ticket-type"
                    >
                      <option value="combo">🎟️ Combo Multi-Parques / Multi-Dias</option>
                      <option value="individual">🎫 Ingresso Individual (1 Dia)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Quantidade de Dias de Parque
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={daysCount}
                      onChange={(e) => setDaysCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                      id="input-ticket-days"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Opção / Modalidade
                    </label>
                    <input
                      type="text"
                      value={ticketOption}
                      onChange={(e) => setTicketOption(e.target.value)}
                      placeholder="Ex: Park Hopper, Park-to-Park, Com All-Day Dining"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                      id="input-ticket-option"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Código da Reserva / Voucher
                    </label>
                    <input
                      type="text"
                      value={confirmationCode}
                      onChange={(e) => setConfirmationCode(e.target.value)}
                      placeholder="Ex: WDW-TKT-894129"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono font-medium uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                      id="input-ticket-code"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Onde Comprou (Vendedor / Agência)
                    </label>
                    <input
                      type="text"
                      value={seller}
                      onChange={(e) => setSeller(e.target.value)}
                      placeholder="Ex: Site Oficial Disney, Civitatis, Decolar"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                      id="input-ticket-seller"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. PARTICIPANTES DO PACOTE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                  3. Participantes do Pacote & Quantidade
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Qtd de ingressos:</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                  />
                </div>
              </div>

              <div className="bg-slate-50/80 p-4 sm:p-5 rounded-xl border border-slate-200/90 space-y-3">
                <p className="text-xs text-slate-500">
                  Selecione os viajantes incluídos neste pacote para divisão de custos e controle individual:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTraveler('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedTravelerIds.includes('all')
                        ? 'bg-[#1A2B4C] text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Users className={`w-3.5 h-3.5 ${selectedTravelerIds.includes('all') ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                    <span>Todos os Viajantes ({travelers.length})</span>
                  </button>

                  {travelers.map((trv) => {
                    const isSelected = selectedTravelerIds.includes(trv.id) || selectedTravelerIds.includes('all');
                    return (
                      <button
                        key={trv.id}
                        type="button"
                        onClick={() => toggleTraveler(trv.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected && !selectedTravelerIds.includes('all')
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: trv.avatarColor || '#3B82F6' }}
                        />
                        <span>{trv?.name || 'Viajante'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. CUSTOS & PAGAMENTO */}
            <PaymentSection
              sectionNumber={4}
              sectionTitle="CUSTOS & PAGAMENTO"
              pricingMode="per_person"
              dollarRate={dollarRate}
              unitCostUSD={unitCostUSD}
              unitCostBRL={unitCostBRL}
              totalCostUSD={totalUSD}
              totalCostBRL={totalBRL}
              onChangeCosts={(unitUSD, unitBRL) => {
                setUnitCostUSD(unitUSD);
                setUnitCostBRL(unitBRL);
              }}
              paymentStatus={paymentStatus}
              onChangePaymentStatus={(st) => setPaymentStatus(st)}
              paidValueBRL={paidValueBRL}
              paidValueUSD={paidValueUSD}
              onChangePaidValues={(pBRL, pUSD) => {
                setPaidValueBRL(pBRL);
                setPaidValueUSD(pUSD);
              }}
              payerId={payerId}
              onChangePayerId={(pId) => setPayerId(pId)}
              travelers={travelers.map((t) => ({ id: t.id, name: t.name }))}
              passengerCount={quantity}
              passengerLabel="ingresso"
              unitLabelUSD="Valor por Ingresso (US$)"
              unitLabelBRL="Valor por Ingresso (R$)"
              showPayerSelector={true}
            />

            {/* 5. OBSERVAÇÕES & INSTRUÇÕES */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                5. Observações & Instruções
              </span>
              <div className="bg-slate-50/80 p-4 sm:p-5 rounded-xl border border-slate-200/90">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Ingressos vinculados nas contas My Disney Experience. Não precisa imprimir voucher físico..."
                  className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                  id="input-ticket-notes"
                />
              </div>
            </div>

          </div>

          {/* Modal Actions Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div>
              {ticketToEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  id="btn-delete-ticket"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Aguarde...' : 'Excluir'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                id="btn-cancel-ticket"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-lg bg-[#1A2B4C] text-white text-xs font-semibold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                id="btn-save-ticket"
              >
                {isSaving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                    <span>Salvar Ingresso</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
