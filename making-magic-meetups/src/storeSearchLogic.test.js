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
    const searchPlaces = vi
      .fn()
      .mockRejectedValueOnce(new Error('seed failed'))
      .mockResolvedValueOnce([
        {
          placeId: 'p1',
          name: 'Card Vault',
          formattedAddress: '123 Main St, Austin, TX',
          pointOfInterestCategory: 'hobby',
          coordinate: { latitude: 30.2, longitude: -97.7 }
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await runStoreSearch({
      query: 'card shop',
      selectedStoreLocation: '',
      searchPlaces
    });

    expect(searchPlaces).toHaveBeenCalledTimes(2);
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

    expect(ranked).toHaveLength(1);
    expect(ranked[0].name).toBe('Magic Card Castle');
  });
});
