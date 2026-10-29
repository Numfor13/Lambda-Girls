import importlib.util, os
from decimal import Decimal

# -- Seed script: DynamoDB rejects float, so every number must be Decimal ------

def _load_seed_facilities():
    path = os.path.join(os.path.dirname(__file__), "..", "scripts", "seed_facilities.py")
    spec = importlib.util.spec_from_file_location("seed_facilities", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _floats(value):
    if isinstance(value, float):
        return [value]
    if isinstance(value, dict):
        return [f for v in value.values() for f in _floats(v)]
    if isinstance(value, (list, set)):
        return [f for v in value for f in _floats(v)]
    return []


def test_seed_facilities_decimal_conversion_leaves_no_floats():
    seed = _load_seed_facilities()
    converted = seed.to_decimal(seed.FACILITIES)
    assert _floats(seed.FACILITIES)  # the source data really does contain floats
    assert _floats(converted) == []
    assert converted[0]["latitude"] == Decimal("4.1527")
