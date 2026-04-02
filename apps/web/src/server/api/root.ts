import { createTRPCRouter } from "./trpc";
import { storesRouter } from "./routers/stores";
import { saleItemsRouter } from "./routers/saleItems";
import { userRouter } from "./routers/user";
import { mealPlanRouter } from "./routers/mealPlan";
import { recipesRouter } from "./routers/recipes";

export const appRouter = createTRPCRouter({
  stores: storesRouter,
  saleItems: saleItemsRouter,
  user: userRouter,
  mealPlan: mealPlanRouter,
  recipes: recipesRouter,
});

export type AppRouter = typeof appRouter;
