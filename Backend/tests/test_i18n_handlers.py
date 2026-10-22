import importlib.util, json, os, re, sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lambda_layers", "common", "python"))

_BACKEND = os.path.join(os.path.dirname(__file__), "..")
_I18N_DIR = os.path.join(_BACKEND, "scripts", "i18n")

_TEST_ENV = {"I18N_BUCKET": "test-i18n-bucket", "ENV_NAME": "dev", "AWS_DEFAULT_REGION": "us-east-1"}
_saved = {k: os.environ.get(k) for k in _TEST_ENV}
os.environ.update(_TEST_ENV)

from health_track.lambdas.i18n.get_locale import handler as get_locale


def _load_seed_module():
    spec = importlib.util.spec_from_file_location("seed_i18n", os.path.join(_BACKEND, "scripts", "seed_i18n.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _event(locale, headers=None):
    return {
        "requestContext": None,
        "pathParameters": {"locale": locale} if locale is not None else None,
        "headers": headers,
        "body": None,
    }


@pytest.fixture
def s3():
    os.environ.update(_TEST_ENV)
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket="test-i18n-bucket")
        yield client
    for k, v in _saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def _put(s3, locale, data):
    s3.put_object(Bucket="test-i18n-bucket", Key=f"i18n/{locale}.json", Body=json.dumps(data).encode())


# -- GET /i18n/{locale} -------------------------------------------------------

@pytest.mark.parametrize("locale", ["en", "fr", "pid"])
def test_get_locale_ok_with_cache_headers(s3, locale):
    _put(s3, locale, {"common": {"ok": locale}})
    resp = get_locale(_event(locale), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"common": {"ok": locale}}
    h = resp["headers"]
    assert h["Cache-Control"] == "public, max-age=604800"
    assert h["Content-Language"] == locale
    assert h["Content-Type"].startswith("application/json")
    assert h["Access-Control-Allow-Origin"] == "*"
    assert re.fullmatch(r'"[0-9a-f]{32}"', h["ETag"])
    assert "ETag" in h["Access-Control-Expose-Headers"]
    assert "Content-Language" in h["Access-Control-Expose-Headers"]


def test_etag_is_deterministic(s3):
    _put(s3, "en", {"a": 1})
    e1 = get_locale(_event("en"), None)["headers"]["ETag"]
    _put(s3, "en", {"a": 1})
    e2 = get_locale(_event("en"), None)["headers"]["ETag"]
    assert e1 == e2
    _put(s3, "en", {"a": 2})
    assert get_locale(_event("en"), None)["headers"]["ETag"] != e1


@pytest.mark.parametrize("hdr_name", ["If-None-Match", "if-none-match"])
def test_matching_if_none_match_returns_304(s3, hdr_name):
    _put(s3, "fr", {"a": 1})
    etag = get_locale(_event("fr"), None)["headers"]["ETag"]
    resp = get_locale(_event("fr", headers={hdr_name: etag}), None)
    assert resp["statusCode"] == 304
    assert not resp.get("body")
    assert resp["headers"]["ETag"] == etag
    assert resp["headers"]["Cache-Control"] == "public, max-age=604800"


def test_if_none_match_list_and_weak_match(s3):
    _put(s3, "en", {"a": 1})
    etag = get_locale(_event("en"), None)["headers"]["ETag"]
    assert get_locale(_event("en", headers={"If-None-Match": f'"other", W/{etag}'}), None)["statusCode"] == 304
    assert get_locale(_event("en", headers={"If-None-Match": "*"}), None)["statusCode"] == 304


def test_non_matching_if_none_match_returns_200(s3):
    _put(s3, "en", {"a": 1})
    resp = get_locale(_event("en", headers={"If-None-Match": '"deadbeef"'}), None)
    assert resp["statusCode"] == 200


@pytest.mark.parametrize("locale", ["de", "EN", "en-US", "../en", "", None, "pcm"])
def test_bad_locale_400(s3, locale):
    assert get_locale(_event(locale), None)["statusCode"] == 400


def test_missing_object_404(s3):
    resp = get_locale(_event("pid"), None)
    assert resp["statusCode"] == 404


def test_missing_bucket_is_500_not_404(s3):
    s3.delete_bucket(Bucket="test-i18n-bucket")
    resp = get_locale(_event("en"), None)
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"]) == {"error": "Internal server error"}


def test_unhandled_error_500(s3, monkeypatch):
    monkeypatch.delenv("I18N_BUCKET")
    resp = get_locale(_event("en"), None)
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"]) == {"error": "Internal server error"}


# -- seed files ---------------------------------------------------------------

def _flatten(d, prefix=""):
    keys = {}
    for k, v in d.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(_flatten(v, path))
        else:
            keys[path] = v
    return keys


def _load(locale):
    with open(os.path.join(_I18N_DIR, f"{locale}.json"), encoding="utf-8") as f:
        return json.load(f)


def test_seed_files_have_identical_key_sets():
    en, fr, pid = (set(_flatten(_load(l))) for l in ("en", "fr", "pid"))
    assert en == fr, f"fr diff: missing={en - fr} extra={fr - en}"
    assert en == pid, f"pid diff: missing={en - pid} extra={pid - en}"


def test_seed_values_are_non_empty_strings():
    for locale in ("en", "fr", "pid"):
        for key, value in _flatten(_load(locale)).items():
            assert isinstance(value, str) and value.strip(), f"{locale}:{key}"


def test_seed_placeholders_match_across_locales():
    en = _flatten(_load("en"))
    for locale in ("fr", "pid"):
        other = _flatten(_load(locale))
        for key, value in en.items():
            assert set(re.findall(r"\{(\w+)\}", value)) == set(re.findall(r"\{(\w+)\}", other[key])), \
                f"{locale}:{key}"


def _triage_symptom_codes():
    rules = os.path.join(_BACKEND, "health_track", "lambdas", "triage", "rules")
    codes = set()
    for name in ("adult_red_flags.py", "child_under_5.py", "obstetric.py"):
        with open(os.path.join(rules, name), encoding="utf-8") as f:
            codes.update(re.findall(r'^\s*\("(\w+)",', f.read(), flags=re.M))
    return codes


def test_triage_namespace_covers_every_rule_symptom_code():
    codes = _triage_symptom_codes()
    assert len(codes) >= 30
    en = _load("en")
    assert codes <= set(en["triage"]["symptoms"]), codes - set(en["triage"]["symptoms"])
    for urgency in ("RED", "AMBER", "GREEN"):
        assert urgency in en["triage"]["urgency"]
        assert urgency in en["triage"]["recommendation"]


def test_ussd_namespace_covers_session_engine_strings():
    en = _load("en")
    ussd = en["ussd"]
    for key in ("menu", "first_aid", "triage_q1", "triage_q2", "triage_done", "facility_prompt",
                "facility_searching", "callback_confirm", "callback_done", "invalid_choice", "enter_number"):
        assert key in ussd, key
    for sym in ("fever", "difficulty_breathing", "chest_pain", "severe_headache", "other"):
        assert sym in ussd["triage_q2"]["options"]


def test_seed_uploads_all_locales_idempotently(s3):
    seed = _load_seed_module()
    uploaded, skipped = seed.seed("test-i18n-bucket", s3_client=s3)
    assert (uploaded, skipped) == (3, 0)
    uploaded, skipped = seed.seed("test-i18n-bucket", s3_client=s3)
    assert (uploaded, skipped) == (0, 3)
    obj = s3.get_object(Bucket="test-i18n-bucket", Key="i18n/fr.json")
    assert obj["ContentType"].startswith("application/json")
    assert json.loads(obj["Body"].read()) == _load("fr")
    resp = get_locale(_event("pid"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == _load("pid")


def test_seed_requires_bucket(monkeypatch):
    seed = _load_seed_module()
    monkeypatch.delenv("I18N_BUCKET", raising=False)
    with pytest.raises(SystemExit):
        seed.main([])
