"""
Options Compounder - window version.

Same calculation as options_compounder.py (it imports it), with input boxes,
a Calculate button and a scrollable results table.

    py options_compounder_gui.py              # open the window
    py options_compounder_gui.py --self-test  # build the window, check results, exit 0/1
"""
import sys
import tkinter as tk
from decimal import Decimal, InvalidOperation
from tkinter import ttk

import options_compounder as oc

FIELDS = [
    ("start", "Starting amount ($)"),
    ("per_option", "Cost per option ($)"),
    ("make_per", "Profit per option ($)"),
    ("cycles", "Number of trades"),
]
COLUMNS = [
    ("trade", "Trade", 60),
    ("opts", "Options", 80),
    ("per", "Per option", 110),
    ("cost", "Cost", 150),
    ("make", "Make per", 100),
    ("profit", "Profit", 150),
    ("reinvest", "Reinvest", 150),
    ("next", "Next", 80),
]


def default_texts():
    d = oc.DEFAULTS
    return {"start": f"{d['start']:,}", "per_option": f"{d['per_option']:,}",
            "make_per": f"{d['make_per']:,}", "cycles": str(d["cycles"])}


def validate(texts):
    """Turn the four input strings into values.

    Returns (values, None) when everything is valid, otherwise
    (None, (field_key, message)) for the first bad field.
    """
    limits = {
        "start": (Decimal(0), False, "Starting amount"),
        "per_option": (oc.MIN_PER_OPTION, True, "Cost per option"),
        "make_per": (Decimal(0), True, "Profit per option"),
    }
    values = {}
    for key, (minimum, allow_equal, label) in limits.items():
        try:
            value = oc.parse_number(texts[key])
        except (InvalidOperation, ValueError):
            return None, (key, f"{label}: enter a number, e.g. 7500 or $7,500.")
        if value < minimum or (value == minimum and not allow_equal):
            word = "at least" if allow_equal else "greater than"
            return None, (key, f"{label}: must be {word} {minimum}.")
        if value > oc.MAX_AMOUNT:
            return None, (key, f"{label}: must be no more than {oc.MAX_AMOUNT:,f}.")
        values[key] = value
    try:
        cycles = oc.parse_number(texts["cycles"])
    except (InvalidOperation, ValueError):
        return None, ("cycles", "Number of trades: enter a whole number, e.g. 12.")
    if cycles != cycles.to_integral_value():
        return None, ("cycles", "Number of trades: enter a whole number, e.g. 12.")
    if not 1 <= cycles <= oc.MAX_CYCLES:
        return None, ("cycles", f"Number of trades: must be between 1 and {oc.MAX_CYCLES}.")
    values["cycles"] = int(cycles)
    return values, None


def calculate(values, whole):
    """Return (table rows as display strings, summary dict)."""
    rows = oc.run(values["start"], values["per_option"], values["make_per"],
                  values["cycles"], whole)
    table = []
    for i, (opts, cost, profit, reinvest) in enumerate(rows, 1):
        table.append((str(i), f"{opts:,}", oc.money(values["per_option"]),
                      oc.money(cost), oc.money(values["make_per"]), oc.money(profit),
                      oc.money(reinvest),
                      f"{oc.next_count(reinvest, values['per_option'], whole):,}"))
    start = values["start"]
    final = rows[-1][3] if rows else start
    summary = {
        "put_in": oc.money(start),
        "final": oc.money(final),
        "gain": oc.money(final - start),
        "multiple": f"{final / start:,.2f}x",
        "stopped": len(rows) < values["cycles"],
        "trades": len(rows),
    }
    return table, summary


class App:
    def __init__(self, root):
        self.root = root
        root.title("Options Compounder")
        root.minsize(760, 480)

        outer = ttk.Frame(root, padding=12)
        outer.grid(sticky="nsew")
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(2, weight=1)

        form = ttk.LabelFrame(outer, text="Inputs", padding=10)
        form.grid(row=0, column=0, sticky="ew")
        self.vars = {key: tk.StringVar(value=text)
                     for key, text in default_texts().items()}
        self.entries = {}
        for i, (key, label) in enumerate(FIELDS):
            r, c = divmod(i, 2)
            ttk.Label(form, text=label).grid(row=r, column=c * 2, sticky="w",
                                             padx=(0 if c == 0 else 24, 8), pady=4)
            entry = ttk.Entry(form, textvariable=self.vars[key], width=18,
                              justify="right")
            entry.grid(row=r, column=c * 2 + 1, sticky="w", pady=4)
            self.entries[key] = entry

        self.whole = tk.BooleanVar(value=oc.DEFAULTS["whole"])
        ttk.Checkbutton(form, text="Whole contracts only (carry leftover cash)",
                        variable=self.whole).grid(row=2, column=0, columnspan=4,
                                                  sticky="w", pady=(6, 0))

        buttons = ttk.Frame(form)
        buttons.grid(row=3, column=0, columnspan=4, sticky="w", pady=(10, 0))
        self.calc_button = ttk.Button(buttons, text="Calculate", command=self.calculate)
        self.calc_button.pack(side="left")
        ttk.Button(buttons, text="Reset to spreadsheet values",
                   command=self.reset).pack(side="left", padx=8)
        ttk.Button(buttons, text="Copy table", command=self.copy_table).pack(side="left")

        self.message = tk.StringVar()
        self.message_label = ttk.Label(outer, textvariable=self.message,
                                       foreground="#b00020")
        self.message_label.grid(row=1, column=0, sticky="w", pady=(8, 4))

        table_frame = ttk.Frame(outer)
        table_frame.grid(row=2, column=0, sticky="nsew")
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)
        self.tree = ttk.Treeview(table_frame, columns=[c[0] for c in COLUMNS],
                                 show="headings", height=14)
        for key, title, width in COLUMNS:
            self.tree.heading(key, text=title)
            self.tree.column(key, width=width, anchor="e", stretch=True)
        scroll = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scroll.grid(row=0, column=1, sticky="ns")

        self.summary = tk.StringVar()
        ttk.Label(outer, textvariable=self.summary,
                  font=("Segoe UI", 11, "bold")).grid(row=3, column=0, sticky="w",
                                                      pady=(10, 0))
        ttk.Label(outer, foreground="#555555",
                  text="Assumes every trade wins. One loss at full size can undo"
                       " several rows of gains.").grid(row=4, column=0, sticky="w",
                                                       pady=(4, 0))

        root.bind("<Return>", lambda _e: self.calculate())
        self.last_summary = None
        self.calculate()

    def calculate(self):
        texts = {key: var.get() for key, var in self.vars.items()}
        values, error = validate(texts)
        if error:
            key, msg = error
            self.message.set(msg)
            self.entries[key].focus_set()
            self.entries[key].select_range(0, "end")
            return False
        self.message.set("")
        table, summary = calculate(values, self.whole.get())
        self.tree.delete(*self.tree.get_children())
        for row in table:
            self.tree.insert("", "end", values=row)
        text = (f"Put in {summary['put_in']}    Final {summary['final']}    "
                f"Gain {summary['gain']} ({summary['multiple']} your money)")
        if summary["stopped"]:
            self.message.set(f"Stopped after {summary['trades']} of {values['cycles']}"
                             f" trades: the balance passed {oc.money(oc.BALANCE_CAP)}.")
        self.summary.set(text)
        self.last_summary = summary
        return True

    def reset(self):
        for key, text in default_texts().items():
            self.vars[key].set(text)
        self.whole.set(oc.DEFAULTS["whole"])
        self.calculate()

    def table_text(self):
        lines = ["\t".join(c[1] for c in COLUMNS)]
        for item in self.tree.get_children():
            lines.append("\t".join(str(v) for v in self.tree.item(item, "values")))
        return "\n".join(lines)

    def copy_table(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.table_text())
        self.message.set("Table copied - paste it into Excel or a document.")


def self_test():
    """Drive the real window through key scenarios. Returns the failure count."""
    root = tk.Tk()
    root.withdraw()
    app = App(root)
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    def enter(**texts):
        for key, text in texts.items():
            app.vars[key].set(text)

    root.update()
    check("defaults final", app.last_summary["final"] == "$228,382.62")
    check("defaults rows", len(app.tree.get_children()) == 12)
    first = app.tree.item(app.tree.get_children()[0], "values")
    check("first row", list(first) == ["1", "20", "$1,000.00", "$20,000.00", "$225.00",
                                       "$4,500.00", "$24,500.00", "25"])

    app.whole.set(True)
    check("whole ok", app.calculate())
    check("whole final", app.last_summary["final"] == "$223,625.00")

    app.reset()
    enter(start="$7,500", cycles="1")
    check("money format", app.calculate() and app.last_summary["final"] == "$9,187.50")

    for key, bad in [("start", "abc"), ("start", "0"), ("per_option", "0"),
                     ("make_per", "-1"), ("cycles", "2.5"), ("cycles", "0"),
                     ("cycles", "1001"), ("start", "1e400")]:
        app.reset()
        enter(**{key: bad})
        check(f"reject {key}={bad}", not app.calculate() and app.message.get())

    app.reset()
    enter(cycles="1000")
    check("long run", app.calculate() and app.last_summary["stopped"])

    app.reset()
    check("copy", app.table_text().count("\n") == 12)

    root.destroy()
    for name in failures:
        print(f"SELF-TEST FAILED: {name}")
    if not failures:
        print("SELF-TEST PASSED")
    return len(failures)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if "--self-test" in argv:
        return 1 if self_test() else 0
    root = tk.Tk()
    App(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
