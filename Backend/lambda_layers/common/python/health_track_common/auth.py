"""Cognito group checks for API Gateway (Cognito authorizer) events."""

from health_track_common.response import err


def _claims(event) -> dict:
    return ((event or {}).get("requestContext") or {}).get("authorizer", {}).get("claims", {}) or {}


def get_groups(event) -> set:
    """Return the caller's Cognito groups; `cognito:groups` may be a list or a comma string."""
    groups = _claims(event).get("cognito:groups", "")
    if not isinstance(groups, list):
        groups = groups.split(",")
    return {g.strip() for g in groups if g and g.strip()}


def require_group(event, *groups):
    """Return (user_id, None) if the caller is authenticated and in one of `groups`.

    Returns (None, 401 response) when there is no `sub` claim and (None, 403 response)
    when none of `groups` is present. With no `groups`, any authenticated caller passes.
    """
    user_id = _claims(event).get("sub")
    if not user_id:
        return None, err(401, "Unauthorized")
    if groups and not (get_groups(event) & set(groups)):
        return None, err(403, f"{' or '.join(groups)} group required")
    return user_id, None
