"""
Firewall unit-test — runs inline, no test runner required.
Verifies hard_block:
  • blocks SSN patterns
  • blocks credit-card-like numbers
  • blocks sensitive field labels (card number, ssn, cvv …)
  • does NOT false-positive on benign values ("Pinterest", "account settings", etc.)
"""
import sys
import pathlib

# Ensure the cognition package is on sys.path
_HERE = pathlib.Path(__file__).parent  # .../src/cognition
sys.path.insert(0, str(_HERE.parent))  # .../src  — makes `from cognition.brain...` work

from cognition.brain.critic import hard_block  # noqa: E402


def run():
    fails = 0

    # ── Should BLOCK ──────────────────────────────────────────────
    cases_should_block = [
        ("SSN value dashes",     "",                          "123-45-6789"),
        ("SSN value no-dashes",  "",                          "123456789"),
        ("card 16-digit spaces", "",                          "4111 1111 1111 1111"),
        ("card 16-digit plain",  "",                          "4111111111111111"),
        ("card 13-digit",        "",                          "4111111111111"),
        ("field: card number",   "credit card number",        ""),
        ("field: ssn full",      "social security number",    ""),
        ("field: cvv",           "cvv",                       ""),
        ("field: ssn abbr",      "ssn",                       ""),
        ("field: card no abbr",  "card no",                   ""),
    ]

    print("\n-- Should BLOCK -------------------------------------")
    for label, intent, value in cases_should_block:
        result = hard_block(intent, value)
        if result is None:
            print(f"  [FAIL] {label!r}: expected a block, got None")
            fails += 1
        else:
            print(f"  [PASS] {label!r}: {result}")

    # ── Should ALLOW (no false positives) ─────────────────────────
    cases_should_allow = [
        ("benign: Pinterest",         "Pinterest",         ""),
        ("benign: account settings",  "account settings",  ""),
        ("benign: username",          "username",          "john.doe"),
        ("benign: email",             "email",             "user@example.com"),
        ("benign: full name",         "full name",         "Jane Doe"),
        ("benign: short number",      "",                  "12345"),
        ("benign: phone",             "phone",             "+1-800-555-0100"),
        ("benign: address",           "street address",    "123 Main St"),
    ]

    print("\n-- Should ALLOW (no false positives) -----------------")
    for label, intent, value in cases_should_allow:
        result = hard_block(intent, value)
        if result is not None:
            print(f"  [FAIL] {label!r}: false-positive — {result}")
            fails += 1
        else:
            print(f"  [PASS] {label!r}: correctly allowed")

    print("\n" + "="*54)
    if fails:
        print(f"FIREWALL TEST FAILED — {fails} case(s) wrong")
        sys.exit(1)
    else:
        print("FIREWALL TEST PASSED -- all cases correct [OK]")


if __name__ == "__main__":
    run()
