// ============================================================================
// V4.22 - MODULE NHẬP ĐỀ + ĐÁP ÁN JSON TỰ ĐỘNG + MẪU GIẤY OMR
// Hỗ trợ định dạng câu hỏi: MC / TF / SA / LA.
// MC: nhiều lựa chọn; TF: đúng/sai nhiều ý; SA: trả lời ngắn; LA: tự luận.
// ============================================================================

const V421_IMPORT_SOURCE = 'ANPHUC_JSON_QBANK_V1';
const V421_OBJECTIVE_TYPES = ['MC','TF','SA'];
const V421_ALL_TYPES = ['MC','TF','SA','LA'];

function v421Round_(n){ return Math.round((Number(n)||0)*100)/100; }
function v421Ci_(obj, keys, fallback){
  obj=obj||{}; const map={}; Object.keys(obj).forEach(k=>map[String(k).toLowerCase()]=obj[k]);
  for(const k of keys){ const v=map[String(k).toLowerCase()]; if(v!==undefined && v!==null && v!=='') return v; }
  return fallback;
}
function v421NormalizeType_(value){
  const t=String(value||'').trim().toUpperCase();
  if(V421_ALL_TYPES.includes(t)) return t;
  if(['MULTIPLE_CHOICE','MULTIPLECHOICE','CHOICE','TRACNGHIEM'].includes(t)) return 'MC';
  if(['TRUE_FALSE','TRUEFALSE','T/F','DUNGSAI','ĐÚNGSAI'].includes(t)) return 'TF';
  if(['SHORT_ANSWER','SHORTANSWER','TLN','TRALOINGAN'].includes(t)) return 'SA';
  if(['LONG_ANSWER','LONGANSWER','ESSAY','TULUAN','TỰLUẬN'].includes(t)) return 'LA';
  return '';
}
function v421NormalizeOptions_(value){
  if(!value) return {};
  if(Array.isArray(value)){ const out={}; value.forEach((v,i)=>out[String.fromCharCode(65+i)]=String(v??'')); return out; }
  if(typeof value==='object'){ const out={}; Object.keys(value).forEach(k=>out[String(k).trim()]=String(value[k]??'')); return out; }
  return {};
}
function v421ExplicitPoints_(q){
  const raw=v421Ci_(q,['Points','Point','Score','MaxScore','Max_Score','Diem','Điểm'],'');
  const n=Number(String(raw).replace(',','.')); return Number.isFinite(n)&&n>0?n:0;
}
function v421NormalizeQuestion_(raw, index){
  if(!raw || typeof raw!=='object') throw new Error('Câu '+(index+1)+' không phải object JSON hợp lệ.');
  const id=String(v421Ci_(raw,['Id','ID','QuestionId','QuestionID'], 'Q'+String(index+1).padStart(3,'0'))).trim();
  const type=v421NormalizeType_(v421Ci_(raw,['Type','QuestionType','Loai','Loại'],''));
  if(!type) throw new Error('Câu '+id+' có Type không hỗ trợ. Chỉ dùng MC, TF, SA, LA.');
  const question=String(v421Ci_(raw,['Question','Content','Text','CauHoi','CâuHỏi'],'')).trim();
  if(!question) throw new Error('Câu '+id+' thiếu Question.');
  const options=v421NormalizeOptions_(v421Ci_(raw,['Options','Choices','Answers','LuaChon','LựaChọn'],{}));
  const correct=String(v421Ci_(raw,['CorrectAnswer','Correct','AnswerKey','DapAn','ĐápÁn'],'')).trim();
  const explain=String(v421Ci_(raw,['Explain','Explanation','Solution','LoiGiai','LờiGiải'],'')).trim();
  if(type!=='LA' && !correct) throw new Error('Câu '+id+' ('+type+') thiếu CorrectAnswer.');
  if(type==='LA' && !explain) throw new Error('Câu '+id+' (LA) thiếu Explain/Lời giải chuẩn.');
  return {
    id:id,
    type:type,
    level:String(v421Ci_(raw,['Level','MucDo','MứcĐộ'],'')).trim(),
    grade:String(v421Ci_(raw,['Grade','Khoi','Khối'],'')).trim(),
    subject:String(v421Ci_(raw,['Subject','Mon','Môn'],'')).trim(),
    chapter:String(v421Ci_(raw,['Chapter','Chuong','Chương'],'')).trim(),
    topic:String(v421Ci_(raw,['Topic','ChuDe','ChủĐề'],'')).trim(),
    question:question,
    options:options,
    correct_answer:correct,
    explain:explain,
    explicit_points:v421ExplicitPoints_(raw)
  };
}
function v421ParseQuestionJson_(text){
  if(typeof text==='object' && text!==null){
    const arr=Array.isArray(text)?text:(Array.isArray(text.questions)?text.questions:Array.isArray(text.data)?text.data:null);
    if(!arr) throw new Error('JSON phải là một mảng câu hỏi hoặc object có trường questions/data.');
    return arr.map(v421NormalizeQuestion_);
  }
  const raw=String(text||'').trim(); if(!raw) throw new Error('File đề/đáp án đang trống.');
  let parsed; try{ parsed=JSON.parse(raw); }catch(e){ throw new Error('JSON không hợp lệ: '+e.message); }
  const arr=Array.isArray(parsed)?parsed:(parsed&&Array.isArray(parsed.questions)?parsed.questions:(parsed&&Array.isArray(parsed.data)?parsed.data:null));
  if(!arr || !arr.length) throw new Error('Không tìm thấy danh sách câu hỏi trong JSON.');
  if(arr.length>300) throw new Error('Một đề tối đa 300 câu để bảo đảm tốc độ.');
  return arr.map(v421NormalizeQuestion_);
}
function v421SubpartLabels_(text){
  const labels=[]; const s='\n'+String(text||'');
  const re=/\n\s*([a-hA-H])\s*[\)\.\:\-]\s*/g; let m;
  while((m=re.exec(s))!==null){ const x=m[1].toLowerCase(); if(!labels.includes(x))labels.push(x); }
  return labels;
}
function v421SplitSubparts_(text){
  const s=String(text||'').trim(), out={};
  if(!s) return out;
  const re=/(^|\n)\s*([a-hA-H])\s*[\)\.\:\-]\s*/g; const hits=[]; let m;
  while((m=re.exec(s))!==null) hits.push({label:m[2].toLowerCase(),start:m.index+m[1].length,contentStart:re.lastIndex});
  if(!hits.length) return out;
  hits.forEach((h,i)=>{ const end=i+1<hits.length?hits[i+1].start:s.length; out[h.label]=s.slice(h.contentStart,end).trim(); });
  return out;
}
function v421DefaultTypeTotals_(questions,totalScore){
  totalScore=Number(totalScore||10); const counts={MC:0,TF:0,SA:0,LA:0}; questions.forEach(q=>counts[q.type]++);
  let mc=counts.MC*0.25, tf=counts.TF*1.0, sa=counts.SA*0.5, objective=mc+tf+sa, la=0;
  if(counts.LA){
    if(objective>totalScore && objective>0){ const factor=(totalScore*0.7)/objective; mc*=factor;tf*=factor;sa*=factor;objective=mc+tf+sa; }
    la=Math.max(0,totalScore-objective);
  }else if(objective>0){
    const factor=totalScore/objective; mc*=factor;tf*=factor;sa*=factor;objective=totalScore;
  }else if(counts.LA){ la=totalScore; }
  const sum=mc+tf+sa+la; if(sum && Math.abs(sum-totalScore)>0.001) la=Math.max(0,la+(totalScore-sum));
  return {MC:v421Round_(mc),TF:v421Round_(tf),SA:v421Round_(sa),LA:v421Round_(la)};
}
function v421TypeTotalsFromParams_(questions,totalScore,raw){
  const suggested=v421DefaultTypeTotals_(questions,totalScore), src=v420Json_(raw,null);
  if(!src || typeof src!=='object') return suggested;
  const out={}; V421_ALL_TYPES.forEach(t=>out[t]=Math.max(0,Number(src[t]??src[t.toLowerCase()]??0)||0));
  const sum=V421_ALL_TYPES.reduce((s,t)=>s+out[t],0);
  if(Math.abs(sum-Number(totalScore))>0.02) throw new Error('Tổng điểm MC + TF + SA + LA phải bằng '+totalScore+'. Hiện tại = '+v421Round_(sum)+'.');
  V421_ALL_TYPES.forEach(t=>{ if(!questions.some(q=>q.type===t) && out[t]>0.001) throw new Error('Đề không có câu '+t+' nhưng vẫn phân '+out[t]+' điểm.'); });
  return out;
}
function v421DistributePoints_(questions,totalScore,typeTotalsRaw){
  const totals=v421TypeTotalsFromParams_(questions,totalScore,typeTotalsRaw), points={};
  V421_ALL_TYPES.forEach(type=>{
    const rows=questions.filter(q=>q.type===type); if(!rows.length)return;
    const target=Number(totals[type]||0); const explicit=rows.filter(q=>q.explicit_points>0);
    if(explicit.length===rows.length){
      const es=explicit.reduce((s,q)=>s+q.explicit_points,0); const factor=es?target/es:0; rows.forEach(q=>points[q.id]=v421Round_(q.explicit_points*factor));
    }else if(type==='LA'){
      const weights=rows.map(q=>Math.max(1,v421SubpartLabels_(q.question).length||v421SubpartLabels_(q.explain).length||1)); const ws=weights.reduce((a,b)=>a+b,0)||rows.length;
      rows.forEach((q,i)=>points[q.id]=v421Round_(target*weights[i]/ws));
    }else{
      const each=rows.length?target/rows.length:0; rows.forEach(q=>points[q.id]=v421Round_(each));
    }
    // Chốt sai số làm tròn vào câu cuối của loại.
    const assigned=rows.reduce((s,q)=>s+Number(points[q.id]||0),0), diff=v421Round_(target-assigned);
    if(rows.length && Math.abs(diff)>=0.001) points[rows[rows.length-1].id]=v421Round_(Number(points[rows[rows.length-1].id]||0)+diff);
  });
  return {type_totals:totals,question_points:points};
}
function v421BuildRubricForLA_(q,maxScore){
  const qParts=v421SplitSubparts_(q.question), aParts=v421SplitSubparts_(q.explain), labels=Object.keys(qParts).length?Object.keys(qParts):Object.keys(aParts);
  if(!labels.length){
    return {question:q.id,type:'LA',max_score:maxScore,prompt:q.question,reference_solution:q.explain,criteria:[{id:q.id+'.1',description:'Giải đúng, lập luận hợp lý và kết luận phù hợp với yêu cầu câu hỏi.',points:maxScore,reference_solution:q.explain}]};
  }
  const each=labels.length?maxScore/labels.length:maxScore; let criteria=labels.map((label,i)=>({id:q.id+'.'+label,description:'Ý '+label+') '+String(qParts[label]||'').trim(),points:v421Round_(each),reference_solution:String(aParts[label]||q.explain||'').trim()}));
  const sum=criteria.reduce((s,c)=>s+c.points,0),diff=v421Round_(maxScore-sum); if(criteria.length&&Math.abs(diff)>=0.001)criteria[criteria.length-1].points=v421Round_(criteria[criteria.length-1].points+diff);
  return {question:q.id,type:'LA',max_score:maxScore,prompt:q.question,reference_solution:q.explain,criteria:criteria};
}
function v421BuildImportedExam_(questions,totalScore,typePointsRaw){
  const scoring=v421DistributePoints_(questions,totalScore,typePointsRaw), answerKey={},rubric=[];
  questions.forEach(q=>{
    const pt=Number(scoring.question_points[q.id]||0);
    if(V421_OBJECTIVE_TYPES.includes(q.type)) answerKey[q.id]={type:q.type,answer:q.correct_answer,points:pt,question:q.question,options:q.options,explain:q.explain};
    else rubric.push(v421BuildRubricForLA_(q,pt));
  });
  const objectiveTotal=v421Round_(Number(scoring.type_totals.MC||0)+Number(scoring.type_totals.TF||0)+Number(scoring.type_totals.SA||0));
  return {answer_key:answerKey,rubric:rubric,scoring:scoring,objective_total:objectiveTotal,essay_total:v421Round_(scoring.type_totals.LA||0)};
}
function v421Summary_(questions,totalScore,typePointsRaw){
  const counts={MC:0,TF:0,SA:0,LA:0}, levels={}, chapters=[]; questions.forEach(q=>{counts[q.type]++;if(q.level)levels[q.level]=(levels[q.level]||0)+1;if(q.chapter&&!chapters.includes(q.chapter))chapters.push(q.chapter);});
  const built=v421BuildImportedExam_(questions,totalScore,typePointsRaw); const first=questions[0]||{};
  const titleParts=[]; if(first.subject)titleParts.push('Đề '+first.subject); if(first.grade)titleParts.push('Khối '+first.grade); if(chapters.length===1)titleParts.push(chapters[0]);
  return {question_count:questions.length,counts:counts,levels:levels,chapters:chapters,grade:first.grade||'',subject:first.subject||'Toán',suggested_title:titleParts.join(' - ')||'Bài kiểm tra nhập tự động',total_score:Number(totalScore||10),type_points:built.scoring.type_totals,objective_points:built.objective_total,essay_points:built.essay_total};
}
function previewExamJsonDefinition(params){
  params=params||{}; const total=v420Clamp_(params.total_score||10,1,100),questions=v421ParseQuestionJson_(params.json_text||params.questions||'');
  const summary=v421Summary_(questions,total,params.type_points_json||params.type_points);
  return {summary:summary,questions:questions.map(q=>({id:q.id,type:q.type,level:q.level,chapter:q.chapter,topic:q.topic,question:q.question,correct_answer:q.correct_answer,has_explain:!!q.explain}))};
}
function importExamJsonDefinition(params){
  params=params||{}; const total=v420Clamp_(params.total_score||10,1,100),questions=v421ParseQuestionJson_(params.json_text||params.questions||'');
  const built=v421BuildImportedExam_(questions,total,params.type_points_json||params.type_points), summary=v421Summary_(questions,total,params.type_points_json||params.type_points);
  const title=String(params.title||summary.suggested_title||'Bài kiểm tra nhập tự động').trim(); if(title.length<3)throw new Error('Tên bài kiểm tra quá ngắn.');
  const grade=normalizeNumberString(params.grade||summary.grade), subject=String(params.subject||summary.subject||'Toán').trim(), className=normalizeClassName(params.className||params.class||'');
  if(!grade) throw new Error('Không nhận diện được khối từ file. Hãy bổ sung Grade hoặc chọn khối.');
  const now=v420Now_(), id=generateId('EXAM'), row={
    exam_id:id,title:title,subject:subject,grade:grade,class:className,exam_date:String(params.exam_date||v420IsoDate_()),exam_type:String(params.exam_type||'15P'),
    total_score:total,mcq_count:questions.filter(q=>V421_OBJECTIVE_TYPES.includes(q.type)).length,mcq_points:built.objective_total,essay_points:built.essay_total,status:'READY',
    answer_key_json:JSON.stringify(built.answer_key),rubric_json:JSON.stringify(built.rubric),question_bank_json:JSON.stringify(questions),scoring_json:JSON.stringify(built.scoring),source_format:V421_IMPORT_SOURCE,source_summary_json:JSON.stringify(summary),
    answer_sheet_template:String(params.answer_sheet_template||PropertiesService.getScriptProperties().getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')||'ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1'),annotation_enabled:'TRUE',
    instructions:String(params.instructions||('Nhập tự động từ JSON: '+summary.counts.MC+' MC, '+summary.counts.TF+' TF, '+summary.counts.SA+' SA, '+summary.counts.LA+' LA. Mẫu giấy: A/B tô OMR, C/D viết tay.')),
    created_by:String(params.created_by||'admin'),created_at:now,updated_at:now
  };
  v420AppendObject_(v420Sheet_(V420_EXAM_SHEETS.definitions),row); bumpDataVersion_('exam_json_import');
  securityLog_('EXAM_JSON_IMPORT','SUCCESS',id,'admin',JSON.stringify({questions:questions.length,counts:summary.counts,total_score:total}).slice(0,800));
  return Object.assign({},row,{answer_key:built.answer_key,rubric:built.rubric,question_bank:questions,scoring:built.scoring,source_summary:summary});
}
