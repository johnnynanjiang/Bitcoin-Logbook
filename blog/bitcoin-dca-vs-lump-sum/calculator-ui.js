(async function(){
'use strict';
const form=document.getElementById('comparison-form'),result=document.getElementById('calc-result'),source=document.getElementById('calc-source'),start=document.getElementById('calc-start'),end=document.getElementById('calc-end');
const button=form.querySelector('button');button.disabled=true;
try{
 const response=await fetch('prices.json');if(!response.ok)throw new Error('Saved price file could not be loaded.');
 const data=await response.json();
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
 function render(){
  try{
   const amount=Number(document.getElementById('calc-amount').value),fee=Number(document.getElementById('calc-fee').value);
   const r=window.btcCompare(data[source.value].rows,amount,start.value,end.value,fee);
   const diff=r.dcaValue-r.lumpValue;
   result.textContent=r.days+' daily buys. Lump sum: '+money(r.lumpValue)+' (P/L '+money(r.lumpValue-amount)+'). Daily DCA: '+money(r.dcaValue)+' (P/L '+money(r.dcaValue-amount)+'). DCA minus lump sum: '+money(diff)+'. '+data[source.value].label+'.';
  }catch(error){result.textContent=error.message;}
 }
 source.addEventListener('change',function(){
  const rows=data[source.value].rows;
  start.min=end.min=rows[0].date;start.max=end.max=rows.at(-1).date;
  start.value=rows[0].date;end.value=source.value==='binance'?'2025-06-24':rows.at(-1).date;
  render();
 });
 form.addEventListener('submit',function(event){event.preventDefault();render();});
 button.disabled=false;render();
}catch(error){result.textContent='Calculator unavailable: '+error.message+' Download the CSVs to reproduce the comparison.';}
})();
