import {number, field, tableRows} from './facts.mjs';
const canonical = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');

// Each source weapon section owns a separate finite magazine. We use the
// initially loaded feed only when reload/total storage is not documented.
// That is a useful bound, not an unlimited vehicle or a completed ammo model.
export function bindMountedFeeds(item, facts, scenario) {
  if (item.category !== 'vehicle' || facts.supply_only) return facts;
  const rows = tableRows(item,'weapon_stats');
  const callTimes = item.tables.filter(t=>t.kind === 'wikitable').flatMap(t=>t.rows.filter(r=>r.key==='call_in_time').map(r=>number(r.raw)));
  const call = [...new Set(callTimes.filter(Number.isFinite))];
  if (call.length !== 1) {facts.mounted_omissions=[{reason:'VEHICLE_CALL_TIME_REQUIRED'}];return facts;}
  const availableAt = Math.ceil(call[0]*1000);
  const sections = [...new Set(rows.map(r=>r.section).filter(Boolean))];
  const modes = [], accounts = [], omitted = [];
  for (const section of sections) {
    const own = rows.filter(r=>r.section === section);
    const read = key => own.find(r=>r.key === key || r.key.endsWith('_'+key))?.raw;
    const capacity = number(read('capacity')), rpm = number(read('fire_rate'));
    const attacks = facts.modes.filter(m=>m.kind === 'projectile' && own.some(r=>r.raw === 'Projectile' && canonical(r.label) === canonical(m.mode_id)));
    if (facts.id === 'vehicle_exo_51_lumberjack_exosuit' && canonical(section) === 'lumbererflamethrower') {
      const spray = facts.modes.find(m=>m.kind === 'spray' && m.mode_id === 'LUMBERER_FLAMETHROWER_S');
      const handling = Object.fromEntries(['ergonomics','recoil_horizontal','recoil_vertical'].map(k=>[k,number(read(k))]));
      if (spray && capacity === 500 && Object.values(handling).every(Number.isFinite)
          && spray.direct_status_effects?.some(e=>e.id === 'Fire') && scenario.spray_ignition) {
        const id = `${facts.id}#${canonical(section)}`, work = Math.ceil(62350/capacity);
        accounts.push({id,equipment_id:facts.id,loaded:capacity,capacity,reserve:0,reserve_capacity:0,
          reload_ms:0,feed:'belt',refill:{public:0,portable:0},renewable:false,available_at_ms:availableAt});
        modes.push({...spray,kind:'projectile',feed_bound:true,source_mode_id:spray.mode_id,
          mode_id:`${spray.mode_id}@${canonical(section)}`,resource_id:id,capacity,total:capacity,
          rpm:60000/work,continuous:true,work_ms:work,normal:0,durable:0,handling,reload_ms:0,disposable:true,
          warmup_ms:scenario.mounted.entry_ms,mounted:true,available_at_ms:availableAt,
          ignition_policy:{...scenario.spray_ignition,targets:['scavenger','hunter'],
            basis:'USER_SPRAY_SMALL_LIGHT_BUG_CONTACT_100_TO_200_MS; MIDPOINT'},
          fire_channel:'spray',direct_damage_unresolved:true,status_only_lower_bound:true,
          service_conversion:'STATUS_ONLY_LOWER_BOUND; UNKNOWN_DIRECT_DPS; NO_RESUPPLY_OR_NEW_VEHICLE',
          feed_source:{section,source_ref:facts.source_ref},
          evidence_url:'https://helldivers.wiki.gg/wiki/Lumberer'});
      } else omitted.push({section,reason:'SPRAY_STATUS_OR_INVENTORY_REQUIRED'});
      continue;
    }
    if (!attacks.length || !(Number.isSafeInteger(capacity) && capacity > 0 && rpm > 0)) {
      if (own.some(r=>['Projectile','Spray','Beam','Arc','Explosion'].includes(r.raw))) omitted.push({section,reason:'COMPONENT_OR_RATE_BINDING_REQUIRED'});
      continue;
    }
    const handling = Object.fromEntries(['ergonomics','recoil_horizontal','recoil_vertical'].map(k=>[k,number(read(k))]));
    if (!Object.values(handling).every(Number.isFinite)) {omitted.push({section,reason:'MOUNTED_HANDLING_REQUIRED'});continue;}
    const id = `${facts.id}#${canonical(section)}`;
    const spareRounds = number(read('spare_rounds')) ?? (number(read('spare_magazines')) ?? 0) * capacity;
    if (spareRounds > 0) omitted.push({section,reason:'RESERVE_RELOAD_TIMELINE_REQUIRED',documented_reserve:spareRounds});
    accounts.push({id,equipment_id:facts.id,loaded:capacity,capacity,reserve:0,reserve_capacity:0,
      reload_ms:0,feed:'belt',refill:{public:0,portable:0},renewable:false,available_at_ms:availableAt});
    for (const attack of attacks) modes.push({...attack,
      source_mode_id:attack.mode_id,mode_id:`${attack.mode_id}@${canonical(section)}`,resource_id:id,
      feed_bound:true,capacity,total:capacity,rpm,handling,reload_ms:0,disposable:true,
      // Mounting is an exposed engineering input, not source animation data.
      warmup_ms: Math.ceil((number(read('wind_up_time')) ?? 0)*1000) + scenario.mounted.entry_ms,
      mounted:true,available_at_ms:availableAt,service_conversion:'INDEPENDENT_MOUNTED_FIRST_FEED; NO_RESUPPLY_OR_NEW_VEHICLE',
      feed_source:{section,source_ref:facts.source_ref},
      whole_vehicle_stock_known:spareRounds === 0});
  }
  facts.mounted_accounts = accounts;
  facts.mounted_omissions = omitted;
  if (modes.length) facts.service_modes = modes;
  return facts;
}
