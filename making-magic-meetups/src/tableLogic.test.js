import { describe, expect, it } from 'vitest';
import {
  applyAskingQuantityChange,
  applyQuantityChange,
  buildMyCardsTableModel,
  sortCardsWithIndex
} from './tableLogic';

describe('tableLogic interactivity', () => {
  it('keeps row and allows setting quantity to zero', () => {
    const cards = [
      { resolvedName: 'Card A', quantity: 2, unitUsd: 1.25, lineTotalUsd: 2.5, requesting: false },
      { resolvedName: 'Card B', quantity: 1, unitUsd: 3.0, lineTotalUsd: 3.0, requesting: true }
    ];

    const next = applyQuantityChange(cards, 0, '0');
    expect(next).toHaveLength(2);
    expect(next[0].quantity).toBe(0);
    expect(next[0].lineTotalUsd).toBe(0);
    expect(next[1].quantity).toBe(1);
  });

  it('does not couple asking quantity to qty and allows larger ask quantity', () => {
    const cards = [{ resolvedName: 'Card A', quantity: 1, askingQuantity: 1, requesting: true }];
    const next = applyAskingQuantityChange(cards, 0, '9');
    expect(next[0].quantity).toBe(1);
    expect(next[0].askingQuantity).toBe(9);
  });

  it('calculates requesting total value from ask quantity * asking price', () => {
    const cards = [
      {
        resolvedName: 'Card A',
        quantity: 1,
        requesting: true,
        lineTotalUsd: 2.0,
        askingQuantity: 3,
        askingPriceCents: 250
      },
      {
        resolvedName: 'Card B',
        quantity: 2,
        requesting: false,
        lineTotalUsd: 4.0,
        askingQuantity: 2,
        askingPriceCents: 100
      }
    ];

    const model = buildMyCardsTableModel(cards, 'upload');
    expect(model.savedTotal).toBe(4.0);
    expect(model.requestingTotal).toBe(2.0);
    expect(model.requestingTotalValue).toBe(7.5);
    expect(model.savedQtyTotal).toBe(2);
    expect(model.requestingQtyTotal).toBe(1);
  });

  it('sorts by tcg low descending and falls back to name', () => {
    const cards = [
      { resolvedName: 'Beta', unitUsd: 1.0 },
      { resolvedName: 'Alpha', unitUsd: 1.0 },
      { resolvedName: 'Gamma', unitUsd: null }
    ];
    const pairs = sortCardsWithIndex(cards, 'tcgLowDesc');
    expect(pairs[0].card.resolvedName).toBe('Alpha');
    expect(pairs[1].card.resolvedName).toBe('Beta');
    expect(pairs[2].card.resolvedName).toBe('Gamma');
  });
});
