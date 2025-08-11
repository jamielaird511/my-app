# My App — US Duty Estimator

[![Run Jest Tests](https://github.com/jamielaird511/my-app/actions/workflows/test.yml/badge.svg)](https://github.com/jamielaird511/my-app/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/jamielaird511/my-app/branch/main/graph/badge.svg)](https://codecov.io/gh/jamielaird511/my-app)

A Next.js app that estimates US import duty from product keywords or HS codes.  
Server-side it queries the **USITC HTS REST API** and falls back to a local dictionary for coverage.  
Specific/compound duties (e.g., $/kg, $/pair) are parsed and combined with ad-valorem rates.

---

## Features

- 🔎 Keyword + HS6/8/10 lookup (USITC `/search` and `/exportList`)
- 🇺🇸 “General rate of duty” parsing:
  - Percent (ad valorem), $/kg, $/lb, $/g → normalized to kg
  - $/pair, $/doz. pr. (→ per pair ÷ 12), `/dozen`, `/gross` (÷ 144), `¢`/unit
  - Compound lines (percent + specific components)
- 🧮 Duty calculation on **total declared value** (price × quantity) plus specific components
- ✅ Unit tests (Jest) + CI (GitHub Actions) + coverage (Codecov)
- 🔁 Graceful fallback to local `hsDict` when HTS is empty/ambiguous

---

## Quick start

```bash
# 1) Install
npm install

# 2) Dev server
npm run dev
# open http://localhost:3000

# 3) Tests
npm test
# or with coverage:
npm test -- --coverage
{
  "product": "sunglasses or HS code",
  "country": "china",
  "price": 50,
  "qty": 10,          // optional (units/pairs)
  "weightKg": 2.5     // optional (total shipment weight)
}
{
  "duty": 10.0,
  "rate": 0.02,
  "rateType": "compound",
  "components": [
    { "kind": "pct", "value": 0.02 },
    { "kind": "amount", "value": 1, "per": "kg" }
  ],
  "resolution": "hts",
  "breakdown": {
    "product": "sunglasses",
    "country": "china",
    "price": 50,
    "hsCode": "9004100000",
    "hsCodeFormatted": "9004.10.0000",
    "description": "Sunglasses",
    "qty": 10,
    "weightKg": 2.5
  },
  "alternates": [
    { "hsCode": "9004100000", "hsCodeFormatted": "9004.10.0000", "description": "Sunglasses", "rate": 0.02, "rateType": "advalorem" }
  ],
  "notes": [
    "This line includes specific or compound duties. Provide quantity and/or weight (kg) for the most accurate total."
  ]
}
src/
  app/
    api/estimate/route.ts     # API: HTS lookup + fallback + duty calc
    estimate/page.tsx         # UI: Duty estimator form + results
  lib/
    duty.ts                   # Parser + calculator (exported for tests)
    hsDict.ts                 # Local fallback dictionary
npm test
npm run test:watch
npm test -- --coverage
coverageThreshold: {
  global: { branches: 40, functions: 50, lines: 50, statements: 50 }
}

If you want a super-short “How to contribute” section or a changelog stub, say the word and I’ll drop those in too.
::contentReference[oaicite:0]{index=0}
```
