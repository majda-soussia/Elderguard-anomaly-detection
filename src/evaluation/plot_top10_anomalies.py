import torch
import pandas as pd
import numpy as np
import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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
    os.makedirs(figures_dir, exist_ok=True)

    if not os.path.exists(model_path):
        print(f"ERROR: Model not found at {model_path}")
        return

    # ── Load model ────────────────────────────────────────────────────────────
    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    # ── Load test data ────────────────────────────────────────────────────────
    test_df          = pd.read_csv(anomalous_path)
    consumption_cols = [c for c in test_df.columns if c.startswith('m_')]
    test_data        = test_df[consumption_cols].values
    test_tensor      = torch.tensor(test_data, dtype=torch.float32)

    with torch.no_grad():
        recon   = model(test_tensor)
        test_mse = torch.mean((test_tensor - recon) ** 2, dim=1).numpy()

    # ── Threshold from validation data ────────────────────────────────────────
    val_df     = pd.read_csv(normal_val_path)
    val_data   = val_df[consumption_cols].values
    val_tensor = torch.tensor(val_data, dtype=torch.float32)
    with torch.no_grad():
        val_recon = model(val_tensor)
        val_mse   = torch.mean((val_tensor - val_recon) ** 2, dim=1).numpy()

    best_k    = 3
    threshold = np.mean(val_mse) + best_k * np.std(val_mse)

    # ── Top 10 most anomalous days ────────────────────────────────────────────
    top10_idx    = np.argsort(test_mse)[::-1][:10]
    top10_scores = test_mse[top10_idx]

    # Use Date column if available, otherwise Day index
    if "Date" in test_df.columns:
        top10_labels = [str(test_df["Date"].iloc[i]) for i in top10_idx]
    else:
        top10_labels = [f"Day {i}" for i in top10_idx]

    # ── Plot ──────────────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(12, 5))

    bars = ax.barh(
        range(10),
        top10_scores[::-1],          # lowest score at top → highest at bottom... reversed below
        color="#F44336",
        alpha=0.82,
        edgecolor="white"
    )
    ax.set_yticks(range(10))
    ax.set_yticklabels(top10_labels[::-1], fontsize=9)   # highest MSE at top

    ax.axvline(threshold, color="black", linewidth=1.5, linestyle="--",
               label=f"Threshold = {threshold:.4f}  (k={best_k})")

    ax.set_xlabel("MSE Score")
    ax.set_title("Top 10 Most Anomalous Days ( Classic Autoencoder )", fontweight="bold")
    ax.legend(loc="lower right")
    ax.grid(axis="x", alpha=0.3)

    # Score labels on each bar
    for bar, score in zip(bars[::-1], top10_scores[::-1]):
        ax.text(
            bar.get_width() + max(top10_scores) * 0.005,
            bar.get_y() + bar.get_height() / 2,
            f"{score:.4f}",
            va="center",
            fontsize=8
        )

    plt.tight_layout()
    out_path = os.path.join(figures_dir, "03_top10_anomalies.png")
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Plot saved -> {out_path}")

    # Print the table too
    print(f"\nTop 10 most anomalous days (k={best_k}, threshold={threshold:.6f}):")
    print(f"{'Rank':<6}{'Date':<15}{'MSE':>10}")
    print("-" * 32)
    for rank, (label, score) in enumerate(zip(top10_labels, top10_scores), 1):
        marker = "  <- ANOMALY" if score > threshold else ""
        print(f"{rank:<6}{label:<15}{score:>10.6f}{marker}")


if __name__ == "__main__":
    main()