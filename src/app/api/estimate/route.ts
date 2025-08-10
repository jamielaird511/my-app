// src/app/api/estimate/route.ts
import { NextResponse } from "next/server";

type Payload = { product?: string; price?: number; country?: string };

function calc(product: string, country: string, price: number) {
  const dutyRate = 0.05; // placeholder
  const duty = Math.max(0, price * dutyRate);
  return {
    duty,
    rate: dutyRate,
    breakdown: { product, country, price },
    notes: `Placeholder estimate for ${product} from ${country} at a ${(dutyRate * 100).toFixed(
      1
    )}% duty rate.`,
  };
}

// POST /api/estimate  (used by your form)
export async function POST(req: Request) {
  const body = (await req.json()) as Payload;
  const product = (body.product ?? "").trim() || "unknown product";
  const country = (body.country ?? "").trim() || "unknown country";
  const price = Number(body.price ?? 0);

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }

  return NextResponse.json(calc(product, country, price));
}

// GET /api/estimate?product=...&country=...&price=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product")?.trim() || "unknown product";
  const country = searchParams.get("country")?.trim() || "unknown country";
  const price = Number(searchParams.get("price") ?? 0);

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }

  return NextResponse.json(calc(product, country, price));
}
