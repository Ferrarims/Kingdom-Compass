import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  Sun,
  Users,
  Sparkles,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRight,
  Info,
  Calendar,
  AlertTriangle,
  Search,
  Utensils,
  MapPin,
  Compass,
  Waves,
  Rocket,
  Moon,
  ChevronDown,
  ChevronUp,
  Flame,
  Layers,
  Tag,
  BookOpen,
  Camera,
  CloudRain,
  CloudSun,
  CloudLightning,
  Droplets,
  Umbrella,
  Thermometer
} from 'lucide-react';
import { ORLANDO_MONTHS_GUIDE, PARKS_GUIDE_DATA } from '../data/initialData';
import { usePlanner } from '../context/PlannerContext';
import { CrowdLevel, MonthInfo, ParkInfo } from '../types';
import { isAttractionMatch, normalizeAttractionName } from '../utils/attractionUtils';
import {
  getAttractionImage,
  getRestaurantImage,
  getParkCoverImage
} from '../data/attractionImages';
import { AttractionPhotoModal, PhotoModalItem } from './AttractionPhotoModal';
import { AttractionComparisonModal } from './AttractionComparisonModal';

// Fallback descriptions dictionary for attractions & restaurants that might not have inline parentheses
const ATTRACTION_DESCRIPTIONS: Record<string, string> = {
  'TRON Lightcycle / Run': 'Montanha-russa futurista em alta velocidade na qual você anda montado em uma motocicleta de luz cibernética.',
  'Seven Dwarfs Mine Train': 'Montanha-russa familiar pelos cenários iluminados da mina dos Sete Anões com vagões balançantes.',
  'Space Mountain': 'Lendária montanha-russa totalmente no escuro através do espaço sideral com trilha sonora temática.',
  'Big Thunder Mountain Railroad': 'A corrida de trem desgovernado mais divertida do Velho Oeste pelas minas de ouro.',
  'Haunted Mansion': 'Passeio temático clássico por uma mansão mal-assombrada com 999 fantasmas bem-humorados.',
  'Pirates of the Caribbean': 'Passeio de barco imersivo por cenários piratas com o Capitão Jack Sparrow e batalhas navais.',
  'Peter Pan\'s Flight': 'Voe em um navio pirata sobre os telhados iluminados de Londres rumo à Terra do Nunca.',
  'Star Wars: Rise of the Resistance': 'A experiência de imersão mais avançada do planeta: seja capturado pela Primeira Ordem e lute pela Resistência.',
  'Millennium Falcon: Smugglers Run': 'Pilote a lendária nave espacial de Han Solo em uma missão intergaláctica interativa.',
  'The Twilight Zone Tower of Terror': 'Queda livre eletrizante dentro de um elevador assombrado no Hollywood Tower Hotel.',
  'Slinky Dog Dash': 'Montanha-russa familiar super divertida e colorida montada pelo Andy na Toy Story Land.',
  'Mickey & Minnie\'s Runaway Railway': 'Passeio por um desenho animado sem óculos 3D com efeitos visuais e sonoros surpreendentes.',
  'Rock \'n\' Roller Coaster starring Aerosmith': 'Lançamento de 0 a 90 km/h em 2,8 segundos ao som de clássicos do rock do Aerosmith.',
  'Na\'vi River Journey': 'Passeio de barco relaxante por uma floresta bioluminescente repleta de fauna e flora alienígena de Pandora.',
  'Expedition Everest - Legend of the Forbidden Mountain': 'Montanha-russa veloz nas montanhas do Himalaia com trecho em marcha à ré fugindo do Yeti.',
  'Kilimanjaro Safaris': 'Safári autêntico em caminhão aberto por uma reserva com leões, girafas, elefantes e rinocerontes livres.',
  'Festival of the Lion King': 'Show musical estilo Broadway vibrante com acrobatas, dançarinos e músicas de O Rei Leão.',
  'Dinosaur': 'Viagem no tempo em um veículo militar para resgatar um iguanodonte antes da queda do meteoro.',
  'Revenge of the Mummy': 'Montanha-russa indoor no escuro com fogo real, múmias animatrônicas e efeitos especiais.',
  'TRANSFORMERS: The Ride-3D': 'Batalha 3D intensa de alta tecnologia ao lado de Optimus Prime e Bumblebee.',
  'Men in Black Alien Attack': 'Jogo de tiro interativo em laser para acertar extraterrestres invasores nas ruas de Nova York.',
  'Despicable Me Minion Mayhem': 'Simulador 3D super divertido para se transformar em um Minion no laboratório do Gru.',
  'Illumination’s Villain-Con Minion Blast': 'Atração interativa em esteira onde você usa um blaster para competir como vilão.',
  'The Incredible Hulk Coaster': 'Lançamento veloz com inversões intensas ao som de uma trilha sonora eletrizante.',
  'The Amazing Adventures of Spider-Man': 'Simulador 3D aclamado com encontros épicos com os vilões do Homem-Aranha.',
  'Jurassic Park River Adventure': 'Passeio de barco entre dinossauros animatrônicos terminando em uma queda d\'água de 25 metros.',
  'Dudley Do-Right\'s Ripsaw Falls': 'Toboágua com troncos divertidos e quedas aquáticas que molham bastante.',
  'Hogwarts Express (Trem inter-parques)': 'Embarque na plataforma 9 ¾ e viaje entre Londres e Hogsmeade com projeções mágicas nas janelas.',
  'Spaceship Earth (Dentro da icônica esfera)': 'Viagem relaxante pelo tempo contando a história da comunicação humana desde a pré-história.',
  'Soarin\' Around the World': 'Simulador de voo de asa-delta panorâmico sobre as maiores maravilhas naturais e arquitetônicas da Terra.',
  'Test Track': 'Projete seu próprio carro e teste aceleração a mais de 100 km/h em uma pista de testes veloz.',
};

const RESTAURANT_DESCRIPTIONS: Record<string, string> = {
  'Be Our Guest Restaurant (Jantar temático dentro do castelo da Fera)': 'Refeição refinada no salão de baile da Fera com culinária francesa e presença do Rei Fera.',
  'Cinderella\'s Royal Table (Refeição real com princesas)': 'Jantar exclusivo no coração do Castelo da Cinderela com saudação de princesas Disney.',
  'Columbia Harbour House (Frutos do mar e opções saudáveis)': 'Pratos rápidos de camarão empanado, peixe, saladas e tortas tradicionais no segundo andar tranquilo.',
  'Sleepy Hollow (Waffles deliciosos de frutas vermelhas)': 'Waffles fresquinhos recheados com Nutella, morangos e bananas perto do castelo.',
  'Space 220 (Restaurante simulando uma estação espacial a 220 milhas da Terra)': 'Suba em um elevador espacial e jante observando astronautas e a Terra através das janelas digitais.',
  'San Angel Inn Restaurante (Dentro da pirâmide maia do México com ambiente noturno)': 'Culinária mexicana autêntica em ambiente romântico ao lado do rio do barco do Zé Carioca.',
  'Via Napoli (Pizzas autênticas italianas no forno a lenha)': 'Pizzas napolitanas assadas em fornos a lenha gigantes com ingredientes importados da Itália.',
  'La Crêperie de Paris (Crêpes doces e salgados)': 'Galettes de trigo sarraceno e crêpes doces franceses preparados por chefs de Paris.',
  'Sci-Fi Dine-In Theater (Mesas em formato de carros antigos dos anos 50 assistindo clipes retrô)': 'Jante em um drive-in noturno dos anos 50 dentro de um conversível assistindo trailers retrô de ficção científica.',
  '50\'s Prime Time Café (Ambiente familiar dos anos 50 onde os garçons mandam tirar os cotovelos da mesa)': 'Comida caseira americana onde os garçons atuam como tios e mães cobrando boas maneiras.',
  'Woody\'s Lunch Box (Totchos e sanduíches gourmet rápidos)': 'Lanches saborosos de batata, queijo quente derretido e tortinhas na Toy Story Land.',
  'Oga\'s Cantina (Bar temático imersivo de Star Wars com coquetéis exóticos)': 'Bar galáctico com robô DJ R-3X tocando música eletrônica e coquetéis coloridos que borbulham.',
  'Satu\'li Canteen (Bowls saudáveis e customizáveis em Pandora - favorito dos fãs)': 'Bowls de carne, frango ou tofu com molhos exóticos e pãezinhos de boba em Pandora.',
  'Yak & Yeti Restaurant (Culinária pan-asiática espetacular aos pés do Everest)': 'Frango agridoce, dim sum e pratos asiáticos saborosos em um casarão de colecionador no Nepal.',
  'Tusker House Restaurant (Buffet africano com personagens em trajes de safári)': 'Buffet com opções ocidentais e africanas com fotos ao lado do Mickey, Donald e Pateta de safári.',
  'Flame Tree Barbecue (Costelinhas e frango defumado com vista para o lago)': 'Churrasco defumado com molho barbecue e mesas cobertas à beira do lago com vista para o Everest.',
  'Leaky Cauldron (Pratos britânicos tradicionais no coração do Beco Diagonal)': 'Fish and chips, torta de carne e Cerveja Amorosa dentro do Caldeirão Furado.',
  'Finnegan\'s Bar and Grill (Pub irlandês tradicional com música ao vivo)': 'Pub acolhedor com cervejas irlandesas, batatas recheadas e música ao vivo.',
  'Today Cafe (Lanches frescos, saladas e sobremesas nobres)': 'Sanduíches gourmet, cafés especiais e doces refinados na entrada da Universal Studios.',
  'Florean Fortescue\'s Ice-Cream Parlour (Sorvete artesanal de Butterbeer)': 'Sorvetes artesanais com sabores únicos como Cerveja de Manteiga, Maçã Verde e Chá de Earl Grey.',
  'Mythos Restaurant (Ambiente esculpido em cavernas com culinária mediterrânea premiada)': 'Restaurante premiado mundialmente esculpido em rochas vulcânicas com frutos do mar e carnes.',
  'Three Broomsticks (Deliciosos banquetes em Hogsmeade)': 'Costelas, milho cozido e banquetes familiares no Três Vassouras em Hogsmeade.',
  'Confisco Grille (Culinária internacional na entrada do parque)': 'Pratos que misturam temperos da Ásia, América Latina e Mediterrâneo.',
  'Captain America Diner (Hambúrgueres clássicos em Marvel Super Hero Island)': 'Hambúrgueres rápidos com vista para o lago em um ambiente quadrinista dos Vingadores.',
};

export const MonthsGuide: React.FC = () => {
  const { settings, activeTripId, attractionSelections, toggleAttractionSelection } = usePlanner();

  // Top Tab selection: 'months' or 'parks'
  const [activeTab, setActiveTab] = useState<'months' | 'parks'>('months');

  // Month Guide Filters
  const [crowdFilter, setCrowdFilter] = useState<string>('all');
  const [rainFilter, setRainFilter] = useState<string>('all');
  const [activeSpotlightMonth, setActiveSpotlightMonth] = useState<number | null>(null);

  // Parks Guide Filters
  const [selectedResort, setSelectedResort] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedParkIds, setExpandedParkIds] = useState<Record<string, boolean>>({});

  // Photo Lightbox Modal State
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);
  const [selectedPhotoItem, setSelectedPhotoItem] = useState<PhotoModalItem | null>(null);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);

  const openPhotoModal = (item: PhotoModalItem) => {
    setSelectedPhotoItem(item);
    setIsPhotoModalOpen(true);
  };

  const toggleParkExpanded = (parkId: string) => {
    setExpandedParkIds((prev) => {
      const isCurrentlyExpanded = prev[parkId] ?? true;
      return {
        ...prev,
        [parkId]: !isCurrentlyExpanded,
      };
    });
  };

  const expandAllParks = () => {
    const allExpanded: Record<string, boolean> = {};
    PARKS_GUIDE_DATA.forEach((p) => {
      allExpanded[p.id] = true;
    });
    setExpandedParkIds(allExpanded);
  };

  const collapseAllParks = () => {
    const allCollapsed: Record<string, boolean> = {};
    PARKS_GUIDE_DATA.forEach((p) => {
      allCollapsed[p.id] = false;
    });
    setExpandedParkIds(allCollapsed);
  };

  // Comprehensive analysis of the months covered by the user's trip
  const tripMonthsAnalysis = useMemo(() => {
    const monthCounts: Record<number, number> = {};
    if (!settings.startDate) {
      return {
        monthCounts: { 12: 11 },
        majorityMonthIndex: 12,
        startMonthIndex: 12,
        spannedMonths: [12],
        totalDays: 11,
      };
    }

    const parts = settings.startDate.split('-');
    const startYear = parseInt(parts[0], 10) || 2026;
    const startMonth = parseInt(parts[1], 10) || 12;
    const startDay = parseInt(parts[2], 10) || 30;

    const totalDays = Math.max(1, settings.durationDays || 1);

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startYear, startMonth - 1, startDay + i);
      const mIdx = d.getMonth() + 1;
      monthCounts[mIdx] = (monthCounts[mIdx] || 0) + 1;
    }

    let majorityMonthIndex = startMonth;
    let maxDays = 0;

    Object.entries(monthCounts).forEach(([mIdxStr, count]) => {
      const mIdx = parseInt(mIdxStr, 10);
      if (count > maxDays) {
        maxDays = count;
        majorityMonthIndex = mIdx;
      }
    });

    const spannedMonths = Object.keys(monthCounts).map((k) => parseInt(k, 10));

    return {
      monthCounts,
      majorityMonthIndex,
      startMonthIndex: startMonth,
      spannedMonths,
      totalDays,
    };
  }, [settings.startDate, settings.durationDays]);

  // Default active spotlight to majority month unless user selected another
  const currentSpotlightMonthIdx = activeSpotlightMonth ?? tripMonthsAnalysis.majorityMonthIndex;
  const userTripMonth = ORLANDO_MONTHS_GUIDE.find((m) => m.monthIndex === currentSpotlightMonthIdx);
  const majorityMonthInfo = ORLANDO_MONTHS_GUIDE.find((m) => m.monthIndex === tripMonthsAnalysis.majorityMonthIndex);
  const startMonthInfo = ORLANDO_MONTHS_GUIDE.find((m) => m.monthIndex === tripMonthsAnalysis.startMonthIndex);

  const filteredMonths = ORLANDO_MONTHS_GUIDE.filter((m) => {
    const matchCrowd = crowdFilter === 'all' || m.crowdLevel === crowdFilter;
    const matchRain =
      rainFilter === 'all' ||
      (rainFilter === 'Seco' && m.rainLevel === 'Seco') ||
      (rainFilter === 'Moderado' && m.rainLevel === 'Moderado') ||
      (rainFilter === 'Chuvoso' && (m.rainLevel === 'Chuvoso' || m.rainLevel === 'Muito Chuvoso'));
    return matchCrowd && matchRain;
  });

  const getCrowdBadge = (level: CrowdLevel) => {
    switch (level) {
      case 'Baixa':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Média':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Alta':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Altíssima':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getRainBadge = (level?: string) => {
    switch (level) {
      case 'Seco':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'Moderado':
        return 'bg-sky-100 text-sky-900 border-sky-300';
      case 'Chuvoso':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'Muito Chuvoso':
        return 'bg-indigo-100 text-indigo-950 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getRainIcon = (level?: string) => {
    switch (level) {
      case 'Seco':
        return <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'Moderado':
        return <CloudSun className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
      case 'Chuvoso':
        return <CloudRain className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'Muito Chuvoso':
        return <CloudLightning className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
      default:
        return <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    }
  };

  // Filtered parks for the directory
  const filteredParks = useMemo(() => {
    return PARKS_GUIDE_DATA.filter((p) => {
      const matchResort =
        selectedResort === 'all' ||
        p.resort === selectedResort ||
        (selectedResort === 'Outros Parques & Experiências' &&
          (p.resort === 'Outros Parques & Experiências' || p.resort === 'Outros'));

      const matchType = selectedType === 'all' || p.parkType === selectedType;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.mustDoAttractions.some((a) => a.toLowerCase().includes(q)) ||
        p.bestDining.some((d) => d.toLowerCase().includes(q)) ||
        p.proTips.some((t) => t.toLowerCase().includes(q));

      return matchResort && matchType && matchSearch;
    });
  }, [selectedResort, selectedType, searchQuery]);

  // Helper function to format attraction/dining items into title + description
  const parseItem = (itemStr: string, defaultDescMap: Record<string, string>) => {
    const match = itemStr.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return {
        title: match[1].trim(),
        description: match[2].trim(),
      };
    }
    const cleanTitle = itemStr.trim();
    return {
      title: cleanTitle,
      description: defaultDescMap[cleanTitle] || 'Atração imperdível recomendada para incluir no seu roteiro diário em Orlando.',
    };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">


      {/* SUB-TAB 1: MONTHS & SEASONALITY GUIDE */}
      {activeTab === 'months' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Main Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#2A437E] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37] mb-1">
                  <CalendarDays className="w-4 h-4" />
                  <span>Planejamento Estratégico de Épocas</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
                  Guia Completo dos Meses & Lotação em Orlando
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
                  Compare clima, regime de chuvas, temperaturas médias, índice de lotação dos parques e eventos anuais de Orlando.
                </p>
              </div>
            </div>

            {/* Quick KPI Strip inside Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Duração da Viagem
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#D4AF37] block mt-1">
                  {tripMonthsAnalysis.totalDays} Dias
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Mês Principal
                </span>
                <span className="text-xs sm:text-sm font-bold text-white block mt-1.5 truncate">
                  {majorityMonthInfo?.month || 'Dezembro'}
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Lotação Média
                </span>
                <span className="text-xs sm:text-sm font-bold text-emerald-300 block mt-1.5">
                  {majorityMonthInfo?.crowdLevel || 'Média'}
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Temperatura Média
                </span>
                <span className="text-xs sm:text-sm font-bold text-white block mt-1.5">
                  {majorityMonthInfo?.tempCelsius || '22°C'}
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Clima & Chuva
                </span>
                <span className="text-xs sm:text-sm font-bold text-sky-200 block mt-1.5 truncate">
                  {majorityMonthInfo?.rainLevel || 'Seco'} • {majorityMonthInfo?.rainfallMm || '~60mm'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Header Tabs */}
          <div className="flex items-center justify-between pb-1 gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2">
              <button
                id="tab-months-guide"
                onClick={() => setActiveTab('months')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                  activeTab === 'months'
                    ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Guia dos Meses & Épocas</span>
              </button>

              <button
                id="tab-parks-guide"
                onClick={() => setActiveTab('parks')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                  activeTab === 'parks'
                    ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span>Parques, Brinquedos & Restaurantes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#1A2B4C] font-extrabold ml-1">
                  17 Parques
                </span>
              </button>
            </div>
          </div>

          {/* User's Trip Month Spotlight Banner */}
          {userTripMonth && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs border-l-4 border-l-[#D4AF37] space-y-4">
              {/* Spanned months bar if trip spans multiple months */}
              {tripMonthsAnalysis.spannedMonths.length > 1 && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#1A2B4C] text-[#D4AF37] font-bold text-[10px] uppercase tracking-wider">
                      Viagem Multimeses
                    </span>
                    <span className="text-slate-700">
                      Sua viagem de <strong>{tripMonthsAnalysis.totalDays} dias</strong> inicia em{' '}
                      <strong>{startMonthInfo?.month}</strong> ({tripMonthsAnalysis.monthCounts[tripMonthsAnalysis.startMonthIndex]} dias) e tem a{' '}
                      <strong className="text-[#1A2B4C]">maior parte em {majorityMonthInfo?.month}</strong> ({tripMonthsAnalysis.monthCounts[tripMonthsAnalysis.majorityMonthIndex]} dias).
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-500 text-[11px] font-medium">Ver detalhes:</span>
                    {tripMonthsAnalysis.spannedMonths.map((mIdx) => {
                      const mInfo = ORLANDO_MONTHS_GUIDE.find((x) => x.monthIndex === mIdx);
                      const isSelected = currentSpotlightMonthIdx === mIdx;
                      const isMaj = mIdx === tripMonthsAnalysis.majorityMonthIndex;
                      return (
                        <button
                          key={mIdx}
                          onClick={() => setActiveSpotlightMonth(mIdx)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A2B4C] text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {mInfo?.month} {isMaj ? '⭐️ (Principal)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-xs bg-[#1A2B4C] text-[#D4AF37] font-bold text-[11px] uppercase tracking-wider">
                      {userTripMonth.monthIndex === tripMonthsAnalysis.majorityMonthIndex
                        ? 'Mês Principal da Sua Viagem'
                        : 'Mês de Início da Viagem'}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getCrowdBadge(userTripMonth.crowdLevel)}`}>
                      Lotação {userTripMonth.crowdLevel}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${getRainBadge(userTripMonth.rainLevel)}`}>
                      {getRainIcon(userTripMonth.rainLevel)}
                      Chuva {userTripMonth.rainLevel}
                    </span>
                    {tripMonthsAnalysis.monthCounts[userTripMonth.monthIndex] && (
                      <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2.5 py-0.5 rounded-full">
                        {tripMonthsAnalysis.monthCounts[userTripMonth.monthIndex]} {tripMonthsAnalysis.monthCounts[userTripMonth.monthIndex] === 1 ? 'dia' : 'dias'} da viagem
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-[#1A2B4C] font-serif">
                      {userTripMonth.month} em Orlando: {userTripMonth.highlight}
                    </h2>
                    <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                      {userTripMonth.tips}
                    </p>
                  </div>

                  {/* Previsão Climática e Chuvas */}
                  <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-[#1A2B4C]">
                      {getRainIcon(userTripMonth.rainLevel)}
                      <span>Clima: {userTripMonth.climateType}</span>
                    </div>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      <strong>Chuva & Tempo:</strong> {userTripMonth.rainDescription}
                    </p>
                    {userTripMonth.weatherTip && (
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-900 pt-1 border-t border-sky-100 font-medium">
                        <Umbrella className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>Mala & Parques:</strong> {userTripMonth.weatherTip}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="text-xs font-semibold text-slate-600">Eventos no período:</span>
                    {userTripMonth.events.map((ev, i) => (
                      <span key={i} className="text-xs bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-[#1A2B4C] font-medium">
                        ✨ {ev}
                      </span>
                    ))}
                  </div>
                </div>

                {/* KPI Boxes ao Lado */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 shrink-0 lg:w-48">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center justify-center gap-1">
                      <Thermometer className="w-3 h-3 text-amber-500" />
                      Temperatura Média
                    </span>
                    <p className="text-xl font-bold text-[#1A2B4C] font-serif">
                      {userTripMonth.tempCelsius}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      ({userTripMonth.tempFahrenheit})
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center justify-center gap-1">
                      <Droplets className="w-3 h-3 text-sky-500" />
                      Regime de Chuvas
                    </span>
                    <p className="text-base font-bold text-[#1A2B4C] font-serif">
                      {userTripMonth.rainfallMm}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {userTripMonth.rainyDays}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* 12 Months Comparison Table */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#1A2B4C] font-serif">
                Tabela Comparativa dos 12 Meses do Ano
              </h3>

              <div className="flex flex-wrap items-center gap-3">
                {/* Filtro Lotação */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                  <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Lotação:
                  </span>
                  {['all', 'Baixa', 'Média', 'Alta', 'Altíssima'].map((lvl) => (
                    <button
                      key={lvl}
                      id={`filter-crowd-${lvl.toLowerCase()}`}
                      onClick={() => setCrowdFilter(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        crowdFilter === lvl
                          ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {lvl === 'all' ? 'Todas' : lvl}
                    </button>
                  ))}
                </div>

                {/* Filtro Chuva */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                  <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-sky-500" /> Chuva:
                  </span>
                  {[
                    { id: 'all', label: 'Todas' },
                    { id: 'Seco', label: '☀️ Seco' },
                    { id: 'Moderado', label: '⛅ Moderado' },
                    { id: 'Chuvoso', label: '🌧️ Chuvoso' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      id={`filter-rain-${r.id.toLowerCase()}`}
                      onClick={() => setRainFilter(r.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        rainFilter === r.id
                          ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMonths.map((m) => {
                const daysInMonth = tripMonthsAnalysis.monthCounts[m.monthIndex] || 0;
                const isTripMonth = daysInMonth > 0;
                const isMajority = m.monthIndex === tripMonthsAnalysis.majorityMonthIndex;
                const isStart = m.monthIndex === tripMonthsAnalysis.startMonthIndex && !isMajority;

                let cardBorderStyle = 'border-slate-200 hover:border-[#D4AF37] shadow-2xs';
                if (isMajority) {
                  cardBorderStyle = 'border-2 border-[#D4AF37] shadow-md ring-2 ring-[#D4AF37]/20 bg-amber-50/10';
                } else if (isStart) {
                  cardBorderStyle = 'border-2 border-[#1A2B4C] shadow-sm bg-blue-50/10';
                } else if (isTripMonth) {
                  cardBorderStyle = 'border-2 border-emerald-400 shadow-sm bg-emerald-50/10';
                }

                return (
                  <div
                    key={m.month}
                    className={`bg-white rounded-xl p-5 border transition-all space-y-3 relative ${cardBorderStyle}`}
                  >
                    {isMajority && (
                      <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#1A2B4C] font-bold text-[10px] uppercase tracking-wider shadow-xs flex items-center gap-1">
                        <span>SUA ESCOLHA</span>
                        {tripMonthsAnalysis.spannedMonths.length > 1 && (
                          <span className="opacity-90">• Mês Principal ({daysInMonth} {daysInMonth === 1 ? 'dia' : 'dias'})</span>
                        )}
                      </span>
                    )}

                    {isStart && (
                      <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-[#1A2B4C] text-[#D4AF37] font-bold text-[10px] uppercase tracking-wider shadow-xs">
                        SUA VIAGEM • Início ({daysInMonth} {daysInMonth === 1 ? 'dia' : 'dias'})
                      </span>
                    )}

                    {isTripMonth && !isMajority && !isStart && (
                      <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-xs">
                        SUA VIAGEM • ({daysInMonth} {daysInMonth === 1 ? 'dia' : 'dias'})
                      </span>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <h4 className="text-base font-bold text-[#1A2B4C] font-serif">
                        {m.month}
                      </h4>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getCrowdBadge(m.crowdLevel)}`}>
                        {m.crowdLevel} ({m.crowdScore}/10)
                      </span>
                    </div>

                    {isTripMonth && (
                      <div className="text-[11px] font-semibold text-[#1A2B4C] bg-amber-100/70 px-2.5 py-1 rounded-md border border-amber-200/80 flex items-center justify-between">
                        <span>📅 {daysInMonth} de {tripMonthsAnalysis.totalDays} dias da viagem</span>
                        {isMajority ? (
                          <span className="text-[10px] font-bold text-[#D4AF37] uppercase bg-[#1A2B4C] px-1.5 py-0.2 rounded">Maior Parte</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-600 uppercase">Início</span>
                        )}
                      </div>
                    )}

                    {/* Clima Geral */}
                    {m.climateType && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80">
                        {getRainIcon(m.rainLevel)}
                        <span className="font-semibold text-slate-800">{m.climateType}</span>
                      </div>
                    )}

                    {/* Comparativo de Temperatura e Regime de Chuvas */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Temperatura */}
                      <div className="flex flex-col justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                          <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                          Temperatura
                        </span>
                        <div className="mt-1">
                          <span className="font-bold text-[#1A2B4C] text-xs block leading-tight">{m.tempCelsius}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{m.tempFahrenheit}</span>
                        </div>
                      </div>

                      {/* Regime de Chuvas */}
                      <div className="flex flex-col justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5 text-sky-500" />
                            Chuva
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${getRainBadge(m.rainLevel)}`}>
                            {m.rainLevel || 'Seco'}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="font-bold text-[#1A2B4C] text-xs block leading-tight">{m.rainfallMm || 'Médio'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{m.rainyDays || 'Poucos dias'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Descrição de Como é o Clima e Chuva no Mês */}
                    {m.rainDescription && (
                      <div className="p-2.5 rounded-lg bg-sky-50/50 border border-sky-100 text-[11px] text-slate-700 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <CloudRain className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                          <p className="leading-snug">
                            <strong className="text-slate-800">Como é o tempo:</strong> {m.rainDescription}
                          </p>
                        </div>
                        {m.weatherTip && (
                          <div className="flex items-start gap-1.5 text-slate-600 pt-1 border-t border-sky-100">
                            <Umbrella className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] leading-snug">
                              <span className="font-semibold text-slate-700">Dica:</span> {m.weatherTip}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">{m.highlight}.</strong> {m.tips}
                    </p>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Eventos & Destaques
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {m.events.map((ev, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: COMPLETE PARKS, ATTRACTIONS & DINING DIRECTORY */}
      {activeTab === 'parks' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A2B4C] via-[#243B68] to-[#1E3A8A] text-white shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-[#D4AF37] mb-1">
                  <BookOpen className="w-4 h-4" />
                  <span>Guia de Consulta Rápida</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
                  Parques, Brinquedos, Atrações & Restaurantes da Região
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-3xl">
                  Consulte a lista completa de todos os 17 parques de Orlando e região com a descrição detalhada de cada brinquedo, atração imperdível, restaurante recomendado e dicas de especialista.
                </p>
              </div>


            </div>

            {/* Quick KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-white relative z-10">
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Total de Parques
                </span>
                <span className="text-lg sm:text-xl font-black font-mono text-[#D4AF37] block mt-0.5">
                  17 Parques
                </span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Walt Disney World
                </span>
                <span className="text-xs sm:text-sm font-bold text-white block mt-1">
                  6 Parques (4 Temát. + 2 Aquát.)
                </span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  Universal Orlando
                </span>
                <span className="text-xs sm:text-sm font-bold text-white block mt-1">
                  4 Parques (Epic, Studios, Islands, Volcano)
                </span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                  SeaWorld & Outros
                </span>
                <span className="text-xs sm:text-sm font-bold text-emerald-300 block mt-1">
                  7 Parques (Busch, NASA, Aquatica, etc)
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Header Tabs */}
          <div className="flex items-center justify-between pb-1 gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2">
              <button
                id="tab-months-guide"
                onClick={() => setActiveTab('months')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                  activeTab === 'months'
                    ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Guia dos Meses & Épocas</span>
              </button>

              <button
                id="tab-parks-guide"
                onClick={() => setActiveTab('parks')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                  activeTab === 'parks'
                    ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span>Parques, Brinquedos & Restaurantes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#1A2B4C] font-extrabold ml-1">
                  17 Parques
                </span>
              </button>
            </div>
          </div>

          {/* Filters & Search Bar */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Instant Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por brinquedo (ex: TRON, VelociCoaster), restaurante ou parque..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C] focus:border-transparent transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Park Type Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar shrink-0">
                <span className="text-xs font-bold text-slate-400 mr-1">Tipo:</span>
                {[
                  { id: 'all', label: 'Todos os Tipos' },
                  { id: 'Temático', label: 'Temático' },
                  { id: 'Aquático', label: 'Aquático' },
                  { id: 'Experiência Imersiva', label: 'Imersivo' },
                  { id: 'Ciência & Espaço', label: 'NASA' },
                ].map((typeItem) => (
                  <button
                    key={typeItem.id}
                    onClick={() => setSelectedType(typeItem.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedType === typeItem.id
                        ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {typeItem.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resort Tabs Filter */}
            <div className="border-t border-slate-100 pt-3 space-y-3">


              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 w-full">
                {[
                  { id: 'all', label: 'Todos os Complexos (17)' },
                  { id: 'Walt Disney World', label: '🏰 Walt Disney World (6)' },
                  { id: 'Universal Orlando Resort', label: '⚡ Universal Orlando (4)' },
                  { id: 'SeaWorld Parks & Entertainment', label: '🐬 SeaWorld & Busch (4)' },
                  { id: 'Outros Parques & Experiências', label: '🚀 NASA & Outros (3)' },
                ].map((resortItem) => (
                  <button
                    key={resortItem.id}
                    onClick={() => setSelectedResort(resortItem.id)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-center flex items-center justify-center w-full ${
                      selectedResort === resortItem.id
                        ? 'bg-[#1A2B4C] text-[#D4AF37] shadow-xs ring-2 ring-[#D4AF37]/30'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {resortItem.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <button
                  onClick={() => setIsComparisonModalOpen(true)}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-[#D4AF37] to-[#C59B27] hover:from-[#C59B27] hover:to-[#B38920] text-slate-900 font-black rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-amber-300/60 whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5 text-slate-900" />
                  <span>📊 Comparar Desejos do Grupo</span>
                </button>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={expandAllParks}
                    className="font-bold text-[#1A2B4C] hover:underline cursor-pointer transition-colors"
                  >
                    Expandir Todos
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={collapseAllParks}
                    className="font-bold text-slate-500 hover:underline cursor-pointer transition-colors"
                  >
                    Recolher Todos
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Parks Accordion/Card Directory */}
          <div className="space-y-5">
            {filteredParks.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-3">
                <Search className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-base font-bold text-[#1A2B4C]">Nenhum parque ou atração encontrado</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tente alterar os termos da busca ou ajustar os filtros de complexo e tipo acima.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedResort('all');
                    setSelectedType('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#1A2B4C] text-[#D4AF37] text-xs font-bold hover:bg-[#243B68] transition-all cursor-pointer mt-2"
                >
                  Restaurar Todos os Filtros
                </button>
              </div>
            ) : (
              filteredParks.map((park) => {
                const isExpanded = expandedParkIds[park.id] ?? true; // expanded by default for easy reading
                const parkCoverUrl = getParkCoverImage(park.name);

                return (
                  <div
                    key={park.id}
                    id={`park-card-${park.id}`}
                    className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300"
                  >
                    {/* Park Card Header Bar */}
                    <div
                      onClick={() => toggleParkExpanded(park.id)}
                      className="p-5 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-100 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none"
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className="w-12 h-12 rounded-2xl bg-[#1A2B4C] text-[#D4AF37] flex items-center justify-center shrink-0 shadow-xs border border-[#D4AF37]/30 text-2xl"
                        >
                          {park.icon || '🎡'}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[#1A2B4C] text-[#D4AF37] uppercase tracking-wider">
                              {park.resort}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              {park.parkType}
                            </span>
                          </div>
                          <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A2B4C]">
                            {park.name}
                          </h2>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-left sm:text-right text-xs">
                          <span className="font-bold text-[#1A2B4C] block">
                            {park.mustDoAttractions.length} Atrações Principais
                          </span>
                          <span className="text-slate-500 text-[11px] block">
                            {park.bestDining.length} Restaurantes Recomendados
                          </span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Park Content */}
                    {isExpanded && (
                      <div className="p-5 sm:p-6 space-y-6">
                        {/* Park Overview Description */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-center gap-4">
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed flex-1">
                            <strong className="text-[#1A2B4C] font-serif">Sobre o Parque: </strong>
                            {park.description}
                          </p>
                          <button
                            onClick={() =>
                              openPhotoModal({
                                title: park.name,
                                category: 'park',
                                parkName: park.resort,
                                description: park.description,
                                imageUrl: parkCoverUrl,
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-[#1A2B4C] text-[#D4AF37] hover:bg-[#243B68] font-bold text-xs transition-all flex items-center gap-2 shrink-0 shadow-2xs cursor-pointer"
                          >
                            <Camera className="w-4 h-4 text-[#D4AF37]" />
                            <span>Ver Fotos & Vídeos</span>
                          </button>
                        </div>

                        {/* 2 Column Layout: Attractions vs Dining */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* COLUMN 1: BRINQUEDOS & ATRAÇÕES */}
                          <div className="space-y-3 bg-amber-50/30 p-4 sm:p-5 rounded-2xl border border-amber-200/60">
                            <div className="flex items-center gap-2 text-amber-900 border-b border-amber-200/80 pb-2.5">
                              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                              <h3 className="text-sm font-bold font-serif uppercase tracking-wider">
                                Brinquedos & Atrações Imperdíveis
                              </h3>
                              <span className="ml-auto text-xs font-extrabold bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded-full">
                                {park.mustDoAttractions.length}
                              </span>
                            </div>

                            <div className="space-y-3">
                              {park.mustDoAttractions.map((attractionStr, idx) => {
                                const parsed = parseItem(attractionStr, ATTRACTION_DESCRIPTIONS);
                                const imageUrl = getAttractionImage(parsed.title, park.name);

                                return (
                                  <div
                                    key={idx}
                                    className="p-4 bg-white rounded-2xl border border-amber-100 shadow-2xs space-y-2 hover:border-amber-300 hover:shadow-xs transition-all"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2 flex-1">
                                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center shrink-0 border border-amber-200">
                                          {idx + 1}
                                        </span>
                                        <h4 className="text-xs sm:text-sm font-bold text-[#1A2B4C]">
                                          {parsed.title}
                                        </h4>
                                      </div>
                                      <button
                                        onClick={() =>
                                          openPhotoModal({
                                            title: parsed.title,
                                            category: 'attraction',
                                            parkName: park.name,
                                            description: parsed.description,
                                            imageUrl: imageUrl,
                                          })
                                        }
                                        className="text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border border-amber-200/80 shadow-2xs"
                                      >
                                        <Camera className="w-3.5 h-3.5 text-amber-700" />
                                        <span>Ver Fotos & Vídeos</span>
                                      </button>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                                      {parsed.description}
                                    </p>

                                    {/* Traveler attraction selections */}
                                    <div className="pt-2 pl-8 border-t border-amber-50 flex flex-wrap items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Desejo:</span>
                                      {(settings.travelers || []).map((trav) => {
                                        const isChecked = isAttractionMatch(attractionSelections, trav.id, park.id, parsed.title);
                                        return (
                                          <button
                                            key={trav.id}
                                            type="button"
                                            onClick={() => toggleAttractionSelection(trav.id, park.id, normalizeAttractionName(parsed.title) || parsed.title)}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                                              isChecked
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                            }`}
                                            title={`Marcar que ${trav.name} quer ir em ${parsed.title}`}
                                          >
                                            <span
                                              className="w-2 h-2 rounded-full"
                                              style={{ backgroundColor: trav.avatarColor || '#3B82F6' }}
                                            />
                                            <span>{trav.name.split(' ')[0]}</span>
                                            {isChecked && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* COLUMN 2: RESTAURANTES & GASTRONOMIA */}
                          <div className="space-y-3 bg-blue-50/30 p-4 sm:p-5 rounded-2xl border border-blue-200/60">
                            <div className="flex items-center gap-2 text-blue-900 border-b border-blue-200/80 pb-2.5">
                              <Utensils className="w-4 h-4 text-blue-700" />
                              <h3 className="text-sm font-bold font-serif uppercase tracking-wider">
                                Restaurantes & Destaques Gastronômicos
                              </h3>
                              <span className="ml-auto text-xs font-extrabold bg-blue-200/80 text-blue-950 px-2 py-0.5 rounded-full">
                                {park.bestDining.length}
                              </span>
                            </div>

                            <div className="space-y-3">
                              {park.bestDining.map((diningStr, idx) => {
                                const parsed = parseItem(diningStr, RESTAURANT_DESCRIPTIONS);
                                const imageUrl = getRestaurantImage(parsed.title, park.name);

                                return (
                                  <div
                                    key={idx}
                                    className="p-4 bg-white rounded-2xl border border-blue-100 shadow-2xs space-y-2 hover:border-blue-300 hover:shadow-xs transition-all"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2 flex-1">
                                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs font-bold flex items-center justify-center shrink-0 border border-blue-200">
                                          🍽️
                                        </span>
                                        <h4 className="text-xs sm:text-sm font-bold text-[#1A2B4C]">
                                          {parsed.title}
                                        </h4>
                                      </div>
                                      <button
                                        onClick={() =>
                                          openPhotoModal({
                                            title: parsed.title,
                                            category: 'restaurant',
                                            parkName: park.name,
                                            description: parsed.description,
                                            imageUrl: imageUrl,
                                          })
                                        }
                                        className="text-[11px] font-bold text-blue-900 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border border-blue-200/80 shadow-2xs"
                                      >
                                        <Camera className="w-3.5 h-3.5 text-blue-700" />
                                        <span>Ver Fotos & Vídeos</span>
                                      </button>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                                      {parsed.description}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* PRO TIPS & NIGHT SHOW FOOTER */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
                          {/* Pro Tips Box */}
                          <div className="lg:col-span-2 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200/80 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                              <Info className="w-4 h-4 text-emerald-600" />
                              <span>Dicas Pro do Parque</span>
                            </div>
                            <ul className="space-y-1.5 text-xs text-slate-700">
                              {park.proTips.map((tip, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-emerald-600 font-bold">•</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Night Show Box */}
                          <div className="bg-purple-50/40 p-4 rounded-xl border border-purple-200/80 space-y-2">
                            <div className="flex items-center gap-2 text-purple-900 font-bold text-xs uppercase tracking-wider">
                              <Moon className="w-4 h-4 text-purple-600" />
                              <span>Show Noturno & Fogos</span>
                            </div>
                            {park.nightShow ? (
                              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                {park.nightShow}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 italic">
                                Este parque encerra suas atividades ao pôr do sol ou não possui show fixo noturno.
                              </p>
                            )}
                          </div>
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

      {/* Attraction & Park Photo Modal / Lightbox */}
      <AttractionPhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        item={selectedPhotoItem}
      />

      {/* Attraction Comparison & Summary Modal */}
      <AttractionComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        travelers={settings.travelers || []}
        parksData={PARKS_GUIDE_DATA}
        attractionSelections={attractionSelections}
        onToggleSelection={toggleAttractionSelection}
        tripId={activeTripId || settings.id}
      />
    </div>
  );
};


