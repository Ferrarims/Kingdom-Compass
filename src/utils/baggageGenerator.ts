import { BaggageItem, MonthInfo } from '../types';
import { Gender } from './genderDetector';
import { ORLANDO_MONTHS_GUIDE } from '../data/initialData';

export type WeatherCondition = 'hot' | 'cold' | 'rainy';

export interface BaggageTemplateOptions {
  gender: Gender;
  weather: WeatherCondition[];
  days: number;
  hasWashingMachine?: boolean;
}

export interface DetectedTripWeatherInfo {
  recommendedWeather: WeatherCondition[];
  primaryMonth: MonthInfo;
  climateType: string;
  tempCelsius: string;
  rainLevel: string;
  rainDescription: string;
  weatherTip: string;
  durationDays: number;
  startDateFormatted: string;
  endDateFormatted: string;
  spannedMonthsText: string;
}

/**
 * Automatically inspects the trip dates and duration from "Planeje a Data"
 * to detect the realistic climate, crowd, temperature and rain conditions of Orlando.
 */
export function detectOrlandoWeatherFromTrip(
  startDate?: string,
  durationDays?: number
): DetectedTripWeatherInfo {
  const totalDays = Math.max(1, durationDays || 1);

  // Parse start date
  let startYear = 2026;
  let startMonth = 1;
  let startDay = 16;

  if (startDate) {
    const parts = startDate.split('-');
    if (parts.length >= 3) {
      startYear = parseInt(parts[0], 10) || 2026;
      startMonth = parseInt(parts[1], 10) || 1;
      startDay = parseInt(parts[2], 10) || 1;
    }
  }

  const monthCounts: Record<number, number> = {};
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

  const primaryMonth =
    ORLANDO_MONTHS_GUIDE.find((m) => m.monthIndex === majorityMonthIndex) ||
    ORLANDO_MONTHS_GUIDE[0];

  const spannedMonthIndices = Object.keys(monthCounts).map((k) => parseInt(k, 10));
  const spannedMonths = ORLANDO_MONTHS_GUIDE.filter((m) =>
    spannedMonthIndices.includes(m.monthIndex)
  );

  // Weather condition recommendation based on Orlando historical data
  const recommendedWeather: WeatherCondition[] = [];

  // Cold condition: months 12, 1, 2, or min temp <= 15°C (ex: Nov, Mar nights)
  const hasCold = spannedMonths.some(
    (m) => [12, 1, 2, 11].includes(m.monthIndex)
  );
  if (hasCold) {
    recommendedWeather.push('cold');
  }

  // Hot condition: months 5, 6, 7, 8, 9, 10, or max temp >= 28°C
  const hasHot = spannedMonths.some(
    (m) => [4, 5, 6, 7, 8, 9, 10].includes(m.monthIndex)
  );
  if (hasHot) {
    recommendedWeather.push('hot');
  }

  // If neither cold nor hot was triggered, default to what primaryMonth is closer to
  if (!recommendedWeather.includes('cold') && !recommendedWeather.includes('hot')) {
    if ([1, 2, 12, 11].includes(primaryMonth.monthIndex)) {
      recommendedWeather.push('cold');
    } else {
      recommendedWeather.push('hot');
    }
  }

  // Rainy condition: months with high precipitation (June to September) or 'Chuvoso'/'Muito Chuvoso'
  const hasRainy = spannedMonths.some(
    (m) => m.rainLevel === 'Chuvoso' || m.rainLevel === 'Muito Chuvoso' || [6, 7, 8, 9].includes(m.monthIndex)
  );
  if (hasRainy) {
    recommendedWeather.push('rainy');
  }

  // Calculate formatted dates
  const startD = new Date(startYear, startMonth - 1, startDay);
  const endD = new Date(startYear, startMonth - 1, startDay + totalDays - 1);
  const formatD = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const spannedMonthsText = spannedMonths.map((m) => m.month).join(', ');

  return {
    recommendedWeather,
    primaryMonth,
    climateType: primaryMonth.climateType || 'Inverno Ameno & Céu Aberto',
    tempCelsius: primaryMonth.tempCelsius,
    rainLevel: primaryMonth.rainLevel || 'Seco',
    rainDescription: primaryMonth.rainDescription || 'Mês de pouca chuva.',
    weatherTip: primaryMonth.weatherTip || 'Roupas adequadas para a estação.',
    durationDays: totalDays,
    startDateFormatted: formatD(startD),
    endDateFormatted: formatD(endD),
    spannedMonthsText,
  };
}

/**
 * Generates a tailored, realistic packing list for an Orlando trip based on:
 * - Gender: 'male' | 'female'
 * - Weather conditions: 'hot' (calor), 'cold' (frio), 'rainy' (chuva)
 * - Duration of the trip: number of days
 */
export function generateEssentialBaggageItems(
  options: BaggageTemplateOptions
): Omit<BaggageItem, 'id' | 'travelerId'>[] {
  const D = Math.max(1, Math.round(options.days || 7));
  const isHot = options.weather.includes('hot') || (!options.weather.includes('cold') && !options.weather.includes('hot'));
  const isCold = options.weather.includes('cold');
  const isRainy = options.weather.includes('rainy');
  const isFemale = options.gender === 'female';
  const hasWashingMachine = !!options.hasWashingMachine;

  // Se a acomodação tem máquina de lavar, calcula roupas para ciclo rotativo de ~7 a 8 dias
  const clothesDays = hasWashingMachine ? Math.min(D, 8) : D;
  const washNote = hasWashingMachine && D > 8 ? ' (ciclo c/ máquina de lavar)' : '';

  const items: Omit<BaggageItem, 'id' | 'travelerId'>[] = [];

  // -------------------------------------------------------------
  // 1. ROUPAS
  // -------------------------------------------------------------
  // Camisetas / Tops para parques
  const tshirtsQty = isHot ? clothesDays + 2 : clothesDays + 1;
  items.push({
    category: 'Roupas',
    name: isHot
      ? `${tshirtsQty} Camisetas leves / dry-fit para os parques${washNote || ' (trocas extras pelo calor)'}`
      : `${tshirtsQty} Camisetas confortáveis para os parques${washNote}`,
    packed: false,
    quantity: tshirtsQty,
  });

  // Roupas íntimas
  const underQty = hasWashingMachine ? clothesDays + 2 : D + 3;
  if (isFemale) {
    items.push({
      category: 'Roupas',
      name: `${underQty} Calcinhas confortáveis de algodão / microfibra para caminhada${washNote}`,
      packed: false,
      quantity: underQty,
    });
    const brasQty = hasWashingMachine
      ? Math.min(4, Math.max(3, Math.ceil(clothesDays / 2) + 1))
      : Math.max(3, Math.ceil(D / 2) + 1);
    items.push({
      category: 'Roupas',
      name: `${brasQty} Sutiãs / Tops esportivos sem aro para os parques`,
      packed: false,
      quantity: brasQty,
    });
  } else {
    items.push({
      category: 'Roupas',
      name: `${underQty} Cuecas confortáveis sem costura (anti-atrito para caminhada)${washNote}`,
      packed: false,
      quantity: underQty,
    });
  }

  // Shorts / Bermudas
  const shortsQty = isHot
    ? Math.max(3, Math.ceil(clothesDays * 0.7))
    : isCold
    ? 2
    : Math.max(2, Math.ceil(clothesDays * 0.5));
  items.push({
    category: 'Roupas',
    name: `${shortsQty} Shorts / Bermudas leves para parques e passeios${washNote}`,
    packed: false,
    quantity: shortsQty,
  });

  // Calças
  if (isCold) {
    const pantsQty = Math.max(3, Math.ceil(clothesDays * 0.6));
    items.push({
      category: 'Roupas',
      name: `${pantsQty} Calças confortáveis (jeans c/ elastano / moletom) para parques e noites${washNote}`,
      packed: false,
      quantity: pantsQty,
    });
    items.push({
      category: 'Roupas',
      name: '2 Calças térmicas / segunda pele para dias de frio intenso',
      packed: false,
      quantity: 2,
    });
  } else {
    items.push({
      category: 'Roupas',
      name: '2 Calças confortáveis (para o voo e restaurantes com ar-condicionado)',
      packed: false,
      quantity: 2,
    });
  }

  // Agasalhos e Casacos
  if (isCold) {
    items.push({
      category: 'Roupas',
      name: '1 Jaqueta pesada / casaco corta-vento com capuz para frio',
      packed: false,
      quantity: 1,
    });
    const hoodiesQty = hasWashingMachine
      ? Math.min(3, Math.ceil(clothesDays / 4) + 1)
      : Math.min(4, Math.ceil(D / 4) + 1);
    items.push({
      category: 'Roupas',
      name: `${hoodiesQty} Moletons / blusas de frio confortáveis para os parques`,
      packed: false,
      quantity: hoodiesQty,
    });
    items.push({
      category: 'Roupas',
      name: '1 Kit de frio (luvas, gorro e cachecol para noites no parque)',
      packed: false,
      quantity: 1,
    });
  } else {
    items.push({
      category: 'Roupas',
      name: '2 Casacos leves / blusas corta-vento (ar-condicionado forte de Orlando)',
      packed: false,
      quantity: 2,
    });
  }

  // Pijamas
  const pjsQty = hasWashingMachine ? 2 : Math.max(2, Math.ceil(D / 4));
  items.push({
    category: 'Roupas',
    name: `${pjsQty} Pijamas confortáveis para descanso`,
    packed: false,
    quantity: pjsQty,
  });

  // Trajes de Banho / Aquáticos
  const swimQty = isHot ? 2 : 1;
  if (isFemale) {
    items.push({
      category: 'Roupas',
      name: `${swimQty} Biquínis / maiôs para piscina e parques aquáticos`,
      packed: false,
      quantity: swimQty,
    });
    if (isHot) {
      items.push({
        category: 'Roupas',
        name: '1 Canga ou saída de praia leve',
        packed: false,
        quantity: 1,
      });
    }
  } else {
    items.push({
      category: 'Roupas',
      name: `${swimQty} Sungas ou bermudas de banho para piscina e parques aquáticos`,
      packed: false,
      quantity: swimQty,
    });
  }

  // Roupas para Jantar / Noite Especial
  const dinnerQty = hasWashingMachine
    ? Math.min(2, Math.max(1, Math.ceil(clothesDays / 4)))
    : Math.min(3, Math.max(1, Math.ceil(D / 4)));
  if (isFemale) {
    items.push({
      category: 'Roupas',
      name: `${dinnerQty} Vestidos ou macacões leves para fotos no castelo e jantares`,
      packed: false,
      quantity: dinnerQty,
    });
  } else {
    items.push({
      category: 'Roupas',
      name: `${dinnerQty} Camisas polo ou camisas de botão para jantares no Disney Springs`,
      packed: false,
      quantity: dinnerQty,
    });
  }

  // -------------------------------------------------------------
  // 2. CALÇADOS
  // -------------------------------------------------------------
  items.push({
    category: 'Calçados',
    name: '2 Pares de tênis amaciados para revezar nos parques',
    packed: false,
    quantity: 2,
  });

  const socksQty = isRainy
    ? (hasWashingMachine ? clothesDays + 3 : D + 5)
    : (hasWashingMachine ? clothesDays + 2 : D + 3);
  items.push({
    category: 'Calçados',
    name: isRainy
      ? `${socksQty} Pares de meias de algodão (pares extras para trocar após chuva)${washNote}`
      : `${socksQty} Pares de meias de algodão para caminhadas longas${washNote}`,
    packed: false,
    quantity: socksQty,
  });

  items.push({
    category: 'Calçados',
    name: '1 Chinelo ou sandália leve para descanso no hotel e piscina',
    packed: false,
    quantity: 1,
  });

  // -------------------------------------------------------------
  // 3. PARQUE & PASSEIOS
  // -------------------------------------------------------------
  const ponchosQty = isRainy ? Math.max(2, Math.ceil(D / 4) + 1) : 2;
  items.push({
    category: 'Parque',
    name: isRainy
      ? `${ponchosQty} Capas de chuva compactas reforçadas para os parques`
      : `${ponchosQty} Capas de chuva compactas (atrações de água e chuviscos)`,
    packed: false,
    quantity: ponchosQty,
  });

  if (isRainy) {
    items.push({
      category: 'Parque',
      name: '1 Guarda-chuva pequeno e dobrável com abertura rápida',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Parque',
      name: '3 Sacos tipo zip-lock impermeáveis para proteger celulares e carteiras',
      packed: false,
      quantity: 3,
    });
    items.push({
      category: 'Parque',
      name: '1 Capa impermeável ou saco estanque para a mochila do parque',
      packed: false,
      quantity: 1,
    });
  }

  if (isHot) {
    items.push({
      category: 'Parque',
      name: '1 Mini ventilador portátil recarregável para as filas dos parques',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Parque',
      name: '1 Toalha refrescante (cooling towel) para o calor de Orlando',
      packed: false,
      quantity: 1,
    });
  }

  if (isFemale) {
    items.push({
      category: 'Parque',
      name: '1 Viseira, boné ou tiara de orelhinhas da Disney com proteção solar',
      packed: false,
      quantity: 1,
    });
  } else {
    items.push({
      category: 'Parque',
      name: '1 Boné ou chapéu com proteção UV para os parques',
      packed: false,
      quantity: 1,
    });
  }

  items.push({
    category: 'Parque',
    name: '1 Mochila leve ou bolsa transversal para levar aos parques',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Parque',
    name: '1 Garrafa térmica de água para economizar e manter água gelada',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Parque',
    name: '1 Óculos de sol com proteção UV',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Parque',
    name: '1 Capa estanque / impermeável para celular em atrações com água',
    packed: false,
    quantity: 1,
  });

  // -------------------------------------------------------------
  // 4. ELETRÔNICOS
  // -------------------------------------------------------------
  items.push({
    category: 'Eletrônicos',
    name: '1 Power Bank portátil (10.000mAh+) para o app My Disney Experience e fotos',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Eletrônicos',
    name: '2 Adaptadores de tomada padrão americano (pino chato dos EUA)',
    packed: false,
    quantity: 2,
  });
  items.push({
    category: 'Eletrônicos',
    name: '2 Cabos de carregador para celular (um para o quarto e outro para a mochila)',
    packed: false,
    quantity: 2,
  });
  items.push({
    category: 'Eletrônicos',
    name: '1 Fone de ouvido para o voo e esperas',
    packed: false,
    quantity: 1,
  });

  // -------------------------------------------------------------
  // 5. FARMACINHA & HIGIENE
  // -------------------------------------------------------------
  const sunQty = isHot ? 2 : 1;
  items.push({
    category: 'Farmacinha',
    name: `${sunQty} Protetores solares corporal e facial (FPS 50+)`,
    packed: false,
    quantity: sunQty,
  });
  items.push({
    category: 'Farmacinha',
    name: '1 Protetor anti-atrito para pés e coxas (evita assaduras na caminhada)',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Farmacinha',
    name: '1 Caixa de curativos hidrocolóides / band-aids para bolhas nos pés',
    packed: false,
    quantity: 1,
  });
  const lipQty = isCold ? 2 : 1;
  items.push({
    category: 'Farmacinha',
    name: `${lipQty} Protetores labiais com manteiga de cacau e filtro solar`,
    packed: false,
    quantity: lipQty,
  });
  items.push({
    category: 'Farmacinha',
    name: '1 Kit de remédios de uso pessoal com receita médica e analgésicos',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Farmacinha',
    name: '1 Escova e pasta de dentes',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Farmacinha',
    name: '1 Kit banho compacto (Shampoo, Condicionador e Sabonete)',
    packed: false,
    quantity: 1,
  });
  if (hasWashingMachine) {
    items.push({
      category: 'Farmacinha',
      name: '1 Pacote pequeno ou cápsulas de sabão lava-roupas (Tide Pods) para a máquina',
      packed: false,
      quantity: 1,
    });
  }
  items.push({
    category: 'Farmacinha',
    name: '1 Cortador / lixa de unha e pinça',
    packed: false,
    quantity: 1,
  });

  if (isFemale) {
    items.push({
      category: 'Farmacinha',
      name: '1 Kit de higiene feminina (absorventes / protetores diários)',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Kit de maquiagem leve / à prova d água para calor e fotos',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Demaquilante e lenços umedecidos faciais',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Hidratante facial e corporal pós-parque',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Kit com elásticos e presilhas para prender cabelo nas atrações',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Escova de cabelo / Secador ou Prancha bivolt',
      packed: false,
      quantity: 1,
    });
  } else {
    items.push({
      category: 'Farmacinha',
      name: '1 Barbeador / gilete e creme de barbear',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Pomada ou gel modelador de cabelo',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Loção pós-barba / hidratante facial masculino',
      packed: false,
      quantity: 1,
    });
    items.push({
      category: 'Farmacinha',
      name: '1 Desodorante antitranspirante masculino de longa duração',
      packed: false,
      quantity: 1,
    });
  }

  // -------------------------------------------------------------
  // 6. DOCUMENTOS
  // -------------------------------------------------------------
  items.push({
    category: 'Documentos',
    name: '1 Bolsa doleira ou organizador seguro de documentos e passaporte',
    packed: false,
    quantity: 1,
  });
  items.push({
    category: 'Documentos',
    name: '1 Cartão de débito/crédito internacional (Nomad / Wise)',
    packed: false,
    quantity: 1,
  });

  return items;
}
