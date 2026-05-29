import torch
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os
import sys

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

def visualize():
    # Paths
    model_path = os.path.join(project_root, "models", "saved_models", "autoencoder_best.pth")
    anomalous_path = os.path.join(project_root, "data", "anomalous", "anomalous_dataset.csv")
    output_dir = os.path.join(project_root, "reports", "figures")
    os.makedirs(output_dir, exist_ok=True)

    # Load model
    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    # Load data
    df = pd.read_csv(anomalous_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    test_data = df[consumption_cols].values
    test_dates = df['Date'].values if 'Date' in df.columns else [f"Day {i}" for i in range(len(df))]
    
    test_tensor = torch.tensor(test_data, dtype=torch.float32)

    # Reconstruct
    with torch.no_grad():
        recon_tensor = model(test_tensor)
        recon_data = recon_tensor.numpy()
        test_errors = torch.mean((test_tensor - recon_tensor) ** 2, dim=1).numpy()

    # Find best and worst reconstruction
    worst_idx = int(np.argmax(test_errors))
    best_idx = int(np.argmin(test_errors))

    # Plotting
    h = np.arange(1440) / 60
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    
    plots_info = [
        (axes[0], best_idx, recon_data[best_idx], 'Most NORMAL Day', '#2196F3'),
        (axes[1], worst_idx, recon_data[worst_idx], 'Most ANOMALOUS Day', '#F44336')
    ]

    for ax, idx, recon, title, color in plots_info:
        ax.plot(h, test_data[idx], color=color, linewidth=1.5, label='Original')
        ax.plot(h, recon, color='black', linewidth=1.2, linestyle='--', label='Reconstructed')
        
        date_str = test_dates[idx]
        mse_val = test_errors[idx]
        ax.set_title(f'{title}\n{date_str} | MSE={mse_val:.5f}', fontweight='bold')
        
        ax.set_xlabel('Hour')
        ax.set_ylabel('Normalized Power')
        ax.set_xticks(range(0, 25, 2))
        ax.set_xticklabels([f'{h_idx:02d}:00' for h_idx in range(0, 25, 2)])
        ax.legend()
        ax.grid(alpha=0.3)

    plt.suptitle('Distribution of Reconstruction Errors — Classic Autoencoder', fontsize=14, fontweight='bold')
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    
    save_path = os.path.join(output_dir, '06_reconstruction.png')
    plt.savefig(save_path, dpi=150)
    print(f"Reconstruction plot saved to: {save_path}")
    plt.close()

if __name__ == "__main__":
    visualize()
