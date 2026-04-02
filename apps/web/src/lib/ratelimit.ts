import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

// Free tier: 1 plan generation per user per week (604800 seconds = 7 days)
export const freeTierRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, "604800 s"),
  prefix: "rl:plan:free",
});

// Premium tier: 2 plan generations per user per week
export const premiumRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(2, "604800 s"),
  prefix: "rl:plan:premium",
});
