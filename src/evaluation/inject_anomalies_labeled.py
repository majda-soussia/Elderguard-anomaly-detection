import pandas as pd
import numpy as np
import random
import os

def inject_temporal_shift(row, shift_minutes=240):
    """Type 1: Temporal Shift Anomaly (Wrong Time of Activity)"""
    consumption = row.values.copy()
    # Décalage circulaire important (4h)
    return np.roll(consumption, shift_minutes)

def inject_duration_anomaly(row, start_min=400, anomalous_duration=180):
    """Type 2: Duration Anomaly (Abnormal Length of Activity)"""
    consumption = row.values.copy()
    # On injecte une consommation de machine à café (2000W) pendant 3h au lieu de 5min
    val = np.mean(consumption) + 0.4
    val = min(val, 1.0)
    end_min = min(1440, start_min + anomalous_duration)
    consumption[start_min:end_min] = val
    return consumption

def inject_order_anomaly(row):
    """Type 3: Order Anomaly (Sequence Problem)"""
    consumption = row.values.copy()
    # On inverse le matin (6h-12h) et le soir (18h-24h)
    morning = consumption[360:720].copy()
    evening = consumption[1080:1440].copy()
    consumption[360:720] = evening
    consumption[1080:1440] = morning
    return consumption

def main(input_path, output_path, n_injections=10):
    df = pd.read_csv(input_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]

    anomalous_df = df.copy()
    anomalous_df['is_anomaly'] = 0
    anomalous_df['anomaly_type'] = 'None'
    
    indices = df.index.tolist()
    random.shuffle(indices)
    
    # Injection Type 1
    t1_indices = indices[:n_injections]
    for idx in t1_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_temporal_shift(df.loc[idx, consumption_cols])
        anomalous_df.loc[idx, 'is_anomaly'] = 1
        anomalous_df.loc[idx, 'anomaly_type'] = 'Temporal Shift'
        
    # Injection Type 2
    t2_indices = indices[n_injections:2*n_injections]
    for idx in t2_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_duration_anomaly(df.loc[idx, consumption_cols])
        anomalous_df.loc[idx, 'is_anomaly'] = 1
        anomalous_df.loc[idx, 'anomaly_type'] = 'Duration'
        
    # Injection Type 3
    t3_indices = indices[2*n_injections:3*n_injections]
    for idx in t3_indices:
        anomalous_df.loc[idx, consumption_cols] = inject_order_anomaly(df.loc[idx, consumption_cols])
        anomalous_df.loc[idx, 'is_anomaly'] = 1
        anomalous_df.loc[idx, 'anomaly_type'] = 'Order'
        
    anomalous_df.to_csv(output_path, index=False)
    print(f"Injected {3*n_injections} anomalies ({n_injections} of each type).")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    base_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )

    input_file = os.path.join(base_dir,"data","processed","processed_full_year_dataset.csv")

    output_file = os.path.join(base_dir,"data","anomalous","anomalous_dataset_labeled.csv")

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    print("Input file:", input_file)
    print("Exists?", os.path.exists(input_file))

    main(input_file, output_file, n_injections=20)