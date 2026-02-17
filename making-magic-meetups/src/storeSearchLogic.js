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
  return locationOptions.includes(selected) ? selected : '';
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
  return {
    placeId,
    name,
    address,
    url,
    website,
    phone,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    _relevanceScore: scoreStorePlace(place)
  };
}

export function rankStores(places, limit = 10) {
  const dedupedPlaces = [];
  const seenPlaceKeys = new Set();
  for (const place of places) {
    const placeId = place?.placeId || place?.identifier || place?.id || null;
    const name = String(place?.name || '').trim();
    const dedupeKey = String(placeId || name || '').toLowerCase();
    if (!dedupeKey || seenPlaceKeys.has(dedupeKey)) {
      continue;
    }
    seenPlaceKeys.add(dedupeKey);
    dedupedPlaces.push(place);
  }

  const scoredStores = dedupedPlaces.map(mapPlaceToStore);
  const tcgStores = scoredStores
    .filter((store) => store._relevanceScore > 0)
    .sort((a, b) => b._relevanceScore - a._relevanceScore);

  return (tcgStores.length ? tcgStores : scoredStores)
    .sort((a, b) => b._relevanceScore - a._relevanceScore)
    .slice(0, limit)
    .map((store) => {
      const { _relevanceScore, ...rest } = store;
      return rest;
    });
}

export async function runStoreSearch({ query, selectedStoreLocation, searchPlaces }) {
  const trimmedQuery = String(query || '').trim();

  let locationSeedPlaces = [];
  try {
    locationSeedPlaces = await searchPlaces(trimmedQuery);
  } catch (_error) {
    locationSeedPlaces = [];
  }

  const locationOptions = deriveLocationOptions(locationSeedPlaces);
  const effectiveSelectedLocation = resolveEffectiveSelectedLocation(
    selectedStoreLocation,
    locationOptions
  );
  const tcgQuery = buildTcgQuery(trimmedQuery, effectiveSelectedLocation);

  const primaryPlaces = await searchPlaces(tcgQuery);
  const fallbackPlaces =
    tcgQuery !== trimmedQuery && primaryPlaces.length < 4 ? await searchPlaces(trimmedQuery) : [];
  const stores = rankStores([...primaryPlaces, ...fallbackPlaces]);

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
