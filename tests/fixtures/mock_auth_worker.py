import json
import sys
import time

request = json.loads(sys.stdin.read())
action = request.get("action")
if action == "login" and request.get("username") == "mfa@example.invalid":
    result = {"status": "mfa", "method": "email", "state": {"domain": "garmin.com", "mock": True}}
elif action == "login" and request.get("username") == "reject@example.invalid":
    result = {"status": "error", "code": "invalid_credentials", "message": "Synthetic credential rejection"}
elif action in ("login", "mfa", "refresh"):
    now = int(time.time())
    result = {
        "status": "success",
        "subject": "profile:synthetic-smoke-test",
        "tokens": {
            "accessToken": f"synthetic-access-{action}-{now}",
            "refreshToken": f"synthetic-refresh-{action}-{now}",
            "clientId": "synthetic-client",
            "expiresAt": now + 3600,
        },
    }
else:
    result = {"status": "error", "code": "invalid_request", "message": "Synthetic invalid request"}
sys.stdout.write(json.dumps(result))
