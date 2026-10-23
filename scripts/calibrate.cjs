// Exploratory validation, NOT the million-hand design certification.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const src=fs.readFileSync(path.join(__dirname,'../src/core.ts'),'utf8');
const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('exports','module',compiled)(m.exports,m);
const {deal,shanten}=m.exports,rows=[];
function save(){fs.writeFileSync(path.join(__dirname,'../calibration.json'),JSON.stringify({status:'exploratory-not-certified',algorithm:'design-3.2-budget38-Kminus1',seedPrefix:'independent-validation-v2-',notes:'No budget change applied. 100 luck target failure must be disclosed.',rows},null,2))}
for(const L of [50,0,100]){const n=L===50?20000:L===0?2000:1000,hist={},start=Date.now();let sum=0,squares=0,success=0;for(let i=0;i<n;i++){const d=deal('independent-validation-v2-'+i,[L,50,50]),s=shanten(d.hands[0]);hist[s]=(hist[s]||0)+1;sum+=s;squares+=s*s;if(s<=1)success++;if(new Set([...d.hands.flat(),...d.wall,...d.dead]).size!==108)throw Error('Conservation');}
const mean=sum/n,p=success/n,z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den,standardError=Math.sqrt((squares-sum*sum/n)/(n-1)/n);
const row={luck:L,n,histogram:hist,mean,standardError,atMostOne:p,wilson95:[center-half,center+half],milliseconds:Date.now()-start};rows.push(row);save();console.log(JSON.stringify(row))}
