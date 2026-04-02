import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMondayOfCurrentWeek } from "@/lib/dates";
import { WeeklyPlanEmail } from "@/emails/WeeklyPlanEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function GET(req: Request) {
  const authHeader = req.headers instanceof Headers ? req.headers.get("authorization") : "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekOf = getMondayOfCurrentWeek();

  // Get users who have notification_day = 'sunday' (this cron runs Sundays)
  const { data: prefs } = await supabaseAdmin
    .from("user_preferences")
    .select("user_id, notification_day")
    .eq("notification_day", "sunday");

  if (!prefs?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const userIds = prefs.map((p) => p.user_id);

  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .in("id", userIds);

  let sent = 0;
  for (const user of users ?? []) {
    try {
      const html = await render(WeeklyPlanEmail({ weekOf }));
      await resend.emails.send({
        from: "CartSpoon <hello@cartspoon.app>",
        to: user.email,
        subject: `Your new meal plan is ready — week of ${weekOf}`,
        html,
      });
      sent++;
    } catch {
      // Continue sending to other users even if one fails
    }
  }

  return NextResponse.json({ sent });
}
