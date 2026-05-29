import pandas as pd
import numpy as np
import random
import os

def inject_temporal_shift(row, shift_minutes=240):
    """Type 1: Temporal Shift Anomaly (Wrong Time of Activity)"""
    consumption = row.values.copy()
    return np.roll(consumption, shift_minutes)

def inject_duration_anomaly(row, start_min=400, anomalous_duration=180):
    """Type 2: Duration Anomaly (Abnormal Length of Activity)"""
    consumption = row.values.copy()
    val = np.mean(consumption) + 0.4
    val = min(val, 1.0)
    end_min = min(1440, start_min + anomalous_duration)
    consumption[start_min:end_min] = val
    return consumption

def inject_order_anomaly(row):
    """Type 3: Order Anomaly (Sequence Problem)"""
    consumption = row.values.copy()
    morning = consumption[360:720].copy()
    evening = consumption[1080:1440].copy()
    consumption[360:720] = evening
    consumption[1080:1440] = morning
    return consumption

def main(input_path, output_dir, n_injections=10):
    df = pd.read_csv(input_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]

    anomalous_df = df.copy()

    indices = df.index.tolist()
    random.shuffle(indices)

    # Injection Type 1: Temporal Shift
    t1_indices = indices[:n_injections]
    for idx in t1_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_temporal_shift(df.loc[idx, consumption_cols])

    # Injection Type 2: Duration
    t2_indices = indices[n_injections:2*n_injections]
    for idx in t2_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_duration_anomaly(df.loc[idx, consumption_cols])

    # Injection Type 3: Order
    t3_indices = indices[2*n_injections:3*n_injections]
    for idx in t3_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_order_anomaly(df.loc[idx, consumption_cols])

    os.makedirs(output_dir, exist_ok=True)

    # File 1: NO labels - used by the real detection pipeline
    unlabeled_df = anomalous_df.copy()
    unlabeled_path = os.path.join(output_dir, "anomalous_dataset.csv")
    unlabeled_df.to_csv(unlabeled_path, index=False)
    print("Saved unlabeled dataset -> " + unlabeled_path)

    # File 2: WITH labels - used only by evaluation scripts
    labeled_df = anomalous_df.copy()
    labeled_df["is_anomaly"] = 0
    labeled_df["anomaly_type"] = "None"
    for idx in t1_indices:
        labeled_df.loc[idx, "is_anomaly"] = 1
        labeled_df.loc[idx, "anomaly_type"] = "Temporal Shift"
    for idx in t2_indices:
        labeled_df.loc[idx, "is_anomaly"] = 1
        labeled_df.loc[idx, "anomaly_type"] = "Duration"
    for idx in t3_indices:
        labeled_df.loc[idx, "is_anomaly"] = 1
        labeled_df.loc[idx, "anomaly_type"] = "Order"

    labeled_path = os.path.join(output_dir, "anomalous_dataset_labeled.csv")
    labeled_df.to_csv(labeled_path, index=False)
    print("Saved labeled dataset   -> " + labeled_path)

    print("\nInjected " + str(3*n_injections) + " anomalies (" + str(n_injections) + " of each type).")


if __name__ == "__main__":
    base_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )

    input_file = os.path.join(base_dir, "data", "processed", "processed_full_year_dataset.csv")
    output_dir = os.path.join(base_dir, "data", "anomalous")

    print("Input file:", input_file)
    print("Exists?", os.path.exists(input_file))

    main(input_file, output_dir, n_injections=20)