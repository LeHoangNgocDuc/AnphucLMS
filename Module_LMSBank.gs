/**
 * AN PHUC LMS BANK V1.1 - IMPORT, DEDUP, QUESTION ID SELECTION.
 * All entrypoints require an existing authenticated teacher session.
 * Existing sheets and legacy question banks are never dropped or overwritten.
 */
const AP_LMS_BANK_HEADERS = ['QuestionUID','SourceSheet','SourceRow','OriginalID','Grade','Subject','Chapter','Topic','OriginalLevel','LMS_Level','Question','A','B','C','D','CorrectAnswer','Explanation','Status','Notes'];
const AP_LMS_BANK_REVIEW = ['QuestionUID','SourceSheet','SourceRow','OriginalID','Issue','Details'];
const AP_LMS_IMPORT_HEADERS = ['ImportID','BatchID','RowJSON','CreatedAt'];
const AP_LMS_BATCH_HEADERS = ['ImportID','BatchID','Count','ReceivedAt'];
const AP_LMS_DEDUP_HEADERS = ['CheckedAt','QuestionUID','OriginalID','Action','ReferenceUID','Details'];
function apLmsBankSpreadsheet_() {
  const id=PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK);
  if (!id) throw new Error('Chưa kết nối ngân hàng LMS. Hãy tạo hoặc chọn Google Sheet ngân hàng.');
  return SpreadsheetApp.openById(id);
}
function apLmsEnsureBankSheets_() {
  const ss=apLmsBankSpreadsheet_();
  const mapping={LMS_Questions:AP_LMS_BANK_HEADERS,LMS_Review:AP_LMS_BANK_REVIEW,LMS_ImportStage:AP_LMS_IMPORT_HEADERS,LMS_ImportBatches:AP_LMS_BATCH_HEADERS,LMS_DedupLog:AP_LMS_DEDUP_HEADERS};
  Object.keys(mapping).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if (!sh) sh=ss.insertSheet(name);
    if (!sh.getLastRow()) {
      sh.getRange(1,1,1,mapping[name].length).setValues([mapping[name]]).setFontWeight('bold').setBackground('#E6F4F1');
      sh.setFrozenRows(1);
    } else {
      const head=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
      const missing=mapping[name].filter(key=>!head.includes(key));
      if (missing.length) sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
    }
  });
  return ss;
}
function apLmsNewBank(p) {
  assertAdminAuth_(p);
  if (PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK)) throw new Error('Đã có ngân hàng đang kết nối. Để tránh mất dữ liệu, dùng tính năng kết nối ngân hàng hiện có.');
  const ss=SpreadsheetApp.create('ANPHUC_LMS_DATABASE');
  PropertiesService.getScriptProperties().setProperty(AP_LMS.PROP_BANK,ss.getId());
  apLmsEnsureBankSheets_();
  const result=apLmsSetup(Object.assign({},p,{bank_spreadsheet_id:ss.getId()}));
  return {configured:true,url:ss.getUrl(),bank_id:ss.getId(),...result};
}
function apLmsConnectBank(p) {
  assertAdminAuth_(p);
  const id=apLmsStr_(p.bank_spreadsheet_id);
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id))throw new Error('ID ngân hàng không hợp lệ.');
  const source=SpreadsheetApp.openById(id);
  // Never connect to the center spreadsheet as a question bank.
  if(source.getId()===getSpreadsheet_().getId())throw new Error('Ngân hàng phải là một Google Spreadsheet RIÊNG, không sử dụng Sheet trung tâm.');
  const existing=PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK);
  if(existing&&existing!==id&&!p.confirm_switch)throw new Error('Đang kết nối ngân hàng khác. Xác nhận chuyển nguồn chỉ sau khi đã sao lưu và rà soát.');
  PropertiesService.getScriptProperties().setProperty(AP_LMS.PROP_BANK,id);
  apLmsEnsureBankSheets_();
  return apLmsSetup(Object.assign({},p,{bank_spreadsheet_id:id}));
}
function apLmsBankStatus(p) {
  assertAdminAuth_(p);
  const id=PropertiesService.getScriptProperties().getProperty(AP_LMS.PROP_BANK);
  if(!id)return {configured:false};
  const ss=apLmsEnsureBankSheets_(),sh=ss.getSheetByName('LMS_Questions');
  const data=sh.getLastRow()<2?[]:sh.getDataRange().getValues();
  const idx=data.length?data[0].indexOf('Status'):-1;
  return {configured:true,bank_id:id,bank_url:ss.getUrl(),count:Math.max(0,sh.getLastRow()-1),ready:idx<0?0:data.slice(1).filter(r=>String(r[idx]).trim().toUpperCase()==='READY').length};
}
function apLmsImportStageBatch(p) {
  assertAdminAuth_(p);
  const importId=apLmsStr_(p.import_id),batchId=apLmsStr_(p.batch_id);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(importId)||!/^[A-Za-z0-9_-]{1,60}$/.test(batchId))throw new Error('Mã đợt nhập không hợp lệ.');
  const rows=p.rows;
  if(!Array.isArray(rows)||!rows.length||rows.length>65)throw new Error('Mỗi lượt nhập từ 1 đến 65 câu hỏi.');
  // Limit payload and field count before any spreadsheet write.
  if(JSON.stringify(rows).length>260000)throw new Error('Gói dữ liệu quá lớn. Hãy giảm số câu mỗi lần gửi.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('Hệ thống đang nhập dữ liệu, vui lòng thử lại.');
  try {
    const ss=apLmsEnsureBankSheets_(),batch=ss.getSheetByName('LMS_ImportBatches'),stage=ss.getSheetByName('LMS_ImportStage');
    const batchKeys=batch.getLastRow()>1?batch.getRange(2,1,batch.getLastRow()-1,2).getValues():[];
    if(batchKeys.some(r=>String(r[0])===importId&&String(r[1])===batchId))return {count:rows.length,duplicate_batch:true};
    const normalized=rows.map((x,i)=>{
      if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Câu hỏi số '+(i+1)+' sai cấu trúc.');
      const clean={};
      ['QuestionUID','SourceSheet','SourceRow','OriginalID','Grade','Subject','Chapter','Topic','OriginalLevel','LMS_Level','Question','A','B','C','D','CorrectAnswer','Explanation','Status','Notes','Type'].forEach(k=>{
        const v=x[k]; clean[k]=(typeof v==='number'||typeof v==='string')?String(v).slice(0,k==='Question'||k==='Explanation'?18000:3500):'';
      });
      if(!['MC','MULTIPLE_CHOICE',''].includes(clean.Type.trim().toUpperCase()))throw new Error('Chỉ cho phép câu trắc nghiệm MC.');
      const raw=JSON.stringify(clean);
      if(raw.length>45000)throw new Error('Câu số '+(i+1)+' quá dài để lưu vào một ô Google Sheets.');
      return [importId,batchId,raw,new Date()];
    });
    apLmsEnsureWriteCapacity_(stage,normalized.length,4);
    stage.getRange(stage.getLastRow()+1,1,normalized.length,4).setValues(normalized);
    apLmsEnsureWriteCapacity_(batch,1,4);
    batch.getRange(batch.getLastRow()+1,1,1,4).setValues([[importId,batchId,normalized.length,new Date()]]);
    return {count:normalized.length,duplicate_batch:false};
  }finally{lock.releaseLock();}
}
function apLmsNorm_(value) {
  return apLmsStr_(value).normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
}
function apLmsContentKey_(r) {
  return [r.Grade,r.Question,r.A,r.B,r.C,r.D].map(apLmsNorm_).join('|');
}
function apLmsQuestionKey_(r) {return [r.Grade,r.Question].map(apLmsNorm_).join('|');}
function apLmsRawQuestion_(r) {
  let lvl=Number(r.LMS_Level);
  if(![1,2,3].includes(lvl)) {
    const text=apLmsNorm_(r.OriginalLevel||r.Level);
    lvl=/thong hieu|thông hiểu/.test(text)?2:/van dung|vận dụng/.test(text)?3:1;
  }
  const grade=Number(r.Grade), answer=apLmsStr_(r.CorrectAnswer).toUpperCase();
  const q={};AP_LMS_BANK_HEADERS.forEach(k=>q[k]=apLmsStr_(r[k]));
  q.Grade=Number.isInteger(grade)&&grade>=6&&grade<=12?String(grade):'';
  q.LMS_Level=lvl;
  q.CorrectAnswer=answer;
  q.Subject=q.Subject||'Toán';
  q.Status=['REVIEW','DUPLICATE'].includes(q.Status.toUpperCase())?q.Status.toUpperCase():'READY';
  const original=apLmsStr_(r.QuestionUID);
  q.QuestionUID=/^[\w-]{7,80}$/.test(original)?original:'APQ-'+sha256Hex_(apLmsContentKey_(q)+'|'+answer).slice(0,20).toUpperCase();
  const issue=[];
  if(!q.Grade)issue.push('Khối không hợp lệ');
  if(!q.Chapter)issue.push('Thiếu chương');
  if(!q.Question||['A','B','C','D'].some(k=>!q[k]))issue.push('Thiếu câu hỏi hoặc phương án');
  if(!['A','B','C','D'].includes(answer))issue.push('Đáp án phải là A/B/C/D');
  if(issue.length){q.Status='REVIEW';q.Notes=(q.Notes? q.Notes+'; ':'')+issue.join('; ');}
  // Prevent Excel / Sheets formula injection in user-supplied text cells.
  ['Question','A','B','C','D','Explanation','OriginalID','Notes','Chapter','Topic'].forEach(k=>{
    if(/^\s*[=+@]/.test(q[k]))q[k]="'"+q[k];
  });
  return q;
}
function apLmsImportFinalize(p) {
  assertAdminAuth_(p);
  const importId=apLmsStr_(p.import_id);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(importId))throw new Error('Đợt nhập không hợp lệ.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(25000))throw new Error('Đang có thao tác khác ghi ngân hàng. Vui lòng thử lại.');
  try {
    const ss=apLmsEnsureBankSheets_(),stage=ss.getSheetByName('LMS_ImportStage');
    const importData=stage.getLastRow()>1?stage.getRange(2,1,stage.getLastRow()-1,3).getValues():[];
    const incoming=importData.filter(r=>String(r[0])===importId);
    if(!incoming.length)throw new Error('Không tìm thấy câu hỏi đã tải lên.');
    if(incoming.length>20000)throw new Error('Một đợt nhập tối đa 20.000 câu.');
    const sheet=ss.getSheetByName('LMS_Questions');
    const data=sheet.getDataRange().getValues(),header=data[0].map(String),toObj=row=>Object.fromEntries(header.map((h,i)=>[h,row[i]]));
    const content=new Map(),question=new Map(),id=new Map();
    data.slice(1).forEach(row=>{
      const q=toObj(row),c=apLmsContentKey_(q),k=apLmsQuestionKey_(q);
      if(!content.has(c))content.set(c,q);
      if(!question.has(k))question.set(k,q);
      id.set(apLmsStr_(q.QuestionUID),q);
    });
    let added=0,duplicate=0,review=0;
    const additions=[],reviews=[],logs=[],doneAt=new Date();
    incoming.forEach((entry,i)=>{
      let r;try{r=JSON.parse(String(entry[2]));}catch(e){throw new Error('Bản ghi nhập thứ '+(i+1)+' bị lỗi JSON.');}
      const q=apLmsRawQuestion_(r),c=apLmsContentKey_(q),key=apLmsQuestionKey_(q);
      const same=content.get(c),variant=question.get(key),existingId=id.get(q.QuestionUID);
      if(same) {
        if(apLmsNorm_(same.CorrectAnswer)===apLmsNorm_(q.CorrectAnswer)){
          duplicate++;
          logs.push([doneAt,q.QuestionUID,q.OriginalID,'SKIP_EXACT_DUPLICATE',same.QuestionUID,'Trùng hoàn toàn nội dung và đáp án']);
          return;
        }
        q.Status='REVIEW';q.Notes=[q.Notes,'Cùng câu/phương án nhưng khác đáp án với '+same.QuestionUID].filter(Boolean).join('; ');
      } else if(variant) {
        q.Status='REVIEW';q.Notes=[q.Notes,'Cùng nội dung câu hỏi, khác lựa chọn: '+variant.QuestionUID].filter(Boolean).join('; ');
      }
      if(existingId) {
        q.Status='REVIEW';q.Notes=[q.Notes,'ID câu hỏi bị trùng với '+existingId.QuestionUID].filter(Boolean).join('; ');
        q.QuestionUID='APQ-'+sha256Hex_(c+'|'+q.CorrectAnswer+'|'+i+'|'+importId).slice(0,20).toUpperCase();
      }
      if(q.Status==='REVIEW'){
        review++;
        reviews.push([q.QuestionUID,q.SourceSheet,q.SourceRow,q.OriginalID,'IMPORT_REVIEW',q.Notes]);
      }
      additions.push(header.map(k=>q[k]===undefined?'':q[k]));
      content.set(c,q);question.set(key,q);id.set(q.QuestionUID,q);added++;
      logs.push([doneAt,q.QuestionUID,q.OriginalID,q.Status==='REVIEW'?'IMPORT_REVIEW':'IMPORT_READY',variant?.QuestionUID||'',q.Notes||'']);
    });
    if(additions.length) {
      // A single bounded range write rather than appendRow per question.
      apLmsEnsureWriteCapacity_(sheet,additions.length,header.length);
      sheet.getRange(sheet.getLastRow()+1,1,additions.length,header.length).setValues(additions);
    }
    if(reviews.length) {
      const sh=ss.getSheetByName('LMS_Review');apLmsEnsureWriteCapacity_(sh,reviews.length,6);sh.getRange(sh.getLastRow()+1,1,reviews.length,6).setValues(reviews);
    }
    if(logs.length) {
      const sh=ss.getSheetByName('LMS_DedupLog');apLmsEnsureWriteCapacity_(sh,logs.length,6);sh.getRange(sh.getLastRow()+1,1,logs.length,6).setValues(logs);
    }
    // Retain import stage as an audit / retry source; duplicate batches are harmless.
    CacheService.getScriptCache().remove('AP_LMS_CATALOG_V2');
    return {incoming:incoming.length,added,duplicate,review,bank_total:sheet.getLastRow()-1};
  }finally{lock.releaseLock();}
}
function apLmsDeduplicate(p) {
  assertAdminAuth_(p);
  const lock=LockService.getScriptLock();if(!lock.tryLock(25000))throw new Error('Ngân hàng đang được chỉnh sửa.');
  try {
    const ss=apLmsEnsureBankSheets_(),sh=ss.getSheetByName('LMS_Questions');
    if(sh.getLastRow()<3)return {scanned:Math.max(0,sh.getLastRow()-1),duplicates:0,conflicts:0};
    const rows=sh.getDataRange().getValues(),h=rows[0].map(String),idx=k=>h.indexOf(k),statuses=[],notes=[],content=new Map(),questions=new Map(),logs=[],reviews=[];
    let duplicates=0,conflicts=0;
    rows.slice(1).forEach((r,i)=>{
      const obj=Object.fromEntries(h.map((k,j)=>[k,r[j]])),ck=apLmsContentKey_(obj),qk=apLmsQuestionKey_(obj),status=apLmsStr_(obj.Status),uid=apLmsStr_(obj.QuestionUID);
      const prev=content.get(ck),other=questions.get(qk);
      let newStatus=status,newNotes=apLmsStr_(obj.Notes);
      if(prev&&apLmsNorm_(prev.CorrectAnswer)===apLmsNorm_(obj.CorrectAnswer)){
        if(status==='READY')newStatus='DUPLICATE';duplicates++;
        logs.push([new Date(),uid,obj.OriginalID,'DUPLICATE',prev.QuestionUID,'Trùng nội dung, phương án và đáp án']);
      }else if(prev||other){
        if(status==='READY')newStatus='REVIEW';conflicts++;
        const ref=(prev||other).QuestionUID;
        const msg='Cần rà soát khác biệt với ID '+ref;
        if(!newNotes.includes(msg))newNotes=(newNotes?newNotes+'; ':'')+msg;
        reviews.push([uid,obj.SourceSheet,obj.SourceRow,obj.OriginalID,'CONTENT_CONFLICT',msg]);
        logs.push([new Date(),uid,obj.OriginalID,'REVIEW_CONFLICT',ref,msg]);
      }
      if(!prev)content.set(ck,obj);if(!other)questions.set(qk,obj);
      statuses.push([newStatus]);notes.push([newNotes]);
    });
    sh.getRange(2,idx('Status')+1,statuses.length,1).setValues(statuses);
    sh.getRange(2,idx('Notes')+1,notes.length,1).setValues(notes);
    if(reviews.length){const rs=ss.getSheetByName('LMS_Review');apLmsEnsureWriteCapacity_(rs,reviews.length,6);rs.getRange(rs.getLastRow()+1,1,reviews.length,6).setValues(reviews);}
    if(logs.length){const ls=ss.getSheetByName('LMS_DedupLog');apLmsEnsureWriteCapacity_(ls,logs.length,6);ls.getRange(ls.getLastRow()+1,1,logs.length,6).setValues(logs);}
    return {scanned:statuses.length,duplicates,conflicts};
  }finally{lock.releaseLock();}
}
function apLmsQuestionLookup(p) {
  assertAdminAuth_(p);
  const grade=apLmsStr_(p.grade),level=Number(p.level||0),term=apLmsNorm_(p.term);
  if(!grade)throw new Error('Chọn khối cần tra cứu.');
  const sheet=apLmsGetBank_(),data=sheet.getDataRange().getValues(),h=data[0].map(String),ix=k=>h.indexOf(k),rows=[];
  for(const row of data.slice(1)){
    if(String(row[ix('Grade')])!==grade||String(row[ix('Status')]).toUpperCase()!=='READY')continue;
    if(level&&Number(row[ix('LMS_Level')])!==level)continue;
    const uid=apLmsStr_(row[ix('QuestionUID')]),original=apLmsStr_(row[ix('OriginalID')]),chapter=apLmsStr_(row[ix('Chapter')]),txt=apLmsStr_(row[ix('Question')]);
    if(term&&![uid,original,chapter,txt].some(s=>apLmsNorm_(s).includes(term)))continue;
    rows.push({uid,original_id:original,grade,level:Number(row[ix('LMS_Level')]),chapter,question:txt.slice(0,280)});
    if(rows.length>=60)break;
  }
  return rows;
}
