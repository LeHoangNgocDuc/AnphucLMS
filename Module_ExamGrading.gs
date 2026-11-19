// ============================================================================
// V4.22 - MODULE CHAM BAI AI: OMR A/B + HANDWRITING C/D + ANNOTATION
// A: hoc sinh TO dap an A/B/C/D -> AI chi doc muc to, backend tu tinh diem.
// B: hoc sinh TO Dung/Sai theo tung y a/b/c/d -> AI chi doc muc to, backend tinh.
// C: tra loi ngan viet tay -> AI chep lai, backend doi chieu CorrectAnswer.
// D: tu luan viet tay -> AI cham theo rubric + loi giai chuan, GV bat buoc duyet.
// Annotation duoc luu dang toa do chuan hoa 0..1 de ve lop mau do len bai goc.
// ============================================================================

const V422_SHEET_TEMPLATE = 'ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1';

function v420NormalizeAnswerKey_(raw){
  const src=v420Json_(raw,{}),out={};
  const put=(key,v,index)=>{
    if(typeof v==='object' && v!==null) out[String(key)]={
      answer:String(v.answer??v.correct??v.correct_answer??'').trim(),
      points:Number(v.points||v.score||0),
      type:String(v.type||'MC').trim().toUpperCase(),
      question:String(v.question||'').trim(),
      options:v.options||{},
      explain:String(v.explain||v.reference_solution||'').trim()
    };
    else out[String(key)]={answer:String(v??'').trim(),points:0,type:'MC',question:'',options:{},explain:''};
  };
  if(Array.isArray(src)) src.forEach((v,i)=>put((v&&typeof v==='object')?(v.q||v.question_id||v.id||i+1):(i+1),v,i));
  else Object.keys(src||{}).forEach(k=>put(k,src[k]));
  return out;
}
function v421NormalizeTf_(value){
  let s=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  s=s.replace(/Đ/g,'D').replace(/TRUE|DUNG|YES/g,'D').replace(/FALSE|SAI|NO/g,'S').replace(/[T1]/g,'D').replace(/[F0]/g,'S');
  return s.replace(/[^DS]/g,'');
}
function v421NumericAnswer_(value){
  let s=String(value??'').trim(); if(!s)return null;
  s=s.replace(/−/g,'-').replace(/\\d?frac\s*\{\s*([-+]?\d+(?:[.,]\d+)?)\s*\}\s*\{\s*([-+]?\d+(?:[.,]\d+)?)\s*\}/gi,'$1/$2');
  s=s.replace(/\^\{?\\circ\}?|°/g,'').replace(/\s+/g,'');
  const frac=s.match(/^([-+]?\d+(?:[.,]\d+)?)\/([-+]?\d+(?:[.,]\d+)?)$/); if(frac){const a=Number(frac[1].replace(',','.')),b=Number(frac[2].replace(',','.'));return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:null;}
  if(/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(s)){const n=Number(s.replace(/\./g,''));return Number.isFinite(n)?n:null;}
  if(/^[-+]?\d{1,3}(?:,\d{3}){2,}$/.test(s)){const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?n:null;}
  if(/^[-+]?\d+(?:[.,]\d+)?$/.test(s)){const n=Number(s.replace(',','.'));return Number.isFinite(n)?n:null;}
  return null;
}
function v421ShortEquivalent_(selected,expected){
  const a=v421NumericAnswer_(selected),b=v421NumericAnswer_(expected); if(a!==null&&b!==null)return Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(b));
  const norm=v=>String(v??'').normalize('NFC').toLocaleLowerCase('vi-VN').replace(/\s+/g,'').replace(/,/g,'.').replace(/°/g,'');
  return !!norm(selected) && norm(selected)===norm(expected);
}
function v421SanitizedQuestionBank_(exam,key,rubric){
  const bank=v420Json_(exam.question_bank_json,[]); if(Array.isArray(bank)&&bank.length){
    return bank.map(q=>({id:q.id,type:q.type,question:q.question,options:q.options||{},level:q.level||'',chapter:q.chapter||'',topic:q.topic||''}));
  }
  return Object.keys(key).map(id=>({id,type:key[id].type||'MC',question:key[id].question||'',options:key[id].options||{}})).concat((rubric||[]).map(r=>({id:r.question,type:'LA',question:r.prompt||''})));
}
function v420ResolveDetectedStudent_(detected,exam){
  detected=detected||{}; const id=String(detected.student_id||detected.id||'').trim(); if(id){const s=v420StudentById_(id);if(s)return s;}
  const name=v420StripAccents_(detected.name||detected.student_name||''); if(name.length<3)return null;
  const candidates=getSheetData('Students').filter(s=>normalizeNumberString(s.grade)===normalizeNumberString(exam.grade)&&(!normalizeClassName(exam.class)||normalizeClassName(s.class)===normalizeClassName(exam.class)));
  const exact=candidates.filter(s=>v420StripAccents_(s.name)===name); return exact.length===1?exact[0]:null;
}

function v422AnswerSheetLayout_(exam,key,rubric){
  const all=Object.keys(key).map(id=>({id:id,type:String(key[id].type||'MC').toUpperCase()}));
  const mc=all.filter(x=>x.type==='MC'),tf=all.filter(x=>x.type==='TF'),sa=all.filter(x=>x.type==='SA');
  const la=(rubric||[]).map(x=>({id:String(x.question||''),type:'LA'}));
  const warnings=[];
  if(mc.length>12)warnings.push('Mau giay chi co 12 cot MC; de co '+mc.length+' cau MC.');
  if(tf.length>4)warnings.push('Mau giay chi co 4 cum Dung/Sai; de co '+tf.length+' cau TF.');
  if(sa.length>4)warnings.push('Mau giay chi co 4 o tra loi ngan; de co '+sa.length+' cau SA.');
  return {
    template:V422_SHEET_TEMPLATE,
    page1:{
      sectionA:{label:'A',kind:'OMR_MC',questions:mc.slice(0,12).map((x,i)=>({question:x.id,column:i+1,rows:['A','B','C','D']}))},
      sectionB:{label:'B',kind:'OMR_TF',questions:tf.slice(0,4).map((x,i)=>({question:x.id,group:i+1,subparts:['a','b','c','d'],rows:['D','S']}))},
      sectionC:{label:'C',kind:'HANDWRITING_SA',questions:sa.slice(0,4).map((x,i)=>({question:x.id,slot:i+1}))},
      sectionD:{label:'D',kind:'HANDWRITING_LA',questions:la}
    },
    page2:{sectionD:{label:'D_CONTINUED',kind:'HANDWRITING_LA',questions:la}},
    warnings:warnings
  };
}

function v422CleanBox_(box){
  box=box||{}; const x=v420Clamp_(box.x,0,1),y=v420Clamp_(box.y,0,1),w=v420Clamp_(box.w||box.width||0.18,0.02,0.9),h=v420Clamp_(box.h||box.height||0.04,0.015,0.3);
  return {x:x,y:y,w:Math.min(w,1-x),h:Math.min(h,1-y)};
}
function v422ShortText_(s,max){s=String(s||'').replace(/\s+/g,' ').trim();max=Number(max||110);return s.length>max?s.slice(0,max-1)+'…':s;}
function v422FirstReason_(s){
  s=String(s||'').replace(/\s+/g,' ').trim(); if(!s)return '';
  const m=s.match(/^(.{1,150}?[.!?])(?:\s|$)/); return v422ShortText_(m?m[1]:s,120);
}
function v422DefaultSaBox_(slot){
  const xs=[0.07,0.30,0.55,0.79],i=Math.max(0,Math.min(3,Number(slot||1)-1));
  return {x:xs[i],y:0.386,w:0.19,h:0.035};
}
function v422BuildAnnotations_(exam,grading,rawAi){
  const key=v420NormalizeAnswerKey_(exam.answer_key_json),layout=v422AnswerSheetLayout_(exam,key,v420Json_(exam.rubric_json,[]));
  const items=[]; let seq=0;
  const add=(x)=>{x=x||{};const box=v422CleanBox_(x.bbox||x.box||x);items.push({id:'ANN_'+(++seq),page:Math.max(1,Number(x.page||1)),x:box.x,y:box.y,w:box.w,h:box.h,kind:String(x.kind||'note'),text:v422ShortText_(x.text||'',160),color:'#DC2626',question:String(x.question||''),source:String(x.source||'AI'),confidence:v420Clamp_(x.confidence||0,0,100)});};

  const rawObj=((rawAi||{}).objective||{}).answers||[], rawBy={}; rawObj.forEach(a=>rawBy[String(a.question||a.id||a.q||'')]=a);
  const answers=((grading||{}).objective||{}).answers||[];
  const saMap={}; (layout.page1.sectionC.questions||[]).forEach(x=>saMap[x.question]=x.slot);
  answers.filter(a=>String(a.type||'').toUpperCase()==='SA').forEach(a=>{
    const r=rawBy[a.question]||{}, box=r.bbox||r.answer_bbox||v422DefaultSaBox_(saMap[a.question]||1), page=Number(r.page||1);
    if(!a.readable){add({page:page,bbox:box,kind:'review',question:a.question,text:'⚠ GV kiểm tra - AI không đọc rõ',confidence:a.confidence});return;}
    if(a.correct){add({page:page,bbox:box,kind:'correct',question:a.question,text:'✓ Đúng',confidence:a.confidence});}
    else{
      const explain=v422FirstReason_((key[a.question]||{}).explain||'');
      const reason='✗ Sai - Đáp án: '+String(a.expected||'')+(explain?' - '+explain:'');
      add({page:page,bbox:box,kind:'wrong',question:a.question,text:reason,confidence:a.confidence});
    }
  });

  const aiAnn=Array.isArray((rawAi||{}).annotation_candidates)?rawAi.annotation_candidates:[];
  aiAnn.forEach(a=>{
    const q=String(a.question||''); const t=String(a.text||'').trim(); if(!t)return;
    add({page:a.page||1,bbox:a.bbox||a.box,kind:a.kind||'note',question:q,text:t,confidence:a.confidence||0});
  });

  const ess=(grading||{}).essay||{};
  if(Number(ess.max_score||0)>0){
    add({page:Number((rawAi||{}).essay_last_page||1),x:0.70,y:0.935,w:0.27,h:0.04,kind:'score',question:'ESSAY_TOTAL',text:'Tự luận: '+String(ess.score||0)+'/'+String(ess.max_score||0),confidence:grading.confidence||0});
  }
  return {version:'V4.22',template:layout.template,items:items,layout_warnings:layout.warnings,generated_at:new Date().toISOString()};
}

function v420BuildGradingPrompt_(exam,submission){
  const key=v420NormalizeAnswerKey_(exam.answer_key_json), rubric=v420Json_(exam.rubric_json,[]), bank=v421SanitizedQuestionBank_(exam,key,rubric);
  const objectiveSpec=Object.keys(key).map(id=>({id,type:key[id].type||'MC',points:Number(key[id].points||0)}));
  const layout=v422AnswerSheetLayout_(exam,key,rubric);
  return `Bạn là hệ thống thị giác hỗ trợ CHẤM BÀI viết tay cho giáo viên Việt Nam. Hãy đọc toàn bộ ảnh/PDF bài làm đính kèm theo MẪU GIẤY AN PHÚC.

MẪU GIẤY LÀM BÀI CỐ ĐỊNH:
- Trang 1, Mục A: bảng trắc nghiệm nhiều lựa chọn. Mỗi CÂU là 1 CỘT; 4 hàng A/B/C/D. Học sinh TÔ MÀU vào đúng 1 vòng tròn. Đây là OMR, KHÔNG phải chữ viết.
- Trang 1, Mục B: bảng Đúng/Sai. Mỗi câu có 4 ý a/b/c/d; mỗi ý có 2 vòng tròn theo 2 hàng Đúng và Sai. Học sinh cũng TÔ MÀU vòng tròn. Đây là OMR.
- Trang 1, Mục C: 4 vị trí trả lời ngắn. Học sinh VIẾT TAY câu trả lời.
- Trang 1 + các trang sau, Mục D: học sinh VIẾT TAY tự luận trên các dòng kẻ.

NGUYÊN TẮC BẮT BUỘC:
1. KHÔNG được nhìn/đoán đáp án đúng của MC/TF/SA. Bạn chỉ nhận diện bài học sinh; backend sẽ tự đối chiếu đáp án.
2. A - OMR MC: với từng câu, ước lượng mức tô của A/B/C/D từ 0..100. Chỉ selected khi có một ô nổi trội rõ ràng. Nếu bỏ trống hoặc tô nhiều ô, selected="", readable=false và status="blank"/"multiple"/"uncertain".
3. B - OMR TF: với từng ý a/b/c/d, ước lượng true_fill và false_fill 0..100. Chọn D hoặc S chỉ khi một hàng nổi trội rõ. Nếu mơ hồ để ? và readable=false.
4. C - SA: chép CHÍNH XÁC chữ/số học sinh viết, giữ dấu âm, phân số, dấu phẩy thập phân; trả page + bbox chuẩn hóa x,y,w,h từ 0..1 quanh câu trả lời.
5. D - LA: chấm theo BAREM + LỜI GIẢI CHUẨN. Học sinh có thể dùng cách khác nhưng đúng toán học vẫn cho điểm.
6. Với D, tạo annotation_candidates tại đúng dòng học sinh viết: nếu đúng ghi ngắn "✓ Đúng"; nếu sai ghi "✗ Sai: <lý do rất ngắn>". Tất cả text chấm phải ngắn, tiếng Việt, để đặt cạnh bài viết.
7. bbox của annotation cũng dùng tọa độ chuẩn hóa 0..1 theo trang; ưu tiên đặt bên phải/ô trống cạnh dòng, KHÔNG che chữ học sinh. Nếu không xác định chắc vị trí thì KHÔNG tạo annotation đó.
8. Nếu chữ không đọc được: UNREADABLE, giảm confidence, thêm review_reasons; tuyệt đối không tự bịa.
9. Nếu nhận dạng được họ tên/mã HS, trả student_detected; nếu không chắc để trống.
10. Đây chỉ là điểm đề xuất. Giáo viên sẽ duyệt trước khi lưu/gửi phụ huynh.

THÔNG TIN ĐỀ:
${JSON.stringify({exam_id:exam.exam_id,title:exam.title,subject:exam.subject,grade:exam.grade,class:exam.class,total_score:Number(exam.total_score||10),objective_points:Number(exam.mcq_points||0),essay_points:Number(exam.essay_points||0),instructions:exam.instructions||'',answer_sheet_template:exam.answer_sheet_template||V422_SHEET_TEMPLATE})}

ÁNH XẠ VỊ TRÍ TRÊN GIẤY (KHÔNG CHỨA ĐÁP ÁN):
${JSON.stringify(layout)}

CẤU TRÚC CÂU HỎI (KHÔNG CÓ ĐÁP ÁN KHÁCH QUAN):
${JSON.stringify(bank)}

CÁC CÂU KHÁCH QUAN CẦN TRÍCH XUẤT:
${JSON.stringify(objectiveSpec)}

BAREM + LỜI GIẢI CHUẨN TỰ LUẬN:
${JSON.stringify(rubric)}

Trả DUY NHẤT JSON, không markdown:
{
 "student_detected":{"student_id":"","name":"","confidence":0},
 "document":{"page_count":2,"template_detected":"${V422_SHEET_TEMPLATE}","alignment_confidence":0},
 "omr":{"sectionA":[{"question":"Q001","selected":"A","status":"single","fill":{"A":92,"B":5,"C":4,"D":3},"readable":true,"confidence":95}],"sectionB":[{"question":"Q013","selected":"DSDD","readable":true,"confidence":92,"parts":{"a":{"selected":"D","true_fill":90,"false_fill":4},"b":{"selected":"S","true_fill":6,"false_fill":87},"c":{"selected":"D","true_fill":88,"false_fill":5},"d":{"selected":"D","true_fill":91,"false_fill":3}}}]},
 "objective":{"answers":[{"question":"Q001","type":"MC","selected":"A","readable":true,"confidence":95,"omr_status":"single"},{"question":"Q013","type":"TF","selected":"DSDD","readable":true,"confidence":92},{"question":"Q015","type":"SA","selected":"2,5","page":1,"bbox":{"x":0.08,"y":0.38,"w":0.18,"h":0.04},"readable":true,"confidence":90}]},
 "essay":{"items":[{"question":"Q019","score":0,"max_score":0,"confidence":0,"feedback":"","criteria":[{"id":"Q019.a","awarded":0,"max_points":0,"feedback":""}]}]},
 "annotation_candidates":[{"question":"Q019","page":1,"bbox":{"x":0.72,"y":0.60,"w":0.24,"h":0.035},"kind":"wrong","text":"✗ Sai: chuyển vế chưa đổi dấu","confidence":90}],
 "essay_last_page":2,
 "confidence":0,
 "needs_review":true,
 "review_reasons":[],
 "teacher_feedback":"",
 "parent_feedback":"",
 "unreadable_areas":[]
}`;
}

function v420RecalculateGrade_(exam,ai){
  ai=ai||{}; const key=v420NormalizeAnswerKey_(exam.answer_key_json), keys=Object.keys(key); const objectiveMax=Number(exam.mcq_points||0)||keys.reduce((s,k)=>s+Number(key[k].points||0),0), defaultPt=keys.length?objectiveMax/keys.length:0;
  const aiObj=ai.objective||ai.mcq||{}, aiAns=Array.isArray(aiObj.answers)?aiObj.answers:[], byQ={}; aiAns.forEach(a=>{byQ[String(a.question||a.q||a.id||'')]=a;});
  let objectiveScore=0; const answers=[];
  keys.forEach(q=>{
    const k=key[q],a=byQ[q]||{},type=String(k.type||a.type||'MC').toUpperCase(),selected=String(a.selected??a.answer??'').trim(),expected=String(k.answer||'').trim(),readable=a.readable!==false&&!!selected&&selected.toUpperCase()!=='UNREADABLE'&&String(a.omr_status||'single').toLowerCase()!=='multiple'&&String(a.omr_status||'single').toLowerCase()!=='blank'&&String(a.omr_status||'single').toLowerCase()!=='uncertain',pt=Number(k.points)>0?Number(k.points):defaultPt;
    let award=0,correct=false,details=null;
    if(readable&&type==='TF'){
      const se=v421NormalizeTf_(selected), ex=v421NormalizeTf_(expected), n=ex.length||1; let hit=0; const parts=[];
      for(let i=0;i<ex.length;i++){const ok=se[i]===ex[i];if(ok)hit++;parts.push({index:i+1,selected:se[i]||'?',expected:ex[i],correct:ok});}
      award=pt*(hit/n); correct=hit===ex.length&&se.length>=ex.length; details={correct_count:hit,total:n,parts:parts};
    }else if(readable&&type==='SA'){
      correct=v421ShortEquivalent_(selected,expected); award=correct?pt:0;
    }else if(readable){
      correct=selected.toUpperCase()===expected.toUpperCase(); award=correct?pt:0;
    }
    award=v421Round_(award); objectiveScore+=award;
    answers.push({question:q,type:type,selected:selected||'UNREADABLE',expected:expected,readable:!!readable,correct:correct,points:award,max_points:v421Round_(pt),confidence:v420Clamp_(a.confidence||0,0,100),feedback:String(a.feedback||''),details:details,omr_status:String(a.omr_status||''),bbox:a.bbox||null,page:Number(a.page||1)});
  });
  objectiveScore=Math.min(objectiveMax,objectiveScore);
  const rubric=v420Json_(exam.rubric_json,[]), aiItems=((ai.essay||{}).items||[]), byEssay={}; aiItems.forEach(x=>byEssay[String(x.question||'')]=x); let essayScore=0; const items=[];
  rubric.forEach((r,idx)=>{const q=String(r.question||('TL'+(idx+1))),max=Number(r.max_score||0),src=byEssay[q]||aiItems[idx]||{},srcCriteria=Array.isArray(src.criteria)?src.criteria:[],defs=Array.isArray(r.criteria)?r.criteria:[];let normalizedCriteria=[],score=0;if(defs.length){normalizedCriteria=defs.map((c,ci)=>{const hit=srcCriteria.find(x=>String(x.id||'')===String(c.id||''))||srcCriteria[ci]||{},cap=Number(c.points||0),aw=v420Clamp_(hit.awarded??hit.points??0,0,cap);score+=aw;return{id:String(c.id||(`${idx+1}.${ci+1}`)),awarded:v421Round_(aw),max_points:cap,feedback:String(hit.feedback||''),description:String(c.description||'')};});score=v420Clamp_(score,0,max);}else{score=v420Clamp_(src.score||0,0,max);normalizedCriteria=srcCriteria;}essayScore+=score;items.push({question:q,score:v421Round_(score),max_score:max,confidence:v420Clamp_(src.confidence||0,0,100),feedback:String(src.feedback||''),criteria:normalizedCriteria});});
  const essayMax=Number(exam.essay_points||0)||rubric.reduce((s,r)=>s+Number(r.max_score||0),0); essayScore=Math.min(essayMax,essayScore);
  const totalMax=Number(exam.total_score||10),total=Math.min(totalMax,objectiveScore+essayScore),confidences=answers.map(a=>a.confidence).concat(items.map(x=>x.confidence)).filter(Number.isFinite),conf=confidences.length?Math.round(confidences.reduce((a,b)=>a+b,0)/confidences.length):v420Clamp_(ai.confidence||0,0,100);
  const omr=ai.omr||{}; const documentInfo=ai.document||{};
  return {student_detected:ai.student_detected||{},document:documentInfo,omr:omr,objective:{answers:answers,score:v421Round_(objectiveScore),max_score:objectiveMax},mcq:{answers:answers,score:v421Round_(objectiveScore),max_score:objectiveMax},essay:{items:items,score:v421Round_(essayScore),max_score:essayMax},total_score:v421Round_(total),confidence:conf,needs_review:Boolean(ai.needs_review),review_reasons:Array.isArray(ai.review_reasons)?ai.review_reasons:[],teacher_feedback:String(ai.teacher_feedback||''),parent_feedback:String(ai.parent_feedback||''),unreadable_areas:Array.isArray(ai.unreadable_areas)?ai.unreadable_areas:[]};
}

function gradeExamSubmissionAI(params){
  params=params||{}; const sub=getExamSubmission({submission_id:params.submission_id}),exam=getExamDefinition({exam_id:sub.exam_id});
  if(String(exam.status||'').toUpperCase()==='DRAFT')throw new Error('Bài kiểm tra chưa có đáp án/barem. Hãy hoàn tất Bước 2 trước.');
  if(String(sub.status||'').toUpperCase()==='APPROVED'&&String(params.force||'')!=='true')throw new Error('Bài đã được giáo viên duyệt. Chỉ chấm lại khi dùng force=true.');
  const ids=sub.file_ids||[]; if(!ids.length)throw new Error('Bài nộp chưa có ảnh/PDF.');
  v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,{ai_status:'GRADING',status:'GRADING',updated_at:v420Now_()}); bumpDataVersion_('exam_grading_start');
  try{
    const blobs=ids.map(id=>DriveApp.getFileById(id).getBlob()); const prompt=v420BuildGradingPrompt_(exam,sub); const generated=v420GeminiGenerateJson_(prompt,blobs,{submission_id:sub.submission_id,exam_id:exam.exam_id,request_type:'grade_submission_v422'}); const grading=v420RecalculateGrade_(exam,generated.data);
    const annotation=v422BuildAnnotations_(exam,grading,generated.data);
    let student=sub.student_id?v420StudentById_(sub.student_id):null; if(!student)student=v420ResolveDetectedStudent_(grading.student_detected,exam);
    const settings=getAIGradingSettings({mask_key:true}), threshold=Number(settings.review_threshold||75); const layoutWarnings=(annotation.layout_warnings||[]); const needsReview=grading.needs_review||grading.confidence<threshold||grading.unreadable_areas.length>0||!student||layoutWarnings.length>0;
    if(!student)grading.review_reasons.push('Chưa xác định chắc chắn học sinh.'); if(grading.confidence<threshold)grading.review_reasons.push('Độ tin cậy AI dưới '+threshold+'%.'); layoutWarnings.forEach(x=>grading.review_reasons.push(x));
    const patch={student_id:student?student.student_id:sub.student_id||'',student_name:student?student.name:sub.student_name||grading.student_detected.name||'',grade:student?student.grade:sub.grade,class:student?student.class:sub.class,ai_status:'DONE',status:needsReview?'REVIEW_NEEDED':'AI_DONE',ai_score:grading.total_score,confidence:grading.confidence,ai_feedback:grading.teacher_feedback,parent_feedback:grading.parent_feedback,grading_json:JSON.stringify(grading),annotation_json:JSON.stringify(annotation),annotated_at:v420Now_(),parent_view_ready:'FALSE',updated_at:v420Now_()};
    const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,patch); bumpDataVersion_('exam_grading_done'); return Object.assign({},updated,{grading:grading,annotation:annotation});
  }catch(e){v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',sub.submission_id,{ai_status:'ERROR',status:'ERROR',updated_at:v420Now_(),ai_feedback:String(e.message||e).slice(0,1000)});bumpDataVersion_('exam_grading_error');throw e;}
}
