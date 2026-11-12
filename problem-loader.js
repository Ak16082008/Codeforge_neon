// Load only the selected problem's statement; keeps the archive fast.
(async function(){
 const id=new URLSearchParams(location.search).get('id');
 const info=(window.PROBLEMS||[]).find(p=>p.id===id);
 const root=document.getElementById('problemRoot');
 if(!info){root.textContent='Problem not found in the archive.';return;}
 if(!info.available){root.textContent='This problem was not downloaded successfully. Try the original Codeforces page.';return;}
 root.innerHTML='<div class="pane"><div class="problem-content">Loading problem '+id+'…</div></div>';
 try{
   const response=await fetch('data/'+encodeURIComponent(info.bucket)+'.json');
   if(!response.ok)throw Error('HTTP '+response.status);
   const problems=await response.json();
   const problem=problems[id];
   if(!problem)throw Error('Problem missing from data file');
   window.PROBLEMS=[problem];
   const scripts=['ide.js','runner.js','ui.js'];
   for(const src of scripts){
     await new Promise((resolve,reject)=>{
       const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not load '+src));document.body.appendChild(s);
     });
   }
   // Codeforces uses $$$...$$$; the exporter converts those to $...$.
   if(typeof renderMathInElement==='function'){
     document.querySelectorAll('.statement').forEach(el=>renderMathInElement(el,{
       delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false
     }));
   }
 }catch(e){root.textContent='Could not load this problem: '+e.message+'. Check that the data folder was uploaded.';console.error(e)}
})();
