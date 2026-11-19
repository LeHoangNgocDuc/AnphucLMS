/* AN PHUC LMS V1.2 - independent frontend, legacy functions/IDs unchanged */
'use strict';
const AP_LMS_UI={student:null,session:'',candidate:null,quiz:null,busy:false,bankReady:false,queryTimer:null,lookupSeq:0};
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
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),(action==='apLmsImportStageBatch'||action==='apLmsImportFinalize')?100000:32000);
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
      if(!admin && /UNAUTHORIZED:.*Gi[a-z\u00e1]o vi[e\u00ean]n/i.test(raw))
        throw new Error('LMS_BACKEND_OUTDATED: API học sinh đang bị backend yêu cầu quyền giáo viên. Cần cập nhật Code.gs và triển khai New Version của Apps Script (giữ URL /exec).');
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
function apLmsLogout(){AP_LMS_UI.session='';AP_LMS_UI.student=null;AP_LMS_UI.quiz=null;sessionStorage.removeItem('ap_lms_student_token');apLmsClearError();apLmsScreen('ap-lms-login');apLmsEl('ap-lms-name').value='';apLmsEl('ap-lms-phone').value='';apLmsEl('ap-lms-candidates').innerHTML='';AP_LMS_UI.candidate=null;}
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
    await apLmsCheckBackend();
    const result=await apLmsApi('apLmsPhoneLogin',{student_id:candidate.student_id,parent_phone:phone},'POST');
    AP_LMS_UI.session=result.session_token;AP_LMS_UI.student=result.student;sessionStorage.setItem('ap_lms_student_token',result.session_token);await apLmsLoadDashboard();
  }catch(e){apLmsError(e.message);}finally{apLmsBusy(false);}
}
let AP_LMS_BACKEND_CHECKED_AT=0;
async function apLmsCheckBackend(){
  if(Date.now()-AP_LMS_BACKEND_CHECKED_AT<180000)return true;
  let cap;
  try{cap=await apLmsApi('apLmsPublicDiagnostics',{},'GET',false);}
  catch(e){
    throw new Error('LMS_BACKEND_MISMATCH: Web và Apps Script chưa đồng bộ V1.4. Giáo viên cần cập nhật Code.gs, Module_LMS.gs, Module_LMSBank.gs và Deploy New Version trên deployment hiện tại. Chi tiết: '+e.message);
  }
  if(!cap||cap.backend!=='ANPHUC_LMS_V1_4'||cap.public_lms!==true)
    throw new Error('LMS_BACKEND_MISMATCH: Apps Script đang chạy thiếu API cổng học sinh V1.4 hoặc thiếu Module_LMS.gs. Hãy cập nhật deployment.');
  AP_LMS_BACKEND_CHECKED_AT=Date.now();
  return true;
}
function apLmsDate(value){if(!value)return '';const d=new Date(value);return Number.isFinite(d.valueOf())?d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(value);}
async function apLmsLoadDashboard(){
  apLmsClearError();apLmsScreen('ap-lms-dashboard');apLmsEl('ap-lms-dashboard-content').innerHTML='<div class="lms-spinner">Đang tải bài tập đúng khối/lớp của em...</div>';
  try{
    const d=await apLmsApi('apLmsDashboard',{session_token:AP_LMS_UI.session});AP_LMS_UI.student=d.student;
    apLmsEl('ap-lms-dashboard-content').innerHTML=`<div class="lms-title-row"><div><h2>Xin chào, ${apLmsEsc(d.student.name)}!</h2><p>Khối ${apLmsEsc(d.student.grade)} · Lớp ${apLmsEsc(d.student.class_id)} · Chọn bài là bắt đầu làm ngay.</p></div><span class="lms-pill"><i class="bi bi-book"></i> Bài tập của em</span></div>
    <div class="lms-metrics"><div class="lms-metric"><strong>${d.assignments.length}</strong><span>Tổng bài tập</span></div><div class="lms-metric"><strong>${d.completed}</strong><span>Đã hoàn thành</span></div><div class="lms-metric"><strong>${d.pending}</strong><span>Chưa hoàn thành</span></div></div>
    <div class="lms-grid">${d.assignments.length?d.assignments.map(a=>{
      const scores=a.levels.scores||[],unlocked=a.levels.unlocked||[];let next=[0,1,2].find(i=>unlocked[i]&&(scores[i]===null||scores[i]<6));
      const completed=scores[2]!==null&&scores[2]>=6;if(next===undefined)next=completed?2:0;
      const clickable=!a.expired;
      return `<article class="lms-assignment"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="lms-pill ${a.expired?'warn':''}">Khối ${apLmsEsc(d.student.grade)} ${a.expired?' · Quá hạn':''}</span><small style="color:#63778d">3 cấp độ</small></div><h3>${apLmsEsc(a.title)}</h3><p>${apLmsEsc(a.chapter||'Luyện tập Toán')}</p><div class="lms-levels">${scores.map((v,i)=>`<span class="${v!==null&&v>=6?'passed':i===next?'next':''}">Cấp ${i+1}<br><b>${v===null?'--':v+'/10'}</b></span>`).join('')}</div><small style="color:#64748b">${a.due_at?'Hạn: '+apLmsEsc(apLmsDate(a.due_at)):'Không giới hạn hạn nộp'}</small><button class="lms-btn ${completed?'ghost':'teal'} lms-submit-lock" type="button" data-assignment="${apLmsEsc(a.assignment_id)}" data-level="${next+1}" ${clickable?'':'disabled'}>${completed?'Luyện lại cấp 3':a.expired?'Đã quá hạn':'Làm bài cấp '+(next+1)} <i class="bi bi-arrow-right"></i></button></article>`;
    }).join(''):'<div class="lms-empty"><i class="bi bi-journal-check" style="font-size:38px;color:#087b72"></i><h3>Hiện chưa có bài tập được giao</h3><p>Khi giáo viên giao bài theo khối hoặc lớp, bài sẽ xuất hiện tại đây.</p></div>'}</div>`;
    apLmsEl('ap-lms-dashboard-content').querySelectorAll('[data-assignment]').forEach(btn=>btn.addEventListener('click',()=>apLmsStart(btn.dataset.assignment,Number(btn.dataset.level))));
  }catch(e){
    if(/LMS_UNAUTHORIZED/.test(e.message||'')){apLmsLogout();apLmsError('Phiên học sinh đã hết hạn. Vui lòng đăng nhập lại.');}
    else apLmsEl('ap-lms-dashboard-content').innerHTML='<div class="lms-empty">'+apLmsEsc(e.message)+'</div>';
  }
}
function apLmsDraftKey(q){return 'ap_lms_draft_v2_'+q.studentId+'_'+q.assignmentId+'_'+q.level;}
function apLmsSaveDraft(){const q=AP_LMS_UI.quiz;if(!q)return;try{localStorage.setItem(apLmsDraftKey(q),JSON.stringify({answers:q.answers,updated:Date.now()}));}catch(e){}}
async function apLmsStart(assignmentId,level){if(AP_LMS_UI.busy)return;apLmsBusy(true);apLmsClearError();
  try{const a=await apLmsApi('apLmsStart',{session_token:AP_LMS_UI.session,assignment_id:assignmentId,level});
    if(!a.questions||a.questions.length!==10)throw new Error('Bài tập chưa có đủ 10 câu.');
    const q={assignmentId,level,attemptToken:a.attempt_token,questions:a.questions,answers:{},current:0,title:a.title,studentId:AP_LMS_UI.student.student_id||AP_LMS_UI.student.id||''};
    try{const raw=JSON.parse(localStorage.getItem(apLmsDraftKey(q))||'null');if(raw&&raw.answers)q.answers=Object.fromEntries(Object.entries(raw.answers).filter(([uid,ans])=>a.questions.some(x=>x.uid===uid)&&['A','B','C','D'].includes(ans)));}catch(e){}
    AP_LMS_UI.quiz=q;apLmsScreen('ap-lms-quiz');apLmsRenderQuiz();
  }catch(e){apLmsError(e.message);}finally{apLmsBusy(false);}
}
function apLmsRenderQuiz(){const q=AP_LMS_UI.quiz;if(!q)return;const item=q.questions[q.current],picked=q.answers[item.uid],total=Object.keys(q.answers).length;
  apLmsEl('ap-lms-quiz-content').innerHTML=`<div class="lms-title-row"><div><span class="lms-pill">Cấp ${q.level} · 10 điểm</span><h2 style="margin-top:10px">${apLmsEsc(q.title)}</h2><p>Câu ${q.current+1}/10 · Đã chọn ${total}/10 đáp án</p></div><button type="button" class="lms-btn ghost" id="ap-lms-quiz-back">Về bài tập</button></div>
  <div class="lms-progress-track"><div class="lms-progress-bar" style="width:${total*10}%"></div></div>
  <nav class="lms-quiz-nav" aria-label="Chọn câu hỏi">${q.questions.map((x,i)=>`<button type="button" data-qindex="${i}" class="${q.answers[x.uid]?'done':''} ${q.current===i?'current':''}">${i+1}</button>`).join('')}</nav>
  <div class="lms-card"><div class="lms-question lms-math"><span class="lms-pill">Câu ${q.current+1}</span><div style="margin-top:12px">${apLmsMath(item.question)}</div></div><div class="lms-answer-grid">${item.options.map((v,i)=>{const letter='ABCD'[i];return `<button class="lms-answer ${picked===letter?'selected':''}" type="button" data-answer="${letter}"><b>${letter}</b><span class="lms-math">${apLmsMath(v)}</span></button>`;}).join('')}</div><div class="lms-quiz-controls"><button type="button" class="lms-btn ghost" id="ap-lms-prev" ${q.current===0?'disabled':''}>Câu trước</button><button type="button" class="lms-btn ghost" id="ap-lms-next" ${q.current===9?'disabled':''}>Câu tiếp</button><button type="button" class="lms-btn teal lms-submit-lock" id="ap-lms-submit">Nộp bài (${total}/10)</button></div><p class="lms-help">Bài được lưu tạm trên thiết bị khi chọn đáp án. Chỉ có điểm sau khi máy chủ xác nhận nộp thành công.</p></div>`;
  apLmsEl('ap-lms-quiz-back').addEventListener('click',apLmsLoadDashboard);
  apLmsEl('ap-lms-prev').addEventListener('click',()=>{q.current=Math.max(0,q.current-1);apLmsRenderQuiz();});
  apLmsEl('ap-lms-next').addEventListener('click',()=>{q.current=Math.min(9,q.current+1);apLmsRenderQuiz();});
  apLmsEl('ap-lms-submit').addEventListener('click',apLmsSubmit);
  apLmsEl('ap-lms-quiz-content').querySelectorAll('[data-qindex]').forEach(b=>b.addEventListener('click',()=>{q.current=Number(b.dataset.qindex);apLmsRenderQuiz();}));
  apLmsEl('ap-lms-quiz-content').querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>{q.answers[item.uid]=b.dataset.answer;apLmsSaveDraft();if(q.current<9)q.current++;apLmsRenderQuiz();}));
}
async function apLmsSubmit(){if(AP_LMS_UI.busy||!AP_LMS_UI.quiz)return;const q=AP_LMS_UI.quiz,n=Object.keys(q.answers).length;
  if(n<10&&!confirm('Em mới chọn '+n+'/10 đáp án. Em có chắc muốn nộp bài?'))return;
  if(n===10&&!confirm('Em xác nhận nộp bài cấp '+q.level+'?'))return;
  apLmsBusy(true);apLmsClearError();
  try{
    const r=await apLmsApi('apLmsSubmit',{session_token:AP_LMS_UI.session,attempt_token:q.attemptToken,answers:q.answers},'POST');
    try{localStorage.removeItem(apLmsDraftKey(q));}catch(e){}
    apLmsScreen('ap-lms-result');
    const review=Array.isArray(r.review)?r.review:[];
    apLmsEl('ap-lms-result-content').innerHTML=`<div class="lms-card" style="text-align:center"><div class="lms-hero-icon" style="margin:0 auto 12px">${r.passed?'<i class="bi bi-trophy"></i>':'<i class="bi bi-arrow-repeat"></i>'}</div><h2>${r.passed?'Chúc mừng em đã vượt qua!':'Em hãy ôn tập và thử lại nhé!'}</h2><div style="font-size:48px;font-weight:900;color:${r.passed?'#087b72':'#bf6c1e'};margin:10px 0">${r.score}/10</div><p>Cấp ${q.level} · ${r.passed?'Đạt yêu cầu từ 6 điểm':'Chưa đạt mốc 6 điểm'}${r.duplicate?' · Kết quả đã được lưu trước đó':''}</p><div class="lms-actions-inline" style="justify-content:center;margin-top:15px"><button class="lms-btn" type="button" id="ap-lms-home">Về danh sách bài</button>${r.passed&&q.level<3?'<button class="lms-btn teal" type="button" id="ap-lms-nextlevel">Làm cấp tiếp theo</button>':'<button class="lms-btn teal" type="button" id="ap-lms-repeat">Luyện tập lại</button>'}</div></div>
    ${review.length?`<div class="lms-card"><h3>Đáp án và hướng dẫn sau khi nộp</h3>${review.map((x,i)=>`<div class="lms-review-entry"><strong>Câu ${i+1} (${apLmsEsc(x.uid)})</strong>: Đáp án đúng <b>${apLmsEsc(x.answer)}</b>${x.explanation?`<div class="lms-math" style="margin-top:6px">${apLmsMath(x.explanation)}</div>`:''}</div>`).join('')}</div>`:''}`;
    apLmsEl('ap-lms-home').addEventListener('click',apLmsLoadDashboard);
    if(apLmsEl('ap-lms-nextlevel'))apLmsEl('ap-lms-nextlevel').addEventListener('click',()=>apLmsStart(q.assignmentId,q.level+1));
    if(apLmsEl('ap-lms-repeat'))apLmsEl('ap-lms-repeat').addEventListener('click',()=>apLmsStart(q.assignmentId,q.level));
  }catch(e){apLmsError('Chưa xác nhận nộp bài: '+e.message+' Hệ thống giữ bản nháp trên máy, em có thể thử lại.');apLmsSaveDraft();}
  finally{apLmsBusy(false);}
}
function apLmsParentSummaryHtml_(lms){
  if(!lms||!Array.isArray(lms.assignments))return '';
  const list=lms.assignments.map(a=>`<div style="padding:10px 0;border-bottom:1px solid #e2e8f0"><b>${apLmsEsc(a.title)}</b><div class="mini-note">${apLmsEsc(a.chapter||'')} · Cấp 1: ${a.scores[0]===null?'Chưa làm':apLmsEsc(a.scores[0])+'/10'} · Cấp 2: ${a.scores[1]===null?'Chưa làm':apLmsEsc(a.scores[1])+'/10'} · Cấp 3: ${a.scores[2]===null?'Chưa làm':apLmsEsc(a.scores[2])+'/10'}</div></div>`).join('');
  return `<div class="student-report-section"><div class="student-section-title"><i class="bi bi-mortarboard-fill"></i> Kết quả học LMS (3 cấp độ)</div><div class="student-mini-stats" style="margin-bottom:11px"><div class="student-mini-stat blue"><span>Bài được giao</span><strong>${Number(lms.total||0)}</strong></div><div class="student-mini-stat purple"><span>Hoàn thành</span><strong>${Number(lms.completed||0)}</strong></div><div class="student-mini-stat warn"><span>Chưa hoàn thành</span><strong>${Math.max(0,Number(lms.total||0)-Number(lms.completed||0))}</strong></div></div>${list||'<div class="mini-note">Chưa được giao bài trực tuyến.</div>'}</div>`;
}
// Teacher: module manager, import and duplicates ------------------------------------
const AP_LMS_ADMIN={catalog:[],importing:false};
function apLmsAdminMsg(v){const el=apLmsEl('ap-lms-admin-status');if(el)el.textContent=String(v||'');}
async function apLmsLoadAdmin(){
  apLmsAdminMsg('Đang kiểm tra kết nối ngân hàng...');
  try{
    const st=await apLmsApi('apLmsBankStatus',{},'GET',true);
    AP_LMS_ADMIN.bankId=st.bank_id||'';
    AP_LMS_ADMIN.bankReady=st.configured;
    if(st.configured && st.bank_id){apLmsEl('ap-lms-bank-id').value=st.bank_id;}
    apLmsEl('ap-lms-bank-summary').textContent=st.configured?`Đã kết nối · ${Number(st.count||0).toLocaleString('vi-VN')} câu · ${Number(st.ready||0).toLocaleString('vi-VN')} câu READY · Ngân hàng: ...${apLmsEsc(st.bank_id.slice(-6))}`:'Chưa kết nối ngân hàng. Hãy tạo ngân hàng mới hoặc nhập ID Google Sheets riêng.';
    if(st.bank_url){apLmsEl('ap-lms-bank-link').href=st.bank_url;apLmsEl('ap-lms-bank-link').hidden=false;}else{apLmsEl('ap-lms-bank-link').hidden=true;}
    if(st.configured){await apLmsLoadCatalog();await apLmsLoadAssignments();}apLmsAdminMsg('Sẵn sàng.');
  }catch(e){apLmsAdminMsg(e.message);}
}
async function apLmsNewBank(){if(!confirm('Tạo Google Spreadsheet ngân hàng riêng, không thay đổi bảng tính trung tâm?'))return;
  try{apLmsAdminMsg('Đang tạo ngân hàng...');const r=await apLmsApi('apLmsNewBank',{},'POST',true);apLmsAdminMsg('Đã tạo ngân hàng: '+r.url);await apLmsLoadAdmin();}
  catch(e){apLmsAdminMsg(e.message);}}
async function apLmsConnectBank(){
  const raw=(apLmsEl('ap-lms-bank-id').value||'').trim();
  const match=raw.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})(?:[/?#]|$)/i);
  const id=match?match[1]:(/^[\w-]{20,}$/.test(raw)?raw:'');
  if(!id){apLmsAdminMsg('BANK_ID_INVALID: Nhập đúng URL Google Sheets hoặc ID bảng tính.');return;}
  const switching=AP_LMS_ADMIN.bankId&&AP_LMS_ADMIN.bankId!==id;
  if(switching&&!confirm('Đang chuyển sang ngân hàng khác. Bạn đã sao lưu và muốn đổi nguồn?'))return;
  try{
    apLmsAdminMsg('Đang kiểm tra quyền truy cập và cấu trúc ngân hàng...');
    const d=await apLmsApi('apLmsConnectBank',{bank_spreadsheet_id:id,confirm_switch:!!switching},'POST',true);
    AP_LMS_ADMIN.bankId=id;
    apLmsAdminMsg('Đã kết nối ngân hàng ...'+d.bank_id_tail);
    await apLmsLoadAdmin();
  }catch(e){apLmsAdminMsg(e.message);}
}
async function apLmsLoadCatalog(){
  const d=await apLmsApi('apLmsCatalog',{},'GET',true);AP_LMS_ADMIN.catalog=d.catalog||[];
  const grade=apLmsEl('ap-lms-assignment-grade'),chapter=apLmsEl('ap-lms-assignment-chapter');
  const current=grade.value;const grades=[...new Set(AP_LMS_ADMIN.catalog.map(x=>String(x.grade)))].sort((a,b)=>Number(a)-Number(b));
  grade.innerHTML='<option value="">Chọn khối</option>'+grades.map(g=>`<option value="${apLmsEsc(g)}">Khối ${apLmsEsc(g)}</option>`).join('');
  if(grades.includes(current))grade.value=current;
  apLmsSetChapter();apLmsEl('ap-lms-catalog-info').textContent=`${AP_LMS_ADMIN.catalog.length} nhóm khối–chương đủ 10 câu ở cả 3 cấp. Những nhóm thiếu câu chưa thể giao thành bài 3 cấp.`;
}
function apLmsSetChapter(){const g=apLmsEl('ap-lms-assignment-grade').value,select=apLmsEl('ap-lms-assignment-chapter'),old=select.value;const rows=AP_LMS_ADMIN.catalog.filter(x=>String(x.grade)===g);
  select.innerHTML='<option value="">Chọn chương</option><option value="THEO_ID">Tạo theo ID (nhiều chương)</option>'+rows.map(x=>`<option value="${apLmsEsc(x.chapter)}">${apLmsEsc(x.chapter)} (${x.counts.join('/')})</option>`).join('');if(rows.some(x=>x.chapter===old))select.value=old;
}
async function apLmsLoadAssignments(){
  const rows=await apLmsApi('apLmsAdminAssignments',{},'GET',true);
  const selector=apLmsEl('ap-lms-results-assignment');selector.innerHTML='<option value="">Chọn bài cần xem điểm</option>'+rows.map(a=>`<option value="${apLmsEsc(a.assignment_id)}">${apLmsEsc(a.title)} · K${apLmsEsc(a.grade)}</option>`).join('');
  apLmsEl('ap-lms-admin-assignments').innerHTML=rows.length?`<div class="lms-admin-tablewrap"><table><thead><tr><th>Bài tập</th><th>Khối</th><th>Lớp</th><th>Hạn nộp</th><th>ID bài</th></tr></thead><tbody>${rows.slice(0,30).map(x=>`<tr><td>${apLmsEsc(x.title)}</td><td>${apLmsEsc(x.grade)}</td><td>${apLmsEsc(x.class_id||'Toàn khối')}</td><td>${apLmsEsc(apLmsDate(x.due_at))}</td><td><code>${apLmsEsc(x.assignment_id)}</code></td></tr>`).join('')}</tbody></table></div>`:'<p>Chưa giao bài LMS nào.</p>';
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
  const p={grade,chapter,title:apLmsEl('ap-lms-assignment-title').value,class_id:apLmsEl('ap-lms-assignment-class').value, due_at:apLmsEl('ap-lms-assignment-due').value,...Object.fromEntries([1,2,3].map(i=>['level'+i+'_ids',apLmsEl('ap-lms-ids-'+i).value]))};
  if(!grade||!chapter){apLmsAdminMsg('Cần chọn khối và chương (hoặc Tạo theo ID) trước khi giao.');return;}
  if(!confirm('Giao bài 3 cấp, mỗi cấp 10 câu, đạt 6 điểm để mở cấp tiếp theo?'))return;
  try{apLmsAdminMsg('Đang tạo sẵn 3 gói đề cho học sinh...');const d=await apLmsApi('apLmsCreateAssignment',p,'POST',true);apLmsAdminMsg('Đã giao bài '+d.title+' · ID '+d.assignment_id+' · 10 câu/cấp.');await apLmsLoadAssignments();}
  catch(e){apLmsAdminMsg(e.message);}
}
async function apLmsLoadResults(){const id=apLmsEl('ap-lms-results-assignment').value;if(!id)return;
  try{const r=await apLmsApi('apLmsAdminResults',{assignment_id:id},'GET',true);
    apLmsEl('ap-lms-admin-results').innerHTML=`<div class="lms-admin-tablewrap"><table><thead><tr><th>Học sinh</th><th>Lớp</th><th>Cấp 1</th><th>Cấp 2</th><th>Cấp 3</th><th>Tiến độ</th></tr></thead><tbody>${r.students.map(s=>`<tr><td>${apLmsEsc(s.name)}</td><td>${apLmsEsc(s.class_id)}</td>${s.scores.map(v=>`<td>${v===null?'--':v+'/10'}</td>`).join('')}<td>${s.passed_all?'Hoàn thành':'Chưa hoàn thành'}</td></tr>`).join('')}</tbody></table></div>`;
  }catch(e){apLmsAdminMsg(e.message);}
}
