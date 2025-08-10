// src/app/api/estimate/route.ts
import { NextResponse } from "next/server";

/* =========================
   Types
========================= */

type Destination = "usa" | "uk" | "eu";
type ResolvedSource = "numeric" | "dict" | "none";

type Resolution =
  | "numeric"     // numeric HS (6 or 10) provided by user
  | "dictionary"  // matched via alias → 10-digit or other precise mapping
  | "general-6"   // matched via alias or numeric but only 6-digit (general)
  | "none";       // we couldn't resolve

type BuildResponseArgs = {
  product: string;
  country: string;
  price: number;
  rate: number;
  hsCode?: string;
  description?: string;
  resolvedFrom: ResolvedSource;
  destination: Destination;
  granularity?: "10" | "6" | "none";
};

/* =========================
   Curated HS alias dictionary (mostly 6-digit for portability)
========================= */

// Replace your HS_DICT with this
const HS_DICT: Array<{ code: string; label: string; aliases: string[] }> = [
  /* =========================
     APPAREL
  ========================= */
  { code: "6109", label: "T-shirts (knitted)", aliases: [
    "tshirt","t shirt","t-shirt","tee","graphic tee","crew neck tee","v neck tee",
    "mens tshirt","womens tshirt","kids tshirt","printed tee"
  ]},
  { code: "6110", label: "Sweaters / pullovers / hoodies (knit)", aliases: [
    "sweater","pullover","jumper","hoodie","zip hoodie","cardigan","fleece","crew sweater","knit sweater"
  ]},
  { code: "6103", label: "Men’s coats/jackets (knit)", aliases: [
    "mens jacket","mens coat","knit jacket","track jacket","zip jacket"
  ]},
  { code: "6104", label: "Women’s coats/jackets (knit)", aliases: [
    "womens jacket","ladies jacket","ladies coat","knit jacket women"
  ]},
  { code: "6102", label: "Women’s suits/ensembles (knit)", aliases: [
    "womens suit","ladies suit","knit suit women","co-ord knit"
  ]},
  { code: "6105", label: "Men’s shirts (knit)", aliases: [
    "mens polo","mens knit shirt","polo shirt","polo"
  ]},
  { code: "6203", label: "Men’s suits/trousers (woven)", aliases: [
    "mens trousers","mens pants","mens chinos","mens suit","mens blazer","men suit set"
  ]},
  { code: "6204", label: "Women’s suits/trousers (woven)", aliases: [
    "womens trousers","ladies pants","ladies chinos","womens suit","women blazer"
  ]},
  { code: "6112", label: "Tracksuits & activewear (knit)", aliases: [
    "tracksuit","track pants","joggers","yoga pants","gym leggings","running tights","sweatpants"
  ]},
  { code: "6505", label: "Hats & caps (knit or textile)", aliases: [
    "cap","baseball cap","beanie","knit hat","bucket hat","snapback"
  ]},

  /* =========================
     FOOTWEAR
  ========================= */
  { code: "6404", label: "Footwear with textile uppers", aliases: [
    "shoes","sneakers","trainers","canvas shoes","running shoes","gym shoes","runners","athletic shoes"
  ]},
  { code: "6403", label: "Footwear with leather uppers", aliases: [
    "leather shoes","oxfords","loafers","derby shoes","dress shoes","leather boots"
  ]},
  { code: "6402", label: "Footwear with rubber/plastic uppers", aliases: [
    "rubber shoes","plastic shoes","clogs","slides","flip flops","sandals","water shoes","beach sandals"
  ]},
  { code: "6401", label: "Waterproof footwear (rubber/plastic)", aliases: [
    "rain boots","wellies","galoshes","waterproof boots"
  ]},
  { code: "6405", label: "Other footwear", aliases: [
    "house slippers","ballet flats","espadrilles","other shoes"
  ]},

  /* =========================
     ELECTRONICS
  ========================= */
  { code: "847130", label: "Portable computers (laptops/tablets)", aliases: [
    "laptop","notebook","macbook","chromebook","tablet pc","ultrabook"
  ]},
  { code: "847150", label: "Computer processing units", aliases: [
    "desktop pc","computer tower","mini pc","pc barebone","cpu unit"
  ]},
  { code: "851762", label: "Networking equipment (routers/switches)", aliases: [
    "wifi router","router","mesh router","network switch","ethernet switch","access point"
  ]},
  { code: "851810", label: "Microphones", aliases: [
    "microphone","usb mic","podcast mic","condenser mic","dynamic mic","lapel mic"
  ]},
  { code: "851830", label: "Headphones/earphones", aliases: [
    "headphones","earbuds","earphones","headset","wireless earbuds","gaming headset"
  ]},
  { code: "852852", label: "Monitors (LCD/LED)", aliases: [
    "monitor","pc monitor","gaming monitor","lcd monitor","led monitor","display"
  ]},
  { code: "850760", label: "Lithium-ion batteries", aliases: [
    "lithium battery","li-ion battery","phone battery","power bank","rechargeable battery"
  ]},

  /* =========================
     BAGS & ACCESSORIES
  ========================= */
  { code: "4202", label: "Bags, luggage, cases", aliases: [
    "backpack","handbag","purse","sling bag","tote bag","duffel bag","suitcase","carry on","briefcase",
    "wallet","card holder","camera bag","cosmetic bag","makeup bag","pouch"
  ]},
  { code: "4203", label: "Leather apparel & accessories", aliases: [
    "leather belt","leather gloves","leather jacket","belt","gloves (leather)"
  ]},
  { code: "6117", label: "Other made-up clothing accessories (knit)", aliases: [
    "scarves","knit scarf","knit gloves","arm warmers","leg warmers","knit accessories"
  ]},

  /* =========================
     KITCHENWARE & HOME
  ========================= */
  { code: "3924", label: "Table/kitchenware (plastic)", aliases: [
    "plastic bowl","food container","tupperware","measuring cup","plastic plate","storage container"
  ]},
  { code: "7013", label: "Glassware (table/kitchen)", aliases: [
    "wine glass","drinking glass","glass cup","glass tumbler","glass jar","vase (table)"
  ]},
  { code: "7323", label: "Table/kitchenware (steel)", aliases: [
    "stainless bowl","steel pot","steel pan","cutlery","utensils","kitchen utensils","steel strainer"
  ]},
  { code: "7615", label: "Table/kitchenware (aluminium)", aliases: [
    "aluminium pot","aluminum pan","aluminium tray","aluminum tray","aluminium kettle"
  ]},
  { code: "6912", label: "Ceramic table/kitchenware", aliases: [
    "ceramic mug","ceramic plate","porcelain bowl","stoneware cup","ceramic dinnerware"
  ]},

  /* =========================
     SPORTING GOODS
  ========================= */
  { code: "9506", label: "Sports equipment (general)", aliases: [
    "fitness equipment","dumbbells","kettlebell","yoga mat","exercise band","basketball","football",
    "tennis racket","skates","helmets (sport)","sports gear"
  ]},
  { code: "9507", label: "Fishing rods/tackle", aliases: [
    "fishing rod","fishing reel","fishing tackle","lure","rod and reel"
  ]},

  /* =========================
     OPTIONAL CATEGORIES (Tools / Toys / Jewellery)
     — include if you want broader coverage now
  ========================= */
  { code: "8205", label: "Hand tools (spanners, pliers, etc.)", aliases: [
    "hand tools","wrench","spanner","pliers","hammer","screwdriver set","multi tool"
  ]},
  { code: "9503", label: "Toys", aliases: [
    "toy","plush toy","doll","action figure","lego","building blocks","kids toy","rc car"
  ]},
  { code: "7117", label: "Imitation jewellery", aliases: [
    "fashion jewelry","costume jewelry","bracelet","necklace","earrings","anklet"
  ]},
  { code: "7113", label: "Articles of jewellery (precious metal)", aliases: [
    "gold ring","silver necklace","gold bracelet","fine jewelry","wedding ring"
  ]},

  /* =========================
     OPTICAL (demo 10-digit intact)
  ========================= */
  { code: "9004100000", label: "Sunglasses", aliases: [
    "sunglasses","sunglass","shades"
  ]},
  { code: "900410", label: "Sunglasses (general)", aliases: [
    "sunglasses 6 digit","sunglasses hs"
  ]},
];

/* =========================
   Demo US duty rates by 6-digit
   (Real product-level rates are 8–10 digits; this is only to make the app feel tangible.)
========================= */

const DEMO_US_RATES_BY6: Record<string, number> = {
  "6404": 0.12, // shoes (textile uppers) - demo
  "6403": 0.08, // leather shoes - demo
  "4202": 0.17, // bags / luggage - demo
  "8518": 0.00, // headphones - demo
  "3924": 0.03, // plastic kitchenware - demo
  "7013": 0.05, // glassware - demo
  "6109": 0.16, // t-shirts (knit) - demo
  "6110": 0.14, // sweaters / pullovers - demo
  "900410": 0.02, // sunglasses (general) - demo
};

/* =========================
   Internal descriptions (avoid flaky external calls)
========================= */
const INTERNAL_HS_DESCRIPTIONS: Record<string, string> = {
  "6404": "Footwear with outer soles of rubber or plastics and uppers of textile materials",
  "6403": "Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather",
  "4202": "Trunks, suitcases, handbags and similar containers",
  "8518": "Microphones, loudspeakers; headphones and earphones",
  "3924": "Tableware, kitchenware and other household articles, of plastics",
  "7013": "Glassware of a kind used for table, kitchen, toilet, office, indoor decoration",
  "6109": "T-shirts, singlets and other vests, knitted or crocheted",
  "6110": "Jerseys, pullovers, cardigans, waistcoats and similar articles, knitted",
  "900410": "Sunglasses",
  "9004100000": "Sunglasses",
};

/* =========================
   Helpers
========================= */

function isNumericHs(s: string): false | "6" | "10" {
  const raw = s.replace(/\D/g, "");
  if (raw.length >= 10) return "10";
  if (raw.length === 6) return "6";
  return false;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function lookupAlias(input: string): { code: string; label: string } | null {
  const q = normalize(input);
  for (const row of HS_DICT) {
    if (row.aliases.some(a => normalize(a) === q)) return { code: row.code, label: row.label };
  }
  // lenient contains match
  for (const row of HS_DICT) {
    if (row.aliases.some(a => q.includes(normalize(a)))) return { code: row.code, label: row.label };
  }
  return null;
}

function resolveHsFromInput(productRaw: string): {
  code?: string;
  source: ResolvedSource;
  granularity: "10" | "6" | "none";
  friendly?: string;
} {
  const product = productRaw.trim();
  const numeric = isNumericHs(product);
  if (numeric === "10") {
    return { code: product.replace(/\D/g, "").slice(0, 10), source: "numeric", granularity: "10" };
  }
  if (numeric === "6") {
    return { code: product.replace(/\D/g, "").slice(0, 6), source: "numeric", granularity: "6" };
  }

  const alias = lookupAlias(product);
  if (alias) {
    return {
      code: alias.code,
      source: "dict",
      granularity: alias.code.length >= 10 ? "10" : "6",
      friendly: alias.label,
    };
  }
  return { source: "none", granularity: "none" };
}

function pickUsRate(hsCode?: string): number | undefined {
  if (!hsCode) return undefined;
  const code = hsCode.replace(/\D/g, "");

  // exact 10-digit demo override
  if (code === "9004100000") return 0.02;

  // 6-digit fallback
  const c6 = code.slice(0, 6);
  if (DEMO_US_RATES_BY6[c6] !== undefined) return DEMO_US_RATES_BY6[c6];

  return undefined;
}

function hsDescriptionFromInternal(hsCode?: string): string | undefined {
  if (!hsCode) return undefined;
  const c = hsCode.replace(/\D/g, "");
  return INTERNAL_HS_DESCRIPTIONS[c] ?? INTERNAL_HS_DESCRIPTIONS[c.slice(0, 6)];
}

function buildResponse(args: BuildResponseArgs) {
  const duty = +(args.price * args.rate).toFixed(2);

  const resolution: Resolution =
    args.resolvedFrom === "numeric"
      ? "numeric"
      : args.resolvedFrom === "dict"
      ? args.granularity === "6"
        ? "general-6"
        : "dictionary"
      : "none";

  return {
    duty,
    rate: args.rate,
    resolution,
    breakdown: {
      product: args.product,
      country: args.country,
      price: args.price,
      hsCode: args.hsCode,
      description: args.description,
    },
    notes: `Destination: ${args.destination.toUpperCase()}. Placeholder ${(args.rate * 100).toFixed(
      1
    )}% rate.`,
  };
}

/* =========================
   POST /api/estimate
========================= */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      product?: string;
      price?: number;
      country?: string;
      to?: Destination;
    };

    const product = (body.product ?? "").trim();
    const country = (body.country ?? "").trim();
    const price = Number(body.price);
    const destination: Destination = (body.to ?? "usa").toLowerCase() as Destination;

    if (!product || !country || !Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: "Invalid input. Provide product, country, and non-negative price." },
        { status: 400 }
      );
    }

    const resolved = resolveHsFromInput(product);
    let hsCode = resolved.code;
    let description = hsDescriptionFromInternal(hsCode) || resolved.friendly;

    // Destination-specific rate selection (demo)
    let rate = 0.05;
    if (destination === "usa") {
      const maybe = pickUsRate(hsCode);
      if (maybe !== undefined) rate = maybe;
    } else if (destination === "uk") {
      rate = 0.05;
    } else if (destination === "eu") {
      rate = 0.05;
    }

    // growth: log misses so we can add aliases later
    if (resolved.source === "none") {
      console.warn("[HS_MISS]", { product, country, destination });
    }

    return NextResponse.json(
      buildResponse({
        product,
        country,
        price,
        rate,
        hsCode,
        description,
        resolvedFrom: resolved.source,
        destination,
        granularity: resolved.granularity,
      })
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

/* =========================
   GET /api/estimate?product=...&price=...&country=...&to=usa
   (handy for quick tests)
========================= */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = (searchParams.get("product") ?? "").trim();
  const country = (searchParams.get("country") ?? "").trim();
  const price = Number(searchParams.get("price"));
  const destination = (searchParams.get("to") ?? "usa").toLowerCase() as Destination;

  if (!product || !country || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { error: "Invalid query. Provide product, country, and non-negative price." },
      { status: 400 }
    );
  }

  const resolved = resolveHsFromInput(product);
  let hsCode = resolved.code;
  let description = hsDescriptionFromInternal(hsCode) || resolved.friendly;

  let rate = 0.05;
  if (destination === "usa") {
    const maybe = pickUsRate(hsCode);
    if (maybe !== undefined) rate = maybe;
  } else if (destination === "uk") {
    rate = 0.05;
  } else if (destination === "eu") {
    rate = 0.05;
  }

  if (resolved.source === "none") {
    console.warn("[HS_MISS]", { product, country, destination });
  }

  return NextResponse.json(
    buildResponse({
      product,
      country,
      price,
      rate,
      hsCode,
      description,
      resolvedFrom: resolved.source,
      destination,
      granularity: resolved.granularity,
    })
  );
}
