"""Unit tests for the normalizer module."""
import pytest
from src.normalizer import (
    normalize_name,
    extract_unit,
    extract_price,
    infer_category,
    strip_quantity_from_name,
)


def test_normalize_name_lowercases():
    assert normalize_name("Chicken Breast") == "chicken breast"


def test_normalize_name_strips_parens():
    assert "lb" not in normalize_name("Chicken Breast (3 lb)")


def test_normalize_name_collapses_spaces():
    result = normalize_name("boneless   skinless   chicken")
    assert "  " not in result


def test_extract_unit_lbs():
    qty, unit = extract_unit("Chicken Breast 3 lb")
    assert qty == "3"
    assert unit == "lb"


def test_extract_unit_oz():
    qty, unit = extract_unit("Greek Yogurt 32 oz")
    assert unit in ("oz", "ozs")


def test_extract_unit_none():
    qty, unit = extract_unit("Bananas")
    assert qty is None
    assert unit is None


def test_extract_price_simple():
    assert extract_price("$3.99") == 3.99


def test_extract_price_x_for_y():
    assert extract_price("2 for $5") == 2.50


def test_extract_price_slash():
    assert extract_price("3/$9") == 3.00


def test_extract_price_none():
    assert extract_price("") is None


def test_infer_category_produce():
    assert infer_category("broccoli florets") == "produce"


def test_infer_category_meat():
    assert infer_category("boneless chicken breast") == "meat"


def test_infer_category_dairy():
    assert infer_category("whole milk gallon") == "dairy"


def test_infer_category_unknown():
    assert infer_category("xyzzy widget") is None


def test_strip_quantity_removes_unit():
    result = strip_quantity_from_name("chicken breast 3 lb")
    assert "lb" not in result
    assert "chicken breast" in result
