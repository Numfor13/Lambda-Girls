"""Obstetric danger signs."""

DANGER_SIGNS = [
    ("ob_haemorrhage",     "Vaginal haemorrhage",              "RED"),
    ("ob_convulsion",      "Convulsions during pregnancy",     "RED"),
    ("ob_prolonged_labour","Prolonged / obstructed labour",   "RED"),
    ("ob_no_fetal_movement","Absent fetal movement >12h",     "RED"),
    ("ob_fever_pregnancy", "Fever during pregnancy",          "AMBER"),
    ("ob_severe_headache", "Severe headache with vision change","AMBER"),
    ("ob_swollen_face_hands","Swollen face/hands (preeclampsia sign)","AMBER"),
    ("ob_difficulty_breathing","Difficulty breathing during pregnancy","AMBER"),
]


def evaluate(payload: dict) -> list[dict]:
    """Only runs if payload['is_pregnant'] is True."""
    if not payload.get("is_pregnant"):
        return []
    symptoms = set(payload.get("symptoms", []))
    fired = []
    for code, description, urgency in DANGER_SIGNS:
        if code in symptoms:
            fired.append({
                "rule_id": code,
                "description": description,
                "urgency": urgency,
                "value_that_triggered": code,
            })
    return fired
