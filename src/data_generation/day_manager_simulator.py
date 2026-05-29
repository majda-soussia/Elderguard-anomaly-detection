import random
import os
import csv

class MasterDayManager:
    def __init__(self):
        self.LOADS = {
            "fridge": 100, "medical": 80, "night_lights": 30,
            "kettle": 2000, "microwave": 1000, "radio": 20,
            "tv": 120, "lights": 150, "heating": 400,
            "washing_machine": 1500, "vacuum": 800, "oven": 2500,
            "steam_cleaner": 1200, "computer": 60
        }

    def generate_day(self, scenario_id):
        data = []
        for minute in range(1, 1441):
            h = (minute - 1) // 60
            m = (minute - 1) % 60
            is_sleep = (h >= 22 or h < 6)
            
            if is_sleep:
                nl = 0 if scenario_id == 5 else self.LOADS["night_lights"]
                current_load = self.LOADS["fridge"] + self.LOADS["medical"] + nl
            else:
                noise = random.uniform(0.98, 1.02)
                current_load = (self.LOADS["fridge"] + self.LOADS["medical"]) * noise
                
                if scenario_id == 5: 
                    pass
                else:
                    heat_mult = 2.0 if scenario_id == 10 else 1.0
                    if 7 <= h < 21: 
                        current_load += self.LOADS["heating"] * heat_mult
                    if 6 <= h < 9: 
                        current_load += self.LOADS["lights"] + self.LOADS["radio"]
                        if (h == 6 and 30 <= m < 35) or (h == 8 and 0 <= m < 5): 
                            current_load += self.LOADS["kettle"]
                    
                    if h == 12:
                        current_load += self.LOADS["lights"]
                        if 10 <= m < 20: current_load += self.LOADS["microwave"]
                        if scenario_id in [6, 7]: current_load += self.LOADS["kettle"]
                    
                    if 13 <= h < 22:
                        current_load += self.LOADS["tv"]
                        if h >= 17: current_load += self.LOADS["lights"]
                
                    if scenario_id == 2 and h == 10:
                        current_load += self.LOADS["washing_machine"]
                    
                    if scenario_id ==3  and h == 14 and m < 30:
                        current_load += self.LOADS["vacuum"]
                    
                    if scenario_id == 4 and h == 18 and 30 <= m < 60:
                        current_load += self.LOADS["oven"]

            data.append(round(current_load, 2))
        return data
def save_single_line_csv(name, consumption_values):
    output_dir = os.path.join("data", "scenarios")
    os.makedirs(output_dir, exist_ok=True)

    filename = f"{name.lower().replace(' ', '_')}.csv"
    filepath = os.path.join(output_dir, filename)


    headers = ["Scenario"] + [f"{i}" for i in range(1, 1442)]

    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerow([name] + consumption_values)

    return filepath
if __name__ == "__main__":
    manager = MasterDayManager()
    scenarios = {
        1: "Daily Routine",
        2: "Routine + Laundry",
        3: "Routine + Cleaning",
        4: "Routine + Cooking",
        5: "Outside Day",
    }

    
    
    for scenario_id, scenario_name in scenarios.items():
        data = manager.generate_day(scenario_id)
        filepath =save_single_line_csv (scenario_name, data)
        print(f"Scenario {scenario_id}: '{scenario_name}' généré -> {filepath}")