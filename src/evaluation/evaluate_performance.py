import torch
import pandas as pd
import numpy as np
import os
import sys
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
import matplotlib.pyplot as plt
import seaborn as sns

# --- Configuration des chemins (à ajuster si nécessaire) ---
# Le script suppose la structure de dossiers suivante à partir de la racine du projet :
#
# VOTRE_PROJET/
# │
# ├── data/
# │   ├── anomalous/anomalous_dataset_labeled.csv
# │   └── processed/processed_full_year_dataset.csv
# │
# ├── models/
# │   └── saved_models/autoencoder_best.pth
# │
# └── src/
#     ├── evaluation/evaluate_performance.py  (ce script)
#     └── models/autoencoder.py
#

# --- Définition robuste des chemins ---
try:
    # Le chemin racine du projet est déduit en remontant de deux niveaux à partir du dossier du script
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
except NameError:
    # Si __file__ n'est pas défini (par ex. dans un notebook), on utilise le répertoire de travail
    project_root = os.getcwd()

# Ajout du dossier src au path pour l'import de l'autoencodeur
src_path = os.path.join(project_root, "src")
if src_path not in sys.path:
    sys.path.append(src_path)

from models.autoencoder import Autoencoder

def check_path(path, description):
    """Vérifie si un fichier existe et affiche une erreur claire si ce n'est pas le cas."""
    if not os.path.exists(path):
        print(f"ERREUR : Fichier introuvable : {description}")
        print(f"Chemin attendu : {path}")
        print("Veuillez vérifier que le fichier existe et que la structure du projet est correcte.")
        sys.exit(1) # Arrête le script
    return path

def compute_threshold(model, val_tensor, k):
    model.eval()
    with torch.no_grad():
        recon = model(val_tensor)
        mse = torch.mean((val_tensor - recon) ** 2, dim=1).numpy()
    mu    = np.mean(mse)
    sigma = np.std(mse)
    return mu + k * sigma, mu, sigma, mse

def classify_anomaly(original, reconstruction):
    error = (original - reconstruction) ** 2
    total_error = np.sum(error)
    if total_error == 0:
        return "None"

    segments = {
        "Nuit":       np.sum(error[0:360]),
        "Matin":      np.sum(error[360:720]),
        "Apres-midi": np.sum(error[720:1080]),
        "Soir":       np.sum(error[1080:1440])
    }

    max_segment_error  = max(segments.values())
    error_concentration = max_segment_error / total_error

    if error_concentration > 0.6:
        return "Duration"

    order_error_share = (segments["Matin"] + segments["Soir"]) / total_error
    if order_error_share > 0.7:
        return "Order"

    return "Temporal Shift"

def main():
    # --- Définition et vérification des chemins ---
    print("--- Vérification des chemins des fichiers ---")
    model_path = check_path(
        os.path.join(project_root, "models", "saved_models", "autoencoder_best.pth"),
        "Modèle pré-entraîné"
    )
    labeled_path = check_path(
        os.path.join(project_root, "data", "anomalous", "anomalous_dataset_labeled.csv"),
        "Jeu de données étiqueté"
    )
    normal_val_path = check_path(
        os.path.join(project_root, "data", "processed", "processed_full_year_dataset.csv"),
        "Jeu de données de validation normal"
    )
    print("Tous les fichiers nécessaires ont été trouvés.\n")

    # --- Chargement du modèle ---
    model = Autoencoder(input_dim=1440)
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()

    # --- Chargement des données ---
    df = pd.read_csv(labeled_path)
    consumption_cols = [c for c in df.columns if c.startswith('m_')]
    if len(consumption_cols) > 1440:
        consumption_cols = consumption_cols[:1440]
    
    test_data = df[consumption_cols].values
    test_tensor = torch.tensor(test_data, dtype=torch.float32)

    # --- Détection des anomalies ---
    with torch.no_grad():
        recon_tensor = model(test_tensor)
        recon_data = recon_tensor.numpy()
        test_mse = torch.mean((test_tensor - recon_tensor) ** 2, dim=1).numpy()

    # --- Calcul du seuil ---
    val_df = pd.read_csv(normal_val_path)
    val_data = val_df[consumption_cols].values
    val_tensor = torch.tensor(val_data, dtype=torch.float32)
    _, mu_val, sigma_val, _ = compute_threshold(model, val_tensor, k=0)
    
    best_k = 2.5
    threshold = mu_val + best_k * sigma_val
    preds = (test_mse > threshold).astype(int)

    predicted_types = [classify_anomaly(test_data[i], recon_data[i]) if preds[i] == 1 else "None" for i in range(len(df))]

    df["predicted_label"] = preds
    df["predicted_type"] = predicted_types
    df["reconstruction_error"] = test_mse

    # --- Évaluation des métriques ---
    y_true = df["is_anomaly"]
    y_pred = df["predicted_label"]

    print("\n=== Évaluation de la Détection d'Anomalies ===")
    print(f"Accuracy:  {accuracy_score(y_true, y_pred):.4f}")
    print(f"Precision: {precision_score(y_true, y_pred):.4f}")
    print(f"Recall:    {recall_score(y_true, y_pred):.4f}")
    print(f"F1-score:  {f1_score(y_true, y_pred):.4f}")
    
    print("\n--- Rapport de Classification ---")
    print(classification_report(y_true, y_pred, target_names=['Normal', 'Anomalie']))

    # --- Matrice de Confusion ---
    cm = confusion_matrix(y_true, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=['Normal', 'Anomaly'],
            yticklabels=['Normal', 'Anomaly'])
    
    plt.xlabel('Predicted')
    plt.ylabel('Actual')
    plt.title('Confusion Matrix - Anomaly Detection — Classic Autoencoder')
    base_dir = project_root
    figures_dir = os.path.join(base_dir, "reports", "figures")
    out_path = os.path.join(figures_dir, "confusion_matrix.png")
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    print(f"Plot saved -> {out_path}")
    # --- Évaluation par Type d'Anomalie ---
    print("\n=== Évaluation par Type d'Anomalie ===")
    anomalies_df = df[df["is_anomaly"] == 1].copy()
    # Assurer que les types sont traités comme des catégories pour un rapport propre
    true_types = anomalies_df["anomaly_type"].astype('category')
    pred_types = anomalies_df["predicted_type"].astype('category')
    # S'assurer que les deux séries ont les mêmes catégories pour éviter les erreurs
    all_types = sorted(list(set(true_types.cat.categories) | set(pred_types.cat.categories)))
    anomalies_df['anomaly_type'] = pd.Categorical(anomalies_df['anomaly_type'], categories=all_types)
    anomalies_df['predicted_type'] = pd.Categorical(anomalies_df['predicted_type'], categories=all_types)

    print(classification_report(y_true, y_pred, target_names=['Normal', 'Anomaly']))
    results_dir = os.path.join(project_root, "data", "results")
    os.makedirs(results_dir, exist_ok=True)  # creates folder if it doesn't exist
    out_csv = os.path.join(results_dir, "evaluation_results.csv")
    df.to_csv(out_csv, index=False)
    print(f"Results saved -> {out_csv}")
if __name__ == "__main__":
    main()
