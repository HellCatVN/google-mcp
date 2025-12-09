"""
Helper script to exchange an oauth_token cookie (from https://accounts.google.com/EmbeddedSetup)
for a Google master token (EncryptedPasswd) using gpsoauth's alternative flow.

Usage:
  pip install gpsoauth
  python get_master_token.py --email "your@gmail.com" --oauth-token "COOKIE_VALUE" [--android-id "0123456789abcdef"]
"""

import argparse
from gpsoauth import exchange_token

DEFAULT_ANDROID_ID = "0123456789abcdef"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Exchange oauth_token cookie for a Google master token (EncryptedPasswd). "
            "The oauth_token cookie is obtained after signing into https://accounts.google.com/EmbeddedSetup."
        )
    )
    parser.add_argument("--email", required=True, help="Google account email")
    parser.add_argument(
        "--oauth-token",
        required=True,
        help="oauth_token cookie value from https://accounts.google.com/EmbeddedSetup",
    )
    parser.add_argument(
        "--android-id",
        default=DEFAULT_ANDROID_ID,
        help=f"16-hex Android ID (default: {DEFAULT_ANDROID_ID})",
    )
    args = parser.parse_args()

    resp = exchange_token(args.email, args.oauth_token, args.android_id)
    if "Token" not in resp:
        raise SystemExit(f"Failed to get master token. Response: {resp}")

    print("Master token (EncryptedPasswd):")
    print(resp["Token"])


if __name__ == "__main__":
    main()
