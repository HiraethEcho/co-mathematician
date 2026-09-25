"""JSON-line interface, used only by the local Node application process."""
from __future__ import annotations

import json
import sys

from .web_service import WebService


def main():
    service = WebService()
    for line in sys.stdin:
        request_id = None
        try:
            if len(line) > 15_000_000:
                raise ValueError("请求过大")
            request = json.loads(line)
            request_id = request.get("id")
            result = service.dispatch(request.get("method"), request.get("params", {}))
            response = {"id": request_id, "result": result}
        except Exception as exc:
            response = {"id": request_id, "error": str(exc)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
