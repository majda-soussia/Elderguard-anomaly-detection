import os
import csv
import random
import numpy as np
import sys
from datetime import datetime, timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

try:
    from day_manager_simulator import MasterDayManager
except ModuleNotFoundError:
    try:
        sys.path.append(os.path.abspath(os.path.join(current_dir, "..")))
        from day_manager_simulator import MasterDayManager
    except ModuleNotFoundError:
        print("Error: Could not find 'day_manager_simulator.py'.")
        sys.exit(1)

def expand_day_to_6s(day_minutes, start_datetime):
    t_minutes = np.arange(len(day_minutes))
    t_6s = np.linspace(0, len(day_minutes) - 1, 14400)

    values_6s = np.interp(t_6s, t_minutes, day_minutes)
    values_6s *= np.random.uniform(0.95, 1.05, size=len(values_6s))
    values_6s *= np.random.normal(1.0, 0.02, len(values_6s))

    mask = np.random.rand(len(values_6s)) < 0.002
    values_6s[mask] *= np.random.uniform(0.6, 0.8)

    timestamps = [
        start_datetime + timedelta(seconds=6 * i)
        for i in range(len(values_6s))
    ]
    return timestamps, np.round(values_6s, 2)
def seasonal_factor(date):
    month = date.month

    if month in [12, 1, 2]:      # Winter
        return random.uniform(1.05, 1.15)
    elif month in [6, 7, 8]:     # Summer
        return random.uniform(0.95, 1.05)
    else:                        # Spring / Autumn
        return random.uniform(1.0, 1.05)

def generate_month_dataset_minutes(start_date_str, num_days=365):
    manager = MasterDayManager()

    scenarios = {
        1: "Daily Routine",
        2: "Routine + Laundry",
        3: "Routine + Cleaning",
        4: "Routine + Cooking",
        5: "Outside Day"
    }

    scenario_ids = list(scenarios.keys())
    scenario_weights = [0.5, 0.2, 0.15, 0.1, 0.05]

    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    rows = []

    for day_idx in range(num_days):
        day_date = start_date + timedelta(days=day_idx)

        scenario_id = random.choices(
            scenario_ids, weights=scenario_weights, k=1
        )[0]
        day_minutes = manager.generate_day(scenario_id)
        day_minutes = add_realism_to_day(day_minutes)
        row = (
            [day_date.strftime("%Y-%m-%d"), scenario_id]
            + day_minutes
        )
        rows.append(row)
    return rows

def add_realism_to_day(day_minutes):
    # 1️ Variation journalière globale (±5 %)
    daily_factor = random.uniform(0.95, 1.05)
    day_minutes = [v * daily_factor for v in day_minutes]

    # 2️ Bruit multiplicatif léger
    day_minutes = [
        v * random.normalvariate(1.0, 0.02)
        for v in day_minutes
    ]

    # 3️ Micro-interruptions
    for _ in range(random.randint(1, 4)):
        start = random.randint(0, 1430)
        duration = random.randint(3, 10)
        reduction = random.uniform(0.6, 0.85)

        for i in range(start, min(start + duration, 1440)):
            day_minutes[i] *= reduction

    # 4️ Décalage temporel léger
    shift = random.randint(-5, 5)
    day_minutes = np.roll(day_minutes, shift).tolist()

    return [round(v, 2) for v in day_minutes]


def save_csv_minutes(rows, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    headers = ["Date", "Scenario"] + [f"m_{i}" for i in range(1, 1441)]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


if __name__ == "__main__":
    start_date = "2026-01-01"

    data = generate_month_dataset_minutes(start_date, num_days=365)

    output_path = os.path.join(
        project_root, "data", "raw", "full_year_dataset.csv"
    )

    save_csv_minutes(data, output_path)

    print(f"Dataset generated: {output_path}")
    print(f"Days: {len(data)}")
