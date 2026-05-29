import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.autoencoder import Autoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

PROCESSED_PATH       = os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv")
VAL_PATH             = os.path.join(project_root, "data", "validation", "dense_generated_validation_dataset.csv")
MODEL_PATH           = os.path.join(project_root, "models", "saved_models", "autoencoder_best.pth")
OUTPUT_DIR           = os.path.join(project_root, "data", "anomalous")
FIGURES_DIR          = os.path.join(project_root, "reports", "anomaly_dense")

THRESHOLD_PERCENTILE = 95
N_INJECTIONS         = 20
DEVICE               = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def save_fig(name):
    path = os.path.join(FIGURES_DIR, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  ✅ Saved -> {path}")


# ─────────────────────────────────────────────
# INJECTION FUNCTIONS (sans labels)
# ─────────────────────────────────────────────

# BUG 1 FIX — shift borné à la taille réelle du sample pour éviter un roll trivial
def inject_temporal_shift(sample, shift_minutes=240):
    shift = shift_minutes % len(sample)
    return np.roll(sample, shift)


# BUG 2 FIX — on utilise len(sample) au lieu de la constante hardcodée 1440
def inject_duration_anomaly(sample, start_min=400, anomalous_duration=180):
    result = sample.copy()
    val    = min(np.mean(result) + 0.4, 1.0)
    result[start_min:min(len(sample), start_min + anomalous_duration)] = val
    return result


# BUG 3 FIX — segments calculés dynamiquement selon la taille réelle du sample
def inject_order_anomaly(sample):
    result  = sample.copy()
    n       = len(sample)
    q1, q2, q3 = n // 4, n // 2, 3 * n // 4
    morning  = result[q1:q2].copy()
    evening  = result[q3:n].copy()
    min_len  = min(len(morning), len(evening))
    result[q1:q1 + min_len] = evening[:min_len]
    result[q3:q3 + min_len] = morning[:min_len]
    return result


# BUG 4 FIX — reset_index pour garantir des tranches disjointes + garde-fou si pas assez de jours
def create_unlabeled_anomalous_dataset(df, consumption_cols, n_injections=20):
    anomalous_df = df.copy().reset_index(drop=True)
    indices      = list(anomalous_df.index)
    np.random.shuffle(indices)

    injectors    = [inject_temporal_shift, inject_duration_anomaly, inject_order_anomaly]
    total_needed = len(injectors) * n_injections
    if total_needed > len(indices):
        raise ValueError(
            f"Pas assez de jours ({len(indices)}) pour {total_needed} injections. "
            f"Réduire N_INJECTIONS ou augmenter le dataset."
        )

    for i, injector in enumerate(injectors):
        for idx in indices[i * n_injections:(i + 1) * n_injections]:
            anomalous_df.loc[idx, consumption_cols] = injector(
                anomalous_df.loc[idx, consumption_cols].values
            )

    print(f"  {total_needed} anomalies injected (no labels)")
    return anomalous_df


# ─────────────────────────────────────────────
# LOAD MODEL — Dense Autoencoder
# ─────────────────────────────────────────────

def load_model():
    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(MODEL_PATH, weights_only=True, map_location=DEVICE))
    model.eval()
    model.to(DEVICE)
    print(f"  Model loaded: {MODEL_PATH}")
    return model


# ─────────────────────────────────────────────
# COMPUTE ERRORS
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# PLOTS
# ─────────────────────────────────────────────

def plot_average_load_curve(data_normal, data_anomalous):
    h = np.arange(1440) / 60
    fig, axes = plt.subplots(2, 1, figsize=(15, 8), sharex=True)
    for ax, data, label, color in [
        (axes[0], data_normal,    'Normal Dataset',    '#2196F3'),
        (axes[1], data_anomalous, 'Anomalous Dataset', '#F44336'),
    ]:
        mu = data.mean(axis=0)
        sd = data.std(axis=0)
        ax.fill_between(h, mu - sd, mu + sd, alpha=0.2, color=color)
        ax.plot(h, mu, color=color, linewidth=1.8, label=f'{len(data)} days')
        ax.set_title(f'{label} — Average Load Curve', fontsize=11, fontweight='bold')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend(loc='upper right', fontsize=9)
        ax.grid(alpha=0.3)
    axes[-1].set_xlabel('Hour')
    plt.suptitle('Average Daily Load Curve — Normal vs Anomalous (Dense AE)',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    save_fig('01_load_curves_comparison.png')


# BUG 6 FIX — tronquer proprement avant reshape pour éviter un crash si données incomplètes
def plot_heatmap(data, title, filename):
    n_minutes   = data.shape[1]
    n_complete  = (len(data) * n_minutes) // (24 * 60)
    valid_data  = data[:n_complete]
    if n_complete == 0:
        print(f"  ⚠️  Pas assez de données pour le heatmap '{title}', skipped.")
        return
    hourly = valid_data.reshape(n_complete, 24, 60).mean(axis=2)
    fig, ax = plt.subplots(figsize=(16, max(4, n_complete // 6)))
    im = ax.imshow(hourly, aspect='auto', cmap='YlOrRd', interpolation='nearest')
    ax.set_xticks(range(24))
    ax.set_xticklabels([f'{h:02d}h' for h in range(24)], fontsize=7)
    ax.set_xlabel('Hour')
    ax.set_ylabel('Day (index)')
    ax.set_title(title, fontweight='bold')
    plt.colorbar(im, ax=ax, label='Mean Normalized Power')
    plt.tight_layout()
    save_fig(filename)


def plot_error_distribution(val_errors, test_errors, threshold):
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.hist(val_errors,  bins=60, color='#2196F3', alpha=0.6,
            label='Normal (validation)', density=True, edgecolor='white')
    ax.hist(test_errors, bins=60, color='#F44336', alpha=0.6,
            label='Test (with anomalies)', density=True, edgecolor='white')
    ax.axvline(threshold, color='black', linewidth=2, linestyle='--',
               label=f'Threshold = {threshold:.4f}  ({THRESHOLD_PERCENTILE}th pct)')
    ax.set_xlabel('Reconstruction Error (MSE per day)')
    ax.set_ylabel('Density')
    ax.set_title('Reconstruction Error Distribution — Normal vs Anomalous (Dense AE)',
                 fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('04_error_distribution.png')


def plot_anomaly_timeline(test_errors, predictions, threshold):
    days = np.arange(len(test_errors))
    fig, axes = plt.subplots(2, 1, figsize=(16, 8), sharex=True)

    axes[0].plot(days, test_errors, color='#4CAF50', linewidth=1.2,
                 label='Anomaly Score (MSE)')
    axes[0].axhline(threshold, color='red', linewidth=1.5, linestyle='--',
                    label=f'Threshold = {threshold:.4f}')
    axes[0].fill_between(days, 0, test_errors,
                         where=test_errors > threshold,
                         color='red', alpha=0.3, label='Detected anomaly')
    axes[0].set_ylabel('MSE')
    axes[0].set_title('Anomaly Score per Day (Dense Autoencoder)', fontweight='bold')
    axes[0].legend(fontsize=9)
    axes[0].grid(alpha=0.3)

    axes[1].fill_between(days, 0, predictions, step='mid',
                         color='red', alpha=0.6, label='Detected anomaly')
    axes[1].set_ylabel('Detection')
    axes[1].set_yticks([0, 1])
    axes[1].set_yticklabels(['Normal', 'Anomaly'])
    axes[1].set_xlabel('Day index')
    axes[1].set_title('Days Detected as Anomalous', fontweight='bold')
    axes[1].legend(fontsize=9)
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    save_fig('05_anomaly_timeline.png')


def plot_reconstruction(model, data_anomalous, test_errors):
    worst_idx = int(np.argmax(test_errors))
    best_idx  = int(np.argmin(test_errors))

    model.eval()
    with torch.no_grad():
        def reconstruct(idx):
            x = torch.tensor(data_anomalous[idx], dtype=torch.float32).unsqueeze(0).to(DEVICE)
            return model(x).squeeze().cpu().numpy()
        recon_best  = reconstruct(best_idx)
        recon_worst = reconstruct(worst_idx)

    h = np.arange(1440) / 60
    fig, axes = plt.subplots(1, 2, figsize=(16, 4))
    for ax, idx, recon, title, color in [
        (axes[0], best_idx,  recon_best,  'Most NORMAL Day',   '#2196F3'),
        (axes[1], worst_idx, recon_worst, 'Most ABNORMAL Day', '#F44336'),
    ]:
        ax.plot(h, data_anomalous[idx], color=color, linewidth=1.5, label='Original')
        ax.plot(h, recon, color='black', linewidth=1.2, linestyle='--', label='Reconstructed')
        ax.set_title(f'{title}  |  MSE={test_errors[idx]:.5f}', fontweight='bold')
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)
    plt.suptitle('Dense Autoencoder Reconstruction', fontsize=12, fontweight='bold')
    plt.tight_layout()
    save_fig('06_reconstruction.png')


def plot_top10_abnormal(test_errors, threshold):
    top10_idx    = np.argsort(test_errors)[::-1][:10]
    top10_scores = test_errors[top10_idx]
    top10_labels = [f'Day {i}' for i in top10_idx]

    fig, ax = plt.subplots(figsize=(12, 4))
    bars = ax.barh(range(10), top10_scores[::-1], color='#F44336', alpha=0.8)
    ax.set_yticks(range(10))
    ax.set_yticklabels(top10_labels[::-1])
    ax.axvline(threshold, color='black', linewidth=1.5, linestyle='--',
               label=f'Threshold = {threshold:.4f}')
    ax.set_xlabel('MSE Score')
    ax.set_title('Top 10 Most Abnormal Days (Dense AE)', fontweight='bold')
    ax.legend()
    ax.grid(axis='x', alpha=0.3)
    for bar, score in zip(bars[::-1], top10_scores):
        ax.text(bar.get_width() + 0.0001, bar.get_y() + bar.get_height() / 2,
                f'{score:.4f}', va='center', fontsize=8)
    plt.tight_layout()
    save_fig('07_top10_anomalies.png')


def plot_hour_error_heatmap(model, data_anomalous, test_errors):
    top10_idx    = np.argsort(test_errors)[::-1][:10]
    top10_labels = [f'Day {i}' for i in top10_idx]

    model.eval()
    minute_errors = []
    with torch.no_grad():
        for idx in top10_idx:
            xb  = torch.tensor(data_anomalous[idx], dtype=torch.float32).unsqueeze(0).to(DEVICE)
            rec = model(xb).squeeze().cpu().numpy()
            minute_errors.append((data_anomalous[idx] - rec) ** 2)

    me_hourly = np.array(minute_errors).reshape(10, 24, 60).mean(axis=2)
    fig, ax = plt.subplots(figsize=(14, 4))
    im = ax.imshow(me_hourly, aspect='auto', cmap='hot_r', interpolation='nearest')
    ax.set_xticks(range(24))
    ax.set_xticklabels([f'{h:02d}h' for h in range(24)], fontsize=8)
    ax.set_yticks(range(10))
    ax.set_yticklabels(top10_labels, fontsize=8)
    ax.set_xlabel('Hour of the Day')
    ax.set_title('Reconstruction Error per Hour — Top 10 Abnormal Days (Dense AE)',
                 fontweight='bold')
    plt.colorbar(im, ax=ax, label='MSE')
    plt.tight_layout()
    save_fig('08_hour_error_heatmap.png')


def plot_threshold_sensitivity(val_errors, test_errors):
    percentiles = range(70, 100)
    n_detected  = [(test_errors > np.percentile(val_errors, p)).sum()
                   for p in percentiles]
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(percentiles, n_detected, color='#2196F3', linewidth=2,
            marker='o', markersize=3)
    ax.axvline(THRESHOLD_PERCENTILE, color='red', linestyle='--',
               label=f'Current ({THRESHOLD_PERCENTILE}th pct) → {n_detected[THRESHOLD_PERCENTILE - 70]} days')
    ax.set_xlabel('Threshold Percentile')
    ax.set_ylabel('Number of Days Detected as Abnormal')
    ax.set_title('Threshold Sensitivity (Dense AE)', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('09_threshold_sensitivity.png')


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Dense Autoencoder Anomaly Detection — Unsupervised")
    print(f"  Device : {DEVICE}")
    print("=" * 60)

    os.makedirs(OUTPUT_DIR,  exist_ok=True)
    os.makedirs(FIGURES_DIR, exist_ok=True)

    # ── 1. Charger données
    print("\n[1] Loading data...")
    df               = pd.read_csv(PROCESSED_PATH)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    print(f"  Total days : {len(df)}")

    # ── 2. Normaliser
    print("\n[2] Normalizing...")
    scaler      = MinMaxScaler()
    data_normal = scaler.fit_transform(df[consumption_cols].values.astype(np.float32))

    # ── 3. Injecter anomalies SANS labels
    print("\n[3] Injecting anomalies (no labels)...")
    anomalous_df   = create_unlabeled_anomalous_dataset(df, consumption_cols, N_INJECTIONS)
    data_anomalous = scaler.transform(
        anomalous_df[consumption_cols].values.astype(np.float32)
    )
    anomalous_df.to_csv(os.path.join(OUTPUT_DIR, "anomalous_unlabeled_dense.csv"), index=False)
    print(f"  Saved: anomalous_unlabeled_dense.csv")

    # ── 4. Charger modèle
    print("\n[4] Loading model...")
    model = load_model()

    # ── 5. Seuil sur validation normale
    print("\n[5] Computing threshold...")
    val_df     = pd.read_csv(VAL_PATH)
    val_data   = scaler.transform(val_df[consumption_cols].values.astype(np.float32))
    val_errors = compute_errors(model, val_data)
    threshold  = np.percentile(val_errors, THRESHOLD_PERCENTILE)
    print(f"  Val  — mean: {val_errors.mean():.5f} | std: {val_errors.std():.5f}")
    print(f"  Threshold @ {THRESHOLD_PERCENTILE}th pct : {threshold:.5f}")

    # ── 6. Détection
    print("\n[6] Detecting anomalies...")
    test_errors = compute_errors(model, data_anomalous)
    predictions = (test_errors > threshold).astype(int)
    n_detected  = predictions.sum()
    print(f"  Total days     : {len(predictions)}")
    print(f"  Detected       : {n_detected}")
    print(f"  Detection rate : {n_detected / len(predictions) * 100:.1f}%")

    # BUG 5 FIX — vérification défensive de la colonne "Date" avant d'y accéder
    date_cols  = [c for c in anomalous_df.columns if c.lower() == "date"]
    results_df = anomalous_df[date_cols].copy() if date_cols else pd.DataFrame(index=anomalous_df.index)
    if "Scenario" in anomalous_df.columns:
        results_df["Scenario"] = anomalous_df["Scenario"].values
    results_df["reconstruction_error"] = test_errors
    results_df["predicted_anomaly"]    = predictions
    results_df.to_csv(os.path.join(OUTPUT_DIR, "dense_detection_results.csv"), index=False)

    # ── 7. Générer tous les graphiques
    print("\n[7] Generating plots...")
    plot_average_load_curve(data_normal, data_anomalous)
    plot_heatmap(data_normal,    'Daily Heatmap — Normal Dataset',    '02_heatmap_normal.png')
    plot_heatmap(data_anomalous, 'Daily Heatmap — Anomalous Dataset', '02_heatmap_anomalous.png')
    plot_error_distribution(val_errors, test_errors, threshold)
    plot_anomaly_timeline(test_errors, predictions, threshold)
    plot_reconstruction(model, data_anomalous, test_errors)
    plot_top10_abnormal(test_errors, threshold)
    plot_hour_error_heatmap(model, data_anomalous, test_errors)
    plot_threshold_sensitivity(val_errors, test_errors)

    print("\n" + "=" * 60)
    print("  DETECTION SUMMARY")
    print("=" * 60)
    print(f"  Total days     : {len(predictions)}")
    print(f"  Detected       : {n_detected}")
    print(f"  Normal         : {len(predictions) - n_detected}")
    print(f"  Detection rate : {n_detected / len(predictions) * 100:.1f}%")
    print(f"  Threshold      : {threshold:.5f}")
    print("=" * 60)
    print("\n✅ All plots saved in reports/anomaly_dense/")


if __name__ == "__main__":
    main()