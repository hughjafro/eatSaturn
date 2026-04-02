import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DAILY_SPEND_ALERT_THRESHOLD = 5; // USD
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? "";

export async function GET(req: Request) {
  // Verify Vercel cron secret
  const authHeader = req.headers instanceof Headers ? req.headers.get("authorization") : "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabaseAdmin
    .from("llm_usage_log")
    .select("cost_usd")
    .eq("logged_date", today);

  const totalSpend = (data ?? []).reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);

  if (totalSpend >= DAILY_SPEND_ALERT_THRESHOLD && ALERT_WEBHOOK_URL) {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `WARNING: LLM spend today is $${totalSpend.toFixed(4)} (threshold: $${DAILY_SPEND_ALERT_THRESHOLD})`,
      }),
    });
  }

  return NextResponse.json({ date: today, totalSpend: totalSpend.toFixed(6) });
}
