import {describe, it, expect} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import {networkAccounts, networkOwnerId, parseInternetState, guestAccount, registerNetworkGuests, allNetworkAccounts, resolveNetworkAccount} from '../src/runtime/network-identities';
import {createInitialState, reduceState, parseState} from '../src/runtime/model';
import {enableProtagonists} from '../src/runtime/protagonist-world';
import {createWorldPhoneApi} from '../src/frontend/world-phone';

describe('permanent network identities', () => {
  it('covers every worldbook personId exactly once, with unique permanent handles and mail', () => {
    for (const file of readdirSync('src/worldbook').filter(f => f.endsWith('.json'))) {
      const book = JSON.parse(readFileSync('src/worldbook/' + file, 'utf8'));
      for (const e of book.entries ?? []) if (e.extensions?.personId)
        expect(networkAccounts.filter(a => a.personId === e.extensions.personId)).toHaveLength(1);
    }
    for (const field of ['id', 'username', 'email'] as const) expect(new Set(networkAccounts.map(a => a[field])).size).toBe(networkAccounts.length);
    expect(networkAccounts.every(a => a.email.endsWith('@post.sov'))).toBe(true);
  });
  it('preserves guest randomness while storing each new name once and protecting fixed NPCs', () => {
    const first = registerNetworkGuests(undefined, ['路过的纸飞机', '路过的纸飞机', '若叶睦', '睦', '素世', '@MUTSUMI']);
    expect(first.guests).toEqual([{nickname: '路过的纸飞机'}]);
    expect(resolveNetworkAccount('睦')?.id).toBe('person:bang-mutsumi');
    expect(resolveNetworkAccount('谈心')).toBeNull();
    const next = registerNetworkGuests(JSON.parse(JSON.stringify(first)), ['路过的纸飞机', '今晚吃拉面']);
    expect(next.guests).toHaveLength(2);
    expect(allNetworkAccounts(next).find(a => a.nickname === '路过的纸飞机')).toEqual(guestAccount('路过的纸飞机'));
    expect(() => guestAccount('<img onerror=evil>')).toThrow();
  });
  it('saves follows through existing phone actions, survives viewpoint changes and old saves', () => {
    let state = enableProtagonists(createInitialState());
    const follow = {type: 'phone_app' as const, requestId: 'network-f1', owner: 'soyo' as const,
      command: {type: 'network_follow' as const, accountId: 'band:crychic', following: true}};
    state = reduceState(state, follow);
    state = reduceState(state, follow);
    expect(state.protagonists!.internet!.follows).toEqual([['person:soyo', 'band:crychic']]);
    state = reduceState(state, {type: 'switch_protagonist', target: 'sakiko'});
    expect(() => reduceState(state, {...follow, requestId: 'network-other'})).toThrow();
    state = parseState(JSON.parse(JSON.stringify(state)));
    expect(state.protagonists!.internet!.follows).toEqual([['person:soyo', 'band:crychic']]);
    delete state.protagonists!.internet;
    expect(() => parseState(JSON.parse(JSON.stringify(state)))).not.toThrow();
    expect(() => parseInternetState({follows: [['band:crychic','person:soyo']]})).toThrow();
  });
  it('exposes only public facts and fixed identities to the network capability', () => {
    let state = enableProtagonists(createInitialState());
    state.story[0] = {...state.story[0]!, text:'绝密家庭谈话'};
    const api = createWorldPhoneApi({session:'["card","chat"]', current:()=>true, busy:()=>false, state:()=>state, commit:a=>state=reduceState(state,a)});
    const first = api.network();
    expect(JSON.stringify(first)).not.toContain('绝密家庭谈话');
    state = reduceState(state, {type:'switch_protagonist',target:'sakiko'});
    const second = api.network();
    expect(second.accounts).toEqual(first.accounts);
    expect(second.space).toBe(first.space);
    expect(second.ownerId).toBe(networkOwnerId('sakiko'));
    expect(second.binding).not.toBe(first.binding);
  });
  it('separates chat icons from lockscreen sources and keeps the two requested wallpapers', () => {
    const manifest = JSON.parse(readFileSync('assets/network/manifest.json','utf8'));
    for (const owner of ['soyo','sakiko']) {
      expect(manifest.assets[`avatars/${owner}.webp`].purpose).toBe('chat-icon');
      expect(manifest.assets[`lockscreens/${owner}.webp`].purpose).toBe('smartphone-lock-screen');
      expect(manifest.assets[`avatars/${owner}.webp`].source).toContain('/avatars/');
      expect(manifest.assets[`lockscreens/${owner}.webp`].source).toContain('/lockscreens/');
    }
  });
});
