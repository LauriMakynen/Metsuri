import type { BidSummary, MarkingType, Pricing } from '../types';

// Options the owner picks from when publishing a work request
export const PRICING_OPTIONS: { value: Pricing; title: string; description: string }[] = [
  {
    value: 'owner_receives',
    title: '💰 Puukauppa',
    description: 'Ostaja maksaa minulle puusta – korkein tarjous on paras',
  },
  {
    value: 'owner_pays',
    title: '🧾 Palvelutyö',
    description: 'Minä maksan tekijälle – edullisin tarjous on paras',
  },
];

// Usual choice for each work type, shown as a hint (the owner still has to choose)
export function suggestedPricing(type: MarkingType): Pricing {
  return type === 'avohakkuu' || type === 'harvennus' ? 'owner_receives' : 'owner_pays';
}

const EUR = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatEur(amount: number): string {
  return EUR.format(amount);
}

// Which offer counts as best depends on who pays
export const BEST_BID_LABEL: Record<Pricing, string> = {
  owner_receives: 'Korkein tarjous',
  owner_pays: 'Edullisin tarjous',
};

export const PRICING_HINT: Record<Pricing, string> = {
  owner_receives: 'Puukauppa – tarjoa hinta, jonka maksat metsänomistajalle puusta.',
  owner_pays: 'Palvelutyö – tarjoa hinta, jolla teet työn.',
};

/** "Korkein tarjous 19 200 € · 2 tarjousta", or a no-offers text. */
export function bidSummaryText(summary: BidSummary): string {
  if (!summary.bid_count || summary.best_bid_eur === null) return 'Ei vielä tarjouksia';
  const count = summary.bid_count === 1 ? '1 tarjous' : `${summary.bid_count} tarjousta`;
  return `${BEST_BID_LABEL[summary.pricing]} ${formatEur(summary.best_bid_eur)} · ${count}`;
}
