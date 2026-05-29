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

try:
    from src.models.autoencoder import Autoencoder
except ImportError:
    try:
        from models.autoencoder import Autoencoder
    except ImportError:
        sys.path.append(os.path.join(project_root, "src"))
        from models.autoencoder import Autoencoder
# Split data into Train (70%), Validation (20%), and Test (10%)
    # First split: Train and Remaining (30%)
    # Second split: Validation (20/30 = 2/3) and Test (10/30 = 1/3)

def train():
    processed_path = os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv")
    save_path = os.path.join(project_root, "models", "saved_models")
    os.makedirs(save_path, exist_ok=True)

    if not os.path.exists(processed_path):
        print(f"Error: Processed data not found at {processed_path}. Please run preprocess.py first.")
        return

    df = pd.read_csv(processed_path)
    consumption_cols = [f"m_{i}" for i in range(1, 1441)]
    data = df[consumption_cols].values


    data_tensor = torch.tensor(data, dtype=torch.float32)
    train_data, temp_data = train_test_split(data_tensor, test_size=0.3, random_state=42)
    val_data, test_data = train_test_split(temp_data, test_size=1/3, random_state=42)
    
    val_df = pd.DataFrame(val_data.numpy(), columns=consumption_cols)
    val_dir = os.path.join(project_root, "data", "validation")
    os.makedirs(val_dir, exist_ok=True)

    val_path = os.path.join(val_dir, "normal_validation_dataset.csv")
    val_df.to_csv(val_path, index=False)
    print("Validation dataset saved to:", val_path)
    train_dataloader = DataLoader(TensorDataset(train_data), batch_size=16, shuffle=True)
    val_dataloader = DataLoader(TensorDataset(val_data), batch_size=16, shuffle=False)


    print(f"Dataset Split: Train={len(train_data)}, Val={len(val_data)}, Test={len(test_data)}")

    model = Autoencoder(input_dim=1440)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    num_epochs = 100
    best_val_loss = float("inf")
    patience = 10
    epochs_no_improve = 0

    print("Starting training...\n")

    for epoch in range(num_epochs):
        model.train()
        total_train_loss = 0
        for batch in train_dataloader:
            inputs = batch[0]
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, inputs)
            loss.backward()
            optimizer.step()

            total_train_loss += loss.item()

        avg_train_loss = total_train_loss / len(train_dataloader)

        model.eval()
        total_val_loss = 0
        with torch.no_grad():
            for batch in val_dataloader:
                inputs = batch[0]
                outputs = model(inputs)
                loss = criterion(outputs, inputs)
                total_val_loss += loss.item()

        avg_val_loss = total_val_loss / len(val_dataloader)

        print(f"Epoch [{epoch+1}/{num_epochs}], Train Loss: {avg_train_loss:.6f}, Val Loss: {avg_val_loss:.6f}")

        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            epochs_no_improve = 0
            torch.save(model.state_dict(), os.path.join(save_path, "autoencoder_best.pth"))
            print("\tValidation loss improved. Saving best model.")
        else:
            epochs_no_improve += 1
            if epochs_no_improve == patience:
                print(f"\tEarly stopping triggered after {patience} epochs.")
                break

    print("\nTraining completed.")

if __name__ == "__main__":
    train()