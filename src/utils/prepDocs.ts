import { PreparationDocument, Traveler } from '../types';
import { INITIAL_PREPARATION_DOCS } from '../data/initialData';
import { ensureValidUUID, generateDeterministicUUID } from './uuid';

/**
 * Ensures every traveler in the trip has a complete, individualized set of preparation documents
 * with correct deterministic UUIDs, sub-items, and progress trackers.
 */
export function ensurePreparationDocsForTravelers(
  travelers: Traveler[] | undefined,
  existingDocs: PreparationDocument[] | undefined,
  tripId: string = 'active-trip'
): PreparationDocument[] {
  const trvs = Array.isArray(travelers) && travelers.length > 0 ? travelers : [];
  if (trvs.length === 0) {
    return Array.isArray(existingDocs) ? existingDocs : [];
  }

  const cleanTripId = ensureValidUUID(tripId, 'trip', tripId);
  const currentDocs = Array.isArray(existingDocs) ? existingDocs : [];
  const validTravelerIds = new Set(trvs.map((t) => t.id));
  
  const result: PreparationDocument[] = [];

  trvs.forEach((traveler) => {
    const tId = traveler.id;
    const tCleanId = ensureValidUUID(tId, 'traveler', tId);

    INITIAL_PREPARATION_DOCS.forEach((baseDoc, docIdx) => {
      // Find matching existing document for this traveler
      const existing = currentDocs.find(
        (d) =>
          (d.travelerId === tId || d.travelerId === tCleanId || (!d.travelerId && traveler === trvs[0])) &&
          (d.title?.trim().toLowerCase() === baseDoc.title.trim().toLowerCase() ||
            d.id === `${baseDoc.id}-${tId}` ||
            d.id === `${baseDoc.id}-${tCleanId}` ||
            (docIdx === 0 && d.id === baseDoc.id && traveler === trvs[0]))
      );

      const docDeterministicId = generateDeterministicUUID(
        'prep-doc',
        `${cleanTripId}-${tId}-${baseDoc.title}`
      );

      if (existing) {
        // Map and preserve sub-items progress
        const subItems = (baseDoc.subItems || []).map((baseSub, subIdx) => {
          const existingSub = existing.subItems?.find(
            (s) =>
              s.title.trim().toLowerCase() === baseSub.title.trim().toLowerCase() ||
              s.id === baseSub.id
          );

          const subDeterministicId = generateDeterministicUUID(
            'prep-sub',
            `${cleanTripId}-${tId}-${baseDoc.title}-${subIdx}-${baseSub.title}`
          );

          const isCompleted = existingSub
            ? Boolean(existingSub.completedByTravelers?.[tId] ?? existingSub.completed)
            : false;

          return {
            id: existingSub?.id ? ensureValidUUID(existingSub.id, 'prep-sub', subDeterministicId) : subDeterministicId,
            title: baseSub.title,
            completed: isCompleted,
            completedByTravelers: {
              ...(existingSub?.completedByTravelers || {}),
              [tId]: isCompleted,
            },
          };
        });

        const isDocCompleted =
          subItems.length > 0
            ? subItems.every((s) => Boolean(s.completedByTravelers?.[tId]))
            : Boolean(existing.completedByTravelers?.[tId] ?? existing.completed);

        result.push({
          ...existing,
          id: existing.id ? ensureValidUUID(existing.id, 'prep-doc', docDeterministicId) : docDeterministicId,
          travelerId: tId,
          title: baseDoc.title,
          subtitle: existing.subtitle || baseDoc.subtitle,
          status: isDocCompleted ? 'Concluído' : existing.status || 'Pendente',
          completed: isDocCompleted,
          completedByTravelers: {
            ...(existing.completedByTravelers || {}),
            [tId]: isDocCompleted,
          },
          subItems,
          tips: baseDoc.tips || existing.tips || [],
          links: baseDoc.links || existing.links || [],
        });
      } else {
        // Fresh initialization for this traveler
        const subItems = (baseDoc.subItems || []).map((baseSub, subIdx) => ({
          id: generateDeterministicUUID(
            'prep-sub',
            `${cleanTripId}-${tId}-${baseDoc.title}-${subIdx}-${baseSub.title}`
          ),
          title: baseSub.title,
          completed: false,
          completedByTravelers: { [tId]: false },
        }));

        result.push({
          id: docDeterministicId,
          travelerId: tId,
          title: baseDoc.title,
          subtitle: baseDoc.subtitle,
          status: 'Pendente',
          completed: false,
          completedByTravelers: { [tId]: false },
          subItems,
          tips: baseDoc.tips || [],
          links: baseDoc.links || [],
        });
      }
    });

    // Also keep custom documents explicitly created for this traveler
    const customDocs = currentDocs.filter(
      (d) =>
        (d.travelerId === tId || d.travelerId === tCleanId) &&
        !INITIAL_PREPARATION_DOCS.some(
          (b) => b.title.trim().toLowerCase() === d.title?.trim().toLowerCase()
        )
    );

    customDocs.forEach((cDoc) => {
      const cId = cDoc.id ? ensureValidUUID(cDoc.id, 'prep-doc-custom', `${cleanTripId}-${tId}-${cDoc.title}`) : generateDeterministicUUID('prep-doc-custom', `${cleanTripId}-${tId}-${cDoc.title}`);
      result.push({
        ...cDoc,
        id: cId,
        travelerId: tId,
      });
    });
  });

  return result;
}
