// Live check: round label (east round / dealer) must be visible in the published build.
const {chromium}=require('playwright');
const url=process.argv[2]||'https://v01d-project.github.io/superpower-mahjong/';
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'入座开局 →'}).click();
  await page.locator('.hand .tile').first().waitFor({timeout:30000});
  const header=await page.locator('header, .tablehead, .round').first().innerText().catch(()=>'');
  const body=await page.locator('body').innerText();
  const round=/东[一二三四]\s*局/.test(body);
  const dealer=/庄/.test(body);
  console.log(JSON.stringify({url,roundLabelVisible:round,dealerVisible:dealer,headerSnippet:header.slice(0,80),errors,ok:round&&dealer&&errors.length===0},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
