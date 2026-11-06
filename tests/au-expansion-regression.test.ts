import {describe, expect, it} from 'vitest';
import { AU_CHAPTERS } from '@/scenarios/auLibrary';
import { auditAULibrary } from '@/scenarios/catalogQA';
import { buildScenario,buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { resolveQuickBattle } from '@/simulation/quickBattle';
import { ShipKillScoreboard } from '@/simulation/killScoreboard';
import { v3 } from '@/core/vec3';
import type { BattleEvent } from '@/simulation/types';
import { advanceMotion } from '@/simulation/motion';

describe('shared AU battle expansion',()=>{
  it('registers playable scenario chapter data with matching hulls, guns and factions',()=>{
    const report=auditAULibrary();
    expect(report.issues).toEqual([]);
    expect(report.chapters).toBeGreaterThanOrEqual(43);
    expect(report.strategicMathRecommended).toBeGreaterThan(0);
    const ids=new Set(AU_CHAPTERS.map(c=>c.id));
    for(const chapter of AU_CHAPTERS){
      const config=buildScenario(chapter.id,chapter.rules,101);
      expect(ids.has(config.scenarioId)).toBe(true);
      expect(config.alternateHistory).toBe(true);
      expect(config.fleets.length).toBeGreaterThanOrEqual(2);
      expect(config.fleets.every(f=>f.ships.every(s=>s.count>=1))).toBe(true);
    }
  });
  it('preserves the 300-hull fortified colony, including 60 command/dreadnought hulls',()=>{
    const scenario=buildScenario('apex_colony_300_hulls','prime_apex',7);
    const ships=scenario.fleets.find(f=>f.side==='A')!.ships;
    expect(ships.reduce((sum,c)=>sum+c.count,0)).toBe(300);
    expect(ships.filter(s=>['alliance_dreadnought','alliance_aegis_command'].includes(s.classId))
      .reduce((sum,c)=>sum+c.count,0)).toBe(60);
  });
  it('keeps the two Bahak survivor force estimates in separate entries',()=>{
    const estimateA=buildScenario('apex_52500_final_offensive','prime_apex',7);
    const estimateB=buildScenario('apex_bahak_30000_survivors_variant','prime_apex',7);
    const countReapers=(c:typeof estimateA)=>c.fleets.filter(f=>f.faction==='reaper')
      .flatMap(f=>f.ships).reduce((sum,s)=>sum+s.count,0);
    expect(countReapers(estimateA)).toBe(52500);
    expect(countReapers(estimateB)).toBe(30000);
    expect(estimateA.alternateHistory&&estimateB.alternateHistory).toBe(true);
  });
  it('calculates 30,000 Reapers as an analytical estimate with no BattleSimulation',()=>{
    const report=resolveQuickBattle(buildScenario('apex_bahak_30000_survivors_variant','prime_apex',7));
    expect(report.approximate).toBe(true);
    expect(report.shipsAnalysed).toBe(44270);
  });
  it('allows many serial Aegis command dreadnoughts and one named Valkyrie',()=>{
    const config=buildCustomBattle({
      seed:55,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:75,
      sideA:{faction:'alliance',name:'Command squadrons',formation:'capital_column',
        counts:{alliance_aegis_command:18,alliance_valkyrie:1}},
      sideB:{faction:'reaper',name:'Training enemy',formation:'capital_column',
        counts:{reaper_destroyer:2}}
    });
    const sim=new BattleSimulation(config);
    expect(sim.ships.filter(s=>s.classId==='alliance_aegis_command')).toHaveLength(18);
    expect(sim.ships.filter(s=>s.classId==='alliance_valkyrie')).toHaveLength(1);
    expect(new Set(sim.ships.map(s=>s.id)).size).toBe(sim.ships.length);
  });
  it('calculates the 52,500-Reaper strategic battle without creating ships or ticks',()=>{
    const chapter=AU_CHAPTERS.find(c=>c.id==='apex_52500_final_offensive')!;
    const config=buildScenario(chapter.id,chapter.rules,42);
    const start=performance.now();
    const report=resolveQuickBattle(config);
    expect(performance.now()-start).toBeLessThan(1500);
    expect(report.shipsAnalysed).toBe(75100);
    expect(report.approximate).toBe(true);
    expect(report.battle.sides.A.destroyed+report.battle.sides.A.survivors).toBe(report.battle.sides.A.deployed);
    expect(report.battle.sides.B.destroyed+report.battle.sides.B.survivors).toBe(report.battle.sides.B.deployed);
  });
});
describe('live ship-type kill ledger',()=>{
  it('counts destruction once by class and side, resets per deployment',()=>{
    const a=(id:string,side:'A'|'B',classId:string):BattleEvent=>
      ({t:4,type:'ship_destroyed',shipId:id,classId,faction:side==='A'?'alliance':'reaper',
        side,name:id,pos:v3(),role:side==='A'?'cruiser':'reaper_capital'});
    const ledger=new ShipKillScoreboard();
    const events:BattleEvent[]=[{t:0,type:'battle_start',name:'test'},
      a('a1','A','alliance_cruiser'),a('b1','B','reaper_capital'),a('a2','A','alliance_cruiser')];
    expect(ledger.sync(events)).toBe(true);
    expect(ledger.sync(events)).toBe(false);
    expect(ledger.total('A')).toBe(2);
    expect(ledger.total('B')).toBe(1);
    expect(ledger.rows('A')[0].destroyed).toBe(2);
    events.push(a('a2','A','alliance_cruiser'));
    expect(ledger.sync(events)).toBe(false);
    ledger.reset();
    expect(ledger.totalDestroyed).toBe(0);
    expect(ledger.sync([a('next','B','reaper_capital')])).toBe(true);
    expect(ledger.total('B')).toBe(1);
  });
});
describe('engine-active vs inertial drift',()=>{
  it('coasts on dead propulsion with no active engine output',()=>{
    const sim=new BattleSimulation(buildCustomBattle({
      seed:9,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:40,
      sideA:{faction:'alliance',name:'Drift',formation:'line_abreast',counts:{alliance_dreadnought:1}},
      sideB:{faction:'reaper',name:'Contact',formation:'capital_column',counts:{reaper_destroyer:1}}
    }));
    const ship=sim.ships[0];
    ship.vel=v3(.2,0,0);ship.subsystems.engines=0;
    const speed=Math.hypot(ship.vel.x,ship.vel.y,ship.vel.z);
    advanceMotion(ship,{position:v3(10,0,0),speedFraction:1},.05);
    expect(ship.engineThrust).toBe(0);
    expect(ship.inertialCoast).toBe(true);
    expect(Math.hypot(ship.vel.x,ship.vel.y,ship.vel.z)).toBeCloseTo(speed,7);
  });
});
