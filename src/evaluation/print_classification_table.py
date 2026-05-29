"""
Run this script AFTER detect_anomalies.py has produced:
    data/results/detection_results_classified.csv

It prints and saves the classification breakdown table used in Chapter 4.
Place at: src/evaluation/print_classification_table.py
"""
import os
import sys
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
results_path = os.path.join(project_root, "data", "results", "detection_results_classified.csv")
if not os.path.exists(results_path):
    results_path = os.path.join(os.getcwd(), "data", "results", "detection_results_classified.csv")

if not os.path.exists(results_path):
    print("ERROR: detection_results_classified.csv not found.")
    print("Run detect_anomalies.py first.")
    sys.exit(1)

df = pd.read_csv(results_path)

# ── Overall stats ──────────────────────────────────────────────────────────────
total_days      = len(df)
total_detected  = int(df["predicted_label"].sum())
total_normal    = total_days - total_detected

# ── Per-type breakdown ─────────────────────────────────────────────────────────
type_counts = (
    df[df["predicted_label"] == 1]["predicted_type"]
    .value_counts()
    .reindex(["Temporal Shift", "Duration", "Order"], fill_value=0)
)

avg_mse_per_type = (
    df[df["predicted_label"] == 1]
    .groupby("predicted_type")["reconstruction_error"]
    .mean()
    .reindex(["Temporal Shift", "Duration", "Order"])
)

# ── Console table ──────────────────────────────────────────────────────────────
print("\n" + "="*58)
print("  ANOMALY DETECTION & CLASSIFICATION RESULTS")
print("="*58)
print(f"  Total days analysed      : {total_days}")
print(f"  Normal days              : {total_normal}  ({total_normal/total_days*100:.1f}%)")
print(f"  Anomalous days detected  : {total_detected}  ({total_detected/total_days*100:.1f}%)")
print("-"*58)
print(f"  {'Anomaly Type':<22} {'Count':>7}  {'% of anomalies':>15}  {'Avg MSE':>10}")
print("-"*58)
for atype in ["Temporal Shift", "Duration", "Order"]:
    count   = type_counts[atype]
    pct     = count / total_detected * 100 if total_detected > 0 else 0
    avg_mse = avg_mse_per_type[atype] if not np.isnan(avg_mse_per_type[atype]) else 0
    print(f"  {atype:<22} {count:>7}  {pct:>14.1f}%  {avg_mse:>10.6f}")
print("="*58 + "\n")

# ── Save as PNG table (ready to paste in report) ───────────────────────────────
figures_dir = os.path.join(project_root, "reports", "figures")
os.makedirs(figures_dir, exist_ok=True)

table_data = []
for atype in ["Temporal Shift", "Duration", "Order"]:
    count   = type_counts[atype]
    pct     = f"{count / total_detected * 100:.1f}%" if total_detected > 0 else "0.0%"
    avg_mse = f"{avg_mse_per_type[atype]:.6f}" if not np.isnan(avg_mse_per_type[atype]) else "N/A"
    table_data.append([atype, count, pct, avg_mse])

fig, ax = plt.subplots(figsize=(8, 2.6))
ax.axis('off')

col_labels = ["Anomaly Type", "Detected", "% of Anomalies", "Avg MSE"]
tbl = ax.table(
    cellText=table_data,
    colLabels=col_labels,
    cellLoc='center',
    loc='center'
)
tbl.auto_set_font_size(False)
tbl.set_fontsize(11)
tbl.scale(1, 1.7)

# Style header row
for j in range(len(col_labels)):
    tbl[0, j].set_facecolor('#4C72B0')
    tbl[0, j].set_text_props(color='white', fontweight='bold')

# Alternate row shading
row_colors = ['#EEF2FF', '#FFFFFF']
for i in range(1, len(table_data) + 1):
    for j in range(len(col_labels)):
        tbl[i, j].set_facecolor(row_colors[(i - 1) % 2])

ax.set_title(
    f"Classification Breakdown  (k=3 | {total_detected} anomalies / {total_days} days)",
    fontsize=11, pad=10, fontweight='bold'
)
plt.tight_layout()
out_path = os.path.join(figures_dir, "04_classification_table.png")
plt.savefig(out_path, dpi=180, bbox_inches='tight')
plt.close()
print(f"Table image saved -> {out_path}")