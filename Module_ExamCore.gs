// ============================================================================
// V4.22 - MODULE CHẤM BÀI: CORE / ĐỀ KIỂM TRA
// Tách riêng để không làm nặng Code.gs. Mọi API vẫn đi qua routeRequest().
// ============================================================================

const V420_EXAM_SHEETS = {
  definitions: 'ExamDefinitions',
  submissions: 'ExamSubmissions',
  aiLogs: 'AIGradingLogs',
  reviews: 'ExamReviewAudit'
};

function v420Now_(){ return new Date(); }
function v420IsoDate_(d){ return Utilities.formatDate(d || new Date(), 'GMT+7', 'yyyy-MM-dd'); }
function v420Json_(value, fallback){
  if (value === null || value === undefined || value === '') return fallback === undefined ? null : fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch(e) { return fallback === undefined ? null : fallback; }
}
function v420Clamp_(n, lo, hi){ n=Number(n); if(!Number.isFinite(n)) return lo; return Math.max(lo, Math.min(hi, n)); }
function v420Sheet_(name){
  const sh=getSpreadsheet_().getSheetByName(name);
  if(!sh) throw new Error('Chưa có sheet '+name+'. Hãy chạy setupSystemV420() một lần.');
  return sh;
}
function v420Headers_(sheet){ return sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getValues()[0].map(x=>String(x||'').trim()); }
function v420ObjectToRow_(headers,obj){ return headers.map(h=>Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:''); }
function v420FindRowById_(sheet, idHeader, idValue){
  const headers=v420Headers_(sheet), idx=headers.indexOf(idHeader);
  if(idx<0) return {row:0,headers};
  const last=sheet.getLastRow(); if(last<=1) return {row:0,headers};
  const values=sheet.getRange(2,idx+1,last-1,1).getValues();
  const target=String(idValue||'');
  for(let i=0;i<values.length;i++) if(String(values[i][0]||'')===target) return {row:i+2,headers};
  return {row:0,headers};
}
function v420GetRowObject_(sheet,row,headers){
  headers=headers||v420Headers_(sheet); if(!row||row<2)return null;
  const vals=sheet.getRange(row,1,1,headers.length).getValues()[0],out={}; headers.forEach((h,i)=>{if(h)out[h]=vals[i];}); return out;
}
function v420AppendObject_(sheet,obj){
  const headers=v420Headers_(sheet); sheet.getRange(sheet.getLastRow()+1,1,1,headers.length).setValues([v420ObjectToRow_(headers,obj)]); return obj;
}
function v420UpdateObjectById_(sheet,idHeader,idValue,patch){
  const found=v420FindRowById_(sheet,idHeader,idValue); if(!found.row)throw new Error('Không tìm thấy '+idValue);
  const current=v420GetRowObject_(sheet,found.row,found.headers); Object.keys(patch||{}).forEach(k=>{if(found.headers.includes(k))current[k]=patch[k];});
  sheet.getRange(found.row,1,1,found.headers.length).setValues([v420ObjectToRow_(found.headers,current)]); return current;
}


function v421DecorateExamRow_(r){
  return Object.assign({},r,{
    answer_key:v420Json_(r.answer_key_json,{}),
    rubric:v420Json_(r.rubric_json,[]),
    question_bank:v420Json_(r.question_bank_json,[]),
    scoring:v420Json_(r.scoring_json,{}),
    source_summary:v420Json_(r.source_summary_json,{})
  });
}

function setupExamModuleV420_(){
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('ANPHUC_AI_PROVIDER')) props.setProperty('ANPHUC_AI_PROVIDER','gemini');
  if(!props.getProperty('ANPHUC_AI_MODEL')) props.setProperty('ANPHUC_AI_MODEL','gemini-3.8-flash');
  if(!props.getProperty('ANPHUC_AI_REVIEW_THRESHOLD')) props.setProperty('ANPHUC_AI_REVIEW_THRESHOLD','75');
  if(!props.getProperty('ANPHUC_AI_REQUIRE_TEACHER_REVIEW')) props.setProperty('ANPHUC_AI_REQUIRE_TEACHER_REVIEW','true');
  if(!props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')) props.setProperty('ANPHUC_EXAM_SHEET_TEMPLATE','ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1');
  return {ok:true,provider:props.getProperty('ANPHUC_AI_PROVIDER'),model:props.getProperty('ANPHUC_AI_MODEL'),answer_sheet_template:props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')};
}

function createExamDefinition(params){
  params=params||{};
  const title=String(params.title||'').trim(), subject=String(params.subject||'Toán').trim();
  const grade=normalizeNumberString(params.grade), className=normalizeClassName(params.className||params.class||'');
  if(title.length<3)throw new Error('Tên bài kiểm tra phải có ít nhất 3 ký tự.');
  if(!grade)throw new Error('Vui lòng chọn khối.');
  const totalScore=v420Clamp_(params.total_score||10,1,100), mcqCount=Math.max(0,Number(params.mcq_count||0));
  const mcqPoints=v420Clamp_(params.mcq_points||0,0,totalScore), essayPoints=Math.max(0,totalScore-mcqPoints);
  const id=generateId('EXAM'); const now=v420Now_();
  const row={
    exam_id:id,title,subject,grade,class:className,exam_date:String(params.exam_date||v420IsoDate_()),exam_type:String(params.exam_type||'15P'),
    total_score:totalScore,mcq_count:mcqCount,mcq_points:mcqPoints,essay_points:essayPoints,status:'DRAFT',
    answer_key_json:'{}',rubric_json:'[]',question_bank_json:'[]',scoring_json:'{}',source_format:'MANUAL',source_summary_json:'{}',answer_sheet_template:String(params.answer_sheet_template||PropertiesService.getScriptProperties().getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')||'ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1'),annotation_enabled:'TRUE',instructions:String(params.instructions||''),created_by:String(params.created_by||'admin'),created_at:now,updated_at:now
  };
  v420AppendObject_(v420Sheet_(V420_EXAM_SHEETS.definitions),row); bumpDataVersion_('exam_create');
  return row;
}

function saveExamAnswerRubric(params){
  params=params||{}; const examId=String(params.exam_id||'').trim(); if(!examId)throw new Error('Thiếu exam_id.');
  const answerKey=v420Json_(params.answer_key_json||params.answer_key,{}), rubric=v420Json_(params.rubric_json||params.rubric,[]);
  if(answerKey===null||typeof answerKey!=='object')throw new Error('Đáp án trắc nghiệm không hợp lệ.');
  if(!Array.isArray(rubric))throw new Error('Barem tự luận phải là danh sách.');
  const normalizedRubric=rubric.map((q,qi)=>({
    question:String(q.question||q.code||('TL'+(qi+1))).trim(),
    type:String(q.type||'LA').trim().toUpperCase(),
    max_score:Number(q.max_score||q.score||0),
    prompt:String(q.prompt||q.description||'').trim(),
    reference_solution:String(q.reference_solution||q.solution||q.explain||'').trim(),
    criteria:Array.isArray(q.criteria)?q.criteria.map((c,ci)=>({id:String(c.id||(`${qi+1}.${ci+1}`)),description:String(c.description||c.text||'').trim(),points:Number(c.points||0),reference_solution:String(c.reference_solution||c.solution||'').trim()})):[]
  }));
  const patch={answer_key_json:JSON.stringify(answerKey),rubric_json:JSON.stringify(normalizedRubric),status:'READY',updated_at:v420Now_()};
  const row=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.definitions),'exam_id',examId,patch); bumpDataVersion_('exam_rubric'); return row;
}

function getExamDefinitions(params){
  params=params||{}; let rows=getSheetData(V420_EXAM_SHEETS.definitions);
  const grade=normalizeNumberString(params.grade),cls=normalizeClassName(params.className||params.class||''),status=String(params.status||'').trim().toUpperCase();
  if(grade)rows=rows.filter(r=>normalizeNumberString(r.grade)===grade);
  if(cls)rows=rows.filter(r=>normalizeClassName(r.class)===cls);
  if(status)rows=rows.filter(r=>String(r.status||'').toUpperCase()===status);
  rows=rows.slice().sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
  return rows.map(v421DecorateExamRow_);
}

function getExamDefinition(params){
  const id=String((params||{}).exam_id||'').trim(); if(!id)throw new Error('Thiếu exam_id.');
  const row=getSheetData(V420_EXAM_SHEETS.definitions).find(r=>String(r.exam_id)===id); if(!row)throw new Error('Không tìm thấy bài kiểm tra.');
  return v421DecorateExamRow_(row);
}

function getExamDashboard(params){
  const exams=getSheetData(V420_EXAM_SHEETS.definitions), subs=getSheetData(V420_EXAM_SHEETS.submissions);
  const by={total:subs.length,uploaded:0,grading:0,ai_done:0,review_needed:0,approved:0,parent_sent:0,error:0};
  subs.forEach(s=>{const st=String(s.status||'').toUpperCase(),ai=String(s.ai_status||'').toUpperCase();
    if(st)by.uploaded++; if(ai==='GRADING')by.grading++; if(ai==='DONE')by.ai_done++; if(st==='REVIEW_NEEDED')by.review_needed++; if(st==='APPROVED')by.approved++; if(s.sent_parent_at)by.parent_sent++; if(st==='ERROR'||ai==='ERROR')by.error++;});
  return {exam_count:exams.length,submission_count:subs.length,stats:by,ai:getAIGradingSettings({mask_key:true})};
}

function archiveExamDefinition(params){
  const id=String((params||{}).exam_id||'').trim(); if(!id)throw new Error('Thiếu exam_id.');
  const row=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.definitions),'exam_id',id,{status:'ARCHIVED',updated_at:v420Now_()}); bumpDataVersion_('exam_archive'); return row;
}
