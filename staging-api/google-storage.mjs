import {createSign} from 'node:crypto';

const SHEET_TAB='Meter_Log';
const SHEET_TITLE='BM FUEL STAGING';
// Lock all Google writes to the user-approved STAGING spreadsheet, never production.
const ALLOWED_STAGING_SHEET_ID='1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU';
const SHEETS_SCOPE='https://www.googleapis.com/auth/spreadsheets';
export const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator'];
function base64url(value){return Buffer.from(value).toString('base64url');}
function requireResponse(response){
  if(!response.ok){
    const error=new Error('Google STAGING Sheets request failed ('+response.status+')');
    error.status=503;throw error;
  }
  return response;
}
export function createGoogleStagingStore(env=process.env,{fetchImpl=fetch}={}){
  const configured=['BM_STAGING_GOOGLE_AUTH_JSON','BM_STAGING_SHEET_ID'];
  if(configured.every(k=>!env[k]))return null;
  if(configured.some(k=>!env[k]))throw Error('Incomplete STAGING Google Sheets credentials');
  if(env.BM_STAGING_SHEET_ID!==ALLOWED_STAGING_SHEET_ID)
    throw Error('Refusing to access any spreadsheet outside approved BM FUEL STAGING ID');
  let credentials;
  try{credentials=JSON.parse(env.BM_STAGING_GOOGLE_AUTH_JSON);}
  catch{throw Error('Invalid STAGING Google OAuth JSON');}
  const validService=credentials.type==='service_account'&&credentials.client_email&&credentials.private_key;
  const validUser=credentials.type==='authorized_user'&&credentials.client_id&&credentials.client_secret&&credentials.refresh_token;
  if(!validService&&!validUser)throw Error('Expected authorized_user OAuth or service_account JSON for STAGING');
  const sheetBase='https://sheets.googleapis.com/v4/spreadsheets/'+ALLOWED_STAGING_SHEET_ID;
  let cachedToken='',tokenExpires=0,verifiedAt=0;
  async function accessToken(){
    if(cachedToken&&Date.now()<tokenExpires-60000)return cachedToken;
    let form;
    if(validService){
      const now=Math.floor(Date.now()/1000);
      const claims={iss:credentials.client_email,scope:SHEETS_SCOPE,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};
      const signingInput=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+base64url(JSON.stringify(claims));
      const sign=createSign('RSA-SHA256');sign.update(signingInput);sign.end();
      const jwt=signingInput+'.'+sign.sign(credentials.private_key).toString('base64url');
      form=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt});
    }else{
      form=new URLSearchParams({grant_type:'refresh_token',client_id:credentials.client_id,
        client_secret:credentials.client_secret,refresh_token:credentials.refresh_token});
    }
    const response=await fetchImpl('https://oauth2.googleapis.com/token',
      {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    requireResponse(response);
    const data=await response.json();
    if(!data.access_token)throw Error('Google STAGING Sheets token is unavailable');
    cachedToken=data.access_token;
    tokenExpires=Date.now()+Number(data.expires_in||3500)*1000;
    return cachedToken;
  }
  async function api(url,{method='GET',headers={},body}={}){
    const token=await accessToken();
    return requireResponse(await fetchImpl(url,{method,headers:{Authorization:'Bearer '+token,...headers},body}));
  }
  async function verify(){
    if(Date.now()-verifiedAt<120000)return true;
    const sheet=await(await api(sheetBase+'?fields=properties(title),sheets(properties(title))')).json();
    if(sheet?.properties?.title!==SHEET_TITLE||
      !Array.isArray(sheet.sheets)||!sheet.sheets.some(s=>s.properties?.title===SHEET_TAB))
      throw Error('Target is not the approved isolated BM FUEL STAGING spreadsheet');
    const header=await(await api(sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A1:J1'))).json();
    const values=header.values?.[0]||[];
    if(values.length!==HEADERS.length||HEADERS.some((x,i)=>x!==values[i]))
      throw Error('STAGING Meter_Log headers are not configured correctly');
    verifiedAt=Date.now();return true;
  }
  async function listRecords(){
    await verify();
    const url=sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A2:J2000');
    const data=await(await api(url)).json();
    return (data.values||[]).map(row=>({
      id:String(row[0]||''),date:String(row[1]||''),nozzle:Number(row[2]),fuel:String(row[3]||''),
      opening:Number(row[4]),closing:Number(row[5]),liters:Number(row[6]),
      createdAt:String(row[7]||''),source:'google-staging',persisted:true
    })).filter(x=>/^[a-f0-9]{32}$/i.test(x.id)&&x.nozzle>=1&&x.nozzle<=6);
  }
  async function saveRecord(record){
    const existing=await listRecords();
    if(existing.some(row=>row.nozzle===record.nozzle&&row.date===record.date))
      throw Object.assign(new Error('มีรายการมิเตอร์สำหรับหัวจ่ายและวันที่นี้แล้ว'),{status:409});
    const values=[[record.id,record.date,String(record.nozzle),record.fuel,String(record.opening),
      String(record.closing),String(record.liters),record.createdAt,'STAGING_SAMPLE','Staging Owner']];
    const response=await api(sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A:J')+
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})
    });
    const result=await response.json();
    if(Number(result.updates?.updatedRows)!==1)throw Error('STAGING spreadsheet did not confirm append');
    // Read back the exact new submission to avoid reporting success without a stored row.
    const after=await listRecords();
    if(!after.some(x=>x.id===record.id))throw Error('STAGING spreadsheet read-back did not confirm saved meter');
    return {...record,source:'google-staging',persisted:true};
  }
  return {verify,listRecords,saveRecord};
}
