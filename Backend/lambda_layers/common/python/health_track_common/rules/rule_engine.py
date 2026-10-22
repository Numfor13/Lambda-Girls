"""
Evaluate a symptom payload against all applicable rule modules.
Returns (urgency, rules_fired, recommendation, facility_type_needed).
"""
from . import child_under_5, obstetric, adult_red_flags

URGENCY_RANK = {"RED": 2, "AMBER": 1, "GREEN": 0}

RECOMMENDATIONS = {
    "RED":   "Seek emergency care immediately. Go to the nearest hospital with an emergency unit.",
    "AMBER": "See a doctor today. Visit your nearest clinic or hospital.",
    "GREEN": "Non-urgent. Rest and monitor. Visit a clinic if symptoms worsen or persist beyond 3 days.",
}

FACILITY_NEEDED = {
    "RED":   "emergency",
    "AMBER": "general",
    "GREEN": "pharmacy",
}


def evaluate(payload: dict) -> tuple[str, list[dict], str, str]:
    """
    Returns:
        urgency: "RED" | "AMBER" | "GREEN"
        rules_fired: list of fired rule dicts
        recommendation: string
        facility_type_needed: string
    """
    age_months = payload.get("age_months", 999)
    all_fired = []

    if age_months <= 60:
        all_fired.extend(child_under_5.evaluate(payload))

    all_fired.extend(obstetric.evaluate(payload))
    all_fired.extend(adult_red_flags.evaluate(payload))

    if not all_fired:
        urgency = "GREEN"
    else:
        urgency = max(all_fired, key=lambda r: URGENCY_RANK[r["urgency"]])["urgency"]

    return urgency, all_fired, RECOMMENDATIONS[urgency], FACILITY_NEEDED[urgency]
