import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os

# ─── CONFIG ───────────────────────────────────────────────────────────────────
SCENARIOS_DIR = os.path.join(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
    "data", "scenarios"
)

SCENARIOS = [
    {"file": "daily_routine.csv",      "title": "Scenario 1: Daily Routine"},
    {"file": "routine_+_cleaning.csv",  "title": "Scenario 3: Routine + Cleaning"},
    {"file": "routine_+_cooking.csv",   "title": "Scenario 4: Routine + Cooking"},
    {"file": "routine_+_laundry.csv",   "title": "Scenario 5: Routine + Laundry"},
]

# Night = 0–360 (midnight→6 AM) and 1320–1440 (10 PM→midnight)
NIGHT_MORNING_END   = 360
NIGHT_EVENING_START = 1320

LINE_COLOR  = "#1565C0"
FILL_COLOR  = "#90CAF9"
NIGHT_COLOR = "#B0BEC5"


# ─── HELPER: load CSV → 1-D array of 1440 values ─────────────────────────────
def load_values(csv_path):
    df = pd.read_csv(csv_path)
    consumption_cols = [c for c in df.columns if c.startswith("m_")]
    if not consumption_cols:
        consumption_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        consumption_cols = consumption_cols[:1440]
    return df[consumption_cols].mean(axis=0).values   # average across all rows


# ─── HELPER: draw one subplot ─────────────────────────────────────────────────
def draw_scenario(ax, values, title, outside=False):
    minutes = np.arange(1, len(values) + 1)

    # Night shading — two blocks (morning + evening)
    ax.axvspan(0, NIGHT_MORNING_END, alpha=0.18, color=NIGHT_COLOR,
               label="Night (Sleep)", zorder=0)
    ax.axvspan(NIGHT_EVENING_START, 1440, alpha=0.18, color=NIGHT_COLOR,
               zorder=0)

    # Line + area fill
    ax.plot(minutes, values, color=LINE_COLOR, linewidth=1.2,
            label="Consumption (W)", zorder=2)
    ax.fill_between(minutes, values, alpha=0.20, color=FILL_COLOR, zorder=1)

    ax.set_title(title, fontsize=13, fontweight="bold", pad=8)
    ax.set_xlabel("Time (Minutes from 1 to 1440)", fontsize=10)
    ax.set_ylabel("Power (Watts)", fontsize=10)
    ax.set_xlim(0, 1440)

    # Outside Day: person away → tiny flat consumption → tighten y-axis
    if outside:
        ymax = max(values) * 5
        ax.set_ylim(0, max(ymax, 300))
    else:
        ax.set_ylim(bottom=0)

    ax.grid(alpha=0.3, linestyle="--")

    # Deduplicate legend (axvspan adds "Night (Sleep)" twice)
    handles, labels = ax.get_legend_handles_labels()
    seen = {}
    for h, l in zip(handles, labels):
        if l not in seen:
            seen[l] = h
    ax.legend(seen.values(), seen.keys(), fontsize=9, loc="upper right")


# ─── BUILD FIGURE ─────────────────────────────────────────────────────────────
fig, axes = plt.subplots(nrows=3, ncols=2, figsize=(16, 14),
                          constrained_layout=True)
axes = axes.flatten()

for idx, scenario in enumerate(SCENARIOS):
    csv_path = os.path.join(SCENARIOS_DIR, scenario["file"])
    values   = load_values(csv_path)
    is_outside = "outside" in scenario["file"].lower()
    draw_scenario(axes[idx], values, scenario["title"], outside=is_outside)

# Hide unused 6th cell
axes[-1].set_visible(False)

fig.suptitle("Daily Energy Consumption — All Scenarios",
             fontsize=16, fontweight="bold", y=1.01)

# ─── SAVE ─────────────────────────────────────────────────────────────────────
out_dir = os.path.join(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
    "reports", "figures"
)
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "full_scenarios_comparison.png")

plt.savefig(out_path, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved -> {out_path}")