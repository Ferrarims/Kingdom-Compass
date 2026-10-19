export interface ParkHoursResult {
  success: boolean;
  isOfficial: boolean;
  parkName: string;
  date: string;
  openingTime: string;
  closingTime: string;
  earlyEntryTime: string;
  message: string;
}

export async function fetchParkHours(parkName: string, dateStr: string): Promise<ParkHoursResult> {
  if (!parkName) {
    return {
      success: false,
      isOfficial: false,
      parkName: '',
      date: dateStr,
      openingTime: '09:00',
      closingTime: '21:00',
      earlyEntryTime: '08:30',
      message: 'Nome do parque não informado',
    };
  }

  try {
    const res = await fetch(`/api/park-hours?parkName=${encodeURIComponent(parkName)}&date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: ParkHoursResult = await res.json();
    return data;
  } catch (err) {
    console.warn('Erro ao consultar API de horários de parques:', err);
    return {
      success: false,
      isOfficial: false,
      parkName,
      date: dateStr,
      openingTime: '09:00',
      closingTime: '21:00',
      earlyEntryTime: '08:30',
      message: 'Horário estimado até a divulgação da agenda oficial.',
    };
  }
}
