import {createGame,actSeat,resolveResponses,legal,riichiKanReason} from '../src/engine';
import {makeDeck,kind} from '../src/core';
export function run(){
 const g=createGame('browser-riichi-fixture'),p=g.players[0];
 const seen=Array(27).fill(0);p.hand=[20,20,20,2,3,4,11,12,13,16,17,18,24,25].map(k=>4*k+seen[k]++);
 g.players.forEach((p,i)=>{if(i)p.hand=[];p.melds=[];p.river=[];p.nuki=[]});
 const reserved=[83,97],pool=makeDeck().filter(t=>!p.hand.includes(t)&&!reserved.includes(t));
 g.players[1].hand=pool.splice(0,13);g.players[2].hand=pool.splice(0,13);g.dead=pool.splice(0,14);pool.push(g.dead[10]);g.dead[10]=97;
 g.wall=[...pool.splice(0,2),83,...pool];
 const check=()=>{const all=[...g.wall,...g.dead,...g.players.flatMap(p=>[...p.hand,...p.river,...p.nuki,...p.melds.flatMap(m=>m.tiles)])];if(all.length!==108||new Set(all).size!==108||g.players.reduce((n,p)=>n+p.points,0)+g.pot!==105000)throw Error('Conservation failed')};
 const discard=p.hand.at(-1)!;if(!legal(g).riichiTiles.includes(discard))throw Error('Not tenpai');actSeat(g,{type:'discard',tile:discard,riichi:true},0);resolveResponses(g,{});check();
 for(let s=1;s<=2;s++){actSeat(g,{type:'discard',tile:g.drawn!},s);resolveResponses(g,{});check()}
 if(!p.doubleRiichi||!legal(g).kan)throw Error(riichiKanReason(g)??'Missing double riichi');
 actSeat(g,{type:'kan'},0);check();if(!legal(g).tsumo)throw Error('No replacement win');actSeat(g,{type:'tsumo'},0);check();
 if(!g.result?.details[0].includes('双立直')||g.result.details[0].includes('、立直'))throw Error('Double riichi scoring failed');
 return {fixture:true,postRiichiKan:g.kans,doubleRiichi:p.doubleRiichi,replacementKind:kind(g.drawn!),result:g.result,conserved:true};
}
