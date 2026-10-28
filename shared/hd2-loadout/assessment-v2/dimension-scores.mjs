import {capacityCurve} from './formulas.mjs';

const round=n=>Math.round(n*100)/100;
const unknown=reason=>({score:null,reason});
export function heavyCapacityScore({completed,required=2,elapsed_ms,window_ms=20000}) {
  if(!Number.isInteger(completed)||completed<0||!(required>0)||!(window_ms>0))return unknown('HEAVY_RESULT_REQUIRED');
  if(completed===0)return {score:0,ratio:0};
  if(!(elapsed_ms>0))return unknown('HEAVY_TIME_REQUIRED');
  // One quick kill cannot compensate for being unable to afford the second.
  const ratio=completed>=required?window_ms/elapsed_ms:(completed/required)*Math.min(1,window_ms/elapsed_ms);
  return {score:round(capacityCurve(ratio)),ratio};
}

export function demolitionCapacityScore(completed,required=5) {
  return Number.isInteger(completed)&&completed>=0&&required>0
    ?{score:round(capacityCurve(completed/required)),ratio:completed/required}:unknown('HOLE_COUNT_REQUIRED');
}
