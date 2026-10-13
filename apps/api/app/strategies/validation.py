"""Contradiction checks for a strategy. Mirrors `findConflicts` in the web app's `lib/strategy.ts`.

- Inside a rule (AND), two conditions on the same subject must be satisfiable together:
  `RSI > 70 and RSI < 30` or `crosses up and crosses down` can never fire. Repeating the exact
  same condition is rejected too.
- A buy rule and a sell rule contradict each other when they look at the same subjects and all
  of them can hold at once (`buy RSI < 40` vs. `sell RSI > 30`): they could fire on the same
  candle. Rules over unrelated subjects are independent and allowed.
- Two rules of the same side with equivalent conditions are duplicates.
"""

from dataclasses import dataclass

from app.schemas.backtest import Rule, StrategyConfig
from app.strategies.conditions import Constraint, Interval, spec

SIDE_NAMES = {"buy": "compra", "sell": "venta"}


@dataclass(frozen=True)
class Conflict:
    rule_ids: tuple[str, ...]
    message: str


@dataclass
class _MergedRule:
    rule: Rule
    name: str
    constraints: dict[str, Constraint]
    labels: dict[str, str]
    valid: bool


def _merge(rule: Rule, name: str, conflicts: list[Conflict]) -> _MergedRule:
    merged = _MergedRule(rule, name, {}, {}, valid=True)
    for condition in rule.conditions:
        s = spec(condition)
        subject, constraint, label = (
            s.subject(condition),
            s.constraint(condition),
            s.label(condition),
        )
        previous = merged.constraints.get(subject)
        merged.labels[subject] = label
        if previous is None:
            merged.constraints[subject] = constraint
        elif previous == constraint:
            merged.valid = False
            conflicts.append(Conflict((rule.id,), f"La {name} repite la condición sobre {label}."))
        elif isinstance(previous, Interval) and isinstance(constraint, Interval):
            merged.constraints[subject] = previous.intersect(constraint)
            if merged.constraints[subject].empty:
                merged.valid = False
                conflicts.append(
                    Conflict((rule.id,), f"La {name} tiene condiciones opuestas sobre {label}.")
                )
        else:
            merged.valid = False
            conflicts.append(
                Conflict((rule.id,), f"La {name} tiene condiciones opuestas sobre {label}.")
            )
    return merged


def _overlap(a: dict[str, Constraint], b: dict[str, Constraint]) -> list[str] | None:
    """Shared subjects if every one of them can hold in both rules at once, else None."""
    shared = [subject for subject in a if subject in b]
    if not shared:
        return None
    for subject in shared:
        x, y = a[subject], b[subject]
        if isinstance(x, Interval) and isinstance(y, Interval):
            if x.intersect(y).empty:
                return None
        elif x != y:
            return None
    return shared


def find_conflicts(strategy: StrategyConfig) -> list[Conflict]:
    conflicts: list[Conflict] = []
    counters = {"buy": 0, "sell": 0}
    merged: list[_MergedRule] = []
    for rule in strategy.rules:
        counters[rule.side] += 1
        name = f"regla de {SIDE_NAMES[rule.side]} {counters[rule.side]}"
        merged.append(_merge(rule, name, conflicts))

    valid = [m for m in merged if m.valid]
    for i, a in enumerate(valid):
        for b in valid[i + 1 :]:
            if a.rule.side == b.rule.side:
                if a.constraints == b.constraints:
                    conflicts.append(
                        Conflict((a.rule.id, b.rule.id), f"La {b.name} repite la {a.name}.")
                    )
                continue
            shared = _overlap(a.constraints, b.constraints)
            if shared:
                labels = ", ".join(a.labels[s] for s in shared)
                conflicts.append(
                    Conflict(
                        (a.rule.id, b.rule.id),
                        f"La {a.name} y la {b.name} se contradicen: pueden cumplirse a la vez "
                        f"sobre {labels}.",
                    )
                )
    return conflicts
