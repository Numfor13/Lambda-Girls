"""Adult general red flags and urgent signs."""

RED_FLAGS = [
    ("chest_pain",          "Chest pain / pressure",                    "RED"),
    ("stroke_symptoms",     "Sudden face/arm/speech change (stroke)",   "RED"),
    ("difficulty_breathing","Severe difficulty breathing",              "RED"),
    ("coughing_blood",      "Coughing up blood",                       "RED"),
    ("vomiting_blood",      "Vomiting blood",                          "RED"),
    ("loss_consciousness",  "Loss of consciousness",                   "RED"),
    ("severe_bleeding",     "Uncontrolled severe bleeding",            "RED"),
    ("seizure",             "Active seizure",                          "RED"),
    # AMBER
    ("high_fever_adult",    "High fever (adult) ≥38.5°C",             "AMBER"),
    ("persistent_vomiting", "Persistent vomiting > 2 days",           "AMBER"),
    ("severe_abdominal_pain","Severe abdominal pain",                  "AMBER"),
    ("dehydration",         "Signs of dehydration",                   "AMBER"),
    ("altered_mental_state","Confusion / altered mental state",        "AMBER"),
    ("weakness_one_side",   "Weakness / numbness one side of body",   "AMBER"),
    ("jaundice",            "Yellowing of eyes/skin (jaundice)",      "AMBER"),
    ("unable_walk",         "Unable to walk / stand unaided",         "AMBER"),
    # GREEN
    ("cough_mild",          "Mild cough < 2 weeks",                   "GREEN"),
    ("cold_flu",            "Common cold / mild flu",                 "GREEN"),
    ("headache_mild",       "Mild headache",                          "GREEN"),
    ("skin_rash_mild",      "Mild skin rash",                         "GREEN"),
    ("back_pain_mild",      "Mild back pain",                         "GREEN"),
]


def evaluate(payload: dict) -> list[dict]:
    symptoms = set(payload.get("symptoms", []))
    fired = []
    for code, description, urgency in RED_FLAGS:
        if code in symptoms:
            fired.append({
                "rule_id": code,
                "description": description,
                "urgency": urgency,
                "value_that_triggered": code,
            })
    return fired
