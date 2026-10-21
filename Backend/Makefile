PYTHON ?= python
ENV    ?= dev

.PHONY: install deploy-dev diff destroy-dev synth test bootstrap

install:
	$(PYTHON) -m pip install -r requirements.txt -r requirements-dev.txt

bootstrap:
	cdk bootstrap aws://$(shell aws sts get-caller-identity --query Account --output text)/af-south-1 -c env=$(ENV)

synth:
	cdk synth -c env=$(ENV)

deploy-dev:
	cdk deploy --all -c env=dev --require-approval never

diff:
	cdk diff --all -c env=$(ENV)

destroy-dev:
	cdk destroy --all -c env=dev --force

test:
	$(PYTHON) -m pytest tests/ -v --tb=short
