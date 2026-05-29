import os
import sys
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import joblib

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

REFIT_RAW_DIR  = os.path.join(project_root, "data", "refit", "raw")
OUTPUT_PATH    = os.path.join(project_root, "data", "processed", "processed_refit_dataset.csv")
SCALER_PATH    = os.path.join(project_root, "data", "processed", "scaler_refit.joblib")

HOUSES       = list(range(1, 21))
MIN_WATTS    = 0
MAX_WATTS    = 20000
MIN_COVERAGE = 0.8


# ─────────────────────────────────────────────
# LOAD ONE HOUSE
# Format réel : Time,Unix,Aggregate,Appliance1,...,Issues
# ─────────────────────────────────────────────

def load_house(house_id):
    filepath = os.path.join(REFIT_RAW_DIR, f"CLEAN_House{house_id}.csv")

    if not os.path.exists(filepath):
        print(f"    House {house_id} not found")
        return None

    try:
        # Lire seulement Time + Aggregate (colonnes 0 et 2)
        df = pd.read_csv(
            filepath,
            usecols=["Time", "Aggregate"],
            dtype={"Aggregate": "float32"},
            low_memory=True
        )

        # Parser le timestamp avec format explicite → RAPIDE
        df["timestamp"] = pd.to_datetime(
            df["Time"],
            format="%Y-%m-%d %H:%M:%S",
            errors="coerce"
        )

        df = df[["timestamp", "Aggregate"]].copy()
        df = df.rename(columns={"Aggregate": "aggregate"})
        df = df.dropna(subset=["timestamp", "aggregate"])
        df = df.sort_values("timestamp").reset_index(drop=True)

        print(f"   House {house_id} : {len(df):,} rows | "
              f"{df['timestamp'].min().date()} → {df['timestamp'].max().date()}")
        return df

    except Exception as e:
        print(f"  House {house_id} error: {e}")
        return None


# ─────────────────────────────────────────────
# RESAMPLE 8s → 1 MINUTE
# ─────────────────────────────────────────────

def resample_to_minutes(df):
    df = df.set_index("timestamp")
    df = df.resample("1min").mean()
    df = df.ffill(limit=5)
    df = df.reset_index()
    return df


# ─────────────────────────────────────────────
# SPLIT INTO DAILY WINDOWS
# ─────────────────────────────────────────────

def split_into_days(df, house_id):
    rows = []
    df["date"] = df["timestamp"].dt.date

    for date, group in df.groupby("date"):
        group = group.sort_values("timestamp").reset_index(drop=True)

        coverage = len(group) / 1440
        if coverage < MIN_COVERAGE:
            continue

        values = group["aggregate"].values
        values = np.clip(values, MIN_WATTS, MAX_WATTS)
        values = np.nan_to_num(values, nan=0.0)

        if len(values) != 1440:
            x_old  = np.linspace(0, 1, len(values))
            x_new  = np.linspace(0, 1, 1440)
            values = np.interp(x_new, x_old, values)

        row = [str(date), house_id] + list(np.round(values, 2))
        rows.append(row)

    return rows


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def preprocess_refit():
    print("=" * 60)
    print("  REFIT Preprocessing — Fast Version")
    print("=" * 60)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    all_rows = []

    for house_id in HOUSES:
        print(f"\n House {house_id}...", flush=True)

        df = load_house(house_id)
        if df is None:
            continue

        df   = resample_to_minutes(df)
        days = split_into_days(df, house_id)
        print(f"     → {len(days)} valid days")
        all_rows.extend(days)

    if len(all_rows) == 0:
        print("\n No data found. Check:", REFIT_RAW_DIR)
        return

    # ── DataFrame final
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    columns  = ["Date", "House"] + consumption_cols
    df_all   = pd.DataFrame(all_rows, columns=columns)

    print(f"\n{'='*60}")
    print(f"  Total days  : {len(df_all)}")
    print(f"  Houses      : {df_all['House'].nunique()}")
    print(f"  Date range  : {df_all['Date'].min()} → {df_all['Date'].max()}")
    print(f"{'='*60}")

    # ── Normalisation
    print("\nNormalizing...")
    consumption_data = df_all[consumption_cols].values.astype("float32")
    scaler           = MinMaxScaler()
    normalized       = scaler.fit_transform(consumption_data)

    df_normalized = pd.DataFrame(normalized, columns=consumption_cols)
    df_final      = pd.concat(
        [df_all[["Date", "House"]].reset_index(drop=True), df_normalized],
        axis=1
    )

    # ── Sauvegarder
    df_final.to_csv(OUTPUT_PATH, index=False)
    joblib.dump(scaler, SCALER_PATH)

    print(f"\n Dataset : {OUTPUT_PATH}")
    print(f" Scaler  : {SCALER_PATH}")
    print(f"   Shape   : {df_final.shape[0]} days × {df_final.shape[1]} columns")

    print("\nDays per house:")
    for house, count in df_all["House"].value_counts().sort_index().items():
        bar = "█" * (count // 20)
        print(f"  House {house:2d} : {count:4d}  {bar}")


def verify_output():
    if not os.path.exists(OUTPUT_PATH):
        print(" Output not found!")
        return
    df               = pd.read_csv(OUTPUT_PATH)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    print(f"\n Shape : {df.shape}")
    print(f"   NaN   : {df[consumption_cols].isna().sum().sum()}")
    print(f"   Min   : {df[consumption_cols].values.min():.4f}")
    print(f"   Max   : {df[consumption_cols].values.max():.4f}")
    print(" Ready for training!")


if __name__ == "__main__":
    preprocess_refit()
    verify_output()