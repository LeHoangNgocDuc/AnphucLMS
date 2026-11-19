// ============================================================================
// V4.20 - AI PROVIDER ADAPTER
// API key chỉ lưu trong ScriptProperties, không trả về trình duyệt.
// Provider mặc định: Gemini REST generateContent, hỗ trợ ảnh/PDF inline.
// ============================================================================

const V420_AI_KEY_PROP='ANPHUC_GEMINI_API_KEY';
const V420_AI_PROVIDER_PROP='ANPHUC_AI_PROVIDER';
const V420_AI_MODEL_PROP='ANPHUC_AI_MODEL';
const V420_AI_THRESHOLD_PROP='ANPHUC_AI_REVIEW_THRESHOLD';
const V420_AI_REQUIRE_REVIEW_PROP='ANPHUC_AI_REQUIRE_TEACHER_REVIEW';

function getAIGradingSettings(params){
  const p=PropertiesService.getScriptProperties(), key=String(p.getProperty(V420_AI_KEY_PROP)||'');
  return {provider:p.getProperty(V420_AI_PROVIDER_PROP)||'gemini',model:p.getProperty(V420_AI_MODEL_PROP)||'gemini-3.8-flash',review_threshold:Number(p.getProperty(V420_AI_THRESHOLD_PROP)||75),require_teacher_review:String(p.getProperty(V420_AI_REQUIRE_REVIEW_PROP)||'true')!=='false',api_key_configured:!!key,api_key_hint:key?('••••'+key.slice(-4)):''};
}
function saveAIGradingSettings(params){
  params=params||{}; const p=PropertiesService.getScriptProperties(); const provider=String(params.provider||'gemini').trim().toLowerCase(); if(provider!=='gemini')throw new Error('V4.20 hiện hỗ trợ provider Gemini. Adapter đã tách riêng để có thể bổ sung provider khác sau.');
  const model=String(params.model||'gemini-3.8-flash').trim(); if(!/^gemini-[A-Za-z0-9._-]+$/i.test(model))throw new Error('Tên model Gemini không hợp lệ.');
  const threshold=v420Clamp_(params.review_threshold||75,30,100); const requireReview='true';
  p.setProperty(V420_AI_PROVIDER_PROP,provider);p.setProperty(V420_AI_MODEL_PROP,model);p.setProperty(V420_AI_THRESHOLD_PROP,String(threshold));p.setProperty(V420_AI_REQUIRE_REVIEW_PROP,requireReview);
  const key=String(params.api_key||'').trim(); if(key)p.setProperty(V420_AI_KEY_PROP,key);
  return getAIGradingSettings({mask_key:true});
}

function v420AiLog_(submissionId,examId,provider,model,requestType,status,durationMs,responseExcerpt){
  try{v420AppendObject_(v420Sheet_(V420_EXAM_SHEETS.aiLogs),{log_id:generateId('AILOG'),submission_id:submissionId||'',exam_id:examId||'',provider:provider||'',model:model||'',request_type:requestType||'',status:status||'',duration_ms:Number(durationMs||0),response_excerpt:String(responseExcerpt||'').slice(0,3000),created_at:v420Now_()});}catch(e){console.warn('AI log',e);}
}

function v420GeminiGenerateJson_(prompt, blobs, meta){
  meta=meta||{}; const p=PropertiesService.getScriptProperties(), apiKey=String(p.getProperty(V420_AI_KEY_PROP)||'').trim(), model=String(p.getProperty(V420_AI_MODEL_PROP)||'gemini-3.8-flash').trim();
  if(!apiKey)throw new Error('Chưa cấu hình Gemini API key. Vào Chấm bài AI → Cấu hình AI.');
  const parts=[{text:String(prompt||'')}]; let totalBytes=0;
  (blobs||[]).forEach(blob=>{const bytes=blob.getBytes(); totalBytes+=bytes.length; if(totalBytes>14*1024*1024)throw new Error('Tổng dữ liệu ảnh/PDF của một bài vượt 14MB. Hãy giảm kích thước hoặc chia bài.'); parts.push({inlineData:{mimeType:blob.getContentType()||'application/octet-stream',data:Utilities.base64Encode(bytes)}});});
  const payload={contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:16384,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'medium'}}};
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent'; const started=Date.now(); let text='';
  try{
    const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'x-goog-api-key':apiKey},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:true});
    const code=res.getResponseCode(),body=res.getContentText(); if(code<200||code>=300){v420AiLog_(meta.submission_id,meta.exam_id,'gemini',model,meta.request_type||'grade','HTTP_'+code,Date.now()-started,body);throw new Error('Gemini API lỗi HTTP '+code+': '+body.slice(0,450));}
    const json=JSON.parse(body); const c=json.candidates&&json.candidates[0]; const p0=c&&c.content&&c.content.parts; text=(p0||[]).map(x=>x.text||'').join('').trim();
    if(!text)throw new Error('AI không trả nội dung chấm bài.');
    let parsed; try{parsed=JSON.parse(text);}catch(e){const m=text.match(/\{[\s\S]*\}/); if(!m)throw new Error('AI trả JSON không hợp lệ.'); parsed=JSON.parse(m[0]);}
    v420AiLog_(meta.submission_id,meta.exam_id,'gemini',model,meta.request_type||'grade','SUCCESS',Date.now()-started,text); return {data:parsed,raw:text,model};
  }catch(e){v420AiLog_(meta.submission_id,meta.exam_id,'gemini',model,meta.request_type||'grade','ERROR',Date.now()-started,text||String(e));throw e;}
}
