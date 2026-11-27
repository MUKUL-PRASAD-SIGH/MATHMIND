"""LaTeX clean-up before parsing (T3.1).

Learner and OCR LaTeX is noisy: sizing commands, spacing macros, unicode operators and trailing punctuation
all confuse SymPy's parser without changing the maths. ``normalize_latex`` removes that noise only; it never
rewrites the mathematical content.
"""

import re

_UNICODE = {
    chr(0x2212): "-",  # minus sign
    chr(0x2013): "-",  # en dash
    chr(0x00D7): r"\times ",
    chr(0x00F7): r"\div ",
    chr(0x22C5): r"\cdot ",
    chr(0x00B7): r"\cdot ",
    chr(0x2264): r"\le ",
    chr(0x2265): r"\ge ",
    chr(0x2260): r"\neq ",
    chr(0x221A): r"\sqrt",
    chr(0x03C0): r"\pi ",
    chr(0x00B2): "^{2}",
    chr(0x00B3): "^{3}",
}

# Commands that only affect layout or spacing.
_DROP = re.compile(
    r"\\(?:left|right|displaystyle|textstyle|scriptstyle|scriptscriptstyle|bigl|bigr|Bigl|Bigr|big|Big|biggl|biggr|bigg|Bigg)(?![a-zA-Z])"
    r"|\\[,!;:> ]|\\(?:quad|qquad)(?![a-zA-Z])|~"
)
_SPACES = re.compile(r"\s+")


def normalize_latex(latex: str) -> str:
    s = latex
    for src, dst in _UNICODE.items():
        s = s.replace(src, dst)
    s = s.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    s = s.replace(r"\leqslant", r"\le ").replace(r"\geqslant", r"\ge ")
    s = re.sub(r"\\(?:cdot|times)(?![a-zA-Z])", "*", s)
    s = re.sub(r"\\div(?![a-zA-Z])", "/", s)
    s = _DROP.sub(" ", s)
    s = _SPACES.sub(" ", s).strip()
    s = s.strip("$").strip()
    while s and s[-1] in ".,;":
        s = s[:-1].rstrip()
    return s
