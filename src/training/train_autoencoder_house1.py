import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)


# ─────────────────────────────────────────────────────────────
# SIMPLE AUTOENCODER  (1440 → 64 → 1440)
# One encoder layer + one decoder layer — no deep stacking
# ─────────────────────────────────────────────────────────────

class SimpleAutoencoder(nn.Module):
    def __init__(self, input_dim=1440, latent_dim=64):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, latent_dim),
            nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, input_dim),
            nn.Sigmoid(),          # keeps output in [0, 1] like your normalised data
        )

    def forward(self, x):
        z    = self.encoder(x)
        recon = self.decoder(z)
        return recon


# ─────────────────────────────────────────────────────────────
# TRAIN
# ─────────────────────────────────────────────────────────────

def train():
    # ── Paths ─────────────────────────────────────────────────
    processed_path = os.path.join(project_root, "data", "processed", "processed_refit_house2.csv")
    save_path      = os.path.join(project_root, "models", "saved_models")
    val_dir        = os.path.join(project_root, "data", "validation")
    os.makedirs(save_path, exist_ok=True)
    os.makedirs(val_dir,   exist_ok=True)

    if not os.path.exists(processed_path):
        print(f"Error: file not found at {processed_path}")
        print("Please run preprocess_refit.py first.")
        return

    # ── Load & filter House 1 ─────────────────────────────────
    df = pd.read_csv(processed_path)

    if "House" not in df.columns:
        print("ERROR: 'House' column not found.")
        print(f"  Columns available: {list(df.columns[:10])} ...")
        return

    df_house1 = df[df["House"] == 1].copy()
    print(f"Total days in dataset : {len(df)}")
    print(f"Days for House 1      : {len(df_house1)}")

    if len(df_house1) == 0:
        print("ERROR: No data found for House 1.")
        return

    # ── Tensor ────────────────────────────────────────────────
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data        = df_house1[consumption_cols].values
    data_tensor = torch.tensor(data, dtype=torch.float32)

    # ── Split 70 / 20 / 10 ───────────────────────────────────
    train_data, temp_data = train_test_split(data_tensor, test_size=0.3,  random_state=42)
    val_data,   test_data = train_test_split(temp_data,   test_size=1/3,  random_state=42)

    print(f"Dataset Split: Train={len(train_data)}, Val={len(val_data)}, Test={len(test_data)}")

    # ── Save validation set ───────────────────────────────────
    val_df   = pd.DataFrame(val_data.numpy(), columns=consumption_cols)
    val_path = os.path.join(val_dir, "refit_house1_validation_dataset.csv")
    val_df.to_csv(val_path, index=False)
    print(f"Validation dataset saved to: {val_path}")

    # ── DataLoaders ───────────────────────────────────────────
    train_dataloader = DataLoader(TensorDataset(train_data), batch_size=16, shuffle=True)
    val_dataloader   = DataLoader(TensorDataset(val_data),   batch_size=16, shuffle=False)

    # ── Model ─────────────────────────────────────────────────
    model     = SimpleAutoencoder(input_dim=1440, latent_dim=64)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    num_epochs        = 100
    best_val_loss     = float("inf")
    patience          = 10
    epochs_no_improve = 0

    
    print("\nStarting training  (Simple Autoencoder 1440 -> 64 -> 1440)...\n")

    for epoch in range(num_epochs):

        # ── Train ─────────────────────────────────────────────
        model.train()
        total_train_loss = 0
        for (batch,) in train_dataloader:
            optimizer.zero_grad()
            outputs = model(batch)
            loss    = criterion(outputs, batch)
            loss.backward()
            optimizer.step()
            total_train_loss += loss.item()

        avg_train_loss = total_train_loss / len(train_dataloader)

        # ── Validation ────────────────────────────────────────
        model.eval()
        total_val_loss = 0
        with torch.no_grad():
            for (batch,) in val_dataloader:
                outputs = model(batch)
                loss    = criterion(outputs, batch)
                total_val_loss += loss.item()

        avg_val_loss = total_val_loss / len(val_dataloader)

        print(f"Epoch [{epoch+1:3d}/{num_epochs}], "
              f"Train Loss: {avg_train_loss:.6f}, "
              f"Val Loss: {avg_val_loss:.6f}")

        # ── Early stopping ────────────────────────────────────
        if avg_val_loss < best_val_loss:
            best_val_loss     = avg_val_loss
            epochs_no_improve = 0
            torch.save(model.state_dict(),
                       os.path.join(save_path, "autoencoder_refit_house1_best.pth"))
            print("\tValidation loss improved. Saving best model.")
        else:
            epochs_no_improve += 1
            if epochs_no_improve == patience:
                print(f"\tEarly stopping triggered after {patience} epochs.")
                break

    print("\nTraining completed.")
    print(f"Model saved  : {os.path.join(save_path, 'autoencoder_refit_house1_best.pth')}")
    print(f"Val set saved: {val_path}")


if __name__ == "__main__":
    train()