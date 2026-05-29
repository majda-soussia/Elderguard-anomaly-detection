import pandas as pd
import matplotlib.pyplot as plt
import os
def plot_week():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))


    PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))

    csv_path = os.path.join(
        PROJECT_ROOT, "data", "raw", "full_year_dataset.csv"
    )

    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV not found at: {csv_path}")

    df = pd.read_csv(csv_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    plt.figure(figsize=(20, 8))
    plt.plot(df['timestamp'], df['aggregate'], color='#2c3e50', linewidth=0.5, label='Aggregate Power (W)')
    
    # Shade background for different days
    days = df['timestamp'].dt.date.unique()
    colors = ['#f9f9f9', '#ffffff']
    for i, day in enumerate(days):
        day_start = pd.Timestamp(day)
        day_end = day_start + pd.Timedelta(days=1)
        plt.axvspan(day_start, day_end, facecolor=colors[i % 2], alpha=0.5)
        plt.text(day_start + pd.Timedelta(hours=12), df['aggregate'].max() * 0.9, 
                 day_start.strftime('%A'), horizontalalignment='center', fontweight='bold')

    plt.title('Weekly Electricity Consumption Profile - Based on Custom Scenarios', fontsize=16)
    plt.xlabel('Time', fontsize=12)
    plt.ylabel('Power (Watts)', fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.3)
    plt.tight_layout()
    os.makedirs("reports/figures", exist_ok=True)

    output_path = os.path.join("reports", "figures", "final_monthly_profile.png")
    plt.savefig(output_path, dpi=300)
    plt.close()

    print(f"Visualization saved to {output_path}")


if __name__ == "__main__":
    plot_week()