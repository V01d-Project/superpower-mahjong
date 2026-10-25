// Offline acceptance-rate grid and frozen-source independent validation.
const fs=require('fs'),path=require('path'),ts=require('typescript'),crypto=require('crypto');
const {Worker,isMainThread,workerData,parentPort}=require('worker_threads');
const root=path.join(__dirname,'..');
function stats(hist,n,sum,squares,success){const mean=sum/n,p=success/n,z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;const se=Math.sqrt((squares-sum*sum/n)/(n-1)/n);return {n,histogram:hist,mean,standardError:se,mean95:[mean-z*se,mean+z*se],atMostOne:p,wilson95:[center-half,center+half]};}
if(isMainThread){
 const mode=process.argv[2]||'train',n=Number(process.argv[3]||(mode==='train'?200:5000));
 if(!['train','refine','negative','fine','validate'].includes(mode)||!Number.isInteger(n)||n<(mode==='validate'?2000:200))throw Error('Invalid mode or insufficient sample size');
 const jobs=mode==='train'?[...[.18,.26,.34].flatMap(far=>[.08,.12,.16].map(two=>({luck:100,acceptance:{far,two,near:.02,negative:.45}}))),...[.35,.45,.55].map(negative=>({luck:0,acceptance:{far:.26,two:.12,near:.02,negative}})),{luck:50}]:mode==='fine'?[.15,.155,.16].map(two=>({luck:100,acceptance:{far:.20,two,near:.02,negative:.40}})):mode==='negative'?[.40,.45,.50,.55].map(negative=>({luck:0,acceptance:{far:.22,two:.17,near:.02,negative}})):mode==='refine'?[...[.20,.22,.24].flatMap(far=>[.14,.17,.20].map(two=>({luck:100,acceptance:{far,two,near:.02,negative:.45}})))]:[{luck:100},{luck:0,n:Math.max(n,5000)},{luck:50,n:Math.max(n,20000)}];
 const seedPrefix=mode==='validate'?'acceptance-holdout-v6-':'acceptance-training-v5-';
 const output=path.join(root,mode==='validate'?'calibration.json':'acceptance-'+mode+'-v5.json');
 const source=fs.readFileSync(path.join(root,'src/core.ts'),'utf8');
 const report={status:mode==='validate'?'independent-prototype-validation':'training-only',mode,seedPrefix,requestedN:n,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),source,rows:[]};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));save();
 let pending=jobs.length;const queue=jobs.slice();
 function launch(){const job=queue.shift();if(!job)return;const w=new Worker(__filename,{workerData:{job,n:job.n||n,seedPrefix,source}});
 w.on('message',r=>{report.rows.push(r);save();console.log(JSON.stringify(r));if(!--pending)console.log('COMPLETE '+output);else launch();});
 w.on('error',e=>{console.error(e);process.exitCode=1;});}
 for(let i=0;i<4;i++)launch();
}else{
 const {job,n,seedPrefix}=workerData;let src=workerData.source;
 if(job.acceptance){const old=/const exchangeAcceptance = [^;]+;/;if(!old.test(src))throw Error('Acceptance parameters not found');src=src.replace(old,'const exchangeAcceptance = '+JSON.stringify(job.acceptance)+';');}
 const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};new Function('exports','module',compiled)(m.exports,m);
 const {deal,shanten}=m.exports,hist={},start=Date.now();let sum=0,squares=0,success=0;
 for(let i=0;i<n;i++){const seed=seedPrefix+'luck-'+job.luck+'-'+i,d=deal(seed,[job.luck,50,50]),s=shanten(d.hands[0]);hist[s]=(hist[s]||0)+1;sum+=s;squares+=s*s;if(s<=1)success++;
 if(d.hands.some(h=>h.length!==13)||d.wall.length!==55||d.dead.length!==14||new Set([...d.hands.flat(),...d.wall,...d.dead]).size!==108)throw Error('Physical tile conservation failed '+seed);
 const baseline=deal(seed,[50,50,50]);if(JSON.stringify(d.dead)!==JSON.stringify(baseline.dead)||JSON.stringify(d.hands.slice(1))!==JSON.stringify(baseline.hands.slice(1)))throw Error('Protected tiles changed '+seed);
 }
 parentPort.postMessage({...job,seedPrefix,...stats(hist,n,sum,squares,success),milliseconds:Date.now()-start,conservationFailures:0,protectedTileFailures:0});
}
