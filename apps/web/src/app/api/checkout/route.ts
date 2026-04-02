import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID!;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL!;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: session.user.email,
    metadata: { userId: session.user.id },
    line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/account?upgraded=true`,
    cancel_url: `${origin}/upgrade`,
  });

  return NextResponse.redirect(checkoutSession.url!, 303);
}
