/** Sanma rules v1. Physical reds: id 24 (5p), id 60 (5s).
 * tiles arguments contain concealed tiles only, including winTile when scoring.
 * RNG is deterministic local-play xoshiro128**, NOT the online ChaCha/HKDF protocol. */
export type Tile = number;
export type Meld = { tiles: Tile[]; open: boolean; kan?: boolean };
export interface ScoreContext { melds?: Meld[]; winTile: Tile; tsumo: boolean; riichi?: boolean; doubleRiichi?: boolean; ippatsu?: boolean; seatWind?: number; roundWind?: number; rinshan?: boolean; chankan?: boolean; lastTile?: boolean; nuki?: number; doraIndicators?: Tile[]; uraIndicators?: Tile[] }
export interface ScoreResult { han: number; fu: number; yakuman: number; yaku: string[]; base: number }
export const kind = (t: Tile): number => Math.floor(t / 4);
export function tileName(t: Tile): string { const k=kind(t); return k<2 ? (k?'9万':'1万') : k<11 ? ((t===24?'赤':'')+(k-1)+'筒') : k<20 ? ((t===60?'赤':'')+(k-10)+'索') : ['东','南','西','北','白','发','中'][k-20]; }
export const makeDeck = (): Tile[] => Array.from({length:108},(_,i)=>i);
export class RNG {
 private s: number[];
 constructor(seed:string) { let h=2166136261; for(const c of seed) h=Math.imul(h^c.charCodeAt(0),16777619); this.s=Array.from({length:4},()=>{h+=0x9e3779b9; let z=h; z=Math.imul(z^(z>>>16),0x21f0aaad); z=Math.imul(z^(z>>>15),0x735a2d97); return (z^(z>>>15))>>>0;}); }
 static restore(raw:any):RNG {if(!Array.isArray(raw?.s)||raw.s.length!==4||raw.s.some((n:unknown)=>!Number.isInteger(n)))throw Error('Invalid RNG state');const r=new RNG('restore');r.s=[...raw.s];return r;}
 private uint():number { const s=this.s, rot=(x:number,n:number)=>(x<<n)|(x>>>(32-n)); const r=Math.imul(rot(Math.imul(s[1],5),7),9)>>>0,t=s[1]<<9; s[2]^=s[0];s[3]^=s[1];s[1]^=s[2];s[0]^=s[3];s[2]^=t;s[3]=rot(s[3],11);return r; }
 next():number{return this.uint()/4294967296;}
 int(n:number):number {if(!Number.isSafeInteger(n)||n<1||n>4294967296)throw Error('Invalid RNG bound');const limit=4294967296-4294967296%n;let x;do{x=this.uint();}while(x>=limit);return x%n;}
}
const terminal=(k:number)=>k<2||k===2||k===10||k===11||k===19;
const outside=(k:number)=>terminal(k)||k>=20;
const seqStart=(k:number)=>(k>=2&&k<=8)||(k>=11&&k<=17);
function counts(ts:Tile[]):number[]{const c=Array(27).fill(0);for(const t of ts){if(!Number.isInteger(t)||t<0||t>=108)throw Error('Invalid tile');c[kind(t)]++;}return c;}
const orphans=[0,1,2,10,11,19,20,21,22,23,24,25,26];
type State=[number,number,number];
const suitCache=new Map<string,State[]>(),shCache=new Map<string,number>();
// Independent suit decomposition, retaining all nondominated (meld,taatsu,pair) states.
function suitStates(c:number[],sequences:boolean):State[]{
 const key=(sequences?'s':'h')+c.join('');const hit=suitCache.get(key);if(hit)return hit;
 const out=new Map<string,State>();
 function dfs(start:number,m:number,t:number,p:number){while(start<c.length&&!c[start])start++;if(start===c.length){const k=m+','+p;const old=out.get(k);if(!old||old[1]<t)out.set(k,[m,t,p]);return;}const i=start;
 c[i]--;dfs(i,m,t,p);c[i]++;
 if(c[i]>=3){c[i]-=3;dfs(i,m+1,t,p);c[i]+=3;}
 if(c[i]>=2){c[i]-=2;dfs(i,m,t+1,p);if(!p)dfs(i,m,t,1);c[i]+=2;}
 if(sequences){if(i+2<c.length&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;dfs(i,m+1,t,p);c[i]++;c[i+1]++;c[i+2]++;}for(const d of [1,2])if(i+d<c.length&&c[i+d]){c[i]--;c[i+d]--;dfs(i,m,t+1,p);c[i]++;c[i+d]++;}}
 }dfs(0,0,0,0);const result=[...out.values()];suitCache.set(key,result);return result;
}
function sCounts(c:number[],meldCount=0):number {
 const key=meldCount+':'+c.join('');const hit=shCache.get(key);if(hit!==undefined)return hit;
 let states:State[]=[[meldCount,0,0]];
 for(const [part,seq] of [[c.slice(0,2),false],[c.slice(2,11),true],[c.slice(11,20),true],[c.slice(20),false]] as [number[],boolean][]){const next=new Map<string,State>();for(const a of states)for(const b of suitStates(part,seq)){const m=a[0]+b[0],t=a[1]+b[1],p=a[2]+b[2];if(m>4||p>1)continue;const k=m+','+p;const old=next.get(k);if(!old||old[1]<t)next.set(k,[m,t,p]);}states=[...next.values()];}
 let best=Math.min(...states.map(([m,t,p])=>8-2*m-Math.min(t,4-m)-p));
 if(!meldCount){const pairs=c.filter(x=>x>=2).length,unique=c.filter(Boolean).length;best=Math.min(best,6-pairs+Math.max(0,7-unique),13-orphans.filter(k=>c[k]).length-(orphans.some(k=>c[k]>=2)?1:0));}
 if(shCache.size>60000)shCache.clear();shCache.set(key,best);return best;
}
export function shanten(tiles:Tile[],melds:Meld[]=[]):number{return sCounts(counts(tiles),melds.length);}
export function waits(tiles:Tile[],melds:Meld[]=[]):number[]{const c=counts(tiles),all=counts([...tiles,...melds.flatMap(m=>m.tiles)]),out:number[]=[];for(let k=0;k<27;k++)if(all[k]<4){c[k]++;if(sCounts(c,melds.length)===-1)out.push(k);c[k]--;}return out;}
type Group={k:number;seq:boolean;open:boolean;kan:boolean};
function decompositions(c:number[],needed:number):{pair:number;groups:Group[]}[]{const out:{pair:number;groups:Group[]}[]=[];for(let p=0;p<27;p++)if(c[p]>=2){c[p]-=2;const gs:Group[]=[];const dfs=()=>{const i=c.findIndex(Boolean);if(i<0){if(gs.length===needed)out.push({pair:p,groups:gs.slice()});return;}if(gs.length>=needed)return;if(c[i]>=3){c[i]-=3;gs.push({k:i,seq:false,open:false,kan:false});dfs();gs.pop();c[i]+=3;}if(seqStart(i)&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;gs.push({k:i,seq:true,open:false,kan:false});dfs();gs.pop();c[i]++;c[i+1]++;c[i+2]++;}};dfs();c[p]+=2;}return out;}
function dora(k:number):number{if(k<2)return 1-k;if(k<11)return 2+(k-2+1)%9;if(k<20)return 11+(k-11+1)%9;if(k<24)return 20+(k-20+1)%4;return 24+(k-24+1)%3;}
export function score(tiles:Tile[],ctx:ScoreContext):ScoreResult|null {
 const ms=ctx.melds??[],c=counts(tiles),allTiles=[...tiles,...ms.flatMap(m=>m.tiles)],ac=counts(allTiles),ks=ac.flatMap((n,k)=>n?[k]:[]),closed=ms.every(m=>!m.open),wk=kind(ctx.winTile);
 if(tiles.length!==14-3*ms.length||!tiles.includes(ctx.winTile)||new Set(allTiles).size!==allTiles.length||ac.some(n=>n>4)||ms.length>4)return null;
 const fixed:Group[]=[];for(const m of ms){const a=m.tiles.map(kind).sort((a,b)=>a-b);if(a.length!==(m.kan?4:3)||!a.every(k=>k===a[0]))return null;fixed.push({k:a[0],seq:false,open:m.open,kan:!!m.kan});}
 const candidates:ScoreResult[]=[];
 function finish(han:number,fu:number,yaku:string[],ym:string[]){if(ym.length){candidates.push({han:0,fu:0,yakuman:ym.length,yaku:ym,base:8000*ym.length});return;}if(!han)return;let bonus=0;for(const t of allTiles)if(t===24||t===60)bonus++;if(bonus){han+=bonus;yaku.push('赤宝牌 '+bonus);}let ds=0;for(const t of ctx.doraIndicators??[]){const k=dora(kind(t));ds+=ac[k]+(k===23?(ctx.nuki??0):0);}if(ds){han+=ds;yaku.push('宝牌 '+ds);}let us=0;if(closed&&ctx.riichi)for(const t of ctx.uraIndicators??[]){const k=dora(kind(t));us+=ac[k]+(k===23?(ctx.nuki??0):0);}if(us){han+=us;yaku.push('里宝牌 '+us);}if(ctx.nuki){han+=ctx.nuki;yaku.push('拔北 '+ctx.nuki);}const base=han>=13?8000:han>=11?6000:han>=8?4000:han>=6?3000:han>=5?2000:Math.min(2000,fu*2**(han+2));candidates.push({han,fu,yakuman:0,yaku,base});}
 function common(){const y:string[]=[],ym:string[]=[];let h=0;const add=(name:string,n:number)=>{y.push(name);h+=n;};if(closed&&ctx.doubleRiichi)add('双立直',2);else if(closed&&ctx.riichi)add('立直',1);if(closed&&ctx.riichi&&ctx.ippatsu)add('一发',1);if(closed&&ctx.tsumo)add('门前清自摸',1);if(ctx.chankan&&!ctx.tsumo)add('抢杠',1);if(ctx.rinshan&&ctx.tsumo)add('岭上开花',1);if(ctx.lastTile&&!ctx.rinshan)add(ctx.tsumo?'海底摸月':'河底捞鱼',1);if(ks.every(k=>!outside(k)))add('断幺九',1);const suits=new Set(ks.filter(k=>k<20).map(k=>k<2?0:k<11?1:2));if(suits.size===1)add(ks.some(k=>k>=20)?'混一色':'清一色',ks.some(k=>k>=20)?(closed?3:2):(closed?6:5));if(ks.every(k=>k>=20))ym.push('字一色');if(ks.every(terminal))ym.push('清老头');if(ks.every(k=>[12,13,14,16,18,25].includes(k)))ym.push('绿一色');if(closed&&!ms.length&&suits.size===1&&!ks.some(k=>k>=20)){const start=ks[0]<11?2:11;if(c[start]>=3&&c[start+8]>=3&&Array.from({length:7},(_,i)=>c[start+i+1]).every(n=>n>=1))ym.push('九莲宝灯');}return {y,ym,h};}
 if(!ms.length&&orphans.every(k=>c[k])&&ks.every(k=>orphans.includes(k))){finish(0,0,[],['国士无双']);}
 if(!ms.length&&c.filter(n=>n===2).length===7){const a=common();a.y.push('七对子');a.h+=2;if(ks.every(outside)){a.y.push('混老头');a.h+=2;}finish(a.h,25,a.y,a.ym);}
 for(const d of decompositions(c,4-ms.length)){
 const groups=[...d.groups,...fixed];const placements:number[]=[];if(d.pair===wk)placements.push(-1);d.groups.forEach((g,i)=>{if(g.seq?wk>=g.k&&wk<=g.k+2:wk===g.k)placements.push(i);});
 for(const placement of placements){const a=common();const add=(n:string,h:number)=>{a.y.push(n);a.h+=h;};const trip=groups.filter(g=>!g.seq),seq=groups.filter(g=>g.seq);const concealed=groups.filter((g,i)=>!g.seq&&!g.open&&(ctx.tsumo||i!==placement)).length;
 if(concealed===4)a.ym.push('四暗刻');if(trip.filter(g=>g.k>=24).length===3)a.ym.push('大三元');const winds=trip.filter(g=>g.k>=20&&g.k<=23).length;if(winds===4)a.ym.push('大四喜');else if(winds===3&&d.pair>=20&&d.pair<=23)a.ym.push('小四喜');if(groups.filter(g=>g.kan).length===4)a.ym.push('四杠子');
 for(const g of trip){if(g.k>=24)add(['白','发','中'][g.k-24],1);if(g.k===ctx.seatWind&&g.k!==23)add('自风',1);if(g.k===ctx.roundWind&&g.k!==23)add('场风',1);}
 const valuePair=(d.pair>=24?2:0)+(d.pair===(ctx.seatWind??20)&&d.pair!==23?2:0)+(d.pair===(ctx.roundWind??20)&&d.pair!==23?2:0);
 // Defaults are east; use the same defaults for triplet yaku.
 for(const g of trip){if(ctx.seatWind===undefined&&g.k===20)add('自风',1);if(ctx.roundWind===undefined&&g.k===20)add('场风',1);}
 const winGroup=placement<0?undefined:groups[placement];const waitFu=placement<0?2:winGroup?.seq&&(wk===winGroup.k+1||(wk===winGroup.k+2&&(winGroup.k===2||winGroup.k===11))||(wk===winGroup.k&&(winGroup.k===8||winGroup.k===17)))?2:0;
 const pinfu=closed&&seq.length===4&&!valuePair&&!waitFu;if(pinfu)add('平和',1);
 if(closed){const freq=new Map<number,number>();for(const g of seq)freq.set(g.k,(freq.get(g.k)??0)+1);const pairs=[...freq.values()].reduce((s,n)=>s+Math.floor(n/2),0);if(pairs>=2)add('二杯口',3);else if(pairs===1)add('一杯口',1);}
 if(trip.length===4)add('对对和',2);if(concealed===3)add('三暗刻',2);if(groups.filter(g=>g.kan).length===3)add('三杠子',2);
 if(trip.filter(g=>g.k>=24).length===2&&d.pair>=24)add('小三元',2);
 for(const starts of [[0,2,11],[1,10,19]])if(starts.every(k=>trip.some(g=>g.k===k)))add('三色同刻',2);
 for(const start of [2,11])if([start,start+3,start+6].every(k=>seq.some(g=>g.k===k)))add('一气通贯',closed?2:1);
 if(ks.every(outside))add('混老头',2);
 if(seq.length&&outside(d.pair)&&groups.every(g=>g.seq?[2,8,11,17].includes(g.k):outside(g.k))){const pure=!ks.some(k=>k>=20);add(pure?'纯全带幺九':'混全带幺九',pure?(closed?3:2):(closed?2:1));}
 let fu=20+valuePair+waitFu+(ctx.tsumo?2:closed?10:0);for(let i=0;i<groups.length;i++){const g=groups[i];if(g.seq)continue;const open=g.open||(!ctx.tsumo&&i===placement);fu+=(g.kan?8:2)*(outside(g.k)?2:1)*(open?1:2);}if(pinfu&&ctx.tsumo)fu=20;else fu=Math.ceil(Math.max(30,fu)/10)*10;
 finish(a.h,fu,a.y,a.ym);
 }}return candidates.sort((a,b)=>b.base-a.base||b.han-a.han||b.fu-a.fu)[0]??null;
}
const qCache=new Map<string,[number,number]>();
function quality(c:number[]):[number,number]{const key=c.join(''),hit=qCache.get(key);if(hit)return hit;const s=sCounts(c);let u=0;for(let k=0;k<27;k++)if(c[k]<4){const w=4-c[k];c[k]++;if(sCounts(c)<s)u+=w;c[k]--;}const q:[number,number]=[-s,u];if(qCache.size>30000)qCache.clear();qCache.set(key,q);return q;}
const compare=(a:number[],b:number[])=>a[0]-b[0]||a[1]-b[1];
// Keep all 38/1 candidate attempts, but temper their acceptance. Once close to
// ready, improvements are rarer; this prevents repeated hill-climbing to tenpai.
// This is an explicit calibration extension to design 3.2's strict-better rule.
const exchangeAcceptance = { far: 0.20, two: 0.155, near: 0.02, negative: 0.40 };
function removal(c:number[],positive:boolean):number[]{const weights=c.map(n=>4-n);let best:number[]|undefined;const choices:number[]=[];for(let r=0;r<27;r++)if(c[r]){const sum=[0,0];c[r]--;for(let t=0;t<27;t++)if(weights[t]){c[t]++;const q=quality(c);sum[0]+=weights[t]*q[0];sum[1]+=weights[t]*q[1];c[t]--;}c[r]++;const cmp=best?compare(sum,best)*(positive?1:-1):1;if(cmp>0){best=sum;choices.length=0;choices.push(r);}else if(!cmp)choices.push(r);}return choices;}
function shuffle<T>(a:T[],rng:RNG){for(let i=a.length-1;i>0;i--){const j=rng.int(i+1);[a[i],a[j]]=[a[j],a[i]];}}
export function deal(seed:string,lucks:number[]):{hands:Tile[][];wall:Tile[];dead:Tile[];rng:RNG}{if(lucks.length!==3||lucks.some(l=>!Number.isInteger(l)||l<0||l>100))throw Error('Three integer luck values in 0..100 required');const deck=makeDeck();shuffle(deck,new RNG(seed+'/shuffle'));const dead=deck.splice(-14),hands:Tile[][]=[[],[],[]];for(let round=0;round<3;round++)for(let p=0;p<3;p++)hands[p].push(...deck.splice(0,4));for(let p=0;p<3;p++)hands[p].push(deck.shift()!);const rng=new RNG(seed+'/draw'),exchange=new RNG(seed+'/exchange'),acceptance=new RNG(seed+'/exchange-accept-v1');const budgets=lucks.map(l=>{const v=l===50?0:(l>50?38:1)*(Math.abs(Math.max(0,Math.min(100,l))-50)/50)**1.4;const n=Math.floor(v);return n+(v>n&&exchange.next()<v-n?1:0);});
 const cached:( {key:string;choices:number[]}|undefined)[]=[];
 while(budgets.some(n=>n>0)){const order=[0,1,2].filter(p=>budgets[p]>0);shuffle(order,exchange);for(const p of order){budgets[p]--;const hand=hands[p],c=counts(hand),key=c.join(''),positive=lucks[p]>50;if(cached[p]?.key!==key)cached[p]={key,choices:removal(c,positive)};const choices=cached[p]!.choices;const eligible=hand.map((t,i)=>choices.includes(kind(t))?i:-1).filter(i=>i>=0),i=eligible[exchange.int(eligible.length)],j=exchange.int(deck.length),before=quality(c);c[kind(hand[i])]--;c[kind(deck[j])]++;const rate=positive?(before[0]<=-3?exchangeAcceptance.far:before[0]===-2?exchangeAcceptance.two:exchangeAcceptance.near):exchangeAcceptance.negative;if(compare(quality(c),before)*(positive?1:-1)>0&&acceptance.next()<rate)[hand[i],deck[j]]=[deck[j],hand[i]];}}
 return {hands,wall:deck,dead,rng};}
export function drawWeighted(hand:Tile[],wall:Tile[],luck:number,rng:RNG,melds:Meld[]=[]):Tile {if(!wall.length)throw Error('Empty live wall');if(luck===50)return wall.shift()!;const c=counts(hand),s=sCounts(c,melds.length),a=.4*(Math.max(0,Math.min(100,luck))-50)/50,weights=new Map<number,number>();for(const t of wall){const k=kind(t);if(weights.has(k))continue;c[k]++;const next=sCounts(c,melds.length);c[k]--;const g=Math.max(-1,Math.min(1,s-next));weights.set(k,1000+Math.round(1000*a*g));}let r=rng.int(wall.reduce((sum,t)=>sum+weights.get(kind(t))!,0)),index=0;for(;index<wall.length;index++){r-=weights.get(kind(wall[index]))!;if(r<0)break;}[wall[0],wall[index]]=[wall[index],wall[0]];return wall.shift()!;}

export function waitShapes(tiles:Tile[],melds:Meld[]=[]):string[] {
 const c=counts(tiles),out:string[]=[];
 for(const w of waits(tiles,melds)){c[w]++;
 for(const d of decompositions(c,4-melds.length)){
 const gs=[...d.groups,...melds.map(m=>({k:kind(m.tiles[0]),seq:false,open:m.open,kan:!!m.kan}))];
 const base=d.pair+':'+gs.map(g=>(g.seq?'s':'t')+g.k).sort().join(',');
 if(d.pair===w)out.push(w+':'+base+':pair');
 for(const g of d.groups)if(g.seq?w>=g.k&&w<=g.k+2:w===g.k)out.push(w+':'+base+':'+(g.seq?'s':'t')+g.k);
 }
 if(!melds.length&&c.filter(n=>n===2).length===7)out.push(w+':pairs');
 if(!melds.length&&orphans.every(k=>c[k])&&c.every((n,k)=>!n||orphans.includes(k)))out.push(w+':orphans');
 c[w]--;}
 return [...new Set(out)].sort();
}
