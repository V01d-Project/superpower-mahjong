const randomUUID=()=>globalThis.crypto.randomUUID();
const randomInt=(min:number,max:number)=>{const range=max-min,limit=Math.floor(0x100000000/range)*range;let n:number;do{n=globalThis.crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return min+n%range};
import {createGame,actSeat,resolveResponses,legal,riichiKanReason,type Game,type Action,type Ability,type ResponseChoice} from './engine';
import {kind,RNG} from './core';
export interface Peer {send(data:string):void; close?():void}
type Seat={token:string;peer?:Peer;disconnectedAt?:number;active:Ability;lastSeq:number};
export type Room={id:string;seats:Seat[];game?:Game;revision:number;choices:Partial<Record<number,ResponseChoice>>;peek:Record<number,number[]>;updated:number};
const abilities=['A01','A02','A06','A07','A10'];
const blank={tsumo:false,ron:false,pon:false,kan:false,nuki:false,riichiTiles:[],ability:false};
export class Rooms {
 rooms=new Map<string,Room>(); bindings=new Map<Peer,{room:Room;seat:number}>();
 constructor(public now=()=>Date.now(),public grace=60000,private roomId?:()=>string){}
 send(peer:Peer,type:string,seq:number,payload:unknown){peer.send(JSON.stringify({type,seq,payload}))}
 receive(peer:Peer,input:unknown){let seq=0;try{
 const m=input as {type:string;seq:number;payload?:any};if(!m||!Number.isSafeInteger(m.seq)||m.seq<0)throw Error('Invalid seq');seq=m.seq;const p=m.payload??{};
 if(m.type==='ping'){this.send(peer,'pong',seq,{});return}
 if(['create','join','rejoin'].includes(m.type)){
 if(this.bindings.has(peer))throw Error('Already in room');let r:Room,s:number;
 if(m.type==='create'){if(this.rooms.size>=500)throw Error('Server full');if(this.roomId&&this.rooms.size)throw Error('Room already exists');let id:string;do{id=this.roomId?.()??String(randomInt(100000,1000000))}while(this.rooms.has(id));r={id,seats:[],revision:0,choices:{},peek:{},updated:this.now()};this.rooms.set(id,r);s=0}
 else {r=this.rooms.get(String(p.roomId))!;if(!r)throw Error('Room not found');s=r.seats.length}
 if(m.type==='rejoin'){s=r.seats.findIndex(x=>x.token===p.playerToken);if(s<0)throw Error('Invalid player token');const old=r.seats[s];if(old.disconnectedAt!==undefined&&this.now()-old.disconnectedAt>this.grace)throw Error('Reconnect expired; seat is automated');if(old.peer){this.bindings.delete(old.peer);old.peer.close?.()}old.peer=peer;old.disconnectedAt=undefined;old.lastSeq=seq}
 else {if(s>=3||r.game)throw Error('Room full');const active=abilities.includes(p.active)?p.active:'A02';r.seats.push({token:randomUUID(),peer,active,lastSeq:seq})}
 this.bindings.set(peer,{room:r,seat:s});r.updated=this.now();
 if(r.seats.length===3&&!r.game)this.start(r);this.broadcast(r);return;
 }
 const b=this.bindings.get(peer);if(!b)throw Error('Join a room first');const {room:r,seat:s}=b,owner=r.seats[s];if(seq<=owner.lastSeq)throw Error('Duplicate sequence');owner.lastSeq=seq;
 if(m.type!=='action')throw Error('Unknown message');if(p.revision!==r.revision)throw Error('State changed; try again');this.action(r,s,p.action);this.broadcast(r);
 }catch(e){this.send(peer,'error',seq,{message:e instanceof Error?e.message:String(e)});const b=this.bindings.get(peer);if(b)this.state(b.room,b.seat,seq)}}
 start(r:Room){r.game=createGame(randomUUID(),r.seats[0].active);r.seats.forEach((s,i)=>{r.game!.players[i].active=s.active;r.game!.players[i].name='玩家'+(i+1)});r.game.log=['联机三麻 · 服务端权威'];r.revision++;r.choices={};r.peek={}}
 action(r:Room,s:number,raw:any){const g=r.game;if(!g)throw Error('Waiting for three players');if(!raw||typeof raw.type!=='string')throw Error('Invalid action');const a={...raw} as Action,l=legal(g,s);
 if(a.type==='ability'&&a.target!==undefined){if(!Number.isInteger(a.target)||a.target<0||a.target>2)throw Error('Invalid target');a.target=(a.target+s)%3}
 if(g.phase==='response'){
 if(s===g.lastDiscard?.seat||r.choices[s])throw Error('Not your response');if(!['pass','ron','pon','kan'].includes(a.type))throw Error('Invalid response');if(a.type!=='pass'&&!l[a.type as 'ron'|'pon'|'kan'])throw Error('Illegal response');r.choices[s]=a.type as ResponseChoice;
 // Keep the revision stable while simultaneous responses are collected.
 this.advance(r);return;
 }
 if(a.type==='next'){if(g.phase!=='end'||g.matchEnded||s!==0)throw Error('Only host can start next hand');}
 else {if(g.phase!=='self'||g.turn!==s)throw Error('Not your turn');if(a.type==='discard'){if(!Number.isInteger(a.tile)||!g.players[s].hand.includes(a.tile)||g.players[s].riichi&&a.tile!==g.drawn||kind(a.tile)===g.noDiscardKind||a.riichi&&!l.riichiTiles.includes(a.tile))throw Error('Illegal discard')}
 else if(!['ability','tsumo','nuki','kan'].includes(a.type)||!l[a.type as 'ability'|'tsumo'|'nuki'|'kan'])throw Error(a.type==='kan'&&g.players[s].riichi?riichiKanReason(g,s)??'Illegal action':'Illegal action');
 if(a.type==='ability'&&a.suit!==undefined&&!['p','s'].includes(a.suit))throw Error('Invalid suit');}
 r.game=actSeat(g,a,s);if(a.type==='ability'&&g.players[s].active==='A02'&&g.peek){r.peek[s]=g.peek;g.peek=undefined;r.game.peek=undefined}
 if(a.type==='next'){r.seats.forEach((x,i)=>{r.game!.players[i].active=x.active;r.game!.players[i].name='玩家'+(i+1)});r.peek={};r.game.log=['联机下一局']}
 r.revision++;r.updated=this.now();r.choices={};this.advance(r);
 }
 advance(r:Room){const g=r.game;if(!g||g.phase!=='response')return;const others=[0,1,2].filter(s=>s!==g.lastDiscard!.seat);for(const s of others){const l=legal(g,s);if(!l.ron&&!l.pon&&!l.kan)r.choices[s]='pass'}if(others.every(s=>r.choices[s])){r.game=resolveResponses(g,r.choices);r.choices={};r.revision++;r.updated=this.now()}}
 snapshot(r:Room,s:number){const g=r.game;let view:any=null,l:any=null;if(g){const rotate=(n:number)=>(n-s+3)%3;const order=[s,(s+1)%3,(s+2)%3];const {rng,abilityRng,...rest}=g;view={...rest,seed:'服务端保密',players:order.map(i=>({...g.players[i],hand:i===s?[...g.players[i].hand]:g.players[i].hand.map(()=>-1)})),wall:g.wall.map(()=>-1),dead:g.dead.map((t,i)=>i<2*(g.kans+1)&&i%2===0?t:-1),turn:rotate(g.turn),dealer:rotate(g.dealer),lastDiscard:g.lastDiscard?{...g.lastDiscard,seat:rotate(g.lastDiscard.seat)}:undefined,drawn:g.turn===s?g.drawn:undefined,peek:r.peek[s],active:g.players[s].active,pendingRiichi:g.pendingRiichi===undefined?undefined:rotate(g.pendingRiichi),result:g.result?{...g.result,deltas:order.map(i=>g.result!.deltas[i])}:undefined};l=r.choices[s]?blank:legal(g,s)}return {roomId:r.id,playerToken:r.seats[s].token,seat:s,revision:r.revision,players:r.seats.map(x=>({connected:!!x.peer})),game:view,legal:l}}
 state(r:Room,s:number,seq=0){const p=r.seats[s].peer;if(p)this.send(p,'state',seq,this.snapshot(r,s))}
 broadcast(r:Room){r.seats.forEach((_,s)=>this.state(r,s))}
 exportState(){return JSON.stringify([...this.rooms.values()].map(r=>({...r,seats:r.seats.map(({peer,...s})=>s)})))}
 restoreState(raw:string){const rows=JSON.parse(raw) as Room[];if(rows.length!==1||!rows[0].id||!rows[0].seats.length)throw Error('Invalid room snapshot');for(const r of rows){if(r.game){r.game.rng=RNG.restore(r.game.rng);r.game.abilityRng=RNG.restore(r.game.abilityRng);const g=r.game,tiles=[...g.wall,...g.dead,...g.players.flatMap(p=>[...p.hand,...p.river,...p.nuki,...p.melds.flatMap(m=>m.tiles)])];if(tiles.length!==108||new Set(tiles).size!==108||tiles.some(t=>!Number.isInteger(t)||t<0||t>=108)||g.players.length!==3||g.players.reduce((n,p)=>n+p.points,0)+g.pot!==105000)throw Error('Invalid tiles');}r.seats.forEach(s=>{s.peer=undefined;s.disconnectedAt??=this.now()});this.rooms.set(r.id,r)}}
 shutdown(){for(const r of this.rooms.values())for(const seat of r.seats)if(seat.peer)this.send(seat.peer,'host-left',0,{message:'房主已离开'});this.bindings.clear();this.rooms.clear()}
 disconnect(peer:Peer){const b=this.bindings.get(peer);if(!b)return;this.bindings.delete(peer);const x=b.room.seats[b.seat];x.peer=undefined;x.disconnectedAt=this.now();this.broadcast(b.room)}
 tick(){for(const r of this.rooms.values()){
 if(r.seats.every(x=>!x.peer)&&this.now()-Math.max(...r.seats.map(x=>x.disconnectedAt??r.updated))>3600000){this.rooms.delete(r.id);continue}
 const g=r.game;if(!g||g.phase==='end')continue;let changed=false;
 for(let s=0;s<3;s++){const x=r.seats[s];if(x.peer||x.disconnectedAt===undefined||this.now()-x.disconnectedAt<this.grace)continue;
 if(r.game!.phase==='response'&&r.game!.lastDiscard?.seat!==s&&!r.choices[s]){const l=legal(r.game!,s);r.choices[s]=l.ron?'ron':'pass';changed=true;this.advance(r)}
 else if(r.game!.phase==='self'&&r.game!.turn===s){const q=r.game!,l=legal(q,s),p=q.players[s];const a:Action=l.tsumo?{type:'tsumo'}:l.kan?{type:'kan'}:{type:'discard',tile:p.hand.find(t=>(!p.riichi||t===q.drawn)&&kind(t)!==q.noDiscardKind)!};this.action(r,s,a);changed=true}
 }if(changed)this.broadcast(r);
 }}
}
