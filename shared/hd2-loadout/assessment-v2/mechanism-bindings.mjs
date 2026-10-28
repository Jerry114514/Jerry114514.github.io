// Source-backed components plus explicitly labelled scenario simplifications.
// No retired scores are inputs. Keep unverified geometry visible to reviewers.
export function bindReviewedMechanisms(facts,scenario) {
  const id=facts.id;
  for(const mode of facts.modes){
    if(mode.fragments)mode.fragment_policy={...mode.fragment_policy,main_contacts_per_shot:2,max_per_target:2,
      basis:'DECLARED_TWO_FRAGMENT_CONTACTS; ENGINEERING_SAMPLE; 0/1/2/3_SENSITIVITY_REQUIRED'};
    if(mode.child_payload&&['heavy_support_rl_77_airburst_rocket_launcher','orbital_airburst_strike'].includes(id)){
      mode.child_pattern={radius_m:id==='orbital_airburst_strike'?14:12,
        basis:'DECLARED_UNIFORM_DISK_CENTERS; ENGINEERING_SCATTER_SAMPLE_NOT_MEASURED_HIT_RATE',
        alternatives_m:id==='orbital_airburst_strike'?[10,14,20]:[8,12,18]};
      mode.detached_delay_ms=id==='orbital_airburst_strike'?950:950;
      mode.target_policy='MAIN_ONLY';
    }
    if(mode.kind==='arc'){
      const chains=id==='support_arc_3_arc_thrower'?[1,.75,.5,.25]
        :id==='arc_12_blitzer'?[1,.5]:[1];
      mode.arc_policy={chains,bolts:mode.pellets??1,distinct_target_per_chain:true,
        basis:chains.length>1?(id==='support_arc_3_arc_thrower'?'SOURCED_ARC3_FULL_MODULE; ACCESSIBLE_CHAIN_GEOMETRY':'BLITZER_SINGLE_CHAIN; 0.5_CHAIN_DAMAGE_ENGINEERING_CANDIDATE')
          :'PRIMARY_ARCS_ONLY; UNVERIFIED_BRANCH_FALLOFF_NOT_ASSUMED'};
    }
    if((mode.pellets>1&&mode.direct_status_effects?.some(e=>e.id==='Fire'))||id==='las_13_trident')
      mode.spread_targets=3; // Declared dense short-range cone, not every pellet on every enemy.
  }
  if(id==='p_34_breacher'){
    const blast={id:'P-34_BREACHER_E',normal:2000,durable:2000,pen:7,outer_normal:1999,outer_durable:1999,outer_pen:6,
      inner_radius_m:1.5,outer_radius_m:2.5};
    facts.areas=[blast];facts.fuse_ms=4000;facts.fuse_kind='USER_FOUR_SECOND_THERMITE_SIMPLIFICATION';
    facts.demolition_components=[{component_id:blast.id,attack_type:'explosion',force:30,backblast:false}];
    facts.handling={ergonomics:45,recoil_horizontal:150,recoil_vertical:475};
    facts.modes=[{mode_id:'P-34_P',kind:'projectile',feed_bound:true,normal:60,durable:0,pen:4,pellets:1,
      explosion:blast,area_component_id:blast.id,rpm:20,capacity:1,total:3,reload_ms:2680,
      detached_delay_ms:4000,attached_thermite:{normal:150,durable:150,pen:7,duration_s:4},
      handling:facts.handling,traits:'USER_STICKY_DELAYED_BLAST',direct_status_effects:[],status_applications:[],
      delayed_heavy:true,source_url:'https://helldivers.wiki.gg/wiki/P-34_Breacher',
      damage_timing:'DIRECT_AND_THERMITE_ACCOUNTED_AT_FINAL_4S_EXPLOSION_CONSERVATIVE; NO_ADDITIONAL_FIRE_STACK'}];
  }
  if(id==='backpack_b_md_c4_pack'){
    facts.holding={support:true,requires_backpack:true,basis:'USER_BACKPACK_SUPPORT_WEAPON'};
    const blast=facts.areas[0];
    facts.fuse_ms=0;facts.fuse_kind='USER_IMPACT_SIMPLIFICATION';
    facts.modes=[{mode_id:'user:C4_impact',kind:'projectile',feed_bound:true,normal:0,durable:0,pen:0,pellets:1,
      explosion:blast,area_component_id:blast.id,rpm:60000/scenario.throw_ms,capacity:facts.inventory.capacity,
      total:facts.inventory.total,reload_ms:facts.reload_ms,charge_ms:scenario.throw_ms,detached_delay_ms:0,
      handling:{ergonomics:65,recoil_horizontal:0,recoil_vertical:0},traits:'USER_IMPACT_C4',
      direct_status_effects:[],status_applications:[],delayed_heavy:true}];
    facts.service_modes=facts.modes;facts.executable_backpack=true;
  }
  return facts;
}
