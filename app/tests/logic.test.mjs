import test from "node:test";
import assert from "node:assert/strict";
import {parseMeter,meterDifference,sumByFuel,getRangeBars,formatLiters,NOZZLES,TANK_CAPACITY,escapeHtml} from "../logic.mjs";
import {demoSeries} from "../demo-data.mjs";

test("exact 3-decimal meter arithmetic",()=>{
 const r=meterDifference("14234.322","14239.901");
 assert.equal(r.ok,true);
 assert.equal(r.liters,5.579);
 assert.equal(formatLiters(r.liters),"5.579");
});
test("comma OCR decimals are accepted",()=>{
 assert.equal(parseMeter("14234,322"),14234.322);
 assert.equal(parseMeter("0.001"),0.001);
});
test("reject missing, negative, invalid and overprecision",()=>{
 for(const raw of ["","-3","32.1234","NaN","1 200","1e4","123,4,5"]){
   assert.equal(parseMeter(raw),null,raw);
 }
 assert.equal(meterDifference("9.3","8.9").ok,false);
});
test("fuel sum ignores invalid rows",()=>{
 assert.deepEqual(sumByFuel([{fuel:"diesel",liters:4.105},{fuel:"gasoline",liters:1.12},{fuel:"bad",liters:999},{fuel:"diesel",liters:-10}]),
 {diesel:4.105,gasoline:1.12,total:5.225});
});
test("chart periods 1/7/30 are consistent",()=>{
 assert.equal(demoSeries.length,30);
 for(const [days,n] of [[1,1],[7,7],[30,30]])assert.equal(getRangeBars(demoSeries,days).length,n);
});
test("six mapped nozzles and real capacity rules",()=>{
 assert.deepEqual(NOZZLES.map(n=>n.id),[1,2,3,4,5,6]);
 assert.equal(TANK_CAPACITY.diesel,30000);
 assert.equal(TANK_CAPACITY.gasoline,20000);
});
test("escape untrusted UI text before display",()=>{
 assert.equal(escapeHtml('<img onerror="x">&'),"&lt;img onerror=&quot;x&quot;&gt;&amp;");
});
