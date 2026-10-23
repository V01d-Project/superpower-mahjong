import {createGame,act,aiStep,legal,type Game,type Action,type Ability} from './engine';
let game:Game|undefined;
self.onmessage=(e:MessageEvent<{id:number,type:'create'|'act'|'ai',seed?:string,active?:Ability,lucks?:number[],action?:Action}>)=>{try{const q=e.data;if(q.type==='create')game=createGame(q.seed!,q.active,q.lucks);else if(game)game=q.type==='ai'?aiStep(game):act(game,q.action!);if(!game)throw Error('No active game');self.postMessage({id:q.id,game,legal:legal(game)});}catch(e){self.postMessage({id:e instanceof Object&&'id' in e?e.id:0,error:String(e)})}};
