/* AN PHUC LMS V1.2 - independent frontend, legacy functions/IDs unchanged */
'use strict';
const AP_LMS_UI={student:null,session:'',candidate:null,quiz:null,busy:false,bankReady:false,queryTimer:null,lookupSeq:0,selectedChapter:null};
function apLmsEl(id){return document.getElementById(id);}
function apLmsEsc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function apLmsError(msg){const el=apLmsEl('ap-lms-message');if(el){el.textContent=String(msg||'Có lỗi xảy ra.');el.hidden=false;} }
function apLmsClearError(){const el=apLmsEl('ap-lms-message');if(el){el.textContent='';el.hidden=true;}}
function apLmsBusy(flag){AP_LMS_UI.busy=!!flag;document.querySelectorAll('#ap-lms-app .lms-submit-lock').forEach(b=>b.disabled=!!flag);}
function apLmsText(q){return String(q==null?'':q);}
function apLmsMath(text){
  const raw=apLmsText(text),parts=raw.split(/(\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+\$)/g);
  return parts.map(piece=>{
    if(piece.startsWith('$$')&&piece.endsWith('$$')&&piece.length>4||piece.startsWith('$')&&piece.endsWith('$')&&piece.length>2){
      const display=piece.startsWith('$$'),math=display?piece.slice(2,-2):piece.slice(1,-1);
      try{if(window.katex)return katex.renderToString(math,{throwOnError:false,displayMode:display,trust:false,strict:'ignore',output:'html'});}catch(e){}
    }
    const safe=apLmsEsc(piece);
    return safe.replace(/https:\/\/res\.cloudinary\.com\/[\w./%?=&+~-]+/g,url=>`<a href="${url}" target="_blank" rel="noopener noreferrer"><img alt="Hình minh họa bài Toán" loading="lazy" src="${url}" style="max-width:100%;max-height:260px;object-fit:contain;border-radius:10px"></a>`).replace(/\n/g,'<br>');
  }).join('');
}
async function apLmsApi(action,params={},method='GET',admin=false){
  const payload={action,...params,_client_id:(typeof getSecurityClientId==='function'?getSecurityClientId():'ap_lms_anon')};
  if(admin){if(typeof getAdminToken!=='function'||!getAdminToken())throw new Error('Cần đăng nhập Giáo viên trước.');payload._auth_token=getAdminToken();}
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),(['apLmsImportStageBatch','apLmsImportFinalize','apLmsAIGenerate','apLmsAIRegenerateDraft'].includes(action))?110000:32000);
  let response;
  try{
    const url=method==='GET'?API_URL+'?'+new URLSearchParams({...payload,_t:String(Date.now())}).toString():API_URL;
    response=await fetch(url,{method,redirect:'follow',cache:'no-store',signal:ctrl.signal,...(method==='POST'?{headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}:{})});
    const txt=await response.text();let result;
    try{result=JSON.parse(txt);}catch(e){throw new Error('Backend không trả JSON hợp lệ. Cần triển khai Apps Script mới nhất.');}
    if(!response.ok||result.success===false){
      const raw=String(result.message||'Yeu cau khong thanh cong.');
      let code=String(result.error_code||raw.split(':')[0]||'API_ERROR').slice(0,80);
      console.error('[AP LMS API]',{action,method,status:response.status,code,message:raw});
      if(!admin && /UNAUTHORIZED:.*Gi[a-z\u00e1]o vi[e\u00ean]n/i.test(raw)){
        if(action==='apLmsPublicDiagnostics')
          throw new Error('LMS_DIAGNOSTICS_PROTECTED: /exec đang khóa nhầm endpoint chẩn đoán công khai. Kiểm tra API_URL và cập nhật Code.gs V1.5.3. (Phản hồi gốc: '+raw+')');
        if(['apLmsPhoneLogin','apLmsLogin','apLmsDashboard','apLmsStart','apLmsSubmit','apLmsSaveDraft','apLmsAutoCatalog','apLmsAutoStart','apLmsAutoSubmit'].includes(action))
          throw new Error('LMS_STUDENT_ROUTE_PROTECTED: API '+action+' đang bị yêu cầu quyền Giáo viên trên deployment /exec. Cập nhật Code.gs và Module_LMS.gs, rồi Deploy New Version.');
      }
      throw new Error(raw);
    }
    return result.data;
  }catch(e){if(e.name==='AbortError')throw new Error('Máy chủ phản hồi quá chậm. Vui lòng kiểm tra mạng hoặc thử lại.');throw e;}
  finally{clearTimeout(timeout);}
}
function apLmsScreen(screen){['ap-lms-login','ap-lms-dashboard','ap-lms-quiz','ap-lms-result'].forEach(id=>{const e=apLmsEl(id);if(e)e.hidden=(id!==screen);});}
function apLmsOpenStudent(){
  if(apLmsEl('role-landing'))apLmsEl('role-landing').style.display='none';
  if(apLmsEl('public-app'))apLmsEl('public-app').style.display='none';
  if(apLmsEl('admin-app'))apLmsEl('admin-app').style.display='none';
  apLmsEl('ap-lms-app').hidden=false;apLmsEl('ap-lms-app').style.display='block';
  AP_LMS_UI.session=sessionStorage.getItem('ap_lms_student_token')||'';
  if(AP_LMS_UI.session){apLmsLoadDashboard();}else{apLmsScreen('ap-lms-login');apLmsEl('ap-lms-name').focus();}
}
function apLmsExit(){
  apLmsEl('ap-lms-app').hidden=true;apLmsEl('ap-lms-app').style.display='none';
  if(typeof showLandingMode==='function')showLandingMode();
}
function apLmsLogout(){if(AP_LMS_UI.quiz?.syncTimer)clearTimeout(AP_LMS_UI.quiz.syncTimer);AP_LMS_UI.session='';AP_LMS_UI.student=null;AP_LMS_UI.quiz=null;sessionStorage.removeItem('ap_lms_student_token');apLmsClearError();apLmsScreen('ap-lms-login');apLmsEl('ap-lms-name').value='';apLmsEl('ap-lms-phone').value='';apLmsEl('ap-lms-candidates').innerHTML='';AP_LMS_UI.candidate=null;}
function apLmsNameSearch(){
  clearTimeout(AP_LMS_UI.queryTimer);AP_LMS_UI.candidate=null;apLmsClearError();const val=apLmsEl('ap-lms-name').value.trim();
  apLmsEl('ap-lms-selected').textContent='';const box=apLmsEl('ap-lms-candidates');box.innerHTML='';
  if(val.length<2)return;
  AP_LMS_UI.queryTimer=setTimeout(async()=>{
    const request=++AP_LMS_UI.lookupSeq;
    try{
      const rows=await apLmsApi('publicFindStudentByName',{student_name:val});
      if(request!==AP_LMS_UI.lookupSeq||val!==apLmsEl('ap-lms-name').value.trim())return;
      box.innerHTML=Array.isArray(rows)&&rows.length?rows.map((r,i)=>`<button type="button" class="lms-candidate" data-index="${i}"><span><b>${apLmsEsc(r.name)}</b><br><small>${apLmsEsc(r.class_info)}</small></span><i class="bi bi-chevron-right"></i></button>`).join(''):'<p>Chưa tìm thấy học sinh phù hợp.</p>';
      box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>apLmsChooseCandidate(rows[Number(btn.dataset.index)])));
    }catch(e){apLmsError(e.message);}
  },320);
}
function apLmsChooseCandidate(item){AP_LMS_UI.candidate=item;apLmsEl('ap-lms-selected').textContent='Đã chọn: '+item.name+' · '+item.class_info;apLmsEl('ap-lms-name').value=item.name;apLmsEl('ap-lms-candidates').innerHTML='';apLmsEl('ap-lms-phone').focus();}
async function apLmsLogin(event){
  if(event)event.preventDefault();if(AP_LMS_UI.busy)return;
  const candidate=AP_LMS_UI.candidate,phone=apLmsEl('ap-lms-phone').value.replace(/\s/g,'');
  if(!candidate){apLmsError('Hãy nhập tên và chọn đúng học sinh trong danh sách gợi ý.');return;}
  if(!/^0\d{9}$/.test(phone)){apLmsError('Nhập đúng 10 chữ số điện thoại đã đăng ký với Trung tâm.');return;}
  apLmsBusy(true);apLmsClearError();
  try{
    // Authenticate directly; do not wait for a nonessential diagnostics GET.
    // Student identity and phone are verified server-side by apLmsPhoneLogin.
    const result=await apLmsApi('apLmsPhoneLogin',{student_id:candidate.student_id,parent_phone:phone},'POST');
    AP_LMS_UI.session=result.session_token;AP_LMS_UI.student=result.student;sessionStorage.setItem('ap_lms_student_token',result.session_token);await apLmsLoadDashboard();
  }catch(e){apLmsError(e.message);}finally{apLmsBusy(false);}
}
let AP_LMS_BACKEND_CHECKED_AT=0;
let AP_LMS_BACKEND_CAPABILITIES={};
async function apLmsCheckBackend(){
  if(Date.now()-AP_LMS_BACKEND_CHECKED_AT<180000)return true;
  let cap;
  try{cap=await apLmsApi('apLmsPublicDiagnostics',{},'GET',false);}
  catch(e){
    // A stale /exec deployment routes unknown actions to the teacher gate.
    throw new Error('LMS_BACKEND_MISMATCH: Deployment Apps Script tại API_URL chưa có endpoint chẩn đoán công khai hoặc chưa được cấp quyền. Cập nhật Code.gs cùng Module_LMS.gs; Deploy > Manage deployments > Edit > New version. API trả về: '+e.message);
  }
  const required=['student_login','student_dashboard','student_start','student_submit'];
  const missing=cap&&cap.capabilities?required.filter(k=>cap.capabilities[k]!==true):[];
  if(!cap||cap.public_lms!==true||missing.length)
    throw new Error('LMS_BACKEND_MISMATCH: Backend hiện thiếu API học sinh: '+(missing.join(', ')||'apLmsPhoneLogin/apLmsDashboard/apLmsStart/apLmsSubmit')+'. Hãy triển khai đầy đủ Module_LMS.gs lên đúng deployment /exec.');
  // Do not hard-block a usable backend only because its cosmetic version changed.
  AP_LMS_BACKEND_CAPABILITIES=cap.capabilities||{};
  AP_LMS_BACKEND_CHECKED_AT=Date.now();return true;
}
function apLmsDate(value){if(!value)return '';const d=new Date(value);return Number.isFinite(d.valueOf())?d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(value);}
function apLmsTopicCard_(t){
  const best=t.best_score===null?'Chưa làm':(t.best_score+'/10 điểm');
  const counts=Array.isArray(t.levels)?t.levels:[];
  return `<article class="lms-assignment lms-topic-card" data-topic-search="${apLmsEsc((t.chapter+' '+t.topic).toLocaleLowerCase('vi-VN'))}">
    <div class="lms-topic-head"><span class="lms-pill"><i class="bi bi-book-half"></i> Khối ${apLmsEsc(t.grade)}</span><span class="lms-topic-count">${Number(t.count)} câu khả dụng</span></div>
    <h3>${apLmsEsc(t.topic)}</h3><p>${apLmsEsc(t.chapter)}</p>
    <div class="lms-topic-info"><span><i class="bi bi-shuffle"></i> ${Math.min(10,Number(t.count))} câu/ngẫu nhiên</span><span><i class="bi bi-award"></i> ${apLmsEsc(best)}</span></div>
    <small class="lms-topic-hint">${counts.filter(n=>Number(n)>0).length||1} mức độ hiện có · Thang 10 · Không yêu cầu mã đề</small>
    <button class="lms-btn teal lms-submit-lock" type="button" data-topic-id="${apLmsEsc(t.topic_id)}">${t.best_score===null?'Làm bài ngay':'Luyện lại chủ đề'} <i class="bi bi-arrow-right"></i></button>
  </article>`;
}
function apLmsSelectChapter_(chapter){
  AP_LMS_UI.selectedChapter=chapter;
  apLmsRenderTopicCatalog_(apLmsEl('ap-lms-topic-search')?.value||'');
  const out=apLmsEl('ap-lms-topic-list');
  if(out&&typeof out.scrollIntoView==='function')out.scrollIntoView({block:'start',behavior:'smooth'});
}
function apLmsRenderTopicCatalog_(query=''){
  const el=apLmsEl('ap-lms-topic-list');if(!el)return;
  const items=AP_LMS_UI.autoTopics||[];
  const q=String(query||'').toLocaleLowerCase('vi-VN').trim();
  const shown=items.filter(t=>(t.chapter+' '+t.topic).toLocaleLowerCase('vi-VN').includes(q));
  const chapters=new Map();shown.forEach(t=>{if(!chapters.has(t.chapter))chapters.set(t.chapter,[]);chapters.get(t.chapter).push(t);});
  const selected=AP_LMS_UI.selectedChapter;
  if(!selected){
    const rows=Array.from(chapters.entries()).sort((a,b)=>a[0].localeCompare(b[0],'vi'));
    el.innerHTML=`<div class="lms-step-heading"><span class="lms-step-number">1</span><div><h3>Chọn chương em muốn học</h3><p>Chạm vào một chương để xem các bài tương ứng.</p></div></div>`+
      (rows.length?`<div class="lms-chapter-grid">${rows.map(([chapter,topics],i)=>{
        const done=topics.filter(t=>t.best_score!==null&&Number(t.best_score)>=6).length;
        const count=topics.reduce((n,t)=>n+Number(t.count||0),0);
        return `<button type="button" class="lms-chapter-card" data-chapter-index="${i}"><span class="lms-chapter-icon"><i class="bi bi-journal-bookmark"></i></span><span class="lms-chapter-name">${apLmsEsc(chapter)}</span><span class="lms-chapter-meta">${topics.length} bài · ${count} câu · ${done} bài đạt</span><span class="lms-chapter-open">Xem các bài <i class="bi bi-chevron-right"></i></span></button>`;
      }).join('')}</div>`:'<div class="lms-empty">Không tìm thấy chương phù hợp.</div>');
    el.querySelectorAll('[data-chapter-index]').forEach(btn=>btn.addEventListener('click',()=>apLmsSelectChapter_(rows[Number(btn.dataset.chapterIndex)][0])));
    return;
  }
  const topics=chapters.get(selected)||[];
  el.innerHTML=`<nav class="lms-breadcrumb" aria-label="Điều hướng chương"><button type="button" id="ap-lms-back-chapters"><i class="bi bi-arrow-left"></i> Tất cả chương</button><span aria-hidden="true">/</span><b>${apLmsEsc(selected)}</b></nav>
    <div class="lms-step-heading"><span class="lms-step-number">2</span><div><h3>Chọn bài để làm ngay</h3><p>${topics.length} bài trong ${apLmsEsc(selected)} · không cần mã đề</p></div></div>`+
    (topics.length?`<div class="lms-grid">${topics.map(apLmsTopicCard_).join('')}</div>`:'<div class="lms-empty">Không tìm thấy bài phù hợp với bộ lọc. Hãy thử từ khóa khác.</div>');
  apLmsEl('ap-lms-back-chapters')?.addEventListener('click',()=>apLmsSelectChapter_(null));
  el.querySelectorAll('[data-topic-id]').forEach(btn=>btn.addEventListener('click',()=>apLmsStartAuto(btn.dataset.topicId)));
}
async function apLmsLoadDashboard(){
  apLmsClearError();apLmsScreen('ap-lms-dashboard');
  apLmsEl('ap-lms-dashboard-content').innerHTML='<div class="lms-spinner">Đang tải danh mục chương và bài đúng khối của em...</div>';
  try{
    const d=await apLmsApi('apLmsAutoCatalog',{session_token:AP_LMS_UI.session});
    AP_LMS_UI.student=d.student;AP_LMS_UI.autoTopics=Array.isArray(d.topics)?d.topics:[];AP_LMS_UI.selectedChapter=null;
    const noBank=d.bank_connected===false;
    apLmsEl('ap-lms-dashboard-content').innerHTML=`<div class="lms-title-row"><div><h2>Xin chào, ${apLmsEsc(d.student.name)}!</h2><p>Khối ${apLmsEsc(d.student.grade)} · Lớp ${apLmsEsc(d.student.class_id)} · Em chọn chương và bài để luyện tập ngay.</p></div><span class="lms-pill"><i class="bi bi-mortarboard-fill"></i> Tự chọn bài học</span></div>
    <div class="lms-metrics"><div class="lms-metric"><strong>${AP_LMS_UI.autoTopics.length}</strong><span>Chủ đề có câu hỏi</span></div><div class="lms-metric"><strong>${Number(d.completed||0)}</strong><span>Đã đạt 6 điểm</span></div><div class="lms-metric"><strong>${Number(d.pending||0)}</strong><span>Chưa đạt hoặc chưa làm</span></div></div>
    ${noBank?'<div class="lms-empty">Ngân hàng chưa kết nối. Em vẫn đăng nhập được nhưng chưa có bài để làm.</div>':
      `<div class="lms-topic-toolbar"><label for="ap-lms-topic-search">Tìm chương hoặc bài học</label><input id="ap-lms-topic-search" type="search" placeholder="Ví dụ: phân số, phương trình, hình học..." autocomplete="off"><p>Chủ đề có 1–10 câu: làm toàn bộ; nhiều hơn 10 câu: hệ thống chọn ngẫu nhiên đúng 10 câu. Điểm quy đổi về thang 10.</p></div><div id="ap-lms-topic-list"></div>`}`;
    if(!noBank){apLmsRenderTopicCatalog_();
      apLmsEl('ap-lms-topic-search').addEventListener('input',e=>apLmsRenderTopicCatalog_(e.target.value));
      if(!AP_LMS_UI.autoTopics.length)apLmsEl('ap-lms-topic-list').innerHTML='<div class="lms-empty">Khối này chưa có câu hỏi READY hợp lệ. Giáo viên có thể duyệt bổ sung ngân hàng.</div>';
    }
  }catch(e){
    if(/LMS_UNAUTHORIZED/.test(e.message||'')){apLmsLogout();apLmsError('Phiên học sinh hết hạn. Vui lòng đăng nhập lại.');}
    else apLmsEl('ap-lms-dashboard-content').innerHTML='<div class="lms-empty">'+apLmsEsc(e.message)+'</div>';
  }
}
function apLmsDraftKey(q){return 'ap_lms_draft_v2_'+q.studentId+'_'+q.assignmentId+'_'+q.level;}
function apLmsQueueServerDraft(q){
  if(!q||q.isAuto||q.syncTimer||AP_LMS_BACKEND_CAPABILITIES.student_draft!==true)return;
  // Random jitter prevents 40 clients from syncing all at the same moment.
  q.syncTimer=setTimeout(async()=>{
    q.syncTimer=null;
    if(AP_LMS_UI.quiz!==q||!AP_LMS_UI.session)return;
    const answers={...q.answers};
    try{await apLmsApi('apLmsSaveDraft',{session_token:AP_LMS_UI.session,assignment_id:q.assignmentId,level:q.level,answers},'POST');
      q.lastServerSync=Date.now();
      if(JSON.stringify(answers)!==JSON.stringify(q.answers))apLmsQueueServerDraft(q);
    }catch(e){console.info('[LMS draft] Local copy retained, server sync delayed:',e.message);}
  },45000+Math.round(Math.random()*20000));
}
function apLmsSaveDraft(){const q=AP_LMS_UI.quiz;if(!q)return;try{localStorage.setItem(apLmsDraftKey(q),JSON.stringify({answers:q.answers,updated:Date.now()}));}catch(e){}apLmsQueueServerDraft(q);}
async function apLmsStart(assignmentId,level){if(AP_LMS_UI.busy)return;apLmsBusy(true);apLmsClearError();
  try{const a=await apLmsApi('apLmsStart',{session_token:AP_LMS_UI.session,assignment_id:assignmentId,level});
    if(!a.questions||a.questions.length!==10)throw new Error('Bài tập chưa có đủ 10 câu.');
    const q={assignmentId,level,attemptToken:a.attempt_token,questions:a.questions,answers:{},current:0,title:a.title,studentId:AP_LMS_UI.student.student_id||AP_LMS_UI.student.id||''};
    try{const raw=JSON.parse(localStorage.getItem(apLmsDraftKey(q))||'null');
      const server=a.server_draft,serverAt=Date.parse(server?.updated_at||'')||0;
      const chosen=(server&&server.answers&&serverAt>Number(raw?.updated||0))?server.answers:raw?.answers;
      if(chosen)q.answers=Object.fromEntries(Object.entries(chosen).filter(([uid,ans])=>a.questions.some(x=>x.uid===uid)&&['A','B','C','D'].includes(ans)));
    }catch(e){}
    AP_LMS_UI.quiz=q;apLmsScreen('ap-lms-quiz');apLmsRenderQuiz();
  }catch(e){apLmsError(e.message);}finally{apLmsBusy(false);}
}
function apLmsAutoActiveKey_(studentId,topicId){return 'ap_lms_auto_active_'+studentId+'_'+topicId;}
async function apLmsStartAuto(topicId){
  if(AP_LMS_UI.busy)return;
  apLmsBusy(true);apLmsClearError();
  try{
    const sid=AP_LMS_UI.student?.student_id||'';
    const key=apLmsAutoActiveKey_(sid,topicId);let a=null;
    try{
      const saved=JSON.parse(localStorage.getItem(key)||'null');
      if(saved && Date.now()-Number(saved.started_at||0)<7100000 &&
         saved.topic_id===topicId && saved.attempt_token && Array.isArray(saved.questions) &&
         saved.questions.length>=1 && saved.questions.length<=10)a=saved;
    }catch(e){}
    if(!a){
      a=await apLmsApi('apLmsAutoStart',{session_token:AP_LMS_UI.session,topic_id:topicId});
      a.started_at=Date.now();
      try{localStorage.setItem(key,JSON.stringify(a));}catch(e){}
    }
    if(!a.questions?.length||a.questions.length>10)throw new Error('Chủ đề không có bộ câu hỏi hợp lệ.');
    const quiz={isAuto:true,assignmentId:topicId,topicId,level:1,attemptToken:a.attempt_token,
      questions:a.questions,answers:{},current:0,title:a.title,studentId:sid,totalQuestions:a.questions.length};
    try{
      const raw=JSON.parse(localStorage.getItem(apLmsDraftKey(quiz))||'null');
      if(raw?.answers)quiz.answers=Object.fromEntries(Object.entries(raw.answers).filter(([uid,ans])=>
        a.questions.some(q=>q.uid===uid)&&['A','B','C','D'].includes(ans)));
    }catch(e){}
    AP_LMS_UI.quiz=quiz;apLmsScreen('ap-lms-quiz');apLmsRenderQuiz();
  }catch(e){apLmsError(e.message);}finally{apLmsBusy(false);}
}
function apLmsRenderQuiz(){
  const q=AP_LMS_UI.quiz;if(!q)return;
  const item=q.questions[q.current],picked=q.answers[item.uid],answered=Object.keys(q.answers).length;
  const n=q.questions.length,rate=Math.round(answered/n*100);
  apLmsEl('ap-lms-quiz-content').innerHTML=`<div class="lms-title-row"><div><span class="lms-pill">${q.isAuto?'Bài tự luyện':'Cấp '+q.level} · Thang điểm 10</span><h2 style="margin-top:10px">${apLmsEsc(q.title)}</h2><p>Câu ${q.current+1}/${n} · Đã chọn ${answered}/${n} đáp án</p></div><button type="button" class="lms-btn ghost" id="ap-lms-quiz-back">Về danh sách chủ đề</button></div>
  <div class="lms-progress-track"><div class="lms-progress-bar" style="width:${rate}%"></div></div>
  <div class="lms-quiz-legend"><span><i class="lms-dot done"></i> Đã chọn</span><span><i class="lms-dot"></i> Chưa chọn</span><span><i class="lms-dot active"></i> Câu đang xem</span></div>
  <nav class="lms-quiz-nav" aria-label="Chọn nhanh số câu">${q.questions.map((x,i)=>`<button type="button" data-qindex="${i}" aria-label="Câu ${i+1}, ${q.answers[x.uid]?'đã chọn':'chưa chọn'}" aria-current="${q.current===i?'step':'false'}" class="${q.answers[x.uid]?'done':''} ${q.current===i?'current':''}">${i+1}</button>`).join('')}</nav>
  <div class="lms-card"><div class="lms-question lms-math"><span class="lms-pill">Câu ${q.current+1}</span><div style="margin-top:12px">${apLmsMath(item.question)}</div></div><div class="lms-answer-grid">${item.options.map((v,i)=>{const letter='ABCD'[i];return `<button class="lms-answer ${picked===letter?'selected':''}" type="button" data-answer="${letter}"><b>${letter}</b><span class="lms-math">${apLmsMath(v)}</span></button>`;}).join('')}</div><div class="lms-quiz-controls"><button type="button" class="lms-btn ghost" id="ap-lms-prev" ${q.current===0?'disabled':''}>Câu trước</button><button type="button" class="lms-btn ghost" id="ap-lms-next" ${q.current===n-1?'disabled':''}>Câu tiếp</button><button type="button" class="lms-btn teal lms-submit-lock" id="ap-lms-submit">Nộp bài (${answered}/${n})</button></div><p class="lms-help">Đáp án được lưu tạm trên thiết bị. Máy chủ chỉ công bố kết quả sau khi nộp thành công.</p></div>
  <dialog id="ap-lms-submit-dialog" class="lms-submit-dialog" aria-labelledby="ap-lms-confirm-title"><div class="lms-confirm-icon"><i class="bi bi-send-check"></i></div><h3 id="ap-lms-confirm-title">Xác nhận nộp bài?</h3><p>${answered<n?`Em còn ${n-answered} câu chưa chọn đáp án. `:'Em đã trả lời đủ các câu. '}Sau khi nộp, hệ thống sẽ chấm điểm và lưu kết quả.</p><div class="lms-dialog-actions"><button type="button" class="lms-btn ghost" id="ap-lms-cancel-submit">Xem lại bài</button><button type="button" class="lms-btn teal lms-submit-lock" id="ap-lms-confirm-submit">Xác nhận nộp</button></div></dialog>`;
  apLmsEl('ap-lms-quiz-back').addEventListener('click',apLmsLoadDashboard);
  apLmsEl('ap-lms-prev').addEventListener('click',()=>{q.current=Math.max(0,q.current-1);apLmsRenderQuiz();});
  apLmsEl('ap-lms-next').addEventListener('click',()=>{q.current=Math.min(n-1,q.current+1);apLmsRenderQuiz();});
  apLmsEl('ap-lms-submit').addEventListener('click',apLmsConfirmSubmit);
  apLmsEl('ap-lms-cancel-submit').addEventListener('click',()=>apLmsEl('ap-lms-submit-dialog').close());
  apLmsEl('ap-lms-confirm-submit').addEventListener('click',()=>{apLmsEl('ap-lms-submit-dialog').close();apLmsSubmit();});
  apLmsEl('ap-lms-quiz-content').querySelectorAll('[data-qindex]').forEach(b=>b.addEventListener('click',()=>{q.current=Number(b.dataset.qindex);apLmsRenderQuiz();}));
  apLmsEl('ap-lms-quiz-content').querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>{q.answers[item.uid]=b.dataset.answer;apLmsSaveDraft();if(q.current<n-1)q.current++;apLmsRenderQuiz();}));
}
function apLmsConfirmSubmit(){
  if(AP_LMS_UI.busy||!AP_LMS_UI.quiz)return;
  const d=apLmsEl('ap-lms-submit-dialog');if(!d)return;
  if(typeof d.showModal==='function'){d.showModal();return;}
  const q=AP_LMS_UI.quiz,remaining=q.questions.length-Object.keys(q.answers).length;
  if(confirm((remaining?'Còn '+remaining+' câu chưa trả lời. ':'')+'Em xác nhận nộp bài?'))apLmsSubmit();
}
function apLmsMotivation_(score){
  const s=Number(score)||0;
  if(s>=9)return {title:'Xuất sắc! Em đã chinh phục bài học!',note:'Kiến thức rất vững vàng. Hãy thử thêm một bài mới nhé!',icon:'bi-trophy-fill',celebrate:true};
  if(s>=7)return {title:'Chúc mừng! Em làm rất tốt!',note:'Sự cố gắng của em đã mang lại kết quả đáng tự hào.',icon:'bi-stars',celebrate:true};
  if(s>=6)return {title:'Giỏi lắm! Em đã vượt qua!',note:'Hãy ôn lại những câu còn sai để tiến bộ hơn nữa.',icon:'bi-check-circle-fill',celebrate:false};
  return {title:'Mỗi lần luyện tập là một bước tiến!',note:'Em hãy xem lời giải, ôn lại và thử thêm một lần nhé!',icon:'bi-heart-fill',celebrate:false};
}
function apLmsReviewHtml_(q,review){
  if(!review.length)return '';
  return `<details class="lms-review-panel"><summary><i class="bi bi-list-check"></i> Xem lại chi tiết câu đúng/sai (${review.length} câu)</summary><div class="lms-review-items">${review.map((x,i)=>{
    const selected=q.answers[x.uid]||'',correct=selected===x.answer;
    const ques=q.questions.find(item=>item.uid===x.uid);
    return `<article class="lms-review-entry ${correct?'correct':'incorrect'}"><div class="lms-review-heading"><strong>Câu ${i+1}</strong><span>${correct?'✓ Đúng':'✕ Chưa đúng'}</span></div>
      ${ques?`<p class="lms-math">${apLmsMath(ques.question)}</p>`:''}<p>Em chọn: <b>${selected?apLmsEsc(selected):'Chưa chọn'}</b> · Đáp án đúng: <b>${apLmsEsc(x.answer)}</b></p>${x.explanation?`<div class="lms-math">${apLmsMath(x.explanation)}</div>`:''}</article>`;
  }).join('')}</div></details>`;
}
async function apLmsSubmit(){
  if(AP_LMS_UI.busy||!AP_LMS_UI.quiz)return;
  const q=AP_LMS_UI.quiz,n=Object.keys(q.answers).length,total=q.questions.length;
  apLmsBusy(true);apLmsClearError();
  if(q.syncTimer){clearTimeout(q.syncTimer);q.syncTimer=null;}
  try{
    const action=q.isAuto?'apLmsAutoSubmit':'apLmsSubmit';
    const r=await apLmsApi(action,{session_token:AP_LMS_UI.session,attempt_token:q.attemptToken,answers:q.answers},'POST');
    try{localStorage.removeItem(apLmsDraftKey(q));
      if(q.isAuto)localStorage.removeItem(apLmsAutoActiveKey_(q.studentId,q.topicId));}catch(e){}
    apLmsScreen('ap-lms-result');
    const review=Array.isArray(r.review)?r.review:[];
    const motivation=apLmsMotivation_(r.score);
    const confetti=motivation.celebrate?`<div class="lms-confetti" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i};left:${3+(i*23)%93}%"></i>`).join('')}</div>`:'';
    apLmsEl('ap-lms-result-content').innerHTML=`<div class="lms-card lms-celebration" style="text-align:center">${confetti}<div class="lms-hero-icon" style="margin:0 auto 12px"><i class="bi ${motivation.icon}"></i></div><h2>${motivation.title}</h2><p>${motivation.note}</p><div class="lms-score-big">${Number(r.score)}/10</div><p>Đúng ${Number(r.correct_count??0)}/${Number(r.total_count||q.questions.length)} câu · ${r.passed?'Đã đạt yêu cầu':'Cố gắng thêm để đạt từ 6 điểm'}${r.duplicate?' · Kết quả đã lưu trước đó':''}</p><div class="lms-actions-inline" style="justify-content:center;margin-top:15px"><button class="lms-btn ghost" type="button" id="ap-lms-home"><i class="bi bi-grid"></i> Chọn bài khác</button><button class="lms-btn teal" type="button" id="ap-lms-repeat"><i class="bi bi-arrow-clockwise"></i> Làm lại bài này</button>${r.passed&&!q.isAuto&&q.level<3?'<button class="lms-btn" type="button" id="ap-lms-nextlevel">Làm cấp tiếp theo</button>':''}</div></div>
    ${apLmsReviewHtml_(q,review)}`;
    apLmsEl('ap-lms-home').addEventListener('click',apLmsLoadDashboard);
    if(apLmsEl('ap-lms-nextlevel'))apLmsEl('ap-lms-nextlevel').addEventListener('click',()=>apLmsStart(q.assignmentId,q.level+1));
    apLmsEl('ap-lms-repeat').addEventListener('click',()=>q.isAuto?apLmsStartAuto(q.topicId):apLmsStart(q.assignmentId,q.level));
  }catch(e){apLmsError('Chưa xác nhận nộp bài: '+e.message+' Hệ thống giữ bản nháp trên máy, em có thể thử lại.');apLmsSaveDraft();}
  finally{apLmsBusy(false);}
}
function apLmsParentSummaryHtml_(lms){
  if(!lms)return '';
  const assignments=Array.isArray(lms.assignments)?lms.assignments:[];
  const list=assignments.map(a=>`<div style="padding:10px 0;border-bottom:1px solid #e2e8f0"><b>${apLmsEsc(a.title)}</b><div class="mini-note">${a.exam_code?'Mã: '+apLmsEsc(a.exam_code)+' · ':''}${apLmsEsc(a.chapter||'')} · Cấp 1: ${a.scores[0]===null?'Chưa làm':apLmsEsc(a.scores[0])+'/10'} · Cấp 2: ${a.scores[1]===null?'Chưa làm':apLmsEsc(a.scores[1])+'/10'} · Cấp 3: ${a.scores[2]===null?'Chưa làm':apLmsEsc(a.scores[2])+'/10'}</div></div>`).join('');
  const self=lms.self_study,auto=Array.isArray(self?.recent)?self.recent:[];
  const autoRows=auto.map(x=>{
    const top=x.top1;
    const mins=top?.duration_seconds!=null?Math.floor(Number(top.duration_seconds)/60):0;
    const secs=top?.duration_seconds!=null?Number(top.duration_seconds)%60:0;
    const time=top?.duration_seconds!=null?` · ${mins}:${String(secs).padStart(2,'0')}`:'';
    const ranking=top?`<div class="lms-parent-top1"><i class="bi bi-trophy"></i><span>Top 1 cùng lớp: <b>${apLmsEsc(top.name)}</b> · <b>${Number(top.score)}/10 điểm</b>${time}</span></div>`:'';
    return `<div style="padding:10px 0;border-bottom:1px solid #e2e8f0"><b>${apLmsEsc(x.title)}</b><div class="mini-note">${apLmsEsc(x.chapter||'')} · Điểm cao nhất: ${Number(x.best_score)}/10 · Lần gần nhất: ${Number(x.last_score)}/10 · Số lượt: ${Number(x.attempts)}</div>${ranking}</div>`;
  }).join('');
  return `<div class="student-report-section"><div class="student-section-title"><i class="bi bi-mortarboard-fill"></i> Kết quả học tập LMS</div>
    <div class="student-mini-stats" style="margin-bottom:11px"><div class="student-mini-stat blue"><span>Chủ đề tự luyện</span><strong>${Number(self?.total_topics||0)}</strong></div><div class="student-mini-stat purple"><span>Đã đạt từ 6 điểm</span><strong>${Number(self?.passed_topics||0)}</strong></div><div class="student-mini-stat warn"><span>Bài GV giao</span><strong>${Number(lms.total||0)}</strong></div></div>
    <h4>Tự luyện theo chương/bài</h4>${autoRows||'<div class="mini-note">Học sinh chưa tự luyện trên LMS.</div>'}
    ${assignments.length?'<h4 style="margin-top:14px">Bài giáo viên đã giao trước đây</h4>'+list:''}</div>`;
}
// Teacher: module manager, import and duplicates ------------------------------------
const AP_LMS_ADMIN={catalog:[],importing:false,connectionPending:false,statusLoadSeq:0};
function apLmsAdminMsg(v){const el=apLmsEl('ap-lms-admin-status');if(el)el.textContent=String(v||'');}
function apLmsBankFeedback(message,kind='working'){
  const el=apLmsEl('ap-lms-bank-feedback');
  if(el){el.textContent=String(message||'');el.dataset.kind=kind;}
  apLmsAdminMsg(message);
  if(kind==='error')console.error('[AnPhuc LMS / bank]',String(message));
}

async function apLmsLoadAdmin(){
  const request=++AP_LMS_ADMIN.statusLoadSeq;
  if(!AP_LMS_ADMIN.connectionPending)apLmsAdminMsg('Đang kiểm tra kết nối ngân hàng...');
  try{
    const st=await apLmsApi('apLmsBankStatus',{},'GET',true);
    if(request!==AP_LMS_ADMIN.statusLoadSeq)return;
    AP_LMS_ADMIN.bankId=st.bank_id||'';
    AP_LMS_ADMIN.bankReady=!!st.configured;
    if(st.configured && st.bank_id){apLmsEl('ap-lms-bank-id').value=st.bank_id;}
    apLmsEl('ap-lms-bank-summary').textContent=st.configured?`Đã kết nối · ${Number(st.count||0).toLocaleString('vi-VN')} câu · ${Number(st.ready||0).toLocaleString('vi-VN')} câu READY · Ngân hàng: ...${apLmsEsc((st.bank_id||'').slice(-6))}`:'Chưa kết nối ngân hàng. Hãy tạo ngân hàng mới hoặc nhập ID Google Sheets riêng.';
    if(st.bank_url){apLmsEl('ap-lms-bank-link').href=st.bank_url;apLmsEl('ap-lms-bank-link').hidden=false;}else{apLmsEl('ap-lms-bank-link').hidden=true;}
    if(st.configured){
      // A working connection must remain visible even if the heavy catalog request fails.
      const tasks=await Promise.allSettled([apLmsLoadCatalog(),apLmsLoadAssignments(),apLmsAILoadStatus()]);
      if(request!==AP_LMS_ADMIN.statusLoadSeq)return;
      const rejected=tasks.filter(x=>x.status==='rejected').map(x=>x.reason&&x.reason.message||'Không rõ lỗi');
      if(rejected.length){apLmsBankFeedback('ĐÃ KẾT NỐI ngân hàng, nhưng có phần quản trị tải chưa xong: '+rejected.join('; '),'warning');return;}
    }
    if(!AP_LMS_ADMIN.connectionPending)apLmsAdminMsg('Sẵn sàng.');
  }catch(e){
    if(request!==AP_LMS_ADMIN.statusLoadSeq)return;
    apLmsBankFeedback('BANK_STATUS_ERROR: '+e.message,'error');
  }
}
async function apLmsNewBank(){if(!confirm('Tạo Google Spreadsheet ngân hàng riêng, không thay đổi bảng tính trung tâm?'))return;
  try{apLmsAdminMsg('Đang tạo ngân hàng...');const r=await apLmsApi('apLmsNewBank',{},'POST',true);apLmsAdminMsg('Đã tạo ngân hàng: '+r.url);await apLmsLoadAdmin();}
  catch(e){apLmsAdminMsg(e.message);}}
async function apLmsConnectBank(){
  if(AP_LMS_ADMIN.connectionPending)return;
  const raw=(apLmsEl('ap-lms-bank-id').value||'').trim();
  const match=raw.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})(?:[/?#]|$)/i);
  const id=match?match[1]:(/^[\w-]{20,}$/.test(raw)?raw:'');
  if(!id){apLmsBankFeedback('BANK_ID_INVALID: Dán URL Google Sheets hoặc ID bảng tính hợp lệ.','error');return;}
  if(typeof getAdminToken!=='function'||!getAdminToken()){
    apLmsBankFeedback('UNAUTHORIZED: Phiên Giáo viên không còn hợp lệ. Hãy đăng xuất, đăng nhập lại rồi thử kết nối.','error');return;
  }
  const switching=AP_LMS_ADMIN.bankId&&AP_LMS_ADMIN.bankId!==id;
  if(switching&&!confirm('Bạn đang chuyển sang ngân hàng khác. Hãy chắc chắn đã sao lưu dữ liệu. Tiếp tục?'))return;
  // Stop an earlier status GET from replacing the currently typed bank ID.
  AP_LMS_ADMIN.statusLoadSeq++;
  AP_LMS_ADMIN.connectionPending=true;
  const button=apLmsEl('ap-lms-bank-connect-btn');
  const originalLabel=button?button.textContent:'';
  if(button){button.disabled=true;button.textContent='Đang kết nối...';}
  try{
    // Bank connection requires the teacher token. It does NOT depend on
    // unrelated public/student diagnostics (which may be stale/blocked).
    apLmsBankFeedback('Đang gửi yêu cầu kết nối ngân hàng bằng phiên Giáo viên...','working');
    const result=await apLmsApi('apLmsConnectBank',{bank_spreadsheet_id:id,confirm_switch:!!switching},'POST',true);
    apLmsBankFeedback('Backend đã nhận yêu cầu. Đang xác minh ID được lưu trên máy chủ...','working');
    const verified=await apLmsApi('apLmsBankStatus',{},'GET',true);
    if(!verified||!verified.configured||verified.bank_id!==id)throw new Error('BANK_VERIFY_FAILED: Máy chủ chưa xác nhận ID đã lưu. Không nhập lại dữ liệu trước khi kiểm tra trạng thái.');
    AP_LMS_ADMIN.bankId=id;AP_LMS_ADMIN.bankReady=true;
    apLmsEl('ap-lms-bank-summary').textContent=`Đã kết nối · ${Number(verified.count||0).toLocaleString('vi-VN')} câu · ${Number(verified.ready||0).toLocaleString('vi-VN')} câu READY · Ngân hàng: ...${id.slice(-6)}`;
    const link=apLmsEl('ap-lms-bank-link');
    if(link){link.href=verified.bank_url||result.bank_url||('https://docs.google.com/spreadsheets/d/'+id+'/edit');link.hidden=false;}
    apLmsBankFeedback(`KẾT NỐI THÀNH CÔNG · ${Number(verified.count||0).toLocaleString('vi-VN')} câu hỏi · ${Number(verified.ready||0).toLocaleString('vi-VN')} câu READY. Đã lưu ID trên Apps Script.`, 'success');
    // Load heavy catalog separately: failure must not turn a successful connect into failure.
    const tasks=await Promise.allSettled([apLmsLoadCatalog(),apLmsLoadAssignments(),apLmsAILoadStatus()]);
    const rejected=tasks.filter(t=>t.status==='rejected').map(t=>t.reason&&t.reason.message||'Không rõ lỗi');
    if(rejected.length)apLmsBankFeedback('Đã kết nối thành công nhưng chưa tải đủ dữ liệu quản trị: '+rejected.join('; '),'warning');
  }catch(error){
    let message=String(error.message||error);
    if(/ACTION_NOT_FOUND:\s*apLmsConnectBank|LMS_ENDPOINT_NOT_DEPLOYED.*apLmsConnectBank/.test(message))
      message='LMS_ROUTER_OUTDATED: Deployment /exec chưa định tuyến apLmsConnectBank. Hãy cập nhật Code.gs V1.5.3 và triển khai New Version trên đúng Web App.';
    if(/BANK_ACCESS_DENIED/.test(message))message+=' Hãy mở bảng tính bằng tài khoản được dùng để triển khai Apps Script, bảo đảm tài khoản đó có quyền chỉnh sửa.';
    else if(/UNAUTHORIZED/.test(message))message+=' Phiên GV có thể hết hạn. Đăng nhập lại trước khi thử.';
    else if(/BANK_SAME_AS_CENTER/.test(message))message+=' Không dùng file quản lý học sinh làm ngân hàng.';
    else if(/timeout|chậm|abort/i.test(message))message+=' Nếu Apps Script đã hoàn tất nhưng trình duyệt hết thời gian chờ, hãy mở lại mục LMS để kiểm tra trạng thái trước khi thử lại.';
    apLmsBankFeedback('BANK_CONNECT_ERROR: '+message,'error');
  }finally{
    AP_LMS_ADMIN.connectionPending=false;
    if(button){button.disabled=false;button.textContent=originalLabel;}
  }
}
async function apLmsLoadCatalog(){
  const d=await apLmsApi('apLmsCatalog',{},'GET',true);AP_LMS_ADMIN.catalog=d.catalog||[];
  const grade=apLmsEl('ap-lms-assignment-grade'),chapter=apLmsEl('ap-lms-assignment-chapter');
  const current=grade.value;const grades=[...new Set(AP_LMS_ADMIN.catalog.map(x=>String(x.grade)))].sort((a,b)=>Number(a)-Number(b));
  grade.innerHTML='<option value="">Chọn khối</option>'+grades.map(g=>`<option value="${apLmsEsc(g)}">Khối ${apLmsEsc(g)}</option>`).join('');
  if(grades.includes(current))grade.value=current;
  apLmsSetChapter();const eligible=AP_LMS_ADMIN.catalog.filter(x=>x.counts.every(n=>n>=10)).length;
  apLmsEl('ap-lms-catalog-info').textContent=`${AP_LMS_ADMIN.catalog.length} nhóm khối–chương có câu READY; ${eligible} nhóm đã đủ 10 câu/cấp. Nhóm còn thiếu có thể bổ sung qua AI rồi duyệt.`;
}
function apLmsSetChapter(){const g=apLmsEl('ap-lms-assignment-grade').value,select=apLmsEl('ap-lms-assignment-chapter'),old=select.value;const rows=AP_LMS_ADMIN.catalog.filter(x=>String(x.grade)===g);
  select.innerHTML='<option value="">Chọn chương</option><option value="THEO_ID">Tạo theo ID (nhiều chương)</option>'+rows.map(x=>`<option value="${apLmsEsc(x.chapter)}">${apLmsEsc(x.chapter)} (${x.counts.join('/')})</option>`).join('');if(rows.some(x=>x.chapter===old))select.value=old;
}
async function apLmsLoadAssignments(){
  const rows=await apLmsApi('apLmsAdminAssignments',{},'GET',true);
  const selector=apLmsEl('ap-lms-results-assignment');selector.innerHTML='<option value="">Chọn bài cần xem điểm</option>'+rows.map(a=>`<option value="${apLmsEsc(a.assignment_id)}">${apLmsEsc(a.exam_code||a.assignment_id)} · ${apLmsEsc(a.title)} · K${apLmsEsc(a.grade)}</option>`).join('');
  apLmsEl('ap-lms-admin-assignments').innerHTML=rows.length?`<div class="lms-admin-tablewrap"><table><thead><tr><th>Bài tập</th><th>Khối</th><th>Lớp</th><th>Hạn nộp</th><th>Mã đề tự tạo</th><th>ID nội bộ</th></tr></thead><tbody>${rows.slice(0,30).map(x=>`<tr><td>${apLmsEsc(x.title)}</td><td>${apLmsEsc(x.grade)}</td><td>${apLmsEsc(x.class_id||'Toàn khối')}</td><td>${apLmsEsc(apLmsDate(x.due_at))}</td><td><strong>${apLmsEsc(x.exam_code||'Mã cũ')}</strong></td><td><code>${apLmsEsc(x.assignment_id)}</code></td></tr>`).join('')}</tbody></table></div>`:'<p>Chưa giao bài LMS nào.</p>';
}
function apLmsNormalizeImportRow(r,source,row){
  const value=(...names)=>{for(const name of names){if(Object.prototype.hasOwnProperty.call(r,name)&&r[name]!=null)return String(r[name]).trim();}return '';};
  const type=value('Type','type','QuestionType').toUpperCase();if(type&&type!=='MC'&&type!=='MULTIPLE_CHOICE')return null;
  const originalLevel=value('OriginalLevel','Level','Difficulty'),grade=value('Grade','Khối');
  const normalizedLevel=Number(value('LMS_Level'))||(/thông hiểu/i.test(originalLevel)?2:/vận dụng/i.test(originalLevel)?3:1);
  const answer=value('CorrectAnswer','Correct answer','Correct Answer','Đáp án').toUpperCase();
  return {QuestionUID:value('QuestionUID'),SourceSheet:value('SourceSheet')||source,SourceRow:value('SourceRow')||row,OriginalID:value('OriginalID','ID','ID question'),Grade:grade,Subject:value('Subject')||'Toán',Chapter:value('Chapter','Chương'),Topic:value('Topic','Bài'),OriginalLevel:originalLevel,LMS_Level:normalizedLevel,Question:value('Question','Câu hỏi'),A:value('A','Option 1','Option1'),B:value('B','Option 2','Option2'),C:value('C','Option 3','Option3'),D:value('D','Option 4','Option4'),CorrectAnswer:answer,Explanation:value('Explanation','Explain'),Status:value('Status')||'READY',Notes:value('Notes'),Type:'MC'};
}
async function apLmsCommitImport(importId){
  const bar=apLmsEl('ap-lms-import-bar');let done=false,loops=0,last=0;
  localStorage.setItem('ap_lms_import_pending_v14',importId);
  while(!done){
    if(++loops>260)throw new Error('IMPORT_LOOP_LIMIT: Import did not complete. Use Resume Import.');
    const r=await apLmsApi('apLmsImportFinalize',{import_id:importId,limit:100},'POST',true);
    if(r.processed<=last && loops>1 && !r.done)throw new Error('IMPORT_NO_PROGRESS: Import cursor did not advance.');
    last=r.processed;done=!!r.done;
    bar.style.width=(55+Math.round(45*r.processed/Math.max(1,r.total)))+'%';
    apLmsAdminMsg('Dang ghi ngan hang: '+r.processed+'/'+r.total+' cau. Them moi '+r.added+', trung '+r.duplicate+', can xem '+r.review+'.');
    if(done){
      localStorage.removeItem('ap_lms_import_pending_v14');
      apLmsAdminMsg('IMPORT_DONE: '+r.total+' cau da xu ly; them '+r.added+', trung '+r.duplicate+', can duyet '+r.review+'. Tong '+r.bank_total+' cau.');
    }
  }
  await apLmsLoadCatalog();
}
async function apLmsResumeImport(){
  const id=localStorage.getItem('ap_lms_import_pending_v14');
  if(!id){apLmsAdminMsg('Không có đợt nhập nào đang chờ tiếp tục.');return;}
  if(AP_LMS_ADMIN.importing)return;
  AP_LMS_ADMIN.importing=true;
  try{await apLmsCommitImport(id);}catch(e){apLmsAdminMsg('IMPORT_RESUME_ERROR: '+e.message);}
  finally{AP_LMS_ADMIN.importing=false;}
}
async function apLmsImportExcel(event){
  const f=event&&event.target&&event.target.files&&event.target.files[0];
  if(!f||AP_LMS_ADMIN.importing)return;
  if(!window.XLSX){apLmsAdminMsg('XLSX_LIBRARY_MISSING: Thu vien doc Excel chua duoc tai.');return;}
  AP_LMS_ADMIN.importing=true;
  const bar=apLmsEl('ap-lms-import-bar');bar.style.width='0%';
  try{
    if(!AP_LMS_ADMIN.bankReady)throw new Error('BANK_NOT_CONNECTED: Ket noi Google Sheets ngan hang truoc khi nap.');
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});
    const names=wb.SheetNames.includes('LMS_Questions')?['LMS_Questions']:wb.SheetNames.filter(x=>['ToanTHCS','ToanTHPT','QuestionBank'].includes(x));
    if(!names.length)throw new Error('SHEET_MISSING: Excel must include LMS_Questions or original question sheets.');
    const rows=[];let invalid=0,skipped=0;
    for(const name of names){
      const list=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:'',raw:false});
      const header=(XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,range:0})[0]||[]).map(x=>String(x).trim());
      if(!['Question','CauHoi','Câu hỏi'].some(k=>header.includes(k))) {
        if(!header.includes('Question'))throw new Error('SHEET_COLUMN_MISSING: '+name+' missing Question column.');
      }
      list.forEach((raw,i)=>{
        const type=String(raw.Type||raw.type||raw.QuestionType||'MC').trim().toUpperCase();
        if(type && type!=='MC' && type!=='MULTIPLE_CHOICE'){skipped++;return;}
        const normalized=apLmsNormalizeImportRow(raw,name,i+2);
        if(!normalized||!normalized.Question||!normalized.Grade||!normalized.Chapter){invalid++;return;}
        rows.push(normalized);
      });
    }
    if(!rows.length)throw new Error('IMPORT_EMPTY: No usable MC rows found.');
    if(rows.length>20000)throw new Error('IMPORT_LIMIT: Maximum 20000 questions per import.');
    const importId='IMP'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
    const batches=[];let chunk=[],size=0;
    for(const row of rows){
      const n=JSON.stringify(row).length;
      if(n>48000){invalid++;continue;}
      if(chunk.length>=145 || size+n>160000){if(chunk.length)batches.push(chunk);chunk=[];size=0;}
      chunk.push(row);size+=n;
    }
    if(chunk.length)batches.push(chunk);
    if(!batches.length)throw new Error('IMPORT_EMPTY: No rows fit the size limit.');
    apLmsAdminMsg('Tim thay '+rows.length+' cau MC; '+invalid+' dong can xem, '+skipped+' dong khac MC. Dang gui '+batches.length+' goi...');
    for(let i=0;i<batches.length;i++){
      await apLmsApi('apLmsImportStageBatch',{import_id:importId,batch_id:'B'+String(i+1).padStart(5,'0'),rows:batches[i]},'POST',true);
      bar.style.width=Math.round(55*(i+1)/batches.length)+'%';
      apLmsAdminMsg('Da tai '+(i+1)+'/'+batches.length+' goi. Sau do se chuan hoa theo tung dot.');
    }
    // Save only when all staging requests succeeded. Partial uploads may be safely restarted with the same Excel.
    localStorage.setItem('ap_lms_import_pending_v14',importId);
    await apLmsCommitImport(importId);
  }catch(e){
    console.error('[AP LMS IMPORT]',e.message);
    apLmsAdminMsg('IMPORT_ERROR: '+e.message+'. Neu da gui het cac goi, bam Tiep tuc nap de khoi phuc.');
  }finally{AP_LMS_ADMIN.importing=false;if(event&&event.target)event.target.value='';}
}
async function apLmsDeduplicate(){if(!confirm('Quét ngân hàng: đánh dấu DUPLICATE và REVIEW, không xóa câu hỏi. Tiếp tục?'))return;
  try{apLmsAdminMsg('Đang lọc câu trùng, vui lòng không đóng cửa sổ...');const r=await apLmsApi('apLmsDeduplicate',{},'POST',true);apLmsAdminMsg(`Đã kiểm tra ${r.scanned} câu. Trùng ${r.duplicates}; xung đột cần duyệt ${r.conflicts}. Không có câu nào bị xóa.`);await apLmsLoadCatalog();}catch(e){apLmsAdminMsg(e.message);}}
async function apLmsFindQuestions(){
  const grade=apLmsEl('ap-lms-assignment-grade').value,level=apLmsEl('ap-lms-question-level').value,term=apLmsEl('ap-lms-question-term').value;
  if(!grade){apLmsAdminMsg('Chọn khối trước khi tìm câu hỏi.');return;}
  try{const rows=await apLmsApi('apLmsQuestionLookup',{grade,level,term},'GET',true);apLmsEl('ap-lms-lookup-result').innerHTML=rows.length?rows.map(row=>`<div class="lms-idrow"><div><strong>${apLmsEsc(row.uid)} · Cấp ${row.level}</strong><br><span>${apLmsEsc(row.chapter)} – ${apLmsEsc(row.question)}</span></div><button type="button" class="lms-admin-btn alt" data-uid="${apLmsEsc(row.uid)}" data-level="${row.level}">Chọn ID</button></div>`).join(''):'<p>Không có câu READY phù hợp.</p>';
    apLmsEl('ap-lms-lookup-result').querySelectorAll('[data-uid]').forEach(btn=>btn.addEventListener('click',()=>{const ta=apLmsEl('ap-lms-ids-'+btn.dataset.level),ids=ta.value.trim().split(/[\s,;]+/).filter(Boolean);if(!ids.includes(btn.dataset.uid)){ta.value=[...ids,btn.dataset.uid].join('\n');}ta.focus();}));
  }catch(e){apLmsAdminMsg(e.message);}
}
async function apLmsCreateAssignment(){
  const grade=apLmsEl('ap-lms-assignment-grade').value,rawChapter=apLmsEl('ap-lms-assignment-chapter').value,chapter=rawChapter==='THEO_ID'?'Bài tập theo ID':rawChapter;
  const p={grade,chapter,title:apLmsEl('ap-lms-assignment-title').value,class_id:apLmsEl('ap-lms-assignment-class').value,due_at:apLmsEl('ap-lms-assignment-due').value,
    chapter_number:apLmsEl('ap-lms-assignment-chapter-number')?.value||'',...Object.fromEntries([1,2,3].map(i=>['level'+i+'_ids',apLmsEl('ap-lms-ids-'+i).value]))};
  if(!grade||!chapter){apLmsAdminMsg('Chọn khối và chương (hoặc Tạo theo ID).');return;}
  if(!confirm('Giao bài 3 cấp, mỗi cấp 10 câu, đạt 6 điểm để mở cấp tiếp theo?'))return;
  const serialized=JSON.stringify(p);
  const previous=AP_LMS_ADMIN.createRequest;
  if(!previous||previous.serialized!==serialized){
    const id='REQ-'+(window.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
    AP_LMS_ADMIN.createRequest={serialized,id};
  }
  p.request_id=AP_LMS_ADMIN.createRequest.id;
  const btn=apLmsEl('ap-lms-create-btn');if(btn)btn.disabled=true;
  try{apLmsAdminMsg('Đang tạo gói đề và mã ExamCode, vui lòng không bấm lặp...');
    const d=await apLmsApi('apLmsCreateAssignment',p,'POST',true);
    AP_LMS_ADMIN.createRequest=null;
    apLmsAdminMsg('Đã giao bài '+d.title+' · Mã đề '+d.exam_code+' · ID '+d.assignment_id+(d.duplicate?' (yêu cầu được nhận diện là trùng, không tạo bài mới)':'')+'.');
    await apLmsLoadAssignments();
  }catch(e){apLmsAdminMsg(e.message+' · Nếu mạng bị ngắt, bấm lại sẽ giữ nguyên mã yêu cầu, tránh tạo trùng.');}
  finally{if(btn)btn.disabled=false;}
}
async function apLmsLoadResults(){const id=apLmsEl('ap-lms-results-assignment').value;if(!id)return;
  try{const r=await apLmsApi('apLmsAdminResults',{assignment_id:id},'GET',true);
    apLmsEl('ap-lms-admin-results').innerHTML=`<div class="lms-admin-tablewrap"><table><thead><tr><th>Học sinh</th><th>Lớp</th><th>Cấp 1</th><th>Cấp 2</th><th>Cấp 3</th><th>Tiến độ</th></tr></thead><tbody>${r.students.map(s=>`<tr><td>${apLmsEsc(s.name)}</td><td>${apLmsEsc(s.class_id)}</td>${s.scores.map(v=>`<td>${v===null?'--':v+'/10'}</td>`).join('')}<td>${s.passed_all?'Hoàn thành':'Chưa hoàn thành'}</td></tr>`).join('')}</tbody></table></div>`;
  }catch(e){apLmsAdminMsg(e.message);}
}

// ================== LMS V1.5 | teacher AI question studio ==================
const AP_LMS_AI_STATE={drafts:[],busy:false};
function apLmsAINotice(value){
  const e=apLmsEl('ap-lms-ai-notice');if(e)e.textContent=String(value||'');
}
async function apLmsAILoadStatus(){
  const e=apLmsEl('ap-lms-ai-status');if(!e)return;
  try{
    const cap=await apLmsApi('apLmsAIStatus',{},'GET',true);
    e.textContent=(cap.key_configured?'Đã cấu hình Gemini':'Chưa có API key Gemini')+' · Model: '+cap.model+' · '+cap.help;
    if(cap.bank_connected)await apLmsAIListDrafts();
  }catch(error){e.textContent='AI_MODULE_NOT_READY: '+error.message+'. Hãy cập nhật Module_LMSAI.gs và Deploy New Version trước khi sử dụng.';}
}
function apLmsAIInput(){
  const get=id=>String(apLmsEl('ap-lms-ai-'+id)?.value||'').trim();
  return {grade:get('grade'),chapter:get('chapter'),topic:get('topic'),book:get('book'),
    level:Number(get('level')),count:Number(get('count')),objectives:get('objectives'),source_reference:get('source')};
}
function apLmsAIDisplayDrafts(){
  const target=apLmsEl('ap-lms-ai-drafts');if(!target)return;
  const drafts=AP_LMS_AI_STATE.drafts;
  if(!drafts.length){target.innerHTML='<p class="lms-note">Chưa có câu nháp. Hãy chọn khối, chủ đề và tạo nội dung AI trước.</p>';return;}
  const editable=['Grade','Chapter','Topic','LMS_Level','Question','A','B','C','D','CorrectAnswer','Explanation','SourceReference'];
  const fields=(d)=>editable.map(k=>{
    const value=String(d[k]??'');
    if(k==='CorrectAnswer')return `<label>Đáp án đúng<select data-field="${k}">${['A','B','C','D'].map(a=>`<option value="${a}" ${value===a?'selected':''}>${a}</option>`).join('')}</select></label>`;
    if(k==='Grade')return `<label>Khối<select data-field="${k}">${['6','7','8','9'].map(a=>`<option value="${a}" ${value===a?'selected':''}>${a}</option>`).join('')}</select></label>`;
    if(k==='LMS_Level')return `<label>Cấp<select data-field="${k}">${[1,2,3].map(a=>`<option value="${a}" ${Number(value)===a?'selected':''}>${a}</option>`).join('')}</select></label>`;
    const big=['Question','Explanation','SourceReference'].includes(k);
    return `<label class="${big?'full':''}">${apLmsEsc(({Chapter:'Chương',Topic:'Bài học',Question:'Câu hỏi',Explanation:'Lời giải',SourceReference:'Nguồn tài liệu'}[k]||'Phương án '+k))}<textarea data-field="${k}" rows="${big?3:2}">${apLmsEsc(value)}</textarea></label>`;
  }).join('');
  target.innerHTML=drafts.map((d,i)=>{
    const status=String(d.Status||'DRAFT_AI'),locked=['APPROVED','REJECTED','SUPERSEDED'].includes(status);
    const action=locked?'':`<div class="lms-ai-draft-actions">
      <button class="lms-admin-btn alt" type="button" data-ai-action="save">Lưu chỉnh sửa</button>
      <button class="lms-admin-btn green" type="button" data-ai-action="approve">Duyệt → READY</button>
      <button class="lms-admin-btn alt" type="button" data-ai-action="regenerate">AI tạo lại câu này</button>
      <button class="lms-admin-btn alt" type="button" data-ai-action="reject">Loại câu</button>
    </div>`;
    const opts=['A','B','C','D'].map(k=>`<div><b>${k}.</b> ${apLmsMath(d[k])}</div>`).join('');
    return `<article class="lms-ai-draft" data-draft-id="${apLmsEsc(d.DraftID)}">
      <div class="lms-ai-draft-head"><strong>Câu ${i+1} · ${apLmsEsc(d.QuestionUID)} · Cấp ${apLmsEsc(d.LMS_Level)}</strong>
        <span class="lms-ai-tag ${status==='REVIEW'?'review':status==='APPROVED'?'approved':''}">${apLmsEsc(status)}</span></div>
      <div class="lms-ai-preview"><div><b>${apLmsMath(d.Question)}</b></div>${opts}
        <div style="margin-top:8px;color:#047857"><b>Đáp án ${apLmsEsc(d.CorrectAnswer)}</b> · ${apLmsMath(d.Explanation)}</div></div>
      ${d.ReviewNotes?`<p class="lms-note">${apLmsEsc(d.ReviewNotes)}</p>`:''}
      ${locked?'<p class="lms-ai-help">Đã khóa bản nháp để lưu lịch sử duyệt. Muốn thay đổi câu đã READY cần phiên bản mới và quy trình duyệt riêng.</p>':`<details><summary>Chỉnh sửa câu hỏi và đáp án trước khi duyệt</summary><div class="lms-ai-edit-grid">${fields(d)}</div></details>${action}`}
    </article>`;
  }).join('');
}
async function apLmsAIListDrafts(){
  try{
    const grade=apLmsEl('ap-lms-ai-grade')?.value||'';
    const data=await apLmsApi('apLmsAIListDrafts',{grade},'GET',true);
    AP_LMS_AI_STATE.drafts=Array.isArray(data)?data:[];
    apLmsAIDisplayDrafts();
  }catch(e){apLmsAINotice('AI_DRAFT_LOAD_ERROR: '+e.message);}
}
async function apLmsAIGenerate(){
  if(AP_LMS_AI_STATE.busy)return;
  const args=apLmsAIInput();
  if(!args.chapter||!args.topic){apLmsAINotice('Hãy nhập chương và tên bài/chủ đề trước.');return;}
  const btn=apLmsEl('ap-lms-ai-generate-btn');AP_LMS_AI_STATE.busy=true;if(btn)btn.disabled=true;
  apLmsAINotice('Đang yêu cầu Gemini tạo '+args.count+' câu hỏi có đáp án và lời giải. Không gửi dữ liệu học sinh cho AI...');
  try{
    const r=await apLmsApi('apLmsAIGenerate',args,'POST',true);
    apLmsAINotice('AI đã tạo '+r.created+' bản nháp · '+r.review+' câu nghi trùng cần rà soát. Giáo viên kiểm tra kỹ trước khi duyệt.');
    await apLmsAIListDrafts();
  }catch(e){apLmsAINotice('AI_CREATE_ERROR: '+e.message);}
  finally{AP_LMS_AI_STATE.busy=false;if(btn)btn.disabled=false;}
}
function apLmsAICollectDraftFields(card){
  const result={};card.querySelectorAll('[data-field]').forEach(x=>result[x.dataset.field]=x.value);
  return result;
}
async function apLmsAIHandleDraftAction(e){
  const btn=e.target.closest('[data-ai-action]');if(!btn||AP_LMS_AI_STATE.busy)return;
  const card=btn.closest('[data-draft-id]');if(!card)return;
  const draftId=card.dataset.draftId,action=btn.dataset.aiAction;
  if(action==='approve'&&!confirm('Tôi đã kiểm tra độc lập đáp án, lời giải và độ phù hợp chương trình của câu này. Công bố READY?'))return;
  if(action==='reject'&&!confirm('Loại câu nháp nhưng vẫn giữ lịch sử?'))return;
  if(action==='regenerate'&&!confirm('Sinh câu thay thế bằng Gemini? Bản nháp cũ sẽ được lưu lịch sử.'))return;
  const endpoints={save:'apLmsAISaveDraft',approve:'apLmsAIApproveDraft',reject:'apLmsAIRejectDraft',regenerate:'apLmsAIRegenerateDraft'};
  if(!endpoints[action])return;
  AP_LMS_AI_STATE.busy=true;btn.disabled=true;
  const params={draft_id:draftId};
  if(action==='save')Object.assign(params,apLmsAICollectDraftFields(card));
  if(action==='approve')params.confirm_review=true;
  if(action==='regenerate')Object.assign(params,{book:apLmsAIInput().book,objectives:apLmsAIInput().objectives});
  apLmsAINotice('Đang thực hiện: '+action+'...');
  try{
    const r=await apLmsApi(endpoints[action],params,'POST',true);
    apLmsAINotice('Hoàn tất '+action+' · '+(r.question_uid||r.draft_id||r.created||'')+'.');
    await apLmsAIListDrafts();
    if(action==='approve'){
      await apLmsLoadCatalog();
      const info=AP_LMS_AI_STATE.drafts.find(x=>x.DraftID===draftId);
      if(info){const gr=apLmsEl('ap-lms-assignment-grade');gr.value=String(info.Grade);
        apLmsSetChapter();apLmsEl('ap-lms-assignment-chapter').value=String(info.Chapter);}
    }
  }catch(error){apLmsAINotice('AI_'+action.toUpperCase()+'_ERROR: '+error.message);}
  finally{AP_LMS_AI_STATE.busy=false;btn.disabled=false;}
}
// Event delegation avoids new globals per draft and keeps inline legacy handlers intact.
document.addEventListener('click',function(event){
  if(event.target.closest('#ap-lms-ai-drafts [data-ai-action]'))apLmsAIHandleDraftAction(event);
});

async function apLmsRunDiagnostics(){
  try{
    const d=await apLmsApi('apLmsPublicDiagnostics',{},'GET',false);
    const missing=Object.entries(d.capabilities||{}).filter(([,ok])=>!ok).map(([name])=>name);
    const note='API_URL /exec: '+(d.backend||'không rõ phiên bản')+' | LMS công khai: '+(d.public_lms?'Có':'Không')+' | AI: '+(d.ai_module?'Đã cài':'Chưa cài')+' | Thiếu: '+(missing.join(', ')||'Không');
    apLmsAdminMsg(note);
    const el=apLmsEl('ap-lms-diagnostics-result');if(el)el.textContent=note;
  }catch(e){
    const note='LMS_PUBLIC_DIAGNOSTICS_ERROR: '+e.message+' · Đây là lỗi kiểm tra API công khai, KHÔNG phải xác nhận rằng ngân hàng bị hỏng. Hãy kiểm tra đúng /exec và Deploy New Version.';
    apLmsAdminMsg(note);const el=apLmsEl('ap-lms-diagnostics-result');if(el)el.textContent=note;
  }
}
