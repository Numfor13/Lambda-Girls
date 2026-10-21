"""
Danger signs for children under 5.
Fast-breathing thresholds (WHO):
  ≤2 months:    ≥60 bpm
  2–12 months:  ≥50 bpm
  1–5 years:    ≥40 bpm
"""

DANGER_SIGNS = [
    ("convulsions",   "Convulsions / fits",           "RED"),
    ("unconscious",   "Unconscious or unresponsive",  "RED"),
    ("unable_feed",   "Unable to feed / drink",       "RED"),
    ("severe_wasting","Severe wasting",               "RED"),
    ("chest_indraw",  "Chest in-drawing",             "AMBER"),
    ("fast_breathing","Fast breathing (see threshold)","AMBER"),
    ("fever_child",   "Fever (child under 5)",        "AMBER"),
    ("ear_discharge", "Ear discharge > 2 weeks",      "AMBER"),
    ("palmar_pallor", "Palmar pallor (anaemia sign)", "AMBER"),
]


def evaluate(payload: dict) -> list[dict]:
    """
    payload keys:
      age_months (int)
      symptoms (list[str])
      vitals (dict): resp_rate (int, optional)
    Returns list of fired rule dicts: { rule_id, description, urgency, value_that_triggered }
    """
    age_months = payload.get("age_months", 999)
    symptoms = set(payload.get("symptoms", []))
    vitals = payload.get("vitals", {})
    resp_rate = vitals.get("resp_rate")
    fired = []

    for code, description, urgency in DANGER_SIGNS:
        if code == "fast_breathing":
            if resp_rate is not None:
                if age_months <= 2 and resp_rate >= 60:
                    fired.append({
                        "rule_id": f"child_{code}",
                        "description": f"Fast breathing: {resp_rate} bpm (threshold ≥60 for age ≤2 months)",
                        "urgency": urgency,
                        "value_that_triggered": resp_rate,
                    })
                elif 2 < age_months <= 12 and resp_rate >= 50:
                    fired.append({
                        "rule_id": f"child_{code}",
                        "description": f"Fast breathing: {resp_rate} bpm (threshold ≥50 for age 2–12 months)",
                        "urgency": urgency,
                        "value_that_triggered": resp_rate,
                    })
                elif 12 < age_months <= 60 and resp_rate >= 40:
                    fired.append({
                        "rule_id": f"child_{code}",
                        "description": f"Fast breathing: {resp_rate} bpm (threshold ≥40 for age 1–5 years)",
                        "urgency": urgency,
                        "value_that_triggered": resp_rate,
                    })
        elif code in symptoms:
            fired.append({
                "rule_id": f"child_{code}",
                "description": description,
                "urgency": urgency,
                "value_that_triggered": code,
            })

    return fired
