"""
check_csv.py  —  run this to verify any CSV before uploading to the web app
Usage:
    python check_csv.py path/to/your_dataset.csv
"""
import sys, pandas as pd, numpy as np

path = sys.argv[1] if len(sys.argv) > 1 else "anomalous_dataset.csv"
df   = pd.read_csv(path)

print(f"\n{'='*55}")
print(f" CSV CHECK: {path}")
print(f"{'='*55}")
print(f"  Rows (days)  : {len(df)}")
print(f"  Total cols   : {len(df.columns)}")

m_cols = [c for c in df.columns if c.startswith("m_")]
print(f"  m_* cols     : {len(m_cols)}  {'✅ OK' if len(m_cols) == 1440 else '❌ need 1440'}")

if len(m_cols) > 0:
    vals = df[m_cols].values.astype(float)
    print(f"  Value range  : [{vals.min():.4f} … {vals.max():.4f}]")
    print(f"  Mean / Std   : {vals.mean():.4f} / {vals.std():.4f}")
    if vals.max() > 10:
        print("  ⚠  Values look UN-scaled (max > 10).")
        print("     The Simulator model was trained on RAW data — this is fine.")
    else:
        print("  ℹ  Values look scaled (max ≤ 10).")

other = [c for c in df.columns if not c.startswith("m_")]
if other:
    print(f"  Extra cols   : {other[:10]}{'…' if len(other)>10 else ''}")
print(f"{'='*55}\n")