import os
import sys
import torch
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import joblib

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

# ─────────────────────────────────────────────
# INJECTION FUNCTIONS
# ─────────────────────────────────────────────

def inject_temporal_shift(sample, shift_minutes=240):
    """Type 1 : activité déplacée de 4h (ex: petit-déj à 10h au lieu de 6h)"""
    return np.roll(sample, shift_minutes)

def inject_duration_anomaly(sample, start_min=400, anomalous_duration=180):
    """Type 2 : activité qui dure 3h au lieu de quelques minutes"""
    result = sample.copy()
    val = min(np.mean(result) + 0.4, 1.0)
    end_min = min(1440, start_min + anomalous_duration)
    result[start_min:end_min] = val
    return result

def inject_order_anomaly(sample):
    """Type 3 : matin et soir inversés"""
    result = sample.copy()
    morning = result[360:720].copy()   # 6h-12h
    evening = result[1080:1440].copy() # 18h-24h
    result[360:720]  = evening
    result[1080:1440] = morning
    return result

# ─────────────────────────────────────────────
# LOAD MODEL + DATA
# ─────────────────────────────────────────────

def load_model_and_data():
    processed_path = os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv")
    scaler_path    = os.path.join(project_root, "data", "processed", "scaler.joblib")
    model_path     = os.path.join(project_root, "models", "saved_models", "autoencoder_best.pth")

    df = pd.read_csv(processed_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data   = df[consumption_cols].values
    scaler = joblib.load(scaler_path)

    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(model_path, weights_only=True))
    model.eval()

    return model, scaler, data

# ─────────────────────────────────────────────
# RECONSTRUCT
# ─────────────────────────────────────────────

def reconstruct(model, sample):
    tensor = torch.tensor(sample, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        recon = model(tensor).numpy().flatten()
    mse = np.mean((sample - recon) ** 2)
    return recon, mse

# ─────────────────────────────────────────────
# PLOT ONE ANOMALY TYPE
# ─────────────────────────────────────────────

def plot_anomaly(normal, anomalous, recon_normal, recon_anomaly,
                 mse_normal, mse_anomaly, title, filename, description):

    minutes = np.arange(1440)
    hours   = [f"{h:02d}:00" for h in range(0, 24, 2)]
    xticks  = list(range(0, 1440, 120))

    fig = plt.figure(figsize=(16, 12))
    fig.suptitle(title, fontsize=16, fontweight='bold', y=0.98)
    gs  = gridspec.GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.3)

    colors_night = [dict(color='#ccccff', alpha=0.3, label='Night')]

    def shade_night(ax):
        ax.axvspan(0,   360,  color='#aaaacc', alpha=0.15, label='Night (0h-6h)')
        ax.axvspan(1320, 1440, color='#aaaacc', alpha=0.15)

    # ── 1. Journée normale originale
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(minutes, normal, color='royalblue', linewidth=1, label='Normal original')
    shade_night(ax1)
    ax1.set_title(f'Normal Day  (MSE: {mse_normal:.6f})', fontsize=11)
    ax1.set_xticks(xticks); ax1.set_xticklabels(hours, rotation=45)
    ax1.set_ylabel('Consommation (normalisée)'); ax1.legend(fontsize=8); ax1.grid(True, alpha=0.3)

    # ── 2. Journée anomalique
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(minutes, anomalous, color='crimson', linewidth=1, label='Anomalous')
    ax2.plot(minutes, normal,    color='royalblue', linewidth=0.8, alpha=0.4, linestyle='--', label='Normal (ref)')
    shade_night(ax2)
    ax2.set_title(f'Anomalous Day  (MSE: {mse_anomaly:.6f})', fontsize=11)
    ax2.set_xticks(xticks); ax2.set_xticklabels(hours, rotation=45)
    ax2.set_ylabel('Consommation (normalisée)'); ax2.legend(fontsize=8); ax2.grid(True, alpha=0.3)

    # ── 3. Reconstruction normale
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.plot(minutes, normal,       color='royalblue', linewidth=1,   label='Original')
    ax3.plot(minutes, recon_normal, color='orange',    linewidth=1.2, linestyle='--', label='Reconstructed')
    shade_night(ax3)
    ax3.set_title('Normal → Reconstruction', fontsize=11)
    ax3.set_xticks(xticks); ax3.set_xticklabels(hours, rotation=45)
    ax3.set_ylabel('Consommation (normalisée)'); ax3.legend(fontsize=8); ax3.grid(True, alpha=0.3)

    # ── 4. Reconstruction anomalique
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.plot(minutes, anomalous,     color='crimson', linewidth=1,   label='Original (anomalous)')
    ax4.plot(minutes, recon_anomaly, color='orange',  linewidth=1.2, linestyle='--', label='Reconstructed')
    shade_night(ax4)
    ax4.set_title('Anomalous → Reconstruction', fontsize=11)
    ax4.set_xticks(xticks); ax4.set_xticklabels(hours, rotation=45)
    ax4.set_ylabel('Consommation (normalisée)'); ax4.legend(fontsize=8); ax4.grid(True, alpha=0.3)

    # ── 5. Erreur point par point
    ax5 = fig.add_subplot(gs[2, :])
    error_normal   = (normal   - recon_normal)   ** 2
    error_anomaly  = (anomalous - recon_anomaly) ** 2
    ax5.plot(minutes, error_normal,  color='royalblue', linewidth=0.8, alpha=0.7, label=f'Normal error   (MSE={mse_normal:.6f})')
    ax5.fill_between(minutes, error_normal, color='royalblue', alpha=0.15)
    ax5.plot(minutes, error_anomaly, color='crimson',   linewidth=0.8, alpha=0.7, label=f'Anomaly error  (MSE={mse_anomaly:.6f})')
    ax5.fill_between(minutes, error_anomaly, color='crimson', alpha=0.15)
    ax5.set_title(f'Reconstruction Error per Minute\n{description}', fontsize=11)
    ax5.set_xticks(xticks); ax5.set_xticklabels(hours, rotation=45)
    ax5.set_ylabel('Squared Error'); ax5.legend(fontsize=9); ax5.grid(True, alpha=0.3)
    shade_night(ax5)

    output_dir = os.path.join(project_root, "reports", "anomaly")
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, filename)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.show()
    print(f"✅ Saved: {path}")
    print(f"   Normal MSE:   {mse_normal:.6f}")
    print(f"   Anomaly MSE:  {mse_anomaly:.6f}")
    print(f"   Ratio:        {mse_anomaly/mse_normal:.1f}x\n")

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("Loading model and data...")
    model, scaler, data = load_model_and_data()

    # Prendre une journée normale comme base
    normal = data[0].copy()
    recon_normal, mse_normal = reconstruct(model, normal)

    anomalies = [
        {
            "name"       : "Temporal Shift",
            "sample"     : inject_temporal_shift(normal, shift_minutes=240),
            "title"      : "Anomaly Type 1 — Temporal Shift\n(Activities shifted by 4 hours)",
            "filename"   : "anomaly_type1_temporal_shift.png",
            "description": "All activities shifted +4h (e.g. breakfast at 10:00 instead of 06:00)"
        },
        {
            "name"       : "Duration",
            "sample"     : inject_duration_anomaly(normal, start_min=400, anomalous_duration=180),
            "title"      : "Anomaly Type 2 — Duration Anomaly\n(Activity lasts 3h instead of a few minutes)",
            "filename"   : "anomaly_type2_duration.png",
            "description": "Appliance running for 3 hours instead of normal duration (minutes 400–580)"
        },
        {
            "name"       : "Order",
            "sample"     : inject_order_anomaly(normal),
            "title"      : "Anomaly Type 3 — Order Anomaly\n(Morning and evening activities swapped)",
            "filename"   : "anomaly_type3_order.png",
            "description": "Morning (6h-12h) and evening (18h-24h) consumption patterns are swapped"
        },
    ]

    for a in anomalies:
        print(f"─── Processing: {a['name']} ───")
        recon_anomaly, mse_anomaly = reconstruct(model, a["sample"])
        plot_anomaly(
            normal, a["sample"],
            recon_normal, recon_anomaly,
            mse_normal, mse_anomaly,
            a["title"], a["filename"], a["description"]
        )

    print("All visualizations done! Check reports/anomaly/")

if __name__ == "__main__":
    main()


























