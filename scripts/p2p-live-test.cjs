// Live-site P2P acceptance: drives the published GitHub Pages build in headless Chrome.
// Three independent browser contexts, real public PeerJS broker for signalling.
// Usage: node scripts/p2p-live-test.cjs [url]
const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const url=process.argv[2]||'https://v01d-project.github.io/superpower-mahjong/';
const report={url,consoleErrors:[],pageErrors:[]};
let browser;
function watch(page){page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())})}
async function main(){
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const ctx=[];
  for(let i=0;i<3;i++)ctx.push(await browser.newContext());
  const pages=[];
  for(const c of ctx)pages.push(await c.newPage());
  for(const p of pages){watch(p);await p.goto(url,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'联机 · 与好友玩'}).click()}
  await pages[0].getByRole('button',{name:'创建房间',exact:true}).click();
  await pages[0].waitForFunction(()=>document.querySelector('.waiting h3')?.textContent.includes('sanma-'),{},{timeout:40000});
  const roomId=(await pages[0].locator('.waiting h3').innerText()).replace('房间 ','');report.roomId=roomId;
  for(const p of [pages[1],pages[2]]){await p.getByLabel('房间号',{exact:true}).fill(roomId);await p.getByRole('button',{name:'加入房间',exact:true}).click()}
  for(const p of pages)await p.locator('.hand .tile').first().waitFor({timeout:45000});
  const indicators=await Promise.all(pages.map(p=>p.locator('.indicators .tile').allTextContents()));
  assert.deepEqual(indicators[0],indicators[1]);assert.deepEqual(indicators[1],indicators[2]);
  const hands=await Promise.all(pages.map(p=>p.locator('.hand .tile').allTextContents()));
  assert.deepEqual(hands.map(h=>h.length),[14,13,13]);
  report.deal={handCounts:hands.map(h=>h.length),indicators:indicators[0],sameRoom:true,privateHands:true};
  const tile=pages[0].locator('.hand .tile:enabled').first();const name=await tile.getAttribute('aria-label');
  await tile.click();await tile.click();
  for(const [p,river] of [[pages[0],'.ownriver'],[pages[1],'.opponents .seat:last-child .river'],[pages[2],'.opponents .seat:first-child .river']]){
    await p.waitForFunction(({river,name})=>Array.from(document.querySelectorAll(river+' .tile')).some(t=>t.getAttribute('aria-label')===name),{river,name},{timeout:30000});
  }
  report.sharedDiscard=name;
  await pages[0].getByRole('button',{name:'退出房间',exact:true}).click();
  for(const p of [pages[1],pages[2]])await p.getByRole('alert').filter({hasText:'房主已离开'}).waitFor({timeout:25000});
  report.hostLeftVisible=true;
  assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);
  report.ok=true;
}
main().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();fs.writeFileSync('p2p-live-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))});
