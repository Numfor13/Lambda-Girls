# Final Review Fix Wave Report

**Branch:** worktree-fix+final-review-findings
**Date:** 2026-10-21
**Tests:** 107 passed, 0 failed

---

## Critical Fixes Applied

### C1 — Decimal serialization in response.py
- Added `_json_default()` handler converting `decimal.Decimal` to int or float
- `ok()` now accepts optional `status_code` parameter
- File: `Backend/lambda_layers/common/python/health_track_common/response.py`

### C2 — Post-confirmation trigger guard
- Added `triggerSource != "PostConfirmation_ConfirmSignUp"` early return
- Wrapped `put_item` in try/except for `ConditionalCheckFailedException` (idempotent)
- Added connection timeouts to boto3 DynamoDB client
- File: `Backend/health_track/lambdas/auth/post_confirmation.py`

### C3 — API Gateway CloudWatch role
- Added `cloud_watch_role=True` to `RestApi`
- Set `data_trace_enabled=(config.env_name == "dev")` (fixes I2 simultaneously)
- File: `Backend/health_track/profile_stack.py`

---

## Important Fixes Applied

### I1 — JWT claims from API Gateway authorizer
- All 4 profile handlers replaced `decode_claims(...)` with `requestContext.authorizer.claims.sub`
- Removed `from health_track_common.jwt_util import decode_claims` imports
- Files: `get_profile.py`, `put_profile.py`, `post_household.py`, `delete_household_member.py`

### I2 — data_trace_enabled only in dev
- Fixed as part of C3 above.

### I3 — Cross-stack layer reference
- Both `auth_stack.py` and `profile_stack.py` now use `lambda_.LayerVersion.from_layer_version_arn()`
- Passes ARN string token instead of direct object reference — avoids locked CloudFormation exports

### I4 — IAM policy resource scoping
- `shared_stack.py`: DynamoDB policies scoped to `arn:aws:dynamodb:...:table/HealthTrack-*`
- `shared_stack.py`: S3 read policy scoped to `arn:aws:s3:::health-track-{account}-*`
- `shared_stack.py`: S3 write policy scoped to `arn:aws:s3:::health-track-{account}-*/*`
- `auth_stack.py`: post-confirmation Lambda policies scoped to specific table and user pool ARN patterns

### I5 — Pre-signup phone normalization removed
- `pre_signup.py` now only does dev auto-confirm; dead phone normalization removed

### I6 — Ghost profile creation guards
- `put_profile.py`: `ConditionExpression="attribute_exists(user_id)"` + 404 on failure
- `post_household.py`: same condition on update_item
- `delete_household_member.py`: 404 if profile not found; 404 if member_id not in list

### I7 — Input validation and error handling
- All handlers: safe JSON parsing with try/except returning 400
- `post_household.py`: household size cap at 10 members
- All handlers: top-level `except Exception` returning 500 with logged traceback (no stack trace to client)

### I8 — UserPool removal policy
- `auth_stack.py`: `RETAIN` in prod, `DESTROY` in all other environments

### I9 — Test quality improvements
- `test_auth_stack.py`: added `TestUserPoolDeletionPolicy` class with deletion policy and Python 3.12 runtime checks
- `test_profile_stack.py`: added `profile_stack_template` fixture, `TestProfileTableDeletionPolicy` class (RETAIN + PITR), `TestApiAuthorization` class (COGNITO_USER_POOLS)
- `test_shared_stack.py`: updated IAM policy resource assertions to match new scoped ARNs
- Created `Backend/tests/test_profile_handlers.py`: 15 moto-based unit tests covering all handlers

---

## Minor Fixes Applied

### Minor #2 — requirements.txt cleanup
- Removed duplicate `aws-cdk-lib[assertions]>=2.150.0` (extras specifier is a no-op)
- Removed `pytest>=7.0.0` (already in `requirements-dev.txt`)

### Minor #4 — ProfileTable DeletionPolicy test
- Covered by `TestProfileTableDeletionPolicy::test_profile_table_deletion_policy` in `test_profile_stack.py`

---

## Test Results

```
107 passed, 0 failed in 64.86s
```

Files changed: 14 (3 Lambda auth, 4 Lambda profile, 3 stack files, 1 shared layer, 3 test files, 1 requirements)
