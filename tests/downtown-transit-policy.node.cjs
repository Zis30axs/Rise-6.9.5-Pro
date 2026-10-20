/* Run after tsc compilation; no Vitest or network dependency. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const compiled = process.env.UC_DOWNTOWN_BUILD;
if (!compiled) throw new Error('Set UC_DOWNTOWN_BUILD to the temporary tsc outDir');
const {
  quoteCityJourney, cityStopForLocation, isDowntownLocalWalk,
} = require(path.join(compiled, 'downtown-transit-policy.js'));

test('legacy routes keep fares and durations for BOTH vehicle choices', () => {
  for (const [stop, minutes, fare] of [['home',45,6],['commercial',25,3],['city-park',35,4]]) {
    for (const vehicle of ['btr82a','zbd04a']) {
      const outward = quoteCityJourney('campus', stop, vehicle);
      const back = quoteCityJourney(stop, 'campus', vehicle);
      assert.equal(outward.minutes, minutes); assert.equal(outward.fare, fare);
      assert.equal(back.minutes, minutes); assert.equal(back.fare, fare);
      assert.equal(outward.legs.length, 1);
      assert.equal(outward.legs[0].vehicleId, vehicle);
    }
  }
});
test('downtown is a higher-priced ZBD-only service in both directions', () => {
  for (const [from,to] of [['campus','downtown'],['downtown','campus']]) {
    const quote = quoteCityJourney(from,to);
    assert.equal(quote.fare,12); assert.equal(quote.minutes,60);
    assert.equal(quote.legs[0].vehicleId,'zbd04a');
    assert.throws(() => quoteCityJourney(from,to,'btr82a'),/ZBD-04A/);
  }
});
test('all outer transfers go through campus, not a fabricated direct line', () => {
  const ids=['home','commercial','city-park','downtown'];
  for (const a of ids) for (const b of ids) if(a!==b) {
    const quote=quoteCityJourney(a,b);
    assert.equal(quote.legs.length,2);
    assert.equal(quote.legs[0].toStopId,'campus');
    assert.equal(quote.legs[1].fromStopId,'campus');
    assert.equal(quote.fare, quoteCityJourney(a,'campus').fare+quoteCityJourney('campus',b).fare);
    assert.equal(quote.minutes,quoteCityJourney(a,'campus').minutes+quoteCityJourney('campus',b).minutes);
  }
});
test('downtown-to-home auto selects per leg and does not overcharge the old leg', () => {
  const quote=quoteCityJourney('downtown','home');
  assert.equal(quote.fare,18); assert.equal(quote.minutes,105);
  assert.deepEqual(quote.legs.map(x=>x.vehicleId),['zbd04a','btr82a']);
});
test('explicit vehicle is preserved on every allowed leg', () => {
  assert.deepEqual(quoteCityJourney('home','downtown','zbd04a').legs.map(x=>x.vehicleId),['zbd04a','zbd04a']);
  assert.throws(()=>quoteCityJourney('home','downtown','btr82a'),/ZBD-04A/);
});
test('same stop never creates a charge or time advance', () => {
  for (const id of ['campus','home','commercial','city-park','downtown']) {
    assert.deepEqual(quoteCityJourney(id,id),{legs:[],minutes:0,fare:0});
  }
});
test('prototype names and malformed stop IDs are rejected', () => {
  for(const id of ['__proto__','constructor','toString','unknown','',null,0,{}]) {
    assert.throws(()=>quoteCityJourney(id,'campus'));
    assert.throws(()=>quoteCityJourney('campus',id));
  }
});
test('invalid vehicle is rejected even for a no-op journey', () => {
  for(const vehicle of ['t84','__proto__','',null,0,{}]) {
    assert.throws(()=>quoteCityJourney('campus','campus',vehicle));
    assert.throws(()=>quoteCityJourney('campus','home',vehicle));
  }
});
test('manor aliases its district stop, not the ordinary home district', () => {
  assert.equal(cityStopForLocation('toyokawa-home'),'downtown');
  assert.equal(cityStopForLocation('home'),'home');
  assert.equal(cityStopForLocation('bus-stop'),'campus');
  for(const id of ['gate','__proto__','constructor','']) assert.equal(cityStopForLocation(id),null);
});
test('manor and downtown are a local walk in BOTH directions only', () => {
  assert.equal(isDowntownLocalWalk('downtown','toyokawa-home'),true);
  assert.equal(isDowntownLocalWalk('toyokawa-home','downtown'),true);
  for(const [a,b] of [['home','toyokawa-home'],['campus','downtown'],['downtown','downtown']]) {
    assert.equal(isDowntownLocalWalk(a,b),false);
  }
});
test('repeated quotes are deterministic and immutable', () => {
  const first=quoteCityJourney('home','downtown');
  const snapshot=JSON.stringify(first);
  Reflect.set(first,'fare',0); Reflect.set(first.legs[0],'fare',0);
  assert.throws(()=>first.legs.push({}));
  assert.equal(JSON.stringify(first),snapshot);
  for(let i=0;i<10;i++) assert.deepEqual(quoteCityJourney('home','downtown'),first);
});
test('fare is strictly more than all three legacy destination fares', () => {
  const downtown=quoteCityJourney('campus','downtown');
  for(const stop of ['home','commercial','city-park'])
    assert.ok(downtown.fare>quoteCityJourney('campus',stop).fare);
});
