import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

from health_track_common.rules import child_under_5, obstetric, adult_red_flags, rule_engine


# --- child_under_5 ---

def test_fast_breathing_under_2_months_fires_at_60():
    fired = child_under_5.evaluate({"age_months": 1, "symptoms": [], "vitals": {"resp_rate": 60}})
    assert any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_fast_breathing_under_2_months_no_fire_at_59():
    fired = child_under_5.evaluate({"age_months": 1, "symptoms": [], "vitals": {"resp_rate": 59}})
    assert not any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_fast_breathing_2_to_12_months_fires_at_50():
    fired = child_under_5.evaluate({"age_months": 6, "symptoms": [], "vitals": {"resp_rate": 50}})
    assert any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_fast_breathing_2_to_12_months_no_fire_at_49():
    fired = child_under_5.evaluate({"age_months": 6, "symptoms": [], "vitals": {"resp_rate": 49}})
    assert not any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_fast_breathing_1_to_5_years_fires_at_40():
    fired = child_under_5.evaluate({"age_months": 24, "symptoms": [], "vitals": {"resp_rate": 40}})
    assert any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_fast_breathing_1_to_5_years_no_fire_at_39():
    fired = child_under_5.evaluate({"age_months": 24, "symptoms": [], "vitals": {"resp_rate": 39}})
    assert not any(r["rule_id"] == "child_fast_breathing" for r in fired)

def test_child_convulsions_red():
    fired = child_under_5.evaluate({"age_months": 12, "symptoms": ["convulsions"], "vitals": {}})
    assert any(r["urgency"] == "RED" for r in fired)

def test_child_no_symptoms_no_fire():
    fired = child_under_5.evaluate({"age_months": 24, "symptoms": [], "vitals": {}})
    assert fired == []

# --- obstetric ---

def test_obstetric_not_pregnant_no_fire():
    fired = obstetric.evaluate({"is_pregnant": False, "symptoms": ["ob_haemorrhage"]})
    assert fired == []

def test_obstetric_haemorrhage_red():
    fired = obstetric.evaluate({"is_pregnant": True, "symptoms": ["ob_haemorrhage"]})
    assert any(r["urgency"] == "RED" for r in fired)

def test_obstetric_fever_amber():
    fired = obstetric.evaluate({"is_pregnant": True, "symptoms": ["ob_fever_pregnancy"]})
    assert any(r["urgency"] == "AMBER" for r in fired)

# --- adult_red_flags ---

def test_adult_chest_pain_red():
    fired = adult_red_flags.evaluate({"symptoms": ["chest_pain"]})
    assert any(r["urgency"] == "RED" for r in fired)

def test_adult_mild_cough_green():
    fired = adult_red_flags.evaluate({"symptoms": ["cough_mild"]})
    assert any(r["urgency"] == "GREEN" for r in fired)

def test_adult_no_symptoms_no_fire():
    fired = adult_red_flags.evaluate({"symptoms": []})
    assert fired == []

# --- rule_engine ---

def test_engine_red_dominates_green():
    payload = {"age_months": 999, "is_pregnant": False, "symptoms": ["chest_pain", "cough_mild"], "vitals": {}}
    urgency, fired, rec, facility = rule_engine.evaluate(payload)
    assert urgency == "RED"
    assert facility == "emergency"

def test_engine_green_when_no_symptoms():
    payload = {"age_months": 999, "is_pregnant": False, "symptoms": [], "vitals": {}}
    urgency, fired, rec, facility = rule_engine.evaluate(payload)
    assert urgency == "GREEN"
    assert fired == []

def test_engine_child_and_adult_rules_combined():
    payload = {"age_months": 3, "is_pregnant": False, "symptoms": ["high_fever_adult"], "vitals": {"resp_rate": 55}}
    urgency, fired, rec, facility = rule_engine.evaluate(payload)
    # fast breathing (AMBER) + high fever (AMBER) → AMBER
    assert urgency == "AMBER"

def test_engine_obstetric_with_child_age_ignored():
    # is_pregnant=True but age_months=30 (adult) — obstetric rules should still fire
    payload = {"age_months": 360, "is_pregnant": True, "symptoms": ["ob_haemorrhage"], "vitals": {}}
    urgency, fired, rec, facility = rule_engine.evaluate(payload)
    assert urgency == "RED"
