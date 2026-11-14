(function(){
'use strict';
const form=document.getElementById('comparison-form');
const result=document.getElementById('calc-result');
const source=document.getElementById('calc-source');
const start=document.getElementById('calc-start');
const end=document.getElementById('calc-end');
const button=form.querySelector('button[type="submit"]');
const buttonLabel=button.querySelector('.calc-button-label');
const buttonSpinner=button.querySelector('.calc-button-spinner');
const status=document.getElementById('calc-status');
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const signedMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',signDisplay:'exceptZero'});
const percent=new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
let dataPromise=null,generation=0;

function setBusy(busy){
 form.setAttribute('aria-busy',String(busy));
 button.disabled=busy;
 buttonLabel.textContent=busy?'Calculating…':'Compare the same budget →';
 status.hidden=!busy;
 buttonSpinner.hidden=!busy;
}
function waitForLoadingEffect(startedAt){
 // Keep the requested visual feedback perceptible even for cached local data.
 const remaining=450-(performance.now()-startedAt);
 return remaining>0?new Promise(resolve=>setTimeout(resolve,remaining)):Promise.resolve();
}
function clearResults(){
 generation++;
 result.replaceChildren();
 result.hidden=true;
 setBusy(false);
}
function loadPrices(){
 if(!dataPromise){
  dataPromise=fetch('prices.json').then(function(response){
   if(!response.ok)throw new Error('Saved price file could not be loaded. Please try again or download the CSVs.');
   return response.json();
  }).catch(function(error){dataPromise=null;throw error;});
 }
 return dataPromise;
}
function node(tag,text,className){
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=text;
 if(className)element.className=className;
 return element;
}
function displayResults(data,input,comparison){
 const rows=data[input.source].rows;
 const endingPrice=rows.find(row=>row.date===input.end).close;
 const table=node('table',undefined,'dca-table calc-results-table');
 table.append(node('caption',input.start+' to '+input.end+' · Budget '+money.format(input.amount)+' · Buy fee '+input.fee.toFixed(2)+'% · '+(input.source==='binance'?'BTC/USDT; USDT treated at $1.':'Workbook BTC/USD closes.')));
 const head=node('thead'),heading=node('tr');
 ['Strategy','Buys','BTC accumulated','Ending value','Profit / loss','Return'].forEach(function(label){
  const th=node('th',label);th.scope='col';heading.append(th);
 });
 head.append(heading);table.append(head);
 const body=node('tbody');
 [['Lump sum',1,comparison.lumpValue],['Daily DCA',comparison.days,comparison.dcaValue]].forEach(function(values){
  const tr=node('tr'),label=node('th',values[0]);label.scope='row';tr.append(label);
  const profit=values[2]-input.amount;
  [String(values[1]),(values[2]/endingPrice).toFixed(8),money.format(values[2]),signedMoney.format(profit),percent.format(profit/input.amount)].forEach(function(value,index){
   tr.append(node('td',value,index>=3?(profit<0?'calc-loss':profit>0?'calc-gain':''):undefined));
  });
  body.append(tr);
 });
 table.append(body);
 const wrapper=node('div',undefined,'table-wrap');wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Strategy comparison table; scroll horizontally on small screens');wrapper.append(table);
 const difference=comparison.dcaValue-comparison.lumpValue;
 const verdict=node('p',undefined,'calc-verdict');
 verdict.append(node('strong','DCA minus lump sum: '+signedMoney.format(difference)+'. '));
 verdict.append(document.createTextNode(Math.abs(difference)<0.005?'The strategies finish at the same value to the nearest cent.':(difference>0?'Daily DCA':'Lump sum')+' finishes '+money.format(Math.abs(difference))+' higher in this window.'));
 const sourceNote=node('p',data[input.source].label+'. Ending value = accumulated BTC × ending close ('+money.format(endingPrice)+'). Percentage buy fees are included; selling costs, spread, tax and cash interest are not.','calc-source-note');
 result.replaceChildren(wrapper,verdict,sourceNote);
 result.hidden=false;
}
source.addEventListener('change',function(){
 const historical=source.value==='binance';
 start.min=end.min=historical?'2025-01-01':'2026-02-28';
 start.max=end.max=historical?'2025-12-31':'2026-08-21';
 start.value=start.min;
 end.value=historical?'2025-06-24':end.max;
});
form.addEventListener('input',clearResults);
form.addEventListener('change',clearResults);
form.addEventListener('submit',async function(event){
 event.preventDefault();
 if(!form.reportValidity())return;
 const current=++generation;
 const startedAt=performance.now();
 const input={source:source.value,start:start.value,end:end.value,amount:Number(document.getElementById('calc-amount').value),fee:Number(document.getElementById('calc-fee').value)};
 result.replaceChildren();result.hidden=true;setBusy(true);
 try{
  // Let the busy state paint before running the local calculation.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const data=await loadPrices();
  if(current!==generation)return;
  const comparison=window.btcCompare(data[input.source].rows,input.amount,input.start,input.end,input.fee);
  await waitForLoadingEffect(startedAt);
  if(current!==generation)return;
  displayResults(data,input,comparison);
 }catch(error){
  await waitForLoadingEffect(startedAt);
  if(current===generation){result.replaceChildren(node('p',error.message,'calc-error'));result.hidden=false;}
 }finally{
  if(current===generation)setBusy(false);
 }
});
clearResults();
})();
