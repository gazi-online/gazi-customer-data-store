import { NextRequest, NextResponse } from "next/server";
import { getCustomerGrowthData } from "@/app/(dashboard)/dashboard/actions";
import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function GET(req: NextRequest) {
  const period = (req.nextUrl.searchParams.get("period") || "30d") as "7d" | "30d" | "90d" | "1y";
  const validPeriods = ["7d", "30d", "90d", "1y"] as const;
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    await requireAal2(supabase);
  } catch {
    return NextResponse.json({ error: "Unauthorized. AAL2 assurance required." }, { status: 401 });
  }

  try {
    const data = await getCustomerGrowthData(period);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
