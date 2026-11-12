/* CodeForge Neon v2 runner: C++, Python, JS; sample and extra test verdicts. */
(()=>{
const run=document.getElementById('runBtn');if(!run)return;
const code=document.getElementById('code'),lang=document.getElementById('language'),terminal=document.getElementById('terminal'),verdict=document.getElementById('verdict');
const problem=(window.PROBLEMS||[]).find(p=>p.id===new URLSearchParams(location.search).get('id'));
const samples=problem?.samples||[];
const panel=document.createElement('div');panel.className='cf-stdin-panel';panel.innerHTML='<label for="runnerInput">⌨ STANDARD INPUT</label><textarea id="runnerInput" spellcheck="false" placeholder="Type input or choose a test case"></textarea><div class="cf-runner-note">C++ / Python execution requires an external online compiler. Code and input are sent to that service.</div>';
document.querySelector('.output').before(panel);
const stdin=document.getElementById('runnerInput');stdin.value=samples[0]?.input||'';
const retry=document.createElement('button');retry.type='button';retry.id='retryBtn';retry.textContent='↻ RETRY';run.after(retry);
const allBtn=document.createElement('button');allBtn.type='button';allBtn.id='runAllBtn';allBtn.textContent='▶ RUN ALL TESTS';retry.after(allBtn);
const status=document.createElement('div');status.id='judgeResult';status.className='cf-judge-status';document.querySelector('.output').after(status);
let running=false,compilers=null;const normalize=x=>String(x??'').replace(/\r/g,'').trim().split('\n').map(y=>y.trimEnd()).join('\n');
const setStatus=(message,ok)=>{verdict.textContent=message;status.textContent=message;status.dataset.result=ok===true?'pass':ok===false?'fail':'neutral'};
const errMsg=e=>e.name==='AbortError'?'Online compiler timed out':e.message;
const timeoutFetch=async(url,options={})=>{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);try{return await fetch(url,{...options,signal:ctrl.signal})}finally{clearTimeout(timer)}};
async function wandbox(source,input,language){
 if(!compilers){const r=await timeoutFetch('https://wandbox.org/api/list.json');if(!r.ok)throw Error('Wandbox compiler list HTTP '+r.status);compilers=await r.json()}
 const choices=compilers.filter(c=>c.language===(language==='cpp'?'C++':'Python'));
 const choice=language==='cpp'?(choices.find(c=>c.name==='gcc-head')||choices.find(c=>c.name.startsWith('gcc-'))):(choices.find(c=>c.name.startsWith('cpython-'))||choices.find(c=>/python/i.test(c.name)));
 if(!choice)throw Error('No compatible compiler found');
 const r=await timeoutFetch('https://wandbox.org/api/compile.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({compiler:choice.name,code:source,stdin:input,save:false})});
 if(!r.ok)throw Error('Wandbox HTTP '+r.status);const d=await r.json();return {output:d.program_output||'',errors:[d.compiler_error,d.compiler_message,d.program_error,d.program_message].filter(Boolean).join('\n'),status:String(d.status??'0'),engine:'Wandbox / '+choice.name};
}
async function piston(source,input,language){
 const r=await timeoutFetch('https://emkc.org/api/v2/piston/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:language==='cpp'?'c++':'python',version:'*',files:[{content:source}],stdin:input,run_timeout:10000,compile_timeout:10000})});
 if(!r.ok)throw Error('Piston HTTP '+r.status);const d=await r.json();return {output:d.run?.stdout||'',errors:[d.compile?.stderr,d.run?.stderr].filter(Boolean).join('\n'),status:String(d.run?.code??d.compile?.code??0),engine:'Piston'};
}
function javascript(source,input){return new Promise((resolve,reject)=>{
 const workerSrc=`self.onmessage=e=>{let lines=e.data.input.split(/\\r?\\n/),idx=0,out=[];const readline=()=>lines[idx++]??'';const print=(...a)=>out.push(a.join(' '));const console={log:print,error:print};try{new Function('readline','print','console',e.data.source)(readline,print,console);postMessage({output:out.join('\\n')})}catch(error){postMessage({error:String(error)})}}`;
 const url=URL.createObjectURL(new Blob([workerSrc],{type:'text/javascript'})),worker=new Worker(url);let done=false;
 const timer=setTimeout(()=>finish(new Error('JavaScript exceeded 3 seconds')),3000);
 function finish(err,data){if(done)return;done=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);err?reject(err):resolve({output:data.output,errors:'',status:'0',engine:'Browser JavaScript'})}
 worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(null,e.data);worker.onerror=e=>finish(new Error(e.message));worker.postMessage({source,input});
})}
async function execute(source,input,language){if(language==='javascript')return javascript(source,input);let first;try{const r=await wandbox(source,input,language);if(/Resource temporarily unavailable/i.test(r.errors))throw Error(r.errors);return r}catch(e){first=e}try{return await piston(source,input,language)}catch(e){throw Error('Online compilers unavailable. Wandbox: '+errMsg(first)+'; Piston: '+errMsg(e)+'. Try again later or run locally.')}}
function success(r){return r.status==='0'&&!r.errors.match(/(?:error:|traceback|resource temporarily unavailable)/i)}
function chosenTest(){return window.CodeForgeTests?.selected?.()||null}
async function runOne(){if(running)return;running=true;run.disabled=retry.disabled=allBtn.disabled=true;setStatus('RUNNING…',null);terminal.textContent='Running…';try{
 const input=stdin.value,t=chosenTest(),isChosen=t&&normalize(t.input)===normalize(input),sample=samples.find(s=>normalize(s.input)===normalize(input));
 const expected=isChosen?t.expected:sample?.output;
 const r=await execute(code.value,input,lang.value);const passed=success(r)&&expected!==undefined&&normalize(r.output)===normalize(expected);
 terminal.textContent='ENGINE: '+r.engine+'\n\nOUTPUT:\n'+(r.output||'(empty)')+(r.errors?'\n\nERRORS:\n'+r.errors:'')+(expected!==undefined?'\n\nEXPECTED:\n'+expected:'');
 setStatus(!success(r)?'✕ COMPILATION / RUNTIME ERROR':expected===undefined?'EXECUTED — CUSTOM INPUT':passed?'✓ TEST PASSED':'✕ WRONG ANSWER',success(r)?expected===undefined?null:passed:false);
 }catch(e){terminal.textContent=errMsg(e);setStatus('✕ RUN FAILED',false)}finally{running=false;run.disabled=retry.disabled=allBtn.disabled=false}}
async function runAll(){if(running)return;running=true;run.disabled=retry.disabled=allBtn.disabled=true;const cases=window.CodeForgeTests?.all?.()||samples.map(s=>({input:s.input,expected:s.output}));if(!cases.length){terminal.textContent='No tests available';running=false;run.disabled=retry.disabled=allBtn.disabled=false;return}
 let passed=0,failed=0;const log=[];try{for(let i=0;i<cases.length;i++){setStatus('TEST '+(i+1)+' / '+cases.length,null);const t=cases[i];try{const r=await execute(code.value,t.input,lang.value);const ok=success(r)&&normalize(r.output)===normalize(t.expected);ok?passed++:failed++;log.push((ok?'✓':'✕')+' TEST '+(i+1)+(ok?' PASSED':' FAILED')+(ok?'':'\n  Expected: '+t.expected+'\n  Actual: '+r.output+(r.errors?'\n  Errors: '+r.errors:'')))}catch(e){failed++;log.push('✕ TEST '+(i+1)+' ERROR: '+errMsg(e));if(/Online compilers unavailable/.test(e.message)){log.push('Stopped because compiler services are unavailable.');break}}terminal.textContent=log.join('\n\n')}setStatus(passed+' PASSED · '+failed+' FAILED',failed===0&&passed===cases.length)}finally{running=false;run.disabled=retry.disabled=allBtn.disabled=false}}
// The legacy ide.js has its own Run listener. Capture phase prevents it from executing twice.
run.addEventListener('click',e=>{e.stopImmediatePropagation();runOne()},true);retry.onclick=runOne;allBtn.onclick=runAll;run.textContent='▶ RUN CODE';setStatus('READY',null);
})();
