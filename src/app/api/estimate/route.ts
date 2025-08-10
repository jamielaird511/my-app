// src/app/api/estimate/route.ts
import { NextResponse } from "next/server";

type Payload = { product?: string; price?: number; country?: string; destination?: string };

/* ---------------------- HMRC Trade Tariff lookups ---------------------- */

const TT_BASE = "https://www.trade-tariff.service.gov.uk/uk/api";
const TT_HEADERS = { Accept: "application/vnd.hmrc.2.0+json" };

/** Tiny normalize: lowercase, strip punctuation/extra spaces */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Levenshtein distance + similarity (0..1). */
function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
function sim(a: string, b: string) {
  const d = lev(a, b);
  return 1 - d / Math.max(a.length || 1, b.length || 1);
}

/** Curated aliases → HS codes (mix of 4-digit headings + a few 10-digit). */
const HS_DICT: Array<{ code: string; label: string; aliases: string[] }> = [
  // Apparel
  { code: "6109", label: "T-shirts (knitted)", aliases: ["t shirt", "t-shirt", "tshirt", "tee", "cotton tshirt", "graphic tee"] },
  { code: "6110", label: "Sweaters / pullovers", aliases: ["jumper", "sweater", "pullover", "cardigan", "hoodie"] },
  { code: "6203", label: "Mens suits/jackets/trousers", aliases: ["mens pants", "mens trousers", "mens suit", "blazer"] },
  { code: "6204", label: "Womens suits/dresses/skirts", aliases: ["dress", "skirt", "blouse", "womens suit"] },
  { code: "6104", label: "Womens dresses (knitted)", aliases: ["knit dress", "jersey dress"] },

  // Footwear & accessories
  { code: "6404", label: "Footwear (textile uppers)", aliases: ["shoes", "sneakers", "trainers", "canvas shoes"] },
  { code: "4202", label: "Bags, luggage, cases", aliases: ["backpack", "handbag", "suitcase", "luggage", "wallet"] },
  { code: "4203", label: "Leather apparel & gloves", aliases: ["leather gloves", "leather jacket", "work gloves"] },

  // Electronics
  { code: "8517", label: "Phones & network devices", aliases: ["iphone", "phone", "cellphone", "mobile", "router", "modem"] },
  { code: "8471", label: "Computers & parts", aliases: ["laptop", "pc", "desktop", "notebook computer", "macbook", "ssd", "motherboard"] },
  { code: "8528", label: "Monitors, projectors, TVs", aliases: ["monitor", "projector", "television", "tv screen"] },
  { code: "8518", label: "Speakers & headphones", aliases: ["headphones", "earbuds", "speaker", "soundbar"] },
  { code: "8525", label: "Cameras / camcorders", aliases: ["camera", "digital camera", "action cam", "gopro"] },

  // Toys / sports / leisure
  { code: "9503", label: "Toys", aliases: ["toy", "toys", "lego", "doll", "rc car"] },
  { code: "9506", label: "Sports gear", aliases: ["ball", "yoga mat", "dumbbell", "skateboard", "tennis racket"] },
  { code: "9207", label: "Musical instruments", aliases: ["guitar", "piano keyboard", "violin", "drum"] },

  // Home / kitchen
  { code: "7323", label: "Table/kitchenware (steel)", aliases: ["cookware", "pots", "pans", "steel kettle"] },
  { code: "3924", label: "Table/kitchenware (plastic)", aliases: ["plastic bowl", "tupperware", "measuring cup"] },
  { code: "6912", label: "Ceramic tableware", aliases: ["ceramic mug", "plate", "ceramic bowl"] },
  { code: "9403", label: "Furniture", aliases: ["table", "chair", "desk", "shelf", "cabinet"] },
  { code: "9405", label: "Lamps / lighting", aliases: ["lamp", "light", "chandelier", "led lamp"] },

  // Beauty / personal care
  { code: "3304", label: "Beauty / make-up", aliases: ["makeup", "lipstick", "eyeshadow", "cosmetics"] },
  { code: "3305", label: "Hair preparations", aliases: ["shampoo", "conditioner", "hair gel", "hair dye"] },
  { code: "3307", label: "Other toiletries", aliases: ["deodorant", "perfume", "aftershave", "toiletries"] },

  // Bags / packaging / misc
  { code: "3923", label: "Plastic packaging", aliases: ["plastic bag", "zip bag", "poly mailer", "plastic bottle"] },
  { code: "4819", label: "Paper/board packaging", aliases: ["cardboard box", "paper bag", "mailer box"] },

  // Optical — proven working 10-digit for sunglasses
  { code: "9004100000", label: "Sunglasses", aliases: ["sunglasses", "sunglass", "shades"] },
];

/* ----------------------- HS resolution + enrichment --------------------- */

/**
 * Resolve HS from free text:
 * 1) If user typed digits (>=4), return that.
 * 2) Fuzzy match against curated list.
 * 3) HMRC `/search` fallback.
 */
async function resolveHsFromText(
  input: string
): Promise<{ code?: string; source: "numeric" | "dict" | "hmrc" | "none"; match?: string }> {
  const cleaned = norm(input);
  const digits = input.replace(/[^\d]/g, "");

  // 1) numeric
  if (digits.length >= 4) {
    return { code: digits.length >= 10 ? digits.slice(0, 10) : digits.slice(0, 6), source: "numeric" };
  }

  // 2) dictionary + fuzzy
  let best: { code: string; score: number; alias: string } | null = null;
  for (const item of HS_DICT) {
    for (const alias of item.aliases) {
      const score = sim(cleaned, norm(alias));
      if (!best || score > best.score) best = { code: item.code, score, alias };
    }
  }
  if (best && best.score >= 0.75) {
    return { code: best.code, source: "dict", match: best.alias };
  }

  // 3) HMRC search
  try {
    const url = `${TT_BASE}/search?q=${encodeURIComponent(input)}`;
    const res = await fetch(url, { headers: TT_HEADERS, cache: "no-store" });
    if (res.ok) {
      const json: any = await res.json();
      const flat: Array<{ type: string; id: string }> = [];
      const sections = json?.data ?? [];
      for (const section of sections) {
        const items = section?.attributes?.results ?? [];
        for (const it of items) {
          if (it?.type && it?.id) flat.push({ type: String(it.type), id: String(it.id) });
        }
      }
      const pick =
        flat.find((r) => r.type === "commodity" && /^\d{10}$/.test(r.id)) ??
        flat.find((r) => r.type === "subheading" && /^\d{10}$/.test(r.id)) ??
        flat.find((r) => r.type === "heading" && /^\d{4}$/.test(r.id));
      if (pick) return { code: pick.id, source: "hmrc" };
    }
  } catch {
    // ignore
  }

  return { source: "none" };
}

/**
 * Fetch description for a numeric code via progressive endpoints:
 *  - /commodities/{10}
 *  - /subheadings/{10}-80
 *  - /headings/{4}
 */
async function fetchHsDescriptionIfAny(codeOrProduct: string) {
  const digits = codeOrProduct.replace(/[^\d]/g, "");
  if (!digits) return { hsCode: undefined as string | undefined, description: undefined as string | undefined };

  const attempts: Array<{ code: string; url: string; label: "commodity" | "subheading" | "heading" }> = [];
  if (digits.length >= 10) {
    const c10 = digits.slice(0, 10);
    attempts.push({ code: c10, url: `${TT_BASE}/commodities/${c10}`, label: "commodity" });
    attempts.push({ code: c10, url: `${TT_BASE}/subheadings/${c10}-80`, label: "subheading" });
  }
  if (digits.length >= 4) {
    const h4 = digits.slice(0, 4);
    attempts.push({ code: h4, url: `${TT_BASE}/headings/${h4}`, label: "heading" });
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { headers: TT_HEADERS, cache: "no-store" });
      if (!res.ok) continue;
      const json: any = await res.json();
      const data = Array.isArray(json?.data) ? json.data[0] : json?.data;
      const attrs = data?.attributes ?? {};
      const desc: string | undefined =
        attrs.formatted_description ?? attrs.description_plain ?? attrs.description ?? undefined;
      if (desc) return { hsCode: attempt.code, description: desc };
    } catch {
      // try next
    }
  }

  const fallback =
    (digits.length >= 10 && digits.slice(0, 10)) ||
    (digits.length >= 6 && digits.slice(0, 6)) ||
    (digits.length >= 4 && digits.slice(0, 4)) ||
    undefined;

  return { hsCode: fallback, description: undefined };
}

/* ------------------------------- Rates --------------------------------- */

// DEMO US rates (swap for real USITC/CBP lookup soon)
const DEMO_US_RATES: Record<string, number> = {
  "9004100000": 0.025, // Sunglasses: example US MFN rate ~2.5%
  "6404000000": 0.10,  // Footwear plastics/rubber (example only)
  "8517120000": 0.00,  // Mobile phones often duty-free (example)
};

/* --------------------------- Response builder -------------------------- */

function buildResponse(opts: {
  product: string;
  country: string;
  price: number;
  rate: number;
  hsCode?: string;
  description?: string;
  resolvedFrom?: "numeric" | "dict" | "hmrc" | "none";
  destination: "usa" | "uk" | "eu";
}) {
  const { product, country, price, rate, hsCode, description, resolvedFrom, destination } = opts;
  const duty = +(Math.max(0, price * rate)).toFixed(2);

  const tag =
    resolvedFrom && resolvedFrom !== "numeric"
      ? ` (via ${resolvedFrom === "dict" ? "dictionary" : resolvedFrom.toUpperCase()})`
      : "";

  return {
    duty,
    rate,
    resolution: resolvedFrom ?? "none",
    breakdown: { product, country, price, hsCode, description },
    notes: hsCode
      ? `HS ${hsCode}${description ? ` — ${description}` : ""}${tag}. Destination: ${destination.toUpperCase()}.`
      : `Destination: ${destination.toUpperCase()}. Placeholder ${(rate * 100).toFixed(1)}% rate.`,
  };
}

/* ------------------------------- Handlers ------------------------------ */

export async function POST(req: Request) {
  const body = (await req.json()) as Payload;

  const product = (body.product ?? "").trim();
  const country = (body.country ?? "").trim();
  const price = Number(body.price);
  const destinationRaw = (body.destination ?? "usa").toString().toLowerCase();
  const destination = (["usa", "uk", "eu"].includes(destinationRaw) ? destinationRaw : "usa") as
    | "usa"
    | "uk"
    | "eu";

  if (!product || !country || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { error: "Invalid input. Provide product, country, and non-negative price." },
      { status: 400 }
    );
  }

  // Resolve HS from free text or numeric
  const resolved = await resolveHsFromText(product);
  const codeToDescribe = resolved.code ?? product;
  const { hsCode, description } = await fetchHsDescriptionIfAny(codeToDescribe);

  // Pick a rate based on destination (demo logic; replace with real sources)
  let rate = 0.05; // fallback
  if (destination === "usa") {
    if (hsCode && DEMO_US_RATES[hsCode] !== undefined) rate = DEMO_US_RATES[hsCode];
  } else if (destination === "uk") {
    // Could add a UK rate lookup here (TTS measures). Using fallback for now.
    rate = 0.05;
  } else if (destination === "eu") {
    // Could add TARIC lookup here. Using fallback for now.
    rate = 0.05;
  }

  return NextResponse.json(
    buildResponse({ product, country, price, rate, hsCode, description, resolvedFrom: resolved.source, destination })
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = (searchParams.get("product") ?? "").trim();
  const country = (searchParams.get("country") ?? "").trim();
  const price = Number(searchParams.get("price"));
  const destinationRaw = (searchParams.get("to") ?? "usa").toLowerCase();
  const destination = (["usa", "uk", "eu"].includes(destinationRaw) ? destinationRaw : "usa") as
    | "usa"
    | "uk"
    | "eu";

  if (!product || !country || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { error: "Invalid query. Provide product, country, and non-negative price." },
      { status: 400 }
    );
  }

  const resolved = await resolveHsFromText(product);
  const codeToDescribe = resolved.code ?? product;
  const { hsCode, description } = await fetchHsDescriptionIfAny(codeToDescribe);

  let rate = 0.05;
  if (destination === "usa") {
    if (hsCode && DEMO_US_RATES[hsCode] !== undefined) rate = DEMO_US_RATES[hsCode];
  } else if (destination === "uk") {
    rate = 0.05;
  } else if (destination === "eu") {
    rate = 0.05;
  }

  return NextResponse.json(
    buildResponse({ product, country, price, rate, hsCode, description, resolvedFrom: resolved.source, destination })
  );
}
