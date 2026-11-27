"""LaTeX step -> SymPy object (T3.1).

``parse_step`` returns one of:

* ``Expr``        -- an expression to simplify/compare (``2(x+1)``, or a continuation line ``= 2x+2``)
* ``Equality``    -- an equation (``2x+3=7``)
* ``Relational``  -- an inequality (``x \\le 3``); a compound inequality (``1<x<3``) becomes ``And``
* ``Or``          -- an explicit list of roots (``x=2 \\text{ or } x=3``, ``x \\in \\{2,3\\}``, ``x=2, x=3``)

Symbol policy: single letters (optionally subscripted) are real symbols; ``e`` is Euler's number and ``\\pi``
is pi. Decimals become exact rationals so ``6.5`` compares equal to ``13/2``.

Safety: model/OCR text is never evaluated as Python. The ``parse_expr`` fallback only receives text that
passed a strict character + identifier whitelist (no underscores, quotes, brackets, dots-after-names...).
"""

import contextlib
import re
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import TypeVar

import sympy
from sympy import And, E, Eq, Float, Ge, Gt, Le, Lt, Ne, Or, Rational, Symbol
from sympy.core.function import AppliedUndef
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

from app.services.verification.normalize import normalize_latex

PARSE_TIMEOUT_S = 2.0
T = TypeVar("T")

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sympy")


class UnparseableStep(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class SympyTimeout(Exception):
    pass


def with_timeout(fn: Callable[..., T], timeout: float, *args: object) -> T:
    """Run a SymPy call in a worker thread; raise SympyTimeout if it takes too long.

    Python threads cannot be killed, so a runaway call keeps its worker busy until it finishes; the
    caller gets an answer (``inconclusive``) on time regardless.
    """
    fut = _pool.submit(fn, *args)
    try:
        return fut.result(timeout=timeout)
    except FutureTimeout as exc:
        fut.cancel()
        raise SympyTimeout(f"{getattr(fn, '__name__', 'call')} exceeded {timeout}s") from exc


# ---- splitting ------------------------------------------------------------------------------

_REL_TOKENS: list[tuple[str, type]] = [
    (r"\leq", Le),
    (r"\geq", Ge),
    (r"\neq", Ne),
    (r"\le", Le),
    (r"\ge", Ge),
    (r"\ne", Ne),
    (r"\lt", Lt),
    (r"\gt", Gt),
    ("<=", Le),
    (">=", Ge),
    ("<", Lt),
    (">", Gt),
    ("=", Eq),
]
_OR_SEP = re.compile(r"\\text\s*\{\s*or\s*\}|\\mathrm\s*\{\s*or\s*\}|\\(?:lor|vee)(?![a-zA-Z])|\bor\b")
_IN_SET = re.compile(r"^([a-zA-Z](?:_\{?\w+\}?)?)\s*\\in\s*\\\{(.*)\\\}$")


def _depth_scan(s: str) -> list[int]:
    """Nesting depth of each character (braces, parentheses, brackets)."""
    depth, out = 0, []
    for ch in s:
        if ch in "{([":
            depth += 1
            out.append(depth)
        elif ch in "})]":
            out.append(depth)
            depth = max(0, depth - 1)
        else:
            out.append(depth)
    return out


def _split_top(s: str, sep: str) -> list[str]:
    depth = _depth_scan(s)
    parts, start = [], 0
    for i, ch in enumerate(s):
        if ch == sep and depth[i] == 0:
            parts.append(s[start:i])
            start = i + 1
    parts.append(s[start:])
    return [p.strip() for p in parts]


def _split_relations(s: str) -> tuple[list[str], list[type]]:
    """Split on top-level relation operators. Returns (sides, operators)."""
    depth = _depth_scan(s)
    sides: list[str] = []
    ops: list[type] = []
    i = start = 0
    while i < len(s):
        if depth[i] == 0:
            for tok, op in _REL_TOKENS:
                if s.startswith(tok, i) and not (tok[0] == "\\" and s[i + len(tok) : i + len(tok) + 1].isalpha()):
                    sides.append(s[start:i].strip())
                    ops.append(op)
                    i += len(tok)
                    start = i
                    break
            else:
                i += 1
        else:
            i += 1
    sides.append(s[start:].strip())
    return sides, ops


# ---- expression parsing ---------------------------------------------------------------------

_SYMBOL_NAME = re.compile(r"^[a-zA-Z](?:_\{?[a-zA-Z0-9]+\}?)?$")


def _undo_function_calls(expr: sympy.Basic) -> sympy.Basic:
    """parse_latex reads ``x(x-2)`` as a call of an unknown function ``x``; it means ``x*(x-2)``."""
    for _ in range(10):
        calls = expr.atoms(AppliedUndef)
        if not calls:
            return expr
        repl: dict[sympy.Basic, sympy.Basic] = {}
        for call in calls:
            name = type(call).__name__
            if len(call.args) != 1 or not _SYMBOL_NAME.match(name):
                raise UnparseableStep(f"unknown function {name!r}")
            repl[call] = Symbol(name) * call.args[0]
        expr = expr.xreplace(repl)
    raise UnparseableStep("too deeply nested")


def _apply_policy(expr: sympy.Basic) -> sympy.Basic:
    expr = _undo_function_calls(expr)
    repl: dict[sympy.Basic, sympy.Basic] = {}
    for sym in expr.free_symbols:
        name = str(sym)
        if name == "pi":
            repl[sym] = sympy.pi
            continue
        if not _SYMBOL_NAME.match(name):
            raise UnparseableStep(f"unrecognised symbol {name!r}")
        repl[sym] = E if name == "e" else Symbol(name, real=True)
    for f in expr.atoms(Float):
        repl[f] = Rational(str(f))
    return expr.xreplace(repl)


def _parse_latex(s: str) -> sympy.Basic:
    from sympy.parsing.latex import parse_latex

    return parse_latex(s, strict=True)


_warm_lock = threading.Lock()
_warm = False


def _warm_up() -> None:
    """Load the ANTLR parser once *outside* the timeout: a cold load can exceed 2 s on a busy CPU
    (e.g. while pix2tex runs) and would wrongly make the first step "unparseable"."""
    global _warm
    if _warm:
        return
    with _warm_lock:
        if not _warm:
            with contextlib.suppress(Exception):  # a broken install surfaces on the real call instead
                _parse_latex("1")
            _warm = True


_ALLOWED_TEXT = re.compile(r"^[0-9A-Za-z+\-*/()\s.]*$")
_ALLOWED_NAMES = {"sqrt", "pi", "log", "ln", "exp", "sin", "cos", "tan", "abs"}
_TRANSFORMS = (*standard_transformations, implicit_multiplication_application, convert_xor)


def _latex_to_text(s: str) -> str:
    t = s
    frac = re.compile(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
    sqrt = re.compile(r"\\sqrt\s*\{([^{}]*)\}")
    for _ in range(20):
        new = sqrt.sub(r"sqrt(\1)", frac.sub(r"((\1)/(\2))", t))
        if new == t:
            break
        t = new
    t = re.sub(r"\\(pi|ln|log|exp|sin|cos|tan)(?![a-zA-Z])", r" \1 ", t)
    t = t.replace("^", "**").replace("{", "(").replace("}", ")")
    return t


def _fallback(s: str) -> sympy.Basic:
    text = _latex_to_text(s)
    if not _ALLOWED_TEXT.match(text):
        raise UnparseableStep("unsupported characters")
    for name in re.findall(r"[A-Za-z]{2,}", text):
        if name not in _ALLOWED_NAMES:
            raise UnparseableStep(f"unsupported command {name!r}")
    if re.search(r"[A-Za-z]\s*\.|\.\s*[A-Za-z]", text):
        raise UnparseableStep("unsupported characters")
    local = {name: getattr(sympy, name) for name in ("sqrt", "pi", "log", "exp", "sin", "cos", "tan")}
    local["ln"] = sympy.log
    local["abs"] = sympy.Abs
    return parse_expr(text, local_dict=local, transformations=_TRANSFORMS)


def parse_expression(latex: str) -> sympy.Expr:
    """Parse one side (no relation operators) into a SymPy expression."""
    s = latex.strip()
    if not s:
        raise UnparseableStep("empty expression")
    _warm_up()
    try:
        expr = with_timeout(_parse_latex, PARSE_TIMEOUT_S, s)
    except SympyTimeout as exc:
        raise UnparseableStep("parsing took too long") from exc
    except Exception:
        try:
            expr = with_timeout(_fallback, PARSE_TIMEOUT_S, s)
        except UnparseableStep:
            raise
        except Exception as exc:
            raise UnparseableStep(f"could not read {s!r}") from exc
    if not isinstance(expr, sympy.Expr):
        raise UnparseableStep(f"{s!r} is not an expression")
    out = _apply_policy(expr)
    if not isinstance(out, sympy.Expr):  # xreplace keeps the type; guard anyway
        raise UnparseableStep(f"{s!r} is not an expression")
    return out


# ---- steps ----------------------------------------------------------------------------------


def _parse_relation(s: str) -> sympy.Basic:
    sides, ops = _split_relations(s)
    if not ops:
        return parse_expression(s)
    if any(not side for side in sides):
        raise UnparseableStep("a relation is missing one side")
    exprs = [parse_expression(side) for side in sides]
    if len(ops) == 1:
        return ops[0](exprs[0], exprs[1], evaluate=False)
    if Eq in ops or Ne in ops:
        raise UnparseableStep("write one equation per step")
    return And(*(op(a, b, evaluate=False) for op, a, b in zip(ops, exprs, exprs[1:], strict=False)))


def _roots(var_latex: str, values: list[str]) -> sympy.Basic:
    var = parse_expression(var_latex)
    if not isinstance(var, Symbol):
        raise UnparseableStep("a root list needs a variable on the left")
    return Or(*(Eq(var, parse_expression(v), evaluate=False) for v in values if v), evaluate=False)


def _parse_alternatives(parts: list[str]) -> sympy.Basic:
    eqs: list[sympy.Basic] = []
    var: sympy.Basic | None = None
    for part in parts:
        _, ops = _split_relations(part)
        if not ops and var is not None:  # "x=2, 3" -> second value belongs to the same variable
            eqs.append(Eq(var, parse_expression(part), evaluate=False))
            continue
        rel = _parse_relation(part)
        if not isinstance(rel, sympy.Equality) or not isinstance(rel.lhs, Symbol):
            raise UnparseableStep("a list of answers must look like x=2, x=3")
        var = rel.lhs
        eqs.append(rel)
    return Or(*eqs, evaluate=False)


_PM = re.compile(r"\\(?:pm|mp)(?![a-zA-Z])")


def _expand_pm(part: str) -> list[str]:
    """``x=\\frac{1\\pm 7}{2}`` -> ``x=\\frac{1+7}{2}`` and ``x=\\frac{1-7}{2}``.

    Every ``\\pm`` in a part takes the same branch (``\\mp`` the opposite), the usual reading of the
    quadratic formula. The branches must then be ``x = value`` equations (checked by ``_parse_alternatives``).
    """
    if not _PM.search(part):
        return [part]

    def branch(sign: str, other: str) -> str:
        return _PM.sub(lambda m: sign if m.group(0) == r"\pm" else other, part)

    return [branch("+", "-"), branch("-", "+")]


def parse_step(latex: str) -> sympy.Basic:
    s = normalize_latex(latex)
    if not s:
        raise UnparseableStep("empty step")
    if s.startswith("=") and not s.startswith("=="):
        return parse_expression(s[1:])
    m = _IN_SET.match(s)
    if m:
        return _roots(m.group(1), _split_top(m.group(2), ","))
    s = _OR_SEP.sub(";", s)
    parts = [p for chunk in _split_top(s, ";") for p in _split_top(chunk, ",")]
    parts = [branch for p in parts if p for branch in _expand_pm(p)]
    if not parts:
        raise UnparseableStep("empty step")
    if len(parts) > 1 or _PM.search(s):
        return _parse_alternatives(parts)
    return _parse_relation(parts[0])
