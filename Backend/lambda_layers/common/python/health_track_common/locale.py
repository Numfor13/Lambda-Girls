"""Locale negotiation for Phase 10 handlers (EN / FR / Cameroonian Pidgin)."""

from typing import Optional

SUPPORTED_LOCALES = ("en", "fr", "pid")
DEFAULT_LOCALE = "en"
_MAX_LANGUAGE_RANGES = 20  # Accept-Language is client-controlled; bound the work


def _map_tag(tag: str) -> Optional[str]:
    """Map a BCP-47 language tag to a supported locale code, or None."""
    primary = tag.strip().lower().split("-", 1)[0]
    if primary in ("en", "fr"):
        return primary
    if primary in ("pcm", "pid"):
        return "pid"
    return None


def get_header(event, name: str) -> Optional[str]:
    """Case-insensitive header lookup; tolerates missing/None `headers`."""
    headers = (event or {}).get("headers") or {}
    wanted = name.lower()
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == wanted:
            return value if isinstance(value, str) else None
    return None


def _parse_accept_language(value: str) -> Optional[str]:
    candidates = []
    for position, part in enumerate(value.split(",")[:_MAX_LANGUAGE_RANGES]):
        pieces = [p.strip() for p in part.split(";")]
        tag = pieces[0]
        if not tag:
            continue
        q = 1.0
        valid = True
        for param in pieces[1:]:
            if param.lower().startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    valid = False
        if not valid or not (0 < q <= 1):
            continue
        locale = _map_tag(tag)
        if locale:
            candidates.append((-q, position, locale))
    return min(candidates)[2] if candidates else None


def resolve_locale(event, profile_locale: Optional[str] = None) -> str:
    """Pick the response locale.

    An explicit, supported `profile_locale` wins; otherwise the best supported
    `Accept-Language` range (honouring q-values, ties keep header order); else "en".
    `en*` -> en, `fr*` -> fr, `pcm*`/`pid*` -> pid.
    """
    if isinstance(profile_locale, str) and profile_locale:
        mapped = _map_tag(profile_locale)
        if mapped:
            return mapped
    header = get_header(event, "Accept-Language")
    if header:
        parsed = _parse_accept_language(header)
        if parsed:
            return parsed
    return DEFAULT_LOCALE


def locale_headers(locale: str) -> dict:
    """Response headers echoing the locale (exposed to browser JS via CORS)."""
    return {
        "Content-Language": locale,
        "Access-Control-Expose-Headers": "Content-Language",
    }
