import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product") || "unknown product";
  const country = searchParams.get("country") || "unknown country";
  const price = parseFloat(searchParams.get("price") || "0");

  // Placeholder logic: flat 5% duty
  const dutyRate = 0.05;
  const duty = Math.max(0, price * dutyRate);

  return NextResponse.json({
    duty,
    notes: `Placeholder estimate for ${product} from ${country} at a ${(
      dutyRate * 100
    ).toFixed(1)}% duty rate.`,
  });
}
