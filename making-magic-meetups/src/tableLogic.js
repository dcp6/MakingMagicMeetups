function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function lineTotalForCard(card, quantity) {
  const unitUsd = toFiniteNumber(card?.unitUsd);
  if (unitUsd === null) {
    return null;
  }
  return unitUsd * quantity;
}

function normalizeMarketStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'requesting' || normalized === 'offering' || normalized === 'have') {
    return normalized;
  }
  return 'have';
}

export function sortCardsWithIndex(cards, mode) {
  const pairs = cards.map((card, index) => ({ card, index }));
  if (mode === 'alpha') {
    pairs.sort((a, b) => {
      const left = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
      const right = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
      return left.localeCompare(right);
    });
    return pairs;
  }
  if (mode === 'tcgLowDesc' || mode === 'tcgLowAsc') {
    const direction = mode === 'tcgLowAsc' ? 1 : -1;
    pairs.sort((a, b) => {
      const left = toFiniteNumber(a.card.unitUsd);
      const right = toFiniteNumber(b.card.unitUsd);
      if (left === null && right === null) {
        const leftName = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
        const rightName = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
        return leftName.localeCompare(rightName);
      }
      if (left === null) {
        return 1;
      }
      if (right === null) {
        return -1;
      }
      if (left === right) {
        const leftName = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
        const rightName = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
        return leftName.localeCompare(rightName);
      }
      return direction * (left - right);
    });
    return pairs;
  }
  return pairs;
}

export function buildMyCardsTableModel(cards, sortMode) {
  const sortedPairs = sortCardsWithIndex(cards, sortMode);
  const savedPairs = sortedPairs;
  const requestingPairs = sortedPairs.filter(
    ({ card }) => normalizeMarketStatus(card.marketStatus) === 'requesting'
  );
  const offeringPairs = sortedPairs.filter(
    ({ card }) => normalizeMarketStatus(card.marketStatus) === 'offering'
  );
  const havePairs = sortedPairs.filter(({ card }) => normalizeMarketStatus(card.marketStatus) === 'have');

  const totalsForPairs = (pairs) =>
    pairs.reduce((sum, { card }) => {
      const lineTotal = toFiniteNumber(card.lineTotalUsd);
      return lineTotal === null ? sum : sum + lineTotal;
    }, 0);

  const savedTotal = totalsForPairs(savedPairs);
  const requestingTotal = totalsForPairs(requestingPairs);
  const offeringTotal = totalsForPairs(offeringPairs);
  const haveTotal = totalsForPairs(havePairs);
  const requestingTotalValue = requestingPairs.reduce((sum, { card }) => {
    const quantity = toNonNegativeInt(
      card.askingQuantity === null || card.askingQuantity === undefined ? card.quantity : card.askingQuantity,
      0
    );
    const askingPriceCents = toFiniteNumber(card.askingPriceCents);
    if (askingPriceCents === null || askingPriceCents < 0) {
      return sum;
    }
    return sum + (quantity * askingPriceCents) / 100;
  }, 0);
  const offeringTotalValue = offeringPairs.reduce((sum, { card }) => {
    const quantity = toNonNegativeInt(
      card.askingQuantity === null || card.askingQuantity === undefined ? card.quantity : card.askingQuantity,
      0
    );
    const askingPriceCents = toFiniteNumber(card.askingPriceCents);
    if (askingPriceCents === null || askingPriceCents < 0) {
      return sum;
    }
    return sum + (quantity * askingPriceCents) / 100;
  }, 0);

  const savedQtyTotal = savedPairs.reduce((sum, { card }) => sum + toNonNegativeInt(card.quantity, 0), 0);
  const requestingQtyTotal = requestingPairs.reduce((sum, { card }) => sum + toNonNegativeInt(card.quantity, 0), 0);
  const offeringQtyTotal = offeringPairs.reduce((sum, { card }) => sum + toNonNegativeInt(card.quantity, 0), 0);
  const haveQtyTotal = havePairs.reduce((sum, { card }) => sum + toNonNegativeInt(card.quantity, 0), 0);

  return {
    sortedPairs,
    savedPairs,
    requestingPairs,
    offeringPairs,
    havePairs,
    savedTotal,
    requestingTotal,
    offeringTotal,
    haveTotal,
    requestingTotalValue,
    offeringTotalValue,
    savedQtyTotal,
    requestingQtyTotal,
    offeringQtyTotal,
    haveQtyTotal
  };
}

export function applyQuantityChange(cards, index, nextValue) {
  const quantity = toNonNegativeInt(nextValue, 0);
  return cards.map((card, i) => {
    if (i !== index) {
      return card;
    }
    return {
      ...card,
      quantity,
      lineTotalUsd: lineTotalForCard(card, quantity)
    };
  });
}

export function applyAskingQuantityChange(cards, index, nextValue) {
  const askingQuantity = toNonNegativeInt(nextValue, 0);
  return cards.map((card, i) => {
    if (i !== index) {
      return card;
    }
    return {
      ...card,
      askingQuantity
    };
  });
}
