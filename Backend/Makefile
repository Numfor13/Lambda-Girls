PYTHON ?= python
ENV    ?= dev
REGION := us-east-1
# CLI pinned to match aws-cdk-lib in requirements.txt (cloud assembly schema compatibility).
CDK    := npx --yes aws-cdk@2.1146.0

.PHONY: install bootstrap synth nag audit diff deploy params seed test destroy

install:
	$(PYTHON) -m pip install -r requirements.txt -r requirements-dev.txt

bootstrap:
	$(CDK) bootstrap aws://$(shell aws sts get-caller-identity --query Account --output text)/$(REGION) -c env=$(ENV)

synth:
	$(CDK) synth -c env=$(ENV)

# AWS Solutions (Well-Architected-aligned) rule pack; fails on any unsuppressed finding.
nag:
	$(CDK) synth -c env=$(ENV) -c nag=true --quiet

# Known-vulnerability scan of every dependency shipped to Lambda (layers are built by `make synth`).
audit:
	$(PYTHON) -m pip_audit -r requirements.txt
	$(PYTHON) -m pip_audit --path build/push-deps/python --path build/xray-deps/python

diff:
	$(CDK) diff --all -c env=$(ENV)

# Data first, then runtime parameters (encrypted with the Data stack's key), then everything else.
deploy:
	$(CDK) deploy HealthTrack-Data-$(ENV) -c env=$(ENV) --require-approval never
	$(PYTHON) scripts/bootstrap_params.py --env $(ENV)
	$(CDK) deploy --all -c env=$(ENV) --require-approval never

params:
	$(PYTHON) scripts/bootstrap_params.py --env $(ENV)

seed:
	$(PYTHON) scripts/seed_facilities.py --env $(ENV) --region $(REGION)
	$(PYTHON) scripts/seed_i18n.py --region $(REGION) --bucket health-track-i18n-$(shell aws sts get-caller-identity --query Account --output text)-$(ENV)

test:
	$(PYTHON) -m pytest tests/ -q

destroy:
	$(CDK) destroy --all -c env=$(ENV) --force
