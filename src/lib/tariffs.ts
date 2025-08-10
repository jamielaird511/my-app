// src/lib/tariffs.ts
export type Tariff = {
  hsCode: string;
  description: string;
  // ad valorem rate (e.g. 0.05 = 5%)
  rate: number;
  // optional country overrides (e.g. trade agreements, safeguards)
  byCountry?: Record<string, number>;
};

// Minimal starter set — add more as you go.
export const TARIFFS: Tariff[] = [
  {
    hsCode: "9004.10",
    description: "Sunglasses",
    rate: 0.05,
    byCountry: { china: 0.07 }, // example: surcharge for CN
  },
  {
    hsCode: "6109.10",
    description: "T-shirts, cotton",
    rate: 0.12,
  },
  {
    hsCode: "6403.99",
    description: "Leather footwear",
    rate: 0.08,
  },
  {
    hsCode: "9503.00",
    description: "Toys",
    rate: 0.0,
  },
  {
    hsCode: "8517.12",
    description: "Smartphones",
    rate: 0.0,
  },
];

// ultra-simple keyword matcher (you can evolve this later)
const KEYWORDS: Record<string, string> = {
  sunglasses: "9004.10",
  shades: "9004.10",
  tshirt: "6109.10",
  "t-shirt": "6109.10",
  shirt: "6109.10",
  shoe: "6403.99",
  shoes: "6403.99",
  sneaker: "6403.99",
  toy: "9503.00",
  phone: "8517.12",
  smartphone: "8517.12",
};

export function lookupTariff(product: string, country: string) {
  const p = product.toLowerCase().trim();
  const c = country.toLowerCase().trim();

  // If the user types an HS code directly, honor it
  const maybeHs = p.replace(/[^\d.]/g, "");
  const direct = TARIFFS.find(t => t.hsCode === maybeHs);
  if (direct) {
    const rate = direct.byCountry?.[c] ?? direct.rate;
    return { ...direct, rate };
  }

  // Keyword → HS code
  for (const [kw, hs] of Object.entries(KEYWORDS)) {
    if (p.includes(kw)) {
      const t = TARIFFS.find(x => x.hsCode === hs)!;
      const rate = t.byCountry?.[c] ?? t.rate;
      return { ...t, rate };
    }
  }

  // Fallback
  return {
    hsCode: "0000.00",
    description: "Unclassified",
    rate: 0.05, // safe default
  };
}
