"""
Options reinvestment calculator - reproduces the compounding spreadsheet.

Spreadsheet logic (decoded):
    profit    = cost * (make_per / per_option)     -> 225 / 1000 = 22.5% per cycle
    reinvest  = cost + profit                      -> becomes next row's cost
    next opts = round(reinvest / per_option)       -> display only in the sheet

Note: the sheet reinvests the FULL balance (e.g. $36,765.31), even though
you can only buy whole contracts. Use --whole (or answer "y" when asked) to
model whole contracts, with leftover cash carried forward.

Run with no arguments to be prompted for each value. Pass any of the
command-line options to skip the prompts and print a single table.
"""
import argparse
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, getcontext

# Enough digits that whole-contract rounding never overflows below BALANCE_CAP.
getcontext().prec = 60

DEFAULTS = {
    "start": Decimal("20000"),
    "per_option": Decimal("1000"),
    "make_per": Decimal("225"),
    "cycles": 12,
    "whole": False,
}
MAX_AMOUNT = Decimal("1e15")     # largest dollar amount accepted as input
MIN_PER_OPTION = Decimal("0.01")
MAX_CYCLES = 1000
BALANCE_CAP = Decimal("1e30")    # stop compounding once the balance passes this


def money(x):
    return f"${x:,.2f}"


def run(start, per_option, make_per, cycles, whole=False):
    rate = Decimal(make_per) / Decimal(per_option)
    cash = Decimal(start)
    rows = []
    for _ in range(cycles):
        if cash > BALANCE_CAP:
            break
        if whole:
            opts = int(cash // per_option)
            cost = Decimal(opts * per_option)
            leftover = cash - cost
        else:
            opts = int((cash / per_option).quantize(Decimal(1), ROUND_HALF_UP))
            cost, leftover = cash, Decimal(0)
        profit = cost * rate
        reinvest = cost + profit + leftover
        rows.append((opts, cost, profit, reinvest))
        cash = reinvest
    return rows


def next_count(reinvest, per_option, whole):
    """Options the reinvested balance buys next (display only, as in the sheet)."""
    if whole:
        return int(reinvest // per_option)
    return int((reinvest / per_option).quantize(Decimal(1), ROUND_HALF_UP))


def print_table(start, per_option, make_per, cycles, whole):
    rows = run(start, per_option, make_per, cycles, whole)
    print()
    print(f"{'Option #':>8} {'per Option':>12} {'cost':>14} {'make per':>10}"
          f" {'profit':>13} {'reinvest':>14} {'next':>6}")
    for opts, cost, profit, reinvest in rows:
        nxt = next_count(reinvest, per_option, whole)
        print(f"{opts:>8} {money(per_option):>12} {money(cost):>14}"
              f" {money(make_per):>10} {money(profit):>13} {money(reinvest):>14}"
              f" {nxt:>6}")
    final = rows[-1][3] if rows else start
    gain = final - start
    mult = final / start if start else Decimal(0)
    if len(rows) < cycles:
        print(f"\nStopped after {len(rows)} of {cycles} trades: the balance"
              f" passed {money(BALANCE_CAP)}.")
    print(f"\nPUT IN: {money(start)}   FINAL: {money(final)}")
    print(f"GAIN:   {money(gain)}   ({mult:,.2f}x your money)")
    if whole:
        print("Mode:   whole contracts only, leftover cash carried forward")
    return final


def parse_number(text):
    cleaned = text.strip().replace("$", "").replace(",", "")
    value = Decimal(cleaned)
    if not value.is_finite():
        raise InvalidOperation
    return value


def ask_decimal(label, default, minimum=Decimal("0"), allow_equal=False,
                maximum=MAX_AMOUNT):
    while True:
        raw = input(f"{label} [{default:,}]: ").strip()
        if not raw:
            return default
        try:
            value = parse_number(raw)
        except (InvalidOperation, ValueError):
            print("  Please enter a number, e.g. 7500 or $7,500.")
            continue
        if value < minimum or (value == minimum and not allow_equal):
            word = "at least" if allow_equal else "greater than"
            print(f"  Must be {word} {minimum}.")
            continue
        if value > maximum:
            print(f"  Must be no more than {maximum:,f}.")
            continue
        return value


def ask_int(label, default):
    while True:
        raw = input(f"{label} [{default}]: ").strip()
        if not raw:
            return default
        try:
            value = int(parse_number(raw))
        except (InvalidOperation, ValueError):
            print("  Please enter a whole number, e.g. 12.")
            continue
        if not 1 <= value <= MAX_CYCLES:
            print(f"  Must be between 1 and {MAX_CYCLES}.")
            continue
        return value


def ask_yes_no(label, default):
    shown = "y" if default else "n"
    while True:
        raw = input(f"{label} (y/n) [{shown}]: ").strip().lower()
        if not raw:
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print("  Please answer y or n.")


def interactive():
    print("Options Compounder - reinvestment calculator")
    print("Press Enter to keep the value shown in [brackets].\n")
    values = dict(DEFAULTS)
    while True:
        values["start"] = ask_decimal("Starting amount", values["start"])
        values["per_option"] = ask_decimal("Cost per option", values["per_option"],
                                           minimum=MIN_PER_OPTION, allow_equal=True)
        values["make_per"] = ask_decimal("Profit per option", values["make_per"],
                                         allow_equal=True)
        values["cycles"] = ask_int("Number of trades", values["cycles"])
        values["whole"] = ask_yes_no("Whole contracts only", values["whole"])
        print_table(values["start"], values["per_option"], values["make_per"],
                    values["cycles"], values["whole"])
        print()
        if not ask_yes_no("Run another calculation", True):
            break
        print()
    input("\nPress Enter to close...")


def cli_number(text):
    try:
        return parse_number(text)
    except (InvalidOperation, ValueError):
        raise argparse.ArgumentTypeError(f"not a number: {text!r}")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        try:
            interactive()
        except (KeyboardInterrupt, EOFError):
            print()
        except Exception as exc:  # keep the window open so the error is readable
            print(f"\nUnexpected error: {exc!r}")
            try:
                input("Press Enter to close...")
            except (KeyboardInterrupt, EOFError):
                pass
            return 1
        return 0

    p = argparse.ArgumentParser(description="Options compounding calculator")
    p.add_argument("--start", type=cli_number, default=DEFAULTS["start"],
                   help="money put in")
    p.add_argument("--per-option", type=cli_number,
                   default=DEFAULTS["per_option"], help="cost per option")
    p.add_argument("--make-per", type=cli_number, default=DEFAULTS["make_per"],
                   help="profit per option")
    p.add_argument("--cycles", type=int, default=DEFAULTS["cycles"],
                   help="number of rows/trades")
    p.add_argument("--whole", action="store_true", help="whole contracts only")
    a = p.parse_args(argv)
    if not 0 < a.start <= MAX_AMOUNT:
        p.error(f"--start must be greater than 0 and at most {MAX_AMOUNT:,f}")
    if not MIN_PER_OPTION <= a.per_option <= MAX_AMOUNT:
        p.error(f"--per-option must be between {MIN_PER_OPTION} and {MAX_AMOUNT:,f}")
    if not 0 <= a.make_per <= MAX_AMOUNT:
        p.error(f"--make-per must be between 0 and {MAX_AMOUNT:,f}")
    if not 1 <= a.cycles <= MAX_CYCLES:
        p.error(f"--cycles must be between 1 and {MAX_CYCLES}")
    print_table(a.start, a.per_option, a.make_per, a.cycles, a.whole)
    return 0


if __name__ == "__main__":
    sys.exit(main())
