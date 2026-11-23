"""Direct Garmin SSO/DI OAuth worker.

Protocol: one JSON request on stdin, one JSON result on stdout. Passwords and
cookies are never logged. The parent encrypts any returned MFA state at rest.
Only curl_cffi/requests are used; no Garmin client library is involved.
"""

from __future__ import annotations

import base64
import json
import random
import sys
import time
from typing import Any

import requests
from curl_cffi import requests as curl

DI_GRANT = "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket"
DI_CLIENTS = (
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
    "GARMIN_CONNECT_MOBILE_ANDROID_DI",
    "GARMIN_CONNECT_MOBILE_IOS_DI",
)
IOS_CLIENT = "GCM_IOS_DARK"
PORTAL_CLIENT = "GarminConnect"
IOS_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
NATIVE_UA = "GCM-Android-5.23"
NATIVE_X_UA = (
    "com.garmin.android.apps.connectmobile/5.23; ; "
    "Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0"
)


class Failure(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


class MfaRequired(Exception):
    def __init__(self, state: dict[str, Any], method: str):
        self.state = state
        self.method = method


def jwt_claims(token: str) -> dict[str, Any]:
    try:
        header_part, payload_part, *_ = token.split(".")
        header = json.loads(base64.urlsafe_b64decode(header_part + "=" * (-len(header_part) % 4)))
        if header.get("alg") == "none":
            return {}
        return json.loads(base64.urlsafe_b64decode(payload_part + "=" * (-len(payload_part) % 4)))
    except (ValueError, TypeError, json.JSONDecodeError):
        return {}


def native_headers(access_token: str | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": NATIVE_UA,
        "X-Garmin-User-Agent": NATIVE_X_UA,
        "X-Garmin-Paired-App-Version": "10861",
        "X-Garmin-Client-Platform": "Android",
        "X-App-Ver": "10861",
        "X-Lang": "en",
        "X-GCExperience": "GC5",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "application/json",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def api_headers() -> dict[str, str]:
    return {"Accept": "application/json", "Content-Type": "application/json"}


def checked(response: Any, context: str) -> Any:
    if response.status_code in (427, 429):
        raise Failure("rate_limited", f"Garmin rate-limited {context}; wait before retrying", True)
    if response.status_code == 403:
        raise Failure("upstream_blocked", f"Garmin blocked {context}; try again later", True)
    return response


def new_session(impersonate: str = "safari_ios") -> Any:
    return curl.Session(impersonate=impersonate, timeout=30)


def cookie_state(session: Any) -> list[dict[str, Any]]:
    jar = getattr(session.cookies, "jar", session.cookies)
    return [
        {
            "name": cookie.name,
            "value": cookie.value,
            "domain": cookie.domain,
            "path": cookie.path,
            "secure": cookie.secure,
            "expires": cookie.expires,
            "domain_specified": cookie.domain_specified,
        }
        for cookie in jar
    ]


def restore_cookies(session: Any, cookies: list[dict[str, Any]]) -> None:
    jar = getattr(session.cookies, "jar", session.cookies)
    for item in cookies:
        cookie = requests.cookies.create_cookie(
            item["name"],
            item["value"],
            domain=item["domain"],
            path=item["path"],
            secure=bool(item["secure"]),
            expires=item.get("expires"),
        )
        cookie.domain_specified = bool(item.get("domain_specified"))
        jar.set_cookie(cookie)


def serialize_state(
    session: Any,
    *,
    domain: str,
    flow: str,
    method: str,
    login_params: dict[str, str],
    post_headers: dict[str, str],
    service_url: str,
    impersonate: str,
) -> dict[str, Any]:
    return {
        "domain": domain,
        "flow": flow,
        "method": method,
        "login_params": login_params,
        "post_headers": post_headers,
        "service_url": service_url,
        "impersonate": impersonate,
        "cookies": cookie_state(session),
    }


def restore_session(state: dict[str, Any]) -> Any:
    if state.get("domain") not in ("garmin.com", "garmin.cn"):
        raise Failure("invalid_state", "The saved MFA region is invalid")
    if state.get("flow") not in ("ios", "portal"):
        raise Failure("invalid_state", "The saved MFA flow is invalid")
    if state.get("impersonate") not in ("safari_ios", "safari", "chrome", "chrome120"):
        raise Failure("invalid_state", "The saved MFA transport is invalid")
    session = new_session(state["impersonate"])
    restore_cookies(session, state.get("cookies", []))
    return session


def di_post(domain: str, client_id: str, data: dict[str, str], accept: str = "application/json") -> Any:
    basic = base64.b64encode(f"{client_id}:".encode()).decode()
    headers = native_headers()
    headers.update({
        "Authorization": f"Basic {basic}",
        "Accept": accept,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
    })
    response = new_session("chrome").post(
        f"https://diauth.{domain}/di-oauth2-service/oauth/token",
        headers=headers,
        data=data,
    )
    return checked(response, "the token exchange")


def token_result(data: dict[str, Any], fallback_client: str, previous_refresh: str | None = None) -> dict[str, Any]:
    access = data.get("access_token")
    refresh = data.get("refresh_token") or previous_refresh
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
        raise Failure("upstream", "Garmin returned an incomplete token response")
    claims = jwt_claims(access)
    client_id = str(claims.get("client_id") or fallback_client)
    now = int(time.time())
    exp = claims.get("exp")
    expires_at = int(exp) if isinstance(exp, (int, float)) else now + int(data.get("expires_in", 3600))
    if expires_at <= now:
        raise Failure("upstream", "Garmin returned an already expired token")
    return {"accessToken": access, "refreshToken": refresh, "clientId": client_id, "expiresAt": expires_at}


def verify_and_subject(domain: str, tokens: dict[str, Any]) -> str:
    response = new_session("chrome").get(
        f"https://connectapi.{domain}/userprofile-service/socialProfile",
        headers=native_headers(tokens["accessToken"]),
    )
    checked(response, "profile verification")
    if response.status_code == 401:
        raise Failure("reauth_required", "Garmin rejected the new session")
    if not response.ok:
        raise Failure("upstream", f"Garmin profile verification returned HTTP {response.status_code}", True)
    try:
        profile = response.json()
    except ValueError as error:
        raise Failure("upstream", "Garmin returned an invalid profile response") from error
    profile_id = profile.get("profileId") if isinstance(profile, dict) else None
    if isinstance(profile_id, (str, int)) and str(profile_id):
        return f"profile:{profile_id}"
    claims = jwt_claims(tokens["accessToken"])
    for key in ("sub", "garmin_guid"):
        value = claims.get(key)
        if isinstance(value, (str, int)) and str(value):
            return f"jwt:{key}:{value}"
    raise Failure("upstream", "The Garmin account had no stable identifier")


def exchange_ticket(domain: str, ticket: str, service_url: str) -> dict[str, Any]:
    last_status = 0
    for client_id in DI_CLIENTS:
        response = di_post(domain, client_id, {
            "client_id": client_id,
            "service_ticket": ticket,
            "grant_type": DI_GRANT,
            "service_url": service_url,
        }, "application/json,text/html;q=0.9,*/*;q=0.8")
        last_status = response.status_code
        if not response.ok:
            continue
        try:
            return token_result(response.json(), client_id)
        except (ValueError, KeyError, TypeError):
            continue
    raise Failure("upstream", f"Garmin could not exchange the login ticket (last HTTP {last_status})", True)


def finish_login(domain: str, ticket: str, service_url: str) -> dict[str, Any]:
    tokens = exchange_ticket(domain, ticket, service_url)
    subject = verify_and_subject(domain, tokens)
    return {"status": "success", "subject": subject, "tokens": tokens}


def parse_login_response(response: Any) -> dict[str, Any]:
    checked(response, "sign-in")
    try:
        payload = response.json()
    except ValueError as error:
        raise Failure("upstream", f"Garmin sign-in returned HTTP {response.status_code} instead of JSON", True) from error
    return payload


def credential_login(flow: str, domain: str, username: str, password: str) -> dict[str, Any]:
    if flow == "ios":
        root = f"https://sso.{domain}/mobile"
        signin = f"{root}/sso/en_US/sign-in"
        client_id = IOS_CLIENT
        service_url = f"https://mobile.integration.{domain}/gcm/ios"
        locale = "en-US"
        impersonate = "safari_ios"
        user_agent = IOS_UA
        delay = (2, 5)
    else:
        root = f"https://sso.{domain}/portal"
        signin = f"{root}/sso/en-US/sign-in"
        client_id = PORTAL_CLIENT
        service_url = f"https://connect.{domain}/app"
        locale = "en-US"
        impersonate = "chrome"
        user_agent = DESKTOP_UA
        delay = (10, 20)

    page_params = {"clientId": client_id, "service": service_url}
    session = new_session(impersonate)
    checked(session.get(signin, params=page_params, headers={
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }), "the sign-in page")
    time.sleep(random.uniform(*delay))

    login_params = {"clientId": client_id, "locale": locale, "service": service_url}
    post_headers = {
        "User-Agent": user_agent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        "Origin": f"https://sso.{domain}",
        "Referer": f"{signin}?clientId={client_id}&service={service_url}",
    }
    response = session.post(f"{root}/api/login", params=login_params, headers=post_headers, json={
        "username": username,
        "password": password,
        "rememberMe": True,
        "captchaToken": "",
    })
    payload = parse_login_response(response)
    response_type = payload.get("responseStatus", {}).get("type")
    if response_type == "INVALID_USERNAME_PASSWORD":
        raise Failure("invalid_credentials", "Garmin rejected the email or password")
    if response_type == "CAPTCHA_REQUIRED":
        raise Failure("captcha_required", "Garmin requested a CAPTCHA. Sign in to Garmin Connect in a browser, then retry later", True)
    if response_type == "MFA_REQUIRED":
        method = str(payload.get("customerMfaInfo", {}).get("mfaLastMethodUsed", "email"))
        state = serialize_state(session, domain=domain, flow=flow, method=method,
                                login_params=login_params, post_headers=post_headers,
                                service_url=service_url, impersonate=impersonate)
        raise MfaRequired(state, method)
    if response_type != "SUCCESSFUL" or not isinstance(payload.get("serviceTicketId"), str):
        if payload.get("error", {}).get("status-code") == "429":
            raise Failure("rate_limited", "Garmin rate-limited sign-in", True)
        raise Failure("upstream", "Garmin sign-in did not complete; the service may have changed", True)
    return finish_login(domain, payload["serviceTicketId"], service_url)


def login(domain: str, username: str, password: str) -> dict[str, Any]:
    infrastructure_failure: Failure | None = None
    for flow in ("ios", "portal"):
        try:
            return credential_login(flow, domain, username, password)
        except MfaRequired:
            raise
        except Failure as error:
            if error.code == "invalid_credentials":
                raise
            infrastructure_failure = error
    raise infrastructure_failure or Failure("upstream", "Garmin sign-in failed", True)


def complete_mfa(code: str, state: dict[str, Any]) -> dict[str, Any]:
    domain = str(state["domain"])
    flow = str(state["flow"])
    session = restore_session(state)
    body = {
        "mfaMethod": state.get("method", "email"),
        "mfaVerificationCode": code,
        "rememberMyBrowser": True,
        "reconsentList": [],
        "mfaSetup": False,
    }
    paths = [flow]
    paths.append("portal" if flow == "ios" else "ios")
    last_error = "Garmin rejected the verification code"
    for path in paths:
        root = f"https://sso.{domain}/{path}"
        params = state["login_params"] if path == flow else {
            "clientId": PORTAL_CLIENT if path == "portal" else IOS_CLIENT,
            "locale": "en-US",
            "service": f"https://connect.{domain}/app" if path == "portal" else f"https://mobile.integration.{domain}/gcm/ios",
        }
        response = session.post(f"{root}/api/mfa/verifyCode", params=params,
                                headers=state["post_headers"], json=body)
        payload = parse_login_response(response)
        if payload.get("responseStatus", {}).get("type") == "SUCCESSFUL" and isinstance(payload.get("serviceTicketId"), str):
            return finish_login(domain, payload["serviceTicketId"], str(state["service_url"]))
        if payload.get("responseStatus", {}).get("type") == "INVALID_USERNAME_PASSWORD":
            last_error = "Garmin rejected the verification code"
        else:
            last_error = "Garmin could not verify the code; request a new sign-in if it expired"
    raise Failure("invalid_mfa", last_error, True)


def refresh(domain: str, tokens: dict[str, Any]) -> dict[str, Any]:
    current = {
        "accessToken": str(tokens["accessToken"]),
        "refreshToken": str(tokens["refreshToken"]),
        "clientId": str(tokens["clientId"]),
        "expiresAt": int(tokens["expiresAt"]),
    }
    response = di_post(domain, current["clientId"], {
        "grant_type": "refresh_token",
        "client_id": current["clientId"],
        "refresh_token": current["refreshToken"],
    })
    if response.status_code in (400, 401):
        raise Failure("reauth_required", "The Garmin session expired; sign in again")
    if not response.ok:
        raise Failure("upstream", f"Garmin token refresh returned HTTP {response.status_code}", True)
    try:
        updated = token_result(response.json(), current["clientId"], current["refreshToken"])
    except ValueError as error:
        raise Failure("upstream", "Garmin returned an invalid refresh response", True) from error
    return {"status": "success", "tokens": updated}


def run(request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    region = request.get("region", "global")
    domain = "garmin.cn" if region == "china" else "garmin.com"
    if action == "login":
        username = request.get("username")
        password = request.get("password")
        if not isinstance(username, str) or not username or not isinstance(password, str) or not password:
            raise Failure("invalid_request", "Email and password are required")
        return login(domain, username, password)
    if action == "mfa":
        code = request.get("code")
        state = request.get("state")
        if not isinstance(code, str) or not code.strip() or not isinstance(state, dict):
            raise Failure("invalid_request", "A verification code and valid MFA state are required")
        return complete_mfa(code.strip(), state)
    if action == "refresh":
        tokens = request.get("tokens")
        if not isinstance(tokens, dict):
            raise Failure("invalid_request", "Tokens are required")
        return refresh(domain, tokens)
    raise Failure("invalid_request", "Unknown worker action")


def main() -> None:
    try:
        request = json.loads(sys.stdin.read())
        if not isinstance(request, dict):
            raise Failure("invalid_request", "Expected a JSON object")
        try:
            result = run(request)
        except MfaRequired as mfa:
            result = {"status": "mfa", "method": mfa.method, "state": mfa.state}
        except Failure as error:
            result = {"status": "error", "code": error.code, "message": error.message, "retryable": error.retryable}
        except Exception:
            result = {"status": "error", "code": "internal", "message": "The authentication worker failed safely", "retryable": True}
        sys.stdout.write(json.dumps(result, separators=(",", ":")))
    except Exception:
        sys.stdout.write(json.dumps({"status": "error", "code": "invalid_request", "message": "Invalid worker request"}))


if __name__ == "__main__":
    main()
