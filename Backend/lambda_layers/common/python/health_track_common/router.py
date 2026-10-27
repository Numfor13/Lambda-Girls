"""Single Lambda entry point per domain.

API Gateway routes many methods to one function per domain (fewer cold starts at
low traffic, fewer CloudFormation resources). ROUTES maps "METHOD /resource" to the
handler module, e.g. {"GET /facilities": "get_facilities"}; each module keeps its
own `handler(event, context)`, so handlers stay independently testable.
"""

import importlib
import json
import os

from health_track_common.response import err

ROUTES = json.loads(os.environ.get("ROUTES", "{}"))


def handler(event, context):
    module = ROUTES.get(f"{event.get('httpMethod')} {event.get('resource')}")
    if not module:
        return err(404, "Not found")
    return importlib.import_module(module).handler(event, context)
