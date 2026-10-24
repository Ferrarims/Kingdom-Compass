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
