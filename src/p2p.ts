import PeerJS, {type DataConnection} from 'peerjs';
import {Rooms,type Peer} from './rooms';
import type {Action} from './engine';
import type {RoomState} from './online';

/** Browser authority; the same room protocol is used over ws and DataChannels. */
export class P2PTransport {
 private peer?:PeerJS;
 private connection?:DataConnection;
 private rooms?:Rooms;
 private owner?:Peer;
 private seq=0;
 private ready=false;
 private timer?:ReturnType<typeof setInterval>;
 private timeout?:ReturnType<typeof setTimeout>;
 private channels=new Set<DataConnection>();
 private lastMessage=0;
 private credential?:{roomId:string;playerToken:string;host:boolean};
 private retry?:ReturnType<typeof setTimeout>;
 private recoveryUntil=0;
 private ended=false;
 private persist(){if(this.rooms){const id=this.rooms.rooms.keys().next().value;if(id)localStorage.setItem('mj.p2p.host.'+id,this.rooms.exportState())}}
 constructor(private state:(s:RoomState)=>void,private status:(s:string,ready:boolean)=>void,private error:(s:string)=>void){}
 connect(_server:string,type:'create'|'join'|'rejoin',payload:unknown){
  this.disconnect(false);this.ended=false;const p=payload as {roomId?:string;active?:string;playerToken?:string;host?:boolean};
  const hosting=type==='create'||type==='rejoin'&&p.host===true;
  const roomId=hosting?(p.roomId??'sanma-'+crypto.randomUUID()):undefined;
  if(type==='join'&&!/^sanma-[a-z0-9-]{8,80}$/i.test(p.roomId??''))throw Error('请输入完整 P2P 房间号');
  this.status('正在连接 P2P 信令…',false);
  const peer=new PeerJS(roomId??'sanma-'+crypto.randomUUID());this.peer=peer;
  const fail=(message:string)=>{if(this.peer!==peer)return;this.ready=false;this.status(message,false);this.error(message)};
  const recover=()=>{if(this.peer!==peer||this.ended)return;fail('房主连接中断，正在恢复…');const c=this.credential??(type==='rejoin'&&!hosting?p:undefined);this.recoveryUntil ||= Date.now()+20000;if(c&&Date.now()<this.recoveryUntil){clearTimeout(this.retry);this.retry=setTimeout(()=>this.connect('','rejoin',c),1000)}else fail('房间已失效，请重新建房')};
  this.timeout=setTimeout(()=>fail(type==='rejoin'?'房间已失效，请重新建房':'P2P 连接超时，请检查网络后退出重试'),20000);
  peer.on('error',e=>{if(type==='rejoin'&&!hosting)recover();else fail(type==='rejoin'?'房间已失效，请重新建房':'P2P 连接失败：'+e.message)});
  peer.on('disconnected',()=>{if(this.peer!==peer)return;this.status('信令连接中断，正在恢复…',this.ready);peer.reconnect()});
  peer.on('close',()=>fail(type==='create'?'P2P 房间已关闭':'房主已离开'));
  peer.on('open',id=>{
   if(this.peer!==peer)return;
   if(this.rooms||this.connection){this.status('信令已恢复',this.ready);return}
   if(hosting){
    const rooms=new Rooms(undefined,undefined,()=>id);this.rooms=rooms;
    if(type==='rejoin'){try{rooms.restoreState(localStorage.getItem('mj.p2p.host.'+id)??'');if(rooms.rooms.get(id)?.seats[0].token!==p.playerToken)throw Error('Room mismatch')}catch{this.rooms=undefined;fail('房间已失效，请重新建房');return}}
    this.owner={send:data=>this.message(JSON.parse(data))};
    rooms.receive(this.owner,{type:type==='rejoin'?'rejoin':'create',seq:++this.seq,payload:p});
    this.timer=setInterval(()=>{rooms.tick();try{this.persist()}catch{fail('房间已失效，请重新建房')}},1000);
   }else{
    const c=peer.connect(p.roomId!,{reliable:true,serialization:'json'});this.connection=c;
    c.on('open',()=>{if(this.peer!==peer)return;this.lastMessage=Date.now();c.send({type:type==='rejoin'?'rejoin':'join',seq:++this.seq,payload:p});
     this.timer=setInterval(()=>{if(Date.now()-this.lastMessage>15000){fail('房主已离开（连接超时）');return}c.send({type:'ping',seq:++this.seq,payload:{}})},5000);
    });
    c.on('data',m=>{if(this.peer===peer)this.message(m)});
    c.on('close',recover);
    c.on('error',recover);
   }
  });
  peer.on('connection',c=>{
   if(this.peer!==peer||!hosting||!this.rooms){c.close();return}
   const rooms=this.rooms;this.channels.add(c);let count=0,start=Date.now();
   const remote:Peer={send:data=>{if(c.open)c.send(JSON.parse(data))},close:()=>c.close()};
   c.on('data',data=>{if(Date.now()-start>1000){start=Date.now();count=0}if(++count>30||JSON.stringify(data)?.length>8192){c.close();return}rooms.receive(remote,data)});
   const close=()=>{this.channels.delete(c);rooms.disconnect(remote)};
   c.on('close',close);c.on('error',()=>{close();c.close()});
  });
 }
 private message(raw:unknown){
  const m=raw as {type?:string;payload?:any};this.lastMessage=Date.now();
  if(m?.type==='state'){this.credential={roomId:m.payload.roomId,playerToken:m.payload.playerToken,host:!!this.rooms};try{this.persist();localStorage.setItem('mj.p2p.'+m.payload.playerToken,JSON.stringify({server:'p2p',...this.credential}));sessionStorage.setItem('mj.p2p.key','mj.p2p.'+m.payload.playerToken)}catch{this.ready=false;this.status('房间已失效，请重新建房',false);this.error('房间已失效，请重新建房');return}this.recoveryUntil=0;clearTimeout(this.timeout);this.ready=true;this.status('已连接 · P2P 房主裁定',true);this.state(m.payload)}
  else if(m?.type==='error'){if(this.rooms&&!this.ready){this.status('房间已失效，请重新建房',false);this.error('房间已失效，请重新建房')}else this.error(String(m.payload?.message))}
  else if(m?.type==='host-left'){this.ended=true;this.ready=false;this.status('房主已离开',false);this.error('房主已离开')}
 }
 action(action:Action,revision:number){
  if(!this.ready)throw Error('连接尚未恢复，请稍候再操作');
  const m={type:'action',seq:++this.seq,payload:{action,revision}};
  if(this.rooms&&this.owner)this.rooms.receive(this.owner,m);else if(this.connection?.open)this.connection.send(m);else throw Error('房主连接中断');
 }
 disconnect(clear=true){
  clearTimeout(this.retry);if(clear){try{const key=sessionStorage.getItem('mj.p2p.key');if(key)localStorage.removeItem(key);sessionStorage.removeItem('mj.p2p.key');if(this.rooms)for(const id of this.rooms.rooms.keys())localStorage.removeItem('mj.p2p.host.'+id)}catch{}}this.credential=undefined;
  clearTimeout(this.timeout);clearInterval(this.timer);this.ready=false;
  if(clear)this.rooms?.shutdown();if(this.owner)this.owner.send=()=>{};this.rooms=undefined;this.owner=undefined;
  const peer=this.peer;this.peer=undefined;this.connection?.close();this.connection=undefined;
  for(const c of this.channels)c.close();this.channels.clear();peer?.destroy();
 }
}
