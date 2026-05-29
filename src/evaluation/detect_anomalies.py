import torch
import pandas as pd
import numpy as np
import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import precision_score, recall_score, f1_score

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

try:
    from src.models.autoencoder import Autoencoder
except ImportError:
    try:
        from models.autoencoder import Autoencoder
    except ImportError:
        sys.path.append(os.path.join(project_root, "src"))
        from models.autoencoder import Autoencoder


# ─── Threshold ────────────────────────────────────────────────────────────────
def compute_threshold(model, val_tensor, k):
    model.eval()
    with torch.no_grad():
        recon = model(val_tensor)
        mse = torch.mean((val_tensor - recon) ** 2, dim=1).numpy()
    mu    = np.mean(mse)
    sigma = np.std(mse)
    return mu + k * sigma, mu, sigma, mse   # also return val_mse for plotting


# ─── Anomaly type classifier (heuristic on residual shape) ────────────────────
def classify_anomaly(original, reconstruction):
    error = (original - reconstruction) ** 2
    total_error = np.sum(error)
    if total_error == 0:
        return "None"

    segments = {
        "Nuit":       np.sum(error[0:360]),
        "Matin":      np.sum(error[360:720]),
        "Apres-midi": np.sum(error[720:1080]),
        "Soir":       np.sum(error[1080:1440])
    }

    max_segment_error  = max(segments.values())
    error_concentration = max_segment_error / total_error

    if error_concentration > 0.6:
        return "Duration"

    order_error_share = (segments["Matin"] + segments["Soir"]) / total_error
    if order_error_share > 0.7:
        return "Order"

    return "Temporal Shift"


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    base_dir = project_root

    model_path = os.path.join(base_dir, "models", "saved_models", "autoencoder_best.pth")
    if not os.path.exists(model_path):
        model_path = os.path.join(os.getcwd(), "models", "saved_models", "autoencoder_best.pth")

    normal_val_path = os.path.join(base_dir, "data", "validation", "normal_validation_dataset.csv")
    if not os.path.exists(normal_val_path):
        normal_val_path = os.path.join(os.getcwd(), "data", "validation", "normal_validation_dataset.csv")

    anomalous_path = os.path.join(base_dir, "data", "anomalous", "anomalous_dataset.csv")
    if not os.path.exists(anomalous_path):
        anomalous_path = os.path.join(os.getcwd(), "data", "anomalous", "anomalous_dataset.csv")

    figures_dir = os.path.join(base_dir, "reports", "figures")
    results_dir = os.path.join(os.getcwd(), "data", "results")
    os.makedirs(figures_dir, exist_ok=True)
    os.makedirs(results_dir, exist_ok=True)

    if not os.path.exists(model_path):
        print(f"ERREUR : Modèle non trouvé à {model_path}")
        return

    # ── Load model ────────────────────────────────────────────────────────────
    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    # ── Load data ─────────────────────────────────────────────────────────────
    test_df = pd.read_csv(anomalous_path)
    consumption_cols = [c for c in test_df.columns if c.startswith('m_')]
    if len(consumption_cols) < 1440:
        consumption_cols = test_df.select_dtypes(include=[np.number]).columns.tolist()
        consumption_cols = [c for c in consumption_cols
                            if c not in ['is_anomaly', 'Scenario', 'is_weekend', 'day_of_week']]
        if len(consumption_cols) > 1440:
            consumption_cols = consumption_cols[:1440]

    test_data   = test_df[consumption_cols].values
    test_tensor = torch.tensor(test_data, dtype=torch.float32)

    with torch.no_grad():
        recon_tensor = model(test_tensor)
        recon_data   = recon_tensor.numpy()
        test_mse     = torch.mean((test_tensor - recon_tensor) ** 2, dim=1).numpy()

    # ── Validation threshold ──────────────────────────────────────────────────
    val_df   = pd.read_csv(normal_val_path)
    val_data = val_df[consumption_cols].values
    val_tensor = torch.tensor(val_data, dtype=torch.float32)
    _, mu_val, sigma_val, val_mse = compute_threshold(model, val_tensor, k=0)

    # ── k sweep (info only) ───────────────────────────────────────────────────
    k_values = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]
    results_summary = []
    print("\n--- Analyse de la sensibilite (k) ---")
    evaluation_results = []
     # Load labeled dataset
    labeled_path = os.path.join(base_dir, "data", "anomalous", "anomalous_dataset_labeled.csv")
    labeled_df = pd.read_csv(labeled_path)

    y_true = labeled_df["is_anomaly"].values
    for k in k_values:
        thresh = mu_val + k * sigma_val
        preds_k = (test_mse > thresh).astype(int)

        precision = precision_score(y_true, preds_k)
        recall = recall_score(y_true, preds_k)
        f1 = f1_score(y_true, preds_k)

        results_summary.append({
        "k": k,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "percentage": np.mean(preds_k) * 100
    })

        print(f"k={k} | Precision={precision:.3f} | Recall={recall:.3f} | F1={f1:.3f}")
    # ─────────────────────────────────────────────────────────────
    # PLOT 3 — Sensitivity analysis (k vs detection rate)
    # ────────────────────────────────────────────────────────────
    # ── Best k = 2.5 ─────────────────────────────────────────────────────────
    best_k    = 3
    threshold = mu_val + best_k * sigma_val
    preds     = (test_mse > threshold).astype(int)

    predicted_types = []
    for i in range(len(test_df)):
        if preds[i] == 1:
            predicted_types.append(classify_anomaly(test_data[i], recon_data[i]))
        else:
            predicted_types.append("None")

    test_df["reconstruction_error"] = test_mse
    test_df["predicted_label"]      = preds
    test_df["predicted_type"]       = predicted_types

    print(f"\n--- Resultats de la detection (k={best_k}) ---")
    print(f"Total anomalies detectees : {int(np.sum(preds))} / {len(test_df)}")
    type_counts = pd.Series(predicted_types).value_counts()
    if "None" in type_counts:
        type_counts = type_counts.drop("None")
    print("\nBreakdown estime par type d'anomalie :")
    for atype, count in type_counts.items():
        print(f"  {atype:<20}: {count}")

    # Save CSV
    test_df.to_csv(os.path.join(results_dir, "detection_results_classified.csv"), index=False)
    print(f"\nResultats sauvegardes dans : data/results/detection_results_classified.csv")
    

   
    y_pred = preds

    precision = precision_score(y_true, y_pred)
    recall = recall_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred)

    print("\n--- Evaluation Metrics ---")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1-score:  {f1:.3f}")
    # ─────────────────────────────────────────────────────────────────────────
    # PLOT 1 — Reconstruction error distribution (histogram) at best k
    # ─────────────────────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.hist(test_mse, bins=50, color="#4C72B0", alpha=0.75, edgecolor="white",
            label="Reconstruction errors")
    ax.axvline(threshold, color="red", linestyle="--", linewidth=1.5,
               label=f"Threshold (k={best_k}) = {threshold:.4f}")
    ax.set_xlabel("MSE per day")
    ax.set_ylabel("Number of days")
    ax.set_title("Reconstruction Error Distribution — Classic Autoencoder", fontweight="bold")
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    p1 = os.path.join(figures_dir, "01_error_distribution.png")
    plt.savefig(p1, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\nPlot 1 saved -> {p1}")

    # ─────────────────────────────────────────────────────────────────────────
    # PLOT 2 — Reconstruction error per day, coloured by anomaly type
    # ─────────────────────────────────────────────────────────────────────────
    TYPE_COLORS = {
        "Temporal Shift": "#E74C3C",
        "Duration":       "#F39C12",
        "Order":          "#8E44AD",
    }

    fig, ax = plt.subplots(figsize=(14, 5))
    ax.plot(test_mse, color="#4C72B0", linewidth=0.8,
            label="Reconstruction MSE", zorder=1)
    ax.axhline(threshold, color="red", linestyle="--", linewidth=1.2,
               label=f"Threshold (k={best_k})", zorder=2)

    # Scatter each anomaly type with its own colour
    plotted_types = set()
    for i, (mse_val, atype) in enumerate(zip(test_mse, predicted_types)):
        if atype != "None":
            color  = TYPE_COLORS.get(atype, "black")
            label  = atype if atype not in plotted_types else "_nolegend_"
            ax.scatter(i, mse_val, color=color, zorder=5, s=40,
                       label=label, edgecolors="white", linewidths=0.4)
            plotted_types.add(atype)

    ax.set_xlabel("Jour (index)")
    ax.set_ylabel("MSE")
    ax.set_title(f"Anomaly Detection — Reconstruction Error per Day  (k={best_k})",
                 fontweight="bold")
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    p2 = os.path.join(figures_dir, "02_anomalies_per_day.png")
    plt.savefig(p2, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Plot 2 saved -> {p2}")
    k_vals = [r["k"] for r in results_summary]
    percentages = [r["percentage"] for r in results_summary]

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(k_vals, percentages, marker='o', linewidth=2)
    ax.set_xlabel("k value")
    ax.set_ylabel("Detected anomalies (%)")
    ax.set_title("Sensitivity Analysis of k (Threshold = μ + kσ)", fontweight="bold")
    ax.grid(alpha=0.3)

    for i, txt in enumerate(percentages):
        ax.annotate(f"{txt:.1f}%", (k_vals[i], percentages[i]), textcoords="offset points", xytext=(0,5), ha='center')

    plt.tight_layout()
    p3 = os.path.join(figures_dir, "03_k_sensitivity.png")
    plt.savefig(p3, dpi=150)
    plt.close()

    print(f"Plot 3 saved -> {p3}")
    # Save sensitivity results to CSV
    df_k = pd.DataFrame(results_summary)
    csv_path = os.path.join(results_dir, "k_sensitivity_analysis.csv")
    df_k.to_csv(csv_path, index=False)

    print(f"k sensitivity results saved -> {csv_path}")


if __name__ == "__main__":
    main()