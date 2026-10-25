import {it,expect} from 'vitest';
import {Rooms,type Peer} from './rooms';

class FakeTransport implements Peer {
 messages:any[]=[];
 send(data:string){this.messages.push(JSON.parse(data))}
 get state(){return this.messages.filter(m=>m.type==='state').at(-1)?.payload}
}
function setup(){
 const rooms=new Rooms(undefined,undefined,()=> 'sanma-fake-host');
 const clients=[new FakeTransport(),new FakeTransport(),new FakeTransport()];
 rooms.receive(clients[0],{type:'create',seq:1,payload:{}});
 for(const c of clients.slice(1))rooms.receive(c,{type:'join',seq:1,payload:{roomId:clients[0].state.roomId}});
 return {rooms,clients,r:rooms.rooms.get('sanma-fake-host')!};
}
it('host and joiners share the same deal with seat-private hands and consistent public state',()=>{
 const {rooms,clients,r}=setup();
 for(let seat=0;seat<3;seat++){
  const state=clients[seat].state;
  expect(state.roomId).toBe('sanma-fake-host');
  expect(state.game.players[0].hand).toEqual(r.game!.players[seat].hand);
  expect(state.game.players[1].hand.every((t:number)=>t===-1)).toBe(true);
  expect(state.game.dead).toEqual(clients[0].state.game.dead);
  expect(state.game.wall).toEqual(clients[0].state.game.wall);
  expect(state.revision).toBe(r.revision);
 }
 const tile=r.game!.players[0].hand[0];
 rooms.receive(clients[0],{type:'action',seq:2,payload:{revision:r.revision,action:{type:'discard',tile}}});
 for(let seat=0;seat<3;seat++)expect(clients[seat].state.game.players[(3-seat)%3].river).toContain(tile);
});
it('rejects malformed, forged, stale, duplicate and illegal messages without advancing the game',()=>{
 const {rooms,clients,r}=setup();const before=JSON.stringify(r.game),revision=r.revision;
 for(const m of [null,{seq:-1},{seq:2,type:'unknown'},{seq:3,type:'action',payload:{revision:-1,action:{type:'discard',tile:0}}},{seq:4,type:'action',payload:{revision,action:{type:'discard',tile:9999}}},{seq:4,type:'action',payload:{revision,action:{type:'tsumo'}}}]){
  const errors=clients[0].messages.filter(m=>m.type==='error').length;
  rooms.receive(clients[0],m);
  expect(clients[0].messages.filter(m=>m.type==='error')).toHaveLength(errors+1);
  expect(JSON.stringify(r.game)).toBe(before);expect(r.revision).toBe(revision);
 }
});
it('broadcasts guest disconnection and host departure over fake transports',()=>{
 const {rooms,clients}=setup();rooms.disconnect(clients[2]);
 expect(clients[1].state.players[2].connected).toBe(false);
 rooms.shutdown();
 for(const c of clients.slice(0,2))expect(c.messages.at(-1)).toEqual({type:'host-left',seq:0,payload:{message:'房主已离开'}});
 expect(rooms.rooms.size).toBe(0);expect(rooms.bindings.size).toBe(0);
});
it('rejects attempts to create a second room on the same browser authority',()=>{
 const {rooms,r}=setup();const stranger=new FakeTransport();
 rooms.receive(stranger,{type:'create',seq:1,payload:{}});
 expect(stranger.messages.at(-1).type).toBe('error');
 expect(rooms.rooms.size).toBe(1);expect(rooms.rooms.get(r.id)).toBe(r);
});
