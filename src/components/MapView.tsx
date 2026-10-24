import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { usePlanner } from '../context/PlannerContext';
import { ItineraryDay, CustomRouteStop } from '../types';
import { isDayWithPark, estimateAccommodationCoordinates } from '../utils/parkScheduleUtils';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import {
  MapPin,
  Hotel,
  Sparkles,
  Car,
  Plane,
  ShoppingBag,
  Utensils,
  Search,
  ExternalLink,
  Navigation,
  Plus,
  Compass,
  Layers,
  Info,
  X,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  Route,
  ChevronRight,
  Edit3,
  Trash2,
  MoveUp,
  MoveDown,
  RotateCcw,
  Footprints,
  AlertCircle,
  Coffee,
  Moon,
  Sun,
} from 'lucide-react';

export interface LocationPoint {
  id: string;
  name: string;
  category: 'hotel' | 'disney' | 'universal' | 'other_parks' | 'shopping' | 'airport' | 'dining';
  lat: number;
  lng: number;
  address: string;
  description: string;
  driveTimeFromHotel?: string;
  websiteUrl?: string;
  isCustom?: boolean;
}

// Master Presets for Orlando, Parques, Restaurantes e Hotéis
const MASTER_LOCATIONS: LocationPoint[] = [
  // 1. HOTELS & RESORTS
  {
    id: 'loc-pop-century',
    name: "Disney's Pop Century Resort",
    category: 'hotel',
    lat: 28.3503,
    lng: -81.5422,
    address: '1050 Century Dr, Lake Buena Vista, FL 32830',
    description: 'Resort temático Disney com acesso direto ao transporte Skyliner (teleférico para EPCOT e Hollywood Studios).',
    driveTimeFromHotel: 'Ponto de Partida Padrão',
  },
  {
    id: 'loc-art-animation',
    name: "Disney's Art of Animation Resort",
    category: 'hotel',
    lat: 28.3518,
    lng: -81.5458,
    address: '1850 Animation Way, Lake Buena Vista, FL 32830',
    description: 'Resort temático da Disney focado nos clássicos de animação com acesso ao Skyliner.',
    driveTimeFromHotel: '~3 min',
  },
  {
    id: 'loc-allstar-movies',
    name: "Disney's All-Star Movies Resort",
    category: 'hotel',
    lat: 28.3405,
    lng: -81.5723,
    address: '1901 W Buena Vista Dr, Lake Buena Vista, FL 32830',
    description: 'Resort econômico clássico da Disney perto do Animal Kingdom.',
    driveTimeFromHotel: '~8 min',
  },
  {
    id: 'loc-grand-floridian',
    name: "Disney's Grand Floridian Resort & Spa",
    category: 'hotel',
    lat: 28.4110,
    lng: -81.5878,
    address: '4401 Floridian Way, Lake Buena Vista, FL 32830',
    description: 'Resort de luxo Disney ao lado do Magic Kingdom com Monorail direto.',
    driveTimeFromHotel: '~14 min',
  },
  {
    id: 'loc-cabana-bay',
    name: "Universal's Cabana Bay Beach Resort",
    category: 'hotel',
    lat: 28.4688,
    lng: -81.4697,
    address: '6525 Adventure Way, Orlando, FL 32819',
    description: 'Resort retromoderno da Universal ao lado do parque aquático Volcano Bay com ônibus gratuitos para os parques.',
    driveTimeFromHotel: '~20 min',
  },
  {
    id: 'loc-rosen-inn',
    name: 'Rosen Inn International Drive',
    category: 'hotel',
    lat: 28.4485,
    lng: -81.4705,
    address: '7600 International Dr, Orlando, FL 32819',
    description: 'Hotel parceiro popular na famosa International Drive, próximo a restaurantes e shoppings.',
    driveTimeFromHotel: '~18 min',
  },
  {
    id: 'loc-villa-kissimmee',
    name: 'Casa de Temporada / Villa em Kissimmee',
    category: 'hotel',
    lat: 28.3250,
    lng: -81.6050,
    address: 'Formosa Gardens / Windsor Hills, Kissimmee, FL 34747',
    description: 'Casa espaçosa com piscina privativa em condomínio fechado perto dos parques Disney.',
    driveTimeFromHotel: '~15 min',
  },
  {
    id: 'loc-modern-retreat-resort',
    name: 'Modern Retreat Resort (Venetian Bay Kissimmee)',
    category: 'hotel',
    lat: 28.3090,
    lng: -81.4326,
    address: '4009 Venetian Bay Dr, Kissimmee, FL 34741, USA',
    description: 'Resort residencial Venetian Bay em Kissimmee, próximo a supermercados e acesso aos parques.',
    driveTimeFromHotel: 'Ponto de Partida da Acomodação',
  },

  // 2. DISNEY PARKS
  {
    id: 'loc-magic-kingdom',
    name: 'Magic Kingdom Park (Walt Disney World)',
    category: 'disney',
    lat: 28.4177,
    lng: -81.5812,
    address: '1180 Seven Seas Drive, Lake Buena Vista, FL 32830',
    description: 'O parque do Castelo da Cinderela, TRON Lightcycle / Run, Space Mountain e o famoso show de fogos Happily Ever After.',
    driveTimeFromHotel: '~12 min (Carro) ou Monorail',
  },
  {
    id: 'loc-epcot',
    name: 'EPCOT',
    category: 'disney',
    lat: 28.3765,
    lng: -81.5494,
    address: '200 Epcot Center Dr, Lake Buena Vista, FL 32830',
    description: 'Parque do futuro e cultura mundial (World Showcase), Guardians of the Galaxy: Cosmic Rewind e Remy\'s Ratatouille.',
    driveTimeFromHotel: '~8 min (Skyliner)',
  },
  {
    id: 'loc-hollywood-studios',
    name: "Disney's Hollywood Studios",
    category: 'disney',
    lat: 28.3575,
    lng: -81.5583,
    address: '351 S Studio Dr, Lake Buena Vista, FL 32830',
    description: 'A casa de Star Wars: Galaxy\'s Edge (Rise of the Resistance), Toy Story Land e Tower of Terror.',
    driveTimeFromHotel: '~6 min (Skyliner)',
  },
  {
    id: 'loc-animal-kingdom',
    name: "Disney's Animal Kingdom",
    category: 'disney',
    lat: 28.3597,
    lng: -81.5907,
    address: '2901 Osceola Pkwy, Lake Buena Vista, FL 32830',
    description: 'Parque de aventura e vida selvagem com Pandora - The World of Avatar (Flight of Passage) e Expedition Everest.',
    driveTimeFromHotel: '~12 min',
  },
  {
    id: 'loc-typhoon-lagoon',
    name: "Disney's Typhoon Lagoon (Parque Aquático)",
    category: 'disney',
    lat: 28.3657,
    lng: -81.5292,
    address: '1140 Epcot Center Dr, Lake Buena Vista, FL 32830',
    description: 'Parque aquático tropical Disney com a maior piscina de ondas da América do Norte.',
    driveTimeFromHotel: '~10 min',
  },
  {
    id: 'loc-blizzard-beach',
    name: "Disney's Blizzard Beach (Parque Aquático)",
    category: 'disney',
    lat: 28.3529,
    lng: -81.5750,
    address: '1534 Blizzard Beach Dr, Orlando, FL 32836',
    description: 'Parque aquático com temática de estação de esqui derretida e o toboágua Summit Plummet.',
    driveTimeFromHotel: '~8 min',
  },

  // 3. UNIVERSAL PARKS
  {
    id: 'loc-universal-studios',
    name: 'Universal Studios Florida',
    category: 'universal',
    lat: 28.4748,
    lng: -81.4667,
    address: '6000 Universal Blvd, Orlando, FL 32819',
    description: 'Diagon Alley de Harry Potter (Escape from Gringotts), E.T., Transformers, Minions e Simpsons.',
    driveTimeFromHotel: '~22 min',
  },
  {
    id: 'loc-islands-of-adventure',
    name: "Universal's Islands of Adventure",
    category: 'universal',
    lat: 28.4714,
    lng: -81.4711,
    address: '6000 Universal Blvd, Orlando, FL 32819',
    description: 'Casa da incrível montanha-russa VelociCoaster, Hogsmeade (Hagrid\'s Motorbike) e Marvel Super Hero Island.',
    driveTimeFromHotel: '~22 min',
  },
  {
    id: 'loc-epic-universe',
    name: 'Universal Epic Universe (Novo Parque)',
    category: 'universal',
    lat: 28.4411,
    lng: -81.4468,
    address: 'Universal Epic Universe Pkwy, Orlando, FL 32819',
    description: 'O novíssimo parque da Universal com Super Nintendo World, Como Treinar o Seu Dragão, Harry Potter Ministério da Magia e Monstros.',
    driveTimeFromHotel: '~18 min',
  },
  {
    id: 'loc-volcano-bay',
    name: "Universal's Volcano Bay (Aquático)",
    category: 'universal',
    lat: 28.4624,
    lng: -81.4726,
    address: '6000 Universal Blvd, Orlando, FL 32819',
    description: 'Parque aquático temático ao redor de um vulcão gigante de 60 metros com toboáguas radicais.',
    driveTimeFromHotel: '~20 min',
  },

  // 4. OTHER PARKS
  {
    id: 'loc-seaworld',
    name: 'SeaWorld Orlando',
    category: 'other_parks',
    lat: 28.4114,
    lng: -81.4616,
    address: '7007 SeaWorld Dr, Orlando, FL 32821',
    description: 'A capital das montanhas-russas radicais (Mako, Pipeline, Kraken, Ice Breaker) e vida marinha.',
    driveTimeFromHotel: '~15 min',
  },
  {
    id: 'loc-busch-gardens',
    name: 'Busch Gardens Tampa Bay',
    category: 'other_parks',
    lat: 28.0373,
    lng: -82.4208,
    address: '10165 N McKinley Dr, Tampa, FL 33612',
    description: 'Parque radical em Tampa com montanhas-russas extremas (Iron Gwazi, SheiKra, Cheetah Hunt) e safari animal.',
    driveTimeFromHotel: '~1h 15min',
  },
  {
    id: 'loc-discovery-cove',
    name: 'Discovery Cove Orlando',
    category: 'other_parks',
    lat: 28.4061,
    lng: -81.4627,
    address: '6000 Discovery Cove Way, Orlando, FL 32821',
    description: 'Resort aquático exclusivo com nado com golfinhos, arraias e sistema All-Inclusive de alimentos e bebidas.',
    driveTimeFromHotel: '~15 min',
  },
  {
    id: 'loc-kennedy-space',
    name: 'Kennedy Space Center (NASA)',
    category: 'other_parks',
    lat: 28.5233,
    lng: -80.6814,
    address: 'Space Commerce Way, Merritt Island, FL 32953',
    description: 'Complexo espacial da NASA em Cabo Canaveral: veja o Ônibus Espacial Atlantis real e foguetes Saturn V.',
    driveTimeFromHotel: '~55 min',
  },
  {
    id: 'loc-gatorland',
    name: 'Gatorland Orlando',
    category: 'other_parks',
    lat: 28.3556,
    lng: -81.4019,
    address: '14501 S Orange Blossom Trl, Orlando, FL 32837',
    description: 'A capital dos jacarés na Flórida: veja jacarés albinos, shows históricos e tirolesa sobre o pântano.',
    driveTimeFromHotel: '~18 min',
  },

  // 5. SHOPPING & OUTLETS
  {
    id: 'loc-vineland-outlet',
    name: 'Orlando Vineland Premium Outlets',
    category: 'shopping',
    lat: 28.3882,
    lng: -81.4913,
    address: '8200 Vineland Ave, Orlando, FL 32821',
    description: 'O outlet mais próximo da Disney com marcas de luxo (Gucci, Prada, Nike, Tommy Hilfiger, Coach).',
    driveTimeFromHotel: '~12 min',
  },
  {
    id: 'loc-int-drive-outlet',
    name: 'Orlando International Premium Outlets',
    category: 'shopping',
    lat: 28.4746,
    lng: -81.4526,
    address: '4951 International Dr, Orlando, FL 32819',
    description: 'O maior outlet de Orlando no final da International Drive com centenas de lojas e grandes promoções.',
    driveTimeFromHotel: '~22 min',
  },
  {
    id: 'loc-mall-millenia',
    name: 'The Mall at Millenia',
    category: 'shopping',
    lat: 28.4858,
    lng: -81.4317,
    address: '4200 Conroy Rd, Orlando, FL 32839',
    description: 'Shopping coberto de alto padrão com Apple Store, Louis Vuitton, Chanel, Macy\'s e Cheesecake Factory.',
    driveTimeFromHotel: '~25 min',
  },
  {
    id: 'loc-florida-mall',
    name: 'The Florida Mall',
    category: 'shopping',
    lat: 28.4470,
    lng: -81.3970,
    address: '8001 S Orange Blossom Trl, Orlando, FL 32809',
    description: 'Grande shopping com M&M\'s World, Crayola Experience, Zara, Apple e Macy\'s.',
    driveTimeFromHotel: '~22 min',
  },
  {
    id: 'loc-walmart-vineland',
    name: 'Walmart Supercenter (Vineland Rd)',
    category: 'shopping',
    lat: 28.3842,
    lng: -81.4984,
    address: '3250 Vineland Rd, Kissimmee, FL 34746',
    description: 'Hipermercado 24h para comprar comida, snacks, lembrancinhas Disney baratas e água.',
    driveTimeFromHotel: '~10 min',
  },
  {
    id: 'loc-target-hunters',
    name: 'Target (Super Target Kissimmee)',
    category: 'shopping',
    lat: 28.3582,
    lng: -81.4089,
    address: '4795 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746',
    description: 'Excelente opção de compras de cosméticos, roupas, eletrônicos e compras de supermercado.',
    driveTimeFromHotel: '~15 min',
  },

  // 6. AIRPORTS & TRANSPORT HUBS
  {
    id: 'loc-airport-sfb',
    name: 'Aeroporto Internacional de Orlando Sanford (SFB)',
    category: 'airport',
    lat: 28.7776,
    lng: -81.2375,
    address: '1200 Red Cleveland Blvd, Sanford, FL 32773',
    description: 'Aeroporto internacional ao norte de Orlando (Sanford), muito utilizado por voos fretados e companhias diretas.',
    driveTimeFromHotel: '~45 min',
  },
  {
    id: 'loc-airport-mco',
    name: 'Aeroporto Internacional de Orlando (MCO)',
    category: 'airport',
    lat: 28.4312,
    lng: -81.3081,
    address: '1 Jeff Fuqua Blvd, Orlando, FL 32827',
    description: 'Aeroporto principal de chegada em Orlando com estação do Visitor Toll Pass e trem Brightline.',
    driveTimeFromHotel: '~25 min',
  },
  {
    id: 'loc-airport-gru',
    name: 'Aeroporto Internacional de São Paulo / Guarulhos (GRU)',
    category: 'airport',
    lat: -23.4356,
    lng: -46.4731,
    address: 'Rod. Hélio Smidt, s/nº - Cumbica, Guarulhos - SP, 07190-100',
    description: 'Principal hub internacional de voos saindo do Brasil rumo a Orlando e aos EUA.',
    driveTimeFromHotel: 'Origem no Brasil (Voo Internacional)',
  },
  {
    id: 'loc-airport-cgh',
    name: 'Aeroporto de São Paulo / Congonhas (CGH)',
    category: 'airport',
    lat: -23.6273,
    lng: -46.6565,
    address: 'Av. Washington Luís, s/nº - Vila Congonhas, São Paulo - SP, 04626-911',
    description: 'Aeroporto central de São Paulo (conexões e voos domésticos).',
    driveTimeFromHotel: 'Origem no Brasil',
  },
  {
    id: 'loc-airport-vcp',
    name: 'Aeroporto Internacional de Viracopos / Campinas (VCP)',
    category: 'airport',
    lat: -23.0074,
    lng: -47.1345,
    address: 'Rod. Santos Dumont, km 66 - Parque Viracopos, Campinas - SP, 13055-900',
    description: 'Hub de voos internacionais diretos (Azul) para Orlando (MCO / FLL).',
    driveTimeFromHotel: 'Origem no Brasil',
  },
  {
    id: 'loc-airport-gig',
    name: 'Aeroporto Internacional do Galeão (GIG)',
    category: 'airport',
    lat: -22.8089,
    lng: -43.2436,
    address: 'Av. Vinte de Janeiro, s/nº - Ilha do Governador, Rio de Janeiro - RJ, 21941-900',
    description: 'Aeroporto internacional no Rio de Janeiro com voos para os EUA.',
    driveTimeFromHotel: 'Origem no Brasil',
  },
  {
    id: 'loc-airport-bsb',
    name: 'Aeroporto Internacional de Brasília (BSB)',
    category: 'airport',
    lat: -15.8697,
    lng: -47.9172,
    address: 'Lago Sul, Brasília - DF, 71608-900',
    description: 'Aeroporto Internacional de Brasília com conexões diretas para os EUA (GOL).',
    driveTimeFromHotel: 'Origem no Brasil',
  },
  {
    id: 'loc-airport-cnf',
    name: 'Aeroporto Internacional de Confins / Belo Horizonte (CNF)',
    category: 'airport',
    lat: -19.6244,
    lng: -43.9719,
    address: 'Rodovia LMG-800, Km 7,9 - Confins - MG, 33500-900',
    description: 'Aeroporto Internacional de Belo Horizonte / Confins.',
    driveTimeFromHotel: 'Origem no Brasil',
  },
  {
    id: 'loc-airport-mia',
    name: 'Aeroporto Internacional de Miami (MIA)',
    category: 'airport',
    lat: 25.7959,
    lng: -80.2870,
    address: '2100 NW 42nd Ave, Miami, FL 33142',
    description: 'Aeroporto internacional em Miami (opção de desembarque a ~3h30 de viagem de carro ou Brightline).',
    driveTimeFromHotel: '~3h 30min',
  },
  {
    id: 'loc-airport-fll',
    name: 'Aeroporto Internacional de Fort Lauderdale-Hollywood (FLL)',
    category: 'airport',
    lat: 26.0742,
    lng: -80.1506,
    address: '100 Terminal Dr, Fort Lauderdale, FL 33315',
    description: 'Aeroporto em Fort Lauderdale com voos diretos da Azul e JetBlue.',
    driveTimeFromHotel: '~3h 15min',
  },
  {
    id: 'loc-airport-tpa',
    name: 'Aeroporto Internacional de Tampa (TPA)',
    category: 'airport',
    lat: 27.9772,
    lng: -82.5311,
    address: '4100 George J Bean Pkwy, Tampa, FL 33607',
    description: 'Aeroporto em Tampa (opção a ~1h15 de carro de Orlando via rodovia I-4 East).',
    driveTimeFromHotel: '~1h 15min',
  },
  {
    id: 'loc-home-origin',
    name: 'Residência (R. Ernesto de Castro, 139 - Brás, São Paulo)',
    category: 'hotel',
    lat: -23.55184,
    lng: -46.61500,
    address: 'R. Ernesto de Castro, 139 - Brás, São Paulo - SP, Brasil',
    description: 'Ponto de partida da residência rumo ao aeroporto no início da viagem.',
    driveTimeFromHotel: 'Ponto de Partida Inicial',
  },

  // 7. DINING & ENTERTAINMENT
  {
    id: 'loc-disney-springs',
    name: 'Disney Springs (Complexo Gastronômico & Lojas)',
    category: 'dining',
    lat: 28.3705,
    lng: -81.5178,
    address: '1486 Buena Vista Dr, Lake Buena Vista, FL 32830',
    description: 'Centro gastronômico e de compras da Disney com entrada gratuita, World of Disney e restaurantes temáticos.',
    driveTimeFromHotel: '~8 min',
  },
  {
    id: 'loc-citywalk',
    name: 'Universal CityWalk Orlando',
    category: 'dining',
    lat: 28.4735,
    lng: -81.4682,
    address: '6000 Universal Blvd, Orlando, FL 32819',
    description: 'Complexo de entretenimento na entrada da Universal com Toothsome Chocolate Emporium, Hard Rock Cafe e Cowfish.',
    driveTimeFromHotel: '~20 min',
  },
  {
    id: 'loc-be-our-guest',
    name: 'Be Our Guest Restaurant (Magic Kingdom)',
    category: 'dining',
    lat: 28.4205,
    lng: -81.5805,
    address: 'Magic Kingdom Park (Fantasyland), Lake Buena Vista, FL 32830',
    description: 'Jantar mágico no castelo da Fera de A Bela e a Fera com salão de baile majestoso.',
    driveTimeFromHotel: 'Dentro do Magic Kingdom',
  },
  {
    id: 'loc-columbia-harbour',
    name: 'Columbia Harbour House (Magic Kingdom)',
    category: 'dining',
    lat: 28.4188,
    lng: -81.5828,
    address: 'Liberty Square, Magic Kingdom Park, FL 32830',
    description: 'Excelente opção de almoço rápido com frutos do mar, frango empanado e salmão em ambiente climatizado de 2 andares.',
    driveTimeFromHotel: 'Dentro do Magic Kingdom',
  },
  {
    id: 'loc-space-220',
    name: 'Space 220 Restaurant (EPCOT)',
    category: 'dining',
    lat: 28.3758,
    lng: -81.5478,
    address: 'EPCOT (World Discovery), Lake Buena Vista, FL 32830',
    description: 'Experiência gastronômica imersiva simulando uma estação espacial a 220 milhas de altitude da Terra.',
    driveTimeFromHotel: 'Dentro do EPCOT',
  },
  {
    id: 'loc-camila-restaurant',
    name: 'Camila\'s Brazilian Restaurant (International Dr)',
    category: 'dining',
    lat: 28.4556,
    lng: -81.4601,
    address: '5454 International Dr, Orlando, FL 32819',
    description: 'Famoso buffet brasileiro com arroz, feijão, guaraná e carnes para matar a saudade do Brasil.',
    driveTimeFromHotel: '~20 min',
  },
  {
    id: 'loc-fogo-de-chao',
    name: 'Fogo de Chão Brazilian Steakhouse',
    category: 'dining',
    lat: 28.4419,
    lng: -81.4703,
    address: '8282 International Dr, Orlando, FL 32819',
    description: 'Tradicional rodízio de churrasco brasileiro premium na International Drive.',
    driveTimeFromHotel: '~18 min',
  },
  {
    id: 'loc-cheesecake-factory',
    name: 'The Cheesecake Factory (Mall at Millenia)',
    category: 'dining',
    lat: 28.4862,
    lng: -81.4312,
    address: '4200 Conroy Rd Ste H226, Orlando, FL 32839',
    description: 'Menu gigante com mais de 250 pratos e mais de 30 tipos de cheesecakes deliciosos.',
    driveTimeFromHotel: '~25 min',
  },
  {
    id: 'loc-olive-garden',
    name: 'Olive Garden Italian Restaurant (Vineland)',
    category: 'dining',
    lat: 28.3895,
    lng: -81.4920,
    address: '8984 International Dr, Orlando, FL 32819',
    description: 'Culinária italiana famosa pela sopa, salada e breadsticks ilimitados.',
    driveTimeFromHotel: '~14 min',
  },
  {
    id: 'loc-trex-cafe',
    name: 'T-Rex Cafe (Disney Springs)',
    category: 'dining',
    lat: 28.3710,
    lng: -81.5165,
    address: '1676 E Buena Vista Dr, Lake Buena Vista, FL 32830',
    description: 'Restaurante temático com dinossauros animatrônicos em tamanho real e chuva de meteoros a cada 20 minutos.',
    driveTimeFromHotel: '~8 min',
  },
  {
    id: 'loc-toothsome',
    name: 'The Toothsome Chocolate Emporium (CityWalk)',
    category: 'dining',
    lat: 28.4740,
    lng: -81.4675,
    address: '6000 Universal Blvd, Orlando, FL 32819',
    description: 'Fábrica de chocolate com visual Steampunk do século 19 e milk-shakes extravagantes.',
    driveTimeFromHotel: '~20 min',
  },
  {
    id: 'loc-icon-park',
    name: 'ICON Park (Roda Gigante The Wheel)',
    category: 'dining',
    lat: 28.4431,
    lng: -81.4688,
    address: '8375 International Dr, Orlando, FL 32819',
    description: 'Complexo na International Drive com a roda gigante The Wheel de 122m e restaurantes.',
    driveTimeFromHotel: '~18 min',
  },
];

// Calculation helper for distance in km between two lat/lng points
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Helper to parse coordinates if stored directly as "lat, lng"
function parseCoordinatesFromString(str?: string | null): { lat: number; lng: number } | null {
  if (!str) return null;
  const trimmed = str.trim();
  const regex = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/;
  const match = trimmed.match(regex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

// Drive time helper
function estimateDriveTimeText(distKm: number): string {
  if (distKm <= 0.3) return 'No mesmo local / A pé';
  if (distKm <= 2) return `~${Math.ceil(distKm * 2.5)} min (A pé / Carro)`;
  if (distKm > 300) {
    const flightHours = Math.max(1, Math.round(distKm / 800));
    return `~${flightHours}h de voo (~${Math.round(distKm)} km)`;
  }
  const mins = Math.round(distKm * 1.8 + 4);
  return `~${mins} min de carro`;
}

// Format date
function formatDateStr(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

// High-accuracy static geocoding dictionary for immediate zero-latency coordinate resolution
const KNOWN_EXACT_GEOCODED_ADDRESSES: Record<string, { lat: number; lng: number }> = {
  // Exact accommodation addresses - Kissimmee / Venetian Bay
  '4009 venetian bay dr, kissimmee, fl 34741, usa': { lat: 28.3090, lng: -81.4326 },
  '4009 venetian bay dr, kissimmee, fl 34741': { lat: 28.3090, lng: -81.4326 },
  '4009 venetian bay dr, kissimmee, fl': { lat: 28.3090, lng: -81.4326 },
  '4009 venetian bay dr, kissimmee': { lat: 28.3090, lng: -81.4326 },
  '4009 venetian bay dr': { lat: 28.3090, lng: -81.4326 },
  '4009 venetian bay drive': { lat: 28.3090, lng: -81.4326 },
  'venetian bay dr, kissimmee, fl': { lat: 28.3090, lng: -81.4326 },
  'venetian bay dr, kissimmee': { lat: 28.3090, lng: -81.4326 },
  'venetian bay dr': { lat: 28.3090, lng: -81.4326 },
  'venetian bay kissimmee': { lat: 28.3090, lng: -81.4326 },
  'venetian bay villages': { lat: 28.3090, lng: -81.4326 },
  'venetian bay': { lat: 28.3090, lng: -81.4326 },
  'modern retreat resort': { lat: 28.3090, lng: -81.4326 },
  'modern retreat resort kissimmee': { lat: 28.3090, lng: -81.4326 },
  'modern retreat': { lat: 28.3090, lng: -81.4326 },

  'r. ernesto de castro, 139 - brás': { lat: -23.55184, lng: -46.61500 },
  'r. ernesto de castro, 139 - bras': { lat: -23.55184, lng: -46.61500 },
  'r. ernesto de castro, 139': { lat: -23.55184, lng: -46.61500 },
  'rua ernesto de castro, 139': { lat: -23.55184, lng: -46.61500 },
  'rua ernesto de castro, 139 - brás': { lat: -23.55184, lng: -46.61500 },
  'rua ernesto de castro, 139 - bras': { lat: -23.55184, lng: -46.61500 },
  'rua ernesto de castro': { lat: -23.55184, lng: -46.61500 },
  'r. ernesto de castro': { lat: -23.55184, lng: -46.61500 },
  'ernesto de castro, 139': { lat: -23.55184, lng: -46.61500 },
  'ernesto de castro': { lat: -23.55184, lng: -46.61500 },
  'são paulo - guarulhos (gru)': { lat: -23.4356, lng: -46.4731 },
  'sao paulo - guarulhos (gru)': { lat: -23.4356, lng: -46.4731 },
  'orlando - sanford (sfb)': { lat: 28.7776, lng: -81.2375 },
  'aeroporto de guarulhos': { lat: -23.4356, lng: -46.4731 },
  'aeroporto de sanford': { lat: 28.7776, lng: -81.2375 },
};

export const MapView: React.FC = () => {
  const { itineraryDays, accommodations, flights, carRentals, updateItineraryDay } = usePlanner();

  // Active View Mode: 'all' or specific day ID (e.g. 'day-1', 'day-2')
  const [selectedDayId, setSelectedDayId] = useState<string>('all');

  // Master Locations list
  const [locations, setLocations] = useState<LocationPoint[]>(MASTER_LOCATIONS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationPoint | null>(null);

  // Selected stop in day route
  const [selectedRouteStopIndex, setSelectedRouteStopIndex] = useState<number | null>(null);

  // Modal: Add Custom Point to Map
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customPoint, setCustomPoint] = useState({
    name: '',
    category: 'shopping' as LocationPoint['category'],
    lat: 28.3772,
    lng: -81.545,
    address: '',
    description: '',
  });

  // Modal: Edit Day Route Stops
  const [isEditRouteModalOpen, setIsEditRouteModalOpen] = useState(false);
  const [editingDayStops, setEditingDayStops] = useState<CustomRouteStop[]>([]);
  const [realRouteMetrics, setRealRouteMetrics] = useState<{ distanceKm: number; driveTimeMinutes: number } | null>(null);

  // Address Geocoding Cache with strict validation and cleanup of poisoned entries
  const [geocodedCache, setGeocodedCache] = useState<{ [address: string]: { lat: number; lng: number } }>(() => {
    try {
      const saved = localStorage.getItem('kc_geocoded_addresses_cache');
      const parsed = saved ? JSON.parse(saved) : {};
      const cleanParsed: Record<string, { lat: number; lng: number }> = {};
      Object.keys(parsed).forEach((k) => {
        const item = parsed[k];
        if (item && typeof item.lat === 'number' && typeof item.lng === 'number') {
          // Reject out-of-bounds coordinates (such as Pacific/Samoa lat < -10 with lng < -130)
          if (item.lat < -10 && item.lng < -130) return;
          if (k.toLowerCase().includes('modern retreat') || k.toLowerCase().includes('venetian bay')) return;
          cleanParsed[k] = item;
        }
      });
      return { ...cleanParsed, ...KNOWN_EXACT_GEOCODED_ADDRESSES };
    } catch {
      return { ...KNOWN_EXACT_GEOCODED_ADDRESSES };
    }
  });

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeCacheRef = useRef<{ [key: string]: { roadCoordinates: [number, number][]; distanceKm: number; durationMin: number } }>({});

  // Geocode an arbitrary address with geographic bounds validation
  const geocodeAddress = useCallback(async (addressStr: string) => {
    if (!addressStr || !addressStr.trim() || addressStr.length < 3) return null;
    const cleanQuery = addressStr.trim();
    const cacheKey = cleanQuery.toLowerCase();
    if (geocodedCache[cacheKey]) return geocodedCache[cacheKey];
    if (KNOWN_EXACT_GEOCODED_ADDRESSES[cacheKey]) return KNOWN_EXACT_GEOCODED_ADDRESSES[cacheKey];

    // Helper to validate coordinates are in reasonable US / Brazil trip bounds
    const isValidTripCoordinate = (lat: number, lng: number) => {
      const isUS = lat >= 20 && lat <= 50 && lng >= -130 && lng <= -60;
      const isBrazil = lat >= -35 && lat <= 6 && lng >= -75 && lng <= -30;
      return isUS || isBrazil;
    };

    // Ensure search has US/Florida context if not already specifying state/country
    let queryWithContext = cleanQuery;
    const lowerQ = cleanQuery.toLowerCase();
    if (
      !lowerQ.includes('brasil') &&
      !lowerQ.includes('brazil') &&
      !lowerQ.includes(' sp') &&
      !lowerQ.includes('fl') &&
      !lowerQ.includes('florida') &&
      !lowerQ.includes('usa') &&
      !lowerQ.includes('estados unidos')
    ) {
      queryWithContext = `${cleanQuery}, Florida, USA`;
    }

    try {
      // 1. Try Nominatim OpenStreetMap
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryWithContext)}&limit=1`;
      const res = await fetch(nomUrl, {
        headers: { 'Accept-Language': 'pt-BR,en;q=0.8' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lng) && isValidTripCoordinate(lat, lng)) {
            const result = { lat, lng };
            setGeocodedCache((prev) => {
              const next = { ...prev, [cacheKey]: result, [cleanQuery]: result };
              try {
                localStorage.setItem('kc_geocoded_addresses_cache', JSON.stringify(next));
              } catch {}
              return next;
            });
            return result;
          }
        }
      }
    } catch {}

    try {
      // 2. Try Photon Komoot OSM mirror
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryWithContext)}&limit=1`;
      const res2 = await fetch(photonUrl);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.features && data2.features.length > 0) {
          const coords = data2.features[0].geometry.coordinates; // [lng, lat]
          const lat = coords[1];
          const lng = coords[0];
          if (!isNaN(lat) && !isNaN(lng) && isValidTripCoordinate(lat, lng)) {
            const result = { lat, lng };
            setGeocodedCache((prev) => {
              const next = { ...prev, [cacheKey]: result, [cleanQuery]: result };
              try {
                localStorage.setItem('kc_geocoded_addresses_cache', JSON.stringify(next));
              } catch {}
              return next;
            });
            return result;
          }
        }
      }
    } catch {}

    return null;
  }, [geocodedCache]);

  // Find currently selected day object
  const activeDay = useMemo(() => {
    if (selectedDayId === 'all') return null;
    return itineraryDays.find((d) => d.id === selectedDayId) || null;
  }, [selectedDayId, itineraryDays]);

  // Helper to resolve accommodation coordinates strictly from its registered address
  const resolveAccommodationCoords = useCallback(
    (acc: { name?: string; address?: string }): { lat: number; lng: number } => {
      if (acc.address && acc.address.trim()) {
        const parsed = parseCoordinatesFromString(acc.address);
        if (parsed) return parsed;

        const lowerAddr = acc.address.toLowerCase().trim();
        if (KNOWN_EXACT_GEOCODED_ADDRESSES[lowerAddr]) {
          return KNOWN_EXACT_GEOCODED_ADDRESSES[lowerAddr];
        }
        if (geocodedCache[lowerAddr]) {
          return geocodedCache[lowerAddr];
        }

        // Substring check in KNOWN_EXACT_GEOCODED_ADDRESSES
        for (const [key, coords] of Object.entries(KNOWN_EXACT_GEOCODED_ADDRESSES)) {
          if (lowerAddr.includes(key) || key.includes(lowerAddr)) {
            return coords;
          }
        }
      }

      // Fallback to address/name coordinates estimation (Venetian Bay, Kissimmee, Disney, Universal, etc.)
      return estimateAccommodationCoordinates(acc.name, acc.address);
    },
    [geocodedCache]
  );

  // Primary Accommodation (Only if registered in trip) - Coordinates STRICTLY derived from registered address
  const primaryHotelLocation = useMemo<LocationPoint | null>(() => {
    if (accommodations && accommodations.length > 0) {
      // Find matching accommodation for active day or default to primary
      const acc =
        (activeDay && activeDay.date
          ? accommodations.find(
              (a) =>
                a.checkInDate &&
                a.checkOutDate &&
                activeDay.date >= a.checkInDate &&
                activeDay.date <= a.checkOutDate
            )
          : null) || accommodations[0];

      const resolvedCoords = resolveAccommodationCoords(acc);
      const displayAddress = acc.address && acc.address.trim() ? acc.address.trim() : 'Orlando, FL';

      return {
        id: `loc-acc-${acc.id || 'primary'}`,
        name: acc.name,
        category: 'hotel',
        lat: resolvedCoords.lat,
        lng: resolvedCoords.lng,
        address: displayAddress,
        description: `Acomodação Cadastrada: ${acc.name} (${acc.roomType || acc.type || 'Reserva'})`,
        driveTimeFromHotel: 'Ponto de Partida da Acomodação',
      };
    }
    return null;
  }, [accommodations, activeDay, resolveAccommodationCoords]);

  // If primary accommodation has an address not yet geocoded, automatically trigger geocoding
  useEffect(() => {
    if (primaryHotelLocation && primaryHotelLocation.address && primaryHotelLocation.address.length > 5) {
      const key = primaryHotelLocation.address.toLowerCase().trim();
      if (!geocodedCache[key] && !KNOWN_EXACT_GEOCODED_ADDRESSES[key]) {
        geocodeAddress(primaryHotelLocation.address);
      }
    }
  }, [primaryHotelLocation, geocodeAddress, geocodedCache]);

  // Auto-geocode any unmapped address strings found in active day schedule
  useEffect(() => {
    if (!activeDay || !activeDay.hourlySchedule) return;
    activeDay.hourlySchedule.forEach((item) => {
      const locStr = item.location?.trim();
      if (locStr && locStr.length > 3) {
        const key = locStr.toLowerCase();
        if (!geocodedCache[key]) {
          geocodeAddress(locStr);
        }
      }
    });
  }, [activeDay, geocodeAddress, geocodedCache]);

  // Helper to find location for a text string (park, dining, place, airport, address)
  const findBestLocationMatch = (text: string, categoryPreference?: LocationPoint['category']): LocationPoint | null => {
    if (!text || !text.trim()) return null;
    const lower = text.toLowerCase().trim();

    // 0. Primary Accommodation check (STRICTLY prioritize the registered accommodation address and coordinates, UNLESS text specifies another distinct location/address)
    if (primaryHotelLocation) {
      const accNameLower = primaryHotelLocation.name.toLowerCase();
      const accAddrLower = (primaryHotelLocation.address || '').toLowerCase();
      
      const hasDistinctLocation =
        lower.includes('miami') ||
        lower.includes('brickell') ||
        lower.includes('comfort inn') ||
        lower.includes('100 southeast') ||
        lower.includes('orlando international') ||
        lower.includes('mco') ||
        lower.includes('sanford') ||
        lower.includes('guarulhos') ||
        lower.includes('aeroporto');

      const isAccMatch =
        !hasDistinctLocation &&
        ((accNameLower && (lower.includes(accNameLower) || accNameLower.includes(lower))) ||
        (accAddrLower && (lower.includes(accAddrLower) || accAddrLower.includes(lower))) ||
        lower.includes('modern retreat') ||
        lower.includes('venetian bay') ||
        ((lower.includes('início do dia na acomodação') || lower.includes('inicio do dia na acomodação')) && !lower.includes('aeroporto')) ||
        ((lower.includes('saída da acomodação') || lower.includes('saida da acomodacao') || lower.startsWith('saída de') || lower.startsWith('saida de')) && !lower.includes('aeroporto') && !lower.includes('parque')) ||
        ((lower.includes('fim do dia na acomodação') || lower.includes('retorno à acomodação') || lower.includes('retorno a acomodacao') || lower.includes('chegada e fim do dia na acomodação')) && !lower.includes('aeroporto')) ||
        ((lower.includes('check-in') || lower.includes('checkin') || lower.includes('check-out') || lower.includes('checkout')) && (lower.includes('hotel') || lower.includes('hospedagem') || lower.includes('resort') || lower.includes('casa') || lower.includes('airbnb') || lower.includes(accNameLower))) ||
        ((lower === 'hotel' || lower === 'acomodação' || lower === 'acomodacao' || lower === 'hospedagem') && !lower.includes('aeroporto')));

      if (isAccMatch) {
        return {
          id: primaryHotelLocation.id,
          name: primaryHotelLocation.name,
          category: 'hotel',
          lat: primaryHotelLocation.lat,
          lng: primaryHotelLocation.lng,
          address: primaryHotelLocation.address,
          description: primaryHotelLocation.description,
          driveTimeFromHotel: 'Acomodação Cadastrada',
        };
      }
    }

    // 0.1 Check coordinates if string contains "lat, lng"
    const parsedCoords = parseCoordinatesFromString(text);
    if (parsedCoords) {
      return {
        id: `coord-${parsedCoords.lat}-${parsedCoords.lng}`,
        name: text,
        category: categoryPreference || 'hotel',
        lat: parsedCoords.lat,
        lng: parsedCoords.lng,
        address: text,
        description: `Localização personalizada (${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)})`,
      };
    }

    // 0.2 Check dynamic geocoded cache for this exact address
    if (geocodedCache[lower] || geocodedCache[text]) {
      const geo = geocodedCache[lower] || geocodedCache[text];
      return {
        id: `geocoded-${geo.lat.toFixed(5)}-${geo.lng.toFixed(5)}`,
        name: text,
        category: categoryPreference || 'hotel',
        lat: geo.lat,
        lng: geo.lng,
        address: text,
        description: `Localização encontrada: ${text}`,
      };
    }

    // 2. Direct match in master/custom list
    const directMatch = locations.find((l) => {
      const lName = l.name.toLowerCase();
      return lower.includes(lName) || lName.includes(lower);
    });
    if (directMatch) return directMatch;

    // 3. HOME / ORIGIN DEPARTURE & BRAZILIAN RESIDENTIAL ADDRESSES
    // Specific exact address on Rua Ernesto de Castro, 139 - Brás, São Paulo
    if (
      lower.includes('ernesto de castro') ||
      lower.includes('ernesto de castro, 139') ||
      (lower.includes('ernesto') && lower.includes('castro'))
    ) {
      return {
        id: 'loc-home-ernesto-bras',
        name: 'Residência (R. Ernesto de Castro, 139 - Brás, São Paulo)',
        category: 'hotel',
        lat: -23.55184,
        lng: -46.61500,
        address: 'R. Ernesto de Castro, 139 - Brás, São Paulo - SP, Brasil',
        description: 'Ponto de partida da viagem em São Paulo, SP.',
        driveTimeFromHotel: 'Ponto de Partida Inicial',
      };
    }

    // General Home / Departure from Home / Brazil Origin
    if (
      lower.includes('sair de casa') ||
      lower.includes('saída de casa') ||
      lower.includes('partida de casa') ||
      lower.includes('minha casa') ||
      lower.includes('minha residência') ||
      lower.includes('residencia') ||
      lower.includes('residência') ||
      lower === 'casa' ||
      lower.startsWith('casa /') ||
      lower.startsWith('casa (') ||
      lower.startsWith('residência') ||
      lower.startsWith('residencia')
    ) {
      return {
        id: 'loc-home-ernesto-bras',
        name: 'Residência (R. Ernesto de Castro, 139 - Brás, São Paulo)',
        category: 'hotel',
        lat: -23.55184,
        lng: -46.61500,
        address: 'R. Ernesto de Castro, 139 - Brás, São Paulo - SP, Brasil',
        description: 'Saída da residência rumo ao aeroporto no início da viagem.',
        driveTimeFromHotel: 'Ponto de Partida Inicial',
      };
    }

    // 4. AIRPORTS & TRANSPORTATION (High Priority - Evaluated BEFORE generic city searches)
    // Guarulhos / SP (GRU)
    if (
      lower.includes('gru') ||
      lower.includes('guarulhos') ||
      lower.includes('cumbica') ||
      (lower.includes('decolagem') && (lower.includes('são paulo') || lower.includes('sao paulo') || lower.includes('sp'))) ||
      (lower.includes('chegada') && (lower.includes('são paulo') || lower.includes('sao paulo') || lower.includes('sp'))) ||
      (lower.includes('aeroporto') && (lower.includes('são paulo') || lower.includes('sao paulo') || lower.includes('sp')))
    ) {
      return locations.find((l) => l.id === 'loc-airport-gru') || null;
    }
    // Sanford (SFB)
    if (lower.includes('sfb') || lower.includes('sanford') || lower.includes('orlando sanford') || lower.includes('orlando-sanford')) {
      return locations.find((l) => l.id === 'loc-airport-sfb') || null;
    }
    // Congonhas / SP (CGH)
    if (lower.includes('cgh') || lower.includes('congonhas')) {
      return locations.find((l) => l.id === 'loc-airport-cgh') || null;
    }
    // Viracopos / Campinas (VCP)
    if (lower.includes('vcp') || lower.includes('viracopos') || (lower.includes('aeroporto') && lower.includes('campinas'))) {
      return locations.find((l) => l.id === 'loc-airport-vcp') || null;
    }
    // Galeão / RJ (GIG)
    if (lower.includes('gig') || lower.includes('galeão') || lower.includes('galeao') || lower.includes('tom jobim') || (lower.includes('aeroporto') && lower.includes('rio'))) {
      return locations.find((l) => l.id === 'loc-airport-gig') || null;
    }
    // Santos Dumont / RJ (SDU)
    if (lower.includes('sdu') || lower.includes('santos dumont')) {
      return locations.find((l) => l.id === 'loc-airport-sdu') || null;
    }
    // Brasília (BSB)
    if (lower.includes('bsb') || lower.includes('brasília') || lower.includes('brasilia')) {
      return locations.find((l) => l.id === 'loc-airport-bsb') || null;
    }
    // Confins / BH (CNF)
    if (lower.includes('cnf') || lower.includes('confins') || lower.includes('belo horizonte')) {
      return locations.find((l) => l.id === 'loc-airport-cnf') || null;
    }
    // Miami (MIA)
    if (lower.includes('mia') || lower.includes('miami')) {
      return locations.find((l) => l.id === 'loc-airport-mia') || null;
    }
    // Fort Lauderdale (FLL)
    if (lower.includes('fll') || lower.includes('fort lauderdale') || lower.includes('ft lauderdale')) {
      return locations.find((l) => l.id === 'loc-airport-fll') || null;
    }
    // Tampa (TPA)
    if (lower.includes('tpa') || lower.includes('aeroporto tampa') || lower.includes('tampa int')) {
      return locations.find((l) => l.id === 'loc-airport-tpa') || null;
    }
    // Orlando International (MCO) - Generic fallback if Orlando / unassigned airport
    if (
      lower.includes('mco') ||
      lower.includes('orlando int') ||
      lower.includes('jeff fuqua') ||
      lower.includes('aeroporto')
    ) {
      return locations.find((l) => l.id === 'loc-airport-mco') || null;
    }

    // 5. Brazilian Cities / General Neighborhoods (Only if not matched to an airport above)
    if (
      lower.includes('são paulo') ||
      lower.includes('sao paulo') ||
      lower.includes('sp, brasil') ||
      lower.includes('sp - brasil') ||
      lower.includes('paulista') ||
      lower.includes('mooca') ||
      lower.includes('pinheiros') ||
      lower.includes('tatuapé')
    ) {
      return {
        id: 'loc-sp-custom-address',
        name: text,
        category: 'hotel',
        lat: -23.5358,
        lng: -46.6188,
        address: text,
        description: 'Endereço de partida em São Paulo - SP.',
        driveTimeFromHotel: 'Origem no Brasil',
      };
    }

    // 5. THEME PARKS & ATTRACTIONS
    if (lower.includes('magic kingdom') || lower.includes('castelo') || lower.includes('tron') || lower.includes('space mountain')) {
      return locations.find((l) => l.id === 'loc-magic-kingdom') || null;
    }
    if (lower.includes('epcot') || lower.includes('guardiões') || lower.includes('guardians') || lower.includes('world showcase') || lower.includes('test track') || lower.includes('soarin')) {
      return locations.find((l) => l.id === 'loc-epcot') || null;
    }
    if (lower.includes('hollywood studios') || lower.includes('star wars') || lower.includes('toy story') || lower.includes('tower of terror') || lower.includes('slinky dog') || lower.includes('rise of the resistance')) {
      return locations.find((l) => l.id === 'loc-hollywood-studios') || null;
    }
    if (lower.includes('animal kingdom') || lower.includes('pandora') || lower.includes('avatar') || lower.includes('flight of passage') || lower.includes('safari') || lower.includes('everest')) {
      return locations.find((l) => l.id === 'loc-animal-kingdom') || null;
    }
    if (lower.includes('typhoon lagoon')) {
      return locations.find((l) => l.id === 'loc-typhoon-lagoon') || null;
    }
    if (lower.includes('blizzard beach')) {
      return locations.find((l) => l.id === 'loc-blizzard-beach') || null;
    }
    if (lower.includes('epic universe') || lower.includes('nintendo') || lower.includes('mario world') || lower.includes('stardust racers') || lower.includes('celestial park')) {
      return locations.find((l) => l.id === 'loc-epic-universe') || null;
    }
    if (lower.includes('volcano bay') || lower.includes('krakatau')) {
      return locations.find((l) => l.id === 'loc-volcano-bay') || null;
    }
    if (lower.includes('islands of adventure') || lower.includes('velocicoaster') || lower.includes('hogsmeade') || lower.includes('hagrid') || lower.includes('jurassic park') || lower.includes('hulk')) {
      return locations.find((l) => l.id === 'loc-islands-of-adventure') || null;
    }
    if (lower.includes('universal studios') || lower.includes('universal') || lower.includes('diagon alley') || lower.includes('gringotts') || lower.includes('mummy') || lower.includes('minions')) {
      return locations.find((l) => l.id === 'loc-universal-studios') || null;
    }
    if (lower.includes('seaworld') || lower.includes('mako') || lower.includes('kraken') || lower.includes('pipeline') || lower.includes('penguin trek')) {
      return locations.find((l) => l.id === 'loc-seaworld') || null;
    }
    if (lower.includes('aquatica')) {
      return locations.find((l) => l.id === 'loc-aquatica') || null;
    }
    if (lower.includes('busch gardens') || lower.includes('iron gwazi') || lower.includes('sheikra') || lower.includes('montu')) {
      return locations.find((l) => l.id === 'loc-busch-gardens') || null;
    }
    if (lower.includes('discovery cove') || lower.includes('golfinhos')) {
      return locations.find((l) => l.id === 'loc-discovery-cove') || null;
    }
    if (lower.includes('kennedy space') || lower.includes('nasa') || lower.includes('cabo canaveral') || lower.includes('cape canaveral') || lower.includes('atlantis')) {
      return locations.find((l) => l.id === 'loc-kennedy-space') || null;
    }
    if (lower.includes('gatorland') || lower.includes('jacarés')) {
      return locations.find((l) => l.id === 'loc-gatorland') || null;
    }

    // 6. SHOPPING & SUPERMARKETS
    if (lower.includes('disney springs') || lower.includes('springs') || lower.includes('world of disney')) {
      return locations.find((l) => l.id === 'loc-disney-springs') || null;
    }
    if (lower.includes('citywalk') || lower.includes('city walk')) {
      return locations.find((l) => l.id === 'loc-citywalk') || null;
    }
    if (lower.includes('vineland') || lower.includes('outlet vineland') || lower.includes('orlando vineland')) {
      return locations.find((l) => l.id === 'loc-vineland-outlet') || null;
    }
    if (lower.includes('international premium') || lower.includes('outlet international') || lower.includes('outlet premium') || lower.includes('int drive outlet') || lower.includes('outlets international')) {
      return locations.find((l) => l.id === 'loc-int-drive-outlet') || null;
    }
    if (lower.includes('millenia') || lower.includes('mall at millenia')) {
      return locations.find((l) => l.id === 'loc-mall-millenia') || null;
    }
    if (lower.includes('florida mall')) {
      return locations.find((l) => l.id === 'loc-florida-mall') || null;
    }
    if (lower.includes('walmart') || lower.includes('wal-mart')) {
      return locations.find((l) => l.id === 'loc-walmart-vineland') || null;
    }
    if (lower.includes('target') || lower.includes('super target')) {
      return locations.find((l) => l.id === 'loc-target-hunters') || null;
    }
    if (lower.includes('icon park') || lower.includes('roda gigante') || lower.includes('the wheel') || lower.includes('madame tussauds') || lower.includes('sea life')) {
      return locations.find((l) => l.id === 'loc-icon-park') || null;
    }

    // 7. DINING & RESTAURANTS
    if (lower.includes('camila') || lower.includes('restaurante brasileiro') || lower.includes('buffet brasileiro')) {
      return locations.find((l) => l.id === 'loc-camila-restaurant') || null;
    }
    if (lower.includes('fogo de chao') || lower.includes('fogo de chão') || lower.includes('churrasco') || lower.includes('churrascaria')) {
      return locations.find((l) => l.id === 'loc-fogo-de-chao') || null;
    }
    if (lower.includes('olive garden')) {
      return locations.find((l) => l.id === 'loc-olive-garden') || null;
    }
    if (lower.includes('toothsome') || lower.includes('chocolate emporium')) {
      return locations.find((l) => l.id === 'loc-toothsome') || null;
    }
    if (lower.includes('be our guest') || lower.includes('bela e a fera')) {
      return locations.find((l) => l.id === 'loc-be-our-guest') || null;
    }
    if (lower.includes('columbia harbour')) {
      return locations.find((l) => l.id === 'loc-columbia-harbour') || null;
    }
    if (lower.includes('space 220') || lower.includes('restaurante espacial')) {
      return locations.find((l) => l.id === 'loc-space-220') || null;
    }
    if (lower.includes('t-rex') || lower.includes('trex') || lower.includes('t rex')) {
      return locations.find((l) => l.id === 'loc-trex-cafe') || null;
    }
    if (lower.includes('cheesecake')) {
      return locations.find((l) => l.id === 'loc-cheesecake-factory') || null;
    }

    if (categoryPreference) {
      const matchCat = locations.find((l) => l.category === categoryPreference);
      if (matchCat) return matchCat;
    }

    return null;
  };

  // Derive sequence of stops for a given day STRICTLY from real plan
  const getDayRouteStops = (day: ItineraryDay): CustomRouteStop[] => {
    // 1. If user customized route stops manually in modal
    if (day.customRouteStops && day.customRouteStops.length > 0) {
      return day.customRouteStops;
    }

    // 2. If day has items in hourlySchedule (from Itinerary Planner / Supabase hourly_schedules table)
    if (day.hourlySchedule && day.hourlySchedule.length > 0) {
      // Sort chronologically
      const sortedSchedule = [...day.hourlySchedule].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const stops: CustomRouteStop[] = [];

      sortedSchedule.forEach((item, index) => {
        let catPref: LocationPoint['category'] = 'dining';
        if (item.category === 'park') catPref = 'disney';
        else if (item.category === 'hotel') catPref = 'hotel';
        else if (item.category === 'flight' || item.category === 'transport') catPref = 'airport';
        else if (item.category === 'shopping') catPref = 'shopping';

        const tLower = (item.title || '').toLowerCase();
        const lLower = (item.location || '').toLowerCase();
        const idLower = (item.id || '').toLowerCase();

        const isParkEvent =
          item.sourceType === 'park' ||
          item.sourceType === 'fastpass' ||
          item.sourceType === 'show' ||
          item.category === 'park' ||
          idLower.includes('auto-saida-parque') ||
          idLower.includes('auto-abertura') ||
          idLower.includes('auto-ida') ||
          idLower.includes('auto-estacionamento') ||
          idLower.includes('auto-carro') ||
          tLower.includes('fechamento de') ||
          tLower.includes('abertura oficial') ||
          tLower.includes('entrada antecipada') ||
          tLower.includes('estacionamento');

        const isAccItem =
          !isParkEvent &&
          (item.sourceType === 'accommodation' ||
            item.category === 'hotel' ||
            item.category === 'airbnb' ||
            idLower.startsWith('auto-inicio') ||
            (idLower.startsWith('auto-saida') && !idLower.includes('auto-saida-parque')) ||
            idLower.startsWith('auto-retorno') ||
            idLower.startsWith('auto-hotel') ||
            idLower.includes('hourly-acc-') ||
            tLower.includes('início do dia na acomodação') ||
            tLower.includes('inicio do dia na acomodação') ||
            tLower.includes('saída da acomodação') ||
            tLower.includes('saida da acomodacao') ||
            tLower.includes('fim do dia na acomodação') ||
            tLower.includes('retorno à acomodação') ||
            tLower.includes('retorno a acomodacao') ||
            tLower.includes('chegada e fim do dia na acomodação') ||
            tLower.includes('check-in') ||
            tLower.includes('check-out') ||
            (primaryHotelLocation && (
              lLower.includes(primaryHotelLocation.address.toLowerCase()) ||
              lLower.includes(primaryHotelLocation.name.toLowerCase()) ||
              (tLower.includes('saída de ') && tLower.includes(primaryHotelLocation.name.toLowerCase()))
            )) ||
            lLower.includes('venetian bay') ||
            lLower.includes('modern retreat'));

        let matchedLoc: LocationPoint | null = null;

        // 1. Priority 1: Check item.location (stored in hourly_schedules table)
        if (item.location && item.location.trim()) {
          matchedLoc = findBestLocationMatch(item.location, catPref);
        }

        // 2. Priority 2: If item.location is empty/missing, check if item.sourceId links to an accommodation
        if (!matchedLoc && item.sourceId && accommodations) {
          const linkedAcc = accommodations.find((a) => a.id === item.sourceId);
          if (linkedAcc) {
            const coords = resolveAccommodationCoords(linkedAcc);
            matchedLoc = {
              id: `loc-acc-${linkedAcc.id}`,
              name: linkedAcc.name,
              category: 'hotel',
              lat: coords.lat,
              lng: coords.lng,
              address: linkedAcc.address || 'Orlando, FL',
              description: linkedAcc.name,
            };
          }
        }

        // 3. Priority 3: Check item.title or notes
        if (!matchedLoc && item.title && item.title.trim()) {
          matchedLoc = findBestLocationMatch(item.title, catPref);
        }
        if (!matchedLoc && item.notes && item.notes.trim()) {
          matchedLoc = findBestLocationMatch(item.notes, catPref);
        }

        // 4. Fallback ONLY if it is a general hotel event and NO specific location or sourceId is set.
        if (!matchedLoc && isAccItem && primaryHotelLocation && !item.location && !item.sourceId) {
          matchedLoc = primaryHotelLocation;
        }

        // Fallback coordinates spread along Orlando tourism axis if unmapped
        const fallbackLat = 28.3700 + index * 0.012;
        const fallbackLng = -81.5200 - index * 0.008;

        const finalLat = matchedLoc ? matchedLoc.lat : fallbackLat;
        const finalLng = matchedLoc ? matchedLoc.lng : fallbackLng;

        let stopCat: CustomRouteStop['category'] = 'other';
        if (item.category === 'park') stopCat = 'park';
        else if (item.category === 'hotel') stopCat = 'hotel';
        else if (item.category === 'flight' || item.category === 'transport') stopCat = 'airport';
        else if (item.category === 'shopping') stopCat = 'shopping';
        else if (item.category === 'dining') stopCat = 'dining';
        else if (matchedLoc?.category) {
          if (matchedLoc.category === 'disney' || matchedLoc.category === 'universal' || matchedLoc.category === 'other_parks') stopCat = 'park';
          else if (matchedLoc.category === 'airport') stopCat = 'airport';
          else if (matchedLoc.category === 'hotel') stopCat = 'hotel';
          else if (matchedLoc.category === 'shopping') stopCat = 'shopping';
          else if (matchedLoc.category === 'dining') stopCat = 'dining';
        }

        const stopDisplayName = item.title || item.location || `Parada ${index + 1}`;
        const stopLocation = item.location || (matchedLoc ? (matchedLoc.address || matchedLoc.name) : '');
        const stopNotes = item.notes || '';

        stops.push({
          id: `stop-${day.id}-${item.id || index}`,
          name: stopDisplayName,
          category: stopCat,
          lat: finalLat,
          lng: finalLng,
          time: item.time || '--:--',
          notes: stopNotes,
          location: stopLocation,
          order: index + 1,
        });
      });

      return stops;
    }

    // 3. If hourlySchedule is empty, check standard itinerary fields (park, morning, afternoon, night, flights)
    const stops: CustomRouteStop[] = [];
    let orderCounter = 1;

    const hasPark = isDayWithPark(day);

    const hasMorning = Boolean(day.morning?.where?.trim() || day.morning?.dining?.trim());
    const hasAfternoon = Boolean(day.afternoon?.where?.trim() || day.afternoon?.dining?.trim());
    const hasNight = Boolean(day.night?.where?.trim() || day.night?.dining?.trim());
    const isDayOne = day.dayNumber === 1;
    const isLastDay = day.dayNumber === itineraryDays.length;

    const outboundFlight = flights?.find((f) => f.type === 'outbound');
    const inboundFlight = flights?.find((f) => f.type === 'inbound');

    // Flight arrival on Day 1
    if (isDayOne && outboundFlight) {
      const airportLoc = locations.find((l) => l.id === 'loc-airport-mco') || locations.find((l) => l.category === 'airport')!;
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-flight`,
        name: `Desembarque: Aeroporto (${outboundFlight.airline || 'Voo'} ${outboundFlight.flightNumber || ''})`.trim(),
        category: 'airport',
        lat: airportLoc.lat,
        lng: airportLoc.lng,
        time: outboundFlight.arrivalTime || '07:00',
        notes: `Chegada do voo ${outboundFlight.flightNumber || ''} no aeroporto.`,
        location: outboundFlight.arrivalAirport ? `Aeroporto de ${outboundFlight.arrivalAirport}` : airportLoc.address,
        order: orderCounter,
      });
    }

    // Car Rental Pickup
    if (carRentals && carRentals.length > 0) {
      carRentals.forEach((rental, rIdx) => {
        if (rental.pickupDate === day.date || (isDayOne && rIdx === 0 && !rental.pickupDate)) {
          const pickupLocMatch = findBestLocationMatch(rental.pickupLocation, 'airport') || locations.find((l) => l.id === 'loc-airport-mco') || locations.find((l) => l.category === 'airport')!;
          stops.push({
            id: `stop-${day.id}-${orderCounter++}-car-pickup-${rental.id}`,
            name: `🚗 Retirada de Carro: ${rental.company || 'Locadora'} (${rental.category || 'Veículo'})`,
            category: 'airport',
            lat: pickupLocMatch.lat,
            lng: pickupLocMatch.lng,
            time: rental.pickupTime || '10:00',
            notes: `Retirada do veículo ${rental.category || ''}. Confirmação: ${rental.confirmationCode || 'N/A'}`,
            location: rental.pickupLocation || pickupLocMatch.address,
            order: orderCounter,
          });
        }
        if (rental.dropoffDate === day.date || (isLastDay && rIdx === 0 && !rental.dropoffDate)) {
          const dropoffLocMatch = findBestLocationMatch(rental.dropoffLocation, 'airport') || locations.find((l) => l.id === 'loc-airport-mco') || locations.find((l) => l.category === 'airport')!;
          stops.push({
            id: `stop-${day.id}-${orderCounter++}-car-dropoff-${rental.id}`,
            name: `🚗 Devolução de Carro: ${rental.company || 'Locadora'} (${rental.category || 'Veículo'})`,
            category: 'airport',
            lat: dropoffLocMatch.lat,
            lng: dropoffLocMatch.lng,
            time: rental.dropoffTime || '16:00',
            notes: `Devolução do veículo ${rental.category || ''}.`,
            location: rental.dropoffLocation || dropoffLocMatch.address,
            order: orderCounter,
          });
        }
      });
    }

    // Hotel Start (ONLY if hotel is registered AND there are park/activities)
    if (primaryHotelLocation && (hasPark || hasMorning || hasAfternoon || hasNight)) {
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-hotel-start`,
        name: `Saída do Hotel: ${primaryHotelLocation.name}`,
        category: 'hotel',
        lat: primaryHotelLocation.lat,
        lng: primaryHotelLocation.lng,
        time: '07:30',
        notes: 'Saída para as atividades do dia.',
        location: primaryHotelLocation.address,
        order: orderCounter,
      });
    }

    // Main Park or Morning Activity
    if (hasPark) {
      const parkLoc = findBestLocationMatch(day.park, 'disney') || locations.find((l) => l.id === 'loc-magic-kingdom')!;
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-park`,
        name: parkLoc.name,
        category: 'park',
        lat: parkLoc.lat,
        lng: parkLoc.lng,
        time: '08:30',
        notes: day.morning?.where || `Visita ao parque ${day.park}`,
        location: parkLoc.address,
        order: orderCounter,
      });
    } else if (hasMorning) {
      const morningText = `${day.morning.where || ''} ${day.morning.dining || ''}`.trim();
      const morningLoc = findBestLocationMatch(morningText, 'dining') || locations.find((l) => l.id === 'loc-disney-springs')!;
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-morning`,
        name: day.morning.where || day.morning.dining || morningLoc.name,
        category: 'dining',
        lat: morningLoc.lat,
        lng: morningLoc.lng,
        time: '09:00',
        notes: day.morning.notes || '',
        location: morningLoc.address,
        order: orderCounter,
      });
    }

    // Lunch / Afternoon Activity
    if (hasAfternoon) {
      const afternoonText = `${day.afternoon.where || ''} ${day.afternoon.dining || ''}`.trim();
      const afternoonLoc = findBestLocationMatch(afternoonText, 'dining');
      if (afternoonLoc) {
        stops.push({
          id: `stop-${day.id}-${orderCounter++}-afternoon`,
          name: day.afternoon.dining || day.afternoon.where || afternoonLoc.name,
          category: 'dining',
          lat: afternoonLoc.lat,
          lng: afternoonLoc.lng,
          time: '13:00',
          notes: day.afternoon.notes || '',
          location: afternoonLoc.address,
          order: orderCounter,
        });
      }
    }

    // Night / Dinner Activity
    if (hasNight) {
      const nightText = `${day.night.where || ''} ${day.night.dining || ''}`.trim();
      const nightLoc = findBestLocationMatch(nightText, 'dining');
      if (nightLoc) {
        stops.push({
          id: `stop-${day.id}-${orderCounter++}-night`,
          name: day.night.dining || day.night.where || nightLoc.name,
          category: 'dining',
          lat: nightLoc.lat,
          lng: nightLoc.lng,
          time: '19:30',
          notes: day.night.notes || '',
          location: nightLoc.address,
          order: orderCounter,
        });
      }
    }

    // Flight departure on Last Day
    if (isLastDay && inboundFlight) {
      const airportLoc = locations.find((l) => l.id === 'loc-airport-mco') || locations.find((l) => l.category === 'airport')!;
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-flight-return`,
        name: `Embarque de Retorno: Aeroporto (${inboundFlight.airline || 'Voo'} ${inboundFlight.flightNumber || ''})`.trim(),
        category: 'airport',
        lat: airportLoc.lat,
        lng: airportLoc.lng,
        time: inboundFlight.departureTime || '18:00',
        notes: `Voo de volta para casa ${inboundFlight.flightNumber || ''}.`,
        location: inboundFlight.departureAirport ? `Aeroporto de ${inboundFlight.departureAirport}` : airportLoc.address,
        order: orderCounter,
      });
    }

    // Hotel Return (ONLY if hotel is registered AND other activities occurred)
    if (primaryHotelLocation && stops.length > 0 && !isLastDay) {
      stops.push({
        id: `stop-${day.id}-${orderCounter++}-hotel-return`,
        name: `Retorno ao Hotel: ${primaryHotelLocation.name}`,
        category: 'hotel',
        lat: primaryHotelLocation.lat,
        lng: primaryHotelLocation.lng,
        time: '22:00',
        notes: 'Retorno para descanso.',
        location: primaryHotelLocation.address,
        order: orderCounter,
      });
    }

    // If day is completely empty and hotel is registered, show base hotel stay
    if (stops.length === 0 && primaryHotelLocation) {
      stops.push({
        id: `stop-${day.id}-1-hotel-stay`,
        name: `Hospedagem: ${primaryHotelLocation.name}`,
        category: 'hotel',
        lat: primaryHotelLocation.lat,
        lng: primaryHotelLocation.lng,
        time: '--:--',
        notes: 'Dia livre de descanso na hospedagem.',
        order: 1,
      });
    }

    return stops;
  };

  // Active Day Stops
  const activeDayStops = useMemo<CustomRouteStop[]>(() => {
    if (!activeDay) return [];
    return getDayRouteStops(activeDay);
  }, [activeDay, primaryHotelLocation, locations, flights, carRentals]);

  // Route metrics (Total distance & total drive time)
  const routeMetrics = useMemo(() => {
    if (activeDayStops.length < 2) {
      return { totalDistanceKm: 0, totalDriveTimeMinutes: 0, legs: [] };
    }

    let totalDist = 0;
    const legs: Array<{ from: string; to: string; distanceKm: number; timeText: string }> = [];

    for (let i = 0; i < activeDayStops.length - 1; i++) {
      const from = activeDayStops[i];
      const to = activeDayStops[i + 1];
      const dist = calculateDistanceKm(from.lat, from.lng, to.lat, to.lng);
      totalDist += dist;
      legs.push({
        from: from.name,
        to: to.name,
        distanceKm: dist,
        timeText: estimateDriveTimeText(dist),
      });
    }

    const totalDriveMins = Math.round(totalDist * 1.6 + legs.length * 3);

    return {
      totalDistanceKm: Math.round(totalDist * 10) / 10,
      totalDriveTimeMinutes: totalDriveMins,
      legs,
    };
  }, [activeDayStops]);

  // Dynamic Route Sequence Title
  const routeSequenceTitle = useMemo(() => {
    if (activeDayStops.length === 0) {
      return 'Dia Livre / Sem Paradas Cadastradas';
    }
    if (activeDayStops.length === 1) {
      return `Parada do Dia: ${activeDayStops[0].name}`;
    }
    const shortNames = activeDayStops.map((s) => {
      if (s.name.startsWith('Saída do Hotel:')) return 'Saída Hotel';
      if (s.name.startsWith('Retorno ao Hotel:')) return 'Retorno Hotel';
      if (s.name.startsWith('Desembarque:')) return 'Aeroporto';
      if (s.name.startsWith('Embarque:')) return 'Aeroporto';
      if (s.name.length > 20) return s.name.substring(0, 18) + '...';
      return s.name;
    });
    return `Sequência: ${shortNames.join(' ➔ ')}`;
  }, [activeDayStops]);

  // Category Configuration Meta
  const getCategoryMeta = (cat: LocationPoint['category'] | CustomRouteStop['category']) => {
    switch (cat) {
      case 'hotel':
        return { label: 'Hospedagem', color: '#2563EB', bgClass: 'bg-blue-600', textClass: 'text-blue-600', icon: Hotel };
      case 'disney':
      case 'park':
        return { label: 'Parques & Atrações', color: '#D4AF37', bgClass: 'bg-amber-500', textClass: 'text-amber-600', icon: Sparkles };
      case 'universal':
        return { label: 'Parques Universal', color: '#7C3AED', bgClass: 'bg-purple-600', textClass: 'text-purple-600', icon: Compass };
      case 'other_parks':
        return { label: 'Outros Parques (SeaWorld/NASA)', color: '#0284C7', bgClass: 'bg-sky-600', textClass: 'text-sky-600', icon: Compass };
      case 'shopping':
        return { label: 'Compras & Outlets', color: '#EA580C', bgClass: 'bg-orange-600', textClass: 'text-orange-600', icon: ShoppingBag };
      case 'airport':
        return { label: 'Aeroportos', color: '#0D9488', bgClass: 'bg-teal-600', textClass: 'text-teal-600', icon: Plane };
      case 'dining':
        return { label: 'Restaurantes & Gastronomia', color: '#E11D48', bgClass: 'bg-rose-600', textClass: 'text-rose-600', icon: Utensils };
      default:
        return { label: 'Local de Apoio', color: '#475569', bgClass: 'bg-slate-600', textClass: 'text-slate-600', icon: MapPin };
    }
  };

  // Filtered Locations when 'all' is selected
  const filteredAllLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchesCategory = selectedCategory === 'all' || loc.category === selectedCategory;
      const matchesSearch =
        loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [locations, selectedCategory, searchQuery]);

  // Leaflet Map Initialization & Updates
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [28.3772, -81.545],
        zoom: 11,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // 1. Remove existing markers
    Object.values(markersRef.current).forEach((marker: L.Marker) => marker.remove());
    markersRef.current = {};

    // 2. Remove existing route layers
    if (routeLayerGroupRef.current) {
      routeLayerGroupRef.current.clearLayers();
      map.removeLayer(routeLayerGroupRef.current);
      routeLayerGroupRef.current = null;
    }

    let isEffectCancelled = false;

    // 3. RENDER MODE: SPECIFIC DAY (SHOW ONLY SELECTED DAY POINTS & DRAW ROUTE)
    if (selectedDayId !== 'all' && activeDayStops.length > 0) {
      const stopsLatLngs: [number, number][] = [];
      const newRouteGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = newRouteGroup;

      activeDayStops.forEach((stop, index) => {
        const meta = getCategoryMeta(stop.category);
        stopsLatLngs.push([stop.lat, stop.lng]);

        const stepNumber = index + 1;

        // Custom Sequenced Number Badge DivIcon
        const iconHtml = `
          <div id="marker-badge-${stop.id}" class="marker-pin-inner" style="
            background: ${index === 0 || index === activeDayStops.length - 1 ? '#1A2B4C' : meta.color};
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 800;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.25s ease;
          ">
            ${stepNumber}
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'day-route-marker',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],
        });

        const googleMapsQuery =
          stop.category === 'hotel' && stop.location
            ? stop.location
            : stop.location && (stop.location.includes(',') || stop.location.includes('FL') || stop.location.includes('Florida'))
            ? stop.location
            : [stop.name, stop.location].filter(Boolean).join(' ');
        const googleMapsSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleMapsQuery || `${stop.lat},${stop.lng}`)}`;

        const popupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px; max-width: 270px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
              <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #1A2B4C; color: #D4AF37; padding: 2.5px 7px; border-radius: 5px;">
                Etapa ${stepNumber} de ${activeDayStops.length}
              </span>
              <span style="font-size: 11px; font-weight: 700; color: #0f172a;">
                ⏰ ${stop.time || '--:--'}
              </span>
            </div>
            <h4 style="font-weight: 700; font-size: 13.5px; color: #1A2B4C; margin: 3px 0 2px 0; line-height: 1.3;">${stop.name}</h4>
            
            ${stop.location ? `
              <div style="display: flex; align-items: flex-start; gap: 5px; font-size: 11px; font-weight: 600; color: #334155; background: #f8fafc; padding: 5px 8px; border-radius: 6px; margin: 5px 0 6px 0; border: 1px solid #e2e8f0; line-height: 1.35;">
                <span style="color: #ea580c; flex-shrink: 0; font-size: 12px; margin-top: -1px;">📍</span>
                <span style="word-break: break-word;">${stop.location}</span>
              </div>
            ` : ''}

            ${stop.notes ? `<p style="font-size: 11px; color: #475569; margin: 0 0 8px 0; line-height: 1.35;">${stop.notes}</p>` : ''}

            <a href="${googleMapsSearch}" target="_blank" rel="noopener noreferrer" style="
              display: inline-block;
              background: #1A2B4C;
              color: white;
              font-size: 11px;
              font-weight: 700;
              padding: 6px 12px;
              border-radius: 8px;
              text-decoration: none;
              width: 100%;
              text-align: center;
              box-sizing: border-box;
              margin-top: 3px;
            ">
              🗺️ Ver no Google Maps ↗
            </a>
          </div>
        `;

        const marker = L.marker([stop.lat, stop.lng], { icon: customIcon })
          .bindPopup(popupHtml)
          .addTo(map);

        marker.on('click', () => {
          setSelectedRouteStopIndex(index);
          setSelectedLocation(null);
          const cardEl = document.getElementById(`route-stop-card-${stop.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });

        markersRef.current[stop.id] = marker;
      });

      if (activeDayStops.length >= 2) {
        newRouteGroup.clearLayers();

        // Helper to fetch real driving road geometry with multi-mirror failover
        const fetchDrivingLeg = async (
          orig: { lat: number; lng: number },
          dest: { lat: number; lng: number }
        ): Promise<{ roadCoordinates: [number, number][]; distanceKm: number; durationMin: number } | null> => {
          const legCacheKey = `${orig.lat.toFixed(5)},${orig.lng.toFixed(5)}->${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
          if (routeCacheRef.current[legCacheKey]) {
            return routeCacheRef.current[legCacheKey];
          }

          const mirrors = [
            `https://router.project-osrm.org/route/v1/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`,
            `https://routing.openstreetmap.de/routed-car/route/v1/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`,
          ];

          for (const url of mirrors) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);
              const res = await fetch(url, { signal: controller.signal });
              clearTimeout(timeoutId);

              if (res.ok) {
                const data = await res.json();
                if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
                  const route = data.routes[0];
                  const roadCoords: [number, number][] = route.geometry.coordinates.map(
                    (c: [number, number]) => [c[1], c[0]]
                  );
                  const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
                  const durationMin = Math.round(route.duration / 60);

                  const result = {
                    roadCoordinates: roadCoords,
                    distanceKm,
                    durationMin,
                  };
                  routeCacheRef.current[legCacheKey] = result;
                  return result;
                }
              }
            } catch {
              // Try next mirror
            }
          }

          return null;
        };

        // Draw Google Maps styled road lines
        const drawGoogleMapsRoadLayers = (coords: [number, number][]) => {
          // 1. Dark Casing / Border line
          L.polyline(coords, {
            color: '#1E3A8A',
            weight: 8,
            opacity: 0.55,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(newRouteGroup);

          // 2. Main Google Maps Blue line
          L.polyline(coords, {
            color: '#2563EB',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(newRouteGroup);

          // 3. Center highlight glow
          L.polyline(coords, {
            color: '#93C5FD',
            weight: 1.5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(newRouteGroup);
        };

        // Process every leg sequentially
        const legPromises: Promise<{ isFlight: boolean; distanceKm: number; durationMin: number } | null>[] = [];

        for (let i = 0; i < activeDayStops.length - 1; i++) {
          const p1 = activeDayStops[i];
          const p2 = activeDayStops[i + 1];
          const legDist = calculateDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);

          // A flight is ONLY for intercity/intercontinental legs (> 350 km), e.g. Brazil -> USA (6800 km)
          // Any local distance (e.g. home in SP to GRU = 20 km, or Orlando hotel to Magic Kingdom = 12 km) is a DRIVING ROAD TRIP
          const isFlightLeg = legDist > 350;

          if (isFlightLeg) {
            // Draw Flight path: teal dashed curved line
            L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
              color: '#0D9488',
              weight: 4,
              opacity: 0.85,
              dashArray: '8, 8',
              lineCap: 'round',
            }).addTo(newRouteGroup);

            legPromises.push(
              Promise.resolve({
                isFlight: true,
                distanceKm: legDist,
                durationMin: Math.round((legDist / 800) * 60) + 45,
              })
            );
          } else {
            // Real Road Leg: fetch street trajectory
            const legCacheKey = `${p1.lat.toFixed(5)},${p1.lng.toFixed(5)}->${p2.lat.toFixed(5)},${p2.lng.toFixed(5)}`;
            const cached = routeCacheRef.current[legCacheKey];

            if (cached) {
              drawGoogleMapsRoadLayers(cached.roadCoordinates);
              legPromises.push(
                Promise.resolve({
                  isFlight: false,
                  distanceKm: cached.distanceKm,
                  durationMin: cached.durationMin,
                })
              );
            } else {
              // Draw provisional subtle line while fetching real street geometry
              const provisionalLine = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
                color: '#2563EB',
                weight: 3.5,
                opacity: 0.5,
                dashArray: '5, 5',
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(newRouteGroup);

              const legPromise = fetchDrivingLeg(p1, p2).then((res) => {
                if (isEffectCancelled) return null;
                try {
                  newRouteGroup.removeLayer(provisionalLine);
                } catch {
                  // ignore
                }

                if (res && res.roadCoordinates && res.roadCoordinates.length > 0) {
                  drawGoogleMapsRoadLayers(res.roadCoordinates);
                  return {
                    isFlight: false,
                    distanceKm: res.distanceKm,
                    durationMin: res.durationMin,
                  };
                }

                // Fallback straight line if completely offline
                L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
                  color: '#2563EB',
                  weight: 4.5,
                  opacity: 0.85,
                  lineCap: 'round',
                  lineJoin: 'round',
                }).addTo(newRouteGroup);

                return {
                  isFlight: false,
                  distanceKm: legDist,
                  durationMin: Math.round(legDist * 1.5),
                };
              });

              legPromises.push(legPromise);
            }
          }
        }

        // Aggregate day metrics across all legs
        Promise.all(legPromises).then((results) => {
          if (isEffectCancelled) return;
          let totalRoadDist = 0;
          let totalRoadTime = 0;
          let totalFlightDist = 0;
          let totalFlightTime = 0;

          results.forEach((res) => {
            if (!res) return;
            if (res.isFlight) {
              totalFlightDist += res.distanceKm;
              totalFlightTime += res.durationMin;
            } else {
              totalRoadDist += res.distanceKm;
              totalRoadTime += res.durationMin;
            }
          });

          setRealRouteMetrics({
            distanceKm: Math.round((totalRoadDist + totalFlightDist) * 10) / 10,
            driveTimeMinutes: totalRoadTime + totalFlightTime,
          });
        });

        // Set initial map viewport for active day
        const hasIntercontinental = activeDayStops.some((s, idx) => {
          if (idx === 0) return false;
          return calculateDistanceKm(activeDayStops[idx - 1].lat, activeDayStops[idx - 1].lng, s.lat, s.lng) > 1000;
        });

        if (hasIntercontinental) {
          // Focus initially on departure stop
          map.setView([activeDayStops[0].lat, activeDayStops[0].lng], 12);
        } else {
          const bounds = L.latLngBounds(stopsLatLngs);
          map.fitBounds(bounds.pad(0.18));
        }
      } else if (stopsLatLngs.length === 1) {
        map.setView(stopsLatLngs[0], 14);
      }
    }

    // 4. RENDER MODE: DAY HAS NO STOPS
    else if (selectedDayId !== 'all' && activeDayStops.length === 0) {
      setRealRouteMetrics(null);
      if (primaryHotelLocation) {
        map.setView([primaryHotelLocation.lat, primaryHotelLocation.lng], 13);
      } else {
        map.setView([28.3772, -81.545], 11);
      }
    }

    // 5. RENDER MODE: ALL LOCATIONS (GENERAL OVERVIEW)
    else if (selectedDayId === 'all') {
      setRealRouteMetrics(null);
      filteredAllLocations.forEach((loc) => {
        const meta = getCategoryMeta(loc.category);

        const iconHtml = `
          <div id="marker-badge-${loc.id}" class="marker-pin-inner" style="
            background-color: ${meta.color};
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 2.5px solid white;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.25s ease;
          ">
            📍
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-map-marker',
          iconSize: [34, 34],
          iconAnchor: [17, 34],
          popupAnchor: [0, -34],
        });

        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name + ' ' + loc.address)}`;

        const popupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px; max-width: 240px;">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${meta.color}; margin-bottom: 2px;">
              ${meta.label}
            </div>
            <h4 style="font-weight: 700; font-size: 13px; color: #1A2B4C; margin: 0 0 4px 0;">${loc.name}</h4>
            <p style="font-size: 11px; color: #475569; margin: 0 0 6px 0; line-height: 1.3;">${loc.description}</p>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="
              display: inline-block;
              background: #1A2B4C;
              color: white;
              font-size: 10px;
              font-weight: 700;
              padding: 5px 10px;
              border-radius: 6px;
              text-decoration: none;
              width: 100%;
              text-align: center;
              box-sizing: border-box;
            ">
              🗺️ GPS no Google Maps ↗
            </a>
          </div>
        `;

        const marker = L.marker([loc.lat, loc.lng], { icon: customIcon })
          .bindPopup(popupHtml)
          .addTo(map);

        marker.on('click', () => {
          setSelectedLocation(loc);
          setSelectedRouteStopIndex(null);
          const cardEl = document.getElementById(`loc-card-${loc.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });

        markersRef.current[loc.id] = marker;
      });

      // Fit bounds
      if (filteredAllLocations.length > 0) {
        const group = L.featureGroup(Object.values(markersRef.current));
        map.fitBounds(group.getBounds().pad(0.15));
      }
    }

    return () => {
      isEffectCancelled = true;
    };
  }, [selectedDayId, activeDayStops, filteredAllLocations]);

  // Synchronize Active Selection Effect: highlights marker with pulse, opens popup, and scrolls sidebar card
  useEffect(() => {
    // 1. Clear all active pulse badges
    document.querySelectorAll('.marker-pin-inner').forEach((el) => {
      el.classList.remove('marker-selected-pulse');
    });

    if (selectedDayId !== 'all' && selectedRouteStopIndex !== null && activeDayStops[selectedRouteStopIndex]) {
      const activeStop = activeDayStops[selectedRouteStopIndex];
      const activeMarker = markersRef.current[activeStop.id];
      if (activeMarker) {
        if (!activeMarker.isPopupOpen()) {
          activeMarker.openPopup();
        }
      }
      const badgeEl = document.getElementById(`marker-badge-${activeStop.id}`);
      if (badgeEl) {
        badgeEl.classList.add('marker-selected-pulse');
      }
      const cardEl = document.getElementById(`route-stop-card-${activeStop.id}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else if (selectedDayId === 'all' && selectedLocation) {
      const activeMarker = markersRef.current[selectedLocation.id];
      if (activeMarker) {
        if (!activeMarker.isPopupOpen()) {
          activeMarker.openPopup();
        }
      }
      const badgeEl = document.getElementById(`marker-badge-${selectedLocation.id}`);
      if (badgeEl) {
        badgeEl.classList.add('marker-selected-pulse');
      }
      const cardEl = document.getElementById(`loc-card-${selectedLocation.id}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedRouteStopIndex, selectedLocation, selectedDayId, activeDayStops]);

  // Click on a Stop card in Day Route to Fly and Open Popup
  const handleFocusRouteStop = (index: number) => {
    setSelectedRouteStopIndex(index);
    const stop = activeDayStops[index];
    if (stop && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([stop.lat, stop.lng], 14, { duration: 0.8 });
      const marker = markersRef.current[stop.id];
      if (marker) marker.openPopup();
    }
  };

  // Click on a location in All Locations list
  const handleSelectGeneralLocation = (loc: LocationPoint) => {
    setSelectedLocation(loc);
    setSelectedRouteStopIndex(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 });
      const marker = markersRef.current[loc.id];
      if (marker) marker.openPopup();
    }
  };

  // Open multi-stop route in Google Maps
  const handleOpenGoogleMapsFullRoute = () => {
    if (activeDayStops.length < 2) return;
    // Format: https://www.google.com/maps/dir/lat1,lng1/lat2,lng2/lat3,lng3
    const pathStr = activeDayStops.map((s) => `${s.lat},${s.lng}`).join('/');
    const url = `https://www.google.com/maps/dir/${pathStr}`;
    window.open(url, '_blank');
  };

  // Open Edit Route Modal
  const handleOpenEditRoute = () => {
    if (!activeDay) return;
    setEditingDayStops([...activeDayStops]);
    setIsEditRouteModalOpen(true);
  };

  // Save customized Day Route
  const handleSaveCustomRoute = () => {
    if (!activeDay) return;
    updateItineraryDay(activeDay.id, {
      customRouteStops: editingDayStops.map((stop, idx) => ({
        ...stop,
        order: idx + 1,
      })),
    });
    setIsEditRouteModalOpen(false);
  };

  // Reset day route to automatic smart defaults
  const handleResetDayRoute = () => {
    if (!activeDay) return;
    updateItineraryDay(activeDay.id, {
      customRouteStops: undefined,
    });
    setIsEditRouteModalOpen(false);
  };

  // Add Custom Location to General Map
  const handleAddCustomPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPoint.name.trim()) return;

    const newLoc: LocationPoint = {
      id: `loc-custom-${Date.now()}`,
      name: customPoint.name.trim(),
      category: customPoint.category,
      lat: customPoint.lat,
      lng: customPoint.lng,
      address: customPoint.address.trim() || 'Orlando, FL',
      description: customPoint.description.trim() || 'Ponto personalizado cadastrado na viagem.',
      driveTimeFromHotel: '~15 min',
      isCustom: true,
    };

    setLocations((prev) => [newLoc, ...prev]);
    setIsAddModalOpen(false);
    setCustomPoint({
      name: '',
      category: 'shopping',
      lat: 28.3772,
      lng: -81.545,
      address: '',
      description: '',
    });

    setTimeout(() => {
      setSelectedDayId('all');
      handleSelectGeneralLocation(newLoc);
    }, 200);
  };

  const { handleBackdropClick: handleEditRouteModalBackdrop } = useModalKeyEvents({
    isOpen: isEditRouteModalOpen && !isAddModalOpen,
    onCancel: () => setIsEditRouteModalOpen(false),
    onSave: handleSaveCustomRoute,
  });

  const { handleBackdropClick: handleAddModalBackdrop } = useModalKeyEvents({
    isOpen: isAddModalOpen,
    onCancel: () => setIsAddModalOpen(false),
    onSave: () => handleAddCustomPoint({ preventDefault: () => {} } as React.FormEvent),
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D4AF37] mb-1">
              <Route className="w-4 h-4" />
              <span>Navegação & Rota Diária Inteligente</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif">
              Mapa e Rota da Viagem
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 mt-2 max-w-2xl leading-relaxed">
              Visualize os pontos por dia com o trajeto completo (saída do hotel, parque, restaurante e retorno) ou explore o mapa geral com todos os locais de Orlando.
            </p>
          </div>
        </div>

        {/* Quick KPI Strip inside Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Locais Mapeados
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37] block mt-1">
              {locations.length} Pontos
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Destino Central
            </span>
            <span className="text-xs sm:text-sm font-bold text-white block mt-1.5 truncate">
              Orlando, FL
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Hospedagem Principal
            </span>
            <div className="text-sm font-bold text-amber-300 mt-1 truncate">
              {accommodations && accommodations.length > 0 ? accommodations[0].name : 'Não cadastrada'}
            </div>
            <div className="text-[10px] text-slate-300 truncate">
              {accommodations && accommodations.length > 0
                ? (accommodations[0].roomType || accommodations[0].address || (accommodations[0].confirmationCode ? `Confirmação: ${accommodations[0].confirmationCode}` : 'Hospedagem Confirmada'))
                : 'Pendente de cadastro'}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
              Dias de Rota
            </span>
            <span className="text-xs sm:text-sm font-bold text-white block mt-1.5">
              {itineraryDays.length} Dias Programados
            </span>
          </div>
        </div>
      </div>

      {/* DAYS SELECTOR BAR (CHIPS) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1A2B4C]" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#1A2B4C]">
              Selecione o Dia para Ver a Rota Específica:
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline font-medium">
            {selectedDayId === 'all'
              ? 'Exibindo todos os pontos gerais'
              : `Exibindo somente os pontos do ${activeDay?.title}`}
          </span>
        </div>

        {/* Horizontal scrollable days list */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {/* ALL DAYS BUTTON */}
          <button
            type="button"
            onClick={() => {
              setSelectedDayId('all');
              setSelectedRouteStopIndex(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 shrink-0 ${
              selectedDayId === 'all'
                ? 'bg-[#1A2B4C] text-white shadow-md ring-2 ring-[#D4AF37]'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 text-[#D4AF37]" />
            <span>Todos os Dias (Visão Geral)</span>
            <span className="bg-white/20 text-current text-[10px] px-1.5 py-0.5 rounded-full">
              {locations.length}
            </span>
          </button>

          {/* INDIVIDUAL DAY BUTTONS */}
          {itineraryDays.map((day) => {
            const isSelected = selectedDayId === day.id;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setSelectedDayId(day.id);
                  setSelectedRouteStopIndex(0);
                  setSelectedLocation(null);
                }}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? 'bg-[#1A2B4C] text-white shadow-md ring-2 ring-[#D4AF37]'
                    : 'bg-slate-50 hover:bg-amber-50/60 text-slate-700 border border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                  isSelected ? 'bg-[#D4AF37] text-[#1A2B4C]' : 'bg-slate-200 text-slate-700'
                }`}>
                  {day.dayNumber}
                </div>
                <div className="text-left">
                  <div className="leading-tight flex items-center gap-1.5">
                    <span>Dia {day.dayNumber}</span>
                    <span className="text-[10px] opacity-75 font-normal">({formatDateStr(day.date)})</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal truncate max-w-[130px]">
                    {day.park && day.park !== 'Sem Parque' ? day.park : (day.title || 'Sem Parque')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELECTED DAY ROUTE SUMMARY (When specific day is selected) */}
      {selectedDayId !== 'all' && activeDay && (
        <div className="bg-gradient-to-r from-amber-50/90 via-white to-amber-50/50 rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/50 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1A2B4C] text-[#D4AF37] text-[10px] font-extrabold uppercase tracking-wider">
                  Rota do Dia {activeDay.dayNumber} • {formatDateStr(activeDay.date)}
                </span>
                <span className="text-xs font-bold text-slate-600">
                  {activeDay.title}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#1A2B4C] font-serif flex items-center gap-2">
                <Footprints className="w-5 h-5 text-[#D4AF37]" />
                <span>{routeSequenceTitle}</span>
              </h2>
              <p className="text-xs text-slate-600">
                {activeDayStops.length > 0
                  ? `Exibindo exclusivamente as ${activeDayStops.length} paradas cadastradas no roteiro do Dia ${activeDay.dayNumber}.`
                  : `Nenhuma parada ou parque cadastrado para este dia. Adicione horários no Planejador de Roteiro para traçar a rota.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeDayStops.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenGoogleMapsFullRoute}
                  className="px-4 py-2.5 rounded-xl bg-[#1A2B4C] hover:bg-[#243A66] text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  title="Abrir a rota no Google Maps com todas as paradas"
                >
                  <Navigation className="w-4 h-4 text-[#D4AF37]" />
                  <span>Navegar Rota no Google Maps</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenEditRoute}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Editar locais e paradas da rota deste dia"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                <span>Personalizar Paradas</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-amber-200/60">
            <div className="bg-white/80 rounded-xl p-2.5 border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Paradas</span>
              <span className="text-base font-extrabold text-[#1A2B4C]">{activeDayStops.length} locais</span>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Distância de Rodovia</span>
              <span className="text-base font-extrabold text-amber-600">
                {activeDayStops.length >= 2 ? (realRouteMetrics ? `${realRouteMetrics.distanceKm} km` : `${routeMetrics.totalDistanceKm} km`) : '0 km'}
              </span>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block" title="Tempo estimado de condução (sem trânsito)">Tempo em Trânsito (Estimativa)</span>
              <span className="text-base font-extrabold text-blue-600">
                {activeDayStops.length >= 2 ? `~${realRouteMetrics ? `${realRouteMetrics.driveTimeMinutes} min (Sem trânsito)` : `${routeMetrics.totalDriveTimeMinutes} min (Aproximado)`}` : '0 min'}
              </span>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Hospedagem Base</span>
              <span className="text-xs font-bold text-slate-700 truncate block mt-0.5">
                {primaryHotelLocation ? primaryHotelLocation.name : 'Não cadastrada'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FILTER AND SEARCH BAR (Only active in 'all' days mode) */}
      {selectedDayId === 'all' && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar ponto (ex: Magic Kingdom, Outlets Vineland, Walmart, Camila's, MCO...)"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-[#1A2B4C]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="text-xs font-bold text-slate-500 shrink-0">
              Exibindo <span className="text-[#1A2B4C] font-extrabold">{filteredAllLocations.length}</span> pontos no mapa
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-[#1A2B4C] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Todos ({locations.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('hotel')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'hotel'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              <Hotel className="w-3.5 h-3.5" />
              <span>Hospedagens</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('disney')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'disney'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Parques Disney</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('universal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'universal'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-900 border border-purple-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Parques Universal</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('other_parks')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'other_parks'
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-50 text-sky-900 border border-sky-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Outros Parques</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('shopping')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'shopping'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-50 text-orange-900 border border-orange-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Compras & Outlets</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('dining')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'dining'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Restaurantes</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('airport')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'airport'
                  ? 'bg-teal-600 text-white'
                  : 'bg-teal-50 text-teal-900 border border-teal-200'
              }`}
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Aeroportos</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN MAP CONTAINER + SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEAFLET MAP */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-md">
            <div
              ref={mapContainerRef}
              className="w-full h-[450px] sm:h-[560px] z-0"
            />

            {/* Map Canvas */}
          </div>
        </div>

        {/* SIDEBAR: TIMELINE ROUTE (DAY MODE) OR LOCATIONS LIST (ALL MODE) */}
        <div className="space-y-3">
          {/* 1. SIDEBAR IN DAY MODE: SEQUENCE TIMELINE */}
          {selectedDayId !== 'all' && activeDay ? (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-4 max-h-[560px] overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 block">
                    Etapas do Dia {activeDay.dayNumber}
                  </span>
                  <h3 className="text-sm font-bold text-[#1A2B4C] font-serif">
                    Itinerário Sequencial da Rota
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleOpenEditRoute}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-[#1A2B4C] hover:bg-slate-100 text-xs font-bold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              {/* TIMELINE LIST */}
              {activeDayStops.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-3 my-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1A2B4C]">Nenhuma Parada no Dia {activeDay.dayNumber}</h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Este dia está marcado como "{activeDay.park || activeDay.title || 'Sem Parque'}" e não possui atividades cadastradas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenEditRoute}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2B4C] text-[#D4AF37] text-xs font-bold hover:bg-[#243A66] transition-all cursor-pointer mx-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Paradas</span>
                  </button>
                </div>
              ) : (
                <div className="relative pl-3 space-y-4 before:absolute before:left-[17px] before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                  {activeDayStops.map((stop, index) => {
                    const meta = getCategoryMeta(stop.category);
                    const isSelected = selectedRouteStopIndex === index;
                    const isFirst = index === 0;
                    const isLast = index === activeDayStops.length - 1;

                    return (
                      <div
                        key={stop.id}
                        id={`route-stop-card-${stop.id}`}
                        onClick={() => handleFocusRouteStop(index)}
                        className={`relative pl-7 p-3 rounded-xl border transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'bg-amber-50/80 border-[#D4AF37] ring-2 ring-[#D4AF37] shadow-md'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
                        {/* Sequenced Badge Icon */}
                        <div
                          className={`absolute -left-3.5 top-3 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white shadow-md ${
                            isFirst || isLast ? 'bg-[#1A2B4C]' : meta.bgClass
                          }`}
                        >
                          {index + 1}
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                              <span>{stop.time || '--:--'}</span>
                              <span>•</span>
                              <span>{isFirst ? 'Partida' : isLast ? 'Retorno' : meta.label}</span>
                            </div>
                            <h4 className="text-xs font-bold text-[#1A2B4C] mt-0.5 leading-snug">
                              {stop.name}
                            </h4>
                          </div>

                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stop.name, stop.location].filter(Boolean).join(' '))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded text-slate-400 hover:text-[#1A2B4C] hover:bg-slate-100 shrink-0"
                            title="Abrir no Google Maps"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        {/* Endereço / Localização do ponto (campo location da tabela hourly_schedules) */}
                        {stop.location && (
                          <div className="flex items-start gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 mt-2 shadow-2xs">
                            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span className="break-words line-clamp-2 leading-tight">{stop.location}</span>
                          </div>
                        )}

                        {stop.notes && (
                          <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                            {stop.notes}
                          </p>
                        )}

                        {/* Travel info to next stop */}
                        {!isLast && routeMetrics.legs[index] && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-amber-700 font-semibold">
                            <Car className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>
                              Próxima parada: {routeMetrics.legs[index].distanceKm} km ({routeMetrics.legs[index].timeText})
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* 2. SIDEBAR IN ALL DAYS MODE: GENERAL LOCATIONS LIST */
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1 no-scrollbar">
              <h3 className="text-sm font-bold text-[#1A2B4C] font-serif flex items-center justify-between">
                <span>Pontos Cadastrados ({filteredAllLocations.length})</span>
                <span className="text-xs font-normal text-slate-500">Clique para focar</span>
              </h3>

              <div className="space-y-2.5">
                {filteredAllLocations.map((loc) => {
                  const meta = getCategoryMeta(loc.category);
                  const IconComp = meta.icon;
                  const isSelected = selectedLocation?.id === loc.id;

                  return (
                    <div
                      key={loc.id}
                      id={`loc-card-${loc.id}`}
                      onClick={() => handleSelectGeneralLocation(loc)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-amber-50/80 border-[#D4AF37] shadow-md ring-2 ring-[#D4AF37]'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg text-white shrink-0 ${meta.bgClass}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {meta.label}
                            </span>
                            <h4 className="text-xs font-bold text-[#1A2B4C] leading-snug line-clamp-1">
                              {loc.name}
                            </h4>
                          </div>
                        </div>

                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name + ' ' + loc.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-[#1A2B4C]"
                          title="Abrir no Google Maps"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <p className="text-[11px] text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                        {loc.description}
                      </p>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                        <span className="truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{loc.address}</span>
                        </span>

                        <span className="font-bold text-slate-700 shrink-0 bg-slate-100 px-2 py-0.5 rounded">
                          ⏱ {loc.driveTimeFromHotel || 'Consulte'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: EDIT DAY ROUTE STOPS (Customizing Hotel, Park, Restaurants) */}
      {isEditRouteModalOpen && activeDay && (
        <div
          onClick={handleEditRouteModalBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <Route className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Roteiro do Dia {activeDay.dayNumber} • Pontos de Parada & Trajetos
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Personalizar Rota
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditRouteModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of editable stops */}
            <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3">
              {editingDayStops.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center space-y-2">
                  <p className="text-xs font-bold text-[#1A2B4C]">Nenhuma parada cadastrada para este dia</p>
                  <p className="text-[11px] text-slate-500">
                    Clique no botão abaixo para adicionar a primeira parada (hotel, parque ou restaurante).
                  </p>
                </div>
              ) : (
                editingDayStops.map((stop, idx) => (
                  <div key={stop.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#1A2B4C] text-[#D4AF37] text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-[#1A2B4C]">
                          {idx === 0
                            ? 'Ponto de Partida'
                            : idx === editingDayStops.length - 1
                            ? 'Ponto de Retorno / Encerramento'
                            : `Parada ${idx + 1}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Move Up */}
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newStops = [...editingDayStops];
                              const temp = newStops[idx - 1];
                              newStops[idx - 1] = newStops[idx];
                              newStops[idx] = temp;
                              setEditingDayStops(newStops);
                            }}
                            className="p-1 rounded text-slate-500 hover:bg-slate-200"
                            title="Mover para cima"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Move Down */}
                        {idx < editingDayStops.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newStops = [...editingDayStops];
                              const temp = newStops[idx + 1];
                              newStops[idx + 1] = newStops[idx];
                              newStops[idx] = temp;
                              setEditingDayStops(newStops);
                            }}
                            className="p-1 rounded text-slate-500 hover:bg-slate-200"
                            title="Mover para baixo"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Remove */}
                        {editingDayStops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDayStops(editingDayStops.filter((_, i) => i !== idx));
                            }}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50"
                            title="Remover parada"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-600 block">Nome do Local</label>
                        <input
                          type="text"
                          value={stop.name}
                          onChange={(e) => {
                            const newStops = [...editingDayStops];
                            newStops[idx].name = e.target.value;
                            setEditingDayStops(newStops);
                          }}
                          className="w-full p-2 text-xs rounded-lg border border-slate-300 font-semibold bg-white"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block">Horário</label>
                        <input
                          type="text"
                          value={stop.time || ''}
                          onChange={(e) => {
                            const newStops = [...editingDayStops];
                            newStops[idx].time = e.target.value;
                            setEditingDayStops(newStops);
                          }}
                          placeholder="08:00"
                          className="w-full p-2 text-xs rounded-lg border border-slate-300 font-semibold bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block">Localização / Endereço</label>
                        <input
                          type="text"
                          value={stop.location || ''}
                          onChange={(e) => {
                            const newStops = [...editingDayStops];
                            newStops[idx].location = e.target.value;
                            setEditingDayStops(newStops);
                          }}
                          placeholder="Ex: Rua Miller, 448, Brás..."
                          className="w-full p-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block">Notas da Parada</label>
                        <input
                          type="text"
                          value={stop.notes || ''}
                          onChange={(e) => {
                            const newStops = [...editingDayStops];
                            newStops[idx].notes = e.target.value;
                            setEditingDayStops(newStops);
                          }}
                          placeholder="Ex: Almoço no Columbia Harbour House..."
                          className="w-full p-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Stop & Action Buttons Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const newStop: CustomRouteStop = {
                      id: `custom-stop-${Date.now()}`,
                      name: 'Nova Parada (Restaurante ou Loja)',
                      category: 'dining',
                      lat: 28.3705,
                      lng: -81.5178,
                      time: '15:00',
                      notes: 'Parada na rota.',
                      order: editingDayStops.length + 1,
                    };
                    const newStops = [...editingDayStops];
                    if (newStops.length > 1) {
                      newStops.splice(newStops.length - 1, 0, newStop);
                    } else {
                      newStops.push(newStop);
                    }
                    setEditingDayStops(newStops);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Parada</span>
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsEditRouteModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomRoute}
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Salvar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD CUSTOM GENERAL LOCATION */}
      {isAddModalOpen && (
        <div
          onClick={handleAddModalBackdrop}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden h-[90vh] max-h-[92vh] flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                    Novo Ponto de Interesse • Locais & Endereços em Orlando
                  </span>
                  <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                    Adicionar Novo Ponto ao Mapa
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomPoint} className="flex flex-col flex-1 min-h-0 overflow-hidden text-slate-700">
              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0 custom-scrollbar text-xs">
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    1. Identificação do Local
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nome do Local *</label>
                        <input
                          type="text"
                          value={customPoint.name}
                          onChange={(e) => setCustomPoint({ ...customPoint, name: e.target.value })}
                          placeholder="Ex: Restaurante Olive Garden, Walmart Supercenter"
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Categoria *</label>
                        <select
                          value={customPoint.category}
                          onChange={(e) => setCustomPoint({ ...customPoint, category: e.target.value as any })}
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-xs"
                        >
                          <option value="hotel">Hospedagem & Acomodações</option>
                          <option value="disney">Parques Disney</option>
                          <option value="universal">Parques Universal</option>
                          <option value="other_parks">Outros Parques (SeaWorld/Busch)</option>
                          <option value="shopping">Compras & Outlets</option>
                          <option value="airport">Aeroportos</option>
                          <option value="dining">Restaurantes & Gastronomia</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    2. Localização & Coordenadas
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Endereço / Referência</label>
                      <input
                        type="text"
                        value={customPoint.address}
                        onChange={(e) => setCustomPoint({ ...customPoint, address: e.target.value })}
                        placeholder="Ex: International Drive, Orlando, FL"
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={customPoint.lat}
                          onChange={(e) => setCustomPoint({ ...customPoint, lat: parseFloat(e.target.value) || 28.3772 })}
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={customPoint.lng}
                          onChange={(e) => setCustomPoint({ ...customPoint, lng: parseFloat(e.target.value) || -81.545 })}
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    3. Observações Adicionais
                  </label>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <textarea
                      value={customPoint.description}
                      onChange={(e) => setCustomPoint({ ...customPoint, description: e.target.value })}
                      rows={3}
                      placeholder="Ex: Jantar de aniversário, compras de lembrancinhas, melhor horário para visita..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#1A2B4C] text-white text-xs font-bold hover:bg-[#2A437E] transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
