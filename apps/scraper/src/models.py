from datetime import date
from typing import Optional
from pydantic import BaseModel, UUID4


class SaleItem(BaseModel):
    store_id: UUID4
    week_of: date
    product_name: str
    normalized_name: str
    category: Optional[str] = None
    unit: Optional[str] = None
    sale_price: Optional[float] = None
    regular_price: Optional[float] = None
    raw_description: Optional[str] = None
    image_url: Optional[str] = None


class RecipeIngredient(BaseModel):
    ingredient_name: str
    normalized_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    is_pantry_staple: bool = False
    estimated_cost: Optional[float] = None


class Recipe(BaseModel):
    title: str
    description: Optional[str] = None
    servings: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    instructions: list[str] = []
    cuisine_type: Optional[str] = None
    meal_type: str  # breakfast | lunch | dinner
    is_gluten_free: bool = False
    is_vegetarian: bool = False
    is_vegan: bool = False
    estimated_cost: Optional[float] = None
    image_url: Optional[str] = None
    source: str = "internal"
    external_id: Optional[str] = None
    ingredients: list[RecipeIngredient] = []
