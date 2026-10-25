import { kind, tileName, deal, drawWeighted, score, shanten, waits, RNG } from './core';
import type { Tile, Meld, ScoreResult } from './core';
/** Local single-player engine, not a multiplayer authority. act mutates input and returns a shallow copy.
 * Conservative limitation: post-riichi kans disabled; no pao, abortive draws,
 * double riichi or nagashi mangan. Fixed East 1..4 match with dealer repeats.
 * Dead-wall slots 0..9 are indicators, 10..13 a replenishing replacement queue (not verified Tenhou mapping).
 */
export type Ability = 'A01'|'A02'|'A03'|'A06'|'A07'|'A10';
export interface Player { name:string; hand:Tile[]; melds:Meld[]; river:Tile[]; nuki:Tile[]; points:number; luck:number; riichi:boolean; ippatsu:boolean; shield:boolean; sealed:number; sealDrawn?:boolean; used:boolean; gain:number; furiten:boolean; permanentFuriten:boolean; history:Tile[]; discards:number; active:Ability }
export type Action = {type:'discard';tile:Tile;riichi?:boolean}|{type:'tsumo'|'ron'|'pass'|'nuki'|'pon'|'kan'|'next'}|{type:'ability';target?:number;tile?:Tile;suit?:'p'|'s'};
export interface Legal {tsumo:boolean;ron:boolean;pon:boolean;kan:boolean;nuki:boolean;riichiTiles:Tile[];ability:boolean}
export interface Game {players:Player[];wall:Tile[];dead:Tile[];turn:number;phase:'self'|'response'|'end';lastDiscard?:{tile:Tile;seat:number};drawn?:Tile;log:string[];result?:{title:string;details:string[];deltas:number[]};peek?:Tile[];seed:string;handNo:number;active:Ability;rng:RNG;abilityRng:RNG;pot:number;dealer:number;honba:number;kans:number;source:'normal'|'replacement'|'call'|'ability';matchEnded?:boolean; repeatDealer?:boolean; rankings?:{seat:number;name:string;points:number}[]; pending?:'nuki'|'kakan';pendingRiichi?:number;responseReady:boolean;noDiscardKind?:number}
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const sorted=(a:Tile[])=>a.sort((a,b)=>a-b);
function say(g:Game,s:string){g.log=[...g.log.slice(-79),s]}
function interrupt(g:Game){g.players.forEach(p=>p.ippatsu=false)}
export function createGame(seed:string,active:Ability='A02',lucks:number[]=[50,50,50],dealer=0):Game {
 const d=deal(seed,lucks); const g:Game={players:d.hands.map((hand,i)=>({name:['你','青岚','白露'][i],hand:sorted(hand),melds:[],river:[],nuki:[],points:35000,luck:clamp(lucks[i]??50),riichi:false,ippatsu:false,shield:true,sealed:0,used:false,gain:0,furiten:false,permanentFuriten:false,history:[],discards:0,active:i===0?active:i===1?'A01':'A06'})),wall:d.wall,dead:d.dead,rng:d.rng,abilityRng:new RNG(seed+'/ability'),turn:0,phase:'self',seed,active,handNo:1,pot:0,dealer,honba:0,kans:0,source:'normal',responseReady:false,log:['单机三麻 · 你与两位 AI · 每人自带一次护运','本局配牌运气：'+lucks.join(' / ')]};draw(g,dealer);return g;
}
function evaluate(g:Game,s:number,tsumo:boolean):ScoreResult|null {
 const p=g.players[s],t=tsumo?g.drawn:g.lastDiscard?.tile;if(t===undefined)return null;
 if(tsumo&&(g.source==='ability'||g.source==='call'))return null;
 return score(tsumo?p.hand:[...p.hand,t],{melds:p.melds,winTile:t,tsumo,riichi:p.riichi,ippatsu:p.ippatsu,seatWind:20+(s-g.dealer+3)%3,roundWind:20,chankan:!tsumo&&g.pending==='kakan',rinshan:tsumo&&g.source==='replacement',lastTile:!g.wall.length&&!g.pending&&g.source!=='replacement',nuki:p.nuki.length,doraIndicators:g.dead.slice(0,2*(g.kans+1)).filter((_,i)=>i%2===0),uraIndicators:p.riichi?g.dead.slice(0,2*(g.kans+1)).filter((_,i)=>i%2===1):[]});
}
function canRon(g:Game,s:number){const p=g.players[s];return !!g.lastDiscard&&g.lastDiscard.seat!==s&&!p.furiten&&!p.permanentFuriten&&!waits(p.hand,p.melds).some(k=>p.history.some(t=>kind(t)===k))&&!!evaluate(g,s,false)}
function addedTile(p:Player){return p.hand.find(t=>p.melds.some(m=>m.open&&!m.kan&&kind(m.tiles[0])===kind(t)))}
function kanTiles(p:Player){const t=p.hand.find(t=>p.hand.filter(x=>kind(x)===kind(t)).length===4);return t===undefined?[]:p.hand.filter(x=>kind(x)===kind(t))}
export function legal(g:Game,seat=0):Legal {
 const p=g.players[seat],own=g.phase==='self'&&g.turn===seat,response=g.phase==='response'&&g.lastDiscard?.seat!==seat;
 const count=g.lastDiscard?p.hand.filter(t=>kind(t)===kind(g.lastDiscard!.tile)).length:0;
 return {tsumo:own&&!!evaluate(g,seat,true),ron:response&&canRon(g,seat),pon:response&&!g.pending&&!p.riichi&&count>=2,kan:!p.riichi&&g.wall.length>0&&g.kans<4&&(own&&g.source!=='call'&&g.source!=='ability'&&(kanTiles(p).length===4||addedTile(p)!==undefined)||response&&!g.pending&&count===3),nuki:own&&g.source!=='call'&&g.source!=='ability'&&g.wall.length>0&&p.hand.some(t=>kind(t)===23&&(!p.riichi||t===g.drawn)),riichiTiles:own&&!p.riichi&&p.melds.every(m=>!m.open)&&p.points>=1000&&g.wall.length>=4&&g.source!=='call'?p.hand.filter(t=>shanten(p.hand.filter(x=>x!==t),p.melds)===0):[],ability:own&&g.source==='normal'&&!p.riichi&&!p.used&&!p.sealed&&p.active!=='A03'&&p.luck>=({A01:4,A02:6,A03:0,A06:10,A07:20,A10:8}[p.active])};
}
function drift(g:Game,winners:number[],loser?:number){g.players.forEach((p,i)=>{const n=clamp(Math.round(50+.9*(p.luck-50)+(winners.includes(i)?-6:i===loser?8:0)));const delta=n-p.luck;const change=delta>0?Math.min(delta,15-p.gain):delta;p.luck+=change;if(change>0)p.gain+=change;say(g,p.name+' 结算运气 '+(change>=0?'+':'')+change+' → '+p.luck)})}
function settleMatch(g:Game,repeat:boolean){
 g.repeatDealer=repeat;g.matchEnded=g.players.some(p=>p.points<0)||(g.handNo>=4&&!repeat);
 if(g.matchEnded){const order=g.players.map((p,seat)=>({seat,name:p.name,points:p.points})).sort((a,b)=>b.points-a.points||a.seat-b.seat);if(g.pot){g.players[order[0].seat].points+=g.pot;order[0].points+=g.pot;g.pot=0}g.rankings=order;}
}
function finish(g:Game,winners:number[],tsumo=false){
 const deltas=[0,0,0],details:string[]=[];const loser=g.lastDiscard?.seat;
 for(const s of winners){const r=evaluate(g,s,tsumo)!;const round=(n:number)=>Math.ceil(n/100)*100;
 if(tsumo){for(let i=0;i<3;i++)if(i!==s){const pay=round(r.base*(s===g.dealer||i===g.dealer?2:1))+g.honba*100;deltas[i]-=pay;deltas[s]+=pay}}
 else {const pay=round(r.base*(s===g.dealer?6:4))+g.honba*300;deltas[loser!]-=pay;deltas[s]+=pay}
 details.push(g.players[s].name+'：'+r.yaku.join('、')+' '+r.han+'番 '+r.fu+'符');}
 if(winners.length){deltas[winners[0]]+=g.pot;g.pot=0}
 g.players.forEach((p,i)=>p.points+=deltas[i]);drift(g,winners,tsumo?undefined:loser);g.result={title:winners.map(s=>g.players[s].name).join('、')+(tsumo?' 自摸':' 荣和'),details,deltas};g.phase='end';settleMatch(g,winners.includes(g.dealer));g.pendingRiichi=undefined;say(g,g.result.title);
}
function exhausted(g:Game){const ready=g.players.map(p=>shanten(p.hand,p.melds)===0);const n=ready.filter(Boolean).length;const deltas=ready.map(r=>n===0||n===3?0:r?3000/n:-3000/(3-n));g.players.forEach((p,i)=>p.points+=deltas[i]);drift(g,[]);g.result={title:'荒牌流局',details:ready.map((r,i)=>g.players[i].name+(r?' 听牌':' 未听')),deltas};g.phase='end';settleMatch(g,ready[g.dealer]);say(g,'荒牌流局')}
function draw(g:Game,s:number,replacement=false){if(!g.wall.length){exhausted(g);return}g.turn=s;g.phase='self';g.lastDiscard=undefined;g.pending=undefined;g.noDiscardKind=undefined;g.responseReady=false;const p=g.players[s];p.furiten=false;let t:Tile;
 if(replacement){t=g.dead.splice(10,1)[0];g.dead.push(g.wall.pop()!)}else{t=drawWeighted(p.hand,g.wall,p.luck,g.rng,p.melds);if(p.sealed)p.sealDrawn=true;g.players.forEach((q,i)=>{if(i!==s&&q.sealed)q.sealed--})}
 p.hand.push(t);sorted(p.hand);g.drawn=t;g.source=replacement?'replacement':'normal';}
function passRon(g:Game,s:number){if(canRon(g,s)){g.players[s].furiten=true;if(g.players[s].riichi)g.players[s].permanentFuriten=true}}
function establish(g:Game){if(g.pendingRiichi!==undefined){const p=g.players[g.pendingRiichi];p.riichi=true;p.ippatsu=true;p.points-=1000;g.pot+=1000;say(g,p.name+' 立直');g.pendingRiichi=undefined}}
function call(g:Game,s:number,kan:boolean){const last=g.lastDiscard!;const p=g.players[s];const tiles=p.hand.filter(t=>kind(t)===kind(last.tile)).slice(0,kan?3:2);p.hand=p.hand.filter(t=>!tiles.includes(t));tiles.push(last.tile);g.players[last.seat].river=g.players[last.seat].river.filter(t=>t!==last.tile);p.melds.push({tiles,open:true,kan});interrupt(g);g.turn=s;g.lastDiscard=undefined;g.drawn=undefined;g.phase='self';g.source='call';g.noDiscardKind=kind(last.tile);say(g,p.name+(kan?' 明杠':' 碰'));if(kan){g.kans++;draw(g,s,true)}}
function resolve(g:Game,user:'pass'|'ron'|'pon'|'kan'){
 const from=g.lastDiscard!.seat,order=[(from+1)%3,(from+2)%3];const winners=order.filter(s=>s===0?user==='ron'&&canRon(g,s):canRon(g,s));
 if(winners.length){finish(g,winners);return}if(from!==0)passRon(g,0);establish(g);
 if(g.pending==='kakan'){confirmAddedKan(g,from);return}
 if(g.pending==='nuki'){const p=g.players[from],t=g.lastDiscard!.tile;p.hand=p.hand.filter(x=>x!==t);p.nuki.push(t);interrupt(g);say(g,p.name+' 拔北');draw(g,from,true);return}
 if(user==='pon'||user==='kan'){call(g,0,user==='kan');return}
 for(const s of order){if(s===0)continue;const p=g.players[s],l=legal(g,s);if(l.pon){const k=kind(g.lastDiscard!.tile);if(k>=24||k===20+(s-g.dealer+3)%3){call(g,s,l.kan);return}}}
 draw(g,(from+1)%3);
}
function confirmAddedKan(g:Game,s:number){const p=g.players[s],t=g.lastDiscard!.tile;const m=p.melds.find(m=>m.open&&!m.kan&&kind(m.tiles[0])===kind(t))!;p.hand=p.hand.filter(x=>x!==t);m.tiles.push(t);m.kan=true;g.kans++;interrupt(g);say(g,p.name+' 加杠');draw(g,s,true)}
function ability(g:Game,a:Extract<Action,{type:'ability'}>){const p=g.players[g.turn];if(!legal(g,g.turn).ability)return;const id=p.active;const q=a.target===undefined?undefined:g.players[a.target];const hostile=id==='A01'||id==='A06'||id==='A10';
 if(hostile&&(!q||q===p))return;
 if(id==='A01'&&!(q!.luck>p.luck&&Math.min(q!.luck,100-p.luck+4,15-p.gain,10)>=5))return;
 if(id==='A06'&&(q!.used||q!.sealed))return;if(id==='A10'&&q!.luck<70)return;
 if(id==='A07'&&(p.discards<3||a.tile===undefined||!p.hand.includes(a.tile)||!a.suit))return;
 const cost={A01:4,A02:6,A03:0,A06:10,A07:20,A10:8}[id];p.luck-=cost;p.used=true;say(g,p.name+' 发动 '+id+' · 支付 '+cost+' 运 → '+p.luck);
 if(hostile&&q!.shield&&q!.luck>=4){q!.shield=false;q!.luck-=4;say(g,q!.name+' 护运抵挡 · 支付 4 运 → '+q!.luck);return}
 if(id==='A01'){const n=Math.min(10,q!.luck,100-p.luck,15-p.gain);q!.luck-=n;p.luck+=n;p.gain+=n;say(g,p.name+' 抢得 '+n+' 运 → '+p.luck+'；'+q!.name+' → '+q!.luck);interrupt(g)}
 if(id==='A02')g.peek=g.wall.slice(0,3);
 if(id==='A06')q!.sealed=3;if(id==='A10'){q!.luck=Math.max(50,q!.luck-10);say(g,q!.name+' 被均衡 → '+q!.luck);interrupt(g)}
 if(id==='A07'){const positions=g.wall.map((t,i)=>({t,i})).filter(({t})=>a.suit==='p'?kind(t)>=2&&kind(t)<=10:kind(t)>=11&&kind(t)<=19);if(!positions.length){p.luck+=cost;say(g,'未找到可换牌');return}const {t,i}=positions[g.abilityRng.int(positions.length)];g.wall[i]=a.tile!;p.hand[p.hand.indexOf(a.tile!)]=t;sorted(p.hand);g.source='ability';g.drawn=undefined;interrupt(g)}
}
function perform(g:Game,a:Action,seat:number){const p=g.players[seat],l=legal(g,seat);
 if(g.phase==='end'){if(a.type==='next'&&!g.matchEnded){const next=createGame(g.seed+':'+(g.handNo+1),g.active,g.players.map(p=>p.luck),g.repeatDealer?g.dealer:(g.dealer+1)%3);next.handNo=g.handNo+(g.repeatDealer?0:1);next.dealer=g.repeatDealer?g.dealer:(g.dealer+1)%3;next.honba=g.repeatDealer||g.result?.title==='荒牌流局'?g.honba+1:0;next.pot=g.pot;next.players.forEach((p,i)=>p.points=g.players[i].points);next.players.forEach((p,i)=>{p.name=g.players[i].name;p.active=g.players[i].active});g.result=undefined;g.peek=undefined;g.pending=undefined;g.lastDiscard=undefined;g.pendingRiichi=undefined;Object.assign(g,next)}return}
 if(g.phase==='response'){if(seat!==0||g.lastDiscard?.seat===0)return;if(a.type==='ron'&&l.ron)resolve(g,'ron');else if(a.type==='pass')resolve(g,'pass');else if((a.type==='pon'&&l.pon)||(a.type==='kan'&&l.kan))resolve(g,a.type);return}
 if(g.turn!==seat)return;
 if(a.type==='ability'){ability(g,a);return}
 if(a.type==='tsumo'&&l.tsumo){finish(g,[seat],true);return}
 if(a.type==='nuki'&&l.nuki){const t=p.hand.find(t=>kind(t)===23&&(!p.riichi||t===g.drawn))!;g.lastDiscard={seat,tile:t};g.pending='nuki';g.phase='response';g.responseReady=false;return}
 if(a.type==='kan'&&l.kan){const t=addedTile(p);if(t!==undefined){g.lastDiscard={seat,tile:t};g.pending='kakan';g.phase='response';g.responseReady=false;interrupt(g);return}const tiles=kanTiles(p);p.hand=p.hand.filter(t=>!tiles.includes(t));p.melds.push({tiles,open:false,kan:true});g.kans++;interrupt(g);say(g,p.name+' 暗杠');draw(g,seat,true);return}
 if(a.type==='discard'){if(!p.hand.includes(a.tile)||p.riichi&&a.tile!==g.drawn||g.noDiscardKind===kind(a.tile)||a.riichi&&!l.riichiTiles.includes(a.tile))return;
 if(p.riichi)p.ippatsu=false;if(a.riichi)g.pendingRiichi=seat;p.hand=p.hand.filter(t=>t!==a.tile);p.river.push(a.tile);p.history.push(a.tile);p.discards++;if(p.sealDrawn){p.sealed=0;p.sealDrawn=false;}else if(g.source==='normal'&&p.sealed)p.sealed=0;g.lastDiscard={tile:a.tile,seat};g.drawn=undefined;g.phase='response';g.responseReady=false;say(g,p.name+' 打出 '+tileName(a.tile));}
}
export function act(g:Game,action:Action):Game {perform(g,action,0);return {...g}}
/** Exactly one AI decision / window advance. Does not dismiss a live human response window. */
export function aiStep(g:Game):Game {
 if(g.phase==='end')return g;
 if(g.phase==='response'){if(g.lastDiscard!.seat===0)resolve(g,'pass');else {const l=legal(g,0);if(!l.ron&&!l.pon&&!l.kan)resolve(g,'pass')}return {...g}}
 if(g.turn===0)return g;const s=g.turn,p=g.players[s],l=legal(g,s);
 if(l.tsumo)perform(g,{type:'tsumo'},s);else if(l.nuki)perform(g,{type:'nuki'},s);else if(l.kan)perform(g,{type:'kan'},s);else {
 if(l.ability){const target=g.players.findIndex((q,i)=>i!==s&&(p.active==='A01'?q.luck>p.luck:!q.used&&!q.sealed));if(target>=0)ability(g,{type:'ability',target})}
 let choices=p.riichi?p.hand.filter(t=>t===g.drawn):p.hand.filter(t=>kind(t)!==g.noDiscardKind);
 const threats=g.players.filter((q,i)=>i!==s&&q.riichi);const value=(t:Tile)=>{const h=p.hand.filter(x=>x!==t);const risk=threats.reduce((v,q)=>v+(q.history.some(x=>kind(x)===kind(t))?0:kind(t)>=20?1:2),0);return shanten(h,p.melds)*10+risk*4};choices=choices.sort((a,b)=>value(a)-value(b)||a-b);const tile=choices[0];if(tile!==undefined)perform(g,{type:'discard',tile,riichi:l.riichiTiles.includes(tile)},s);
 }return {...g};
}

/** Multiplayer entry points reuse the same rule primitives; no AI response decisions. */
export function actSeat(g:Game,a:Action,seat:number):Game {
 if(!Number.isInteger(seat)||seat<0||seat>2)throw Error('Invalid seat');
 if(g.phase==='response')throw Error('Responses must be collected and resolved together');
 perform(g,a,seat);return {...g};
}
export type ResponseChoice='pass'|'ron'|'pon'|'kan';
export function resolveResponses(g:Game,choices:Partial<Record<number,ResponseChoice>>):Game {
 if(g.phase!=='response'||!g.lastDiscard)throw Error('No response window');
 const from=g.lastDiscard.seat,order=[(from+1)%3,(from+2)%3];
 for(const s of order){const a=choices[s]??'pass',l=legal(g,s);if(a!=='pass'&&!l[a])throw Error('Illegal response');}
 const winners=order.filter(s=>choices[s]==='ron'&&canRon(g,s));
 for(const s of order)if(choices[s]!=='ron')passRon(g,s);
 if(winners.length){finish(g,winners);return {...g}}
 establish(g);
 if(g.pending==='kakan'){confirmAddedKan(g,from);return {...g}}
 if(g.pending==='nuki'){const p=g.players[from],t=g.lastDiscard.tile;p.hand=p.hand.filter(x=>x!==t);p.nuki.push(t);interrupt(g);say(g,p.name+' 拔北');draw(g,from,true);return {...g}}
 for(const s of order)if(choices[s]==='pon'||choices[s]==='kan'){call(g,s,choices[s]==='kan');return {...g}}
 draw(g,(from+1)%3);return {...g};
}
