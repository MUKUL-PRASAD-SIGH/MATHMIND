# Verifier supported scope

What `verify_steps` can decide. Anything else is returned as `inconclusive` with the reason
"outside supported scope". The verifier never guesses.

## Input (LaTeX)

- Numbers (integers and decimals; decimals become exact fractions), `+ - \cdot \times \div`, unicode `− × ÷ ≤ ≥ ²`.
- Implicit multiplication: `2x`, `xy`, `2(x-3)`, `x(x-2)`, `(x-2)(x-3)`.
- Powers `x^2`, `x^{-2}`, fractions `\frac`, `\dfrac`, roots `\sqrt{}`, `\sqrt[n]{}`, `|x|`, `\ln`, `\log`, `e^{x}`, `\pi`.
- One relation per step: `=`, `<`, `>`, `\le`, `\ge`, `\neq`; compound inequalities such as `1<x\le 3`.
- Answer lists: `x=2 \text{ or } x=3`, `x \in \{2,3\}`, `x=2, x=3`, `x=2, 3`.
- A line starting with `=` continues an expression rewrite.
- Layout noise is ignored: `\left`/`\right`, `\,` `\!` `\;`, `\displaystyle`, `$`, trailing `.` `,`.
- A decimal comma (`2,5`) is read as a list separator, not as 2.5.

## Checks

| Step pair | Rule | Verdict |
|---|---|---|
| expression → expression | `simplify(a-b)==0` | supported |
| | numeric mismatch at one of 5 rational points | incorrect |
| | otherwise | inconclusive |
| equation/inequality → equation/inequality (one variable, real domain) | equal `solveset` solution sets | supported |
| | solution set changed | incorrect ("solution set changed from … to …") |
| | roots added after squaring / multiplying by an expression | supported + `domain_warning` "extraneous solution introduced" |
| | roots lost (e.g. dividing by `x`) | incorrect + `domain_warning` "possible division by zero; lost solution x=…" |
| | an extra root removed again so the set matches the original equation | supported |
| step 1 | compared with `problem.prompt_latex` when it parses; otherwise "Starting point" | |
| last step | compared with `problem.expected_answer_latex` when given; a final answer that keeps an extraneous root is incorrect | |

- `\sqrt` and `\log`/`\ln` restrict the real domain (handled by `solveset` over the reals).
- Steps after the first error are checked against each other and flagged `after_error`.
- An unreadable step is `inconclusive`; if the next step disagrees with the last readable one, it is `inconclusive` too
  (we can't tell which step changed the answer).
- Each SymPy call has a 2 s timeout → `inconclusive`.

## Outside scope (always inconclusive)

- Trigonometric and other functions (`\sin`, `\cos`, `\tan`, …), calculus (`\int`, derivatives, limits, sums).
- Equations or inequalities with more than one variable (expressions with several variables are fine).
- Complex numbers; solution sets SymPy cannot state exactly (`ConditionSet`, periodic sets).
- Systems of equations, matrices, vectors, functions written as `f(x)`.
- Comparing an equation with a bare expression.
