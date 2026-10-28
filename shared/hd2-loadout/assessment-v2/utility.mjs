// Utility is not missing projectile damage. Offensive zero and an unmodelled
// defensive benefit remain separate so shields cannot pass as crowd clearing.
const allZero = new Set(['p_11_stim_pistol','g_3_smoke','g_89_smokescreen']);
const defensive = new Set(['backpack_lift_850_jump_pack','backpack_lift_860_hover_pack',
  'backpack_sh_20_ballistic_shield_backpack','backpack_sh_32_shield_generator_pack',
  'backpack_sh_51_directional_shield','deployable_shield_generator_relay','g_sh_39_shield']);
const controlOnly = new Set(['g_23_stun','g_109_urchin','deployable_ems_mortar_sentry','orbital_ems_strike']);

export function bindUtility(row) {
  const id = row.equipment_id;
  const type = allZero.has(id) ? /smoke/.test(id) ? 'USER_SMOKE_ZERO' : 'ALLY_HEALING_ONLY'
    : defensive.has(id) ? 'DEFENSIVE_UTILITY' : controlOnly.has(id) ? 'CONTROL_ONLY' : null;
  if (!type) return;
  row.utility = {kind:type, combat_damage:false,
    defensive_effect: allZero.has(id) ? 'OUTSIDE_SELF_COMBAT_SCORE' : 'NOT_YET_QUANTIFIED',
    source_ref: row.facts.source_ref};
  row.capabilities.explicit_zero_roles = allZero.has(id) ? ['chaff','close_defense','anti_medium'] : ['chaff','anti_medium'];
}
