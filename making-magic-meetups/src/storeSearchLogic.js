const tcgHintRegex =
  /\b(mtg|magic|trading\s*card|trading\s*cards|tcg|card\s*shop|game\s*store|collectibles?|hobby)\b/i;

export function buildTcgQuery(query, selectedStoreLocation) {
  const baseQuery = String(query || '').trim();
  const locationSuffix = selectedStoreLocation ? ` ${selectedStoreLocation}` : '';
  if (tcgHintRegex.test(baseQuery)) {
    return `${baseQuery}${locationSuffix}`.trim();
  }
  return `${baseQuery}${locationSuffix} trading card store`.trim();
}

export function scoreStorePlace(place) {
  const name = String(place?.name || '').toLowerCase();
  const address = String(place?.formattedAddress || place?.address || '').toLowerCase();
  const subtitle = String(place?.subtitle || '').toLowerCase();
  const category = String(
    place?.pointOfInterestCategory || place?.poiCategory || place?.category || ''
  ).toLowerCase();
  const categoryList = Array.isArray(place?.pointOfInterestCategories)
    ? place.pointOfInterestCategories.map((value) => String(value || '').toLowerCase()).join(' ')
    : '';

  const text = [name, address, subtitle, category, categoryList].join(' ');
  let score = 0;
  if (/\b(mtg|magic the gathering|magic: the gathering)\b/.test(text)) {
    score += 10;
  }
  if (/\b(trading\s*card|trading\s*cards|tcg|card\s*shop)\b/.test(text)) {
    score += 8;
  }
  if (/\b(game\s*store|board\s*game|comic|hobby|collectibles?)\b/.test(text)) {
    score += 4;
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
  // A result is an actual store (not a city/area) when it has a POI category,
  // a phone number, or a non-zero TCG relevance score.
  const hasPoiCategory = Boolean(
    place?.pointOfInterestCategory || place?.poiCategory || place?.category
  );
  const isActualStore = relevanceScore > 0 || hasPoiCategory || Boolean(phone);
  return {
    placeId,
    name,
    address,
    url,
    website,
    phone,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    isActualStore,
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

  const scoredStores = dedupedPlaces.map(mapPlaceToStore);
  // Always keep all deduped results; prioritize TCG-relevant stores first
  // without dropping same-name branches that may have sparse category metadata.
  return scoredStores
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
  const stores = rankStores([...effectivePrimaryPlaces, ...effectiveFallbackPlaces]);
  let feedback = '';
  if (!stores.length) {
    feedback =
      !effectiveSelectedLocation && locationOptions.length > 1
        ? 'Choose a location below, then search again.'
        : 'No trading card stores found for that search. Try another location.';
  }

  return {
    stores,
    feedback,
    locationOptions,
    effectiveSelectedLocation
  };
}
