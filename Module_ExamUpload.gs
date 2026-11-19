// ============================================================================
// V4.22 - MODULE CHẤM BÀI: UPLOAD / GOOGLE DRIVE / ASSET VIEW
// Ảnh/PDF không lưu Base64 trong Sheet. Sheet chỉ giữ file_id JSON.
// ============================================================================

function v420StripAccents_(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function v420SafeFileName_(name){ return String(name||'bai_lam').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,160)||'bai_lam'; }
function v420GetExamRootFolder_(){
  const props=PropertiesService.getScriptProperties(); const saved=String(props.getProperty('ANPHUC_EXAM_DRIVE_FOLDER_ID')||'').trim();
  if(saved){ try{return DriveApp.getFolderById(saved);}catch(e){} }
  const name='AN_PHUC_EDUCATION_CHAM_BAI'; const it=DriveApp.getFoldersByName(name); const folder=it.hasNext()?it.next():DriveApp.createFolder(name);
  props.setProperty('ANPHUC_EXAM_DRIVE_FOLDER_ID',folder.getId()); return folder;
}
function v420GetExamFolder_(exam){
  const root=v420GetExamRootFolder_(); const label=v420SafeFileName_(`${exam.exam_date||''}_${exam.grade||''}${exam.class||''}_${exam.title||exam.exam_id}`);
  const it=root.getFoldersByName(label); return it.hasNext()?it.next():root.createFolder(label);
}
function v420FindStudentFromFilename_(fileName,exam){
  const students=getSheetData('Students').filter(s=>normalizeNumberString(s.grade)===normalizeNumberString(exam.grade) && (!normalizeClassName(exam.class)||normalizeClassName(s.class)===normalizeClassName(exam.class)));
  const raw=String(fileName||''), norm=v420StripAccents_(raw);
  for(const s of students){ if(String(s.student_id||'') && raw.toUpperCase().includes(String(s.student_id).toUpperCase())) return s; }
  const scored=students.map(s=>{const n=v420StripAccents_(s.name),tokens=n.split(' ').filter(x=>x.length>=2),score=tokens.reduce((a,t)=>a+(norm.includes(t)?1:0),0);return{s,score,total:tokens.length};}).filter(x=>x.score>=2&&x.score>=Math.min(3,x.total)).sort((a,b)=>b.score-a.score);
  return scored.length&&(!scored[1]||scored[0].score>scored[1].score)?scored[0].s:null;
}
function v420StudentById_(studentId){ return getSheetData('Students').find(s=>String(s.student_id)===String(studentId))||null; }

function createExamSubmission(params){
  params=params||{}; const exam=getExamDefinition({exam_id:params.exam_id}); const student=params.student_id?v420StudentById_(params.student_id):null;
  const id=generateId('SUB'); const now=v420Now_();
  const row={submission_id:id,exam_id:exam.exam_id,student_id:student?student.student_id:'',student_name:student?student.name:String(params.student_name||''),grade:student?student.grade:exam.grade,class:student?student.class:exam.class,
    file_ids_json:'[]',file_names_json:'[]',status:'UPLOADING',ai_status:'PENDING',ai_score:'',teacher_score:'',final_score:'',confidence:'',ai_feedback:'',parent_feedback:'',grading_json:'{}',annotation_json:'{"version":"V4.22","items":[]}',annotated_at:'',parent_view_ready:'FALSE',created_at:now,updated_at:now,reviewed_at:'',sent_parent_at:''};
  v420AppendObject_(v420Sheet_(V420_EXAM_SHEETS.submissions),row); bumpDataVersion_('exam_submission_create'); return row;
}

function uploadExamSubmissionFile(params){
  params=params||{}; const exam=getExamDefinition({exam_id:params.exam_id});
  const fileName=v420SafeFileName_(params.file_name||'bai_lam.jpg'), mime=String(params.mime_type||'image/jpeg').trim().toLowerCase();
  if(!/^image\/(jpeg|jpg|png|webp)$/.test(mime) && mime!=='application/pdf')throw new Error('Chỉ hỗ trợ JPG, PNG, WEBP hoặc PDF.');
  let data=String(params.base64||params.data_base64||''); if(data.includes(','))data=data.split(',',2)[1]; if(!data)throw new Error('Không có dữ liệu file.');
  const bytes=Utilities.base64Decode(data); if(bytes.length>8*1024*1024)throw new Error('Mỗi file tối đa 8MB. Hãy giảm kích thước ảnh/PDF.');

  let submissionId=String(params.submission_id||'').trim(), submission=null;
  if(submissionId){ submission=getExamSubmissions({exam_id:exam.exam_id}).find(s=>String(s.submission_id)===submissionId); if(!submission)throw new Error('Không tìm thấy bài nộp.'); }
  else {
    const student=params.student_id?v420StudentById_(params.student_id):v420FindStudentFromFilename_(fileName,exam);
    submission=createExamSubmission({exam_id:exam.exam_id,student_id:student?student.student_id:'',student_name:student?student.name:''}); submissionId=submission.submission_id;
  }

  const folder=v420GetExamFolder_(exam); const ext=fileName.includes('.')?fileName.slice(fileName.lastIndexOf('.')):''; const stored=v420SafeFileName_(`${submissionId}_${fileName.replace(ext,'')}`)+ext;
  const blob=Utilities.newBlob(bytes,mime,stored); const file=folder.createFile(blob);
  const ids=v420Json_(submission.file_ids_json,[]), names=v420Json_(submission.file_names_json,[]); ids.push(file.getId()); names.push(file.getName());
  const student=params.student_id?v420StudentById_(params.student_id):null;
  const patch={file_ids_json:JSON.stringify(ids),file_names_json:JSON.stringify(names),status:'UPLOADED',ai_status:'PENDING',updated_at:v420Now_()};
  if(student){patch.student_id=student.student_id;patch.student_name=student.name;patch.grade=student.grade;patch.class=student.class;}
  const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',submissionId,patch); bumpDataVersion_('exam_upload');
  return Object.assign({},updated,{file_count:ids.length,file_id:file.getId(),file_name:file.getName()});
}

function assignExamSubmissionStudent(params){
  params=params||{}; const student=v420StudentById_(params.student_id); if(!student)throw new Error('Không tìm thấy học sinh.');
  const updated=v420UpdateObjectById_(v420Sheet_(V420_EXAM_SHEETS.submissions),'submission_id',params.submission_id,{student_id:student.student_id,student_name:student.name,grade:student.grade,class:student.class,updated_at:v420Now_()});
  bumpDataVersion_('exam_assign_student'); return updated;
}

function getExamSubmissions(params){
  params=params||{}; let rows=getSheetData(V420_EXAM_SHEETS.submissions); const examId=String(params.exam_id||'').trim(),status=String(params.status||'').trim().toUpperCase();
  if(examId)rows=rows.filter(r=>String(r.exam_id)===examId); if(status)rows=rows.filter(r=>String(r.status||'').toUpperCase()===status);
  return rows.slice().sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))).map(r=>Object.assign({},r,{file_ids:v420Json_(r.file_ids_json,[]),file_names:v420Json_(r.file_names_json,[]),grading:v420Json_(r.grading_json,{}),annotation:v420Json_(r.annotation_json,{version:'V4.22',items:[]})}));
}
function getExamSubmission(params){
  const id=String((params||{}).submission_id||'').trim(); const row=getSheetData(V420_EXAM_SHEETS.submissions).find(r=>String(r.submission_id)===id); if(!row)throw new Error('Không tìm thấy bài nộp.');
  return Object.assign({},row,{file_ids:v420Json_(row.file_ids_json,[]),file_names:v420Json_(row.file_names_json,[]),grading:v420Json_(row.grading_json,{}),annotation:v420Json_(row.annotation_json,{version:'V4.22',items:[]})});
}

function getExamSubmissionAsset(params){
  params=params||{}; const sub=getExamSubmission({submission_id:params.submission_id}),idx=Math.max(0,Number(params.asset_index||0));
  const ids=sub.file_ids||[]; if(idx>=ids.length)throw new Error('Không tìm thấy trang/file bài làm.');
  const file=DriveApp.getFileById(ids[idx]),blob=file.getBlob(),bytes=blob.getBytes();
  if(bytes.length>9*1024*1024)throw new Error('File quá lớn để xem trực tiếp. Hãy giảm kích thước file xuống dưới 9MB.');
  return {submission_id:sub.submission_id,asset_index:idx,file_name:file.getName(),mime_type:blob.getContentType()||'application/octet-stream',size:bytes.length,base64:Utilities.base64Encode(bytes)};
}

