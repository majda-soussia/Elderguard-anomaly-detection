import os
import sys
import matplotlib
matplotlib.use('Agg')  # ← sauvegarde sans affichage, ne bloque jamais
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

from src.training.autoencoder_lstm import LSTMAutoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

PROCESSED_PATH       = os.path.join(project_root, "data", "processed", "processed_refit_house2.csv")
SAVE_PATH            = os.path.join(project_root, "models", "saved_models")
VAL_DIR              = os.path.join(project_root, "data", "validation")
FIGURES_DIR          = os.path.join(project_root, "reports", "figures")

BATCH_SIZE           = 64
NUM_EPOCHS           = 100   # ✅ augmenté (était 50)
LR                   = 1e-3
PATIENCE             = 20    # ✅ augmenté (était 10)
HIDDEN_DIM           = 128   # ✅ augmenté (était 64)
LATENT_DIM           = 64    # ✅ augmenté (était 32)
NUM_LAYERS           = 2     # ✅ augmenté (était 1) → active le dropout
VAL_SPLIT            = 0.1
THRESHOLD_PERCENTILE = 95

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def save_fig(name):
    path = os.path.join(FIGURES_DIR, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   Saved -> {path}")


def run_epoch(model, loader, criterion, optimizer=None, train=True):
    model.train(train)
    total = 0.0
    # ✅ pas de breakpoint possible ici — contexte propre
    if train:
        for xb, in loader:
            xb   = xb.to(DEVICE, non_blocking=True)
            optimizer.zero_grad()
            out  = model(xb)
            loss = criterion(out, xb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += loss.item() * len(xb)
    else:
        with torch.no_grad():
            for xb, in loader:
                xb   = xb.to(DEVICE, non_blocking=True)
                out  = model(xb)
                loss = criterion(out, xb)
                total += loss.item() * len(xb)
    return total / len(loader.dataset)


def get_errors(model, X_sc, batch_size=64):
    """Calcule le MSE de reconstruction par jour — sans jamais bloquer."""
    model.eval()
    errors = []
    with torch.no_grad():
        for s in range(0, len(X_sc), batch_size):
            xb  = torch.tensor(X_sc[s:s + batch_size], dtype=torch.float32).to(DEVICE)
            out = model(xb)
            # MSE moyen sur les 1440 pas de temps, par sample
            err = ((xb - out) ** 2).mean(dim=1).cpu().numpy()
            errors.extend(err.tolist())   # ✅ .tolist() évite les problèmes de type numpy
    return np.array(errors)


# ─────────────────────────────────────────────
# TRAIN
# ─────────────────────────────────────────────

def train():
    print("=" * 60)
    print("  LSTM Autoencoder — REFIT House 2")
    print(f"  Device : {DEVICE}")
    print("=" * 60)

    os.makedirs(SAVE_PATH,   exist_ok=True)
    os.makedirs(VAL_DIR,     exist_ok=True)
    os.makedirs(FIGURES_DIR, exist_ok=True)

    # ── Charger
    print("\nLoading data...")
    df               = pd.read_csv(PROCESSED_PATH)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data             = df[consumption_cols].values.astype(np.float32)
    print(f"  Total days : {len(data)}")

    # ── MinMaxScaler
    scaler = MinMaxScaler()
    data   = scaler.fit_transform(data)

    # ── Split 90/10
    X_train, X_val = train_test_split(data, test_size=VAL_SPLIT, random_state=42)
    print(f"  Train: {len(X_train)} | Val: {len(X_val)}")

    X_train_t    = torch.tensor(X_train, dtype=torch.float32)
    X_val_t      = torch.tensor(X_val,   dtype=torch.float32)
    train_loader = DataLoader(TensorDataset(X_train_t), batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(TensorDataset(X_val_t),   batch_size=BATCH_SIZE, shuffle=False)

    # ── Modèle
    model     = LSTMAutoencoder(
        input_dim=1440,
        hidden_dim=HIDDEN_DIM,
        latent_dim=LATENT_DIM,
        num_layers=NUM_LAYERS
    ).to(DEVICE)

    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)

    # ✅ CosineAnnealingLR : descente progressive du LR, meilleure convergence
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=NUM_EPOCHS, eta_min=1e-5
    )

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n  hidden_dim : {HIDDEN_DIM}")
    print(f"  latent_dim : {LATENT_DIM}")
    print(f"  num_layers : {NUM_LAYERS}")
    print(f"  Parameters : {total_params:,}")
    print(f"  Epochs     : {NUM_EPOCHS}")
    print(f"  Patience   : {PATIENCE}")
    print(f"  Device     : {DEVICE}")
    print("\n" + "=" * 60)
    print("  Starting training...")
    print("=" * 60 + "\n")

    train_losses = []
    val_losses   = []
    best_val     = np.inf
    best_state   = None
    best_epoch   = 0
    no_improve   = 0

    for epoch in range(1, NUM_EPOCHS + 1):
        tr  = run_epoch(model, train_loader, criterion, optimizer, train=True)
        val = run_epoch(model, val_loader,   criterion, train=False)
        scheduler.step()   # ✅ CosineAnnealing : step à chaque époque

        train_losses.append(tr)
        val_losses.append(val)

        # Affichage du LR courant toutes les 10 époques
        current_lr = optimizer.param_groups[0]['lr']
        lr_str     = f" | LR: {current_lr:.2e}" if epoch % 10 == 0 else ""

        print(f"Epoch [{epoch:3d}/{NUM_EPOCHS}] "
              f"Train: {tr:.6f} | Val: {val:.6f}{lr_str}", end="")

        if val < best_val:
            best_val   = val
            best_epoch = epoch
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            no_improve = 0
            print("  <- best [OK]")
        else:
            no_improve += 1
            print()
            if no_improve >= PATIENCE:
                print(f"\n  Early stopping at epoch {epoch}.")
                break

    # ── Charger le meilleur modèle
    model.load_state_dict(best_state)
    save_name = "autoencoder_lstm_refit_house2_best.pth"
    torch.save(model.state_dict(), os.path.join(SAVE_PATH, save_name))

    print(f"\n{'=' * 60}")
    print(f"  Best Val MSE : {best_val:.6f} (epoch {best_epoch})")
    print(f"  Model saved  : {save_name}")
    print(f"{'=' * 60}")

    # ── Générer les courbes
    print("\nGenerating plots...")
    plot_training_curve(train_losses, val_losses, best_epoch)

    train_errors = get_errors(model, X_train)
    threshold    = np.percentile(train_errors, THRESHOLD_PERCENTILE)
    print(f"  Threshold @ {THRESHOLD_PERCENTILE}th pct : {threshold:.5f}")
    plot_error_distribution(train_errors, threshold)

    val_errors = get_errors(model, X_val)
    plot_reconstruction(model, X_val, val_errors)

    print("\n[OK] All plots saved in reports/figures/")


# ─────────────────────────────────────────────
# PLOTS
# ─────────────────────────────────────────────

def plot_training_curve(train_losses, val_losses, best_epoch):
    fig, ax = plt.subplots(figsize=(12, 4))
    epochs  = range(1, len(train_losses) + 1)
    ax.plot(epochs, train_losses, label='Train', color='#9C27B0', linewidth=2)
    ax.plot(epochs, val_losses,   label='Val',   color='#FF9800', linewidth=2)
    # ✅ marquer l'époque avec le meilleur val MSE
    ax.axvline(best_epoch, color='green', linestyle='--', alpha=0.7,
               label=f'Best epoch ({best_epoch})')
    ax.set_xlabel('Epoch')
    ax.set_ylabel('MSE')
    ax.set_title('Training Curve — LSTM Autoencoder (House 2)', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('03_training_curve_house2.png')


def plot_error_distribution(train_errors, threshold):
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.hist(train_errors, bins=60, color='#9C27B0', alpha=0.75, edgecolor='white',
            label='Reconstruction errors (TRAIN)')
    ax.axvline(threshold, color='red', linewidth=2, linestyle='--',
               label=f'Threshold = {threshold:.4f}  ({THRESHOLD_PERCENTILE}th pct)')
    ax.set_xlabel('MSE per day')
    ax.set_ylabel('Number of days')
    ax.set_title('Reconstruction Error Distribution — TRAIN', fontweight='bold')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_fig('04_error_distribution_house2.png')


def plot_reconstruction(model, X_val, val_errors):
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
        (axes[0], best_idx,  recon_best,  'Most NORMAL Day',   '#9C27B0'),
        (axes[1], worst_idx, recon_worst, 'Most ABNORMAL Day', '#F44336'),
    ]:
        ax.plot(h, X_val[idx], color=color, linewidth=1.5, label='Original')
        ax.plot(h, recon, color='black', linewidth=1.2, linestyle='--', label='Reconstructed')
        ax.set_title(f'{title}  |  MSE={val_errors[idx]:.5f}', fontweight='bold')
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{h_:02d}:00' for h_ in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)

    plt.suptitle('LSTM Autoencoder Reconstruction — House 2',
                 fontsize=12, fontweight='bold')
    plt.tight_layout()
    save_fig('06_reconstruction_house2.png')


if __name__ == "__main__":
    train()