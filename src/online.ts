import type {Action,Game,Legal} from './engine';
declare global { interface Window { MJ_SERVER?:string } }
export interface RoomState {roomId:string;playerToken:string;seat:number;revision:number;players:{connected:boolean}[];game:Game|null;legal:Legal|null}
interface Credential {server:string;roomId:string;playerToken:string}
const key='mj.room';
export function savedRoom():Credential|null {try {const c=JSON.parse(sessionStorage.getItem(key)||'null');return c&&typeof c.server==='string'&&typeof c.roomId==='string'&&typeof c.playerToken==='string'?c:null}catch{return null}}
export function serverAddress(){try{return window.MJ_SERVER||localStorage.getItem('MJ_SERVER')||''}catch{return window.MJ_SERVER||''}}
export class OnlineTransport {
 private ws:WebSocket|null=null; private timer:ReturnType<typeof setTimeout>|undefined; private heartbeat:ReturnType<typeof setInterval>|undefined; private stopped=true; private seq=0; private attempt=0; private credential:Credential|null=null; private initial:{type:string;payload:unknown}|null=null; private lastMessage=0; private ready=false;
 constructor(private state:(s:RoomState)=>void,private status:(s:string,ready:boolean)=>void,private error:(s:string)=>void){}
 connect(server:string,type:'create'|'join'|'rejoin',payload:unknown){
  const url=new URL(server);if(!['ws:','wss:'].includes(url.protocol))throw new Error('请输入 ws:// 或 wss:// 服务器地址');if(location.protocol==='https:'&&url.protocol!=='wss:')throw new Error('HTTPS 页面需要 wss:// 地址');
  this.disconnect(type==='rejoin'?false:true);this.stopped=false;this.attempt=0;this.credential=type==='rejoin'?{server,...payload as {roomId:string;playerToken:string}}:null;this.initial={type,payload};try{localStorage.setItem('MJ_SERVER',server)}catch{}this.open(server);
 }
 private open(server:string){
  if(this.stopped)return;this.ready=false;this.status(this.attempt?'连接中断，正在重连…':'正在连接…',false);
  let ws:WebSocket;try{ws=new WebSocket(server)}catch(e){this.error(String(e));this.retry(server);return}this.ws=ws;
  const timeout=setTimeout(()=>{if(this.ws===ws&&ws.readyState!==WebSocket.OPEN)ws.close()},10000);
  ws.onopen=()=>{if(this.ws!==ws)return;clearTimeout(timeout);this.lastMessage=Date.now();this.status('已连接，等待房间确认…',false);const c=this.credential;const request=c?{type:'rejoin',payload:{roomId:c.roomId,playerToken:c.playerToken}}:this.initial;if(request)this.packet(request.type,request.payload);this.heartbeat=setInterval(()=>{if(Date.now()-this.lastMessage>45000)ws.close();else this.packet('ping',{})},15000)};
  ws.onmessage=e=>{if(this.ws!==ws)return;this.lastMessage=Date.now();try{const m=JSON.parse(e.data);if(m.type==='state'){const s=m.payload as RoomState;this.credential={server,roomId:s.roomId,playerToken:s.playerToken};try{sessionStorage.setItem(key,JSON.stringify(this.credential))}catch{}this.attempt=0;this.ready=true;this.status('已连接',true);this.state(s)}else if(m.type==='error')this.error(String(m.payload?.message||'服务器拒绝了请求'))}catch{this.error('服务器消息格式错误')}};
  ws.onerror=()=>{if(this.ws===ws)this.error('无法连接服务器，请检查地址和网络')};
  ws.onclose=()=>{clearTimeout(timeout);if(this.ws!==ws)return;clearInterval(this.heartbeat);this.ready=false;this.ws=null;if(!this.stopped)this.retry(server)};
 }
 private retry(server:string){this.status('连接中断，正在重连…',false);this.timer=setTimeout(()=>this.open(server),Math.min(1000*2**this.attempt++,10000))}
 private packet(type:string,payload:unknown){if(this.ws?.readyState!==WebSocket.OPEN)return false;this.ws.send(JSON.stringify({type,seq:++this.seq,payload}));return true}
 action(action:Action,revision:number){if(!this.ready||!this.packet('action',{action,revision}))throw new Error('连接尚未恢复，请稍候再操作')}
 disconnect(clear=true){this.stopped=true;this.ready=false;clearTimeout(this.timer);clearInterval(this.heartbeat);const ws=this.ws;this.ws=null;ws?.close();this.credential=null;if(clear)try{sessionStorage.removeItem(key)}catch{}}
}
