import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
from sklearn.metrics import precision_score, recall_score, f1_score

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)


# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

PROCESSED_PATH = os.path.join(project_root, "data", "processed",  "processed_refit_house2.csv")
VAL_PATH       = os.path.join(project_root, "data", "validation", "refit_house1_validation_dataset.csv")
MODEL_PATH     = os.path.join(project_root, "models", "saved_models", "autoencoder_refit_house1_best.pth")
OUTPUT_DIR     = os.path.join(project_root, "data",    "anomalous")
FIGURES_DIR    = os.path.join(project_root, "reports", "anomaly_refit_house1")

N_INJECTIONS = 20          # 20 per type  →  60 total
BEST_K       = 3           # threshold = mu + k*sigma
DEVICE       = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ─────────────────────────────────────────────────────────────
# SIMPLE AUTOENCODER  (must match the trained model)
# ─────────────────────────────────────────────────────────────

class SimpleAutoencoder(nn.Module):
    def __init__(self, input_dim=1440, latent_dim=64):
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(input_dim, latent_dim), nn.ReLU())
        self.decoder = nn.Sequential(nn.Linear(latent_dim, input_dim), nn.Sigmoid())

    def forward(self, x):
        return self.decoder(self.encoder(x))


# ─────────────────────────────────────────────────────────────
# INJECTION FUNCTIONS
# ─────────────────────────────────────────────────────────────

def inject_temporal_shift(sample, shift_minutes=240):
    shift = shift_minutes % len(sample)
    return np.roll(sample, shift)


def inject_duration_anomaly(sample, start_min=400, anomalous_duration=180):
    result = sample.copy()
    val    = min(np.mean(result) + 0.4, 1.0)
    result[start_min : min(len(sample), start_min + anomalous_duration)] = val
    return result


def inject_order_anomaly(sample):
    result      = sample.copy()
    n           = len(sample)
    q1, q2, q3 = n // 4, n // 2, 3 * n // 4
    morning     = result[q1:q2].copy()
    evening     = result[q3:n].copy()
    min_len     = min(len(morning), len(evening))
    result[q1 : q1 + min_len] = evening[:min_len]
    result[q3 : q3 + min_len] = morning[:min_len]
    return result


def inject_anomalies(df, consumption_cols, n_injections):
    """
    Returns:
        anomalous_df  - dataframe with injected values (no labels)
        labeled_df    - same dataframe + is_anomaly + anomaly_type columns
        type_indices  - dict mapping type_name -> list of injected row indices
    """
    anomalous_df = df.copy().reset_index(drop=True)
    labeled_df   = anomalous_df.copy()

    indices = list(anomalous_df.index)
    np.random.seed(42)
    np.random.shuffle(indices)

    injectors = [
        ("Temporal Shift", inject_temporal_shift),
        ("Duration",       inject_duration_anomaly),
        ("Order",          inject_order_anomaly),
    ]

    total_needed = len(injectors) * n_injections
    if total_needed > len(indices):
        raise ValueError(
            f"Not enough days ({len(indices)}) for {total_needed} injections. "
            f"Reduce N_INJECTIONS."
        )

    labeled_df["is_anomaly"]   = 0
    labeled_df["anomaly_type"] = "None"
    type_indices = {}

    for i, (type_name, injector) in enumerate(injectors):
        chosen = indices[i * n_injections : (i + 1) * n_injections]
        type_indices[type_name] = chosen
        for idx in chosen:
            anomalous_df.loc[idx, consumption_cols] = injector(
                anomalous_df.loc[idx, consumption_cols].values
            )
            labeled_df.loc[idx, "is_anomaly"]   = 1
            labeled_df.loc[idx, "anomaly_type"] = type_name

    print(f"  Injected {total_needed} anomalies "
          f"({n_injections} x Temporal Shift, {n_injections} x Duration, {n_injections} x Order)")
    return anomalous_df, labeled_df, type_indices


# ─────────────────────────────────────────────────────────────
# MODEL
# ─────────────────────────────────────────────────────────────

def load_model():
    model = SimpleAutoencoder(input_dim=1440, latent_dim=64)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True))
    model.eval()
    model.to(DEVICE)
    print(f"  Model loaded: {MODEL_PATH}")
    return model


# ─────────────────────────────────────────────────────────────
# RECONSTRUCTION ERRORS
# ─────────────────────────────────────────────────────────────

def compute_errors(model, data, batch_size=64):
    errors = []
    model.eval()
    with torch.no_grad():
        for s in range(0, len(data), batch_size):
            xb  = torch.tensor(data[s:s + batch_size], dtype=torch.float32).to(DEVICE)
            out = model(xb)
            err = ((xb - out) ** 2).mean(dim=1).cpu().numpy()
            errors.extend(err.tolist())
    return np.array(errors)


# ─────────────────────────────────────────────────────────────
# ANOMALY TYPE CLASSIFIER  (heuristic on residual shape)
# ─────────────────────────────────────────────────────────────

def classify_anomaly(original, reconstruction):
    error       = (original - reconstruction) ** 2
    total_error = np.sum(error)
    if total_error == 0:
        return "None"

    segments = {
        "Night":     np.sum(error[0:360]),
        "Morning":   np.sum(error[360:720]),
        "Afternoon": np.sum(error[720:1080]),
        "Evening":   np.sum(error[1080:1440]),
    }

    max_seg   = max(segments.values())
    conc      = max_seg / total_error
    if conc > 0.6:
        return "Duration"

    order_share = (segments["Morning"] + segments["Evening"]) / total_error
    if order_share > 0.7:
        return "Order"

    return "Temporal Shift"


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def save_fig(name):
    path = os.path.join(FIGURES_DIR, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Saved -> {path}")


# ─────────────────────────────────────────────────────────────
# PLOTS
# ─────────────────────────────────────────────────────────────

def plot_load_curves(data_normal, data_anomalous):
    h = np.arange(1440) / 60
    fig, axes = plt.subplots(2, 1, figsize=(15, 8), sharex=True)
    for ax, data, label, color in [
        (axes[0], data_normal,    'Normal (House 1)',    '#2196F3'),
        (axes[1], data_anomalous, 'Anomalous (House 1)', '#F44336'),
    ]:
        mu = data.mean(axis=0)
        sd = data.std(axis=0)
        ax.fill_between(h, mu - sd, mu + sd, alpha=0.2, color=color)
        ax.plot(h, mu, color=color, linewidth=1.8, label=f'{len(data)} days')
        ax.set_title(f'{label} — Average Load Curve', fontweight='bold')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend(loc='upper right', fontsize=9)
        ax.grid(alpha=0.3)
    axes[-1].set_xlabel('Hour')
    plt.suptitle('Average Daily Load Curve — Simple AE on REFIT House 1',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    save_fig('01_load_curves.png')


def plot_error_distribution(val_errors, test_errors, threshold):
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.hist(val_errors,  bins=50, color='#2196F3', alpha=0.6,
            label='Normal (validation)', density=True, edgecolor='white')
    ax.hist(test_errors, bins=50, color='#F44336', alpha=0.6,
            label='Test (with anomalies)', density=True, edgecolor='white')
    ax.axvline(threshold, color='black', linewidth=2, linestyle='--',
               label=f'Threshold (k={BEST_K}) = {threshold:.5f}')
    ax.set_xlabel('Reconstruction Error (MSE per day)')
    ax.set_ylabel('Density')
    ax.set_title('Reconstruction Error Distribution — Simple AE / REFIT House 1',
                 fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('02_error_distribution.png')


def plot_anomaly_timeline(test_errors, predictions, threshold, labeled_df):
    TYPE_COLORS = {
        "Temporal Shift": "#E74C3C",
        "Duration":       "#F39C12",
        "Order":          "#8E44AD",
    }

    fig, ax = plt.subplots(figsize=(14, 5))
    ax.plot(test_errors, color='#4C72B0', linewidth=0.8,
            label='Reconstruction MSE', zorder=1)
    ax.axhline(threshold, color='red', linestyle='--', linewidth=1.5,
               label=f'Threshold (k={BEST_K}) = {threshold:.5f}', zorder=2)

    plotted = set()
    for i, atype in enumerate(labeled_df["anomaly_type"].values):
        if atype != "None":
            color = TYPE_COLORS.get(atype, "black")
            lbl   = atype if atype not in plotted else "_nolegend_"
            ax.scatter(i, test_errors[i], color=color, zorder=5, s=50,
                       label=lbl, edgecolors='white', linewidths=0.5)
            plotted.add(atype)

    ax.set_xlabel('Day index')
    ax.set_ylabel('MSE')
    ax.set_title('Anomaly Detection Timeline — Simple AE / REFIT House 1',
                 fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('03_anomaly_timeline.png')


def plot_k_sensitivity(mu_val, sigma_val, test_errors, y_true):
    k_values = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]
    results  = []
    print("\n--- k Sensitivity ---")
    for k in k_values:
        thresh  = mu_val + k * sigma_val
        preds_k = (test_errors > thresh).astype(int)
        p = precision_score(y_true, preds_k, zero_division=0)
        r = recall_score(y_true, preds_k,    zero_division=0)
        f = f1_score(y_true, preds_k,        zero_division=0)
        pct = preds_k.mean() * 100
        results.append({"k": k, "precision": p, "recall": r, "f1_score": f, "pct": pct})
        print(f"  k={k} | P={p:.3f} | R={r:.3f} | F1={f:.3f} | detected={pct:.1f}%")

    ks   = [r["k"]  for r in results]
    f1s  = [r["f1_score"] for r in results]
    pcts = [r["pct"] for r in results]

    fig, ax1 = plt.subplots(figsize=(9, 4))
    ax2 = ax1.twinx()
    ax1.plot(ks, f1s,  marker='o', color='#2196F3', linewidth=2, label='F1-score')
    ax2.plot(ks, pcts, marker='s', color='#F44336', linewidth=2, linestyle='--',
             label='Detected %')
    ax1.axvline(BEST_K, color='gray', linestyle=':', linewidth=1.5,
                label=f'Best k={BEST_K}')
    ax1.set_xlabel('k')
    ax1.set_ylabel('F1-score',       color='#2196F3')
    ax2.set_ylabel('Detected (%)',   color='#F44336')
    ax1.set_title('Threshold Sensitivity (k) — Simple AE / REFIT House 1',
                  fontweight='bold')
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper right', fontsize=9)
    ax1.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('04_k_sensitivity.png')

    return pd.DataFrame(results)


def plot_reconstruction(model, data_anomalous, test_errors):
    worst_idx = int(np.argmax(test_errors))
    best_idx  = int(np.argmin(test_errors))
    h = np.arange(1440) / 60

    model.eval()
    with torch.no_grad():
        def recon(idx):
            x = torch.tensor(data_anomalous[idx], dtype=torch.float32).unsqueeze(0).to(DEVICE)
            return model(x).squeeze().cpu().numpy()
        rb = recon(best_idx)
        rw = recon(worst_idx)

    fig, axes = plt.subplots(1, 2, figsize=(16, 4))
    for ax, idx, r, title, color in [
        (axes[0], best_idx,  rb, 'Most NORMAL Day',   '#2196F3'),
        (axes[1], worst_idx, rw, 'Most ABNORMAL Day', '#F44336'),
    ]:
        ax.plot(h, data_anomalous[idx], color=color, linewidth=1.5, label='Original')
        ax.plot(h, r, color='black', linewidth=1.2, linestyle='--', label='Reconstructed')
        ax.set_title(f'{title}  |  MSE={test_errors[idx]:.5f}', fontweight='bold')
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)
    plt.suptitle('Simple Autoencoder Reconstruction — REFIT House 1',
                 fontsize=12, fontweight='bold')
    plt.tight_layout()
    save_fig('05_reconstruction.png')


def plot_top10(test_errors, threshold):
    top10_idx    = np.argsort(test_errors)[::-1][:10]
    top10_scores = test_errors[top10_idx]

    fig, ax = plt.subplots(figsize=(12, 4))
    bars = ax.barh(range(10), top10_scores[::-1], color='#F44336', alpha=0.8)
    ax.set_yticks(range(10))
    ax.set_yticklabels([f'Day {i}' for i in top10_idx[::-1]])
    ax.axvline(threshold, color='black', linewidth=1.5, linestyle='--',
               label=f'Threshold = {threshold:.5f}')
    ax.set_xlabel('MSE Score')
    ax.set_title('Top 10 Most Abnormal Days — Simple AE / REFIT House 1',
                 fontweight='bold')
    ax.legend()
    ax.grid(axis='x', alpha=0.3)
    for bar, score in zip(bars[::-1], top10_scores):
        ax.text(bar.get_width() + 0.00005, bar.get_y() + bar.get_height() / 2,
                f'{score:.5f}', va='center', fontsize=8)
    plt.tight_layout()
    save_fig('06_top10_anomalies.png')


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Simple Autoencoder — REFIT House 1 — Anomaly Detection")
    print(f"  Device : {DEVICE}")
    print("=" * 60)

    os.makedirs(OUTPUT_DIR,  exist_ok=True)
    os.makedirs(FIGURES_DIR, exist_ok=True)

    # ── 1. Load & filter House 1 ──────────────────────────────
    print("\n[1] Loading data (House 1 only)...")
    df = pd.read_csv(PROCESSED_PATH)
    df_house1 = df[df["House"] == 1].copy().reset_index(drop=True)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    print(f"  House 1 days : {len(df_house1)}")

    data_normal = df_house1[consumption_cols].values.astype(np.float32)

    # ── 2. Inject anomalies ───────────────────────────────────
    print(f"\n[2] Injecting anomalies ({N_INJECTIONS} per type)...")
    anomalous_df, labeled_df, type_indices = inject_anomalies(
        df_house1, consumption_cols, N_INJECTIONS
    )
    data_anomalous = anomalous_df[consumption_cols].values.astype(np.float32)

    # Save both versions
    anomalous_df.to_csv(os.path.join(OUTPUT_DIR, "refit_house1_anomalous_unlabeled.csv"), index=False)
    labeled_df.to_csv(  os.path.join(OUTPUT_DIR, "refit_house1_anomalous_labeled.csv"),   index=False)
    print("  Saved: refit_house1_anomalous_unlabeled.csv")
    print("  Saved: refit_house1_anomalous_labeled.csv")

    # ── 3. Load model ─────────────────────────────────────────
    print("\n[3] Loading model...")
    model = load_model()

    # ── 4. Threshold from validation set ─────────────────────
    print("\n[4] Computing threshold from validation set...")
    val_df     = pd.read_csv(VAL_PATH)
    val_data   = val_df[consumption_cols].values.astype(np.float32)
    val_errors = compute_errors(model, val_data)
    mu_val     = val_errors.mean()
    sigma_val  = val_errors.std()
    threshold  = mu_val + BEST_K * sigma_val
    print(f"  Val  mean : {mu_val:.6f}")
    print(f"  Val  std  : {sigma_val:.6f}")
    print(f"  Threshold (k={BEST_K}) : {threshold:.6f}")

    # ── 5. Detect ─────────────────────────────────────────────
    print("\n[5] Detecting anomalies...")
    test_errors = compute_errors(model, data_anomalous)
    predictions = (test_errors > threshold).astype(int)
    n_detected  = predictions.sum()
    print(f"  Total days : {len(predictions)}")
    print(f"  Detected   : {n_detected}")
    print(f"  Rate       : {n_detected / len(predictions) * 100:.1f}%")

    # ── 6. Classify each detected anomaly ─────────────────────
    print("\n[6] Classifying anomaly types...")
    model.eval()
    recon_data = []
    with torch.no_grad():
        for s in range(0, len(data_anomalous), 64):
            xb  = torch.tensor(data_anomalous[s:s+64], dtype=torch.float32).to(DEVICE)
            out = model(xb).cpu().numpy()
            recon_data.append(out)
    recon_data = np.vstack(recon_data)

    predicted_types = []
    for i in range(len(data_anomalous)):
        if predictions[i] == 1:
            predicted_types.append(classify_anomaly(data_anomalous[i], recon_data[i]))
        else:
            predicted_types.append("None")

    type_counts = pd.Series(predicted_types).value_counts()
    if "None" in type_counts:
        type_counts = type_counts.drop("None")
    print("\n  Breakdown by type:")
    for atype, count in type_counts.items():
        print(f"    {atype:<20}: {count}")

    # ── 7. Evaluation metrics ─────────────────────────────────
    print("\n[7] Evaluation metrics...")
    y_true = labeled_df["is_anomaly"].values
    p = precision_score(y_true, predictions, zero_division=0)
    r = recall_score(y_true,    predictions, zero_division=0)
    f = f1_score(y_true,        predictions, zero_division=0)
    print(f"  Precision : {p:.3f}")
    print(f"  Recall    : {r:.3f}")
    print(f"  F1-score  : {f:.3f}")

    # ── 8. Save results CSV ───────────────────────────────────
    results_df = labeled_df[["is_anomaly", "anomaly_type"]].copy()
    results_df["reconstruction_error"] = test_errors
    results_df["predicted_anomaly"]    = predictions
    results_df["predicted_type"]       = predicted_types
    results_path = os.path.join(OUTPUT_DIR, "refit_house1_detection_results.csv")
    results_df.to_csv(results_path, index=False)
    print(f"\n  Results saved -> {results_path}")

    # ── 9. Plots ──────────────────────────────────────────────
    print("\n[8] Generating plots...")
    plot_load_curves(data_normal, data_anomalous)
    plot_error_distribution(val_errors, test_errors, threshold)
    plot_anomaly_timeline(test_errors, predictions, threshold, labeled_df)
    df_k = plot_k_sensitivity(mu_val, sigma_val, test_errors, y_true)
    df_k.to_csv(os.path.join(OUTPUT_DIR, "refit_house1_k_sensitivity.csv"), index=False)
    plot_reconstruction(model, data_anomalous, test_errors)
    plot_top10(test_errors, threshold)

    # ── Summary ───────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  DETECTION SUMMARY — Simple AE / REFIT House 1")
    print("=" * 60)
    print(f"  Total days injected  : {len(predictions)}")
    print(f"  True anomalies       : {int(y_true.sum())}  ({N_INJECTIONS} x 3 types)")
    print(f"  Detected             : {n_detected}")
    print(f"  Precision            : {p:.3f}")
    print(f"  Recall               : {r:.3f}")
    print(f"  F1-score             : {f:.3f}")
    print(f"  Threshold (k={BEST_K})    : {threshold:.6f}")
    print("=" * 60)
    print("\nAll plots saved in reports/anomaly_refit_house1/")


if __name__ == "__main__":
    main()