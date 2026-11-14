(function(root){
'use strict';
function compare(prices,amount,start,end,fee){
 const first=Date.parse(start),last=Date.parse(end);
 if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(fee)||fee<0||fee>=100||!Number.isFinite(first)||!Number.isFinite(last)||last<first)throw new Error('Invalid amount, fee or dates.');
 const rows=prices.filter(r=>r.date>=start&&r.date<=end);
 const expected=Math.round((last-first)/86400000)+1;
 if(rows.length!==expected||rows.some((r,i)=>Date.parse(r.date)!==first+i*86400000))throw new Error('Missing daily prices: choose a complete window inside the selected dataset.');
 if(rows.some(r=>!Number.isFinite(r.close)||r.close<=0))throw new Error('Invalid price data.');
 const units=rows.reduce((sum,r)=>sum+(amount/rows.length)*(1-fee/100)/r.close,0);
 return {days:rows.length,lumpValue:amount*(1-fee/100)/rows[0].close*rows.at(-1).close,dcaValue:units*rows.at(-1).close};
}
if(typeof module!=='undefined'&&module.exports)module.exports={compare};
root.btcCompare=compare;
})(typeof window!=='undefined'?window:globalThis);
