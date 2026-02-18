import { describe, expect, it, vi } from 'vitest';
import {
  buildTcgQuery,
  deriveLocationOptions,
  rankStores,
  resolveEffectiveSelectedLocation,
  runStoreSearch
} from './storeSearchLogic';

describe('storeSearchLogic', () => {
  it('continues searching stores even if location-seed lookup fails', async () => {
    let callCount = 0;
    const searchPlaces = vi.fn().mockImplementation(async (searchText) => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('seed failed');
      }
      if (/card shop|trading card store|austin/i.test(String(searchText || ''))) {
        return [
          {
            placeId: 'p1',
            name: 'Card Vault',
            formattedAddress: '123 Main St, Austin, TX',
            pointOfInterestCategory: 'hobby',
            coordinate: { latitude: 30.2, longitude: -97.7 }
          }
        ];
      }
      return [];
    });

    const result = await runStoreSearch({
      query: 'card shop',
      selectedStoreLocation: '',
      searchPlaces
    });

    expect(searchPlaces).toHaveBeenCalled();
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0].name).toBe('Card Vault');
  });

  it('clears stale selected location when it is not present in current options', () => {
    const options = ['Seattle, WA', 'Portland, OR'];
    expect(resolveEffectiveSelectedLocation('Austin, TX', options)).toBe('');
  });

  it('keeps selected location when it still matches current options', () => {
    const options = ['Seattle, WA', 'Portland, OR'];
    expect(resolveEffectiveSelectedLocation('Seattle, WA', options)).toBe('Seattle, WA');
  });

  it('extracts unique location options from map places', () => {
    const places = [
      { formattedAddress: '123 Main St, Seattle, WA' },
      { formattedAddress: '456 Pine St, Seattle, WA' },
      { formattedAddress: '789 NW Ave, Portland, OR' }
    ];
    expect(deriveLocationOptions(places)).toEqual(['Seattle, WA', 'Portland, OR']);
  });

  it('adds trading-card qualifier when query lacks TCG hints', () => {
    expect(buildTcgQuery('game stores near me', '')).toBe('game stores near me trading card store');
    expect(buildTcgQuery('mtg store', 'Seattle, WA')).toBe('mtg store Seattle, WA');
  });

  it('ranks TCG-relevant stores first and dedupes by place id', () => {
    const ranked = rankStores([
      {
        placeId: 'a',
        name: 'Generic Cafe',
        formattedAddress: '100 Coffee Ave, Seattle, WA',
        pointOfInterestCategory: 'restaurant'
      },
      {
        placeId: 'b',
        name: 'Magic Card Castle',
        formattedAddress: '200 Card Blvd, Seattle, WA',
        pointOfInterestCategory: 'hobby'
      },
      {
        placeId: 'b',
        name: 'Magic Card Castle Duplicate',
        formattedAddress: '200 Card Blvd, Seattle, WA',
        pointOfInterestCategory: 'hobby'
      }
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].name).toBe('Magic Card Castle');
  });

  it('keeps same-name stores when they are in different zip codes', () => {
    const ranked = rankStores([
      {
        name: 'Card Kingdom',
        formattedAddress: '123 Main St, Seattle, WA 98101',
        pointOfInterestCategory: 'hobby',
        coordinate: { latitude: 47.61, longitude: -122.33 }
      },
      {
        name: 'Card Kingdom',
        formattedAddress: '555 South St, Seattle, WA 98134',
        pointOfInterestCategory: 'hobby',
        coordinate: { latitude: 47.58, longitude: -122.33 }
      }
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].name).toBe('Card Kingdom');
    expect(ranked[1].name).toBe('Card Kingdom');
  });

  it('keeps zero-score branches when another same-name branch scores higher', () => {
    const ranked = rankStores([
      {
        name: 'Mox Boarding House',
        formattedAddress: '123 Main St, Seattle, WA 98101',
        pointOfInterestCategory: 'hobby',
        coordinate: { latitude: 47.61, longitude: -122.33 }
      },
      {
        name: 'Mox Boarding House',
        formattedAddress: '555 South St, Bellevue, WA 98004',
        pointOfInterestCategory: '',
        coordinate: { latitude: 47.62, longitude: -122.20 }
      },
      {
        name: 'Mox Boarding House',
        formattedAddress: '777 East St, Portland, OR 97204',
        pointOfInterestCategory: '',
        coordinate: { latitude: 45.52, longitude: -122.67 }
      }
    ]);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].name).toBe('Mox Boarding House');
    expect(ranked[1].name).toBe('Mox Boarding House');
    expect(ranked[2].name).toBe('Mox Boarding House');
  });

  it('keeps branches with same placeId when address differs', () => {
    const ranked = rankStores([
      {
        placeId: 'shared-place-id',
        name: 'Mox Boarding House',
        formattedAddress: '5105 Leary Ave NW, Seattle, WA 98107',
        pointOfInterestCategory: 'hobby',
        coordinate: { latitude: 47.665, longitude: -122.381 }
      },
      {
        placeId: 'shared-place-id',
        name: 'Mox Boarding House',
        formattedAddress: '13310 Bel-Red Rd, Bellevue, WA 98005',
        pointOfInterestCategory: 'hobby',
        coordinate: { latitude: 47.622, longitude: -122.164 }
      }
    ]);

    expect(ranked).toHaveLength(2);
  });

  it('derives location options from returned store results when seed options are sparse', async () => {
    const searchPlaces = vi
      .fn()
      .mockResolvedValueOnce([{ name: 'Card Kingdom', formattedAddress: 'Seattle, WA' }])
      .mockResolvedValueOnce([
        {
          name: 'Card Kingdom',
          formattedAddress: '123 Main St, Seattle, WA 98101',
          pointOfInterestCategory: 'hobby'
        },
        {
          name: 'Card Kingdom',
          formattedAddress: '555 South St, Seattle, WA 98134',
          pointOfInterestCategory: 'hobby'
        }
      ]);

    const result = await runStoreSearch({
      query: 'Card Kingdom',
      selectedStoreLocation: '',
      searchPlaces
    });

    expect(result.locationOptions).toContain('Seattle, WA 98101');
    expect(result.locationOptions).toContain('Seattle, WA 98134');
  });
});
