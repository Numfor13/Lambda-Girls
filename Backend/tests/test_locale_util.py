import json, os, sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

from health_track_common.locale import resolve_locale, locale_headers, SUPPORTED_LOCALES
from health_track_common.response import ok, err


def _event(headers):
    return {"headers": headers}


@pytest.mark.parametrize("header,expected", [
    ("en-US,en;q=0.9", "en"),
    ("fr-CM", "fr"),
    ("fr-CM,fr;q=0.9,en;q=0.8", "fr"),
    ("FR", "fr"),
    ("pcm", "pid"),
    ("pcm-CM", "pid"),
    ("pid", "pid"),
    ("en;q=0.3, fr;q=0.8", "fr"),            # q-values honoured, not order
    ("de-DE, fr;q=0.5", "fr"),               # unsupported first choice skipped
    ("fr;q=0, en;q=0.1", "en"),              # q=0 means "not acceptable"
    ("pcm;q=0.9, fr;q=0.9", "pid"),          # tie keeps header order
    ("*", "en"),
    ("de, es", "en"),                        # nothing supported -> default
    ("garbage;;;q=abc,,,", "en"),
    (";q=1", "en"),
    ("fr;q=notanumber, pcm;q=0.2", "pid"),   # malformed q drops that entry
    ("", "en"),
])
def test_accept_language_parsing(header, expected):
    assert resolve_locale(_event({"Accept-Language": header})) == expected


def test_header_lookup_is_case_insensitive():
    assert resolve_locale(_event({"accept-language": "fr"})) == "fr"
    assert resolve_locale(_event({"ACCEPT-LANGUAGE": "pcm"})) == "pid"


@pytest.mark.parametrize("event", [{}, {"headers": None}, None, {"headers": {}}])
def test_missing_header_defaults_to_en(event):
    assert resolve_locale(event) == "en"


def test_profile_locale_wins():
    assert resolve_locale(_event({"Accept-Language": "en"}), profile_locale="fr") == "fr"
    assert resolve_locale(_event({"Accept-Language": "fr"}), profile_locale="pcm") == "pid"


def test_invalid_profile_locale_falls_back_to_header():
    assert resolve_locale(_event({"Accept-Language": "fr"}), profile_locale="xx") == "fr"
    assert resolve_locale(_event({"Accept-Language": "fr"}), profile_locale="") == "fr"


def test_non_string_header_value_is_ignored():
    assert resolve_locale(_event({"Accept-Language": 123})) == "en"


def test_supported_locales():
    assert SUPPORTED_LOCALES == ("en", "fr", "pid")


def test_locale_headers_expose_content_language():
    h = locale_headers("fr")
    assert h["Content-Language"] == "fr"
    assert "Content-Language" in h["Access-Control-Expose-Headers"]


# -- ok/err optional headers (backwards compatible) ---------------------------

def test_ok_err_without_headers_unchanged():
    r = ok({"a": 1}, status_code=201)
    assert r["statusCode"] == 201
    assert r["headers"] == {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    e = err(400, "bad")
    assert e["headers"] == {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    assert json.loads(e["body"]) == {"error": "bad"}


def test_ok_err_merge_extra_headers():
    r = ok({"a": 1}, headers={"Content-Language": "fr"})
    assert r["headers"]["Content-Language"] == "fr"
    assert r["headers"]["Content-Type"] == "application/json"
    e = err(404, "nope", headers={"Content-Language": "pid"})
    assert e["headers"]["Content-Language"] == "pid"
    assert e["headers"]["Access-Control-Allow-Origin"] == "*"
