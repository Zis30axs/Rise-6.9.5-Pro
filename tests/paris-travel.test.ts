import { describe, expect, it } from 'vitest';
import { internationalConnections } from '../src/runtime/california';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { createInitialState, getNovelTravelQuote, novelDestinations, parseState, reduceState } from '../src/runtime/model';
import { parisPlaces, parisLocalClock, parisTravelLegs } from '../src/runtime/paris';
import { validateStoryActions } from '../src/runtime/story-actions';
import { gameDayFromISO } from '../src/runtime/game-calendar';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { districtMapPlaces } from '../src/frontend/map-districts';

describe('Paris passenger journey', () => {
  it('boards at Haneda, transfers by CDGVAL and RER, visits all landmarks and returns on the same ticket rules', () => {
    let state = createInitialState();
    state.player.balance=350_000;
    const go=(id:string) => {
      const before = state;
      const q=getNovelTravelQuote(before,id);
      expect(q.blockedReason).toBeNull();
      expect(validateStoryActions([{type:'travel',locationId:id}],before)).toHaveLength(1);
      state=reduceState(before,{type:'novel_travel',locationId:id});
      expect(state.locationId).toBe(id);
      expect(state.player.balance).toBe(before.player.balance-q.fare);
      const minutes=(c:typeof state.clock)=>c.day*1440+c.hour*60+c.minute;
      expect(minutes(state.clock)-minutes(before.clock)).toBe(q.minutes);
      expect(parseState(state).locationId).toBe(id);
    };
    go('bus-stop'); go('haneda-airport');
    expect(getAdjacentLocations(state)).toEqual(expect.arrayContaining([expect.objectContaining({id:'cdg-airport',kind:'flight'}),expect.objectContaining({id:'sfo-airport',kind:'flight'})]));
    go('cdg-airport');go('paris-roissypole');go('paris-notre-dame');go('paris-louvre');go('paris-alexandre');go('paris-invalides');go('paris-eiffel');go('paris-arc');go('paris-alexandre');go('paris-louvre');go('paris-notre-dame');go('paris-roissypole');go('cdg-airport');go('haneda-airport');go('bus-stop');
  });
  it('charges the travelling protagonist and persists their arrival across save reloads', () => {
    const base = createInitialState();
    base.locationId = 'haneda-airport';
    base.player.balance = 350_000;
    const before = enableProtagonists(base);
    const fare = getNovelTravelQuote(before, 'cdg-airport').fare;
    const arrived = parseState(reduceState(before, {type: 'novel_travel', locationId: 'cdg-airport'}));
    expect(arrived.locationId).toBe('cdg-airport');
    // Other protagonists can pay their own everyday expenses during the long flight.
    const charges = arrived.protagonists!.accounts.ledger.filter(row => row.note === '世界行动：novel_travel');
    expect(charges.length).toBeGreaterThan(0);
    expect([...new Set(charges.map(row => row.actor))]).toEqual(['soyo']);
    expect(charges.reduce((sum, row) => sum + row.deltaCents, 0)).toBe(-fare * 100);
  });
  it('rejects skipped legs, campus shortcuts and insufficient funds without altering the save', () => {
    const state=createInitialState();state.locationId='cdg-airport';state.player.balance=0;
    const before=JSON.stringify(state);
    for(const id of ['paris-louvre','sfo-airport','bus-stop','gate','haneda-airport']){
      expect(getNovelTravelQuote(state,id).blockedReason).toBeTruthy();
      expect(()=>reduceState(state,{type:'novel_travel',locationId:id})).toThrow();
      expect(()=>reduceState(state,{type:'travel',locationId:id})).toThrow();
    }
    expect(JSON.stringify(state)).toBe(before);
    expect(getNovelTravelQuote(state,'paris-roissypole').fare).toBe(0);
    expect(getNovelTravelQuote(state,'paris-roissypole').blockedReason).toBeNull();
  });
  it('keeps Paris out of the Tokyo map and exposes exactly the routes that can be taken in each direction',()=>{
    expect(parisPlaces).toHaveLength(8);
    for(const p of parisPlaces){
      expect(novelDestinations.some(d=>d.id===p.id)).toBe(true);
      expect(districtMapPlaces('campus').some(d=>d.id===p.id)).toBe(false);
      const available=internationalConnections(p.id);
      expect(available.map(l=>l.to).sort()).toEqual(getAdjacentLocations({locationId:p.id,interior:null}).map(l=>l.id).sort());
      for(const l of available)expect(internationalConnections(l.to)).toContainEqual({...l,from:l.to,to:p.id});
    }
    expect(parisTravelLegs.filter(l=>l.from==='haneda-airport')).toHaveLength(1);
  });
  it('derives the Paris civil day and both daylight-saving transitions from Tokyo time',()=>{
    const clock={day:gameDayFromISO('2026-03-29'),hour:9,minute:59};
    expect(parisLocalClock(clock)).toEqual({day:clock.day,hour:1,minute:59});
    expect(parisLocalClock({...clock,hour:10,minute:0}).hour).toBe(3);
    const autumn={day:gameDayFromISO('2026-10-25'),hour:10,minute:0};
    expect(parisLocalClock(autumn).hour).toBe(2);
    expect(parisLocalClock({...autumn,hour:0})).toEqual({day:autumn.day-1,hour:17,minute:0});
  });
});
