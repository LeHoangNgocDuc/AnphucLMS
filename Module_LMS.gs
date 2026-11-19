/**
 * AN PHUC LMS V1 - isolated, additive Apps Script module.
 * Requires the existing Code.gs helpers: getSpreadsheet_, getSheetData,
 * sha256Hex_, safeEquals_, assertAdminAuth_, normalizeClassName,
 * normalizeNumberString. Never publishes the answer key in student endpoints.
 */
const AP_LMS = {
  PROP_BANK: 'AP_LMS_BANK_SPREADSHEET_ID',
  PROP_PEPPER: 'AP_LMS_AUTH_PEPPER',
  PASS: 6,
  PACK_SIZE: 10,
  TOKEN_TTL: 14400,
  ASSIGN_HEADERS: ['AssignmentID','Title','Grade','ClassID','Topic','StartAt','DueAt','Status','CreatedAt'],
  PACK_HEADERS: ['PackID','AssignmentID','Level','Version','PayloadJSON','CreatedAt'],
  RESULT_HEADERS: ['AttemptID','AssignmentID','StudentID','Level','Score','Passed','PublishedAt','GradedAt','AnswersJSON','CorrectCount','TotalCount'],
  ACCESS_HEADERS: ['StudentID','PinHash','PinSalt','Active','LastLoginAt'],
  LOG_HEADERS: ['Timestamp','EventID','ActorID','Action','EntityID','Status','Detail']
};

function apLmsSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('LMS_NOT_SETUP: Giáo viên cần chạy Cài đặt LMS trước.');
  return sheet;
}
function apLmsObjects_(name) {
  const sheet = apLmsSheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(row => Object.fromEntries(data[0].map((key,i) => [String(key),row[i]])));
}
function apLmsStr_(value) { return String(value == null ? '' : value).trim(); }
function apLmsSecret_() {
  const value = PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_PEPPER);
  if (!value) throw new Error('LMS_NOT_SETUP: Chưa tạo khóa xác thực LMS.');
  return value;
}
function apLmsGetBank_() {
  const id = PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK);
  if (!id) throw new Error('LMS_BANK_MISSING: Chưa cài đặt Google Spreadsheet ngân hàng.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('LMS_Questions');
  if (!sheet) throw new Error('Ngân hàng thiếu trang LMS_Questions.');
  return sheet;
}
function apLmsSetup(p) {
  assertAdminAuth_(p);
  const id = apLmsStr_(p.bank_spreadsheet_id);
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error('Nhập ID Google Spreadsheet của ngân hàng câu hỏi.');
  const bankSheet = SpreadsheetApp.openById(id).getSheetByName('LMS_Questions');
  if (!bankSheet) throw new Error('Không tìm thấy LMS_Questions trong ngân hàng.');
  const header = bankSheet.getRange(1,1,1,bankSheet.getLastColumn()).getDisplayValues()[0];
  ['QuestionUID','Grade','Chapter','LMS_Level','Question','A','B','C','D','CorrectAnswer','Status'].forEach(k => {
    if (header.indexOf(k) === -1) throw new Error('Ngân hàng thiếu cột ' + k);
  });
  const ss = getSpreadsheet_();
  const schema = {
    LMS_Assignments: AP_LMS.ASSIGN_HEADERS,
    LMS_Packs: AP_LMS.PACK_HEADERS,
    LMS_Results: AP_LMS.RESULT_HEADERS,
    LMS_UserAccess: AP_LMS.ACCESS_HEADERS,
    LMS_AuditLogs: AP_LMS.LOG_HEADERS
  };
  Object.keys(schema).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet=ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,schema[name].length).setValues([schema[name]]).setFontWeight('bold').setBackground('#DBEAFE');
    else {
      const existing = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      // Add only missing columns; never reorder or overwrite existing sheets.
      const missing=schema[name].filter(h=>existing.indexOf(h)===-1);
      if(missing.length) sheet.getRange(1,sheet.getLastColumn()+1,1,missing.length).setValues([missing]);
    }
    sheet.setFrozenRows(1);
  });
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(AP_LMS.PROP_PEPPER)) props.setProperty(AP_LMS.PROP_PEPPER,Utilities.getUuid()+'_'+Utilities.getUuid());
  props.setProperty(AP_LMS.PROP_BANK,id);
  return {configured:true,bank_id_tail:id.slice(-6),bank_rows:bankSheet.getLastRow()-1,sheets:Object.keys(schema)};
}
function apLmsCol_(sheet,name) {
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const idx=headers.indexOf(name);
  if(idx<0)throw new Error('Thiếu cột '+name+' tại '+sheet.getName());
  return idx+1;
}
function apLmsEnsureWriteCapacity_(sh,additionalRows,requiredCols) {
  // A new Google Sheet usually starts with only 1,000 grid rows. Bulk imports and
  // long-lived results must grow the grid before getRange().setValues().
  const neededRows=sh.getLastRow()+Math.max(0,Number(additionalRows)||0);
  if(sh.getMaxRows()<neededRows)sh.insertRowsAfter(sh.getMaxRows(),neededRows-sh.getMaxRows());
  const neededCols=Math.max(1,Number(requiredCols)||1);
  if(sh.getMaxColumns()<neededCols)sh.insertColumnsAfter(sh.getMaxColumns(),neededCols-sh.getMaxColumns());
}
function apLmsAppend_(name,obj) {
  const sheet=apLmsSheet_(name),h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const row=h.map(k=>Object.prototype.hasOwnProperty.call(obj,k)?obj[k]:'');
  apLmsEnsureWriteCapacity_(sheet,1,row.length);
  sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
}
function apLmsFind_(name,col,value) {
  const sh=apLmsSheet_(name),c=apLmsCol_(sh,col);
  if(sh.getLastRow()<2)return null;
  const found=sh.getRange(2,c,sh.getLastRow()-1,1).createTextFinder(apLmsStr_(value)).matchEntireCell(true).findNext();
  if(!found||found.getRow()<2)return null;
  const heads=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const row=sh.getRange(found.getRow(),1,1,heads.length).getValues()[0];
  return {row:found.getRow(),record:Object.fromEntries(heads.map((k,i)=>[k,row[i]]))};
}
function apLmsHashPin_(sid,pin,salt) { return sha256Hex_(apLmsSecret_()+'|'+sid+'|'+salt+'|'+pin); }
function apLmsAccess_(sid) {
  const cache=CacheService.getScriptCache(),key='AP_LMS_ACC_'+sha256Hex_(sid).slice(0,34);
  const warm=cache.get(key);if(warm)return JSON.parse(warm);
  const found=apLmsFind_('LMS_UserAccess','StudentID',sid);
  const value=found?found.record:null;
  if(value)cache.put(key,JSON.stringify(value),30);
  return value;
}
function apLmsPinAdmin(p) {
  assertAdminAuth_(p);
  const grade=apLmsStr_(p.grade),cls=apLmsStr_(p.class_id);
  if(!grade||!cls)throw new Error('Chọn khối và lớp để cấp mã PIN.');
  const students=getSheetData('Students').filter(s=>apLmsStr_(s.grade)===grade && normalizeClassName(s.class)===normalizeClassName(cls));
  if(!students.length)throw new Error('Lớp chưa có học sinh trong bảng Students.');
  if(students.length>80)throw new Error('Mỗi đợt cấp mã tối đa 80 học sinh.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    const sh=apLmsSheet_('LMS_UserAccess');
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const existing=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues():[];
    const idCol=headers.indexOf('StudentID'),map={};existing.forEach((r,i)=>map[apLmsStr_(r[idCol])]=i+2);
    const pins=[];
    students.forEach(st=>{
      const sid=apLmsStr_(st.student_id);
      const pin=String(Math.floor(Math.random()*1e6)).padStart(6,'0');
      const salt=Utilities.getUuid(), hash=apLmsHashPin_(sid,pin,salt);
      const row={StudentID:sid,PinHash:hash,PinSalt:salt,Active:'TRUE',LastLoginAt:''};
      const vals=headers.map(h=>row[h]||'');
      if(map[sid])sh.getRange(map[sid],1,1,headers.length).setValues([vals]);
      else {sh.getRange(sh.getLastRow()+1,1,1,headers.length).setValues([vals]);}
      CacheService.getScriptCache().remove('AP_LMS_ACC_'+sha256Hex_(sid).slice(0,34));
      pins.push({student_id:sid,name:apLmsStr_(st.name),pin:pin});
    });
    return {count:pins.length,pins,warning:'Chỉ hiển thị PIN một lần. Cấp lại sẽ vô hiệu các phiên học sinh cũ trong vòng 30 giây.'};
  } finally {lock.releaseLock();}
}
function apLmsLogin(p) {
  const sid=apLmsStr_(p.student_id),pin=apLmsStr_(p.pin);
  if(!sid||!/^\d{6}$/.test(pin))throw new Error('Chọn học sinh và nhập mã PIN gồm 6 chữ số.');
  const cache=CacheService.getScriptCache(),key='AP_LMS_FAIL_'+sha256Hex_(sid).slice(0,24);
  if(Number(cache.get(key)||0)>=5)throw new Error('Sai PIN quá 5 lần. Vui lòng thử lại sau 15 phút.');
  const access=apLmsAccess_(sid);
  const matched=access&&String(access.Active).toUpperCase()==='TRUE'&&safeEquals_(apLmsHashPin_(sid,pin,access.PinSalt),String(access.PinHash));
  if(!matched){cache.put(key,String(Number(cache.get(key)||0)+1),900);throw new Error('Học sinh hoặc mã PIN không hợp lệ.');}
  const student=getSheetData('Students').find(x=>apLmsStr_(x.student_id)===sid);
  if(!student)throw new Error('Học sinh chưa có trong dữ liệu Trung tâm.');
  cache.remove(key);
  const token=Utilities.getUuid()+Utilities.getUuid();
  cache.put('AP_LMS_SES_'+sha256Hex_(token).slice(0,40),JSON.stringify({sid,rev:access.PinHash}),AP_LMS.TOKEN_TTL);
  return {session_token:token,student:{student_id:sid,name:student.name,grade:student.grade,class_id:student.class},expires_in:AP_LMS.TOKEN_TTL};
}
/** Student login as parent: name suggestion -> registered guardian phone.
 * Narrow authorization scope: returns only an LMS session (no parent/tuition data).
 */
function apLmsPhoneLogin(p) {
  p=p||{};
  consumeGlobalRateLimit_('LMS_PHONE_LOGIN',120,60);
  consumeRateLimit_('LMS_PHONE_LOGIN',p,10,600,'Thử đăng nhập quá nhiều. Vui lòng chờ ít phút.');
  const sid=apLmsStr_(p.student_id);
  const phone=normalizeVietnamPhone(p.parent_phone);
  if(!sid||!/^0\d{9}$/.test(phone))throw new Error('Chọn học sinh và nhập đúng số điện thoại 10 chữ số đã đăng ký.');
  const cache=CacheService.getScriptCache(),key='AP_LMS_PH_FAIL_'+sha256Hex_(sid).slice(0,26);
  if(Number(cache.get(key)||0)>=5)throw new Error('Đã nhập sai nhiều lần. Thử lại sau 10 phút.');
  // Reuse parent lookup index cached by the existing system, not a full Students read on every login.
  const student=getPublicStudentSearchIndex_().find(st=>apLmsStr_(st.student_id)===sid);
  const success=student&&safeEquals_(normalizeVietnamPhone(student.parent_phone),phone);
  if(!success){cache.put(key,String(Number(cache.get(key)||0)+1),600);throw new Error('Thông tin học sinh hoặc số điện thoại không khớp.');}
  cache.remove(key);
  const token=Utilities.getUuid()+Utilities.getUuid();
  const rev=sha256Hex_(apLmsSecret_()+'|PHONE|'+sid+'|'+phone);
  cache.put('AP_LMS_SES_'+sha256Hex_(token).slice(0,40),JSON.stringify({sid,method:'PHONE',rev}),AP_LMS.TOKEN_TTL);
  return {session_token:token,student:{student_id:sid,name:student.name,grade:student.grade,class_id:student.class},expires_in:AP_LMS.TOKEN_TTL};
}
function apLmsStudent_(p) {
  const token=apLmsStr_(p.session_token);
  if(!token)throw new Error('LMS_UNAUTHORIZED: Vui lòng đăng nhập học sinh.');
  const raw=CacheService.getScriptCache().get('AP_LMS_SES_'+sha256Hex_(token).slice(0,40));
  if(!raw)throw new Error('LMS_UNAUTHORIZED: Phiên học sinh hết hạn. Vui lòng đăng nhập lại.');
  const session=JSON.parse(raw);
  const student=getPublicStudentSearchIndex_().find(x=>apLmsStr_(x.student_id)===session.sid);
  if(!student)throw new Error('LMS_UNAUTHORIZED: Không tìm thấy học sinh.');
  if(session.method==='PHONE') {
    const current=sha256Hex_(apLmsSecret_()+'|PHONE|'+session.sid+'|'+normalizeVietnamPhone(student.parent_phone));
    if(!safeEquals_(current,String(session.rev)))throw new Error('LMS_UNAUTHORIZED: Số điện thoại đăng ký đã thay đổi, vui lòng xác thực lại.');
  }else{
    const access=apLmsAccess_(session.sid);
    if(!access||String(access.Active).toUpperCase()!=='TRUE'||!safeEquals_(String(access.PinHash),session.rev))throw new Error('LMS_UNAUTHORIZED: Mã PIN đã thay đổi. Vui lòng đăng nhập lại.');
  }
  return student;
}
function apLmsDateMs_(x) {
  if(!x)return null;
  if(x instanceof Date)return x.getTime();
  const n=Date.parse(String(x));return Number.isFinite(n)?n:null;
}
function apLmsAssignments_() {
  const cache=CacheService.getScriptCache(),key='AP_LMS_ASG_V1';
  const warm=cache.get(key);if(warm)return JSON.parse(warm);
  const rows=apLmsObjects_('LMS_Assignments').map(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v instanceof Date?v.toISOString():v])));
  const json=JSON.stringify(rows);if(json.length<85000)cache.put(key,json,45);
  return rows;
}
function apLmsResults_(sid) {
  const cache=CacheService.getScriptCache(),key='AP_LMS_RES_'+sha256Hex_(sid).slice(0,32);
  const warm=cache.get(key);if(warm)return JSON.parse(warm);
  const sh=apLmsSheet_('LMS_Results'),c=apLmsCol_(sh,'StudentID');
  const found=sh.getLastRow()<2?[]:sh.getRange(2,c,sh.getLastRow()-1,1).createTextFinder(sid).matchEntireCell(true).findAll();
  const heads=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const rows=found.slice(-500).map(f=>{
    const cells=sh.getRange(f.getRow(),1,1,heads.length).getValues()[0];
    return Object.fromEntries(heads.map((h,i)=>[h,cells[i] instanceof Date?cells[i].toISOString():cells[i]]));
  });
  const json=JSON.stringify(rows);if(json.length<85000)cache.put(key,json,12);
  return rows;
}
function apLmsLevels_(results,assignmentId) {
  const records=results.filter(x=>apLmsStr_(x.AssignmentID)===assignmentId);
  const scores=[1,2,3].map(level=>{
    const r=records.filter(x=>Number(x.Level)===level).map(x=>Number(x.Score));
    return r.length?Math.max.apply(null,r):null;
  });
  return {scores,unlocked:[true,scores[0]!==null&&scores[0]>=AP_LMS.PASS,scores[1]!==null&&scores[1]>=AP_LMS.PASS]};
}
function apLmsMatches_(a,st) {
  return apLmsStr_(a.Grade)===apLmsStr_(st.grade)&&(!apLmsStr_(a.ClassID)||normalizeClassName(a.ClassID)===normalizeClassName(st.class));
}
function apLmsDashboard(p) {
  const st=apLmsStudent_(p),now=Date.now(),results=apLmsResults_(apLmsStr_(st.student_id));
  const assignments=apLmsAssignments_().filter(a=>String(a.Status).toUpperCase()==='ACTIVE'&&apLmsMatches_(a,st))
    .filter(a=>!apLmsDateMs_(a.StartAt)||apLmsDateMs_(a.StartAt)<=now)
    .map(a=>({assignment_id:apLmsStr_(a.AssignmentID),title:apLmsStr_(a.Title),chapter:apLmsStr_(a.Topic),due_at:a.DueAt||'',expired:!!apLmsDateMs_(a.DueAt)&&apLmsDateMs_(a.DueAt)<now,levels:apLmsLevels_(results,apLmsStr_(a.AssignmentID))}));
  return {student:{student_id:st.student_id,name:st.name,grade:st.grade,class_id:st.class},assignments,completed:assignments.filter(a=>a.levels.scores[2]!==null&&a.levels.scores[2]>=AP_LMS.PASS).length,pending:assignments.filter(a=>a.levels.scores[2]===null||a.levels.scores[2]<AP_LMS.PASS).length};
}
function apLmsCatalog(p) {
  assertAdminAuth_(p);
  const bank=apLmsGetBank_(),values=bank.getDataRange().getValues();
  const h=values[0].map(String),ix=k=>h.indexOf(k),map=new Map();
  values.slice(1).forEach(r=>{
    if(apLmsStr_(r[ix('Status')])!=='READY')return;
    const lev=Number(r[ix('LMS_Level')]);if(lev<1||lev>3)return;
    const grade=apLmsStr_(r[ix('Grade')]),chapter=apLmsStr_(r[ix('Chapter')]);
    if(!grade||!chapter)return;
    const key=grade+'|'+chapter,v=map.get(key)||{grade,chapter,counts:[0,0,0]};
    v.counts[lev-1]++;map.set(key,v);
  });
  const catalog=Array.from(map.values()).filter(x=>x.counts.every(n=>n>=AP_LMS.PACK_SIZE)).sort((a,b)=>Number(a.grade)-Number(b.grade)||a.chapter.localeCompare(b.chapter,'vi'));
  return {catalog,assignments:apLmsAssignments_(),bank_id_tail:PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK).slice(-6)};
}
function apLmsCreateAssignment(p) {
  assertAdminAuth_(p);
  const grade=apLmsStr_(p.grade),chapter=apLmsStr_(p.chapter),cls=apLmsStr_(p.class_id);
  const title=apLmsStr_(p.title).slice(0,130)||chapter;
  if(!grade||!chapter||!title)throw new Error('Chọn khối, chương và tiêu đề.');
  const due=apLmsStr_(p.due_at),dueMs=apLmsDateMs_(due);
  if(due&&!dueMs)throw new Error('Hạn nộp không hợp lệ.');
  if(dueMs&&dueMs<=Date.now())throw new Error('Hạn nộp phải trong tương lai.');
  const requested=[1,2,3].map(level=>apLmsStr_(p['level'+level+'_ids']).split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean));
  const byId=requested.some(ids=>ids.length>0);
  const data=apLmsGetBank_().getDataRange().getValues(),h=data[0].map(String),idx=k=>h.indexOf(k);
  const buckets=[[],[],[]],uids=new Set();
  data.slice(1).forEach(r=>{
    if(apLmsStr_(r[idx('Status')])!=='READY'||apLmsStr_(r[idx('Grade')])!==grade||(!byId&&apLmsStr_(r[idx('Chapter')])!==chapter))return;
    const level=Number(r[idx('LMS_Level')]);if(level<1||level>3)return;
    const uid=apLmsStr_(r[idx('QuestionUID')]),ans=apLmsStr_(r[idx('CorrectAnswer')]).toUpperCase();
    if(!uid||uids.has(uid)||!['A','B','C','D'].includes(ans))return;
    if(['Question','A','B','C','D'].some(k=>!apLmsStr_(r[idx(k)])))return;
    uids.add(uid);
    buckets[level-1].push({uid,question:apLmsStr_(r[idx('Question')]),options:['A','B','C','D'].map(k=>apLmsStr_(r[idx(k)])),answer:ans,explanation:apLmsStr_(r[idx('Explanation')])});
  });
  // Optional: choose 10 exact QuestionUID values per level, never an exam code.
  if(byId){
    if(requested.some(ids=>ids.length!==AP_LMS.PACK_SIZE))throw new Error('Chọn đúng 10 QuestionUID khác nhau cho MỖI cấp độ.');
    const picked=new Set();
    requested.forEach((ids,i)=>{
      const lookup=new Map(buckets[i].map(q=>[q.uid,q]));
      const chosen=ids.map(uid=>{
        if(picked.has(uid))throw new Error('ID bị lặp trong đề: '+uid);
        const q=lookup.get(uid);
        if(!q)throw new Error('ID '+uid+' không thuộc khối và cấp độ tương ứng hoặc chưa được duyệt.');
        picked.add(uid);return q;
      });
      buckets[i]=chosen;
    });
  }
  if(buckets.some(x=>x.length<AP_LMS.PACK_SIZE))throw new Error('Chương thiếu 10 câu READY hợp lệ ở một hoặc nhiều cấp độ.');
  const aid='APL-'+Utilities.getUuid().replace(/-/g,'').slice(0,17).toUpperCase(),version=1;
  const packs=buckets.map((bucket,i)=>{
    const shuffled=bucket.slice();if(!byId)for(let k=shuffled.length-1;k>0;k--){const j=Math.floor(Math.random()*(k+1)),t=shuffled[k];shuffled[k]=shuffled[j];shuffled[j]=t;}
    const questions=shuffled.slice(0,AP_LMS.PACK_SIZE);
    const json=JSON.stringify(questions);
    if(json.length>45000)throw new Error('Gói đề quá lớn. Vui lòng chọn câu khác hoặc tối ưu hình ảnh.');
    return {PackID:aid+'|'+(i+1),AssignmentID:aid,Level:i+1,Version:version,PayloadJSON:json,CreatedAt:new Date()};
  });
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const sh=apLmsSheet_('LMS_Packs'),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    apLmsEnsureWriteCapacity_(sh,packs.length,headers.length);
    sh.getRange(sh.getLastRow()+1,1,packs.length,headers.length).setValues(packs.map(x=>headers.map(k=>x[k]||'')));
    apLmsAppend_('LMS_Assignments',{AssignmentID:aid,Title:title,Grade:grade,ClassID:cls,Topic:chapter,StartAt:new Date(),DueAt:due?new Date(due):'',Status:'ACTIVE',CreatedAt:new Date()});
    CacheService.getScriptCache().remove('AP_LMS_ASG_V1');
  } finally {lock.releaseLock();}
  return {assignment_id:aid,title,grade,class_id:cls,chapter,packs:3,items_per_pack:10};
}
function apLmsPack_(aid,level) {
  const key=aid+'|'+level,cache=CacheService.getScriptCache(),cacheKey='AP_LMS_PACK_'+sha256Hex_(key).slice(0,38);
  const warm=cache.get(cacheKey);if(warm)return JSON.parse(warm);
  const found=apLmsFind_('LMS_Packs','PackID',key);
  if(!found)throw new Error('Không tìm thấy gói đề của cấp độ này.');
  const pack=JSON.parse(String(found.record.PayloadJSON||'[]'));
  if(!Array.isArray(pack)||pack.length!==AP_LMS.PACK_SIZE)throw new Error('Gói đề không hợp lệ.');
  const json=JSON.stringify(pack);if(json.length<85000)cache.put(cacheKey,json,900);
  return pack;
}
function apLmsSignature_(payload) {
  const raw=Utilities.computeHmacSha256Signature(payload,apLmsSecret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/,'');
}
function apLmsIssueAttempt_(studentId,aid,level) {
  const raw=JSON.stringify({s:studentId,a:aid,l:level,t:Date.now(),nonce:Utilities.getUuid()});
  const part=Utilities.base64EncodeWebSafe(raw,Utilities.Charset.UTF_8).replace(/=+$/,'');
  return part+'.'+apLmsSignature_(part);
}
function apLmsCheckAttempt_(token) {
  const parts=apLmsStr_(token).split('.');
  if(parts.length!==2||!safeEquals_(apLmsSignature_(parts[0]),parts[1]))throw new Error('Phiên làm bài không hợp lệ.');
  let obj;try{obj=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));}catch(e){throw new Error('Dữ liệu phiên làm bài lỗi.');}
  if(!obj||!obj.s||!obj.a||![1,2,3].includes(Number(obj.l))||Date.now()-Number(obj.t)>7200000||Date.now()<Number(obj.t)-60000)
    throw new Error('Phiên làm bài đã hết hạn. Vui lòng mở lại bài.');
  return obj;
}
function apLmsStart(p) {
  const st=apLmsStudent_(p),aid=apLmsStr_(p.assignment_id),level=Number(p.level),now=Date.now();
  if(![1,2,3].includes(level))throw new Error('Cấp độ không hợp lệ.');
  const a=apLmsAssignments_().find(x=>apLmsStr_(x.AssignmentID)===aid);
  if(!a||apLmsStr_(a.Status).toUpperCase()!=='ACTIVE'||!apLmsMatches_(a,st))throw new Error('Học sinh không được giao bài này.');
  if(apLmsDateMs_(a.StartAt)&&apLmsDateMs_(a.StartAt)>now)throw new Error('Bài chưa mở.');
  if(apLmsDateMs_(a.DueAt)&&apLmsDateMs_(a.DueAt)<now)throw new Error('Bài đã quá hạn.');
  const levels=apLmsLevels_(apLmsResults_(apLmsStr_(st.student_id)),aid);
  if(!levels.unlocked[level-1])throw new Error('Cần đạt ít nhất 6 điểm ở cấp trước để mở cấp này.');
  const questions=apLmsPack_(aid,level).map(({uid,question,options})=>({uid,question,options}));
  return {assignment_id:aid,title:a.Title,level,questions,attempt_token:apLmsIssueAttempt_(apLmsStr_(st.student_id),aid,level),due_at:a.DueAt||''};
}
function apLmsSubmit(p) {
  const st=apLmsStudent_(p),att=apLmsCheckAttempt_(p.attempt_token),sid=apLmsStr_(st.student_id);
  if(att.s!==sid)throw new Error('Phiên làm bài không thuộc học sinh này.');
  const aid=att.a,level=Number(att.l),aidRecord=apLmsAssignments_().find(x=>apLmsStr_(x.AssignmentID)===aid);
  if(!aidRecord||apLmsStr_(aidRecord.Status).toUpperCase()!=='ACTIVE'||!apLmsMatches_(aidRecord,st))throw new Error('Bài tập đã đóng hoặc không được giao cho học sinh.');
  // Allow a small grace period for a submission started before deadline.
  const due=apLmsDateMs_(aidRecord.DueAt);
  if(due && (Number(att.t)>due || Date.now()>due+180000))throw new Error('Bài đã hết hạn nộp. Liên hệ giáo viên để gia hạn.');
  const allAnswers=p.answers;
  if(!allAnswers||typeof allAnswers!=='object'||Array.isArray(allAnswers)||Object.keys(allAnswers).length>AP_LMS.PACK_SIZE)throw new Error('Định dạng câu trả lời không hợp lệ.');
  const pack=apLmsPack_(aid,level),allowed=new Set(pack.map(q=>q.uid));
  for(const [uid,ans] of Object.entries(allAnswers))if(!allowed.has(uid)||!['A','B','C','D'].includes(apLmsStr_(ans).toUpperCase()))throw new Error('Câu trả lời chứa mục không hợp lệ.');
  const good=pack.reduce((sum,q)=>sum+(apLmsStr_(allAnswers[q.uid]).toUpperCase()===q.answer?1:0),0);
  const attemptId='AT-'+sha256Hex_(apLmsStr_(p.attempt_token)).slice(0,30),passed=good>=AP_LMS.PASS;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const existing=apLmsFind_('LMS_Results','AttemptID',attemptId);
    if(existing)return {attempt_id:attemptId,score:Number(existing.record.Score),passed:String(existing.record.Passed).toUpperCase()==='TRUE',duplicate:true,review:pack.map(q=>({uid:q.uid,answer:q.answer,explanation:q.explanation||''}))};
    const studentResults=apLmsResults_(sid);
    if(!apLmsLevels_(studentResults,aid).unlocked[level-1])throw new Error('Cấp độ trước chưa đạt yêu cầu.');
    apLmsAppend_('LMS_Results',{
      AttemptID:attemptId,AssignmentID:aid,StudentID:sid,Level:level,Score:good,Passed:passed,PublishedAt:new Date(),GradedAt:new Date(),
      AnswersJSON:JSON.stringify(allAnswers),CorrectCount:good,TotalCount:AP_LMS.PACK_SIZE
    });
    CacheService.getScriptCache().remove('AP_LMS_RES_'+sha256Hex_(sid).slice(0,32));
  } finally {lock.releaseLock();}
  return {attempt_id:attemptId,score:good,passed,duplicate:false,correct_count:good,total_count:AP_LMS.PACK_SIZE,level,review:pack.map(q=>({uid:q.uid,answer:q.answer,explanation:q.explanation||''}))};
}
function apLmsAdminAssignments(p) {
  assertAdminAuth_(p);
  const rows=apLmsAssignments_();
  return rows.slice(-100).reverse().map(x=>({assignment_id:x.AssignmentID,title:x.Title,grade:x.Grade,class_id:x.ClassID,chapter:x.Topic,status:x.Status,due_at:x.DueAt}));
}
function apLmsAdminResults(p) {
  assertAdminAuth_(p);
  const aid=apLmsStr_(p.assignment_id);
  if(!aid)throw new Error('Chọn bài được giao.');
  const asg=apLmsAssignments_().find(x=>apLmsStr_(x.AssignmentID)===aid);
  if(!asg)throw new Error('Không tìm thấy bài.');
  const students=getSheetData('Students').filter(st=>apLmsMatches_(asg,st));
  const all=apLmsObjects_('LMS_Results').filter(r=>apLmsStr_(r.AssignmentID)===aid);
  return {assignment:{title:asg.Title,chapter:asg.Topic},students:students.map(st=>{
    const id=apLmsStr_(st.student_id),lv=apLmsLevels_(all.filter(r=>apLmsStr_(r.StudentID)===id),aid);
    return {student_id:id,name:st.name,class_id:st.class,scores:lv.scores,passed_all:lv.scores[2]!==null&&lv.scores[2]>=AP_LMS.PASS};
  })};
}
function apLmsParentSummary_(studentId) {
  // Invoked ONLY after existing parent phone validation; never registered as public action.
  try {
    if (!getSpreadsheet_().getSheetByName('LMS_Assignments'))return null;
    const st=getSheetData('Students').find(s=>apLmsStr_(s.student_id)===apLmsStr_(studentId));
    if(!st)return null;
    const all=apLmsAssignments_().filter(a=>apLmsStr_(a.Status).toUpperCase()==='ACTIVE'&&apLmsMatches_(a,st));
    const results=apLmsResults_(apLmsStr_(studentId));
    const recent=all.slice(-12).reverse().map(a=>{
      const lv=apLmsLevels_(results,apLmsStr_(a.AssignmentID));
      return {title:a.Title,chapter:a.Topic,scores:lv.scores,completed:lv.scores[2]!==null&&lv.scores[2]>=AP_LMS.PASS};
    });
    return {total:all.length,completed:all.filter(a=>{const lv=apLmsLevels_(results,apLmsStr_(a.AssignmentID));return lv.scores[2]!==null&&lv.scores[2]>=AP_LMS.PASS;}).length,assignments:recent};
  }catch(e){console.warn('LMS parent summary',e);return null;}
}
