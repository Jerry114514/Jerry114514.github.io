import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEW_SCALE,rescaleScore,originalScore} from '../../../shared/hd2-loadout/assessment-v2/score-scale.mjs';
import {summarizeLoadout} from '../../../shared/hd2-loadout/assessment-v2/aggregate.mjs';

test('new scale preserves zero and the top, moves old 65 to 60, and is reversible',()=>{
  for(const [old,current] of [[0,0],[60,60*60/65],[65,60],[100,100],[105,105]]){
    assert.equal(rescaleScore(old,REVIEW_SCALE),current);
    assert.ok(Math.abs(originalScore(current,REVIEW_SCALE)-old)<1e-10);
  }
  let previous=-1;
  for(let x=0;x<=105;x+=.25){const y=rescaleScore(x,REVIEW_SCALE);assert.ok(y>previous);previous=y;}
  assert.equal(rescaleScore(null,REVIEW_SCALE),null);
  assert.equal(rescaleScore(65),65);
});

test('old base plus old bonus must total 65 to pass the new 60 floor; manual points are final',()=>{
  const run=(base,bonus,manual=false)=>summarizeLoadout({score_scale:REVIEW_SCALE,
    thresholds:{chaff:60,close_defense:null,anti_medium:null},coverage_complete:{chaff:true},
    ordinary:[{equipment_id:'gun',role:'chaff',score:base,state:'ENGINEERING_ESTIMATE'}],
    strategic:[{equipment_id:'support',role:'chaff',contribution:{status:'KNOWN',value:bonus,
      score_origin:manual?'MANUAL_CALIBRATED':undefined}}]}).dimensions.chaff;
  for(const [base,bonus] of [[65,0],[60,5],[55,10],[1,64],[0,65],[.01,64.99],[.04,64.96]]){
    const r=run(base,bonus);assert.equal(r.status,'PASS');assert.ok(Math.abs(r.score-60)<1e-10);
  }
  assert.equal(run(60,4.99).status,'FAIL');
  assert.equal(run(0,60,true).score,60);assert.equal(run(0,60,true).status,'PASS');
});
