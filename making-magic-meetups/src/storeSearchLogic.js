const tcgHintRegex =
  /\b(mtg|magic|trading\s*card|trading\s*cards|tcg|card\s*shop|game\s*store|game\s*shop|game\s*center|game\s*zone|gaming|collectibles?|hobby|tabletop|warhammer|pokemon)\b/i;

export function buildTcgQuery(query, selectedStoreLocation) {
  const baseQuery = String(query || '').trim();
  const locationSuffix = selectedStoreLocation ? ` ${selectedStoreLocation}` : '';
  if (tcgHintRegex.test(baseQuery)) {
    return `${baseQuery}${locationSuffix}`.trim();
  }
  return `${baseQuery}${locationSuffix} trading card game store`.trim();
}

// Returns true when a place has a street address containing digits.
// Geographic entities (cities, counties, states) typically have no street number,
// so this distinguishes real businesses from area-level results.
function hasStreetAddress(place) {
  const address = String(place?.formattedAddress || place?.address || '').trim();
  return address.length > 0 && /\d/.test(address);
}

// Returns true if a place's coordinates fall within the Americas or Europe.
// Places with no coordinate are allowed through (can't be verified, don't penalise).
export function isInAmericaOrEurope(place) {
  const lat = Number(place?.coordinate?.latitude);
  const lon = Number(place?.coordinate?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return true; // no coords — let the result through
  }
  // Americas: continental US, Alaska, Hawaii, Canada, Mexico, Caribbean
  const inAmericas = lat >= 14 && lat <= 72 && lon >= -168 && lon <= -52;
  // Europe: Iceland east through Turkey/Russia's western edge, north Africa not included
  const inEurope = lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45;
  return inAmericas || inEurope;
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

  // Debug: log every candidate and whether it passed the gaming-store filter.
  console.log(
    '[rankStores] raw candidates:',
    dedupedPlaces.map((p) => ({
      name: p?.name,
      category: p?.pointOfInterestCategory ?? p?.poiCategory ?? p?.category ?? undefined,
      passed: isTaggedAsGamingStore(p)
    }))
  );

  return dedupedPlaces
    .filter((place) => {
      // Direct results (from the user's raw query) pass if they look like a real
      // business — either gaming-tagged OR has a real street address.
      // This catches stores found by address/name that MapKit doesn't tag as gaming.
      // Gaming-search results still require the stricter gaming-store check.
      const passesGaming = isTaggedAsGamingStore(place);
      const passesDirect = place._directResult && hasStreetAddress(place);
      return (passesGaming || passesDirect) && isInAmericaOrEurope(place);
    })
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

  // searchPlaces optionally accepts { coordinate } as a second arg so MapKit
  // can anchor results to the searched city rather than the user's device location.
  async function safeSearchPlaces(searchText, opts = {}) {
    try {
      const result = await searchPlaces(searchText, opts);
      return Array.isArray(result) ? result : [];
    } catch (_error) {
      return [];
    }
  }

  // Seed search (no anchor) — used to derive location options, a geographic
  // anchor coordinate, AND as direct results when the user searched by
  // address or store name. Marked so rankStores applies the relaxed filter.
  const locationSeedPlacesRaw = await safeSearchPlaces(trimmedQuery);
  const locationSeedPlaces = locationSeedPlacesRaw.map((p) => ({ ...p, _directResult: true }));

  // Extract a coordinate from the first seed result so downstream searches
  // are anchored to the searched city, not the user's device location.
  const seedCoord = locationSeedPlaces[0]?.coordinate ?? null;

  const initialTcgQuery = buildTcgQuery(trimmedQuery, selectedStoreLocation);
  const primaryPlaces = await safeSearchPlaces(initialTcgQuery, { coordinate: seedCoord });
  const fallbackPlaces =
    initialTcgQuery !== trimmedQuery && primaryPlaces.length < 4
      ? await safeSearchPlaces(trimmedQuery, { coordinate: seedCoord })
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
    effectiveTcgQuery === initialTcgQuery
      ? primaryPlaces
      : await safeSearchPlaces(effectiveTcgQuery, { coordinate: seedCoord });
  const effectiveFallbackPlaces =
    effectiveTcgQuery !== trimmedQuery && effectivePrimaryPlaces.length < 4
      ? await safeSearchPlaces(trimmedQuery, { coordinate: seedCoord })
      : [];

  // Run broader searches in parallel to catch stores that MapKit might not
  // surface for "trading card game store" specifically.
  const locationSuffix = effectiveSelectedLocation ? ` ${effectiveSelectedLocation}` : '';
  const q = (suffix) => `${trimmedQuery}${locationSuffix} ${suffix}`;
  const [
    gameStorePlaces,
    gameCenterPlaces,
    hobbyPlaces,
    gamingPlaces,
    tcgPlaces,
    cardShopPlaces
  ] = await Promise.all([
    safeSearchPlaces(q('game store'), { coordinate: seedCoord }),
    safeSearchPlaces(q('game center'), { coordinate: seedCoord }),
    safeSearchPlaces(q('hobby shop'), { coordinate: seedCoord }),
    safeSearchPlaces(q('gaming'), { coordinate: seedCoord }),
    safeSearchPlaces(q('tcg'), { coordinate: seedCoord }),
    safeSearchPlaces(q('card shop'), { coordinate: seedCoord })
  ]);

  // Debug: log names from each parallel search so we can trace missing stores.
  console.log('[runStoreSearch] game store:', gameStorePlaces.map((p) => p?.name));
  console.log('[runStoreSearch] game center:', gameCenterPlaces.map((p) => p?.name));
  console.log('[runStoreSearch] hobby shop:', hobbyPlaces.map((p) => p?.name));
  console.log('[runStoreSearch] gaming:', gamingPlaces.map((p) => p?.name));
  console.log('[runStoreSearch] tcg:', tcgPlaces.map((p) => p?.name));
  console.log('[runStoreSearch] card shop:', cardShopPlaces.map((p) => p?.name));

  const stores = rankStores(
    [
      ...locationSeedPlaces,       // Direct query results — relaxed filter inside rankStores
      ...effectivePrimaryPlaces,
      ...effectiveFallbackPlaces,
      ...gameStorePlaces,
      ...gameCenterPlaces,
      ...hobbyPlaces,
      ...gamingPlaces,
      ...tcgPlaces,
      ...cardShopPlaces
    ],
    10
  );
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
