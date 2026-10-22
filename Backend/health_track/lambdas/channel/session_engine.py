"""
Shared session state machine for SMS and USSD channels.
State transitions:
  INIT -> MENU -> triage_q1 -> triage_q2 -> triage_done
                             -> facility_lookup
                             -> nurse_callback
"""

MENU_TEXT = (
    "Welcome to HealthTrack.\n"
    "1. Find nearby hospital\n"
    "2. First-aid tips\n"
    "3. Symptom check\n"
    "4. Nurse callback"
)

FIRST_AID_TEXT = (
    "Basic first-aid:\n"
    "- Burns: cool with water 10 min\n"
    "- Choking: 5 back blows\n"
    "- Bleeding: apply pressure\n"
    "Reply MENU to return."
)

TRIAGE_Q1 = "Symptom check:\nQ1: How old is the patient in years? (enter number)"
TRIAGE_Q2 = "Q2: Main symptom? Reply:\n1. Fever\n2. Difficulty breathing\n3. Chest pain\n4. Severe headache\n5. Other"
TRIAGE_DONE_RED   = "URGENT: Please go to the nearest emergency facility immediately or call 15."
TRIAGE_DONE_AMBER = "Please see a doctor today. Type MENU to find a nearby clinic."
TRIAGE_DONE_GREEN = "Your symptoms appear non-urgent. Rest, stay hydrated. Type MENU for more."

SYMPTOM_MAP = {
    "1": "fever",
    "2": "difficulty_breathing",
    "3": "chest_pain",
    "4": "severe_headache",
    "5": "other",
}

RED_SYMPTOMS = {"difficulty_breathing", "chest_pain"}


def step(state: str, context: dict, message_body: str) -> tuple:
    """
    Process one step of the session state machine.
    Returns (new_state, updated_context, response_text).
    """
    msg = message_body.strip().upper()

    if state in ("INIT", "") or msg == "MENU":
        return "MENU", context, MENU_TEXT

    if state == "MENU":
        if msg == "1":
            return "FACILITY", context, "Send your area name (e.g. Molyko) to find nearby hospitals."
        if msg == "2":
            return "FIRST_AID", context, FIRST_AID_TEXT
        if msg == "3":
            return "TRIAGE_Q1", context, TRIAGE_Q1
        if msg == "4":
            return "CALLBACK_CONFIRM", context, "Type YES to request a nurse callback."
        return "MENU", context, f"Invalid choice. {MENU_TEXT}"

    if state == "FACILITY":
        area = message_body.strip()
        return "MENU", context, f"Searching for hospitals near {area}. Reply MENU to continue."

    if state == "FIRST_AID":
        return "FIRST_AID", context, FIRST_AID_TEXT

    if state == "TRIAGE_Q1":
        try:
            age = int(message_body.strip())
            ctx = dict(context, age=age)
            return "TRIAGE_Q2", ctx, TRIAGE_Q2
        except ValueError:
            return "TRIAGE_Q1", context, f"Please enter a number.\n{TRIAGE_Q1}"

    if state == "TRIAGE_Q2":
        sym = SYMPTOM_MAP.get(message_body.strip(), "other")
        ctx = dict(context, symptom=sym)
        if sym in RED_SYMPTOMS:
            return "TRIAGE_DONE", ctx, TRIAGE_DONE_RED
        if sym in ("severe_headache",):
            return "TRIAGE_DONE", ctx, TRIAGE_DONE_AMBER
        return "TRIAGE_DONE", ctx, TRIAGE_DONE_GREEN

    if state == "TRIAGE_DONE":
        return "MENU", context, MENU_TEXT

    if state == "CALLBACK_CONFIRM":
        if msg == "YES":
            ctx = dict(context, callback_requested=True)
            return "CALLBACK_DONE", ctx, "A nurse will call you back shortly. Stay safe."
        return "MENU", context, MENU_TEXT

    if state == "CALLBACK_DONE":
        return "MENU", context, MENU_TEXT

    # fallback
    return "MENU", context, MENU_TEXT

