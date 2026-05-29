import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import os

def preprocess_data(input_path, output_path):
    df = pd.read_csv(input_path)

    # Convert 'Date' to datetime objects for feature extraction
    df['Date'] = pd.to_datetime(df['Date'])

    # Extract temporal features
    df['day_of_week'] = df['Date'].dt.dayofweek # Monday=0, Sunday=6
    df['is_weekend'] = (df['Date'].dt.dayofweek >= 5).astype(int) # 1 for weekend, 0 for weekday

    # Separate metadata (Date, Scenario, and new temporal features) from consumption data
    metadata_cols = ["Date", "Scenario", "day_of_week", "is_weekend"]
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]

    metadata_df = df[metadata_cols]
    consumption_data = df[consumption_cols]

    # Data Normalization
    scaler = MinMaxScaler()
    normalized_consumption_data = scaler.fit_transform(consumption_data)

    # Convert normalized data back to DataFrame
    normalized_df = pd.DataFrame(normalized_consumption_data, columns=consumption_cols)

    # Combine metadata with normalized consumption data
    processed_df = pd.concat([metadata_df, normalized_df], axis=1)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Save the processed data
    processed_df.to_csv(output_path, index=False)
    print(f"Processed data saved to: {output_path}")

    # Save the scaler for later use (e.g., inverse transformation or processing new data)
    import joblib
    scaler_path = os.path.join(os.path.dirname(output_path), "scaler.joblib")
    joblib.dump(scaler, scaler_path)
    print(f"Scaler saved to: {scaler_path}")

if __name__ == "__main__":
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    raw_data_path = os.path.join(project_root, "data", "raw", "full_year_dataset.csv")
    processed_data_path = os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv")
    
    preprocess_data(raw_data_path, processed_data_path)