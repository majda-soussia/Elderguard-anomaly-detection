const Interpretation = require("../models/Interpretation");

const create = async (req, res) => {
  try {
    if (req.user.role !== "doctor")
      return res.status(403).json({ detail: "Only doctors can add interpretations." });
    const { analysis_result_id, anomaly_index, diagnosis, solution } = req.body;
    const interp = await Interpretation.createInterpretation({
      doctor_id: req.user.id, analysis_result_id, anomaly_index, diagnosis, solution,
    });
    res.status(201).json(interp);
  } catch (e) { res.status(500).json({ detail: e.message }); }
};

const getByAnomaly = async (req, res) => {
  try {
    const { resultId, anomalyIndex } = req.params;
    const list = await Interpretation.getByAnomaly(resultId, anomalyIndex);
    res.json(list);
  } catch (e) { res.status(500).json({ detail: e.message }); }
};

const getByResult = async (req, res) => {
  try {
    const list = await Interpretation.getByResult(req.params.resultId);
    res.json(list);
  } catch (e) { res.status(500).json({ detail: e.message }); }
};

module.exports = { create, getByAnomaly, getByResult };