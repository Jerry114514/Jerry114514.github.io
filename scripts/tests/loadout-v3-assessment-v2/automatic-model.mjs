// Formula tests use computed values; saved player calibrations are tested separately.
// Only the caller's in-memory JSON is changed, never the calibration file.
export function restoreCalculatedScores(model) {
  for (const row of model.equipment) {
    delete row.manual_calibration;
    for (const value of [...Object.values(row.dimensions),row.heavy_assessment,row.endurance,row.demolition_assessment]) {
      if (!value) continue;
      if ('calculated_score' in value) value.score=value.calculated_score;
      if (value.calculated_state) value.state=value.calculated_state;
      delete value.score_origin;
      delete value.calculated_score;
      delete value.calculated_state;
    }
  }
  return model;
}
