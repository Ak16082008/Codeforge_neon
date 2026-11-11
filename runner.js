/* CodeForge Neon online execution patch. Requires ide.js to load first. */
(()=>{
 const run=document.getElementById('runBtn');if(!run)return;
 const code=document.getElementById('code'),lang=document.getElementById('language'),terminal=document.getElementById('terminal'),verdict=document.getElementById('verdict');
 const samples=(window.PROBLEMS||[]).find(p=>p.id===new URLSearchParams(location.search).get('id'))?.samples||[];
 const panel=document.createElement('div');panel.style.cssText='padding:12px;border-top:1px solid #27304a';
 panel.innerHTML='<label for="runnerInput" style="display:block;font:11px monospace;color:#43f5ed;margin-bottom:8px">⌨ STANDARD INPUT</label><textarea id="runnerInput" spellcheck="false" placeholder="Enter custom input or click LOAD SAMPLE INPUT" style="width:100%;height:95px;resize:vertical;background:#0a0e1c;color:#d9eaff;border:1px solid #27304a;border-radius:7px;padding:10px;font:12px monospace"></textarea><div style="font:11px monospace;color:#8591ad;margin-top:7px">C++ / Python use Wandbox online compiler. Code and input are sent to a third-party service.</div>';
 document.querySelector('.output').before(panel);
 const stdin=document.getElementById('runnerInput');stdin.value=samples[0]?.input||'';
 document.getElementById('sampleBtn')?.addEventListener('click',()=>{stdin.value=samples[0]?.input||''});
 const originalChange=lang.onchange;lang.onchange=e=>{originalChange?.call(lang,e);run.textContent='▶ RUN CODE'};run.textContent='▶ RUN CODE';
 const normalize=x=>String(x??'').trim().replace(/\r/g,'').split('\n').map(y=>y.trim()).join('\n');
 let compilers;
 async function execute(){
   run.disabled=true;run.textContent='◌ RUNNING';verdict.textContent='RUNNING';terminal.textContent='Starting execution…';
   const input=stdin.value,language=lang.value;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
   try{
     if(language==='javascript'){
       await new Promise((resolve,reject)=>{
         const workerCode=`self.onmessage=e=>{const lines=e.data.input.split(/\\r?\\n/);let i=0;const out=[];const readline=()=>lines[i++]??'';const console={log:(...v)=>out.push(v.join(' ')),error:(...v)=>out.push(v.join(' '))};try{new Function('readline','console',e.data.code)(readline,console);postMessage({output:out.join('\\n')})}catch(err){postMessage({error:String(err)})}}`;
         const url=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));const worker=new Worker(url);let finished=false;
         const timeout=setTimeout(()=>finish(new Error('JavaScript time limit exceeded (3 seconds)')),3000);
         function finish(err,data){if(finished)return;finished=true;clearTimeout(timeout);worker.terminate();URL.revokeObjectURL(url);if(err)reject(err);else resolve(data)}
         worker.onmessage=e=>finish(e.data.error?new Error(e.data.error):null,e.data);worker.onerror=e=>finish(new Error(e.message));worker.postMessage({input,code:code.value});
       }).then(d=>show(d.output,'',0));
       return;
     }
     if(!compilers){const r=await fetch('https://wandbox.org/api/list.json',{signal:controller.signal});if(!r.ok)throw Error('Compiler list HTTP '+r.status);compilers=await r.json()}
     const choices=compilers.filter(c=>c.language===(language==='cpp'?'C++':'Python'));
     const choice=(language==='cpp'?choices.find(c=>c.name==='gcc-head')||choices.find(c=>c.name.startsWith('gcc-')):choices.find(c=>c.name.startsWith('cpython-'))||choices.find(c=>/python/i.test(c.name)))||choices[0];
     if(!choice)throw Error('No compiler currently available for '+language);
     const response=await fetch('https://wandbox.org/api/compile.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({compiler:choice.name,code:code.value,stdin:input,save:false}),signal:controller.signal});
     if(!response.ok)throw Error('Compiler service HTTP '+response.status);
     const d=await response.json();show(d.program_output||'',[d.compiler_error,d.compiler_message,d.program_error,d.program_message].filter(Boolean).join('\n'),d.status,choice.name);
   }catch(e){terminal.textContent='Execution failed: '+(e.name==='AbortError'?'Compiler timed out after 45 seconds':e.message)+'\nCheck internet access or try again later.';verdict.textContent='RUN FAILED'}finally{clearTimeout(timer);run.disabled=false;run.textContent='▶ RUN CODE'}
   function show(output,messages,status,compiler){
     const expected=samples[0]?.output||'';const isSample=samples.length&&normalize(input)===normalize(samples[0].input);
     const error=String(status??'0')!=='0';terminal.textContent=(compiler?'COMPILER: '+compiler+'\n\n':'')+'OUTPUT:\n'+(output||'(empty)')+(messages?'\n\nCOMPILER / RUNTIME MESSAGES:\n'+messages:'')+(isSample?'\n\nEXPECTED SAMPLE OUTPUT:\n'+expected:'');
     if(error||messages&&/error:/i.test(messages))verdict.textContent='COMPILATION / RUNTIME ERROR';else if(isSample){const ok=normalize(output)===normalize(expected);verdict.textContent=ok?'SAMPLE PASSED':'SAMPLE FAILED';terminal.textContent+='\n\n'+(ok?'✓ Sample matches':'✕ Sample differs')}else verdict.textContent='EXECUTED';
   }
 }
 // Capture phase overrides legacy JS-only click handler in ide.js.
 run.addEventListener('click',e=>{e.stopImmediatePropagation();execute()},true);
})();
