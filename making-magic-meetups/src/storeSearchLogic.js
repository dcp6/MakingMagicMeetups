const tcgHintRegex =
  /\b(mtg|magic|trading\s*card|trading\s*cards|tcg|card\s*shop|game\s*store|game\s*shop|gaming|collectibles?|hobby|tabletop|warhammer|pokemon)\b/i;

export function buildTcgQuery(query, selectedStoreLocation) {
  const baseQuery = String(query || '').trim();
  const locationSuffix = selectedStoreLocation ? ` ${selectedStoreLocation}` : '';
  if (tcgHintRegex.test(baseQuery)) {
    return `${baseQuery}${locationSuffix}`.trim();
  }
  return `${baseQuery}${locationSuffix} trading card game store`.trim();
}

// Returns true for actual gaming businesses — excludes cities and areas.
// Apple does NOT populate subtitle; the only tag they give is category: "Store"
// for real businesses vs. undefined for geographic places like "Seattle, WA".
// Name-based fallback uses specific compound phrases (not bare "game") so that
// place names like "Wilmington Game" don't slip through.
export function isTaggedAsGamingStore(place) {
  const name = String(place?.name || '').toLowerCase();
  const category = String(
    place?.pointOfInterestCategory || place?.poiCategory || place?.category || ''
  ).toLowerCase();

  // Apple's signal: "Store" = real business, undefined = city/area.
  const isStoreBusiness = category === 'store';

  // Name-based fallback: require specific gaming-business phrases, not bare keywords.
  const hasGamingName = /\b(game\s*(center|store|shop|house|room|zone|hub|land|world|shack)|gaming\s*(center|store|shop|lounge|den)|tcg|trading\s*card|card\s*(game|shop|store|kingdom|palace|den|cave|vault|realm)|magic\s*(the\s*gathering|shop|store|card)|hobby\s*(store|shop|center|house)|comic\s*(store|shop|book)|warhammer|pok[eé]mon|miniatures?|tabletop|collectible)\b/.test(name);

  return isStoreBusiness || hasGamingName;
}

export function scoreStorePlace(place) {
  const name = String(place?.name || '').toLowerCase();
  const subtitle = String(place?.subtitle || '').toLowerCase();
  const category = String(
    place?.pointOfInterestCategory || place?.poiCategory || place?.category || ''
  ).toLowerCase();
  const categoryList = Array.isArray(place?.pointOfInterestCategories)
    ? place.pointOfInterestCategories.map((value) => String(value || '').toLowerCase()).join(' ')
    : '';

  // Rank by specificity — MTG/TCG stores first, then broader gaming/hobby stores.
  // Scoring is used for ordering; filtering is handled by isTaggedAsGamingStore.
  const text = [name, subtitle, category, categoryList].join(' ');
  let score = 0;

  if (/\b(mtg|magic the gathering|magic: the gathering)\b/.test(text)) {
    score += 10;
  }
  if (/\b(trading\s*card|trading\s*cards|tcg|card\s*shop)\b/.test(text)) {
    score += 8;
  }
  if (/\b(game\s*store|game\s*shop|board\s*game|comic|hobby|collectibles?|tabletop)\b/.test(text)) {
    score += 4;
  }
  if (/\b(gaming|warhammer|pokemon|pok[eé]mon|yugioh|yu-gi-oh|dungeon|miniatures?|rpg|anime)\b/.test(text)) {
    score += 3;
  }

  return score;
}

export function extractLocationOption(place) {
  const address = String(place?.formattedAddress || place?.address || '').trim();
  if (!address) {
    return '';
  }
  const parts = address
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }
  return parts[0] || '';
}

export function deriveLocationOptions(places, limit = 8) {
  const locationSet = new Set();
  for (const place of places.slice(0, 30)) {
    const option = extractLocationOption(place);
    if (option) {
      locationSet.add(option);
    }
  }
  return Array.from(locationSet).slice(0, limit);
}

export function resolveEffectiveSelectedLocation(selectedStoreLocation, locationOptions) {
  const selected = String(selectedStoreLocation || '').trim();
  if (!selected) {
    return locationOptions.length === 1 ? locationOptions[0] : '';
  }
  const selectedLower = selected.toLowerCase();
  const match = locationOptions.find((opt) => opt.toLowerCase() === selectedLower);
  return match || '';
}

function mapPlaceToStore(place) {
  const placeId = place?.placeId || place?.identifier || place?.id || null;
  const name = place?.name || null;
  const address = place?.formattedAddress || place?.address || null;
  const url = placeId ? `https://maps.apple.com/place?place-id=${encodeURIComponent(placeId)}` : null;
  const website = place?.website || null;
  const phone = place?.phoneNumber || null;
  const latitude = Number(place?.coordinate?.latitude);
  const longitude = Number(place?.coordinate?.longitude);
  const relevanceScore = scoreStorePlace(place);
  const appleCategory = String(
    place?.pointOfInterestCategory || place?.poiCategory || place?.category || ''
  ).toLowerCase();
  return {
    placeId,
    name,
    address,
    url,
    website,
    phone,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    // True when Apple has tagged this as a real business ("Store").
    // Cities and geographic areas have category undefined, so they're excluded.
    isActualStore: appleCategory === 'store',
    _relevanceScore: relevanceScore
  };
}

export function rankStores(places, limit = 10) {
  const dedupedPlaces = [];
  const seenPlaceKeys = new Set();
  for (const place of places) {
    const placeId = place?.placeId || place?.identifier || place?.id || null;
    const name = String(place?.name || '').trim();
    const address = String(place?.formattedAddress || place?.address || '').trim();
    const latitude = Number(place?.coordinate?.latitude);
    const longitude = Number(place?.coordinate?.longitude);
    const coordKey =
      Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude},${longitude}` : '';
    const dedupeParts = [placeId || '', address, coordKey].filter(Boolean);
    const dedupeKey = String((dedupeParts.length ? dedupeParts.join('|') : name)).toLowerCase();
    if (!dedupeKey || seenPlaceKeys.has(dedupeKey)) {
      continue;
    }
    seenPlaceKeys.add(dedupeKey);
    dedupedPlaces.push(place);
  }

  return dedupedPlaces
    .filter(isTaggedAsGamingStore)                  // Exclude cities/areas
    .map(mapPlaceToStore)
    .sort((a, b) => b._relevanceScore - a._relevanceScore)
    .slice(0, limit)
    .map((store) => {
      const { _relevanceScore, ...rest } = store;
      return rest;
    });
}

export async function runStoreSearch({ query, selectedStoreLocation, searchPlaces }) {
  const trimmedQuery = String(query || '').trim();
  async function safeSearchPlaces(searchText) {
    try {
      const result = await searchPlaces(searchText);
      return Array.isArray(result) ? result : [];
    } catch (_error) {
      return [];
    }
  }

  const locationSeedPlaces = await safeSearchPlaces(trimmedQuery);

  const initialTcgQuery = buildTcgQuery(trimmedQuery, selectedStoreLocation);
  const primaryPlaces = await safeSearchPlaces(initialTcgQuery);
  const fallbackPlaces =
    initialTcgQuery !== trimmedQuery && primaryPlaces.length < 4
      ? await safeSearchPlaces(trimmedQuery)
      : [];

  const locationOptions = deriveLocationOptions(
    [...locationSeedPlaces, ...primaryPlaces, ...fallbackPlaces],
    12
  );
  const effectiveSelectedLocation = resolveEffectiveSelectedLocation(
    selectedStoreLocation,
    locationOptions
  );
  const effectiveTcgQuery = buildTcgQuery(trimmedQuery, effectiveSelectedLocation);
  const effectivePrimaryPlaces =
    effectiveTcgQuery === initialTcgQuery ? primaryPlaces : await safeSearchPlaces(effectiveTcgQuery);
  const effectiveFallbackPlaces =
    effectiveTcgQuery !== trimmedQuery && effectivePrimaryPlaces.length < 4
      ? await safeSearchPlaces(trimmedQuery)
      : [];

  // Run broader searches in parallel to catch stores that MapKit might not
  // surface for "trading card game store" specifically.
  const locationSuffix = effectiveSelectedLocation ? ` ${effectiveSelectedLocation}` : '';
  const [gameStorePlaces, gameCenterPlaces, hobbyPlaces] = await Promise.all([
    safeSearchPlaces(`${trimmedQuery}${locationSuffix} game store`),
    safeSearchPlaces(`${trimmedQuery}${locationSuffix} game center`),
    safeSearchPlaces(`${trimmedQuery}${locationSuffix} hobby shop`)
  ]);

  const stores = rankStores([
    ...effectivePrimaryPlaces,
    ...effectiveFallbackPlaces,
    ...gameStorePlaces,
    ...gameCenterPlaces,
    ...hobbyPlaces
  ]);
  let feedback = '';
  if (!stores.length) {
    feedback =
      !effectiveSelectedLocation && locationOptions.length > 1
        ? 'Choose a location below, then search again.'
        : 'No gaming stores found for that search. Try a different city or store name.';
  }

  return {
    stores,
    feedback,
    locationOptions,
    effectiveSelectedLocation
  };
}
