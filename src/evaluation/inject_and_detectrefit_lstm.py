import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.autoencoder_lstm import LSTMAutoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

ANOMALOUS_DIR        = os.path.join(project_root, "data", "anomalous", "refit_anomaly")
VAL_DIR              = os.path.join(project_root, "data", "validation")
PROCESSED_DIR        = os.path.join(project_root, "data", "processed")
MODELS_DIR           = os.path.join(project_root, "models", "saved_models")
FIGURES_DIR          = os.path.join(project_root, "reports", "anomaly", "lstm_on_dense")
RESULTS_DIR          = os.path.join(project_root, "data", "anomalous", "refit_dense")

THRESHOLD_PERCENTILE = 95
DEVICE               = torch.device("cuda" if torch.cuda.is_available() else "cpu")

HOUSES = [2]

# Configs à essayer dans l'ordre
CONFIGS = [
    {"hidden_dim": 128, "latent_dim": 64, "num_layers": 2},
    {"hidden_dim": 64,  "latent_dim": 32, "num_layers": 1},
    {"hidden_dim": 256, "latent_dim": 64, "num_layers": 2},
]

# ─────────────────────────────────────────────
# STRATÉGIE DE FALLBACK DES MODÈLES LSTM
# ─────────────────────────────────────────────
# Priorité pour chaque house :
#   1. autoencoder_lstm_refit_house{N}_best.pth  (modèle propre)
#   2. autoencoder_lstm_refit_house1_best.pth    (cross-house H1)
#   3. autoencoder_lstm_refit_best.pth           (générique refit)
#   4. autoencoder_lstm_generated_best.pth       (générique generated)

FALLBACK_MODELS = [
    "autoencoder_lstm_refit_house1_best.pth",
    "autoencoder_lstm_refit_best.pth",
    "autoencoder_lstm_generated_best.pth",
]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def save_fig(name):
    path = os.path.join(FIGURES_DIR, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   Saved -> {path}")


def _try_load(model_path):
    """Essaie toutes les configs sur un fichier .pth. Retourne (model, cfg) ou None."""
    for cfg in CONFIGS:
        try:
            model = LSTMAutoencoder(input_dim=1440, **cfg)
            model.load_state_dict(
                torch.load(model_path, weights_only=True, map_location=DEVICE)
            )
            model.eval()
            model.to(DEVICE)
            return model, cfg
        except Exception:
            continue
    return None, None


def load_lstm_model(house_id):
    """
    Charge le meilleur modèle LSTM disponible pour une house.
    Stratégie : propre → cross-house H1 → générique refit → générique generated.
    Retourne (model, model_label) ou (None, None).
    """
    # ── 1. Modèle propre à la house
    own_path = os.path.join(MODELS_DIR, f"autoencoder_lstm_refit_house{house_id}_best.pth")
    if os.path.exists(own_path):
        model, cfg = _try_load(own_path)
        if model:
            print(f"   Own model  — hidden={cfg['hidden_dim']}, "
                  f"latent={cfg['latent_dim']}, layers={cfg['num_layers']}")
            return model, f"LSTM_house{house_id}"

    # ── 2. Fallback : modèles génériques dans l'ordre de priorité
    for fallback_name in FALLBACK_MODELS:
        fallback_path = os.path.join(MODELS_DIR, fallback_name)
        if os.path.exists(fallback_path):
            model, cfg = _try_load(fallback_path)
            if model:
                label = fallback_name.replace("autoencoder_lstm_", "").replace("_best.pth", "")
                print(f"    Fallback  : {fallback_name}")
                print(f"     hidden={cfg['hidden_dim']}, latent={cfg['latent_dim']}, "
                      f"layers={cfg['num_layers']}")
                return model, f"LSTM_{label}_on_house{house_id}"

    print(f"   No LSTM model available for House {house_id}")
    return None, None


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

def plot_error_distribution(val_errors, test_errors, threshold, house_id, model_label):
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.hist(val_errors,  bins=60, color='#2196F3', alpha=0.6,
            label='Normal (validation)', density=True, edgecolor='white')
    ax.hist(test_errors, bins=60, color='#F44336', alpha=0.6,
            label='Anomalous (injected)', density=True, edgecolor='white')
    ax.axvline(threshold, color='black', linewidth=2, linestyle='--',
               label=f'Threshold = {threshold:.4f}  ({THRESHOLD_PERCENTILE}th pct)')
    ax.set_xlabel('Reconstruction Error (MSE per day)')
    ax.set_ylabel('Density')
    ax.set_title(f'Error Distribution — House {house_id} [{model_label}]', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig(f'house{house_id}_04_error_distribution.png')


def plot_anomaly_timeline(test_errors, predictions, threshold, house_id, model_label):
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
    axes[0].set_title(f'Anomaly Timeline — House {house_id} [{model_label}]', fontweight='bold')
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
    save_fig(f'house{house_id}_05_anomaly_timeline.png')


def plot_reconstruction(model, data_anomalous, test_errors, house_id):
    worst_idx = int(np.argmax(test_errors))
    best_idx  = int(np.argmin(test_errors))

    model.eval()
    with torch.no_grad():
        def reconstruct(idx):
            x = torch.tensor(
                data_anomalous[idx], dtype=torch.float32
            ).unsqueeze(0).to(DEVICE)
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
        ax.plot(h, recon, color='black', linewidth=1.2,
                linestyle='--', label='Reconstructed')
        ax.set_title(f'{title}  |  MSE={test_errors[idx]:.5f}', fontweight='bold')
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)
    plt.suptitle(f'LSTM Reconstruction — House {house_id}', fontsize=12, fontweight='bold')
    plt.tight_layout()
    save_fig(f'house{house_id}_06_reconstruction.png')


def plot_top10_abnormal(test_errors, threshold, house_id):
    n       = min(10, len(test_errors))
    top_idx = np.argsort(test_errors)[::-1][:n]
    scores  = test_errors[top_idx]
    labels  = [f'Day {i}' for i in top_idx]

    fig, ax = plt.subplots(figsize=(12, 4))
    bars = ax.barh(range(n), scores[::-1], color='#F44336', alpha=0.8)
    ax.set_yticks(range(n))
    ax.set_yticklabels(labels[::-1])
    ax.axvline(threshold, color='black', linewidth=1.5, linestyle='--',
               label=f'Threshold = {threshold:.4f}')
    ax.set_xlabel('MSE Score')
    ax.set_title(f'Top {n} Most Abnormal Days — House {house_id}', fontweight='bold')
    ax.legend()
    ax.grid(axis='x', alpha=0.3)
    for bar, score in zip(bars[::-1], scores):
        ax.text(bar.get_width() + 0.0001, bar.get_y() + bar.get_height() / 2,
                f'{score:.4f}', va='center', fontsize=8)
    plt.tight_layout()
    save_fig(f'house{house_id}_07_top10_anomalies.png')


def plot_threshold_sensitivity(val_errors, test_errors, house_id):
    percentiles = range(70, 100)
    n_detected  = [(test_errors > np.percentile(val_errors, p)).sum()
                   for p in percentiles]
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(percentiles, n_detected, color='#2196F3', linewidth=2,
            marker='o', markersize=3)
    ax.axvline(THRESHOLD_PERCENTILE, color='red', linestyle='--',
               label=f'Current ({THRESHOLD_PERCENTILE}th pct) → '
                     f'{n_detected[THRESHOLD_PERCENTILE - 70]} days')
    ax.set_xlabel('Threshold Percentile')
    ax.set_ylabel('Number of Days Detected as Abnormal')
    ax.set_title(f'Threshold Sensitivity — House {house_id}', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig(f'house{house_id}_09_threshold_sensitivity.png')


def plot_summary(summary_results):
    houses     = [r["house"] for r in summary_results]
    det_rates  = [r["detection_rate"] for r in summary_results]
    n_detected = [r["n_detected"] for r in summary_results]
    # Couleur : vert si modèle propre, orange si fallback
    colors = ['#4CAF50' if r['own_model'] else '#FF9800' for r in summary_results]

    fig, axes = plt.subplots(1, 2, figsize=(18, 5))

    bars0 = axes[0].bar([f'H{h}' for h in houses], det_rates,
                        color=colors, alpha=0.85, edgecolor='white')
    axes[0].axhline(np.mean(det_rates), color='black', linestyle='--',
                    label=f'Mean = {np.mean(det_rates):.1f}%')
    for i, v in enumerate(det_rates):
        axes[0].text(i, v + 0.3, f'{v:.1f}%', ha='center', fontsize=7)
    axes[0].set_ylabel('Detection Rate (%)')
    axes[0].set_title('Detection Rate per House\n🟢 Own model  🟠 Fallback model',
                      fontweight='bold')
    axes[0].legend()
    axes[0].grid(axis='y', alpha=0.3)

    axes[1].bar([f'H{h}' for h in houses], n_detected,
                color=colors, alpha=0.85, edgecolor='white')
    axes[1].axhline(np.mean(n_detected), color='black', linestyle='--',
                    label=f'Mean = {np.mean(n_detected):.1f}')
    axes[1].set_ylabel('Number of Detected Days')
    axes[1].set_title('Detected Anomalies per House', fontweight='bold')
    axes[1].legend()
    axes[1].grid(axis='y', alpha=0.3)

    plt.suptitle('LSTM Detection — Dense Injected Anomalies (All Houses)',
                 fontsize=13, fontweight='bold')
    plt.tight_layout()
    save_fig('summary_all_houses.png')


# ─────────────────────────────────────────────
# PROCESS ONE HOUSE
# ─────────────────────────────────────────────

def process_house(house_id):
    anomalous_path = os.path.join(ANOMALOUS_DIR, f"house_{house_id}_anomalous.csv")
    val_path       = os.path.join(VAL_DIR,       f"lstm_refit_house{house_id}_validation.csv")
    processed_path = os.path.join(PROCESSED_DIR, f"processed_refit_house{house_id}.csv")

    # ── Vérifications fichiers de données
    if not os.path.exists(anomalous_path):
        print(f"  [SKIP] No anomalous file: house_{house_id}_anomalous.csv - skipping")
        return None
    if not os.path.exists(processed_path):
        print(f"  [SKIP] No processed file: processed_refit_house{house_id}.csv - skipping")
        return None

    # ── Charger modèle (propre ou fallback)
    model, model_label = load_lstm_model(house_id)
    if model is None:
        return None

    own_model = os.path.exists(
        os.path.join(MODELS_DIR, f"autoencoder_lstm_refit_house{house_id}_best.pth")
    )

    # ── Scaler sur données originales de cette house
    df_orig          = pd.read_csv(processed_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    scaler           = MinMaxScaler()
    scaler.fit(df_orig[consumption_cols].values.astype(np.float32))

    # ── Données anomaliques
    df_anom        = pd.read_csv(anomalous_path)
    data_anomalous = scaler.transform(df_anom[consumption_cols].values.astype(np.float32))

    # ── Validation : fichier dédié ou 10% des normales
    if os.path.exists(val_path):
        df_val   = pd.read_csv(val_path)
        val_data = scaler.transform(df_val[consumption_cols].values.astype(np.float32))
        print(f"  Val : {os.path.basename(val_path)} ({len(val_data)} days)")
    else:
        data_normal = scaler.transform(df_orig[consumption_cols].values.astype(np.float32))
        split       = int(0.9 * len(data_normal))
        val_data    = data_normal[split:]
        print(f"  Val : last 10% of processed_refit_house{house_id} ({len(val_data)} days)")

    # ── Calcul erreurs + détection
    val_errors  = compute_errors(model, val_data)
    test_errors = compute_errors(model, data_anomalous)
    threshold   = np.percentile(val_errors, THRESHOLD_PERCENTILE)
    predictions = (test_errors > threshold).astype(int)
    n_detected  = predictions.sum()
    det_rate    = n_detected / len(predictions) * 100

    print(f"  Threshold      : {threshold:.5f}")
    print(f"  Detected       : {n_detected} / {len(predictions)} days")
    print(f"  Detection rate : {det_rate:.1f}%")

    # ── Sauvegarder résultats CSV
    os.makedirs(RESULTS_DIR, exist_ok=True)
    results_df = df_anom[["Date"]].copy() if "Date" in df_anom.columns else pd.DataFrame()
    results_df["reconstruction_error"] = test_errors
    results_df["predicted_anomaly"]    = predictions
    results_df["model_used"]           = model_label
    results_df.to_csv(
        os.path.join(RESULTS_DIR, f"house_{house_id}_lstm_detection.csv"), index=False
    )

    # ── Plots
    plot_error_distribution(val_errors, test_errors, threshold, house_id, model_label)
    plot_anomaly_timeline(test_errors, predictions, threshold, house_id, model_label)
    plot_reconstruction(model, data_anomalous, test_errors, house_id)
    plot_top10_abnormal(test_errors, threshold, house_id)
    plot_threshold_sensitivity(val_errors, test_errors, house_id)

    return {
        "house"         : house_id,
        "n_total"       : len(predictions),
        "n_detected"    : int(n_detected),
        "detection_rate": round(det_rate, 1),
        "threshold"     : round(float(threshold), 5),
        "model_used"    : model_label,
        "own_model"     : own_model,
    }


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  LSTM Detection on Dense-Injected Anomalies")
    print(f"  Device : {DEVICE}")
    print("=" * 60)

    os.makedirs(FIGURES_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # ── Afficher disponibilité des modèles
    own     = [h for h in HOUSES if os.path.exists(
        os.path.join(MODELS_DIR, f"autoencoder_lstm_refit_house{h}_best.pth"))]
    no_own  = [h for h in HOUSES if h not in own]
    fallback_avail = [f for f in FALLBACK_MODELS
                      if os.path.exists(os.path.join(MODELS_DIR, f))]

    print(f"\n  Own models    : {own}")
    print(f"  No own model  : {no_own}")
    print(f"  Fallback used : {fallback_avail[0] if fallback_avail else 'NONE — abort!'}\n")

    if not own and not fallback_avail:
        print(" No LSTM model available at all. Train at least house1 first.")
        return

    summary_results = []

    for house_id in HOUSES:
        print(f"\n{'-' * 60}")
        print(f"  House {house_id}  "
              f"{'[own model]' if house_id in own else '[fallback model]'}")
        print(f"{'-' * 60}")
        result = process_house(house_id)
        if result:
            summary_results.append(result)

    # ── Graphique comparatif
    if len(summary_results) > 1:
        plot_summary(summary_results)

    # ── Résumé CSV
    if summary_results:
        summary_df = pd.DataFrame(summary_results)
        summary_df.to_csv(
            os.path.join(RESULTS_DIR, "summary_lstm_detection.csv"), index=False
        )

    # ── Tableau final
    print("\n" + "=" * 60)
    print("  FINAL SUMMARY — LSTM Detection")
    print("=" * 60)
    print(f"  {'H':>3} {'Detected':>10} {'Total':>7} {'Rate':>7} "
          f"{'Threshold':>11}  Model")
    print(f"  {'-' * 57}")
    for r in summary_results:
        flag = "[OK]" if r['own_model'] else "[WARN]"
        print(f"  {r['house']:>3} {r['n_detected']:>10} {r['n_total']:>7} "
              f"{r['detection_rate']:>6.1f}% {r['threshold']:>11.5f}  "
              f"{flag} {r['model_used']}")
    print("=" * 60)
    print(f"\n [OK] Results : {RESULTS_DIR}")
    print(f"[WARN] Plots   : {FIGURES_DIR}")


if __name__ == "__main__":
    main()