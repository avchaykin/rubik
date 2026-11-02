const fs=require('fs'); (0,eval)(fs.readFileSync(__dirname+'/../src/logic.js','utf8')+fs.readFileSync(__dirname+'/../src/solver.js','utf8'));
const L=CubeLogic,S=CubeSolver;
const faces=['U','D','R','L','F','B'],suf=['',"'",'2'];
const scr=()=>{let o=[],last='';while(o.length<25){const f=faces[Math.random()*6|0];if(f===last)continue;last=f;o.push(f+suf[Math.random()*3|0]);}return o.join(' ');};
const method=process.argv[2], N=+process.argv[3]||50;
let t=Date.now(); if(method==='fewest'){S.prepareFewest(); console.log('init',Date.now()-t,'ms');}
let lens=[],tmax=0,fails=0,stages={};
for(let k=0;k<N;k++){
  const st=L.newState(); L.applyAlg(st,L.parseAlg(scr()));
  const a=Date.now(); let segs;
  try{segs=S.solve(st,method);}catch(e){console.log('fail',e.message);fails++;continue;}
  tmax=Math.max(tmax,Date.now()-a);
  const all=segs.flatMap(s=>s.moves); const c=JSON.parse(JSON.stringify(st)); L.applyAlg(c,L.parseAlg(all.join(' ')));
  if(!c.cubies.every(x=>x.type==='center'||L.isSolved(x))){console.log('not solved');fails++;}
  lens.push(all.length); segs.forEach(s=>stages[s.stage]=(stages[s.stage]||0)+s.moves.length);
}
console.log(`${method} N=${N} fails=${fails} avg=${(lens.reduce((a,b)=>a+b,0)/lens.length).toFixed(1)} max=${Math.max(...lens)} maxTime=${tmax}ms`);
for(const k in stages) stages[k]=(stages[k]/N).toFixed(1); console.log(stages);
