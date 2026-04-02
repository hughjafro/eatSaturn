"""
Utility functions for normalizing product names and extracting units.
"""
import re

# Standard category keywords → category label
CATEGORY_MAP: dict[str, list[str]] = {
    "produce": ["apple", "banana", "orange", "grape", "strawberry", "blueberry",
                "lettuce", "spinach", "kale", "broccoli", "carrot", "potato",
                "onion", "tomato", "pepper", "cucumber", "zucchini", "corn",
                "avocado", "lemon", "lime", "peach", "plum", "watermelon"],
    "meat": ["chicken", "beef", "pork", "turkey", "lamb", "steak", "roast",
             "sausage", "bacon", "ham", "salami", "brisket", "ribs", "shrimp",
             "salmon", "tilapia", "cod", "tuna", "crab", "lobster", "scallop"],
    "dairy": ["milk", "butter", "cheese", "yogurt", "cream", "sour cream",
              "cottage cheese", "cream cheese", "egg", "eggs"],
    "bakery": ["bread", "roll", "bagel", "muffin", "croissant", "tortilla",
               "pita", "bun", "cake", "pie", "cookie"],
    "pantry": ["pasta", "rice", "flour", "sugar", "oil", "vinegar", "sauce",
               "canned", "bean", "lentil", "soup", "broth", "cereal", "oat",
               "granola", "cracker", "chip", "nut", "almond", "peanut butter"],
    "frozen": ["frozen", "ice cream", "pizza", "nugget", "tater tot", "waffle"],
    "beverages": ["juice", "soda", "water", "coffee", "tea", "beer", "wine",
                  "energy drink", "sports drink"],
    "household": ["detergent", "soap", "shampoo", "conditioner", "toilet",
                  "paper towel", "napkin", "plastic bag"],
}

# Unit patterns: extract quantity + unit from product names
UNIT_PATTERN = re.compile(
    r"""
    (?P<qty>[\d.]+(?:/[\d.]+)?)\s*
    (?P<unit>
        fl\.?\s*oz|fluid\s+oz(?:s)?|oz(?:s)?|
        lb(?:s)?|pound(?:s)?|
        ct|count|pk|pack|
        gal(?:lon(?:s)?)?|qt(?:s)?|pt(?:s)?|
        g|kg|ml|l\b
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

PRICE_PATTERN = re.compile(r"\$?\s*(\d+(?:\.\d{1,2})?)")


def normalize_name(raw: str) -> str:
    """Lowercase, strip leading/trailing whitespace, collapse spaces, remove brand noise."""
    name = raw.lower().strip()
    # Remove content in parens that typically has pack sizes
    name = re.sub(r"\(.*?\)", "", name)
    # Remove common brand prefixes (can be expanded)
    name = re.sub(r"\b(store brand|great value|signature select|simply|organic)\b", "", name, flags=re.IGNORECASE)
    # Collapse extra spaces
    name = re.sub(r"\s+", " ", name).strip()
    return name


def extract_unit(raw: str) -> tuple[str | None, str | None]:
    """Return (quantity_string, unit_string) parsed from a raw product name."""
    match = UNIT_PATTERN.search(raw)
    if match:
        return match.group("qty"), match.group("unit").lower().replace(".", "").replace(" ", "")
    return None, None


def extract_price(raw: str) -> float | None:
    """Parse a price string like '$3.99' or '2/$5' to a float."""
    if not raw:
        return None
    # Handle 'X for $Y' or 'X/$Y'
    for_match = re.search(r"(\d+)\s*(?:for|/)\s*\$?\s*(\d+(?:\.\d{1,2})?)", raw, re.IGNORECASE)
    if for_match:
        count = float(for_match.group(1))
        total = float(for_match.group(2))
        return round(total / count, 2)
    price_match = PRICE_PATTERN.search(raw)
    if price_match:
        return float(price_match.group(1))
    return None


def infer_category(normalized_name: str) -> str | None:
    """Map a normalized product name to a category using keyword matching."""
    for category, keywords in CATEGORY_MAP.items():
        for kw in keywords:
            if kw in normalized_name:
                return category
    return None


def strip_quantity_from_name(name: str) -> str:
    """Remove quantity/unit patterns from a name to get the core ingredient name."""
    cleaned = UNIT_PATTERN.sub("", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned
