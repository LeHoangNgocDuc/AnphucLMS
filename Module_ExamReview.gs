// ============================================================================
// V4.20 - MODULE CHẤM BÀI: GIÁO VIÊN DUYỆT / ĐIỂM CHÍNH THỨC
// ============================================================================

function v420UpsertScoreFromSubmission_(sub,exam,finalScore,comment){
  const sh=v420Sheet_('Scores'),headers=v420Headers_(sh),scoreId='AIEXAM_'+sub.submission_id,found=v420FindRowById_(sh,'score_id',scoreId); const row={score_id:scoreId,student_id:sub.student_id,name:sub.student_name,grade:sub.grade,class:sub.class,test_date:exam.exam_date,test_type:exam.exam_type,test_title:exam.title,score:finalScore,comment:comment||'',created_at:v420Now_()};
  if(found.row){const cur=v420GetRowObject_(sh,found.row,found.headers);Object.keys(row).forEach(k=>{if(found.headers.includes(k))cur[k]=row[k];});sh.getRange(found.row,1,1,found.headers.length).setValues([v420ObjectToRow_(found.headers,cur)]);} else sh.getRange(sh.getLastRow()+1,1,1,headers.length).setValues([v420ObjectToRow_(headers,row)]);
  return row;
}
function v420AuditReview_(sub,action,oldScore,newScore,note,user){
  try{v420AppendObject_(v420Sheet_(V420_EXAM_SHEETS.reviews),{review_id:generateId('REV'),submission_id:sub.submission_id,exam_id:sub.exam_id,action:action||'REVIEW',old_score:oldScore,new_score:newScore,note:String(note||''),reviewed_by:String(user||'admin'),created_at:v420Now_()});}catch(e){console.warn(e);}
}
function reviewExamSubmission(params){
  params=params||{}; const sub=getExamSubmission({submission_id:params.submission_id}),exam=getExamDefinition({exam_id:sub.exam_id}); if(!sub.student_id)throw new Error('Chưa xác định học sinh. Hãy chọn học sinh trước khi duyệt.');
  const aiScore=Number(sub.ai_score||0),teacherRaw=String(params.teacher_score??'').trim(),teacherScore=teacherRaw===''?aiScore:Number(teacherRaw); if(!Number.isFinite(teacherScore))throw new Error('Điểm giáo viên không hợp lệ.');
  const finalScore=v420Clamp_(teacherScore,0,Number(exam.total_score||10)),teacherFeedback=String(params.teacher_feedback||sub.ai_feedback||'').trim(),parentFeedback=String(params.parent_feedback||sub.parent_feedback||teacherFeedback).trim();
  const patch={teacher_score:teacherRaw===''?'':teacherScore,final_score:finalScore,status:'APPROVED',reviewed_at:v420Now_(),updated_at:v420Now_(),ai_feedback:teacherFeedback,parent_feedback:parentFeedback,parent_view_ready:'TRUE'}; const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,patch);
  v420UpsertScoreFromSubmission_(updated,exam,finalScore,parentFeedback||teacherFeedback); v420AuditReview_(sub,'APPROVE',sub.final_score||sub.ai_score||'',finalScore,teacherFeedback,params.reviewed_by||'admin'); bumpDataVersion_('exam_review');
  let sendResult=null; if(String(params.send_parent)==='true'||params.send_parent===true)sendResult=sendExamResultToParent({submission_id:sub.submission_id});
  return {submission:Object.assign({},updated,{grading:v420Json_(updated.grading_json,{})}),score_saved:true,zalo:sendResult};
}
function returnExamSubmissionForRegrade(params){
  const sub=getExamSubmission({submission_id:params.submission_id}); const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,{status:'UPLOADED',ai_status:'PENDING',teacher_score:'',final_score:'',reviewed_at:'',parent_view_ready:'FALSE',updated_at:v420Now_()}); v420AuditReview_(sub,'REOPEN',sub.final_score||'', '',params.note||'Mở lại để chấm',params.reviewed_by||'admin'); bumpDataVersion_('exam_reopen'); return updated;
}
function getExamReviewQueue(params){
  params=params||{}; let rows=getExamSubmissions({exam_id:params.exam_id||''}); return rows.filter(r=>['REVIEW_NEEDED','AI_DONE','APPROVED','ERROR'].includes(String(r.status||'').toUpperCase()));
}


function v422NormalizeAnnotations_(value){
  const src=v420Json_(value,{version:'V4.22',items:[]})||{},items=Array.isArray(src.items)?src.items:[];
  const clean=items.slice(0,300).map((a,i)=>({
    id:String(a.id||('ANN_'+(i+1))).slice(0,60),
    page:Math.max(1,Math.min(50,Number(a.page||1))),
    x:v420Clamp_(a.x,0,1),y:v420Clamp_(a.y,0,1),w:v420Clamp_(a.w||0.18,0.02,0.95),h:v420Clamp_(a.h||0.04,0.015,0.35),
    kind:String(a.kind||'note').slice(0,30),text:String(a.text||'').replace(/\s+/g,' ').trim().slice(0,220),
    color:'#DC2626',question:String(a.question||'').slice(0,60),source:String(a.source||'TEACHER').slice(0,30),confidence:v420Clamp_(a.confidence||100,0,100)
  })).filter(a=>a.text);
  return {version:'V4.22',template:String(src.template||V422_SHEET_TEMPLATE),items:clean,updated_at:new Date().toISOString()};
}

function saveExamSubmissionAnnotations(params){
  params=params||{}; const id=String(params.submission_id||'').trim(); if(!id)throw new Error('Thiếu submission_id.');
  const sub=getExamSubmission({submission_id:id}); const ann=v422NormalizeAnnotations_(params.annotation_json||params.annotation||{items:[]});
  const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',id,{annotation_json:JSON.stringify(ann),annotated_at:v420Now_(),updated_at:v420Now_()});
  v420AuditReview_(sub,'ANNOTATION_EDIT',sub.final_score||sub.ai_score||'',sub.final_score||sub.ai_score||'','GV chỉnh lớp chấm trên bài',params.reviewed_by||'admin');
  bumpDataVersion_('exam_annotation_edit'); return Object.assign({},updated,{annotation:ann});
}
