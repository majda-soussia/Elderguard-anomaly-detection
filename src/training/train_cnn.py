import os
import sys
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import MinMaxScaler

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.CNN import Autoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

BATCH_SIZE = 64
NUM_EPOCHS = 100
LR         = 0.001
LATENT_DIM = 32

CONFIGS = {
    "generated": {
        "data_path" : os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv"),
        "model_name": "autoencoder_cnn_generated_best.pth",
        "val_name"  : "cnn_generated_validation_dataset.csv",
        "plot_name" : "cnn_generated_training_curve.png",
        "title"     : "CNN Autoencoder — Generated Dataset",
    },
    "refit": {
        "data_path" : os.path.join(project_root, "data", "processed", "processed_refit_dataset.csv"),
        "model_name": "autoencoder_cnn_refit_best.pth",
        "val_name"  : "cnn_refit_validation_dataset.csv",
        "plot_name" : "cnn_refit_training_curve.png",
        "title"     : "CNN Autoencoder — REFIT Dataset",
    },
}

SAVE_PATH   = os.path.join(project_root, "models", "saved_models")
VAL_DIR     = os.path.join(project_root, "data", "validation")
FIGURES_DIR = os.path.join(project_root, "reports", "figures")


def load_and_normalize(config):
    """Charge et normalise les données.
    - REFIT  : MinMaxScaler par maison (évite l'écrasement inter-maisons)
    - Generated : MinMaxScaler global
    """
    df               = pd.read_csv(config["data_path"])
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]

    if "House" in df.columns:
        print(f"  Houses     : {df['House'].nunique()}")
        normalized_parts = []
        for _, group in df.groupby("House"):
            scaler = MinMaxScaler()
            normalized_parts.append(
                scaler.fit_transform(group[consumption_cols].values)
            )
        data = np.vstack(normalized_parts)
    else:
        scaler = MinMaxScaler()
        data   = scaler.fit_transform(df[consumption_cols].values)

    return data, consumption_cols


def train_one(config):
    print("=" * 60)
    print(f"  {config['title']}")
    print("=" * 60)

    os.makedirs(SAVE_PATH,   exist_ok=True)
    os.makedirs(VAL_DIR,     exist_ok=True)
    os.makedirs(FIGURES_DIR, exist_ok=True)

    if not os.path.exists(config["data_path"]):
        print(f"  Data not found: {config['data_path']}")
        return None

    # ── Charger + normaliser
    print("\nLoading data...")
    data, consumption_cols = load_and_normalize(config)
    print(f"  Total days : {len(data)}")

    # ── Split 80/20
    split   = int(0.8 * len(data))
    X_train = torch.tensor(data[:split], dtype=torch.float32)
    X_test  = torch.tensor(data[split:], dtype=torch.float32)
    print(f"  Train: {len(X_train)} | Test: {len(X_test)}")

    # ── Sauvegarder validation
    val_df = pd.DataFrame(X_train.numpy(), columns=consumption_cols)
    val_df.to_csv(os.path.join(VAL_DIR, config["val_name"]), index=False)
    print(f"  Validation saved ✅")

    # ── DataLoaders
    train_loader = DataLoader(TensorDataset(X_train), batch_size=BATCH_SIZE, shuffle=True)
    test_loader  = DataLoader(TensorDataset(X_test),  batch_size=BATCH_SIZE, shuffle=False)

    # ── Modèle CNN
    model     = Autoencoder(input_dim=1440, latent_dim=LATENT_DIM)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', patience=5, factor=0.5
    )

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n  Model      : CNN Autoencoder (Conv1d)")
    print(f"  latent_dim : {LATENT_DIM}")
    print(f"  Parameters : {total_params:,}")
    print(f"  Batch size : {BATCH_SIZE}")
    print(f"  Epochs     : {NUM_EPOCHS}  ← NO early stopping")
    print("\n" + "="*60)
    print("  Starting training...")
    print("="*60 + "\n")

    train_losses = []
    test_losses  = []
    best_loss    = float("inf")
    current_lr   = LR

    for epoch in range(NUM_EPOCHS):

        # ── Train
        model.train()
        total_train = 0
        for batch in train_loader:
            inputs = batch[0]
            optimizer.zero_grad()
            outputs = model(inputs)
            loss    = criterion(outputs, inputs)
            loss.backward()
            optimizer.step()
            total_train += loss.item()
        avg_train = total_train / len(train_loader)
        train_losses.append(avg_train)

        # ── Test
        model.eval()
        total_test = 0
        with torch.no_grad():
            for batch in test_loader:
                inputs  = batch[0]
                outputs = model(inputs)
                loss    = criterion(outputs, inputs)
                total_test += loss.item()
        avg_test = total_test / len(test_loader)
        test_losses.append(avg_test)

        # ── Scheduler
        scheduler.step(avg_test)
        new_lr = optimizer.param_groups[0]['lr']
        lr_tag = f" [LR→{new_lr:.6f}]" if new_lr != current_lr else ""
        current_lr = new_lr

        # ── Sauvegarder meilleur
        if avg_test < best_loss:
            best_loss = avg_test
            torch.save(model.state_dict(),
                       os.path.join(SAVE_PATH, config["model_name"]))
            tag = "  ← best ✅"
        else:
            tag = ""

        print(f"Epoch [{epoch+1:3d}/{NUM_EPOCHS}] "
              f"Train: {avg_train:.6f} | Test: {avg_test:.6f}{lr_tag}{tag}")

    print(f"\n{'='*60}")
    print(f"  Completed! ({NUM_EPOCHS}/{NUM_EPOCHS} epochs)")
    print(f"  Best Test Loss : {best_loss:.6f}")
    print(f"  Model saved    : {config['model_name']}")
    print(f"{'='*60}")

    # ── Courbe
    plt.figure(figsize=(10, 5))
    plt.plot(train_losses, label='Train Loss', color='royalblue', linewidth=1.5)
    plt.plot(test_losses,  label='Test Loss',  color='crimson',   linewidth=1.5, linestyle='--')
    plt.title(f"{config['title']} — Training Curve", fontweight='bold')
    plt.xlabel('Epoch')
    plt.ylabel('MSE Loss')
    plt.legend()
    plt.grid(True, alpha=0.3)
    path = os.path.join(FIGURES_DIR, config["plot_name"])
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"✅ Curve saved: {path}")

    return best_loss


def main():
    print("\n" + "█"*60)
    print("  CNN AUTOENCODER TRAINING")
    print("█"*60)

    results = {}

    loss = train_one(CONFIGS["generated"])
    if loss: results["CNN — Generated"] = loss

    print("\n\n")

    loss = train_one(CONFIGS["refit"])
    if loss: results["CNN — REFIT"] = loss

    print("\n" + "="*60)
    print("  FINAL SUMMARY")
    print("="*60)
    for name, loss in results.items():
        print(f"  {name:<25} Best Loss : {loss:.6f}")
    print("="*60)


if __name__ == "__main__":
    main()