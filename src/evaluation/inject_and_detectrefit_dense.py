import os
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler

# ─────────────────────────────────────────────
# PATH SETUP
# ─────────────────────────────────────────────

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

from src.training.autoencoder import Autoencoder

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

BASE_DATA_DIR = os.path.join(project_root, "data", "processed")

if os.path.exists(os.path.join(BASE_DATA_DIR, "processed_refit")):
    REFIT_DATA_DIR = os.path.join(BASE_DATA_DIR, "processed_refit")
else:
    REFIT_DATA_DIR = BASE_DATA_DIR

MODELS_DIR       = os.path.join(project_root, "models", "saved_models")
OUTPUT_DIR       = os.path.join(project_root, "data", "anomalous", "refit_dense")
FIGURES_BASE_DIR = os.path.join(project_root, "reports", "anomaly_refit_dense")

HOUSES               = list(range(1, 22))
THRESHOLD_PERCENTILE = 95
N_INJECTIONS         = 20
DEVICE               = torch.device("cuda" if torch.cuda.is_available() else "cpu")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(FIGURES_BASE_DIR, exist_ok=True)

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def save_fig(figures_dir, name):
    path = os.path.join(figures_dir, name)
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"    Saved -> {path}")

# ─────────────────────────────────────────────
# INJECTION FUNCTIONS
# ─────────────────────────────────────────────

def inject_temporal_shift(sample, shift_minutes=240):
    shift = shift_minutes % len(sample)
    return np.roll(sample, shift)

def inject_duration_anomaly(sample, start_min=400, anomalous_duration=180):
    result = sample.copy()
    val = min(np.mean(result) + 0.4, 1.0)
    result[start_min:min(len(sample), start_min + anomalous_duration)] = val
    return result

def inject_order_anomaly(sample):
    result = sample.copy()
    n = len(sample)
    q1, q2, q3 = n // 4, n // 2, 3 * n // 4
    morning = result[q1:q2].copy()
    evening = result[q3:n].copy()
    min_len = min(len(morning), len(evening))
    result[q1:q1 + min_len] = evening[:min_len]
    result[q3:q3 + min_len] = morning[:min_len]
    return result

def create_unlabeled_anomalous_dataset(df, consumption_cols, n_injections=20):

    anomalous_df = df.copy().reset_index(drop=True)
    indices = list(anomalous_df.index)
    np.random.shuffle(indices)

    injectors = [
        inject_temporal_shift,
        inject_duration_anomaly,
        inject_order_anomaly
    ]

    for i, injector in enumerate(injectors):
        for idx in indices[i * n_injections:(i + 1) * n_injections]:
            anomalous_df.loc[idx, consumption_cols] = injector(
                anomalous_df.loc[idx, consumption_cols].values
            )

    print(f"    {len(injectors)*n_injections} anomalies injected")

    return anomalous_df

# ─────────────────────────────────────────────
# LOAD MODEL
# ─────────────────────────────────────────────

def load_model(house_id):

    specific_path = os.path.join(
        MODELS_DIR,
        f"autoencoder_dense_refit_house{house_id}_best.pth"
    )

    global_path = os.path.join(MODELS_DIR, "autoencoder_best.pth")

    if os.path.exists(specific_path):
        model_path = specific_path
    else:
        model_path = global_path
        print("    Using global model")

    model = Autoencoder(input_dim=1440)

    model.load_state_dict(
        torch.load(model_path, map_location=DEVICE)
    )

    model.eval()
    model.to(DEVICE)

    return model

# ─────────────────────────────────────────────
# COMPUTE ERRORS
# ─────────────────────────────────────────────

def compute_errors(model, data, batch_size=64):

    errors = []

    with torch.no_grad():

        for s in range(0, len(data), batch_size):

            xb = torch.tensor(
                data[s:s + batch_size],
                dtype=torch.float32
            ).to(DEVICE)

            out = model(xb)

            err = ((xb - out) ** 2).mean(dim=1).cpu().numpy()

            errors.extend(err.tolist())

    return np.array(errors)

# ─────────────────────────────────────────────
# PLOTS
# ─────────────────────────────────────────────

def plot_average_load_curve(data_normal, data_anomalous, figures_dir):

    h = np.arange(1440) / 60

    fig, axes = plt.subplots(2,1,figsize=(14,7),sharex=True)

    for ax,data,label,color in [
        (axes[0],data_normal,'Normal','#2196F3'),
        (axes[1],data_anomalous,'Anomalous','#F44336')
    ]:

        mu=data.mean(axis=0)
        sd=data.std(axis=0)

        ax.fill_between(h,mu-sd,mu+sd,alpha=0.2,color=color)
        ax.plot(h,mu,color=color,linewidth=1.5)

        ax.set_title(label)
        ax.grid(alpha=0.3)

    axes[-1].set_xlabel("Hour")

    plt.tight_layout()

    save_fig(figures_dir,"01_load_curve.png")

def plot_error_distribution(val_errors,test_errors,threshold,figures_dir):

    fig,ax=plt.subplots(figsize=(10,4))

    ax.hist(val_errors,bins=60,alpha=0.6,label="Normal")
    ax.hist(test_errors,bins=60,alpha=0.6,label="Test")

    ax.axvline(threshold,color='black',linestyle='--',
               label=f"Threshold={threshold:.4f}")

    ax.legend()
    ax.grid(alpha=0.3)

    plt.tight_layout()

    save_fig(figures_dir,"02_error_distribution.png")

def plot_anomaly_timeline(test_errors,predictions,threshold,figures_dir):

    days=np.arange(len(test_errors))

    fig,axes=plt.subplots(2,1,figsize=(14,6),sharex=True)

    axes[0].plot(days,test_errors,color="green")
    axes[0].axhline(threshold,color="red",linestyle="--")

    axes[1].fill_between(days,0,predictions,step="mid",
                         color="red",alpha=0.6)

    axes[1].set_yticks([0,1])
    axes[1].set_yticklabels(["Normal","Anomaly"])

    plt.tight_layout()

    save_fig(figures_dir,"03_timeline.png")

def plot_top10_anomalies(test_errors,threshold,figures_dir):

    top10_idx=np.argsort(test_errors)[::-1][:10]
    scores=test_errors[top10_idx]

    labels=[f"Day {i}" for i in top10_idx]

    fig,ax=plt.subplots(figsize=(10,4))

    ax.barh(range(10),scores[::-1],color="#F44336")

    ax.set_yticks(range(10))
    ax.set_yticklabels(labels[::-1])

    ax.axvline(threshold,color="black",linestyle="--")

    ax.set_xlabel("Reconstruction Error")
    ax.set_title("Top 10 Most Anomalous Days")

    ax.grid(axis="x",alpha=0.3)

    plt.tight_layout()

    save_fig(figures_dir,"04_top10_anomalies.png")

# ─────────────────────────────────────────────
# DATA FILE
# ─────────────────────────────────────────────

def find_data_file(house_id):

    possible_paths=[
        f"processed_refit_house{house_id}.csv",
        f"refit_house{house_id}.csv",
        f"house{house_id}.csv"
    ]

    for fname in possible_paths:

        full_path=os.path.join(REFIT_DATA_DIR,fname)

        if os.path.exists(full_path):
            return full_path

    return None

# ─────────────────────────────────────────────
# PROCESS HOUSE
# ─────────────────────────────────────────────

def process_house(house_id,all_results):

    print(f"\nHOUSE {house_id}")

    data_path=find_data_file(house_id)

    if data_path is None:
        print("  No data")
        return

    df=pd.read_csv(data_path)

    consumption_cols=[f"m_{i}" for i in range(1,1441)]

    scaler=MinMaxScaler()

    data_normal=scaler.fit_transform(
        df[consumption_cols].values
    )

    anomalous_df=create_unlabeled_anomalous_dataset(
        df,
        consumption_cols,
        N_INJECTIONS
    )

    anomalous_df.to_csv(
        os.path.join(
            OUTPUT_DIR,
            f"house_{house_id}_anomalous.csv"
        ),
        index=False
    )

    data_anomalous=scaler.transform(
        anomalous_df[consumption_cols].values
    )

    model=load_model(house_id)

    val_errors=compute_errors(model,data_normal)

    threshold=np.percentile(
        val_errors,
        THRESHOLD_PERCENTILE
    )

    test_errors=compute_errors(model,data_anomalous)

    predictions=(test_errors>threshold).astype(int)

    detection_rate=predictions.mean()*100

    print(f"Detection rate: {detection_rate:.2f}%")

    results_df=pd.DataFrame({
        "reconstruction_error":test_errors,
        "predicted_anomaly":predictions
    })

    results_df.to_csv(
        os.path.join(
            OUTPUT_DIR,
            f"house_{house_id}_detection_results.csv"
        ),
        index=False
    )

    figures_dir=os.path.join(
        FIGURES_BASE_DIR,
        f"house_{house_id}"
    )

    os.makedirs(figures_dir,exist_ok=True)

    plot_average_load_curve(
        data_normal,
        data_anomalous,
        figures_dir
    )

    plot_error_distribution(
        val_errors,
        test_errors,
        threshold,
        figures_dir
    )

    plot_anomaly_timeline(
        test_errors,
        predictions,
        threshold,
        figures_dir
    )

    plot_top10_anomalies(
        test_errors,
        threshold,
        figures_dir
    )

    all_results.append({
        "house_id":house_id,
        "detection_rate":round(detection_rate,2)
    })

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():

    print("Dense AE REFIT Detection")

    all_results=[]

    for house_id in HOUSES:

        try:
            process_house(house_id,all_results)

        except Exception as e:
            print(f"Error house {house_id}: {e}")

    if all_results:

        summary=pd.DataFrame(all_results)

        print("\nSUMMARY")
        print(summary)

        summary.to_csv(
            os.path.join(
                OUTPUT_DIR,
                "summary_detection_refit.csv"
            ),
            index=False
        )

if __name__ == "__main__":
    main()