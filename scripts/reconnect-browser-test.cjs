const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs');
const assert=require('node:assert/strict');
const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4182','--strictPort'],{stdio:'pipe',windowsHide:true});
const url='http://127.0.0.1:4182/superpower-mahjong/';
const report={consoleErrors:[],pageErrors:[]};
let browser;
async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('vite preview did not start')}
function watch(page){page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())})}
async function main(){
 await waitServer();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const hostContext=await browser.newContext(),guestContext=await browser.newContext();
 const host=await hostContext.newPage(),guest=await guestContext.newPage(),third=await guestContext.newPage();
 const pages=[host,guest,third];console.log('P2P contexts opened');
 for(const p of pages){watch(p);await p.goto(url);await p.getByRole('button',{name:'联机 · 与好友玩'}).click()}
 await host.getByRole('button',{name:'创建房间',exact:true}).click();
 await host.waitForFunction(()=>document.querySelector('.waiting h3')?.textContent.includes('sanma-'),{},{timeout:30000});
 const roomId=(await host.locator('.waiting h3').innerText()).replace('房间 ','');report.roomId=roomId;
 for(const p of [guest,third]){await p.getByLabel('房间号',{exact:true}).fill(roomId);await p.getByRole('button',{name:'加入房间',exact:true}).click()}
 for(const p of pages)await p.locator('.hand .tile').first().waitFor({timeout:30000});
 const indicators=await Promise.all(pages.map(p=>p.locator('.indicators .tile').allTextContents()));
 assert.deepEqual(indicators[0],indicators[1]);assert.deepEqual(indicators[1],indicators[2]);
 const hands=await Promise.all(pages.map(p=>p.locator('.hand .tile').allTextContents()));
 assert.deepEqual(hands.map(h=>h.length),[14,13,13]);
 report.deal={handCounts:hands.map(h=>h.length),indicators:indicators[0],sameRoom:true,privateHands:true};
 const tile=host.locator('.hand .tile:enabled').first(),name=await tile.getAttribute('aria-label');
 await tile.click();await tile.click();
 for(const [p,river] of [[host,'.ownriver'],[guest,'.opponents .seat:last-child .river'],[third,'.opponents .seat:first-child .river']]){
  await p.waitForFunction(({river,name})=>Array.from(document.querySelectorAll(river+' .tile')).some(t=>t.getAttribute('aria-label')===name),{river,name});
 }
 report.sharedDiscard=name;
 const board=async p=>({hand:await p.locator('.hand .tile').allTextContents(),rivers:await p.locator('.river').allTextContents()});
 const beforeRefresh=await board(guest);
 await guest.reload();await guest.locator('.hand .tile').first().waitFor({timeout:30000});
 assert.deepEqual(await board(guest),beforeRefresh);report.joinerRefresh={sameHand:true,sameRivers:true};console.log('Joiner refresh passed');
 const hostBefore=await board(host);
 await host.reload();await host.locator('.hand .tile').first().waitFor({timeout:35000});
 assert.deepEqual(await board(host),hostBefore);
 await guest.waitForFunction(()=>document.querySelector('.connection')?.textContent.includes('已连接'),{},{timeout:35000});
 await third.waitForFunction(()=>document.querySelector('.connection')?.textContent.includes('已连接'),{},{timeout:35000});
 assert.deepEqual(await board(guest),beforeRefresh);report.hostRefresh={sameRoom:true,sameHand:true,sameRivers:true,joinersReconnected:true};console.log('Host refresh passed');
 if(process.argv.includes('--refresh-only')){
  await host.evaluate(()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.startsWith('mj.p2p.host.'))localStorage.removeItem(k)}});
  await host.reload();await host.getByRole('alert').filter({hasText:'房间已失效，请重新建房'}).waitFor({timeout:30000});report.invalidSnapshotVisible=true;
  const bundle=await require('esbuild').build({entryPoints:['scripts/riichi-browser-fixture.ts'],bundle:true,write:false,format:'iife',globalName:'RiichiFixture',platform:'browser'});await host.addScriptTag({content:bundle.outputFiles[0].text});report.localRuleFixture=await host.evaluate(()=>RiichiFixture.run());
  assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);report.ok=true;return;
 }
 async function step(p){
  if(await p.locator('.settlement').count())return;
  for(const label of ['自摸','荣和','跳过']){const b=p.getByRole('button',{name:label,exact:true});if(await b.count()&&await b.isEnabled()){await b.click();return}}
  const t=p.locator('.hand .tile:enabled').last();if(await t.count()){await t.click();await t.click()}
 }
 for(let i=0;i<600;i++){if(i%50===0)console.log('P2P steps',i);if((await Promise.all(pages.map(p=>p.locator('.settlement').count()))).every(Boolean))break;for(const p of pages)await step(p);await host.waitForTimeout(60)}
 report.p2pResults=await Promise.all(pages.map(p=>p.locator('.settlement h2').innerText({timeout:10000})));assert.equal(new Set(report.p2pResults).size,1);
 await host.getByRole('button',{name:'退出房间',exact:true}).click();
 for(const p of [guest,third])await p.getByRole('alert').filter({hasText:'房主已离开'}).waitFor();
 report.hostLeftVisible=true;
 // Also exercise abrupt host loss: no graceful shutdown packet is sent.
 await host.getByRole('button',{name:'创建房间',exact:true}).click();
 await host.waitForFunction(()=>document.querySelector('.waiting h3')?.textContent.includes('sanma-'));
 const secondId=(await host.locator('.waiting h3').innerText()).replace('房间 ','');
 await guest.getByRole('button',{name:'退出房间',exact:true}).click();
 await guest.getByLabel('房间号',{exact:true}).fill(secondId);await guest.getByRole('button',{name:'加入房间',exact:true}).click();
 await guest.waitForFunction(()=>document.querySelector('.waiting h3')?.textContent.includes('sanma-'));
 await hostContext.close();await guest.getByRole('alert').filter({hasText:'房主已离开'}).waitFor({timeout:25000});
 report.abruptHostLeftVisible=true;
 const local=await guestContext.newPage();watch(local);await local.goto(url);
 await local.getByRole('button',{name:'入座开局 →'}).click();await local.locator('.hand .tile').first().waitFor();
 let steps=0;
 for(;steps<500;steps++){
  if(await local.locator('.settlement').count())break;
  let acted=false;
  for(const label of ['自摸','荣和','跳过']){const b=local.getByRole('button',{name:label,exact:true});if(await b.count()&&await b.isEnabled()){await b.click();acted=true;break}}
  if(!acted){const t=local.locator('.hand .tile:enabled').last();if(await t.count()){await t.click();await t.click()}}
  await local.waitForTimeout(250);
 }
 console.log('Local first round finished');report.localRound={steps,result:await local.locator('.settlement h2').innerText({timeout:10000})};
 const before=await local.locator('.topline').innerText();
 const result=await local.locator('.settlement').innerText();
 await local.getByRole('button',{name:'下一局 →',exact:true}).click();await local.locator('.settlement').waitFor({state:'detached'});
 const after=await local.locator('.topline').innerText();
 const dealer=before.match(/庄家 (.*?) ·/)[1];
 const repeat=result.includes(dealer+'：')||result.includes(dealer+' 听牌');
 const beforeNo=before.match(/东([一二三四])局/)[1];const afterNo=after.match(/东([一二三四])局/)[1];
 assert.equal(afterNo,repeat?beforeNo:'一二三四'['一二三四'.indexOf(beforeNo)+1]);
 assert.equal(after.match(/庄家 (.*?) ·/)[1]===dealer,repeat);
 for(let i=0;i<600;i++){if(await local.locator('.settlement').count())break;await step(local);await local.waitForTimeout(250)}
 report.localSecondRound={before,after,repeat,result:await local.locator('.settlement h2').innerText({timeout:10000})};
 const bundle=await require('esbuild').build({entryPoints:['scripts/riichi-browser-fixture.ts'],bundle:true,write:false,format:'iife',globalName:'RiichiFixture',platform:'browser'});await local.addScriptTag({content:bundle.outputFiles[0].text});report.localRuleFixture=await local.evaluate(()=>RiichiFixture.run());
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);
 report.ok=true;
}
main().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();preview.kill();fs.writeFileSync(process.argv.includes('--refresh-only')?'refresh-browser-results.json':'reconnect-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))});
