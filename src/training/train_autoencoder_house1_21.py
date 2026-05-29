import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
import numpy as np
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.autoencoder import Autoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

SAVE_PATH            = os.path.join(project_root, "models", "saved_models")
VAL_DIR              = os.path.join(project_root, "data", "validation")
FIGURES_DIR          = os.path.join(project_root, "reports", "figures")

BATCH_SIZE           = 32
NUM_EPOCHS           = 100
LR                   = 0.001
PATIENCE             = 10
VAL_SPLIT            = 0.1
THRESHOLD_PERCENTILE = 95

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Maisons 3 à 21 (House 14 n'existe pas dans REFIT)
HOUSES = {
    2: os.path.join(project_root, "data", "processed", f"processed_refit_house2.csv")
}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def save_fig(name):
    path = os.path.join(FIGURES_DIR, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   Saved -> {path}")


def get_errors(model, data, batch_size=64):
    model.eval()
    errors = []
    with torch.no_grad():
        for s in range(0, len(data), batch_size):
            xb  = torch.tensor(data[s:s+batch_size], dtype=torch.float32).to(DEVICE)
            out = model(xb)
            err = ((xb - out) ** 2).mean(dim=1).cpu().numpy()
            errors.extend(err.tolist())
    return np.array(errors)


# ─────────────────────────────────────────────
# PLOTS
# ─────────────────────────────────────────────

def plot_training_curve(train_losses, val_losses, best_epoch, house_id):
    fig, ax = plt.subplots(figsize=(12, 4))
    epochs  = range(1, len(train_losses) + 1)
    ax.plot(epochs, train_losses, label='Train', color='#2196F3', linewidth=2)
    ax.plot(epochs, val_losses,   label='Val',   color='#FF9800', linewidth=2)
    ax.axvline(best_epoch, color='green', linestyle='--', alpha=0.7,
               label=f'Best epoch ({best_epoch})')
    ax.set_xlabel('Epoch')
    ax.set_ylabel('MSE')
    ax.set_title(f'Training Curve — Dense Autoencoder (House {house_id})', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig(f'03_training_curve_dense_house{house_id}.png')


def plot_error_distribution(train_errors, threshold, house_id):
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.hist(train_errors, bins=60, color='#2196F3', alpha=0.75, edgecolor='white',
            label='Reconstruction errors (TRAIN)')
    ax.axvline(threshold, color='red', linewidth=2, linestyle='--',
               label=f'Threshold = {threshold:.4f}  ({THRESHOLD_PERCENTILE}th pct)')
    ax.set_xlabel('MSE per day')
    ax.set_ylabel('Number of days')
    ax.set_title(f'Reconstruction Error Distribution — Dense (House {house_id})', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig(f'04_error_distribution_dense_house{house_id}.png')


def plot_reconstruction(model, X_val, val_errors, house_id):
    worst_idx = int(np.argmax(val_errors))
    best_idx  = int(np.argmin(val_errors))

    model.eval()
    with torch.no_grad():
        def reconstruct(idx):
            x = torch.tensor(X_val[idx], dtype=torch.float32).unsqueeze(0).to(DEVICE)
            return model(x).squeeze().cpu().numpy()
        recon_best  = reconstruct(best_idx)
        recon_worst = reconstruct(worst_idx)

    h = np.arange(1440) / 60
    fig, axes = plt.subplots(1, 2, figsize=(16, 4))

    for ax, idx, recon, title, color in [
        (axes[0], best_idx,  recon_best,  'Most NORMAL Day',   '#2196F3'),
        (axes[1], worst_idx, recon_worst, 'Most ABNORMAL Day', '#F44336'),
    ]:
        ax.plot(h, X_val[idx], color=color, linewidth=1.5, label='Original')
        ax.plot(h, recon, color='black', linewidth=1.2, linestyle='--', label='Reconstructed')
        ax.set_title(f'{title}  |  MSE={val_errors[idx]:.5f}', fontweight='bold')
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{hh:02d}:00' for hh in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)

    plt.suptitle(f'Dense Autoencoder Reconstruction — House {house_id}',
                 fontsize=12, fontweight='bold')
    plt.tight_layout()
    save_fig(f'06_reconstruction_dense_house{house_id}.png')


# ─────────────────────────────────────────────
# TRAIN ONE HOUSE
# ─────────────────────────────────────────────

def train_house(house_id, data_path):
    print("\n" + "=" * 60)
    print(f"  Dense Autoencoder — REFIT House {house_id}")
    print(f"  Device : {DEVICE}")
    print("" * 60)

    if not os.path.exists(data_path):
        print(f"  File not found: {data_path}")
        print(f"   Run: python src/preprocessing/preprocess_refit.py --house {house_id}")
        print(f"   Skipping House {house_id}...\n")
        return None

    # ── Charger
    print("\nLoading data...")
    df               = pd.read_csv(data_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data             = df[consumption_cols].values.astype(np.float32)
    print(f"  Total days : {len(data)}")

    # ── MinMaxScaler
    scaler = MinMaxScaler()
    data   = scaler.fit_transform(data)

    # ── Split 90/10
    X_train, X_val = train_test_split(data, test_size=VAL_SPLIT, random_state=42)
    print(f"  Train: {len(X_train)} | Val: {len(X_val)}")

    # ── Sauvegarder validation
    val_df = pd.DataFrame(X_val, columns=consumption_cols)
    val_df.to_csv(os.path.join(VAL_DIR, f"dense_refit_house{house_id}_validation.csv"), index=False)

    X_train_t    = torch.tensor(X_train, dtype=torch.float32)
    X_val_t      = torch.tensor(X_val,   dtype=torch.float32)
    train_loader = DataLoader(TensorDataset(X_train_t), batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(TensorDataset(X_val_t),   batch_size=BATCH_SIZE, shuffle=False)

    # ── Modèle
    model     = Autoencoder(input_dim=1440).to(DEVICE)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)

    print(f"\n  Parameters : {sum(p.numel() for p in model.parameters()):,}")
    print(f"  Epochs     : {NUM_EPOCHS} | Patience : {PATIENCE}")
    print("\n" + "="*60)
    print("  Starting training...")
    print("="*60 + "\n")

    train_losses = []
    val_losses   = []
    best_val     = float("inf")
    best_state   = None
    best_epoch   = 0
    no_improve   = 0

    for epoch in range(1, NUM_EPOCHS + 1):

        # Train
        model.train()
        total_train = 0
        for batch in train_loader:
            inputs = batch[0].to(DEVICE)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss    = criterion(outputs, inputs)
            loss.backward()
            optimizer.step()
            total_train += loss.item()
        avg_train = total_train / len(train_loader)

        # Validation
        model.eval()
        total_val = 0
        with torch.no_grad():
            for batch in val_loader:
                inputs  = batch[0].to(DEVICE)
                outputs = model(inputs)
                loss    = criterion(outputs, inputs)
                total_val += loss.item()
        avg_val = total_val / len(val_loader)

        train_losses.append(avg_train)
        val_losses.append(avg_val)

        print(f"Epoch [{epoch:3d}/{NUM_EPOCHS}] "
              f"Train: {avg_train:.6f} | Val: {avg_val:.6f}", end="")

        if avg_val < best_val:
            best_val   = avg_val
            best_epoch = epoch
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            no_improve = 0
            print("  < best ")
        else:
            no_improve += 1
            print()
            if no_improve >= PATIENCE:
                print(f"\n  Early stopping at epoch {epoch}.")
                break

    model.load_state_dict(best_state)
    model_name = f"autoencoder_dense_refit_house{house_id}_best.pth"
    torch.save(model.state_dict(), os.path.join(SAVE_PATH, model_name))

    print(f"\n{'='*60}")
    print(f"  Best Val MSE : {best_val:.6f} (epoch {best_epoch})")
    print(f"  Model saved  : {model_name}")
    print(f"{'='*60}")

    # Courbes
    print("\nGenerating plots...")
    plot_training_curve(train_losses, val_losses, best_epoch, house_id)

    train_errors = get_errors(model, X_train)
    threshold    = np.percentile(train_errors, THRESHOLD_PERCENTILE)
    plot_error_distribution(train_errors, threshold, house_id)

    val_errors = get_errors(model, X_val)
    plot_reconstruction(model, X_val, val_errors, house_id)

    print(f" House {house_id} done!\n")
    return best_val


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    os.makedirs(SAVE_PATH,   exist_ok=True)
    os.makedirs(VAL_DIR,     exist_ok=True)
    os.makedirs(FIGURES_DIR, exist_ok=True)

    print("=" * 60)
    print(f"  Training Dense Autoencoder on Houses 3 to 21")
    print(f"  Houses to process : {list(HOUSES.keys())}")
    print("=" * 60)

    results = {}
    for house_id, data_path in HOUSES.items():
        best_loss = train_house(house_id, data_path)
        if best_loss is not None:
            results[f"House {house_id}"] = best_loss

    # Résumé final
    print("\n" + "="*60)
    print("  FINAL SUMMARY — Dense Autoencoder (Houses 3-21)")
    print("="*60)
    for name, loss in results.items():
        print(f"  {name:10s} : Best Val Loss = {loss:.6f}")
    print("="*60)


if __name__ == "__main__":
    main()