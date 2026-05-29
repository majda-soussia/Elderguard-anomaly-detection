import os
import sys
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.autoencoder_lstm import LSTMAutoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

PROCESSED_PATH = os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv")
SAVE_PATH      = os.path.join(project_root, "models", "saved_models")
VAL_DIR        = os.path.join(project_root, "data", "validation")

BATCH_SIZE = 16
NUM_EPOCHS = 100
LR         = 0.001
PATIENCE   = 10


def train():
    print("=" * 60)
    print("  LSTM Autoencoder — Generated Full Year Dataset")
    print("=" * 60)

    os.makedirs(SAVE_PATH, exist_ok=True)
    os.makedirs(VAL_DIR,   exist_ok=True)

    if not os.path.exists(PROCESSED_PATH):
        print(f" File not found: {PROCESSED_PATH}")
        print("   Please run preprocess.py first.")
        return

    # ── Charger les données
    print("\nLoading data...")
    df               = pd.read_csv(PROCESSED_PATH)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data             = df[consumption_cols].values

    print(f"  Total days : {len(data)}")

    # ── Split 70% / 20% / 10%
    data_tensor           = torch.tensor(data, dtype=torch.float32)
    train_data, temp_data = train_test_split(data_tensor, test_size=0.3,  random_state=42)
    val_data,   test_data = train_test_split(temp_data,   test_size=1/3,  random_state=42)

    print(f"  Split -> Train: {len(train_data)} | Val: {len(val_data)} | Test: {len(test_data)}")

    # ── Sauvegarder validation
    val_df = pd.DataFrame(val_data.numpy(), columns=consumption_cols)
    val_df.to_csv(os.path.join(VAL_DIR, "lstm_generated_validation_dataset.csv"), index=False)
    print(f"  Validation saved ")

    # ── DataLoaders
    train_loader = DataLoader(TensorDataset(train_data), batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(TensorDataset(val_data),   batch_size=BATCH_SIZE, shuffle=False)

    # ── Modèle
    model     = LSTMAutoencoder(input_dim=1440, hidden_dim=128, latent_dim=32, num_layers=2)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n  Model      : LSTM Autoencoder")
    print(f"  Parameters : {total_params:,}")
    print(f"  Optimizer  : Adam (lr={LR})")
    print(f"  Batch      : {BATCH_SIZE}")
    print(f"  Max epochs : {NUM_EPOCHS}")
    print(f"  Patience   : {PATIENCE}")
    print("\n" + "=" * 60)
    print("  Starting training...")
    print("=" * 60 + "\n")

    best_val_loss     = float("inf")
    epochs_no_improve = 0

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

        # ── Validation
        model.eval()
        total_val = 0
        with torch.no_grad():
            for batch in val_loader:
                inputs  = batch[0]
                outputs = model(inputs)
                loss    = criterion(outputs, inputs)
                total_val += loss.item()

        avg_val = total_val / len(val_loader)

        print(f"Epoch [{epoch+1:3d}/{NUM_EPOCHS}] "
              f"Train: {avg_train:.6f} | Val: {avg_val:.6f}", end="")

        if avg_val < best_val_loss:
            best_val_loss     = avg_val
            epochs_no_improve = 0
            torch.save(model.state_dict(),
                       os.path.join(SAVE_PATH, "autoencoder_lstm_generated_best.pth"))
            print("  <- best ")
        else:
            epochs_no_improve += 1
            print()
            if epochs_no_improve >= PATIENCE:
                print(f"\n  Early stopping at epoch {epoch+1}.")
                break

    print(f"\n{'='*60}")
    print(f"  Training completed!")
    print(f"  Best Val Loss : {best_val_loss:.6f}")
    print(f"  Model saved   : autoencoder_lstm_generated_best.pth")
    print(f"{'='*60}")


if __name__ == "__main__":
    train()