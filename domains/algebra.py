"""
domains/algebra.py — Algebra-specific helpers for Phren.

Topic progressions, answer validators, and common misconception patterns
for basic algebra (Algebra 1 / beginning Algebra 2).

Used by the lesson generation engine to validate output and by the
grading pipeline to score student answers deterministically.
"""

# ---- Standard topic progression (TEKS-informed, simplified for POC) ----

TOPIC_PROGRESSION = [
    # Unit 1: Solving Linear Equations
    "one-step-addition-subtraction",      # x + a = b, x - a = b
    "one-step-multiplication-division",   # ax = b, x/a = b
    "two-step-equations",                 # ax + b = c
    "two-step-negative-coefficients",     # -ax + b = c or ax - b = c
    "variables-on-both-sides",            # ax + b = cx + d
    "equations-with-fractions",           # x/a + b = c/d
    # Unit 2: Graphing Linear Equations
    "coordinate-plane",                   # plotting points
    "slope",                              # rise/run, positive/negative/zero/undefined
    "slope-intercept-form",               # y = mx + b
    "graphing-from-equation",             # plot y = mx + b
    "writing-equations-from-graph",       # given a graph, write the equation
    "point-slope-form",                   # y - y₁ = m(x - x₁) (optional for POC)
    # Unit 3: Systems of Linear Equations
    "solving-by-graphing",                # find intersection
    "solving-by-substitution",            # algebraic method
    "solving-by-elimination",             # add/subtract equations
    "systems-word-problems",              # translate scenario to system
]

# ---- Misconception tag definitions (for human-readable labels) ----

MISCONCEPTION_LABELS = {
    "added-instead-of-subtracted": "Added instead of subtracted",
    "multiplied-instead-of-divided": "Multiplied instead of divided",
    "sign-error": "Sign error (positive vs negative)",
    "order-of-operations": "Order of operations error",
    "distributive-error": "Distributive property error",
    "combining-unlike-terms": "Combined unlike terms",
    "inverse-error": "Used wrong inverse operation",
    "fraction-error": "Fraction handling error",
    "equation-setup-error": "Set up equation incorrectly",
    "graphing-axis-swap": "Swapped x and y axes",
    "slope-calculation-error": "Slope calculation error",
    "substitution-error": "Substitution error",
    "elimination-error": "Elimination method error",
    "arithmetic-error": "Arithmetic calculation error",
    "random-guess": "No clear pattern (possible guessing)",
}

VALID_TAGS = set(MISCONCEPTION_LABELS.keys())


# ---- Deterministic answer validators ----

def validate_numeric_answer(expected, actual):
    """Compare numeric answers with tolerance for float arithmetic."""
    try:
        return abs(float(expected) - float(actual)) < 1e-9
    except (ValueError, TypeError):
        return str(expected).strip().lower() == str(actual).strip().lower()


def validate_algebra_answer(expected, actual):
    """Validate an algebra answer (number or simple expression).

    Handles:
    - Numeric answers (with float tolerance)
    - Simple expressions like 'x=5', 'x = 5'
    - Fractions like '1/2'
    """
    expected_str = str(expected).strip()
    actual_str = str(actual).strip()

    # Exact match
    if expected_str.lower() == actual_str.lower():
        return True

    # Try numeric comparison
    try:
        e_val = float(expected_str)
        a_val = float(actual_str)
        return abs(e_val - a_val) < 1e-9
    except (ValueError, TypeError):
        pass

    # Try stripping 'x=' prefix
    for s in [expected_str, actual_str]:
        if s.lower().startswith("x="):
            s = s[2:].strip()
        if s.lower().startswith("x ="):
            s = s[3:].strip()

    try:
        e_val = float(expected_str.replace("x=", "").replace("x =", "").strip())
        a_val = float(actual_str.replace("x=", "").replace("x =", "").strip())
        return abs(e_val - a_val) < 1e-9
    except (ValueError, TypeError):
        pass

    return False


# ---- Topic utility ----

def get_topic_for_day(week: int, day: int, syllabus_topics: list[str]) -> str:
    """Map a week/day to a topic from the syllabus.

    Args:
        week: Week number (1-indexed)
        day: Day number (1-5)
        syllabus_topics: List of topic strings from crystallization report

    Returns:
        Best-fit topic string, or falls back to progression list.
    """
    idx = (week - 1) * 5 + (day - 1)
    if idx < len(syllabus_topics):
        return syllabus_topics[idx]
    if idx < len(TOPIC_PROGRESSION):
        return TOPIC_PROGRESSION[idx]
    return "mixed-practice"


def get_prerequisites(topic: str) -> list[str]:
    """Get prerequisite topics for a given algebra topic."""
    prereqs = {
        "one-step-addition-subtraction": ["basic-arithmetic"],
        "one-step-multiplication-division": ["one-step-addition-subtraction", "multiplication-facts"],
        "two-step-equations": ["one-step-addition-subtraction", "one-step-multiplication-division"],
        "two-step-negative-coefficients": ["two-step-equations", "integer-operations"],
        "variables-on-both-sides": ["two-step-equations", "combining-like-terms"],
        "equations-with-fractions": ["two-step-equations", "fraction-operations"],
        "coordinate-plane": ["integer-operations", "number-line"],
        "slope": ["coordinate-plane", "subtraction", "division"],
        "slope-intercept-form": ["slope", "coordinate-plane", "two-step-equations"],
        "graphing-from-equation": ["slope-intercept-form", "coordinate-plane"],
        "writing-equations-from-graph": ["slope", "slope-intercept-form"],
        "solving-by-graphing": ["graphing-from-equation"],
        "solving-by-substitution": ["two-step-equations", "evaluating-expressions"],
        "solving-by-elimination": ["two-step-equations", "integer-operations"],
        "systems-word-problems": ["solving-by-substitution", "solving-by-elimination"],
    }
    return prereqs.get(topic, ["basic-arithmetic"])


# ---- Lesson validation ----

def validate_lesson(lesson: dict) -> list[str]:
    """Validate a lesson object. Returns list of issues (empty = valid)."""
    issues = []

    if not isinstance(lesson, dict):
        return ["Lesson is not a dict"]

    if "day" not in lesson:
        issues.append("Missing 'day' field")
    if "title" not in lesson:
        issues.append("Missing 'title' field")
    if "steps" not in lesson or not isinstance(lesson["steps"], list):
        issues.append("Missing or invalid 'steps' list")
        return issues

    steps = lesson["steps"]
    has_precheck = any(s.get("type") == "precheck" for s in steps)
    has_teach = any(s.get("type") == "teach" for s in steps)
    has_practice = any(s.get("type") == "practice" for s in steps)

    if not has_precheck:
        issues.append("Missing precheck step")
    if not has_teach:
        issues.append("Missing teach step")
    if not has_practice:
        issues.append("Missing practice step")

    # Validate practice questions have distractors with reason tags
    for step in steps:
        if step.get("type") in ("precheck", "practice"):
            for q in step.get("questions", []):
                options = q.get("options", [])
                correct_count = sum(1 for o in options if o.get("correct"))
                if correct_count != 1:
                    issues.append(f"Question {q.get('id', '?')}: must have exactly 1 correct option, found {correct_count}")

                for opt in options:
                    if opt.get("correct"):
                        continue
                    reason = opt.get("reason", "")
                    if not reason:
                        issues.append(f"Question {q.get('id', '?')}: wrong option '{opt.get('text', '?')}' missing 'reason' tag")

    return issues


__all__ = [
    "TOPIC_PROGRESSION",
    "MISCONCEPTION_LABELS",
    "VALID_TAGS",
    "validate_numeric_answer",
    "validate_algebra_answer",
    "get_topic_for_day",
    "get_prerequisites",
    "validate_lesson",
]
