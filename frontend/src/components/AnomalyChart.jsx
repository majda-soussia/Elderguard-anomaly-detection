import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, Legend,
} from "recharts";

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  if (!payload) return null;
  const color = payload.is_anomaly ? "#ef4444" : "#6366f1";
  const r = payload.is_anomaly ? 6 : 4;
  return (
    <circle cx={cx} cy={cy} r={r} fill={color}
      stroke={payload.is_anomaly ? "#fca5a5" : "#a5b4fc"}
      strokeWidth={payload.is_anomaly ? 2 : 1} opacity={0.9}
    />
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${d?.is_anomaly ? "#fecaca" : "#c7d7fd"}`,
      borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1e1f2e",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: d?.is_anomaly ? "#ef4444" : "#6366f1" }}>
        {d?.is_anomaly ? "⚠ Anomaly" : "✓ Normal"}
      </div>
      <div>Value: <strong>{typeof d?.value === "number" ? d.value.toFixed(3) : d?.value}</strong></div>
      {d?.score !== undefined && <div>Score: <strong>{d.score.toFixed(3)}</strong></div>}
      {d?.timestamp && <div style={{ color: "#9196a8", marginTop: 4 }}>{d.timestamp}</div>}
    </div>
  );
};

export default function AnomalyChart({ data = [] }) {
  if (!data.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#b0b5c4", fontSize: 14 }}>
        No data to display yet. Run a detection to see results.
      </div>
    );
  }

  const chartData = data.map((d, i) => ({ ...d, index: i }));
  const normal    = chartData.filter((d) => !d.is_anomaly);
  const anomalies = chartData.filter((d) => d.is_anomaly);

  const tickStyle = { fill: "#9196a8", fontSize: 11 };
  const gridStyle = "rgba(0,0,0,0.06)";

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 13, color: "#9196a8", margin: "0 0 12px" }}>
          Signal over time — anomalies highlighted
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStyle} />
            <XAxis dataKey="index" tick={tickStyle} axisLine={{ stroke: "#e8eaf0" }} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2}
              dot={<CustomDot />} activeDot={{ r: 7, fill: "#4f51d0" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p style={{ fontSize: 13, color: "#9196a8", margin: "0 0 12px" }}>
          Value vs anomaly score
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStyle} />
            <XAxis dataKey="value" name="Value" tick={tickStyle} axisLine={{ stroke: "#e8eaf0" }} tickLine={false} />
            <YAxis dataKey="score" name="Score" tick={tickStyle} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "4 4", stroke: "#e2e5ef" }} />
            <Legend formatter={(v) => <span style={{ color: "#9196a8", fontSize: 12 }}>{v}</span>} />
            <Scatter name="Normal"  data={normal}    fill="#6366f1" opacity={0.7} />
            <Scatter name="Anomaly" data={anomalies} fill="#ef4444" opacity={0.9} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}