import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function Report() {
  const location = useLocation();
  const analysisId = location.state?.analysisId;

  const [data, setData] = useState(null);

  useEffect(() => {
    if (!analysisId) return;

    fetch(`http://localhost:8000/analysis/${analysisId}`)
      .then(res => res.json())
      .then(setData);
  }, [analysisId]);

  if (!data) return <p>Loading report...</p>;

  return (
    <div>
      <h1>Analysis Report</h1>
      <p>Home: {data.home_name}</p>
      <p>Total days: {data.total_days}</p>
      <p>Anomalies: {data.total_anomalies}</p>
    </div>
  );
}