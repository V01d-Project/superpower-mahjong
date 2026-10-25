import {WebSocketServer,WebSocket} from 'ws';
import {Rooms,type Peer} from './rooms';
export function startServer(port=Number(process.env.PORT??8787)){
 const rooms=new Rooms(),wss=new WebSocketServer({port,maxPayload:8192});
 wss.on('connection',ws=>{let alive=true,count=0,window=Date.now();const peer:Peer={send:data=>{if(ws.readyState===WebSocket.OPEN)ws.send(data)},close:()=>ws.close(4001,'Seat reconnected')};
 ws.on('pong',()=>alive=true);const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return}alive=false;ws.ping()},15000);
 ws.on('message',data=>{if(Date.now()-window>1000){window=Date.now();count=0}if(++count>30){ws.close(1008,'Rate limit');return}try{rooms.receive(peer,JSON.parse(data.toString()))}catch{rooms.send(peer,'error',0,{message:'Invalid JSON'})}});
 ws.on('close',()=>{clearInterval(heartbeat);rooms.disconnect(peer)});ws.on('error',()=>ws.terminate());
 });
 const timer=setInterval(()=>rooms.tick(),1000);wss.on('close',()=>clearInterval(timer));return {wss,rooms};
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/server/index.ts')){const {wss}=startServer();wss.on('listening',()=>console.log('Mahjong WebSocket listening',wss.address()));}
