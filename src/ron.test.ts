import {it,expect,describe} from 'vitest';
import {createGame,act,aiStep,legal} from './engine';
function waiting(){const g=createGame('ron-window');const ks=[2,3,4,5,6,7,12,13,14,15,16,17,22],c=Array(27).fill(0);g.players[0].hand=ks.map(k=>4*k+c[k]++);g.players[1].hand=[];g.players[2].hand=[];g.phase='response';g.turn=1;g.lastDiscard={tile:89,seat:1};g.players[1].river=[89];return g}
describe('furiten and ron priority',()=>{
 it('allows a normal riichi ron',()=>{const g=waiting();g.players[0].riichi=true;expect(legal(g).ron).toBe(true);act(g,{type:'ron'});expect(g.phase).toBe('end');expect(g.result!.title).toContain('荣和');expect(g.result!.deltas[0]).toBeGreaterThan(0)});
 it('own discard of any current wait blocks ron',()=>{const g=waiting();g.players[0].riichi=true;g.players[0].history=[90];expect(legal(g).ron).toBe(false)});
 it('temporary furiten blocks a legal winning tile',()=>{const g=waiting();g.players[0].riichi=true;g.players[0].furiten=true;expect(legal(g).ron).toBe(false)});
 it('riichi passing ron causes permanent furiten',()=>{const g=waiting();g.players[0].riichi=true;act(g,{type:'pass'});expect(g.players[0].permanentFuriten).toBe(true);expect(g.players[0].furiten).toBe(true)});
 it('nonriichi passing ron causes temporary furiten only',()=>{const g=waiting();g.players[0].hand=[8,12,16,9,13,17,20,24,28,32,36,40,25];g.lastDiscard={seat:1,tile:26};expect(legal(g).ron).toBe(true);act(g,{type:'pass'});expect(g.players[0].furiten).toBe(true);expect(g.players[0].permanentFuriten).toBe(false)});
 it('human ron window does not auto-close',()=>{const g=waiting();g.players[0].riichi=true;aiStep(g);expect(g.phase).toBe('response');expect(legal(g).ron).toBe(true)});
 it('riichi declaration discard ronned does not charge the stick',()=>{const g=waiting();g.players[0].riichi=true;g.pendingRiichi=1;const before=g.players[1].points;act(g,{type:'ron'});expect(g.pot).toBe(0);expect(g.players[1].points-before).toBe(g.result!.deltas[1]);expect(g.players[1].riichi).toBe(false)});
 it('riichi cannot discard an old concealed tile',()=>{const g=createGame('riichi-lock');g.players[0].riichi=true;const old=g.players[0].hand.find(t=>t!==g.drawn)!;const hand=g.players[0].hand.slice();act(g,{type:'discard',tile:old});expect(g.players[0].hand).toEqual(hand);act(g,{type:'discard',tile:g.drawn!});expect(g.phase).toBe('response')});
 it('last live tile prevents a new nuki or kan',()=>{const g=createGame('last');g.wall=[];expect(legal(g).nuki).toBe(false);expect(legal(g).kan).toBe(false);expect(legal(g).riichiTiles).toEqual([])});
});
