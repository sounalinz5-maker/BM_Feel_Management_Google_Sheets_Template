import {createSign,randomBytes} from 'node:crypto';

const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Open_Photo_ID','Close_Photo_ID','Created_At','Source','Operator','Open_Photo_Mime','Close_Photo_Mime'];
const SHEET_TAB='Meter_Log';
const SHEET_TITLE='BM FUEL STAGING';
const FOLDER_TITLE='BM-FUEL-STAGING';
const MIME_FOLDER='application/vnd.google-apps.folder';
const SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
function base64url(value){return Buffer.from(value).toString('base64url');}
function isResourceId(value){return /^[A-Za-z0-9_-]{15,150}$/.test(value||'');}
function requireResponse(response){
  if(!response.ok){
    const error=new Error('Google staging storage request failed ('+response.status+')');
    error.status=503;
    throw error;
  }
  return response;
}
export function createGoogleStagingStore(env=process.env,{fetchImpl=fetch}={}){
  const fields=['BM_STAGING_GOOGLE_AUTH_JSON','BM_STAGING_SHEET_ID','BM_STAGING_DRIVE_FOLDER_ID'];
  if(fields.every(k=>!env[k]))return null;
  if(fields.some(k=>!env[k]))throw Error('Incomplete STAGING Google credentials and staging-only resource IDs');
  if(!isResourceId(env.BM_STAGING_SHEET_ID)||!isResourceId(env.BM_STAGING_DRIVE_FOLDER_ID))
    throw Error('Invalid STAGING Google resource IDs');
  let credentials;
  try{credentials=JSON.parse(env.BM_STAGING_GOOGLE_AUTH_JSON);}catch{throw Error('Invalid STAGING Google OAuth JSON');}
  const validService=credentials.type==='service_account' && credentials.client_email&&credentials.private_key;
  const validUser=credentials.type==='authorized_user' && credentials.client_id&&credentials.client_secret&&credentials.refresh_token;
  if(!validService&&!validUser)throw Error('Expected authorized_user OAuth or service_account JSON for STAGING');
  const spreadsheetId=env.BM_STAGING_SHEET_ID,folderId=env.BM_STAGING_DRIVE_FOLDER_ID;
  let cachedToken='',tokenExpires=0;
  async function accessToken(){
    if(cachedToken&&Date.now()<tokenExpires-60000)return cachedToken;
    let form;
    if(validService){
      const now=Math.floor(Date.now()/1000);
      const claims={iss:credentials.client_email,scope:SCOPES,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};
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
    if(!data.access_token)throw Error('Google staging token was unavailable');
    cachedToken=data.access_token;
    tokenExpires=Date.now()+Number(data.expires_in||3500)*1000;
    return cachedToken;
  }
  async function api(url,{method='GET',headers={},body}={}){
    const token=await accessToken();
    return requireResponse(await fetchImpl(url,{method,headers:{Authorization:'Bearer '+token,...headers},body}));
  }
  const sheetBase='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
  const driveBase='https://www.googleapis.com/drive/v3/files/';
  let verifiedAt=0;
  async function verify(){
    if(Date.now()-verifiedAt<120000)return true;
    const [sheetRes,folderRes]=await Promise.all([
      api(sheetBase+'?fields=properties(title),sheets(properties(title))'),
      api(driveBase+encodeURIComponent(folderId)+'?fields=id,name,mimeType,trashed')
    ]);
    const sheet=await sheetRes.json(),folder=await folderRes.json();
    const title=String(sheet?.properties?.title||'');
    if(!title.toUpperCase().startsWith(SHEET_TITLE)||
       !Array.isArray(sheet?.sheets)||
       !sheet.sheets.some(s=>s.properties?.title===SHEET_TAB))throw Error('Google target is not an isolated BM FUEL STAGING spreadsheet with Meter_Log tab');
    if(folder.trashed||folder.mimeType!==MIME_FOLDER||!String(folder.name||'').toUpperCase().startsWith(FOLDER_TITLE))
      throw Error('Google target folder is not an isolated BM-FUEL-STAGING folder');
    const headerUrl=sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A1:N1');
    const header=await (await api(headerUrl)).json();
    const values=header.values?.[0]||[];
    if(values.length===0){
      await api(headerUrl+'?valueInputOption=RAW',{method:'PUT',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({range:SHEET_TAB+'!A1:N1',majorDimension:'ROWS',values:[HEADERS]})});
    }else if(HEADERS.some((h,i)=>h!==values[i]))throw Error('STAGING Meter_Log header is different from the expected structure');
    verifiedAt=Date.now();return true;
  }
  async function listRecords(){
    await verify();
    const url=sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A2:N2000');
    const data=await (await api(url)).json();
    return (data.values||[]).map(row=>({
      id:String(row[0]||''),date:String(row[1]||''),nozzle:Number(row[2]),
      fuel:String(row[3]||''),opening:Number(row[4]),closing:Number(row[5]),
      liters:Number(row[6]),createdAt:String(row[9]||''),source:'google-staging',
      persisted:true,hasOpenPhoto:Boolean(row[7]),hasClosePhoto:Boolean(row[8]),
      _openPhotoId:String(row[7]||''),_closePhotoId:String(row[8]||'')
    })).filter(x=>/^[a-f0-9-]{32,36}$/i.test(x.id)&&x.nozzle>=1&&x.nozzle<=6);
  }
  async function uploadPhoto(photo,{name}){
    const boundary='BMSTAGING'+randomBytes(12).toString('hex');
    const meta={name,mimeType:'image/jpeg',parents:[folderId],description:'BM FUEL STAGING sample photo only'};
    const start=Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+
      '\r\n--'+boundary+'\r\nContent-Type: image/jpeg\r\n\r\n');
    const end=Buffer.from('\r\n--'+boundary+'--');
    const body=Buffer.concat([start,photo,end]);
    const response=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary,'Content-Length':String(body.length)},body
    });
    const data=await response.json();
    if(!isResourceId(data.id))throw Error('Google Drive did not return a staging photo ID');
    return data.id;
  }
  async function removePhoto(id){
    if(!isResourceId(id))return;
    try{await api(driveBase+encodeURIComponent(id),{method:'DELETE'});}catch{/* manual staging reconciliation may be required */}
  }
  async function saveRecord(record,openingPhoto,closingPhoto){
    await verify();
    const existing=await listRecords();
    if(existing.some(row=>row.nozzle===record.nozzle&&row.date===record.date))
      throw Object.assign(new Error('มีรายการมิเตอร์สำหรับหัวจ่ายและวันที่นี้แล้ว'),{status:409});
    const created=[];
    try{
      const openId=await uploadPhoto(openingPhoto,{name:'BM-FUEL-STAGING_'+record.date+'_H'+record.nozzle+'_'+record.id+'_OPEN.jpg'});
      created.push(openId);
      const closeId=await uploadPhoto(closingPhoto,{name:'BM-FUEL-STAGING_'+record.date+'_H'+record.nozzle+'_'+record.id+'_CLOSE.jpg'});
      created.push(closeId);
      const values=[[record.id,record.date,String(record.nozzle),record.fuel,String(record.opening),String(record.closing),
        String(record.liters),openId,closeId,record.createdAt,'STAGING_SAMPLE','Staging Owner','image/jpeg','image/jpeg']];
      await api(sheetBase+'/values/'+encodeURIComponent(SHEET_TAB+'!A:N')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});
      return {...record,source:'google-staging',persisted:true,hasOpenPhoto:true,hasClosePhoto:true};
    }catch(e){
      await Promise.all(created.map(removePhoto));
      throw e;
    }
  }
  async function readPhoto(fileId){
    if(!isResourceId(fileId))throw Object.assign(new Error('Invalid photo reference'),{status:404});
    const response=await api(driveBase+encodeURIComponent(fileId)+'?alt=media');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>1024*1024)throw Error('Unexpected large staging photo from Drive');
    return bytes;
  }
  return {verify,listRecords,saveRecord,readPhoto};
}
export {HEADERS};
