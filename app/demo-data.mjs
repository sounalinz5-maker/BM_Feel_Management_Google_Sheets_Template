// Explicitly fictional sample values; do not persist or report as fuel-station facts.
const raw=[
 [770.125,450.220],[820.200,486.550],[885.500,504.600],[930.300,560.750],[1002.460,594.430],
 [990.300,618.770],[1055.820,620.100],[1098.550,669.120],[1110.870,700.450],[1136.090,722.200],
 [1088.270,690.800],[1168.310,750.430],[1190.520,770.350],[1224.900,782.100],[1248.300,795.440],
 [1290.560,838.310],[1230.340,850.230],[1380.420,899.200],[1400.600,940.100],[1325.730,932.560],
 [1450.250,955.350],[1482.320,1066.770],[1548.960,1022.500],[1510.700,1100.200],
 [1608.460,1115.300],[1590.370,1149.400],[1680.400,1180.300],[1709.700,1204.250],
 [1750.250,1260.400],[1830.120,1315.700]
];
const now=new Date();
function localDate(offset){
 const d=new Date(now);d.setDate(now.getDate()+offset);
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return y+"-"+m+"-"+day;
}
export const demoSeries=raw.map((r,i)=>({date:localDate(i+1-raw.length),diesel:r[0],gasoline:r[1]}));
export const demoTanks={diesel:21450,gasoline:8600};
export const demoActivity=[
  {time:"15:22",label:"บันทึกมิเตอร์หัวจ่าย 1",details:"ดีเซล · 82.550 ลิตร",icon:"⛽"},
  {time:"14:06",label:"รับน้ำมันเข้าถังดีเซล",details:"ปริมาณ 5,000 ลิตร",icon:"🚚"},
  {time:"11:35",label:"บันทึกค่าใช้จ่าย",details:"ค่าไฟฟ้า 450,000 ກີບ",icon:"🧾"},
  {time:"08:00",label:"เริ่มรอบขายวันนี้",details:"ตรวจมิเตอร์เปิดครบ 6 หัว",icon:"✓"}
];
export const demoDailyLak=48560000;
export const demoReceipts=268;
