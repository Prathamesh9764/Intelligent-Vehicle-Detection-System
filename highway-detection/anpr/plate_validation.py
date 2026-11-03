# """
# License plate validation with safe OCR-confusion correction.

# Rule: if the OCR read already passes the strict checks (HSRP/BH regex +
# valid state code) it is accepted UNTOUCHED — we never "correct" a good
# read. Correction only runs on invalid reads, and a corrected result is
# only accepted when it passes the same strict checks.
# """
# import re

# # --- VALID STATE CODES ---
# VALID_STATES = {
#     "AP", "AR", "AS", "BR", "CG", "GA", "GJ", "HR", "HP", "JH",
#     "KA", "KL", "MP", "MH", "MN", "ML", "MZ", "NL", "OD", "PB",
#     "RJ", "SK", "TN", "TS", "TR", "UP", "UK", "WB",
#     "AN", "CH", "DD", "DL", "DN", "JK", "LA", "LD", "PY",
# }

# # --- PLATE FORMAT PATTERNS ---
# HSRP_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,2}\d{4}$")
# BH_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")
# DL_PATTERN = re.compile(r"^DL\d{1,2}[A-Z]{1,3}\d{4}$")   # +new

# # --- COMMON OCR CHARACTER CONFUSIONS ---
# STATE_CONFUSION = {
#     "N": "M", "M": "N", "0": "O", "O": "0",
#     "1": "I", "I": "1", "5": "S", "S": "5",
#     "8": "B", "B": "8", "D": "O", "Q": "O",
#     "U": "V", "V": "U",
# }

# # Confusion swaps are only tried at characters the model is unsure
# # about (per-char softmax max below this threshold).
# CONFUSION_CONF_THRESHOLD = 0.7


# def clean_plate_text(text):
#     """Remove separators, uppercase, strip non-alphanumerics."""
#     if not text:
#         return ""
#     text = str(text).upper().strip()
#     text = re.sub(r"[\s.\-_]", "", text)
#     text = re.sub(r"[^A-Z0-9]", "", text)
#     return text


# def fix_state_code(state_code):
#     """Try to correct a 2-char state prefix using common OCR confusions."""
#     if len(state_code) != 2 or state_code in VALID_STATES:
#         return state_code
#     a, b = state_code[0], state_code[1]
#     for candidate in [
#         STATE_CONFUSION.get(a, a) + b,
#         a + STATE_CONFUSION.get(b, b),
#         STATE_CONFUSION.get(a, a) + STATE_CONFUSION.get(b, b),
#     ]:
#         if candidate in VALID_STATES:
#             return candidate
#     return state_code


# def _is_valid(plate):
#     if not plate:
#         return False
#     if BH_PATTERN.match(plate):
#         return True
#     if plate[:2] == "DL":                                  # +new
#         return bool(DL_PATTERN.match(plate))                # +new
#     return bool(HSRP_PATTERN.match(plate) and plate[:2] in VALID_STATES)


# def validate_plate(text, probs=None):
#     """
#     Full pipeline: clean -> route BH vs HSRP -> correct -> validate.

#     Args:
#         text: OCR output (or any plate-ish string).
#         probs: optional per-character confidence (0-1) for the OCR read.

#     Returns:
#         (is_valid: bool, plate: str, was_corrected: bool)
#     """
#     original = clean_plate_text(text)
#     if not original or len(original) < 6:
#         return False, original, False

#     # Already valid? Accept untouched — never "correct" a good read.
#     if _is_valid(original):
#         return True, original, False

#     # BH-series: no state code and no safe correction — reject as-is.
#     if original[:2].isdigit():
#         return False, original, False

#     # 1. State-code lexicon fix (safe: closed set of 36 states).
#     fixed_state = fix_state_code(original[:2])
#     if fixed_state != original[:2]:
#         candidate = fixed_state + original[2:]
#         if _is_valid(candidate):
#             return True, candidate, True

#     # 2. Single-position confusion swap at low-confidence characters.
#     if probs is not None:
#         best = None
#         for i in range(min(len(original), len(probs))):
#             if probs[i] >= CONFUSION_CONF_THRESHOLD:
#                 continue
#             alt = STATE_CONFUSION.get(original[i])
#             if not alt or alt == original[i]:
#                 continue
#             candidate = original[:i] + alt + original[i + 1:]
#             if _is_valid(candidate):
#                 # Prefer the swap at the most-uncertain position
#                 # (earliest index as a deterministic tiebreak).
#                 if best is None or probs[i] < best[0]:
#                     best = (probs[i], i, candidate)
#         if best is not None:
#             return True, best[2], True

#     return False, original, False


# if __name__ == "__main__":
#     # Quick manual test
#     samples = [
#         "mh-12 ab.1234", "NH12AB1234", "22BH1234AB", "OL01AB1234",
#         "garbage", "MH12MB7847", "MH1SB1234", "XX12AB1234", "DL8CAY7153",
#     ]
#     for s in samples:
#         valid, plate, corrected = validate_plate(s)
#         print(f"{s!r:18} -> valid={valid}, plate={plate!r}, corrected={corrected}")



"""
License plate validation with safe OCR-confusion correction.

Rule: if the OCR read already passes the strict checks (HSRP/DL/BH regex +
valid state code) it is accepted UNTOUCHED — we never "correct" a good
read. Correction only runs on invalid reads, and a corrected result is
only accepted when it passes the same strict checks.
"""
import re

# --- VALID STATE CODES ---
VALID_STATES = {
    "AP", "AR", "AS", "AN", "BR", "CG", "GA", "GJ", "HR", "HP", "JH",
    "KA", "KL", "MP", "MH", "MN", "ML", "MZ", "NL", "OD", "OR", "PB",
    "RJ", "SK", "TN", "TS", "TR", "UP", "UK", "WB",
    "AN", "CH", "DD", "DL", "DN", "JK", "LA", "LD", "PY",
}

# --- PLATE FORMAT PATTERNS ---
HSRP_PATTERN = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,2}\d{4}$")
BH_PATTERN = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")
DL_PATTERN = re.compile(r"^DL\d{1,2}[A-Z]{1,3}\d{4}$")  # Delhi: up to 3-letter series

# --- COMMON OCR CHARACTER CONFUSIONS ---
STATE_CONFUSION = {
    "N": "M", "M": "N", "0": "O", "O": "0",
    "1": "I", "I": "1", "5": "S", "S": "5",
    "8": "B", "B": "8", "D": "O", "Q": "O",
    "U": "V", "V": "U",
}

# Confusion swaps are only tried at characters the model is unsure
# about (per-char softmax max below this threshold).
CONFUSION_CONF_THRESHOLD = 0.7


def clean_plate_text(text):
    """Remove separators, uppercase, strip non-alphanumerics."""
    if not text:
        return ""
    text = str(text).upper().strip()
    text = re.sub(r"[\s.\-_]", "", text)
    text = re.sub(r"[^A-Z0-9]", "", text)
    return text


def fix_state_code(state_code):
    """Try to correct a 2-char state prefix using common OCR confusions."""
    if len(state_code) != 2 or state_code in VALID_STATES:
        return state_code
    a, b = state_code[0], state_code[1]
    for candidate in [
        STATE_CONFUSION.get(a, a) + b,
        a + STATE_CONFUSION.get(b, b),
        STATE_CONFUSION.get(a, a) + STATE_CONFUSION.get(b, b),
    ]:
        if candidate in VALID_STATES:
            return candidate
    return state_code


DIGIT_CONFUSION = {"0": "8", "8": "0"}


def fix_district_code(plate):
    """
    Correct an impossible '00' district code only.
    A real code like '01' is already valid — leave it alone.
    """
    district = plate[2:4]
    if district != "00":
        return plate  # not 00, nothing to correct here

    for i in (0, 1):
        alt = DIGIT_CONFUSION.get(district[i])
        if not alt:
            continue
        candidate = plate[:2] + district[:i] + alt + district[i + 1:] + plate[4:]
        if _is_valid(candidate):
            return candidate
    return plate


def _is_valid(plate):
    if not plate:
        return False
    if BH_PATTERN.match(plate):
        return True
    if plate[:2] == "DL":
        if not DL_PATTERN.match(plate):
            return False
        return plate[2:4] != "00"  # district 00 doesn't exist
    if not (HSRP_PATTERN.match(plate) and plate[:2] in VALID_STATES):
        return False
    return plate[2:4] != "00"  # district 00 doesn't exist


def validate_plate(text, probs=None):
    """
    Full pipeline: clean -> route BH vs DL vs HSRP -> correct -> validate.

    Args:
        text: OCR output (or any plate-ish string).
        probs: optional per-character confidence (0-1) for the OCR read.

    Returns:
        (is_valid: bool, plate: str, was_corrected: bool)
    """
    original = clean_plate_text(text)
    if not original or len(original) < 6:
        return False, original, False

    # Already valid? Accept untouched — never "correct" a good read.
    if _is_valid(original):
        return True, original, False

    # BH-series: no state code and no safe correction — reject as-is.
    if original[:2].isdigit():
        return False, original, False

    # 1. State-code lexicon fix (safe: closed set of 36 states).
    fixed_state = fix_state_code(original[:2])
    if fixed_state != original[:2]:
        candidate = fixed_state + original[2:]
        if _is_valid(candidate):
            return True, candidate, True

    # 1b. District-code fix (safe: only fires on an impossible '00').
    fixed_district = fix_district_code(original)
    if fixed_district != original:
        return True, fixed_district, True

    # 2. Single-position confusion swap at low-confidence characters.
    if probs is not None:
        best = None
        for i in range(min(len(original), len(probs))):
            if probs[i] >= CONFUSION_CONF_THRESHOLD:
                continue
            alt = STATE_CONFUSION.get(original[i])
            if not alt or alt == original[i]:
                continue
            candidate = original[:i] + alt + original[i + 1:]
            if _is_valid(candidate):
                # Prefer the swap at the most-uncertain position
                # (earliest index as a deterministic tiebreak).
                if best is None or probs[i] < best[0]:
                    best = (probs[i], i, candidate)
        if best is not None:
            return True, best[2], True

    return False, original, False


if __name__ == "__main__":
    # Quick manual test
    samples = [
        "mh-12 ab.1234", "NH12AB1234", "22BH1234AB", "OL01AB1234",
        "garbage", "MH12MB7847", "MH1SB1234", "XX12AB1234",
        "DL1CAB1234",  # DL 3-letter series
        "UP00EU0759",  # district 00 -> should correct to UP80EU0759
        "MH01AB1234",  # district 01 -> already valid, must NOT go through fix_district_code
        "DL00CAY7153",  # DL + district 00
    ]
    for s in samples:
        valid, plate, corrected = validate_plate(s)
        print(f"{s!r:18} -> valid={valid}, plate={plate!r}, corrected={corrected}")