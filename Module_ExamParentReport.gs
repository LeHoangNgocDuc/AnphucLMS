// ============================================================================
// V4.22 - KET QUA CHAM BAI -> ZALO + PARENT PORTAL VIEWER
// Chi bai APPROVED + parent_view_ready=TRUE moi duoc cap token cho phu huynh.
// File Drive khong public. Parent nhan base64 qua token ngan han sau khi da xac thuc SĐT.
// ============================================================================

function v420ExamParentMessage_(sub,exam){
  const g=v420Json_(sub.grading_json,{}), obj=g.objective||g.mcq||{}, essay=g.essay||{}; const lines=[];
  lines.push(`Trung tâm An Phúc Education gửi kết quả ${exam.title||'bài kiểm tra'} ngày ${exam.exam_date||''}.`);
  lines.push(`Học sinh: ${sub.student_name||''} - Lớp ${sub.grade||''}${sub.class||''}`);
  lines.push(`Điểm chính thức: ${sub.final_score||sub.teacher_score||sub.ai_score||'--'}/${exam.total_score||10}.`);
  if(obj.max_score!==undefined)lines.push(`Phần khách quan: ${obj.score||0}/${obj.max_score||0}.`);
  if(essay.max_score!==undefined)lines.push(`Phần tự luận: ${essay.score||0}/${essay.max_score||0}.`);
  const fb=String(sub.parent_feedback||sub.ai_feedback||'').trim(); if(fb)lines.push('Nhận xét: '+fb);
  lines.push('Phụ huynh có thể vào Cổng Phụ huynh của Trung tâm để xem trực tiếp bài đã chấm và nhận xét trên từng câu.');
  lines.push('Trân trọng!'); return lines.join('\n');
}

function sendExamResultToParent(params){
  params=params||{}; const sub=getExamSubmission({submission_id:params.submission_id}); if(String(sub.status||'').toUpperCase()!=='APPROVED')throw new Error('Chỉ gửi kết quả sau khi giáo viên duyệt.');
  const exam=getExamDefinition({exam_id:sub.exam_id}),student=v420StudentById_(sub.student_id); if(!student)throw new Error('Không tìm thấy học sinh.');
  const phone=normalizeVietnamPhone(student.parent_phone),zaloName=String(student.zalo_name||'').trim(); if(!phone&&!zaloName)throw new Error('Học sinh chưa có SĐT/Tên Zalo phụ huynh.'); const msg=v420ExamParentMessage_(sub,exam); const dedupe=`EXAM_RESULT|${sub.submission_id}|${sub.final_score}`;
  const queued=queueZaloMessage(student.student_id,student.name,phone,'EXAM_RESULT','',new Date().getFullYear(),msg,zaloName,{class_name:`${student.grade}${student.class}`,dedupe_key:dedupe,request_id:dedupe});
  v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,{sent_parent_at:v420Now_(),parent_view_ready:'TRUE',updated_at:v420Now_()}); bumpDataVersion_('exam_parent_queue'); return {queued:queued.queued||0,duplicate:queued.duplicate||0,message:msg};
}
function sendApprovedExamResultsBulk(params){
  params=params||{}; const rows=getExamSubmissions({exam_id:params.exam_id}).filter(s=>String(s.status||'').toUpperCase()==='APPROVED'&&!s.sent_parent_at); let queued=0,duplicate=0,failed=[];
  rows.forEach(s=>{try{const r=sendExamResultToParent({submission_id:s.submission_id});queued+=Number(r.queued||0);duplicate+=Number(r.duplicate||0);}catch(e){failed.push({submission_id:s.submission_id,student_name:s.student_name,error:String(e.message||e)});}}); return {queued,duplicate,failed};
}

function v422ParentExamTokenKey_(token){return 'AP422_EXAM_VIEW_'+sha256Hex_(String(token||'')).slice(0,40);}
function v422IssueParentExamToken_(sub){
  const token=('PEX_'+Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')).slice(0,70);
  const payload={submission_id:String(sub.submission_id),student_id:String(sub.student_id),exam_id:String(sub.exam_id),issued_at:Date.now()};
  CacheService.getScriptCache().put(v422ParentExamTokenKey_(token),JSON.stringify(payload),3600); return token;
}
function v422ResolveParentExamToken_(token){
  token=String(token||'').trim(); if(!token)throw new Error('Thiếu mã xem bài.');
  const raw=CacheService.getScriptCache().get(v422ParentExamTokenKey_(token)); if(!raw)throw new Error('Phiên xem bài đã hết hạn. Quý phụ huynh vui lòng xác thực lại học sinh.');
  let p; try{p=JSON.parse(raw);}catch(e){throw new Error('Mã xem bài không hợp lệ.');}
  const sub=getExamSubmission({submission_id:p.submission_id});
  if(String(sub.student_id)!==String(p.student_id)||String(sub.status||'').toUpperCase()!=='APPROVED'||String(sub.parent_view_ready||'').toUpperCase()!=='TRUE')throw new Error('Bài chưa sẵn sàng cho phụ huynh xem.');
  return {token:token,payload:p,submission:sub};
}
function getParentApprovedExamSummaries_(studentId){
  const rows=getSheetData(V420_EXAM_SHEETS.submissions).filter(s=>String(s.student_id)===String(studentId)&&String(s.status||'').toUpperCase()==='APPROVED'&&String(s.parent_view_ready||'').toUpperCase()==='TRUE');
  const exams=getSheetData(V420_EXAM_SHEETS.definitions), examMap={}; exams.forEach(e=>examMap[String(e.exam_id)]=e);
  return rows.slice().sort((a,b)=>String(b.reviewed_at||b.updated_at||'').localeCompare(String(a.reviewed_at||a.updated_at||''))).slice(0,20).map(s=>{
    const e=examMap[String(s.exam_id)]||{},g=v420Json_(s.grading_json,{}),ids=v420Json_(s.file_ids_json,[]);
    return {view_token:v422IssueParentExamToken_(s),title:e.title||'Bài kiểm tra',exam_date:String(e.exam_date||''),exam_type:String(e.exam_type||''),score:s.final_score||s.teacher_score||s.ai_score||'',total_score:Number(e.total_score||10),parent_feedback:String(s.parent_feedback||s.ai_feedback||''),objective_score:(g.objective||g.mcq||{}).score,objective_max:(g.objective||g.mcq||{}).max_score,essay_score:(g.essay||{}).score,essay_max:(g.essay||{}).max_score,page_files:ids.length};
  });
}
function getParentGradedExam(params){
  const r=v422ResolveParentExamToken_(params&&params.view_token),sub=r.submission,exam=getExamDefinition({exam_id:sub.exam_id}),g=v420Json_(sub.grading_json,{}),ann=v420Json_(sub.annotation_json,{version:'V4.22',items:[]}),ids=sub.file_ids||[],names=sub.file_names||[];
  const assets=ids.map((id,i)=>{try{const f=DriveApp.getFileById(id);return{asset_index:i,file_name:names[i]||f.getName(),mime_type:f.getMimeType()||'application/octet-stream'};}catch(e){return{asset_index:i,file_name:names[i]||('Trang '+(i+1)),mime_type:'application/octet-stream'};}});
  return {title:exam.title||'Bài kiểm tra',exam_date:exam.exam_date||'',student_name:sub.student_name||'',class_info:`K${sub.grade||''}-${sub.class||''}`,score:sub.final_score||sub.teacher_score||sub.ai_score||'',total_score:Number(exam.total_score||10),parent_feedback:String(sub.parent_feedback||sub.ai_feedback||''),grading:{objective:g.objective||g.mcq||{},essay:g.essay||{},confidence:g.confidence||sub.confidence||0},annotation:ann,assets:assets};
}
function getParentGradedExamAsset(params){
  const r=v422ResolveParentExamToken_(params&&params.view_token),sub=r.submission,idx=Math.max(0,Number(params.asset_index||0)),ids=sub.file_ids||[];
  if(idx>=ids.length)throw new Error('Không tìm thấy trang bài làm.');
  const file=DriveApp.getFileById(ids[idx]),blob=file.getBlob(),bytes=blob.getBytes(); if(bytes.length>9*1024*1024)throw new Error('Trang bài làm quá lớn để xem trực tiếp.');
  return {asset_index:idx,file_name:file.getName(),mime_type:blob.getContentType()||'application/octet-stream',size:bytes.length,base64:Utilities.base64Encode(bytes)};
}
