"""
One-time recipe importer: fetch ~500 recipes from Spoonacular,
normalize, and insert into the recipes + recipe_ingredients tables.

Run once: python -m src.recipe_importer
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .normalizer import normalize_name, strip_quantity_from_name

load_dotenv()
logger = logging.getLogger(__name__)

SPOONACULAR_BASE = "https://api.spoonacular.com"
API_KEY = os.environ.get("SPOONACULAR_API_KEY", "")
MEAL_TYPES = ["breakfast", "lunch", "dinner", "main course", "salad", "soup"]
TARGET_PER_TYPE = 60  # ~180 total, well within 150/day free tier if run across 2 days
PANTRY_STAPLES = {
    "salt", "pepper", "oil", "olive oil", "vegetable oil", "butter", "flour",
    "sugar", "water", "baking soda", "baking powder", "garlic powder",
    "onion powder", "paprika", "cumin", "oregano", "thyme", "rosemary",
    "bay leaf", "chicken broth", "beef broth",
}

MEAL_TYPE_MAP = {
    "breakfast": "breakfast",
    "brunch": "breakfast",
    "lunch": "lunch",
    "main course": "dinner",
    "dinner": "dinner",
    "salad": "lunch",
    "soup": "lunch",
    "side dish": "dinner",
}


def search_recipes(query: str, meal_type: str, offset: int = 0) -> list[dict]:
    resp = httpx.get(
        f"{SPOONACULAR_BASE}/recipes/complexSearch",
        params={
            "apiKey": API_KEY,
            "type": meal_type,
            "addRecipeInformation": True,
            "addRecipeNutrition": False,
            "fillIngredients": True,
            "number": 20,
            "offset": offset,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def map_dietary(recipe: dict) -> tuple[bool, bool, bool]:
    return (
        bool(recipe.get("glutenFree", False)),
        bool(recipe.get("vegetarian", False)),
        bool(recipe.get("vegan", False)),
    )


def insert_recipe(conn: Any, recipe: dict, meal_type: str) -> str | None:
    """Insert a recipe + its ingredients. Returns inserted recipe ID or None on duplicate."""
    is_gf, is_veg, is_vegan = map_dietary(recipe)
    instructions = []
    for step_block in recipe.get("analyzedInstructions", []):
        for step in step_block.get("steps", []):
            instructions.append(step.get("step", "").strip())

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO recipes
              (title, description, servings, prep_time_minutes, cook_time_minutes,
               instructions, cuisine_type, meal_type, is_gluten_free, is_vegetarian,
               is_vegan, estimated_cost, image_url, source, external_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'spoonacular',%s)
            ON CONFLICT (source, external_id) DO NOTHING
            RETURNING id
            """,
            (
                recipe["title"],
                recipe.get("summary", "")[:500] if recipe.get("summary") else None,
                recipe.get("servings"),
                recipe.get("preparationMinutes"),
                recipe.get("cookingMinutes") or recipe.get("readyInMinutes"),
                instructions or None,
                recipe.get("cuisines", [None])[0],
                meal_type,
                is_gf, is_veg, is_vegan,
                None,  # estimated_cost populated later
                recipe.get("image"),
                str(recipe["id"]),
            ),
        )
        row = cur.fetchone()
        if row is None:
            return None  # duplicate
        recipe_id = str(row[0])

    # Insert ingredients
    for ing in recipe.get("extendedIngredients", []):
        name = ing.get("name", "").strip()
        norm = normalize_name(name)
        ingredient_key = strip_quantity_from_name(norm)
        is_staple = ingredient_key in PANTRY_STAPLES

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO recipe_ingredients
                  (recipe_id, ingredient_name, normalized_name, quantity, unit, is_pantry_staple)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                (
                    recipe_id,
                    name,
                    ingredient_key or norm,
                    ing.get("amount"),
                    ing.get("unit"),
                    is_staple,
                ),
            )

    return recipe_id


def run_import() -> None:
    if not API_KEY:
        raise RuntimeError("SPOONACULAR_API_KEY not set")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False

    total_inserted = 0
    for meal_type in ["breakfast", "lunch", "main course"]:
        logger.info("Importing meal_type=%s", meal_type)
        for offset in range(0, TARGET_PER_TYPE, 20):
            recipes = search_recipes("", meal_type, offset)
            for recipe in recipes:
                mapped_type = MEAL_TYPE_MAP.get(meal_type, "dinner")
                try:
                    rid = insert_recipe(conn, recipe, mapped_type)
                    if rid:
                        total_inserted += 1
                except Exception as exc:
                    logger.warning("Failed to insert recipe %s: %s", recipe.get("title"), exc)
                    conn.rollback()
                    continue
                conn.commit()
            time.sleep(1)  # Respect Spoonacular rate limit
        logger.info("Done with %s — total inserted so far: %d", meal_type, total_inserted)

    conn.close()
    logger.info("Recipe import complete — %d recipes inserted", total_inserted)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_import()
