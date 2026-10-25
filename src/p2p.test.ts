import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {P2PTransport} from './p2p';

const network=vi.hoisted(()=>({peers:new Map<string,any>(),drop:false}));
vi.mock('peerjs',async()=>{
 const {EventEmitter}=await import('node:events');
 class Channel extends EventEmitter {
  open=true;other?:Channel;
  send(data:unknown){if(this.open&&!network.drop)queueMicrotask(()=>this.other?.emit('data',structuredClone(data)))}
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other?.open){this.other.open=false;this.other.emit('close')}}
 }
 return {default:class extends EventEmitter {
  channels:Channel[]=[];
  constructor(public id:string){super();network.peers.set(id,this);queueMicrotask(()=>this.emit('open',id))}
  connect(id:string){const c=new Channel(),other=new Channel();c.other=other;other.other=c;this.channels.push(c);
   const target=network.peers.get(id);target.channels.push(other);target.emit('connection',other);
   queueMicrotask(()=>c.emit('open'));return c;
  }
  reconnect(){this.emit('open',this.id)}
  destroy(){for(const c of this.channels)c.close();network.peers.delete(this.id)}
 }};
});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
const transports:P2PTransport[]=[];
function client(){
 const states:any[]=[],statuses:{text:string;ready:boolean}[]=[],errors:string[]=[];
 const transport=new P2PTransport(s=>states.push(s),(text,ready)=>statuses.push({text,ready}),s=>errors.push(s));
 transports.push(transport);return {transport,states,statuses,errors,get state(){return states.at(-1)}};
}
beforeEach(()=>{vi.useFakeTimers();network.drop=false});
afterEach(()=>{for(const t of transports)t.disconnect();transports.length=0;network.peers.clear();vi.useRealTimers()});
async function table(){
 const host=client();host.transport.connect('','create',{});await flush();
 const guest=client(),third=client();
 for(const c of [guest,third])c.transport.connect('','join',{roomId:host.state.roomId});
 await flush();return {host,guest,third};
}
it('uses fake DataChannels for the same host and joiner deal, discard and illegal-action rejection',async()=>{
 const {host,guest,third}=await table();
 expect([host,guest,third].map(c=>c.state.game.players[0].hand.length)).toEqual([14,13,13]);
 expect(host.state.game.dead).toEqual(guest.state.game.dead);
 const revision=host.state.revision;
 guest.transport.action({type:'discard',tile:guest.state.game.players[0].hand[0]},revision);await flush();
 expect(guest.errors.at(-1)).toBe('Not your turn');expect(host.state.revision).toBe(revision);
 const tile=host.state.game.players[0].hand[0];host.transport.action({type:'discard',tile},revision);await flush();
 expect(host.state.game.players[0].river).toContain(tile);
 expect(guest.state.game.players[2].river).toContain(tile);
 expect(third.state.game.players[1].river).toContain(tile);
});
it('shows guest disconnection and tells both joiners when the host leaves',async()=>{
 const {host,guest,third}=await table();third.transport.disconnect();await flush();
 expect(host.state.players[2].connected).toBe(false);expect(guest.state.players[2].connected).toBe(false);
 host.transport.disconnect();await flush();expect(guest.errors).toContain('房主已离开');
 expect(guest.statuses.at(-1)?.ready).toBe(false);
 expect(()=>guest.transport.action({type:'pass'},0)).toThrow('连接尚未恢复');
});
it('detects a silent lost host by heartbeat timeout',async()=>{
 const {guest}=await table();network.drop=true;
 await vi.advanceTimersByTimeAsync(20000);await flush();
 expect(guest.errors.at(-1)).toBe('房主已离开（连接超时）');
 expect(guest.statuses.at(-1)?.ready).toBe(false);
});
it('signaling reconnect preserves the existing authoritative deal and connections',async()=>{
 const {host,guest}=await table();const game=structuredClone(guest.state.game);
 for(const peer of network.peers.values())peer.emit('disconnected');await flush();
 expect(guest.state.game).toEqual(game);expect(host.state.game.players[0].hand).toHaveLength(14);
});
