# Copyright 2025-2026 Amazon.com, Inc. or its affiliates.

"""
Lambda Authorizer for JWT validation against OIDC authority (Keycloak).

This Lambda function validates JWT tokens from the Authorization header
and returns IAM policies for API Gateway authorization.

Requirements addressed:
- 2.2: Extract JWT token from Authorization header
- 2.3: Validate JWT against configured OIDC authority
- 2.4: Return Allow policy for valid tokens
- 2.5: Return Deny policy for invalid tokens
- 2.6: Return Deny policy for missing Authorization header
"""

import os
import re
import ssl
from typing import Any, Dict, Union

import jwt
import requests


def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Handle authorization for REST API.

    :param event: Lambda event containing the request details
    :param context: Lambda context

    :return: IAM policy with Allow or Deny effect
    """
    print("REST API authorization handler started")

    try:
        id_token = get_id_token(event)
    except ValueError as e:
        print(f"Token extraction failed: {e}")
        print(f"REST API authorization handler completed with 'Deny' for resource {event['methodArn']}")
        return generate_policy(effect="Deny", resource=event["methodArn"])

    if not id_token:
        print("Missing id_token in request. Denying access.")
        print(f"REST API authorization handler completed with 'Deny' for resource {event['methodArn']}")
        return generate_policy(effect="Deny", resource=event["methodArn"])

    authority = os.environ.get("AUTHORITY", "")
    audience = os.environ.get("AUDIENCE", "")

    if jwt_data := id_token_is_valid(id_token=id_token, audience=audience, authority=authority):
        policy = generate_policy(effect="Allow", resource=event["methodArn"], username=jwt_data.get("sub", "unknown"))
        policy["context"] = {"username": jwt_data.get("sub", "unknown")}

        print(f"Generated policy: {policy}")
        print("REST API authorization handler completed with 'Allow' for resource")
        return policy

    print("REST API authorization handler completed with 'Deny' for resource")
    return generate_policy(effect="Deny", resource=event["methodArn"])


def generate_policy(*, effect: str, resource: str, username: str = "username") -> Dict[str, Any]:
    """
    Generate IAM policy for API Gateway authorization.

    :param effect: Allow or Deny
    :param resource: ARN of the API Gateway resource
    :param username: Username to set as principalId

    :return: IAM policy document
    """
    policy = {
        "principalId": username,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{"Action": "execute-api:Invoke", "Effect": effect, "Resource": resource}],
        },
    }
    return policy


def id_token_is_valid(*, id_token: str, audience: str, authority: str) -> Union[Dict[str, Any], bool]:
    """
    Validate JWT token against OIDC authority.

    :param id_token: JWT token to validate
    :param audience: Expected JWT audience
    :param authority: OIDC authority URL (Keycloak issuer)

    :return: Decoded JWT data if valid, False otherwise
    """
    if not jwt.algorithms.has_crypto:
        print("No crypto support for JWT, please install the cryptography dependency")
        return False

    print(f"Fetching OIDC metadata from {authority}/.well-known/openid-configuration")

    # Support custom SSL certificates if provided
    cert_path = os.getenv("SSL_CERT_FILE", None)
    try:
        resp = requests.get(
            f"{authority}/.well-known/openid-configuration",
            verify=cert_path or True,
            timeout=120,
        )
        if resp.status_code != 200:
            print(f"Could not get OIDC metadata: {resp.content}")
            return False

        oidc_metadata = resp.json()

        ctx = ssl.create_default_context()
        if cert_path:
            ctx.load_verify_locations(cert_path)

        jwks_client = jwt.PyJWKClient(oidc_metadata["jwks_uri"], cache_jwk_set=True, lifespan=360, ssl_context=ctx)
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)

        data: dict = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=authority,
            audience=audience,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
            },
        )
        return data
    except requests.exceptions.RequestException as e:
        print(f"Network error fetching OIDC metadata: {e}")
        return False
    except jwt.exceptions.PyJWTError as e:
        print(f"JWT validation error: {e}")
        return False


def get_id_token(event: dict) -> str:
    """
    Extract JWT token from Authorization header.

    Supports both "Bearer <token>" format and raw token format.

    :param event: Lambda event containing headers
    :return: Extracted JWT token string
    :raises ValueError: If Authorization header is missing or invalid
    """
    headers = event.get("headers", {})
    if not headers:
        raise ValueError("Missing headers in event.")

    # Normalize headers to lowercase for case-insensitive lookup
    normalized_headers = {k.lower(): v for k, v in headers.items()}

    # Check for the authorization header
    if "authorization" not in normalized_headers:
        raise ValueError("Missing authorization token.")

    # Pattern to match JWT tokens (with or without Bearer prefix)
    pattern = r"(?:Bearer\s)?([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)"
    auth_token_match = re.match(pattern, normalized_headers["authorization"])

    if auth_token_match:
        return auth_token_match.group(1)
    else:
        raise ValueError("Invalid authorization header format.")
