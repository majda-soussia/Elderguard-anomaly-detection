"""
detect_anomalies_api.py  —  LSTM Autoencoder Pipeline (REFIT)
=============================================================
Called by analyzeController.js:
    python detect_anomalies_api.py <csv_path> <models_dir> <val_path> <processed_csv> <house_id>

    sys.argv[1] = csv_path       — uploaded dataset to analyse
    sys.argv[2] = models_dir     — path to models/saved_models/
    sys.argv[3] = val_path       — validation CSV file  OR  validation directory
    sys.argv[4] = processed_csv  — processed REFIT CSV used to fit the MinMaxScaler
    sys.argv[5] = house_id       — e.g. "2"  (used for model selection)

Works on FULLY UNLABELED data. Outputs a single JSON object to stdout.
"""

import sys, os, json
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import MinMaxScaler

# ── Project root ──────────────────────────────────────────────────────────────
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# ── Import LSTM model ─────────────────────────────────────────────────────────
try:
    from src.training.autoencoder_lstm import LSTMAutoencoder
except ImportError:
    try:
        from training.autoencoder_lstm import LSTMAutoencoder
    except ImportError:
        sys.path.append(os.path.join(project_root, "src"))
        from training.autoencoder_lstm import LSTMAutoencoder

INPUT_DIM            = 1440
THRESHOLD_PERCENTILE = 95   # matches inject_and_detectrefit_lstm.py

# Configs to try when loading a model (same order as inject_and_detectrefit_lstm.py)
CONFIGS = [
    {"hidden_dim": 128, "latent_dim": 64, "num_layers": 2},
    {"hidden_dim": 64,  "latent_dim": 32, "num_layers": 1},
    {"hidden_dim": 256, "latent_dim": 64, "num_layers": 2},
]

# ── Model loading ─────────────────────────────────────────────────────────────
def try_load_model(model_path):
    """Try every architecture config on a .pth file. Returns model or None."""
    for cfg in CONFIGS:
        try:
            m = LSTMAutoencoder(input_dim=INPUT_DIM, **cfg)
            m.load_state_dict(torch.load(model_path, weights_only=True, map_location="cpu"))
            m.eval()
            return m
        except Exception:
            continue
    return None


def resolve_lstm_model(models_dir, house_id):
    """
    Priority order (mirrors inject_and_detectrefit_lstm.py):
      1. autoencoder_lstm_refit_house{N}_best.pth   (own house)
      2. autoencoder_lstm_refit_house1_best.pth     (cross-house H1)
      3. autoencoder_lstm_refit_best.pth            (generic refit)
      4. autoencoder_lstm_generated_best.pth        (generic generated)
    """
    candidates = [
        f"autoencoder_lstm_refit_house{house_id}_best.pth",
        "autoencoder_lstm_refit_house1_best.pth",
        "autoencoder_lstm_refit_best.pth",
        "autoencoder_lstm_generated_best.pth",
    ]
    for name in candidates:
        path = os.path.join(models_dir, name)
        if os.path.exists(path):
            model = try_load_model(path)
            if model is not None:
                print(f"[info] Loaded model: {name}", file=sys.stderr)
                return model, name
    return None, None

# ── Scaler ────────────────────────────────────────────────────────────────────
def fit_scaler(processed_csv_path):
    """Fit a MinMaxScaler on the processed REFIT CSV (same as training)."""
    df     = pd.read_csv(processed_csv_path)
    m_cols = [f"m_{i}" for i in range(1, INPUT_DIM + 1)]
    if all(c in df.columns for c in m_cols):
        cols = m_cols
    else:
        meta    = {"is_anomaly","anomaly_type","is_weekend","day_of_week",
                   "date","Date","label","Scenario"}
        numeric = [c for c in df.select_dtypes(include=[np.number]).columns
                   if c not in meta]
        cols    = numeric[:INPUT_DIM]
    scaler = MinMaxScaler()
    scaler.fit(df[cols].values.astype(np.float32))
    return scaler, cols

# ── CSV loading ───────────────────────────────────────────────────────────────
def load_csv(path, scaler, ref_cols=None):
    df     = pd.read_csv(path)
    m_cols = [f"m_{i}" for i in range(1, INPUT_DIM + 1)]
    if all(c in df.columns for c in m_cols):
        cols = m_cols
    elif ref_cols is not None:
        cols = [c for c in ref_cols if c in df.columns]
        if len(cols) < INPUT_DIM:
            raise ValueError(f"Validation CSV missing expected columns (got {len(cols)}).")
    else:
        meta    = {"is_anomaly","anomaly_type","is_weekend","day_of_week",
                   "date","Date","label","Scenario"}
        numeric = [c for c in df.select_dtypes(include=[np.number]).columns
                   if c not in meta]
        if len(numeric) < INPUT_DIM:
            raise ValueError(f"Only {len(numeric)} numeric cols; need {INPUT_DIM}.")
        cols = numeric[:INPUT_DIM]
    data = scaler.transform(df[cols].values.astype(np.float32))
    return df, data

# ── Validation path resolver ──────────────────────────────────────────────────
def resolve_val_csv(val_arg, house_id):
    """
    val_arg is either:
      - a direct .csv file path  → use it
      - a directory              → look for lstm_refit_house{N}_validation.csv inside
    """
    if os.path.isfile(val_arg):
        return val_arg
    if os.path.isdir(val_arg):
        specific = os.path.join(val_arg, f"lstm_refit_house{house_id}_validation.csv")
        if os.path.exists(specific):
            return specific
        # fallback: any validation CSV in that folder
        for fname in os.listdir(val_arg):
            if fname.endswith(".csv") and "validation" in fname.lower():
                return os.path.join(val_arg, fname)
    return None

# ── Threshold ─────────────────────────────────────────────────────────────────
def compute_threshold(model, val_data, batch_size=64):
    """Percentile-based threshold — batched to avoid OOM."""
    all_mse = []
    model.eval()
    with torch.no_grad():
        for start in range(0, len(val_data), batch_size):
            xb  = torch.tensor(val_data[start:start + batch_size], dtype=torch.float32)
            out = model(xb)
            mse = ((xb - out) ** 2).mean(dim=1).cpu().numpy()
            all_mse.append(mse)
    mse = np.concatenate(all_mse)
    return float(np.percentile(mse, THRESHOLD_PERCENTILE)), mse

# ── Anomaly type classifier ───────────────────────────────────────────────────
def classify_anomaly(original, reconstruction):
    error = (original - reconstruction) ** 2
    total = float(np.sum(error))
    if total == 0:
        return "Unknown"
    seg = {
        "Night":     float(np.sum(error[0:360])),
        "Morning":   float(np.sum(error[360:720])),
        "Afternoon": float(np.sum(error[720:1080])),
        "Evening":   float(np.sum(error[1080:1440])),
    }
    peak_frac = max(seg.values()) / total
    if peak_frac > 0.6:
        return "Duration"
    if (seg["Morning"] + seg["Evening"]) / total > 0.7:
        return "Order"
    return "Temporal Shift"

# ── Date inference ────────────────────────────────────────────────────────────
def infer_dates(df, n):
    for col in ["date", "Date", "DATE", "timestamp", "Timestamp"]:
        if col in df.columns:
            try:
                return pd.to_datetime(df[col]).dt.strftime("%Y-%m-%d").tolist()
            except Exception:
                pass
    return [f"Day-{i+1}" for i in range(n)]

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error":
            "Usage: detect_anomalies_api.py <csv> <models_dir> <val_path> <processed_csv> [house_id]"
        }))
        sys.exit(1)

    csv_path      = sys.argv[1]
    models_dir    = sys.argv[2]
    val_arg       = sys.argv[3]
    processed_csv = sys.argv[4]
    house_id      = int(sys.argv[5]) if len(sys.argv) > 5 else 2

    # ── 1. Fit scaler on processed REFIT data ─────────────────
    if not os.path.exists(processed_csv):
        print(json.dumps({"error": f"Processed CSV not found: {processed_csv}"}))
        sys.exit(1)
    try:
        scaler, ref_cols = fit_scaler(processed_csv)
    except Exception as e:
        print(json.dumps({"error": f"Failed to fit scaler: {e}"}))
        sys.exit(1)

    # ── 2. Load LSTM model ────────────────────────────────────
    model, model_name = resolve_lstm_model(models_dir, house_id)
    if model is None:
        print(json.dumps({
            "error": f"No LSTM model found in {models_dir}.",
            "hint":  "Train with inject_and_detectrefit_lstm.py first.",
        }))
        sys.exit(1)

    # ── 3. Load & scale test CSV ──────────────────────────────
    if not os.path.exists(csv_path):
        print(json.dumps({"error": f"CSV not found: {csv_path}"}))
        sys.exit(1)
    try:
        test_df, test_data = load_csv(csv_path, scaler, ref_cols)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load test CSV: {e}"}))
        sys.exit(1)

    # ── 4. Resolve & load validation CSV → threshold ──────────
    val_csv = resolve_val_csv(val_arg, house_id)
    if val_csv is None:
        print(json.dumps({"error": f"No validation CSV found at: {val_arg}"}))
        sys.exit(1)
    try:
        _, val_data    = load_csv(val_csv, scaler, ref_cols)
        threshold, _   = compute_threshold(model, val_data)
    except Exception as e:
        print(json.dumps({"error": f"Failed to compute threshold: {e}"}))
        sys.exit(1)

    print(f"[info] Threshold (p{THRESHOLD_PERCENTILE}): {threshold:.6f}", file=sys.stderr)

    # ── 5. Inference (batched to avoid OOM) ──────────────────
    BATCH_SIZE = 64
    all_recon  = []
    all_mse    = []
    model.eval()
    with torch.no_grad():
        for start in range(0, len(test_data), BATCH_SIZE):
            xb   = torch.tensor(test_data[start:start + BATCH_SIZE], dtype=torch.float32)
            out  = model(xb)
            mse  = ((xb - out) ** 2).mean(dim=1).cpu().numpy()
            all_recon.append(out.cpu().numpy())
            all_mse.append(mse)
    recon_data = np.vstack(all_recon)
    test_mse   = np.concatenate(all_mse)

    preds        = (test_mse > threshold).astype(int)
    dates        = infer_dates(test_df, len(test_df))
    anomaly_list = []
    type_counts  = {}

    for i in range(len(test_df)):
        if preds[i] == 1:
            atype = classify_anomaly(test_data[i], recon_data[i])
            type_counts[atype] = type_counts.get(atype, 0) + 1
            anomaly_list.append({
                "day_index":            int(i),
                "date":                 dates[i],
                "anomaly_type":         atype,
                "reconstruction_error": float(test_mse[i]),
            })

    print(json.dumps({
        "total_days":      int(len(test_df)),
        "total_anomalies": int(np.sum(preds)),
        "threshold":       float(threshold),
        "type_counts":     type_counts,
        "anomalies":       anomaly_list,
    }))

if __name__ == "__main__":
    main()