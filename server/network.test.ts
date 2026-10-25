import {it,expect} from 'vitest';
import {WebSocket} from 'ws';
import {startServer} from './index';
it('three real sockets create/join, synchronize a discard, and rejoin',async()=>{
 const {wss}=startServer(0);await new Promise<void>(r=>wss.once('listening',r));const address=wss.address();if(typeof address==='string'||!address)throw Error('No address');
 const sockets:WebSocket[]=[],messages:any[][]=[[],[],[],[]];
 const wait=async(fn:()=>boolean)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timeout')};
 const connect=async(i:number)=>{const ws=new WebSocket('ws://127.0.0.1:'+address.port);sockets.push(ws);ws.on('message',d=>messages[i].push(JSON.parse(d.toString())));await new Promise<void>(r=>ws.once('open',r));return ws};
 const state=(i:number)=>messages[i].filter(m=>m.type==='state').at(-1)?.payload;
 const send=(ws:WebSocket,type:string,seq:number,payload:any)=>ws.send(JSON.stringify({type,seq,payload}));
 try{const a=await connect(0);send(a,'create',1,{});await wait(()=>!!state(0));const roomId=state(0).roomId,playerToken=state(0).playerToken;const b=await connect(1),c=await connect(2);send(b,'join',1,{roomId});send(c,'join',1,{roomId});await wait(()=>[0,1,2].every(i=>!!state(i)?.game));const tile=state(0).game.players[0].hand[0];send(a,'action',2,{revision:state(0).revision,action:{type:'discard',tile}});await wait(()=>[0,1,2].every(i=>state(i).game.players.some((p:any)=>p.river.includes(tile))));expect(state(1).game.players[2].river).toContain(tile);a.close();await new Promise<void>(r=>a.once('close',r));const d=await connect(3);send(d,'rejoin',1,{roomId,playerToken});await wait(()=>!!state(3));expect(state(3).game.players[0].river).toContain(tile);expect(state(3).seat).toBe(0);
 }finally{for(const ws of sockets)ws.terminate();await new Promise<void>(r=>wss.close(()=>r()))}
});
