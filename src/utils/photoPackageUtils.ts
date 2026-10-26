/**
 * Photo Package Utilities
 * Safe canonical identification, equivalence checks, and candidate ID collection
 * to prevent duplicate expenses and resolve legacy UUID divergence.
 */

import { PhotoPackageItem, ItineraryDay, ExpenseItem } from '../types';
import { generateDeterministicUUID, ensureValidUUID } from './uuid';

/**
 * Normalizes complex name into standard category
 */
export function normalizeComplex(
  complex?: string,
  parkOrName?: string
): 'Disney' | 'Universal' | 'SeaWorld' | 'Outro' {
  const text = `${complex || ''} ${parkOrName || ''}`.toLowerCase();
  if (/disney|magic|epcot|hollywood|animal|blizzard|typhoon/i.test(text)) {
    return 'Disney';
  }
  if (/universal|islands|volcano|epic/i.test(text)) {
    return 'Universal';
  }
  if (/seaworld|busch|aquatica|discovery/i.test(text)) {
    return 'SeaWorld';
  }
  return 'Outro';
}

/**
 * Normalizes duration/validity type
 */
export function normalizePackageType(
  type?: string,
  name?: string
): 'daily' | 'trip_30days' | 'multi_day' | 'annual' {
  const text = `${type || ''} ${name || ''}`.toLowerCase();
  if (/1\s*dia|one\s*day|diário|diario|daily|single/i.test(text)) {
    return 'daily';
  }
  if (/anual|annual|passholder/i.test(text)) {
    return 'annual';
  }
  if (/30\s*dia|trip|viagem|multi/i.test(text)) {
    return 'trip_30days';
  }
  if (type === 'daily' || type === 'annual' || type === 'multi_day') {
    return type;
  }
  return 'trip_30days';
}

/**
 * Normalizes package name string for exact, safe comparisons (no loose substring matching)
 */
export function normalizePackageName(name?: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u00C0-\u00FF]/gi, '');
}

/**
 * Normalizes voucher or confirmation code
 */
export function normalizeVoucherCode(code?: string): string {
  if (!code) return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/**
 * Evaluates whether two photo package objects represent the SAME physical purchase.
 * Strict rules to avoid false positives:
 * 1. If both have voucher codes: codes MUST match. If they differ, they are distinct purchases.
 * 2. If voucher codes are missing or only on one:
 *    - Complexes must match.
 *    - Duration types must match (a 1-day package NEVER merges with a 30-day package).
 *    - Normalized names must be strictly identical (no vague substring matching).
 */
export function arePhotoPackagesEquivalent(
  pkgA?: Partial<PhotoPackageItem> | null,
  pkgB?: Partial<PhotoPackageItem> | null
): boolean {
  if (!pkgA || !pkgB) return false;

  const codeA = normalizeVoucherCode(pkgA.confirmationCode);
  const codeB = normalizeVoucherCode(pkgB.confirmationCode);

  // Rule 1: Voucher codes
  if (codeA && codeB) {
    return codeA === codeB;
  }
  if ((codeA && !codeB) || (!codeA && codeB)) {
    // One has a voucher and the other does not: do not merge if names or complexes differ
    const complexA = normalizeComplex(pkgA.complex, pkgA.name);
    const complexB = normalizeComplex(pkgB.complex, pkgB.name);
    if (complexA !== complexB) return false;
    const nameA = normalizePackageName(pkgA.name);
    const nameB = normalizePackageName(pkgB.name);
    if (!nameA || !nameB || nameA !== nameB) return false;
    const typeA = normalizePackageType(pkgA.type, pkgA.name);
    const typeB = normalizePackageType(pkgB.type, pkgB.name);
    return typeA === typeB;
  }

  // Rule 2: No voucher codes on either
  const complexA = normalizeComplex(pkgA.complex, pkgA.name);
  const complexB = normalizeComplex(pkgB.complex, pkgB.name);
  if (complexA !== complexB) return false;

  const typeA = normalizePackageType(pkgA.type, pkgA.name);
  const typeB = normalizePackageType(pkgB.type, pkgB.name);
  if (typeA !== typeB) return false;

  const nameA = normalizePackageName(pkgA.name);
  const nameB = normalizePackageName(pkgB.name);
  if (!nameA || !nameB) return false;

  return nameA === nameB;
}

/**
 * Generates a stable, canonical UUID for a photo package in the scope of a trip.
 */
export function getCanonicalPhotoPackageId(
  tripId: string,
  pkg?: Partial<PhotoPackageItem> | null
): string {
  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  if (!pkg) {
    return generateDeterministicUUID('photo-pkg-canonical', `${cleanTripId}::default`);
  }

  const voucher = normalizeVoucherCode(pkg.confirmationCode);
  const complex = normalizeComplex(pkg.complex, pkg.name);
  const type = normalizePackageType(pkg.type, pkg.name);
  const name = normalizePackageName(pkg.name) || 'pacote';

  if (voucher) {
    return generateDeterministicUUID(
      'photo-pkg-canonical',
      `${cleanTripId}::${complex}::voucher::${voucher}`
    );
  }

  return generateDeterministicUUID(
    'photo-pkg-canonical',
    `${cleanTripId}::${complex}::${type}::${name}`
  );
}

/**
 * Collects the canonical ID and all candidate legacy UUIDs across days and expenses
 * that refer to this specific photo package purchase in the active trip.
 */
export function collectPackageCandidateIds(
  tripId: string,
  targetPkg: Partial<PhotoPackageItem>,
  allDays: ItineraryDay[],
  expenses: ExpenseItem[]
): {
  canonicalId: string;
  candidateIds: string[];
  deterministicExpenseIds: string[];
} {
  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  const canonicalId = getCanonicalPhotoPackageId(cleanTripId, targetPkg);

  const candidateIdSet = new Set<string>();
  candidateIdSet.add(canonicalId);

  if (targetPkg.id) {
    candidateIdSet.add(targetPkg.id);
    const cleanSelfId = ensureValidUUID(
      targetPkg.id,
      'photo-pkg',
      `${cleanTripId}-${targetPkg.name || 'pkg'}`
    );
    candidateIdSet.add(cleanSelfId);
  }

  // 1. Scan itinerary days for equivalent packages (which may carry legacy day-scoped UUIDs)
  (allDays || []).forEach((day) => {
    const dayPkg = day.parkBooking?.photoPackage;
    if (dayPkg && arePhotoPackagesEquivalent(targetPkg, dayPkg)) {
      if (dayPkg.id) {
        candidateIdSet.add(dayPkg.id);
        const cleanDayPkgId = ensureValidUUID(
          dayPkg.id,
          'photo-pkg',
          `${cleanTripId}-${dayPkg.name || 'pkg'}`
        );
        candidateIdSet.add(cleanDayPkgId);
      }
    }
  });

  // 2. Scan expenses for photo_package records linked to any candidate ID or matching voucher
  const voucher = normalizeVoucherCode(targetPkg.confirmationCode);
  (expenses || []).forEach((exp) => {
    if (exp.sourceType === 'photo_package') {
      if (exp.sourceId && candidateIdSet.has(exp.sourceId)) {
        candidateIdSet.add(exp.sourceId);
      } else if (voucher && exp.notes && exp.notes.toUpperCase().includes(voucher)) {
        if (exp.sourceId) candidateIdSet.add(exp.sourceId);
      }
    }
  });

  const candidateIds = Array.from(candidateIdSet).filter(Boolean);

  // Compute deterministic expense UUIDs for each candidate ID
  const deterministicExpenseIds = candidateIds.map((cid) =>
    generateDeterministicUUID('photo-expense', cid)
  );

  return {
    canonicalId,
    candidateIds,
    deterministicExpenseIds: Array.from(new Set(deterministicExpenseIds)),
  };
}

export interface CanonicalPhotoPackage {
  id: string;
  name: string;
  complex: 'Disney' | 'Universal' | 'SeaWorld' | 'Outro';
  code?: string;
  type?: string;
  status?: string;
  notes?: string;
  parks?: string[];
  costUSD?: number;
  costBRL?: number;
  source?: string;
}

/**
 * Extracts and consolidates only real registered photo packages across expenses, tickets, and day bookings.
 * Prevents phantom packages created from ticket confirmation numbers or empty hasPhotoPackage flags.
 */
export function getRealPhotoPackagesList(
  itineraryDays: ItineraryDay[] = [],
  expenses: ExpenseItem[] = [],
  parkTickets: any[] = []
): CanonicalPhotoPackage[] {
  const list: CanonicalPhotoPackage[] = [];
  const seenVouchers = new Set<string>();
  const seenKeys = new Set<string>();

  // 1. Process real photo package expenses first (Source of Truth for purchases)
  (expenses || []).forEach((exp) => {
    if ((exp.category === 'Pacotes de Fotos' || exp.sourceType === 'photo_package') && !exp.excluded) {
      const codeMatch =
        exp.notes?.match(/voucher:\s*([A-Z0-9-]+)/i) ||
        exp.notes?.match(/c[oó]digo:\s*([A-Z0-9-]+)/i) ||
        exp.notes?.match(/confirma[cç][aã]o:\s*([A-Z0-9-]+)/i);
      const code = (exp as any).confirmationCode || (codeMatch ? codeMatch[1].trim() : undefined);
      const normalizedCode = code ? normalizeVoucherCode(code) : '';

      const complex = normalizeComplex(undefined, exp.title);
      const type = normalizePackageType(undefined, exp.title);
      const key = exp.sourceId || exp.id;

      if (normalizedCode && seenVouchers.has(normalizedCode)) {
        return;
      }
      if (seenKeys.has(key)) {
        return;
      }

      if (normalizedCode) seenVouchers.add(normalizedCode);
      seenKeys.add(key);

      list.push({
        id: key,
        name: exp.title,
        complex,
        code,
        type,
        status: exp.status === 'Pago' ? 'Confirmado' : 'Pendente',
        notes: exp.notes,
        costUSD: exp.estimatedValueUSD,
        costBRL: exp.estimatedValueBRL,
        source: 'Financeiro / Despesas',
      });
    }
  });

  // 2. Process park tickets with photo package inclusion
  (parkTickets || []).forEach((tk) => {
    const titleLower = (tk.title || '').toLowerCase();
    if (
      titleLower.includes('foto') ||
      titleLower.includes('photo') ||
      titleLower.includes('memory maker') ||
      titleLower.includes('photokey')
    ) {
      const code = tk.confirmationCode ? tk.confirmationCode.trim() : undefined;
      const normalizedCode = code ? normalizeVoucherCode(code) : '';
      const complex = normalizeComplex(tk.complex, tk.title);
      const type = normalizePackageType(undefined, tk.title);

      if (normalizedCode && seenVouchers.has(normalizedCode)) return;
      if (seenKeys.has(tk.id)) return;

      if (normalizedCode) seenVouchers.add(normalizedCode);
      seenKeys.add(tk.id);

      list.push({
        id: tk.id,
        name: tk.title,
        complex,
        code,
        type,
        status: tk.paymentStatus || 'Pago',
        notes: tk.notes,
        parks: tk.parksIncluded,
        costUSD: tk.costUSD,
        costBRL: tk.costBRL,
        source: 'Ingressos Comprados',
      });
    }
  });

  // 3. Process photoPackage objects explicitly saved on days
  (itineraryDays || []).forEach((d) => {
    const pb = d.parkBooking;
    if (pb?.photoPackage && pb.photoPackage.name && pb.photoPackage.name.trim().length > 0) {
      const pkg = pb.photoPackage;
      const code = pkg.confirmationCode ? pkg.confirmationCode.trim() : undefined;
      const normalizedCode = code ? normalizeVoucherCode(code) : '';
      const complex = normalizeComplex(pkg.complex, pkg.name || d.park);
      const type = normalizePackageType(pkg.type, pkg.name);

      // Check if this package is already represented in list
      const existing = list.find((p) => {
        if (normalizedCode && p.code && normalizeVoucherCode(p.code) === normalizedCode) return true;
        if (p.complex === complex && (type === 'trip_30days' || p.type === 'trip_30days')) return true;
        return arePhotoPackagesEquivalent(pkg, {
          name: p.name,
          complex: p.complex,
          type: p.type as any,
          confirmationCode: p.code,
        });
      });

      if (existing) {
        // Enrich existing package if missing voucher code or covered park
        if (!existing.code && code) {
          existing.code = code;
          if (normalizedCode) seenVouchers.add(normalizedCode);
        }
        if (d.park) {
          if (!existing.parks) existing.parks = [d.park];
          else if (!existing.parks.includes(d.park)) existing.parks.push(d.park);
        }
        return;
      }

      const key = pkg.id || `pkg-${d.id}`;
      if (seenKeys.has(key)) return;
      if (normalizedCode && seenVouchers.has(normalizedCode)) return;

      if (normalizedCode) seenVouchers.add(normalizedCode);
      seenKeys.add(key);

      list.push({
        id: key,
        name: pkg.name || 'Pacote de Fotos',
        complex,
        code,
        type,
        status: pkg.status || 'Ativo',
        notes: pkg.notes || pkg.validityDescription,
        parks: pkg.includedParks && pkg.includedParks.length > 0 ? pkg.includedParks : d.park ? [d.park] : undefined,
        costUSD: pkg.costUSD,
        costBRL: pkg.costBRL,
        source: `Dia ${d.dayNumber} (${d.park})`,
      });
    }
    // CRITICAL: DO NOT use `else if (pb?.hasPhotoPackage)` to generate phantom packages!
  });

  return list;
}

/**
 * Returns the effective photo package for a given itinerary day.
 * Returns null if the day has no real photo package registered or covered.
 */
export function getPhotoPackageForDay(
  day: ItineraryDay,
  realPackages: CanonicalPhotoPackage[]
): CanonicalPhotoPackage | null {
  if (!day || !day.park || day.park === 'Sem Parque' || day.park === 'Livre') return null;

  const parkComplex = normalizeComplex(undefined, day.park);

  // 1. If day has an explicit photoPackage object
  if (day.parkBooking?.photoPackage && day.parkBooking.photoPackage.name) {
    const pkg = day.parkBooking.photoPackage;
    const pkgCode = pkg.confirmationCode ? pkg.confirmationCode.trim() : undefined;
    const pkgComplex = normalizeComplex(pkg.complex, pkg.name);

    const matched = realPackages.find((p) => {
      if (pkgCode && p.code && normalizeVoucherCode(p.code) === normalizeVoucherCode(pkgCode)) return true;
      if (p.complex === pkgComplex && (p.type === 'trip_30days' || /30\s*dia|memory\s*maker/i.test(p.name))) return true;
      return false;
    });

    if (matched) return matched;

    return {
      id: pkg.id || `day-pkg-${day.id}`,
      name: pkg.name,
      complex: pkgComplex,
      code: pkgCode,
      type: pkg.type,
      status: pkg.status || 'Ativo',
      notes: pkg.validityDescription || pkg.notes,
    };
  }

  // 2. Check if any real registered package covers this park/complex
  const matched = realPackages.find((pkg) => {
    const isMultiDayOrTrip =
      pkg.type === 'trip_30days' ||
      pkg.type === 'multi_day' ||
      /30\s*dia|trip|viagem|memory\s*maker|photo\s*pass/i.test(pkg.name);

    // If multi-day/trip package, does it cover this park's complex?
    if (isMultiDayOrTrip && pkg.complex === parkComplex && parkComplex !== 'Outro') {
      return true;
    }

    // Specific park list match
    if (
      pkg.parks &&
      pkg.parks.some(
        (p) =>
          p.toLowerCase().includes(day.park.toLowerCase()) ||
          day.park.toLowerCase().includes(p.toLowerCase())
      )
    ) {
      return true;
    }

    return false;
  });

  if (matched) {
    return matched;
  }

  return null;
}
