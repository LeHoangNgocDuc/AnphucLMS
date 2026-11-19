// ============================================================================
// HỆ THỐNG QUẢN LÝ TRUNG TÂM TOÁN AN PHÚC EDUCATION
// Tác giả: Thầy Lê Hoàng Ngọc Đức
// Phiên bản V4.28.1 - Zalo Queue Recovery (chi thay phan Zalo; giu core V4.27)
// ============================================================================

const SPREADSHEET_ID = "1k5__Km-LjS7pV3laItIe34IgAEFozP8A3u07zhb4RW4";
const ADMIN_EMAIL = "duclehoang01@gmail.com"; 

// Thông tin công khai của Trung tâm - dùng thống nhất cho Chatbot phụ huynh.
const DEFAULT_CENTER_ADDRESS = "30/11D Phước Tường, Phước Long, Nam Nha Trang";
const DEFAULT_CENTER_PHONE = "0972466347";
const DEFAULT_CENTER_ZALO = "0972466347";
const DEFAULT_CENTER_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(DEFAULT_CENTER_ADDRESS);

// Nhóm Zalo mặc định. Có thể bổ sung/sửa trực tiếp từ giao diện; giá trị lưu
// trong sheet Settings với khóa class_zalo_<MÃ_LỚP> sẽ ưu tiên hơn bảng mặc định.
const CLASS_ZALO_GROUPS = {
  "6A": "An Phúc_2728_Toán 6A_NC",
  "6B": "An Phúc_Toán 6B_2728",
  "7A": "An Phúc_Toán 7A_2627_NC",
  "7B": "An Phúc_Toán 7B_CB_2627",
  "8A": "An Phúc_Toán 8A_NC_2728",
  "8B": "An Phúc_Toán 8B_CB_27_28",
  "9A": "An Phúc_Toán 9A_2627_NC",
  "9B": "An Phúc_Toán 9B_CB_2728"
};

let _spreadsheetCache = null;
const SETTINGS_CACHE_KEY = 'ANPHUC_SETTINGS_V49';
const DATA_VERSION_PROPERTY = 'ANPHUC_DATA_VERSION_V49';
const CACHE_PREFIX = 'AP49';
const CACHE_TTL = {
  Students: 120,
  Tuition: 35,
  Attendance: 20,
  ClassSessions: 30,
  Materials: 90,
  Scores: 30,
  Homework: 90,
  Schedules: 120,
  Registrations: 30,
  ExamRegular: 600,
  ExamPeriodic: 600,
  ExamHistory: 60,
  ExamDefinitions: 45,
  ExamSubmissions: 20,
  AIGradingLogs: 20,
  ExamReviewAudit: 30,
  dashboard: 45,
  report: 30,
  studentReport: 25
};
let _sheetRuntimeCache = {};
let _dataVersionRuntime = null;

function getSpreadsheet_() {
  if (!_spreadsheetCache) _spreadsheetCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _spreadsheetCache;
}

function invalidateSettingsCache_() {
  try { CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY); } catch (e) {}
}

function getDataVersion_() {
  if (_dataVersionRuntime) return _dataVersionRuntime;
  try {
    const p = PropertiesService.getScriptProperties();
    let v = String(p.getProperty(DATA_VERSION_PROPERTY) || '').trim();
    if (!v) { v = String(Date.now()); p.setProperty(DATA_VERSION_PROPERTY, v); }
    _dataVersionRuntime = v;
    return v;
  } catch (e) {
    _dataVersionRuntime = String(Date.now());
    return _dataVersionRuntime;
  }
}

function bumpDataVersion_(reason) {
  const v = String(Date.now()) + '_' + Math.floor(Math.random() * 100000);
  _dataVersionRuntime = v;
  _sheetRuntimeCache = {};
  try { PropertiesService.getScriptProperties().setProperty(DATA_VERSION_PROPERTY, v); } catch (e) {}
  return v;
}

function cacheKey_(namespace, params) {
  const raw = CACHE_PREFIX + '|' + getDataVersion_() + '|' + namespace + '|' + JSON.stringify(params || {});
  try {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
    return CACHE_PREFIX + '_' + namespace.replace(/[^A-Za-z0-9_]/g, '_') + '_' + Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
  } catch (e) {
    return (CACHE_PREFIX + '_' + namespace + '_' + raw.length + '_' + raw.slice(-80)).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 220);
  }
}

function cacheGetJson_(namespace, params) {
  try {
    const raw = CacheService.getScriptCache().get(cacheKey_(namespace, params));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function cachePutJson_(namespace, params, value, ttlSeconds) {
  try {
    const raw = JSON.stringify(value);
    // Apps Script CacheService giới hạn kích thước mỗi key. Bỏ cache nếu payload lớn.
    if (raw.length > 85000) return false;
    CacheService.getScriptCache().put(cacheKey_(namespace, params), raw, Math.max(1, Number(ttlSeconds) || 30));
    return true;
  } catch (e) { return false; }
}

function clearRuntimeSheetCache_(sheetName) {
  if (sheetName) delete _sheetRuntimeCache[sheetName];
  else _sheetRuntimeCache = {};
}



// --- V4.8 SECURITY: XÁC THỰC / RATE LIMIT / NHẬT KÝ ---
const ADMIN_USERNAME_PROPERTY = 'ANPHUC_ADMIN_USERNAME';
const ADMIN_PASSWORD_HASH_PROPERTY = 'ANPHUC_ADMIN_PASSWORD_SHA256';
const ADMIN_SESSION_VERSION_PROPERTY = 'ANPHUC_ADMIN_SESSION_VERSION';
const ZALO_GATEWAY_API_KEY_PROPERTY = 'ANPHUC_ZALO_GATEWAY_API_KEY';
const ZALO_WAKE_KEY_PROPERTY = 'ANPHUC_ZALO_WAKE_KEY';
const DEFAULT_ADMIN_USERNAME = 'admin';
// SHA-256 của mật khẩu khởi tạo Anphuc01@. Sau khi setup, nên đổi ngay trong tab Cài đặt.
const DEFAULT_ADMIN_PASSWORD_HASH = 'ed64aa1b1f770edc18f01c11a6c48ef47e32e6f26364f9669565efe6c72a88c1';
const DEFAULT_ZALO_GATEWAY_API_KEY = '-X7uFumGFAZ9RVccg8hdAC2UZOiQhdsghDz5lMCx4LQ';
const DEFAULT_ZALO_WAKE_KEY = 'fJqTHQSl4bLyfJjQQTNTsJp7uFjuMRj4q_0xGBvQ2Ts';
const ADMIN_SESSION_SECONDS = 43200; // 12 giờ - thời hạn logic của phiên
const ADMIN_SESSION_CACHE_SECONDS = 21600; // CacheService của Apps Script tối đa 6 giờ

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2)).join('');
}

function safeEquals_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getSecurityClientHash_(params) {
  const raw = String((params || {})._client_id || 'anonymous').trim().slice(0, 160);
  return sha256Hex_(raw || 'anonymous').slice(0, 20);
}

function rateLimitKey_(bucket, clientHash) {
  return 'AP425_RL_' + String(bucket || 'GEN').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) + '_' + String(clientHash || 'anon');
}

function consumeRateLimit_(bucket, params, limit, windowSeconds, message) {
  const cache = CacheService.getScriptCache();
  const now = Date.now(), windowMs = Math.max(1000, Number(windowSeconds || 60) * 1000);
  const clientHash = getSecurityClientHash_(params);
  const key = rateLimitKey_(bucket, clientHash);
  let state = { start: now, count: 0 };
  try { const raw = cache.get(key); if (raw) state = JSON.parse(raw); } catch (e) {}
  if (!state.start || now - Number(state.start) >= windowMs) state = { start: now, count: 0 };
  if (Number(state.count || 0) >= Number(limit || 1)) {
    securityLog_('RATE_LIMIT', 'BLOCKED', bucket, clientHash, 'Vượt giới hạn thao tác công khai');
    throw new Error(message || 'Bạn thao tác quá nhanh. Vui lòng chờ một lúc rồi thử lại.');
  }
  state.count = Number(state.count || 0) + 1;
  const ttl = Math.max(1, Math.ceil((windowMs - (now - Number(state.start))) / 1000));
  cache.put(key, JSON.stringify(state), ttl);
  return { count:state.count, remaining:Math.max(0, Number(limit || 1) - state.count), client_hash:clientHash };
}

function consumeGlobalRateLimit_(bucket, limit, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const now = Date.now(), windowMs = Math.max(1000, Number(windowSeconds || 60) * 1000);
  const key = rateLimitKey_('GLOBAL_' + bucket, 'all');
  let state = { start:now, count:0 };
  try { const raw=cache.get(key); if(raw) state=JSON.parse(raw); } catch(e) {}
  if (!state.start || now - Number(state.start) >= windowMs) state={start:now,count:0};
  if (Number(state.count || 0) >= Number(limit || 1)) throw new Error('Hệ thống đang có nhiều yêu cầu. Vui lòng thử lại sau ít phút.');
  state.count=Number(state.count||0)+1;
  const ttl=Math.max(1,Math.ceil((windowMs-(now-Number(state.start)))/1000));
  cache.put(key,JSON.stringify(state),ttl);
}

function securityLog_(eventName, outcome, subject, clientHash, detail) {
  try {
    const sheet = getSpreadsheet_().getSheetByName('SecurityLogs');
    if (!sheet) return false;
    const row = [[new Date(), String(eventName || '').slice(0,60), String(outcome || '').slice(0,30), String(subject || '').slice(0,100), String(clientHash || '').slice(0,40), String(detail || '').slice(0,300)]];
    sheet.getRange(sheet.getLastRow()+1,1,1,row[0].length).setValues(row);
    return true;
  } catch (e) { return false; }
}

function getSecurityLogs(params) {
  const limit = Math.min(200, Math.max(10, Number((params || {}).limit || 50)));
  const sheet = getSpreadsheet_().getSheetByName('SecurityLogs');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const lastRow=sheet.getLastRow(), start=Math.max(2,lastRow-limit+1);
  const rows=sheet.getRange(start,1,lastRow-start+1,6).getDisplayValues();
  return rows.reverse().map(r=>({timestamp:r[0],event:r[1],outcome:r[2],subject:r[3],client_hash:r[4],detail:r[5]}));
}

function adminSessionCacheKey_(token) {
  const clean = String(token || '').trim();
  if (!clean) return '';
  return 'AP48_AUTH_' + sha256Hex_(clean).slice(0, 48);
}

function adminSessionPropertyKey_(token) {
  const clean=String(token||'').trim();
  return clean ? 'AP_ADMIN_SESSION_' + sha256Hex_(clean).slice(0,48) : '';
}

function getAdminSessionVersion_() {
  const props=PropertiesService.getScriptProperties();
  let v=String(props.getProperty(ADMIN_SESSION_VERSION_PROPERTY)||'').trim();
  if(!v){v=Utilities.getUuid();props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,v);}
  return v;
}

function saveAdminSession_(token, sessionInfo) {
  const props=PropertiesService.getScriptProperties();
  const cache=CacheService.getScriptCache();
  const now=Date.now();
  const full=Object.assign({},sessionInfo||{}, {expires_at:now + ADMIN_SESSION_SECONDS*1000});
  const raw=JSON.stringify(full);
  props.setProperty(adminSessionPropertyKey_(token),raw); // giữ phiên logic 12 giờ
  cache.put(adminSessionCacheKey_(token),raw,ADMIN_SESSION_CACHE_SECONDS); // lớp truy cập nhanh tối đa 6 giờ
  return full;
}

function loadAdminSession_(token) {
  token=String(token||'').trim();
  if(!token)return null;
  const dot=token.lastIndexOf('.');
  if(dot<=0)return null;
  const nonce=token.slice(0,dot),signature=token.slice(dot+1);
  const expectedSignature=sha256Hex_(nonce + ':' + getAdminSessionVersion_());
  if(!safeEquals_(signature,expectedSignature))return null;
  const cache=CacheService.getScriptCache();
  const props=PropertiesService.getScriptProperties();
  const ckey=adminSessionCacheKey_(token), pkey=adminSessionPropertyKey_(token);
  let raw=cache.get(ckey);
  if(!raw)raw=props.getProperty(pkey);
  if(!raw)return null;
  try{
    const info=JSON.parse(raw);
    const now=Date.now(), expires=Number(info.expires_at||0);
    if(!expires || expires<=now || !safeEquals_(String(info.session_version||''),getAdminSessionVersion_())){
      try{cache.remove(ckey);}catch(e){}
      try{props.deleteProperty(pkey);}catch(e){}
      return null;
    }
    // Nếu CacheService đã rơi sau 6 giờ nhưng phiên vẫn còn hạn, làm nóng cache lại.
    const remain=Math.max(1,Math.floor((expires-now)/1000));
    try{cache.put(ckey,raw,Math.min(ADMIN_SESSION_CACHE_SECONDS,remain));}catch(e){}
    return info;
  }catch(e){
    try{props.deleteProperty(pkey);}catch(_e){}
    return null;
  }
}

function adminLogin(params) {
  params = params || {};
  consumeGlobalRateLimit_('ADMIN_LOGIN_V426', 60, 600);
  const rl = consumeRateLimit_('ADMIN_LOGIN_V426', params, 10, 600, 'Đăng nhập tạm khóa do thử quá nhiều lần. Vui lòng chờ khoảng 10 phút.');
  const username = String(params.username || '').trim();
  const password = String(params.password || '');
  const props = PropertiesService.getScriptProperties();
  const expectedUser = String(props.getProperty(ADMIN_USERNAME_PROPERTY) || DEFAULT_ADMIN_USERNAME);
  const expectedHash = String(props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY) || DEFAULT_ADMIN_PASSWORD_HASH);
  const ok = safeEquals_(username, expectedUser) && safeEquals_(sha256Hex_(password), expectedHash);
  if (!ok) {
    securityLog_('ADMIN_LOGIN','FAILED',username||'(blank)',rl.client_hash,'Sai tài khoản hoặc mật khẩu');
    throw new Error('Tài khoản hoặc mật khẩu không đúng.');
  }

  const nonce = Utilities.getUuid() + ':' + Date.now() + ':' + Utilities.getUuid();
  const signature = sha256Hex_(nonce + ':' + getAdminSessionVersion_());
  const token = nonce + '.' + signature;
  saveAdminSession_(token,{username:expectedUser, created_at:Date.now(), session_version:getAdminSessionVersion_()});
  securityLog_('ADMIN_LOGIN','SUCCESS',expectedUser,rl.client_hash,'Đăng nhập quản trị thành công');
  return {authenticated:true, username:expectedUser, token:token, expires_in:ADMIN_SESSION_SECONDS};
}

function validateAdminSession(params) {
  params = params || {};
  const token = String(params._auth_token || params.auth_token || '').trim();
  if (!token) return { valid:false };
  const info=loadAdminSession_(token);
  if(!info)return {valid:false};
  return { valid:true, username:info.username || DEFAULT_ADMIN_USERNAME, expires_at:Number(info.expires_at||0) };
}

function assertAdminAuth_(params) {
  const check = validateAdminSession(params || {});
  if (!check.valid) throw new Error('UNAUTHORIZED: Vui lòng đăng nhập quyền Giáo viên');
  return check;
}

function adminLogout(params) {
  const token = String((params || {})._auth_token || (params || {}).auth_token || '').trim();
  if (token) {
    try { CacheService.getScriptCache().remove(adminSessionCacheKey_(token)); } catch (e) {}
    try { PropertiesService.getScriptProperties().deleteProperty(adminSessionPropertyKey_(token)); } catch (e) {}
  }
  return { logged_out:true };
}

function validateStrongPassword_(password) {
  const p=String(password||'');
  return p.length>=10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
}

function changeAdminPassword(params) {
  params=params||{};
  const current=String(params.current_password||''), next=String(params.new_password||'');
  const props=PropertiesService.getScriptProperties();
  const expectedHash=String(props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY)||DEFAULT_ADMIN_PASSWORD_HASH);
  if(!safeEquals_(sha256Hex_(current),expectedHash)) throw new Error('Mật khẩu hiện tại không đúng.');
  if(!validateStrongPassword_(next)) throw new Error('Mật khẩu mới phải từ 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.');
  if(safeEquals_(sha256Hex_(next),expectedHash)) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY,sha256Hex_(next));
  props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,Utilities.getUuid()); // vô hiệu toàn bộ token cũ
  securityLog_('ADMIN_PASSWORD','CHANGED',DEFAULT_ADMIN_USERNAME,getSecurityClientHash_(params),'Đã đổi mật khẩu quản trị; các phiên cũ bị vô hiệu');
  return {changed:true,relogin_required:true};
}

function getSecurityStatus() {
  const props=PropertiesService.getScriptProperties();
  const currentHash=String(props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY)||DEFAULT_ADMIN_PASSWORD_HASH);
  return {
    version:'V4.27',
    default_password_in_use:safeEquals_(currentHash,DEFAULT_ADMIN_PASSWORD_HASH),
    session_hours:ADMIN_SESSION_SECONDS/3600,
    gateway_auth_mode:'simple-compatible',
    wake_key_configured:!!String(props.getProperty(ZALO_WAKE_KEY_PROPERTY)||DEFAULT_ZALO_WAKE_KEY),
    gateway_url_configured:!!String(props.getProperty('ZALO_GATEWAY_URL')||'').trim()
  };
}

function getZaloGatewayApiKey_(){return zaloGatewayCanonicalKeyV4293_();}
function getZaloWakeKey_(){return String(PropertiesService.getScriptProperties().getProperty(ZALO_WAKE_KEY_PROPERTY)||DEFAULT_ZALO_WAKE_KEY).trim();}

// --- ROUTER & API HANDLER ---
function jsonResponse(success, dataOrMessage, meta) {
  const res = { success: success };
  if (success) { res.data = dataOrMessage; } else { res.message = dataOrMessage; }
  if (meta) res.meta = meta;
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

const ANPHUC_API_BUILD = 'ANPHUC_V4285_AUTH_SYNC_20261101';

function publicPing_() {
  return jsonResponse(true, {
    ok:true,
    version:'V4.27',
    api_build:ANPHUC_API_BUILD,
    gateway_route_build:'ANPHUC_V4293_ZALO_AUTH_SYNC_20261103',
    capabilities:{admin_login:true,score_media:true,score_parent_batch:true,gateway_cloud_probe:true,gateway_probe_action:'gatewayProbeV4288',zalo_queue_wake:true,unified_gateway_v4291:true},
    service:'AN_PHUC_PUBLIC_API',
    server_time:Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss')
  }, { version:'V4.27', api_build:ANPHUC_API_BUILD, server_ms:0 });
}

function getPublicSystemStatus(params) {
  params=params||{};
  const ss=getSpreadsheet_();
  const ready = name => { const sh=ss.getSheetByName(name); return !!(sh && sh.getLastRow() > 1); };
  return {
    ok:true,
    version:'V4.27',
    students_ready:ready('Students'),
    schedules_ready:ready('Schedules'),
    exam_regular_ready:ready('ExamRegular'),
    exam_periodic_ready:ready('ExamPeriodic'),
    registrations_ready:!!ss.getSheetByName('Registrations'),
    settings_ready:!!ss.getSheetByName('Settings')
  };
}

function doGet(e) {
  const p=(e&&e.parameter)||{};
  if (String(p.action||'') === 'publicPing') return publicPing_();
  return routeRequest(p, 'GET');
}
function doPost(e) {
  // Accept existing JSON clients and form-encoded clients without changing any action name.
  // Note: Apps Script may report application/json or text/plain for valid JSON.
  const raw = String(e && e.postData && e.postData.contents || '').trim();
  let params = null;
  if (raw) {
    try {
      const decoded = JSON.parse(raw);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) params = decoded;
      else return jsonResponse(false, 'POST_BODY_INVALID_OBJECT', {error_code:'POST_BODY_INVALID_OBJECT'});
    } catch (err) {
      const contentType = String(e && e.postData && e.postData.type || '').toLowerCase();
      if (contentType.indexOf('application/x-www-form-urlencoded') >= 0 && e && e.parameter) {
        params = e.parameter;
      } else {
        return jsonResponse(false, 'POST_JSON_INVALID', {error_code:'POST_JSON_INVALID'});
      }
    }
  } else if (e && e.parameter && Object.keys(e.parameter).length) {
    params = e.parameter;
  }
  if (!params || !String(params.action || '').trim())
    return jsonResponse(false, 'POST_ACTION_MISSING', {error_code:'POST_ACTION_MISSING'});
  return routeRequest(params, 'POST');
}


// -----------------------------------------------------------------------------
// V4.25 - ISOLATED SAFE ROUTER
// Core API and Parent Portal never reference optional module symbols while the
// router is being built. Optional modules are resolved only when their action
// is actually called. Therefore one missing Exam module can no longer break
// adminLogin, parent search, schedules, registration, tuition or attendance.
// -----------------------------------------------------------------------------
function missingModuleMessageV425_(fileName, functionName) {
  return 'Thiếu module ' + fileName + ' hoặc hàm ' + functionName +
    '. Hãy dán đúng file trong bộ V4.27 vào cùng project Apps Script, Save tất cả rồi Deploy New Version.';
}

function resolveGlobalFunctionV425_(functionName) {
  try {
    var fn = eval(String(functionName || ''));
    return (typeof fn === 'function') ? fn : null;
  } catch (e) {
    return null;
  }
}

function hasGlobalFunctionV425_(functionName) {
  return !!resolveGlobalFunctionV425_(functionName);
}

function invokeOptionalModuleV425_(descriptor, params) {
  descriptor = descriptor || {};
  var fn = resolveGlobalFunctionV425_(descriptor.fn);
  if (!fn) throw new Error(missingModuleMessageV425_(descriptor.file || 'module', descriptor.fn || 'unknown'));
  return fn(params || {});
}

function routeRequest(params, method) {
  const started = Date.now();
  try {
    params = params || {};
    method = String(method || 'GET').toUpperCase();
    const action = String(params.action || '').trim();
    if (!action) throw new Error('Thiếu tham số action');

    // -------- PUBLIC CORE: always available when Code.gs is present --------
    const publicGetCore = {
      validateAdminSession: validateAdminSession,
      publicPing: function(){ return {ok:true, version:'V4.27'}; },
      systemManifest: getSystemManifestV427,
      getPublicSystemStatus: getPublicSystemStatus,
      getPublicBootstrap: getPublicBootstrap,
      getPublicRegistrationInfo: getPublicRegistrationInfo,
      getPublicSchedule: getPublicSchedule,
      getPublicExams: getPublicExams,
      publicFindStudentByName: publicFindStudentByName,
      findParentStudentCandidates: publicFindStudentByName
    };
    const publicPostCore = {
      adminLogin: adminLogin,
      publicVerifyStudentPhone: publicVerifyStudentPhone,
      verifyParentStudent: publicVerifyStudentPhone,
      submitRegistration: submitRegistration
    };
    const publicGetOptional = {
      getParentGradedExam: {file:'Module_ExamParentReport.gs', fn:'getParentGradedExam'},
      getParentGradedExamAsset: {file:'Module_ExamParentReport.gs', fn:'getParentGradedExamAsset'}
    };

    // Service endpoint used by the local Zalo startup BAT.
    const servicePostCore = { wakeupZaloQueue: wakeupZaloQueue, gatewayProbeV4288: gatewayProbeV4288, gatewaySyncV4292: gatewaySyncV4292 };

    // -------- ADMIN CORE --------
    const adminGetCore = {
      getStudents: getStudents,
      getStudentsPage: getStudentsPage,
      getStudentsByClass: getStudentsByClass,
      getPaymentStatus: getPaymentStatus,
      getTuitionNoticeRows: getTuitionNoticeRows,
      getMaterialStatus: getMaterialStatus,
      getStatistics: getStatistics,
      getLessonReport: getLessonReport,
      getReportBundle: getReportBundle,
      getStudentSituationReport: getStudentSituationReport,
      getDashboardStats: getDashboardStats,
      getInitialData: getInitialData,
      getSettings: getSettings,
      getScoresByClass: getScoresByClass,
      getScoreReportDestination: getScoreReportDestination,
      getScoreGroupSendStatus: getScoreGroupSendStatus,
      getHomeworkList: getHomeworkList,
      lookupParentPortal: lookupParentPortal,
      getZaloQueueStatus: getZaloQueueStatus,
      getSchedules: getSchedules,
      getRegistrations: getRegistrations,
      getSecurityLogs: getSecurityLogs,
      getSecurityStatus: getSecurityStatus,
      getExamAdminRows: getExamAdminRows,
      getZaloDiagnostics: getZaloDiagnostics,
      checkSystemModulesV425: checkSystemModulesV425,
      checkSystemV426: checkSystemV426,
      checkSystemV427: checkSystemV427
    };
    const adminGetOptional = {
      getTuitionAutomationStatus: {file:'Module_TuitionAuto.gs', fn:'getTuitionAutomationStatus'},
      getUnreachableZaloStudents: {file:'Module_ZaloContacts.gs', fn:'getUnreachableZaloStudents'},
      getExamDashboard: {file:'Module_ExamCore.gs', fn:'getExamDashboard'},
      getExamDefinitions: {file:'Module_ExamCore.gs', fn:'getExamDefinitions'},
      getExamDefinition: {file:'Module_ExamCore.gs', fn:'getExamDefinition'},
      getExamSubmissions: {file:'Module_ExamUpload.gs', fn:'getExamSubmissions'},
      getExamSubmission: {file:'Module_ExamUpload.gs', fn:'getExamSubmission'},
      getExamSubmissionAsset: {file:'Module_ExamUpload.gs', fn:'getExamSubmissionAsset'},
      getExamReviewQueue: {file:'Module_ExamReview.gs', fn:'getExamReviewQueue'},
      getAIGradingSettings: {file:'Module_AIProvider.gs', fn:'getAIGradingSettings'}
    };

    const adminPostCore = {
      addStudent: addStudent,
      updateStudent: updateStudent,
      deleteStudent: deleteStudent,
      saveAttendance: saveAttendance,
      markAsPaid: markAsPaid,
      updateMaterialStatus: updateMaterialStatus,
      saveSettings: saveSettings,
      sendTuitionMessage: sendTuitionMessage,
      sendBulkTuitionReminders: sendBulkTuitionReminders,
      sendClassLessonReport: sendClassLessonReport,
      sendBulkClassLessonReports: sendBulkClassLessonReports,
      saveClassZaloGroup: saveClassZaloGroup,
      sendStudentSituationReport: sendStudentSituationReport,
      sendBulkStudentSituationReports: sendBulkStudentSituationReports,
      sendMultiMonthTuitionReminder: sendMultiMonthTuitionReminder,
      sendBulkMultiMonthTuitionReminders: sendBulkMultiMonthTuitionReminders,
      saveScores: saveScores,
      queueScoreParentHighlights: queueScoreParentHighlights,
      sendZaloTestMessage: sendZaloTestMessage,
      prepareScoreGroupReport: prepareScoreGroupReport,
      approveScoreGroupReport: approveScoreGroupReport,
      setupScoreMedia: scoreMediaSetup,
      saveAndSendHomework: saveAndSendHomework,
      saveSchedule: saveSchedule,
      deleteSchedule: deleteSchedule,
      saveRegistrationSettings: saveRegistrationSettings,
      approveRegistration: approveRegistration,
      updateRegistrationStatus: updateRegistrationStatus,
      adminLogout: adminLogout,
      changeAdminPassword: changeAdminPassword,
      processZaloQueue: processZaloQueue,
      importExamWorkbook: importExamWorkbook,
      saveExamSettings: saveExamSettings,
      saveExamEntry: saveExamEntry,
      deleteExamEntry: deleteExamEntry,
      saveZaloGatewayConfig: saveZaloGatewayConfig,
      promoteNewSchoolYear: promoteNewSchoolYearV425,
      setupSystemV4: setupSystemV48,
      setupSystemV42: setupSystemV48,
      setupSystemV43: setupSystemV48,
      setupSystemV44: setupSystemV48,
      setupSystemV45: setupSystemV48,
      setupSystemV46: setupSystemV48,
      setupSystemV47: setupSystemV48,
      setupSystemV48: setupSystemV48,
      setupSystemV49: setupSystemV49,
      setupSystemV410: setupSystemV410,
      setupSystemV411: setupSystemV411,
      setupSystemV413: setupSystemV413,
      setupSystemV414: setupSystemV414,
      setupSystemV415: setupSystemV415,
      setupSystemV416: setupSystemV416,
      setupSystemV417: setupSystemV417,
      setupSystemV418: setupSystemV418,
      setupSystemV419: setupSystemV419,
      setupSystemV420: setupSystemV420,
      setupSystemV421: setupSystemV421,
      setupSystemV422: setupSystemV422,
      setupSystemV423: setupSystemV426, // compatibility
      setupSystemV424: setupSystemV426, // compatibility
      setupSystemV425: setupSystemV426, // compatibility
      setupSystemV426: setupSystemV427, // compatibility
      setupSystemV427: setupSystemV427
    };
    const adminPostOptional = {
      runTuitionReminderNow: {file:'Module_TuitionAuto.gs', fn:'runTuitionReminderNow'},
      retryUnreachableZaloStudent: {file:'Module_ZaloContacts.gs', fn:'retryUnreachableZaloStudent'},
      createExamDefinition: {file:'Module_ExamCore.gs', fn:'createExamDefinition'},
      previewExamJsonDefinition: {file:'Module_ExamImport.gs', fn:'previewExamJsonDefinition'},
      importExamJsonDefinition: {file:'Module_ExamImport.gs', fn:'importExamJsonDefinition'},
      saveExamAnswerRubric: {file:'Module_ExamCore.gs', fn:'saveExamAnswerRubric'},
      archiveExamDefinition: {file:'Module_ExamCore.gs', fn:'archiveExamDefinition'},
      createExamSubmission: {file:'Module_ExamUpload.gs', fn:'createExamSubmission'},
      uploadExamSubmissionFile: {file:'Module_ExamUpload.gs', fn:'uploadExamSubmissionFile'},
      assignExamSubmissionStudent: {file:'Module_ExamUpload.gs', fn:'assignExamSubmissionStudent'},
      gradeExamSubmissionAI: {file:'Module_ExamGrading.gs', fn:'gradeExamSubmissionAI'},
      reviewExamSubmission: {file:'Module_ExamReview.gs', fn:'reviewExamSubmission'},
      saveExamSubmissionAnnotations: {file:'Module_ExamReview.gs', fn:'saveExamSubmissionAnnotations'},
      returnExamSubmissionForRegrade: {file:'Module_ExamReview.gs', fn:'returnExamSubmissionForRegrade'},
      sendExamResultToParent: {file:'Module_ExamParentReport.gs', fn:'sendExamResultToParent'},
      sendApprovedExamResultsBulk: {file:'Module_ExamParentReport.gs', fn:'sendApprovedExamResultsBulk'},
      saveAIGradingSettings: {file:'Module_AIProvider.gs', fn:'saveAIGradingSettings'}
    };

    // LMS V1.1: explicit isolated endpoints; no changes to legacy actions.
    const lmsGetPublic = {
      apLmsDashboard:'apLmsDashboard', apLmsStart:'apLmsStart'
    };
    const lmsPostPublic = {
      apLmsLogin:'apLmsLogin', apLmsPhoneLogin:'apLmsPhoneLogin', apLmsSubmit:'apLmsSubmit'
    };
    const lmsGetAdmin = {
      apLmsBankStatus:'apLmsBankStatus', apLmsCatalog:'apLmsCatalog',
      apLmsAdminAssignments:'apLmsAdminAssignments', apLmsAdminResults:'apLmsAdminResults',
      apLmsQuestionLookup:'apLmsQuestionLookup'
    };
    const lmsPostAdmin = {
      apLmsSetup:'apLmsSetup', apLmsNewBank:'apLmsNewBank',
      apLmsConnectBank:'apLmsConnectBank', apLmsPinAdmin:'apLmsPinAdmin',
      apLmsImportStageBatch:'apLmsImportStageBatch', apLmsImportFinalize:'apLmsImportFinalize',
      apLmsDeduplicate:'apLmsDeduplicate', apLmsCreateAssignment:'apLmsCreateAssignment'
    };

    let data;
    if (method==='GET' && lmsGetPublic[action]) {
      data=invokeOptionalModuleV425_({file:'Module_LMS.gs',fn:lmsGetPublic[action]},params);
    } else if (method==='POST' && lmsPostPublic[action]) {
      data=invokeOptionalModuleV425_({file:'Module_LMS.gs',fn:lmsPostPublic[action]},params);
    } else if (method==='GET' && lmsGetAdmin[action]) {
      assertAdminAuth_(params);
      data=invokeOptionalModuleV425_({file:'Module_LMS.gs / Module_LMSBank.gs',fn:lmsGetAdmin[action]},params);
    } else if (method==='POST' && lmsPostAdmin[action]) {
      assertAdminAuth_(params);
      data=invokeOptionalModuleV425_({file:'Module_LMS.gs / Module_LMSBank.gs',fn:lmsPostAdmin[action]},params);
    } else if (method === 'GET' && publicGetCore[action]) {
      data = publicGetCore[action](params);
    } else if (method === 'POST' && publicPostCore[action]) {
      data = publicPostCore[action](params);
    } else if (method === 'GET' && publicGetOptional[action]) {
      data = invokeOptionalModuleV425_(publicGetOptional[action], params);
    } else if (method === 'POST' && servicePostCore[action]) {
      data = servicePostCore[action](params);
    } else {
      assertAdminAuth_(params);
      if (method === 'GET' && adminGetCore[action]) data = adminGetCore[action](params);
      else if (method === 'GET' && adminGetOptional[action]) data = invokeOptionalModuleV425_(adminGetOptional[action], params);
      else if (method === 'POST' && adminPostCore[action]) data = adminPostCore[action](params);
      else if (method === 'POST' && adminPostOptional[action]) data = invokeOptionalModuleV425_(adminPostOptional[action], params);
      else throw new Error('ACTION_NOT_FOUND: ' + action);
    }
    return jsonResponse(true, data, {version:'V4.27', server_ms:Date.now()-started, data_version:getDataVersion_()});
  } catch (error) {
    return jsonResponse(false, String(error && error.message ? error.message : error), {version:'V4.27', server_ms:Date.now()-started});
  }
}

// --- KHỞI TẠO CẤU TRÚC SHEETS ---
function initSheets() {
  const ss = getSpreadsheet_();
  const sheetsInfo = [
    { name:'Students', headers:['student_id','name','grade','class','parent_phone','email','note','created_at','custom_fee','zalo_name','enrollment_date'] },
    { name:'Attendance', headers:['attendance_id','student_id','date','status','grade','class'] },
    { name:'Tuition', headers:['tuition_id','student_id','month','year','amount','method','paid_at','grade','class'] },
    { name:'Materials', headers:['student_id','batch1','batch2','batch3','batch4','batch5','batch6'] },
    { name:'Scores', headers:['score_id','student_id','name','grade','class','test_date','test_type','test_title','score','comment','created_at'] },
    { name:'Homework', headers:['hw_id','grade','class','assigned_date','due_date','title','material_url','note','zalo_sent','created_at'] },
    { name:'Schedules', headers:['schedule_id','grade','class','days_time','start_time','sessions_per_week','duration_minutes','teacher','room','status','note','updated_at','sessions_json'] },
    { name:'Registrations', headers:['reg_id','student_name','grade','parent_phone','note','status','created_at'] },
    { name:'ExamRegular', headers:['grade','chapter','lesson','code'] },
    { name:'ExamPeriodic', headers:['grade','year','category','display_name','code'] },
    { name:'ExamHistory', headers:['timestamp','student_name','grade','exam_name'] },
    { name:'ExamDefinitions', headers:['exam_id','title','subject','grade','class','exam_date','exam_type','total_score','mcq_count','mcq_points','essay_points','status','answer_key_json','rubric_json','question_bank_json','scoring_json','source_format','source_summary_json','answer_sheet_template','annotation_enabled','instructions','created_by','created_at','updated_at'] },
    { name:'ExamSubmissions', headers:['submission_id','exam_id','student_id','student_name','grade','class','file_ids_json','file_names_json','status','ai_status','ai_score','teacher_score','final_score','confidence','ai_feedback','parent_feedback','grading_json','annotation_json','annotated_at','parent_view_ready','created_at','updated_at','reviewed_at','sent_parent_at'] },
    { name:'AIGradingLogs', headers:['log_id','submission_id','exam_id','provider','model','request_type','status','duration_ms','response_excerpt','created_at'] },
    { name:'ExamReviewAudit', headers:['review_id','submission_id','exam_id','action','old_score','new_score','note','reviewed_by','created_at'] },
    { name:'SecurityLogs', headers:['timestamp','event','outcome','subject','client_hash','detail'] },
    { name:'Settings', headers:['key','value'] },
    { name:'MessageLogs', headers:['log_id','student_id','name','phone','message_type','month','year','message','status','http_status','gateway_response','created_at','zalo_name','class_name','dedupe_key','request_id','attempt_count','last_attempt_at','processed_at'] },
    { name:'ClassSessions', headers:['session_id','grade','class','date','created_at'] }
  ];

  sheetsInfo.forEach(info => {
    let sheet = ss.getSheetByName(info.name);
    if (!sheet) {
      sheet = ss.insertSheet(info.name);
      sheet.getRange(1,1,1,info.headers.length).setValues([info.headers]).setFontWeight('bold').setBackground('#e3f2fd');
      return;
    }
    const lastCol = Math.max(sheet.getLastColumn(),1);
    const existing = sheet.getRange(1,1,1,lastCol).getValues()[0].map(v => String(v || '').trim());
    const missing = info.headers.filter(h => existing.indexOf(h) === -1);
    if (missing.length) sheet.getRange(1,sheet.getLastColumn()+1,1,missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e3f2fd');
  });

  // Học sinh cũ: dùng created_at làm enrollment_date nếu trước đây chưa có mốc nhập học.
  const st = ss.getSheetByName('Students');
  if (st && st.getLastRow() > 1) {
    const headers = st.getRange(1,1,1,st.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    const createdIdx=headers.indexOf('created_at'), enrollIdx=headers.indexOf('enrollment_date');
    if (createdIdx >= 0 && enrollIdx >= 0) {
      const values=st.getRange(2,1,st.getLastRow()-1,st.getLastColumn()).getValues(); let changed=false;
      values.forEach(row => { if (!row[enrollIdx] && row[createdIdx]) { row[enrollIdx]=row[createdIdx]; changed=true; } });
      if (changed && values.length) st.getRange(2,1,values.length,values[0].length).setValues(values);
    }
  }
}

function ensureSingleZaloQueueTrigger_() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processZaloQueue');
  let removed=0, created=false;
  if (triggers.length > 1) for (let i=1;i<triggers.length;i++) { ScriptApp.deleteTrigger(triggers[i]); removed++; }
  if (triggers.length === 0) { ScriptApp.newTrigger('processZaloQueue').timeBased().everyMinutes(1).create(); created=true; }
  return { created, removed, active:1 };
}

function normalizeScoresColumnOrder_() {
  const sheet=getSpreadsheet_().getSheetByName('Scores');
  if(!sheet)return false;
  const desired=['score_id','student_id','name','grade','class','test_date','test_type','test_title','score','comment','created_at'];
  const lastCol=Math.max(1,sheet.getLastColumn()), lastRow=Math.max(1,sheet.getLastRow());
  const all=sheet.getRange(1,1,lastRow,lastCol).getValues(), old=all[0].map(h=>String(h||'').trim());
  if(desired.length===old.length&&desired.every((h,i)=>h===old[i]))return false;
  const oldIndex=new Map(old.map((h,i)=>[h,i]));
  const body=all.slice(1).map(r=>desired.map(h=>oldIndex.has(h)?r[oldIndex.get(h)] : ''));
  sheet.clearContents();
  sheet.getRange(1,1,1,desired.length).setValues([desired]).setFontWeight('bold').setBackground('#e3f2fd');
  if(body.length)sheet.getRange(2,1,body.length,desired.length).setValues(body);
  return true;
}

function fillScoreNames_() {
  const ss=getSpreadsheet_(), sheet=ss.getSheetByName('Scores'), students=getSheetData('Students',ss);
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h||'').trim());
  const idIdx=headers.indexOf('student_id'), nameIdx=headers.indexOf('name');
  if (idIdx < 0 || nameIdx < 0) return 0;
  const map=new Map(students.map(x=>[String(x.student_id),String(x.name||'')]));
  const body=sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getValues(); let changed=0;
  body.forEach(row=>{ if (!String(row[nameIdx]||'').trim() && map.has(String(row[idIdx]))) { row[nameIdx]=map.get(String(row[idIdx])); changed++; } });
  if (changed) sheet.getRange(2,1,body.length,headers.length).setValues(body);
  return changed;
}

function setupSystemV47() {
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    initSheets();
    const props=PropertiesService.getScriptProperties();
    if (!props.getProperty(ADMIN_USERNAME_PROPERTY)) props.setProperty(ADMIN_USERNAME_PROPERTY, DEFAULT_ADMIN_USERNAME);
    if (!props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY)) props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY, DEFAULT_ADMIN_PASSWORD_HASH);

    const settings=getSettingsMap_(getSpreadsheet_(),true);
    const missingPublicSettings={};
    if (!String(settings.registration_guide_text || '').trim()) missingPublicSettings.registration_guide_text='Quý phụ huynh vui lòng để lại thông tin học sinh. Trung tâm sẽ liên hệ qua Zalo để tư vấn lớp phù hợp, lịch học và mức học phí hiện hành.';
    if (!String(settings.center_address || '').trim()) missingPublicSettings.center_address=DEFAULT_CENTER_ADDRESS;
    if (!String(settings.center_phone || '').trim()) missingPublicSettings.center_phone=DEFAULT_CENTER_PHONE;
    if (!String(settings.center_zalo || '').trim()) missingPublicSettings.center_zalo=DEFAULT_CENTER_ZALO;
    if (!String(settings.center_maps_url || '').trim()) missingPublicSettings.center_maps_url=DEFAULT_CENTER_MAPS_URL;
    if (Object.keys(missingPublicSettings).length) upsertSettingsBatch_(missingPublicSettings);

    const scoreSchemaReordered=normalizeScoresColumnOrder_();
    const scoreNamesFilled=fillScoreNames_();
    const ss=getSpreadsheet_(), msgSheet=ss.getSheetByName('MessageLogs'); let duplicateRowsMarked=0;
    if (msgSheet && msgSheet.getLastRow()>1) {
      const values=msgSheet.getDataRange().getValues(), headers=values[0].map(h=>String(h||'').trim());
      const idx=key=>headers.indexOf(key), seen=new Set(); let changed=false;
      for (let i=1;i<values.length;i++) {
        const row=values[i];
        const item={ student_id:idx('student_id')>=0?row[idx('student_id')]:'', name:idx('name')>=0?row[idx('name')]:'', phone:idx('phone')>=0?row[idx('phone')]:'', type:idx('message_type')>=0?row[idx('message_type')]:'', month:idx('month')>=0?row[idx('month')]:'', year:idx('year')>=0?row[idx('year')]:'', msg:idx('message')>=0?row[idx('message')]:'', zaloName:idx('zalo_name')>=0?row[idx('zalo_name')]:'', class_name:idx('class_name')>=0?row[idx('class_name')]:'' };
        const existingKey=idx('dedupe_key')>=0?String(row[idx('dedupe_key')]||'').trim():'';
        const key=existingKey || buildMessageDedupeKey_(item);
        if (idx('dedupe_key')>=0 && !existingKey) { row[idx('dedupe_key')]=key; changed=true; }
        const status=idx('status')>=0?String(row[idx('status')]||'').trim().toUpperCase():'';
        if (!key) continue;
        if (seen.has(key) && ['PENDING','WAITING_SERVER','PROCESSING'].includes(status)) { row[idx('status')]='DUPLICATE_SKIPPED'; duplicateRowsMarked++; changed=true; }
        else if (['PENDING','WAITING_SERVER','PROCESSING','SUCCESS'].includes(status)) seen.add(key);
      }
      if (changed) msgSheet.getRange(2,1,values.length-1,headers.length).setValues(values.slice(1));
    }
    const triggerInfo=ensureSingleZaloQueueTrigger_(); invalidateSettingsCache_(); bumpDataVersion_('setup_v47');
    return { updated:true, version:'V4.7', score_schema_reordered:scoreSchemaReordered, score_names_filled:scoreNamesFilled, duplicate_queue_rows_marked:duplicateRowsMarked, zalo_trigger_created:triggerInfo.created, duplicate_zalo_triggers_removed:triggerInfo.removed, message:'Đã cập nhật V4.7: thời khóa biểu theo từng buổi, nút cộng thêm buổi, chỉnh sửa trực tiếp và 90 phút/buổi.' };
  } finally { lock.releaseLock(); }
}

function setupSystemV48() {
  const result=setupSystemV47();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ADMIN_SESSION_VERSION_PROPERTY)) props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,Utilities.getUuid());
  if(!props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY)) props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY)) props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.8','system','Khởi tạo SecurityLogs, API key Zalo, wake key và session version');
  return Object.assign({},result,{version:'V4.8',message:'Đã nâng cấp cấu trúc V4.8 Security. Dữ liệu cũ được giữ nguyên.'});
}


function setupSystemV49() {
  const result = setupSystemV48();
  initSheets();
  const settings = getSettingsMap_(getSpreadsheet_(), true);
  if (!String(settings.exam_redirect_base_url || '').trim()) {
    upsertSettingsBatch_({
      exam_redirect_base_url:'https://anphuceducation.netlify.app/student'
    });
  }
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v49');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.9','system','Khởi tạo ExamRegular, ExamPeriodic, ExamHistory và API kiểm tra lazy-load');
  return Object.assign({}, result, {
    version:'V4.9',
    message:'Đã nâng cấp V4.9: tích hợp Kiểm tra trực tuyến theo khối/loại, chỉ tải khi phụ huynh mở mục Kiểm tra.'
  });
}


function setupSystemV410() {
  const result = setupSystemV49();
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.10','system','Nâng cấp giao diện Cổng phụ huynh dạng tab; không thay đổi cấu trúc dữ liệu V4.9');
  return Object.assign({}, result, {
    version:'V4.10',
    message:'Đã nâng cấp V4.10: giao diện phụ huynh dạng tab hiện đại; module Kiểm tra vẫn lazy-load theo khối/loại.'
  });
}

function setupSystemV46(){ return setupSystemV48(); }
function setupSystemV45(){ return setupSystemV48(); }
function setupSystemV44(){ return setupSystemV48(); }
function setupSystemV43(){ return setupSystemV48(); }
function setupSystemV42(){ return setupSystemV48(); }
function setupSystemV4(){ return setupSystemV48(); }
function setup(){ return setupSystemV427(); }

function getSheetData(sheetName, ss) {
  const version = getDataVersion_();
  const runtimeKey = sheetName + '|' + version;
  if (_sheetRuntimeCache[runtimeKey]) return _sheetRuntimeCache[runtimeKey];

  const ttl = CACHE_TTL[sheetName] || 0;
  if (ttl > 0) {
    const cached = cacheGetJson_('sheet_' + sheetName, {v:version});
    if (cached && Array.isArray(cached)) {
      _sheetRuntimeCache[runtimeKey] = cached;
      return cached;
    }
  }

  const sheet = (ss || getSpreadsheet_()).getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol < 1) return [];
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const result = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => { if (header) obj[header] = row[index]; });
    return obj;
  });
  _sheetRuntimeCache[runtimeKey] = result;
  if (ttl > 0) cachePutJson_('sheet_' + sheetName, {v:version}, result, ttl);
  return result;
}
function getSheetDataAsObjects(sheetName, ss) { return getSheetData(sheetName, ss); }

// --- BỘ GIẢI MÃ NGÀY THÁNG ĐA NĂNG (Đã vá lỗi đọc ngược ngày tháng) ---
function parseDateHelper(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) { return { year: dateVal.getFullYear(), month: dateVal.getMonth() + 1, dateStr: Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd") }; }
  const str = String(dateVal).trim();
  
  // Ưu tiên 1: Dạng chuẩn của HTML5 Date Picker (YYYY-MM-DD)
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) { const y = parseInt(match[1], 10); const m = parseInt(match[2], 10); const d = parseInt(match[3], 10); return { year: y, month: m, dateStr: Utilities.formatDate(new Date(y, m-1, d), "GMT+7", "yyyy-MM-dd") }; }
  
  // Ưu tiên 2: Dạng gõ tay DD/MM/YYYY (Kiểm tra trước tiên để tránh JS Date hiểu nhầm)
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) { const d = parseInt(match[1], 10); const m = parseInt(match[2], 10); const y = parseInt(match[3], 10); return { year: y, month: m, dateStr: Utilities.formatDate(new Date(y, m-1, d), "GMT+7", "yyyy-MM-dd") }; }
  
  // Ưu tiên 3: JS Date fallback
  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) { return { year: dObj.getFullYear(), month: dObj.getMonth() + 1, dateStr: Utilities.formatDate(dObj, "GMT+7", "yyyy-MM-dd") }; }
  
  return null;
}

function normalizeNumberString(v) { if (v === null || v === undefined || String(v).trim() === '') return ''; const n = Number(v); return Number.isFinite(n) ? String(n) : String(v).trim(); }
function normalizeClassName(v) { return String(v || '').trim().toUpperCase(); }
function classCode(grade, className) { return `${normalizeNumberString(grade)}${normalizeClassName(className)}`; }
function getSettingsMap_(ss, forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    try {
      const cached = cache.get(SETTINGS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }
  const settings = {};
  const sheet = (ss || getSpreadsheet_()).getSheetByName('Settings');
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(2, Math.max(2, sheet.getLastColumn()))).getValues();
    values.forEach(row => {
      const key = String(row[0] || '').trim();
      if (key) settings[key] = row[1];
    });
  }
  try { cache.put(SETTINGS_CACHE_KEY, JSON.stringify(settings), 120); } catch (e) {}
  return settings;
}
function getClassZaloMap_(settings) {
  const map = Object.assign({}, CLASS_ZALO_GROUPS);
  const source = settings || getSettingsMap_();
  Object.keys(source).forEach(key => {
    if (!String(key).startsWith('class_zalo_')) return;
    const code = String(key).slice('class_zalo_'.length).trim().toUpperCase();
    const value = String(source[key] || '').trim();
    if (code && value) map[code] = value;
  });
  return map;
}
function getClassZaloName(grade, className, classZaloMap) {
  const map = classZaloMap || getClassZaloMap_();
  return map[classCode(grade, className)] || '';
}
function upsertSetting_(key, value) {
  const sheet = getSpreadsheet_().getSheetByName('Settings');
  if (!sheet) throw new Error('Sheet Settings không tồn tại');
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        invalidateSettingsCache_();
        return;
      }
    }
  }
  sheet.appendRow([key, value]);
  invalidateSettingsCache_();
}
function saveClassZaloGroup(params) {
  const grade = normalizeNumberString(params.grade);
  const className = normalizeClassName(params.className);
  const zaloName = String(params.zalo_name || params.zaloName || '').trim();
  if (!grade || !className) throw new Error('Thiếu Khối/Lớp');
  if (zaloName.length < 2) throw new Error('Tên nhóm Zalo phải có ít nhất 2 ký tự');
  const code = classCode(grade, className);
  upsertSetting_('class_zalo_' + code, zaloName);
  bumpDataVersion_('class_zalo');
  return { updated: true, class_code: code, zalo_name: zaloName };
}
function formatMoneyVN(amount) {
  const n = Number(amount || 0);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}
function getExpectedTuitionAmount(student, defaultFee) {
  const custom = Number(student && student.custom_fee);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const def = Number(defaultFee || 0);
  return Number.isFinite(def) && def > 0 ? def : 0;
}
function formatDateTimeSafe(val) { try { return Utilities.formatDate(new Date(val), "GMT+7", "dd/MM/yyyy HH:mm"); } catch(e) { return String(val); } }
function normalizeVietnamPhone(phone) {
  if (!phone) return ""; let s = String(phone).trim(); if (s.endsWith('.0')) s = s.slice(0, -2); s = s.replace(/[^\d]/g, '');
  if (s.startsWith('84') && (s.length === 11 || s.length === 10)) s = '0' + s.slice(2);
  if (s.length > 0 && s[0] !== '0') s = '0' + s; return /^0[35789][0-9]{8}$/.test(s) ? s : ""; 
}
function generateId(prefix) { return prefix + Date.now() + Math.floor(Math.random() * 1000); }
function columnToLetter_(column) {
  let n = Number(column), out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

// --- MODULE CÀI ĐẶT ---
function getSettings() {
  // Không chạy migration trong mỗi lần mở web; setupSystemV4() được chạy thủ công khi nâng cấp.
  return getSettingsMap_(getSpreadsheet_(), false);
}
function saveSettings(params) {
  upsertSetting_('tuition_amount_default', params.tuition_amount_default || '');
  bumpDataVersion_('settings');
  return { updated: true };
}


// --- V4.6: THỜI KHÓA BIỂU & TUYỂN SINH ---
function upsertSettingsBatch_(pairs) {
  const sheet=getSpreadsheet_().getSheetByName('Settings');
  if(!sheet) throw new Error('Sheet Settings không tồn tại');
  const lastRow=sheet.getLastRow();
  const body=lastRow>1?sheet.getRange(2,1,lastRow-1,Math.max(2,sheet.getLastColumn())).getValues():[];
  const index=new Map(); body.forEach((r,i)=>{const k=String(r[0]||'').trim();if(k)index.set(k,i);});
  Object.keys(pairs||{}).forEach(key=>{
    if(index.has(key)) body[index.get(key)][1]=pairs[key];
    else { const row=new Array(Math.max(2,sheet.getLastColumn())).fill(''); row[0]=key; row[1]=pairs[key]; index.set(key,body.length); body.push(row); }
  });
  if(lastRow>1) sheet.getRange(2,1,lastRow-1,Math.max(2,sheet.getLastColumn())).clearContent();
  if(body.length) sheet.getRange(2,1,body.length,body[0].length).setValues(body);
  invalidateSettingsCache_();
}

function normalizeScheduleTime_(value) {
  const s=String(value||'').trim();
  const m=s.match(/^(\d{1,2}):(\d{2})$/); if(!m)return '';
  const h=Number(m[1]), min=Number(m[2]); if(h<0||h>23||min<0||min>59)return '';
  return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
}

function addMinutesToTime_(timeText, minutes) {
  const t=normalizeScheduleTime_(timeText); if(!t)return '';
  const p=t.split(':').map(Number), total=(p[0]*60+p[1]+Number(minutes||0))%(24*60);
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}

function inferSessionsPerWeek_(daysText) {
  const s=String(daysText||'').trim(); if(!s)return 0;
  const parts=s.split(/\s*(?:&|,|;|\+|\bvà\b)\s*/i).map(x=>x.trim()).filter(Boolean);
  return Math.max(1,Math.min(7,parts.length||1));
}

function parseScheduleSessions_(x) {
  const duration=90;
  let raw=[];
  try {
    const parsed=JSON.parse(String((x||{}).sessions_json||'[]'));
    if(Array.isArray(parsed)) raw=parsed;
  } catch(e) {}
  let sessions=raw.map((item,i)=>{
    const day=String((item||{}).day||'').trim();
    const start=normalizeScheduleTime_((item||{}).start_time||'');
    if(!day||!start)return null;
    return { session_no:i+1, day:day, start_time:start, end_time:addMinutesToTime_(start,duration), duration_minutes:duration, duration_label:'1 giờ 30 phút' };
  }).filter(Boolean);
  if(!sessions.length){
    const days=String((x||{}).days_time||'').split(/\s*(?:&|,|;|\+|\bvà\b)\s*/i).map(v=>v.trim()).filter(Boolean);
    const start=normalizeScheduleTime_((x||{}).start_time||'');
    sessions=days.map((day,i)=>({session_no:i+1,day:day,start_time:start,end_time:start?addMinutesToTime_(start,duration):'',duration_minutes:duration,duration_label:'1 giờ 30 phút'}));
    if(!sessions.length && start) sessions=[{session_no:1,day:'Buổi 1',start_time:start,end_time:addMinutesToTime_(start,duration),duration_minutes:duration,duration_label:'1 giờ 30 phút'}];
  }
  return sessions;
}

function normalizeScheduleRecord_(x) {
  const duration=90;
  const sessions=parseScheduleSessions_(x);
  const first=sessions[0]||{};
  return Object.assign({},x,{
    class_info:`K${x.grade}-${x.class}`,
    sessions:sessions,
    days_time:sessions.map(s=>s.day).join(' & '),
    start_time:first.start_time||normalizeScheduleTime_(x.start_time||''),
    end_time:first.end_time||'',
    sessions_per_week:sessions.length || Math.max(1,Math.min(7,Number(x.sessions_per_week)||inferSessionsPerWeek_(x.days_time))),
    duration_minutes:duration,
    duration_label:'1 giờ 30 phút'
  });
}

function getSchedules(params) {
  params=params||{}; const grade=normalizeNumberString(params.grade), className=normalizeClassName(params.className);
  return getSheetData('Schedules').filter(x=>(!grade||normalizeNumberString(x.grade)===grade)&&(!className||normalizeClassName(x.class)===className))
    .map(normalizeScheduleRecord_)
    .sort((a,b)=>(Number(a.grade)||0)-(Number(b.grade)||0)||normalizeClassName(a.class).localeCompare(normalizeClassName(b.class),'vi'));
}

function buildPublicScheduleRows_() {
  return getSheetData('Schedules').map(normalizeScheduleRecord_).map(x=>({
    grade:String(x.grade||''),
    class:String(x.class||''),
    class_info:String(x.class_info||''),
    sessions:(x.sessions||[]).map(b=>({day:String(b.day||''),start_time:String(b.start_time||''),end_time:String(b.end_time||'')})),
    sessions_per_week:Number(x.sessions_per_week||0),
    teacher:String(x.teacher||''),
    room:String(x.room||''),
    status:String(x.status||'')
  })).sort((a,b)=>(Number(a.grade)||0)-(Number(b.grade)||0)||normalizeClassName(a.class).localeCompare(normalizeClassName(b.class),'vi'));
}

function getPublicBootstrap(params) {
  params=params||{};
  consumeGlobalRateLimit_('PUBLIC_BOOTSTRAP',300,60);
  consumeRateLimit_('PUBLIC_BOOTSTRAP',params,80,300,'Quý phụ huynh thao tác quá nhanh. Vui lòng thử lại sau ít phút.');
  const cached=cacheGetJson_('public_bootstrap',{scope:'all'});
  if(cached)return cached;
  const settings=getSettingsMap_();
  const result={
    schedules:buildPublicScheduleRows_(),
    registration_guide_text:String(settings.registration_guide_text||'Quý phụ huynh vui lòng để lại thông tin học sinh. Trung tâm sẽ liên hệ tư vấn lớp phù hợp, lịch học và mức học phí hiện hành.')
  };
  cachePutJson_('public_bootstrap',{scope:'all'},result,300);
  return result;
}

function getPublicSchedule(params) {
  params=params||{};
  consumeGlobalRateLimit_('PUBLIC_SCHEDULE',180,60);
  consumeRateLimit_('PUBLIC_SCHEDULE',params,60,300);
  const grade=normalizeNumberString(params.grade||'');
  if(!['6','7','8','9','10','11','12'].includes(grade)) throw new Error('Vui lòng chọn một khối để xem thời khóa biểu.');
  const cacheParams={grade};
  const cached=cacheGetJson_('public_schedule',cacheParams); if(cached)return cached;
  const rows=buildPublicScheduleRows_().filter(x=>normalizeNumberString(x.grade)===grade);
  cachePutJson_('public_schedule',cacheParams,rows,300);
  return rows;
}

function saveSchedule(params) {
  params=params||{};
  const grade=normalizeNumberString(params.grade), className=String(params.className||'').trim();
  const teacher=String(params.teacher||'').trim(), room=String(params.room||'').trim();
  const status=String(params.status||'Đang nhận HS').trim(), note=String(params.note||'').trim();
  let sessions=Array.isArray(params.sessions)?params.sessions:[];
  if(!sessions.length && params.days_time && params.start_time){
    sessions=[{day:String(params.days_time||'').trim(),start_time:String(params.start_time||'').trim()}];
  }
  sessions=sessions.map((item,i)=>({
    session_no:i+1,
    day:String((item||{}).day||'').trim(),
    start_time:normalizeScheduleTime_((item||{}).start_time||'')
  })).filter(x=>x.day&&x.start_time);
  if(!grade||!className||!sessions.length) throw new Error('Hãy chọn Khối, nhập Lớp và ít nhất Buổi 1 gồm Thứ + Giờ bắt đầu.');
  if(sessions.length>7) throw new Error('Mỗi lớp tối đa 7 buổi/tuần.');
  const seen=new Set();
  sessions.forEach(x=>{
    const key=x.day.toLocaleLowerCase('vi-VN')+'|'+x.start_time;
    if(seen.has(key)) throw new Error('Có buổi học bị trùng Thứ và giờ.');
    seen.add(key);
  });
  const daysTime=sessions.map(x=>x.day).join(' & '), startTime=sessions[0].start_time, sessionsPerWeek=sessions.length;
  const sheet=getSpreadsheet_().getSheetByName('Schedules'); if(!sheet)throw new Error('Chưa có sheet Schedules. Hãy chạy setupSystemV48().');
  const data=sheet.getDataRange().getValues(), headers=data[0].map(h=>String(h||'').trim()), idx=k=>headers.indexOf(k);
  const id=String(params.schedule_id||'').trim()||generateId('SCH');
  let rowNo=-1; for(let i=1;i<data.length;i++)if(String(data[i][idx('schedule_id')])===id){rowNo=i+1;break;}
  const row=new Array(headers.length).fill(''); const set=(k,v)=>{const j=idx(k);if(j>=0)row[j]=v;};
  set('schedule_id',id);set('grade',grade);set('class',className);set('days_time',daysTime);set('start_time',startTime);set('sessions_per_week',sessionsPerWeek);set('duration_minutes',90);set('teacher',teacher);set('room',room);set('status',status);set('note',note);set('updated_at',new Date());set('sessions_json',JSON.stringify(sessions));
  if(rowNo>0)sheet.getRange(rowNo,1,1,headers.length).setValues([row]); else sheet.getRange(sheet.getLastRow()+1,1,1,headers.length).setValues([row]);
  bumpDataVersion_('schedule');
  return {saved:true,schedule_id:id,sessions:sessions.map((x,i)=>({session_no:i+1,day:x.day,start_time:x.start_time,end_time:addMinutesToTime_(x.start_time,90),duration_minutes:90})),sessions_per_week:sessionsPerWeek,duration_minutes:90};
}

function deleteSchedule(params) {
  const id=String((params||{}).schedule_id||'').trim(); if(!id)throw new Error('Thiếu mã lịch học');
  const sheet=getSpreadsheet_().getSheetByName('Schedules'); if(!sheet)return{deleted:false};
  const all=sheet.getDataRange().getValues(), headers=all[0].map(h=>String(h||'').trim()), idIdx=headers.indexOf('schedule_id');
  const body=all.slice(1).filter(r=>String(r[idIdx]||'')!==id);
  if(body.length===all.length-1)return{deleted:false};
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).clearContent();
  if(body.length)sheet.getRange(2,1,body.length,headers.length).setValues(body);
  bumpDataVersion_('delete_schedule'); return{deleted:true};
}

function getPublicCenterInfo_() {
  const s=getSettingsMap_();
  const address=String(s.center_address||DEFAULT_CENTER_ADDRESS).trim()||DEFAULT_CENTER_ADDRESS;
  const phone=normalizeVietnamPhone(s.center_phone)||DEFAULT_CENTER_PHONE;
  const zalo=normalizeVietnamPhone(s.center_zalo)||DEFAULT_CENTER_ZALO;
  const mapsUrl=String(s.center_maps_url||'').trim() || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address));
  return { address:address, phone:phone, zalo:zalo, maps_url:mapsUrl };
}

function getPublicRegistrationInfo(params) {
  params=params||{};
  const boot=getPublicBootstrap(params);
  return {guide_text:boot.registration_guide_text,center:getPublicCenterInfo_()};
}

function saveRegistrationSettings(params) {
  params=params||{};
  const pairs={
    registration_guide_text:String(params.registration_guide_text||'').trim(),
    registration_notify_group:String(params.registration_notify_group||'').trim(),
    registration_notify_phone:normalizeVietnamPhone(params.registration_notify_phone)||DEFAULT_CENTER_ZALO
  };
  if (params.center_address !== undefined) pairs.center_address=String(params.center_address||'').trim()||DEFAULT_CENTER_ADDRESS;
  if (params.center_phone !== undefined) pairs.center_phone=normalizeVietnamPhone(params.center_phone)||DEFAULT_CENTER_PHONE;
  if (params.center_zalo !== undefined) pairs.center_zalo=normalizeVietnamPhone(params.center_zalo)||DEFAULT_CENTER_ZALO;
  if (params.center_maps_url !== undefined) pairs.center_maps_url=String(params.center_maps_url||'').trim()||DEFAULT_CENTER_MAPS_URL;
  upsertSettingsBatch_(pairs);
  bumpDataVersion_('registration_settings');
  return{updated:true};
}

function submitRegistration(params) {
  params=params||{};
  consumeGlobalRateLimit_('REGISTRATION',30,3600);
  const regRl=consumeRateLimit_('REGISTRATION',params,4,3600,'Quý phụ huynh đã gửi nhiều đăng ký. Vui lòng liên hệ Trung tâm qua 0972466347 nếu cần hỗ trợ thêm.');

  // Honeypot: người dùng thật không nhìn thấy/không nhập trường này.
  const honeypot=String(params.website||params.company_website||'').trim();
  if(honeypot){
    securityLog_('REGISTRATION','BOT_BLOCKED','honeypot',regRl.client_hash,'Honeypot có dữ liệu');
    return {accepted:true,blocked_bot:true};
  }

  const studentName=String(params.student_name||'').trim().slice(0,120);
  const grade=normalizeNumberString(params.grade);
  const phone=normalizeVietnamPhone(params.parent_phone);
  const note=String(params.note||'').trim().slice(0,600);
  if(studentName.length<2)throw new Error('Vui lòng nhập họ tên học sinh.');
  if(!['6','7','8','9','10','11','12'].includes(grade))throw new Error('Vui lòng chọn khối lớp hợp lệ từ 6 đến 12.');
  if(!/^0\d{9}$/.test(phone))throw new Error('Số điện thoại phụ huynh phải đủ 10 số.');

  const antiCache=CacheService.getScriptCache();
  const phoneKey='REG_PHONE_3MIN_'+sha256Hex_(phone).slice(0,36);
  const recent=antiCache.get(phoneKey);
  if(recent)return{reg_id:recent,queued:0,duplicate:1,recent_duplicate:true};

  const sheet=getSpreadsheet_().getSheetByName('Registrations');
  if(!sheet)throw new Error('Chưa có sheet Registrations. Hãy chạy setupSystemV415().');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h||'').trim()), row=new Array(headers.length).fill('');
  const id=generateId('REG'), set=(k,v)=>{const j=headers.indexOf(k);if(j>=0)row[j]=v;};
  set('reg_id',id);set('student_name',studentName);set('grade',grade);set('parent_phone',phone);set('note',note);set('status','NEW');set('created_at',new Date());
  sheet.getRange(sheet.getLastRow()+1,1,1,headers.length).setValues([row]);
  antiCache.put(phoneKey,id,180);
  bumpDataVersion_('registration');
  securityLog_('REGISTRATION','CREATED','reg:'+id,regRl.client_hash,'Đăng ký học mới từ cổng phụ huynh');

  const settings=getSettingsMap_(getSpreadsheet_(),true), group=String(settings.registration_notify_group||'').trim(), notifyPhone=normalizeVietnamPhone(settings.registration_notify_phone);
  const msg=`🔔 [ĐĂNG KÝ MỚI]\nPhụ huynh SĐT ${phone} vừa đăng ký cho HS ${studentName} - Khối ${grade}.\nGhi chú: ${note||'Không có'}\nMã đăng ký: ${id}`;
  let q={queued:0,duplicate:0};
  if(group) {
    q=queueZaloMessage('CLASS_REGISTRATION','Tuyển sinh','','CLASS_SESSION_REPORT','','',msg,group,{class_name:'TUYEN_SINH',sourceKey:`REGISTRATION|${id}`});
  } else if(notifyPhone) {
    if (notifyPhone === DEFAULT_CENTER_ZALO) q=queueZaloMessage(id,studentName,'','REGISTRATION_NOTICE','','',msg,'Cloud của tôi',{sourceKey:`REGISTRATION|${id}`});
    else q=queueZaloMessage(id,studentName,notifyPhone,'REGISTRATION_NOTICE','','',msg,'',{sourceKey:`REGISTRATION|${id}`});
  }
  return{reg_id:id,queued:q.queued||0,duplicate:q.duplicate||0,notify_target:group?'group':(notifyPhone===DEFAULT_CENTER_ZALO?'center_cloud':(notifyPhone?'phone':'none'))};
}

function getRegistrations(params) {
  params=params||{}; const status=String(params.status||'').trim().toUpperCase();
  return getSheetData('Registrations').filter(x=>!status||String(x.status||'').trim().toUpperCase()===status)
    .map(x=>Object.assign({},x,{created_at:formatDateTimeSafe(x.created_at)})).sort((a,b)=>String(b.reg_id||'').localeCompare(String(a.reg_id||'')));
}

function updateRegistrationStatus(params) {
  const id=String((params||{}).reg_id||'').trim(), status=String((params||{}).status||'').trim().toUpperCase();
  if(!id||!status)throw new Error('Thiếu mã đăng ký/trạng thái');
  const sheet=getSpreadsheet_().getSheetByName('Registrations'), data=sheet.getDataRange().getValues(), headers=data[0].map(h=>String(h||'').trim()), idIdx=headers.indexOf('reg_id'), stIdx=headers.indexOf('status');
  for(let i=1;i<data.length;i++)if(String(data[i][idIdx])===id){data[i][stIdx]=status;sheet.getRange(i+1,1,1,headers.length).setValues([data[i]]);bumpDataVersion_('registration_status');return{updated:true,status};}
  throw new Error('Không tìm thấy đăng ký.');
}

function approveRegistration(params) {
  params=params||{}; const id=String(params.reg_id||'').trim(), className=String(params.className||'').trim(); if(!id||!className)throw new Error('Thiếu mã đăng ký hoặc lớp chính thức.');
  const ss=getSpreadsheet_(), regSheet=ss.getSheetByName('Registrations'), regData=regSheet.getDataRange().getValues(), rh=regData[0].map(h=>String(h||'').trim()), rix=k=>rh.indexOf(k);
  let regRow=null, regRowNo=-1; for(let i=1;i<regData.length;i++)if(String(regData[i][rix('reg_id')])===id){regRow=regData[i].slice();regRowNo=i+1;break;}
  if(!regRow)throw new Error('Không tìm thấy đăng ký.'); if(String(regRow[rix('status')]||'').toUpperCase()==='APPROVED')throw new Error('Đăng ký này đã được duyệt.');
  const studentName=String(regRow[rix('student_name')]||'').trim(), grade=normalizeNumberString(regRow[rix('grade')]), phone=normalizeVietnamPhone(regRow[rix('parent_phone')]), note=String(regRow[rix('note')]||'').trim();
  const duplicate=getSheetData('Students',ss).find(s=>normalizeLookupText_(s.name)===normalizeLookupText_(studentName)&&normalizeVietnamPhone(s.parent_phone)===phone);
  if(duplicate)throw new Error('Học sinh này đã có trong danh sách chính thức.');
  const st=ss.getSheetByName('Students'), sh=st.getRange(1,1,1,st.getLastColumn()).getValues()[0].map(h=>String(h||'').trim()), row=new Array(sh.length).fill(''), sid='ST'+Date.now();
  const set=(k,v)=>{const j=sh.indexOf(k);if(j>=0)row[j]=v;}; const now=new Date();
  set('student_id',sid);set('name',studentName);set('grade',grade);set('class',className);set('parent_phone',phone);set('note',`Đăng ký online ${id}${note?' - '+note:''}`);set('created_at',now);set('enrollment_date',now);
  st.getRange(st.getLastRow()+1,1,1,sh.length).setValues([row]); regRow[rix('status')]='APPROVED'; regSheet.getRange(regRowNo,1,1,rh.length).setValues([regRow]);
  bumpDataVersion_('approve_registration'); return{approved:true,student_id:sid};
}


// --- V4.9: KIỂM TRA TRỰC TUYẾN CÔNG KHAI, LAZY-LOAD THEO KHỐI + LOẠI ---
function normalizeExamGrade_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/\s+/g, ' ');
  if (upper === 'TS10' || /TUYEN\s*SINH\s*10/.test(upper)) return '9';
  if (upper === 'TNTHPT' || /TOT\s*NGHIEP\s*THPT/.test(upper)) return '12';
  const m = upper.match(/(?:TOAN\s*)?(6|7|8|9|10|11|12)(?:\D|$)/);
  return m ? m[1] : '';
}

function splitExamCodes_(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  // Nếu ô chứa một URL đầy đủ thì giữ nguyên URL, không tách theo dấu phẩy trong query string.
  if (/^https?:\/\//i.test(raw) && !/[;\n]/.test(raw)) return [raw];
  const seen = new Set();
  return raw.split(/[,;\n]+/).map(x => String(x || '').trim()).filter(x => {
    if (!x || seen.has(x)) return false;
    seen.add(x); return true;
  });
}

function getExamLaunchBase_() {
  const settings = getSettingsMap_(getSpreadsheet_(), false);
  const configured = String(settings.exam_redirect_base_url || '').trim();
  const fallback = 'https://anphuceducation.netlify.app/student';
  const value = configured || fallback;
  return /^https:\/\//i.test(value) ? value : '';
}

function getPublicExams(params) {
  params = params || {};
  consumeGlobalRateLimit_('PUBLIC_EXAMS', 240, 60);
  consumeRateLimit_('PUBLIC_EXAMS', params, 90, 300, 'Quý phụ huynh thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.');

  const grade = normalizeNumberString(params.grade || '');
  if (!['6','7','8','9','10','11','12'].includes(grade)) throw new Error('Vui lòng chọn khối từ 6 đến 12.');
  const type = String(params.type || 'regular').trim().toLowerCase();
  if (!['regular','periodic'].includes(type)) throw new Error('Loại bài kiểm tra không hợp lệ.');

  const cacheParams = {grade:grade, type:type, version:getDataVersion_()};
  const cached = cacheGetJson_('public_exams_v415', cacheParams);
  if (cached) return cached;

  const ss = getSpreadsheet_();
  const launchBase = getExamLaunchBase_();
  let rows = [];

  if (type === 'regular') {
    const source = getSheetData('ExamRegular', ss);
    const merged = new Map();
    source.forEach((x, index) => {
      const g = normalizeExamGrade_(x.grade || x['Lớp'] || x['Khối'] || '');
      if (g !== grade) return;
      const chapter = String(x.chapter || x['Chương'] || '').trim();
      const lesson = String(x.lesson || x['Bài Học'] || x['Bài học'] || '').trim();
      if (!lesson) return;
      const key = chapter + '\u0001' + lesson;
      if (!merged.has(key)) merged.set(key, {chapter:chapter, lesson:lesson, codes:[], _order:index});
      const item = merged.get(key), seen = new Set(item.codes);
      splitExamCodes_(x.code || x['LINK'] || '').forEach(c => { if (!seen.has(c)) { item.codes.push(c); seen.add(c); } });
    });
    rows = Array.from(merged.values()).sort((a,b)=>a._order-b._order).map(x=>({chapter:x.chapter, lesson:x.lesson, codes:x.codes}));
  } else {
    const source = getSheetData('ExamPeriodic', ss);
    const merged = new Map();
    source.forEach((x, index) => {
      const rawGrade = x.grade || x['Khối (Grade)'] || x['Khối'] || '';
      const g = normalizeExamGrade_(rawGrade);
      if (g !== grade) return;
      const year = String(x.year || x['Năm học (Year)'] || '').trim();
      const category = String(x.category || x['Kỳ thi (Category)'] || '').trim();
      const displayName = String(x.display_name || x.displayName || x['Tên hiển thị (DisplayName)'] || '').trim();
      if (!displayName) return;
      const key = year + '\u0001' + category + '\u0001' + displayName;
      if (!merged.has(key)) merged.set(key, {year:year, category:category, display_name:displayName, codes:[], _order:index});
      const item = merged.get(key), seen = new Set(item.codes);
      splitExamCodes_(x.code || x['Mã đề / Link (Code)'] || '').forEach(c => { if (!seen.has(c)) { item.codes.push(c); seen.add(c); } });
    });
    rows = Array.from(merged.values()).sort((a,b)=>a._order-b._order).map(x=>({year:x.year, category:x.category, display_name:x.display_name, codes:x.codes}));
  }

  const result = {grade:grade, type:type, rows:rows, launch_base:launchBase, cached_for_seconds:300};
  cachePutJson_('public_exams_v415', cacheParams, result, 300);
  return result;
}


// --- V4.11: NHẬP DỮ LIỆU KIỂM TRA TỪ EXCEL ĐÃ PARSE Ở TRÌNH DUYỆT ---
function cleanExamText_(value, maxLen) {
  return String(value == null ? '' : value).trim().slice(0, maxLen || 1000);
}

function replaceSheetBodyBatch_(sheetName, headers, rows) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Chưa có sheet ' + sheetName + '. Hãy chạy setupSystemV411().');
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2,1,lastRow-1,Math.max(headers.length,sheet.getLastColumn())).clearContent();
  if (rows.length) sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  return rows.length;
}

function importExamWorkbook(params) {
  params = params || {};
  const regular = Array.isArray(params.regular) ? params.regular : [];
  const periodic = Array.isArray(params.periodic) ? params.periodic : [];
  const history = Array.isArray(params.history) ? params.history : [];
  if (regular.length > 5000 || periodic.length > 5000 || history.length > 10000) throw new Error('File Excel quá lớn để nhập một lần.');
  if (!regular.length && !periodic.length) throw new Error('Không tìm thấy dữ liệu ExamRegular/ExamPeriodic trong file Excel.');

  const regRows = regular.map(x => [
    cleanExamText_(x.grade,80), cleanExamText_(x.chapter,300), cleanExamText_(x.lesson,500), cleanExamText_(x.code,2000)
  ]).filter(r => r[0] && r[2]);
  const perRows = periodic.map(x => [
    cleanExamText_(x.grade,80), cleanExamText_(x.year,50), cleanExamText_(x.category,200), cleanExamText_(x.display_name,500), cleanExamText_(x.code,2000)
  ]).filter(r => r[0] && r[3]);
  const hisRows = history.map(x => [
    cleanExamText_(x.timestamp,100), cleanExamText_(x.student_name,200), cleanExamText_(x.grade,80), cleanExamText_(x.exam_name,500)
  ]).filter(r => r.some(Boolean));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const regularCount = replaceSheetBodyBatch_('ExamRegular',['grade','chapter','lesson','code'],regRows);
    const periodicCount = replaceSheetBodyBatch_('ExamPeriodic',['grade','year','category','display_name','code'],perRows);
    const historyCount = replaceSheetBodyBatch_('ExamHistory',['timestamp','student_name','grade','exam_name'],hisRows);
    bumpDataVersion_('import_exam_workbook');
    securityLog_('EXAM_IMPORT','SUCCESS','V4.11','admin',`ExamRegular=${regularCount}; ExamPeriodic=${periodicCount}; ExamHistory=${historyCount}`);
    return {imported:true, regular:regularCount, periodic:periodicCount, history:historyCount};
  } finally { lock.releaseLock(); }
}

function saveExamSettings(params) {
  params = params || {};
  const url = String(params.exam_redirect_base_url || '').trim();
  if (url && !/^https:\/\//i.test(url)) throw new Error('Link trang kiểm tra phải bắt đầu bằng https://');
  upsertSettingsBatch_({ exam_redirect_base_url:url });
  bumpDataVersion_('exam_settings');
  return {updated:true, exam_redirect_base_url:url};
}


// --- V4.15: QUẢN LÝ DỮ LIỆU KIỂM TRA TRỰC TIẾP TRÊN GOOGLE SHEET ---
function getExamAdminRows(params) {
  params=params||{};
  const type=String(params.type||'regular').toLowerCase()==='periodic'?'periodic':'regular';
  const grade=normalizeNumberString(params.grade||'');
  const sheetName=type==='regular'?'ExamRegular':'ExamPeriodic';
  const sheet=getSpreadsheet_().getSheetByName(sheetName);
  if(!sheet)return {type:type,grade:grade,rows:[]};
  const values=sheet.getDataRange().getValues();
  if(values.length<=1)return {type:type,grade:grade,rows:[]};
  const headers=values[0].map(x=>String(x||'').trim());
  const rows=[];
  for(let i=1;i<values.length;i++){
    const obj={_row:i+1}; headers.forEach((h,j)=>obj[h]=values[i][j]);
    if(grade && normalizeExamGrade_(obj.grade)!==grade)continue;
    rows.push(obj);
  }
  return {type:type,grade:grade,rows:rows.slice(0,1000)};
}

function saveExamEntry(params) {
  params=params||{};
  const type=String(params.type||'regular').toLowerCase()==='periodic'?'periodic':'regular';
  const sheetName=type==='regular'?'ExamRegular':'ExamPeriodic';
  const sheet=getSpreadsheet_().getSheetByName(sheetName);
  if(!sheet)throw new Error('Chưa có sheet '+sheetName+'. Hãy chạy setupSystemV415().');
  const grade=normalizeNumberString(params.grade||'');
  if(!['6','7','8','9','10','11','12'].includes(grade))throw new Error('Khối không hợp lệ.');
  const code=cleanExamText_(params.code,2000);
  let row;
  if(type==='regular'){
    const chapter=cleanExamText_(params.chapter,300), lesson=cleanExamText_(params.lesson,500);
    if(!lesson)throw new Error('Vui lòng nhập tên bài/chuyên đề.');
    row=[grade,chapter,lesson,code];
  }else{
    const year=cleanExamText_(params.year,50), category=cleanExamText_(params.category,200), displayName=cleanExamText_(params.display_name,500);
    if(!displayName)throw new Error('Vui lòng nhập tên đề hiển thị.');
    row=[grade,year,category,displayName,code];
  }
  const rowNo=Number(params.row_no||0);
  if(rowNo>=2 && rowNo<=sheet.getLastRow())sheet.getRange(rowNo,1,1,row.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
  bumpDataVersion_('save_exam_entry');
  securityLog_('EXAM_ENTRY','SAVED',sheetName,'admin','row='+(rowNo||'new')+', grade='+grade);
  return {saved:true,type:type,row_no:rowNo||sheet.getLastRow()};
}

function deleteExamEntry(params) {
  params=params||{};
  const type=String(params.type||'regular').toLowerCase()==='periodic'?'periodic':'regular';
  const sheetName=type==='regular'?'ExamRegular':'ExamPeriodic';
  const rowNo=Number(params.row_no||0), sheet=getSpreadsheet_().getSheetByName(sheetName);
  if(!sheet||rowNo<2||rowNo>sheet.getLastRow())throw new Error('Dòng dữ liệu không hợp lệ.');
  sheet.deleteRow(rowNo);
  bumpDataVersion_('delete_exam_entry');
  securityLog_('EXAM_ENTRY','DELETED',sheetName,'admin','row='+rowNo);
  return {deleted:true};
}

function zaloKeyFingerprint_(key){return sha256Hex_(String(key||'')).slice(0,12);}
function getZaloDiagnostics(params){
  const props=PropertiesService.getScriptProperties();
  const base=String(props.getProperty('ZALO_GATEWAY_URL')||'').trim().replace(/\/+$/,'');
  const out={gateway_url:base,gateway_reachable:false,http_status:0,gateway_version:'',gateway_status:'',browser_alive:false,message:''};
  if(!base){out.message='Chưa cấu hình ZALO_GATEWAY_URL.';return out;}
  try{
    const resp=UrlFetchApp.fetch(base+'/health',{muteHttpExceptions:true,followRedirects:true,headers:zaloGatewayHeadersV4291_()});
    out.http_status=resp.getResponseCode();
    const txt=resp.getContentText(); let j={}; try{j=JSON.parse(txt);}catch(e){}
    out.gateway_reachable=out.http_status>=200&&out.http_status<500;
    out.gateway_version=String(j.version||'');
    out.gateway_status=String(j.status||'');
    out.browser_alive=j.browser_alive===true;
    out.zalo_authenticated=j.zalo_authenticated===true;
    out.media_ready=j.score_media_ready===true;
    const handlers=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
    out.parent_queue_trigger=handlers.includes('processZaloQueue');
    out.media_queue_trigger=handlers.includes('scoreMediaProcessPending');
    try{const qs=scoreMediaItems_(SM_QUEUE_SHEET).map(x=>String(x.data.status||'').toUpperCase());
      out.media_queue_status={queued:qs.filter(s=>s==='QUEUED').length,unknown:qs.filter(s=>s==='UNKNOWN'||s==='PARTIAL').length,sent:qs.filter(s=>s==='SENT').length};
    }catch(_){}
    out.message=out.gateway_reachable
      ? (out.zalo_authenticated?'Đã nhận diện giao diện Zalo đăng nhập.':'Gateway phản hồi nhưng chưa xác minh được Zalo đăng nhập; hãy kiểm tra Chrome/QR.')
      : 'Không kết nối được Zalo Gateway.';
  }catch(e){out.message='Không kết nối được Zalo Gateway: '+e.message;}
  return out;
}

function saveZaloGatewayConfig(params){
  params=params||{};
  let url=String(params.gateway_url||'').trim().replace(/\/+$/,'');
  if(url && !/^https:\/\//i.test(url))throw new Error('Gateway URL phải bắt đầu bằng https://');
  PropertiesService.getScriptProperties().setProperty('ZALO_GATEWAY_URL',url);
  return {updated:true,gateway_url:url};
}

function resetZaloSecurityV415(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  securityLog_('ZALO_SECURITY','RESET','V4.15','admin','Đồng bộ lại API key/wake key theo bộ V4.15');
  return {updated:true,key_fingerprint:zaloKeyFingerprint_(DEFAULT_ZALO_GATEWAY_API_KEY)};
}

function resetZaloSecurityV416(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  securityLog_('ZALO_SECURITY','RESET','V4.17','admin','Gateway auth header + JSON body fallback');
  return {updated:true,key_fingerprint:zaloKeyFingerprint_(DEFAULT_ZALO_GATEWAY_API_KEY),version:'V4.18'};
}

function normalizeLookupText_(value) {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/\s+/g,' ').trim().toLowerCase();
}

function parentLookupTokenKey_(token) { return 'AP45_PARENT_LOOKUP_' + sha256Hex_(String(token || '')).slice(0, 40); }

function parentNameMatchScore_(studentName, query) {
  const full=normalizeLookupText_(studentName), q=normalizeLookupText_(query);
  if (!full || !q) return -1;
  if (full===q) return 1000;
  if (full.startsWith(q)) return 900;
  if (full.endsWith(' '+q)) return 880;
  if (full.includes(q)) return 820;
  const compactFull=full.replace(/\s+/g,''), compactQ=q.replace(/\s+/g,'');
  if (compactQ.length>=3 && compactFull.includes(compactQ)) return 760;
  const fullTokens=full.split(' ').filter(Boolean), qTokens=q.split(' ').filter(Boolean);
  if (qTokens.length && qTokens.every(token=>fullTokens.some(part=>part===token||part.startsWith(token)||part.includes(token)))) return 700 + Math.min(90,qTokens.length*15);
  return -1;
}

function getPublicStudentSearchIndex_() {
  const namespace='parent_lookup_index_v414';
  const cached=cacheGetJson_(namespace,{});
  if(cached && Array.isArray(cached)) return cached;
  const sheet=getSpreadsheet_().getSheetByName('Students');
  if(!sheet || sheet.getLastRow()<=1) return [];
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(h=>String(h||'').trim());
  const col=key=>headers.indexOf(key);
  const needed=['student_id','name','grade','class','parent_phone'];
  if(needed.some(k=>col(k)<0)) return [];
  const values=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues();
  const rows=values.map(r=>({
    student_id:String(r[col('student_id')]||''),
    name:String(r[col('name')]||''),
    grade:String(r[col('grade')]||''),
    class:String(r[col('class')]||''),
    parent_phone:String(r[col('parent_phone')]||'')
  })).filter(x=>x.student_id&&x.name);
  cachePutJson_(namespace,{},rows,600);
  return rows;
}

function maskVietnamPhone_(value) {
  const p=normalizeVietnamPhone(value);
  if(!/^0\d{9}$/.test(p))return '';
  return p.slice(0,3)+'***'+p.slice(-4);
}

function publicFindStudentByName(params) {
  params=params||{};
  consumeGlobalRateLimit_('PARENT_SEARCH',150,60);
  consumeRateLimit_('PARENT_SEARCH',params,20,600,'Quý phụ huynh đã tra cứu nhiều lần. Vui lòng chờ ít phút hoặc liên hệ 0972466347 để được hỗ trợ.');
  const raw=String(params.student_name||'').trim();
  if(raw.length>100)throw new Error('Tên tra cứu quá dài.');
  const query=normalizeLookupText_(raw);
  if(query.length<2)throw new Error('Vui lòng nhập ít nhất 2 ký tự tên học sinh. Có thể nhập một phần họ tên.');
  return getPublicStudentSearchIndex_()
    .map(s=>({student:s,score:parentNameMatchScore_(s.name,query)}))
    .filter(x=>x.score>=0)
    .sort((a,b)=>b.score-a.score||String(a.student.name||'').localeCompare(String(b.student.name||''),'vi'))
    .slice(0,8)
    .map(x=>({
      student_id:String(x.student.student_id||''),
      name:String(x.student.name||''),
      class_info:`K${x.student.grade}-${x.student.class}`,
      masked_phone:maskVietnamPhone_(x.student.parent_phone)
    }));
}

function findParentStudentCandidates(params) { return publicFindStudentByName(params); }

function buildVerifiedParentStudent_(student,startYear) {
  const ss=getSpreadsheet_(), tuition=getSheetData('Tuition',ss), attendance=getSheetData('Attendance',ss), sessions=getSheetData('ClassSessions',ss), scores=getSheetData('Scores',ss), settings=getSettingsMap_(ss), periods=schoolYearPeriods_(startYear);
  const situation=getStudentSituationReport({student_id:student.student_id,periods:periods.map(p=>p.key).join(',')},{ss,students:[student],tuitionData:tuition,attendanceData:attendance,sessionData:sessions,scoresData:scores,settings})[0]||{};
  const monthRows=periods.map(p=>{
    const lastDay=new Date(Number(p.year),Number(p.month),0).getDate(), upTo=`${p.year}-${String(p.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const x=getStudentMonthAttendanceSummary_(student,p.year,p.month,upTo,attendance,sessions);
    const absent=Number(x.permitted||0)+Number(x.unexcused||0)+Number(x.legacy_absent||0);
    return{year:p.year,month:p.month,total_sessions:Number(x.total_sessions||0),absent,permitted:Number(x.permitted||0),unexcused:Number(x.unexcused||0)};
  }).filter(x=>x.total_sessions>0||x.absent>0);
  const startKey=`${startYear}-09-01`,endKey=`${startYear+1}-08-31`;
  const studentScores=scores.filter(x=>String(x.student_id)===String(student.student_id)).map(x=>{const d=parseDateHelper(x.test_date);return{d,x};}).filter(z=>z.d&&z.d.dateStr>=startKey&&z.d.dateStr<=endKey)
    .map(z=>({test_date:z.d.dateStr,test_type:z.x.test_type||'',test_type_label:scoreTypeLabel_(z.x.test_type),test_title:z.x.test_title||'',score:z.x.score,comment:z.x.comment||''})).sort((a,b)=>b.test_date.localeCompare(a.test_date));
  const numericScores=studentScores.map(x=>Number(x.score)).filter(Number.isFinite);
  const averageScore=numericScores.length?Math.round((numericScores.reduce((a,b)=>a+b,0)/numericScores.length)*100)/100:null;
  const latestScore=studentScores.length?studentScores[0]:null;
  const studentClassNorm=normalizeClassName(student.class);
  const schedule=getSheetData('Schedules',ss).filter(x=>{const sc=normalizeClassName(x.class);return normalizeNumberString(x.grade)===normalizeNumberString(student.grade)&&(sc===studentClassNorm||sc.startsWith(studentClassNorm+' ')||sc.startsWith(studentClassNorm+'('));})
    .map(normalizeScheduleRecord_).map(x=>({class_info:x.class_info||'',sessions:(x.sessions||[]).map(b=>({day:b.day||'',start_time:b.start_time||'',end_time:b.end_time||''})),sessions_per_week:Number(x.sessions_per_week||0),duration_minutes:90,duration_label:'1 giờ 30 phút',teacher:x.teacher||'',room:x.room||'',status:x.status||''}));
  const enrolled=parseDateHelper(student.enrollment_date||student.created_at);
  return{
    student_id:student.student_id,
    name:student.name,
    grade:student.grade,
    class:student.class,
    class_info:`K${student.grade}-${student.class}`,
    enrollment_date:enrolled?enrolled.dateStr:'',
    school_year:`${startYear}-${startYear+1}`,
    schedule,
    attendance_months:monthRows,
    attendance:{
      total_sessions:Number(situation.total_sessions||0),
      present:Number(situation.present_count||0),
      permitted_absence:Number(situation.permitted_absence_count||0),
      unexcused_absence:Number(situation.unexcused_absence_count||0),
      total_absent:Number(situation.permitted_absence_count||0)+Number(situation.unexcused_absence_count||0)+Number(situation.legacy_absence_count||0)
    },
    tuition:{paid:situation.paid_periods||[],unpaid:situation.unpaid_periods||[],paid_total:Number(situation.paid_total||0),unpaid_total:Number(situation.unpaid_total||0)},
    scores:studentScores,
    score_summary:{average:averageScore,latest:latestScore},
    graded_exams:(typeof getParentApprovedExamSummaries_ === 'function' ? getParentApprovedExamSummaries_(student.student_id) : [])
  };
}

function publicVerifyStudentPhone(params) {
  params=params||{};
  consumeGlobalRateLimit_('PARENT_VERIFY',120,60);
  const rl=consumeRateLimit_('PARENT_VERIFY',params,12,600,'Có quá nhiều lần xác thực. Vui lòng chờ ít phút hoặc liên hệ 0972466347.');
  const studentId=String(params.student_id||'').trim();
  const phone=normalizeVietnamPhone(params.parent_phone);
  if(!studentId)throw new Error('Thiếu học sinh cần xác thực.');
  if(!/^0\d{9}$/.test(phone))throw new Error('Vui lòng nhập đúng số điện thoại 10 số đã đăng ký với Trung tâm.');

  const cache=CacheService.getScriptCache();
  const failKey='FAIL_LOOKUP_V425_'+studentId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
  let failCount=Number(cache.get(failKey)||0);
  if(failCount>=5)throw new Error('Quý phụ huynh đã nhập sai SĐT quá 5 lần. Vui lòng thử lại sau 10 phút hoặc liên hệ trực tiếp giáo viên.');

  const student=getSheetData('Students').find(s=>String(s.student_id)===studentId);
  if(!student)throw new Error('Không tìm thấy học sinh. Vui lòng tra cứu lại.');
  if(normalizeVietnamPhone(student.parent_phone)!==phone){
    failCount+=1; cache.put(failKey,String(failCount),600);
    securityLog_('PARENT_VERIFY','FAILED','student:'+sha256Hex_(studentId).slice(0,12),rl.client_hash,'SĐT không khớp; lần '+failCount+'/5');
    if(failCount>=5)throw new Error('Quý phụ huynh đã nhập sai SĐT quá 5 lần. Vui lòng thử lại sau 10 phút hoặc liên hệ trực tiếp giáo viên.');
    throw new Error('Số điện thoại không khớp với hồ sơ đã đăng ký tại Trung tâm.');
  }
  cache.remove(failKey);

  const now=new Date(),startYear=Number(params.school_year_start||(now.getMonth()+1>=9?now.getFullYear():now.getFullYear()-1));
  const cacheParams={id:studentId,school_year_start:startYear};
  const cached=cacheGetJson_('parent_card',cacheParams);
  if(cached){
    securityLog_('PARENT_VERIFY','SUCCESS','student:'+sha256Hex_(studentId).slice(0,12),rl.client_hash,'Xác thực thành công (parent_card cache)');
    if(typeof apLmsParentSummary_==='function')cached.lms=apLmsParentSummary_(studentId);
    return cached;
  }
  const result=buildVerifiedParentStudent_(student,startYear);
  if(typeof apLmsParentSummary_==='function')result.lms=apLmsParentSummary_(studentId);
  try{delete result.student_id;}catch(e){}
  cachePutJson_('parent_card',cacheParams,result,180);
  securityLog_('PARENT_VERIFY','SUCCESS','student:'+sha256Hex_(studentId).slice(0,12),rl.client_hash,'Xác thực phụ huynh thành công');
  return result;
}

function verifyParentStudent(params) {
  // Tương thích frontend cũ: nếu có lookup_token thì giải mã token trước.
  params=params||{};
  if(!params.student_id && params.lookup_token){
    const sid=CacheService.getScriptCache().get(parentLookupTokenKey_(String(params.lookup_token||'')));
    if(sid)params.student_id=sid;
  }
  return publicVerifyStudentPhone(params);
}

function paginateStudents_(students, params) {
  params = params || {};
  const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize || params.page_size || 40, 10) || 40));
  const total = students.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, parseInt(params.page || 1, 10) || 1));
  const start = (page - 1) * pageSize;
  return { items: students.slice(start, start + pageSize), total, page, page_size: pageSize, total_pages: totalPages };
}

function getStudentsPage(params) {
  params = params || {};
  const cacheParams = {
    grade: params.grade || '', className: params.className || '', term: String(params.term || '').trim().toLowerCase(),
    page: parseInt(params.page || 1, 10) || 1, pageSize: parseInt(params.pageSize || params.page_size || 40, 10) || 40
  };
  const cached = cacheGetJson_('students_page', cacheParams);
  if (cached) return cached;
  const rows = filterStudents_(getSheetData('Students'), cacheParams);
  const result = paginateStudents_(rows, cacheParams);
  cachePutJson_('students_page', cacheParams, result, 60);
  return result;
}

function getInitialData(params) {
  params = params || {};
  const cacheParams = {
    month: normalizeNumberString(params.month || (new Date().getMonth() + 1)),
    year: normalizeNumberString(params.year || new Date().getFullYear()),
    page: parseInt(params.page || 1, 10) || 1,
    pageSize: parseInt(params.pageSize || params.page_size || 40, 10) || 40
  };
  const cached = cacheGetJson_('initial', cacheParams);
  if (cached) return cached;

  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const allStudents = filterStudents_(getSheetData('Students', ss), {});
  const studentPage = paginateStudents_(allStudents, cacheParams);
  const ids = new Set(allStudents.map(s => String(s.student_id)));
  const paid = new Set();
  getSheetData('Tuition', ss).forEach(t => {
    if (ids.has(String(t.student_id)) && normalizeNumberString(t.month) === cacheParams.month && normalizeNumberString(t.year) === cacheParams.year) paid.add(String(t.student_id));
  });
  const result = {
    settings,
    students: studentPage.items,
    students_page: studentPage,
    dashboard: { total_students: allStudents.length, paid_count: paid.size, unpaid_count: Math.max(0, allStudents.length - paid.size) }
  };
  cachePutJson_('initial', cacheParams, result, 45);
  return result;
}

// --- MODULE HỌC SINH ---
function filterStudents_(students, params) {
  params = params || {};
  let result = (students || []).slice();
  if (params.grade) result = result.filter(s => normalizeNumberString(s.grade) === normalizeNumberString(params.grade));
  if (params.className) result = result.filter(s => normalizeClassName(s.class) === normalizeClassName(params.className));
  if (params.term) {
    const term = String(params.term).trim().toLowerCase();
    result = result.filter(s =>
      String(s.name || '').toLowerCase().includes(term) ||
      String(s.parent_phone || '').toLowerCase().includes(term) ||
      String(s.zalo_name || '').toLowerCase().includes(term) ||
      String(s.email || '').toLowerCase().includes(term)
    );
  }
  result.sort((a, b) => {
    const gradeDiff = (parseInt(a.grade, 10) || 0) - (parseInt(b.grade, 10) || 0);
    if (gradeDiff) return gradeDiff;
    const classDiff = normalizeClassName(a.class).localeCompare(normalizeClassName(b.class), 'vi');
    if (classDiff) return classDiff;
    const aParts = String(a.name || '').trim().split(/\s+/); const bParts = String(b.name || '').trim().split(/\s+/);
    const aFirst = (aParts[aParts.length - 1] || '').toLowerCase(); const bFirst = (bParts[bParts.length - 1] || '').toLowerCase();
    const firstDiff = aFirst.localeCompare(bFirst, 'vi');
    return firstDiff || String(a.name || '').localeCompare(String(b.name || ''), 'vi');
  });
  return result;
}
function getStudents(params) {
  return filterStudents_(getSheetData('Students'), params || {});
}

function addStudent(params) {
  const sheet = getSpreadsheet_().getSheetByName('Students');
  const studentId = 'ST' + new Date().getTime();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('zalo_name') === -1 || headers.indexOf('enrollment_date') === -1) throw new Error('Cấu trúc Students chưa đầy đủ. Hãy chạy setupSystemV47() một lần.');
  const row = new Array(headers.length).fill('');
  const set = (key, value) => { const idx = headers.indexOf(key); if (idx >= 0) row[idx] = value; };
  const now = new Date();
  set('student_id', studentId); set('name', params.name); set('grade', params.grade); set('class', params.className);
  set('parent_phone', params.parent_phone); set('email', params.email); set('note', params.note); set('created_at', now);
  set('custom_fee', params.custom_fee || ''); set('zalo_name', params.zalo_name || ''); set('enrollment_date', params.enrollment_date || now);
  sheet.appendRow(row);
  bumpDataVersion_('add_student');
  return { student_id: studentId };
}
function updateStudent(params) {
  const sheet = getSpreadsheet_().getSheetByName('Students'); const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][headers.indexOf('student_id')]) === String(params.id)) {
      const updates = {
        name: params.name, grade: params.grade, class: params.className, parent_phone: params.parent_phone,
        email: params.email, note: params.note, custom_fee: params.custom_fee || '', zalo_name: params.zalo_name || '',
        enrollment_date: params.enrollment_date || data[i][headers.indexOf('enrollment_date')] || data[i][headers.indexOf('created_at')] || new Date()
      };
      Object.keys(updates).forEach(key => { const idx = headers.indexOf(key); if (idx >= 0) data[i][idx] = updates[key]; });
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([data[i]]);
      bumpDataVersion_('update_student');
      return { updated: true };
    }
  }
  throw new Error("Không tìm thấy");
}
function deleteStudent(params) {
  const sheet = getSpreadsheet_().getSheetByName('Students'); const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(params.id)) { sheet.deleteRow(i + 1); bumpDataVersion_('delete_student'); return { deleted: true }; } }
  throw new Error("Không tìm thấy");
}

// --- HÀNG ĐỢI ZALO (QUEUE) ---
function ensureMessageLogColumns_() {
  const sheet = getSpreadsheet_().getSheetByName('MessageLogs');
  if (!sheet) throw new Error('Sheet MessageLogs không tồn tại. Hãy chạy setupSystemV4().');
  const required = ['log_id','student_id','name','phone','message_type','month','year','message','status','http_status','gateway_response','created_at','zalo_name','class_name','dedupe_key','request_id','attempt_count','last_attempt_at','processed_at','recipient_type','group_name','next_retry_at'];
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(h => String(h || '').trim());
  required.forEach(header => {
    if (headers.indexOf(header) === -1) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(header).setFontWeight('bold').setBackground('#e3f2fd');
      headers.push(header);
    }
  });
  return { sheet, headers };
}

function hashText_(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

// V4.28: explicit persisted recipient type; legacy fallback only for old rows.
function zaloIsGroupItemV428_(item) {
  item = item || {};
  const explicit = String(item.recipient_type || item.recipientType || '').trim().toLowerCase();
  if (explicit === 'group') return true;
  if (explicit === 'parent' || explicit === 'personal') return false;
  if (String(item.group_name || item.groupName || '').trim()) return true;
  const sid = String(item.student_id || '').trim().toUpperCase();
  const typ = String(item.type || item.message_type || '').trim().toUpperCase();
  return sid.startsWith('CLASS_') || typ === 'CLASS_SESSION_REPORT';
}

function buildMessageDedupeKey_(item) {
  item = item || {};
  const explicit = String(item.dedupe_key || item.sourceKey || item.source_key || '').trim();
  if (explicit) return explicit;
  const isGroup = zaloIsGroupItemV428_(item);
  const recipient = isGroup ? ('group:' + String(item.group_name || item.groupName || item.zaloName || item.zalo_name || '').trim().toLowerCase()) : (normalizeVietnamPhone(item.phone) || ('zalo:' + String(item.zaloName || item.zalo_name || '').trim().toLowerCase()));
  const raw = [item.student_id || '', recipient, item.type || item.message_type || '', item.month || '', item.year || '', item.msg || item.message || ''].join('|');
  return 'MSG|' + hashText_(raw);
}

function queueZaloMessagesDetailed_(items) {
  if (!items || !items.length) return { queued: 0, duplicate: 0, details: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const meta = ensureMessageLogColumns_();
    const sheet = meta.sheet; const headers = meta.headers;
    const idx = key => headers.indexOf(key);
    const lastRow = sheet.getLastRow();
    const existingKeys = new Set();

    // Chỉ đọc phần log gần nhất để giữ tốc độ tốt khi sheet lớn.
    if (lastRow > 1 && idx('dedupe_key') >= 0) {
      const startRow = Math.max(2, lastRow - 1499);
      const count = lastRow - startRow + 1;
      const keyVals = sheet.getRange(startRow, idx('dedupe_key') + 1, count, 1).getValues();
      const statusVals = sheet.getRange(startRow, idx('status') + 1, count, 1).getValues();
      for (let i = 0; i < count; i++) {
        const key = String(keyVals[i][0] || '').trim();
        const status = String(statusVals[i][0] || '').trim().toUpperCase();
        if (key && ['PENDING','WAITING_SERVER','PROCESSING','SUCCESS','DUPLICATE_SKIPPED','FAILED_GROUP'].includes(status)) existingKeys.add(key);
      }
    }

    const rows = []; const details = []; let duplicate = 0;
    items.forEach(item => {
      const dedupeKey = buildMessageDedupeKey_(item);
      if (existingKeys.has(dedupeKey)) {
        duplicate++;
        details.push({ student_id: item.student_id || '', status: 'DUPLICATE', dedupe_key: dedupeKey });
        return;
      }
      existingKeys.add(dedupeKey); // chặn trùng ngay trong cùng một batch
      const row = new Array(headers.length).fill('');
      const set = (key, value) => { const j = idx(key); if (j >= 0) row[j] = value; };
      const isGroup = zaloIsGroupItemV428_(item);
      const groupName = isGroup ? String(item.group_name || item.groupName || item.zaloName || item.zalo_name || '').trim() : '';
      const logId = generateId('LOG');
      set('log_id', logId); set('student_id', item.student_id || ''); set('name', item.name || ''); set('phone', item.phone || '');
      set('message_type', item.type || ''); set('month', item.month || ''); set('year', item.year || ''); set('message', item.msg || ''); set('status', 'PENDING');
      set('created_at', new Date()); set('zalo_name', item.zaloName || item.zalo_name || ''); set('class_name', item.class_name || item.className || '');
      set('dedupe_key', dedupeKey); set('request_id', item.request_id || dedupeKey); set('attempt_count', 0);
      set('recipient_type', isGroup ? 'group' : 'parent'); set('group_name', groupName);
      rows.push(row);
      details.push({ student_id: item.student_id || '', status: 'QUEUED', dedupe_key: dedupeKey, log_id: logId });
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    return { queued: rows.length, duplicate, details };
  } finally {
    lock.releaseLock();
  }
}

function queueZaloMessages(items) { return queueZaloMessagesDetailed_(items).queued; }
function queueZaloMessage(student_id, name, phone, type, month, year, msg, zaloName, extra) {
  const item = Object.assign({ student_id, name, phone, type, month, year, msg, zaloName }, extra || {});
  return queueZaloMessagesDetailed_([item]);
}

// V4.28.1: resilient Zalo queue worker; ONE message claimed at a time.
// No other message becomes PROCESSING until its actual sending begins.
// When an execution terminates unexpectedly, exactly one in-flight item needs manual review.
function processZaloQueue() {
  const started = Date.now();
  const maxRunMs = 105000;            // much shorter than Apps Script execution ceiling
  const maxItems = 5;
  const leaseName = 'ZALO_WORKER_LEASE_V4281';
  const groupBufferName = 'ZALO_GROUP_ERRORS_V4281';
  const leaseId = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  const guard = LockService.getScriptLock();
  if (!guard.tryLock(3000)) return {success:true,busy:true,processed:0,reason:'queue_lock_busy'};
  try {
    const old = JSON.parse(props.getProperty(leaseName) || '{}');
    if (Number(old.until || 0) > Date.now()) {
      return {success:true,busy:true,processed:0,reason:'worker_active',lease_until:old.until};
    }
    props.setProperty(leaseName,JSON.stringify({id:leaseId,until:Date.now()+180000}));
  } finally { guard.releaseLock(); }

  let processed=0,sent=0,failed=0,failedGroup=0,waitingServer=0,reviewRequired=0;
  let rows=[],heads=[],idx={},sheet=null,stoppedReason='',blockedCode='';
  const seen = new Set();
  try {
    const meta = ensureMessageLogColumns_();
    sheet=meta.sheet;
    rows=sheet.getDataRange().getValues();
    heads=rows[0].map(x=>String(x||'').trim());
    const col=n=>heads.indexOf(n);
    idx={status:col('status'),phone:col('phone'),message:col('message'),zalo:col('zalo_name'),
      student:col('student_id'),name:col('name'),type:col('message_type'),cl:col('class_name'),
      request:col('request_id'),dedupe:col('dedupe_key'),logId:col('log_id'),
      recipientType:col('recipient_type'),groupName:col('group_name'),attempt:col('attempt_count'),
      lastAttempt:col('last_attempt_at'),processed:col('processed_at'),http:col('http_status'),
      gateway:col('gateway_response'),nextRetry:col('next_retry_at')};
    if(idx.status<0) throw new Error('MessageLogs thieu cot status');
    const students=new Map(getSheetDataAsObjects('Students').map(x=>[String(x.student_id),x]));

    // Prior V4.28 claimed 8 rows before sending: never blindly resend old PROCESSING rows.
    // Quarantine them for audit instead of losing/duplicating an already triggered message.
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][idx.status]||'').trim().toUpperCase()!=='PROCESSING') continue;
      const raw=idx.lastAttempt>=0?rows[i][idx.lastAttempt]:null;
      const timestamp=raw instanceof Date?raw.getTime():(raw?new Date(raw).getTime():0);
      if(!timestamp || !isFinite(timestamp) || Date.now()-timestamp>12*60*1000){
        sheet.getRange(i+1,idx.status+1).setValue('REVIEW_REQUIRED');
        if(idx.gateway>=0)sheet.getRange(i+1,idx.gateway+1).setValue('Interrupted while PROCESSING; check Zalo chat before any manual retry.');
        rows[i][idx.status]='REVIEW_REQUIRED'; reviewRequired++;
      }
    }

    for(let n=0;n<maxItems && Date.now()-started<maxRunMs;n++){
      let chosen=-1;
      for(let i=1;i<rows.length;i++){
        if(seen.has(i))continue;
        const state=String(rows[i][idx.status]||'').trim().toUpperCase();
        if(state!=='PENDING'&&state!=='WAITING_SERVER')continue;
        const when=idx.nextRetry>=0?rows[i][idx.nextRetry]:null;
        const whenMs=when instanceof Date?when.getTime():(when?new Date(when).getTime():0);
        if(whenMs&&isFinite(whenMs)&&whenMs>Date.now())continue;
        chosen=i;break;
      }
      if(chosen<0){stoppedReason='queue_empty';break;}
      const line=chosen+1,row=rows[chosen];seen.add(chosen);

      // Claim JUST the current row; never mark the remaining batch PROCESSING.
      const stepLock=LockService.getScriptLock();
      if(!stepLock.tryLock(4000)){stoppedReason='claim_lock_busy';break;}
      let claimed=false;
      try{
        const actual=String(sheet.getRange(line,idx.status+1).getValue()||'').trim().toUpperCase();
        if(actual==='PENDING'||actual==='WAITING_SERVER'){
          sheet.getRange(line,idx.status+1).setValue('PROCESSING');
          if(idx.lastAttempt>=0)sheet.getRange(line,idx.lastAttempt+1).setValue(new Date());
          SpreadsheetApp.flush();claimed=true;
        }
      }finally{stepLock.releaseLock();}
      if(!claimed){rows[chosen][idx.status]='SKIPPED_CONCURRENT';continue;}

      const sid=idx.student>=0?String(row[idx.student]||''):'';
      const stu=students.get(sid);
      let zalo=idx.zalo>=0?String(row[idx.zalo]||'').trim():'';
      let display=idx.name>=0?String(row[idx.name]||'').trim():'';
      let cl=idx.cl>=0?String(row[idx.cl]||'').trim():'';
      const typ=idx.type>=0?String(row[idx.type]||'').trim():'';
      if(stu&&!sid.toUpperCase().startsWith('CLASS_')){
        if(!zalo)zalo=String(stu.zalo_name||'').trim();
        if(!display)display=String(stu.name||'');
        if(!cl)cl=classCode(stu.grade,stu.class);
      }
      const explicit=idx.recipientType>=0?String(row[idx.recipientType]||'').trim().toLowerCase():'';
      const group=idx.groupName>=0?String(row[idx.groupName]||'').trim():'';
      const isGroup=explicit==='group'||(explicit!=='parent'&&zaloIsGroupItemV428_({student_id:sid,message_type:typ,group_name:group}));
      if(isGroup&&group)zalo=group;
      const requestId=(idx.request>=0?String(row[idx.request]||'').trim():'')||
        (idx.dedupe>=0?String(row[idx.dedupe]||'').trim():'')||
        (idx.logId>=0?String(row[idx.logId]||'').trim():'');
      const context={student_id:sid,student_name:display,class_name:cl,recipient_type:isGroup?'group':'parent',
        group_name:isGroup?zalo:'',message_type:typ,request_id:requestId,
        skip_failure_notice:typ==='GROUP_ERROR_SUMMARY'};
      let result;
      try{
        result=sendZaloViaGateway(idx.phone>=0?row[idx.phone]:'',idx.message>=0?row[idx.message]:'',zalo,context);
      }catch(e){
        result={success:false,server_offline:true,message:'Queue gateway exception: '+String(e.message||e)};
      }
      const code=Number(result.http_status||0);
      const response=result.gateway_response&&typeof result.gateway_response==='object'?result.gateway_response:{};
      const gatewayCode=String(response.status||'').toUpperCase();
      const hardFailure=!result.success&&(code===409||code===422);
      const outcome=result.dispatch_uncertain?'REVIEW_REQUIRED':
        result.success?'SUCCESS':(result.server_offline||!hardFailure?'WAITING_SERVER':(isGroup?'FAILED_GROUP':'FAILED'));
      sheet.getRange(line,idx.status+1).setValue(outcome);
      rows[chosen][idx.status]=outcome;
      if(idx.http>=0)sheet.getRange(line,idx.http+1).setValue(result.http_status||'');
      if(idx.gateway>=0)sheet.getRange(line,idx.gateway+1).setValue(JSON.stringify(result.gateway_response||result.message||'').slice(0,15000));
      if(idx.attempt>=0)sheet.getRange(line,idx.attempt+1).setValue((Number(row[idx.attempt])||0)+1);
      if(idx.processed>=0&&outcome!=='WAITING_SERVER')sheet.getRange(line,idx.processed+1).setValue(new Date());
      processed++;
      if(outcome==='SUCCESS')sent++;
      else if(outcome==='REVIEW_REQUIRED')reviewRequired++;
      else if(outcome==='FAILED_GROUP'){
        failed++;failedGroup++;
        const backlog=JSON.parse(props.getProperty(groupBufferName)||'[]');
        backlog.push({group:zalo||'[chua co ten nhom]',cl,code:gatewayCode||String(code),key:requestId});
        props.setProperty(groupBufferName,JSON.stringify(backlog.slice(-25)));
      }else if(outcome==='FAILED'){failed++;}
      else if(outcome==='WAITING_SERVER'){
        waitingServer++;stoppedReason='gateway_offline';
        const statusInfo=(result.gateway_response&&typeof result.gateway_response==='object')?result.gateway_response:{};
        blockedCode=String(statusInfo.reason||statusInfo.status||'GATEWAY_NOT_READY')
          .replace(/[^a-zA-Z0-9_:\-]/g,'_').slice(0,90);
        console.warn('[ZALO_QUEUE] WAITING_SERVER http='+String(code||0)+' reason='+blockedCode);
        break;
      }
    }
    // Only one summary AFTER all group messages in queue were processed.
    // This avoids switching to the manager chat after each 6A/6B failure.
    if(!waitingServer){
      const outstanding=rows.some((r,i)=>i>0&&(String(r[idx.status]||'').toUpperCase()==='PENDING'||String(r[idx.status]||'').toUpperCase()==='WAITING_SERVER')&&
        (String(r[idx.recipientType]||'').toLowerCase()==='group'||zaloIsGroupItemV428_({student_id:r[idx.student],message_type:r[idx.type],group_name:r[idx.groupName]})));
      if(!outstanding){
        const buffered=JSON.parse(props.getProperty(groupBufferName)||'[]');
        if(buffered.length){
          const unique=Array.from(new Map(buffered.map(x=>[x.key||x.group,x])).values());
          const msg='[AN PHUC] Nhóm Zalo chưa gửi được ('+unique.length+'):\n'+unique.slice(0,18).map(x=>
            '- '+(x.cl?x.cl+' | ':'')+x.group+' ('+x.code+')').join('\n')+
            '\nCác nhóm khác vẫn được xử lý. Kiểm tra MessageLogs/FAILED_GROUP.';
          const admin=normalizeVietnamPhone(props.getProperty('ZALO_FAILURE_NOTIFY_PHONE')||'0986108104');
          const key='GROUP_SUMMARY_V4281|'+hashText_(unique.map(x=>x.key||x.group).sort().join('|'));
          const qr=queueZaloMessage('ZALO_GROUP_SYSTEM','Tổng hợp lỗi nhóm',admin,'GROUP_ERROR_SUMMARY','','',msg,'',
             {recipient_type:'parent',sourceKey:key});
          if(qr.queued>0||qr.duplicate>0)props.deleteProperty(groupBufferName);
        }
      }
    }
  }finally{
    const unlock=LockService.getScriptLock();
    unlock.waitLock(5000);
    try{
      const current=JSON.parse(props.getProperty(leaseName)||'{}');
      if(current.id===leaseId)props.deleteProperty(leaseName);
    }finally{unlock.releaseLock();}
  }
  return {success:true,processed,sent,failed,failed_group:failedGroup,waiting_server:waitingServer,
    review_required_new:reviewRequired,stopped_reason:stoppedReason||'budget_or_batch',
    blocked_code:blockedCode,queue:getZaloQueueStatus()};
}

/** Manually requeue pre-send group failures after updating group mapping.
 *  Run from Apps Script editor: retryFailedZaloGroupsV428(10).
 *  No automatic resend of already triggered/unconfirmed messages.
 */
function retryFailedZaloGroupsV428(limit) {
  limit = Math.min(30, Math.max(1, Number(limit) || 10));
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const meta = ensureMessageLogColumns_();
    const sheet = meta.sheet, rows = sheet.getDataRange().getValues(), heads = rows[0].map(String);
    const st = heads.indexOf('status'), response = heads.indexOf('gateway_response'), retry = heads.indexOf('next_retry_at');
    let changed = 0;
    for (let i = 1; i < rows.length && changed < limit; i++) {
      if (String(rows[i][st]).trim().toUpperCase() !== 'FAILED_GROUP') continue;
      // Only statuses known to fail before send. A triggered send is NOT safe to retry.
      let parsed = {};
      try { parsed = JSON.parse(String(rows[i][response] || '{}')); } catch (e) {}
      const safe = ['GROUP_NOT_FOUND','GROUP_FOUND_NOT_OPENED','GROUP_NOT_CONFIRMED','GROUP_SEARCH_UI_ERROR','GROUP_AMBIGUOUS','AMBIGUOUS_GROUP_NAME','INVALID_GROUP_NAME','GROUP_CHANGED','GROUP_UI_ERROR','COMPOSER_MISMATCH','SEND_TRIGGER_FAILED'];
      if (!safe.includes(String(parsed.status || '').toUpperCase())) continue;
      sheet.getRange(i + 1, st + 1).setValue('PENDING');
      if (retry >= 0) sheet.getRange(i + 1, retry + 1).clearContent();
      changed++;
    }
    return {success:true,requeued:changed,notice:'Chua gui ngay; hang doi se xu ly trong lan chay tiep theo.'};
  } finally { lock.releaseLock(); }
}

function getZaloSendUrl() {
  const configured = PropertiesService.getScriptProperties().getProperty('ZALO_GATEWAY_URL');
  if (!configured) throw new Error('Chưa cấu hình ZALO_GATEWAY_URL');
  const url = configured.trim().replace(/\/+$/, '');
  return url.endsWith('/gui-tin-zalo') ? url : url + '/gui-tin-zalo';
}

/** V4.29.1: Shared transport configuration. Never expose the API key to web clients. */
/** V4.29.3 - fail-closed on conflicting legacy/new API key properties.
 * A previous version prioritized ZALO_GATEWAY_API_KEY even when a newly paired
 * ANPHUC_ZALO_GATEWAY_API_KEY was different. No fallback to compiled-in keys.
 * The authenticated gatewaySyncV4292 action updates BOTH properties together.
 */
function zaloGatewayCanonicalKeyV4293_(){
  const props=PropertiesService.getScriptProperties();
  const primary=String(props.getProperty('ZALO_GATEWAY_API_KEY')||'').trim();
  const legacy=String(props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY)||'').trim();
  if(primary && legacy && !safeEquals_(primary,legacy))
    throw new Error('GATEWAY_KEY_PROPERTIES_CONFLICT: chạy đồng bộ khóa V4.29.3 trước khi gửi.');
  const key=primary||legacy;
  if(key.length<32)throw new Error('GATEWAY_API_KEY_NOT_PAIRED: chưa đồng bộ khóa từ máy Zalo.');
  return key;
}
function zaloGatewayHeadersV4291_(){
  return {'ngrok-skip-browser-warning':'true','X-API-Key':zaloGatewayCanonicalKeyV4293_()};
}

function zaloPreflightV4291_(){
  const url=getZaloSendUrl().replace(/\/gui-tin-zalo$/,'');
  try{
    const r=UrlFetchApp.fetch(url+'/health',{
      method:'get',headers:zaloGatewayHeadersV4291_(),muteHttpExceptions:true,followRedirects:false
    });
    const code=r.getResponseCode();let body={};
    try{body=JSON.parse(r.getContentText());}catch(e){}
    if(code!==200 || body.service!=='zalo-gateway')return {ready:false,code:'HEALTH_HTTP_'+code};
    if(body.api_key_configured!==true)return {ready:false,code:'GATEWAY_API_KEY_MISSING'};
    if(body.browser_alive!==true)return {ready:false,code:'CHROME_NOT_READY'};
    if(body.zalo_authenticated!==true)return {ready:false,code:'ZALO_NOT_AUTHENTICATED'};
    const verify=UrlFetchApp.fetch(url+'/auth-check',{
      method:'get',headers:zaloGatewayHeadersV4291_(),muteHttpExceptions:true,followRedirects:false
    });
    if(verify.getResponseCode()!==200)return {ready:false,code:'GATEWAY_KEY_MISMATCH_HTTP_'+verify.getResponseCode()};
    const auth=JSON.parse(verify.getContentText());
    if(auth.status!=='AUTH_OK'||auth.gateway_instance_id!==body.gateway_instance_id)
      return {ready:false,code:'GATEWAY_KEY_OR_INSTANCE_MISMATCH'};
    return {ready:true,instance:body.gateway_instance_id||'',code:'READY'};
  }catch(e){return {ready:false,code:String(e.message||e).slice(0,100)};}
}

function sendZaloViaGateway(phone, message, zaloName, context) {
  const check=zaloPreflightV4291_();
  if(!check.ready)return {success:false,server_offline:true,
    http_status:503,gateway_response:{status:'NO_DISPATCH',reason:check.code},message:'Preflight blocked: '+check.code};
  const ctx = context || {};
  const payload = {
    so_dien_thoai: normalizeVietnamPhone(phone) || '',
    noi_dung: message,
    ten_zalo: String(zaloName || '').trim(),
    ten_nhom_zalo: String(ctx.recipient_type || '').toLowerCase() === 'group' ? String(ctx.group_name || zaloName || '').trim() : '',
    group_name: String(ctx.recipient_type || '').toLowerCase() === 'group' ? String(ctx.group_name || zaloName || '').trim() : '',
    student_id: ctx.student_id || '',
    ten_hoc_sinh: ctx.student_name || '',
    ten_lop: ctx.class_name || '',
    recipient_type: ctx.recipient_type || 'parent',
    message_type: ctx.message_type || '',
    request_id: ctx.request_id || '',
    skip_failure_notice: ctx.skip_failure_notice === true
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: zaloGatewayHeadersV4291_(),
    followRedirects: true,
    muteHttpExceptions: true
  };
  const offlineStatus = new Set([404, 502, 503, 504]);
  try {
    const response = UrlFetchApp.fetch(getZaloSendUrl(), options);
    const statusCode = response.getResponseCode();
    const resText = response.getContentText();
    let resJson = null;
    try { resJson = JSON.parse(resText); } catch(e) {}
    const gatewayStatus = String((resJson && resJson.status) || '').toUpperCase();
    // Retry only for an explicit pre-send OFFLINE response. A proxy 502/504 or
    // connection reset cannot prove Zalo did not receive the message.
    const confirmedOffline = !!(resJson && resJson.success === false &&
      ['BOT_OFFLINE','DRIVER_FAILED','ZALO_NOT_READY','AUTH_INVALID_NO_DISPATCH','CONFIG_API_KEY_MISSING'].includes(gatewayStatus));
    if (confirmedOffline || (statusCode === 404 && !resJson)) {
      return {success:false,server_offline:true,
        message:(resJson && resJson.message) || 'Gateway endpoint not available.',
        http_status:statusCode,gateway_response:resJson || {status:'GATEWAY_ENDPOINT_NOT_FOUND'}};
    }
    if (offlineStatus.has(Number(statusCode)) || gatewayStatus === 'SELENIUM_ERROR') {
      return {success:false,dispatch_uncertain:true,server_offline:false,
        message:'Gateway/Ngrok trả lỗi sau POST; chưa thể chứng minh tin chưa được gửi.',
        http_status:statusCode,gateway_response:resJson || {status:'NETWORK_RESULT_UNKNOWN'}};
    }
    if (!resJson) {
      return {success:false,dispatch_uncertain:true,server_offline:false,message:'Gateway không trả JSON hợp lệ: '+resText.slice(0,180),http_status:statusCode};
    }
    if (resJson && ['SENT_UNCONFIRMED','NOTICE_SENT_UNCONFIRMED','PARTIAL_MEDIA_UNCONFIRMED'].includes(gatewayStatus)) {
      return {success:false,dispatch_uncertain:true,server_offline:false,message:'Đã kích hoạt gửi nhưng Zalo chưa xác nhận; cần kiểm tra trực tiếp nhóm/chat trước khi gửi lại.',http_status:statusCode,gateway_response:resJson};
    }
    if (statusCode >= 200 && statusCode < 300 && resJson.success === true &&
        ['SENT','DUPLICATE_SKIPPED'].includes(gatewayStatus)) {
      return {success:true,server_offline:false,gateway_response:resJson,http_status:statusCode};
    }
    return {
      success:false,
      server_offline:false,
      message:resJson.message || ('HTTP '+statusCode),
      http_status:statusCode,
      gateway_response:resJson
    };
  } catch (error) {
    return {success:false,dispatch_uncertain:true,server_offline:false,message:'Không rõ Gateway đã nhận lệnh hay chưa; phải kiểm tra Zalo trước khi gửi lại.',gateway_response:{status:'NETWORK_RESULT_UNKNOWN',detail:String(error && error.message || error).slice(0,180)}};
  }
}

/** V4.28.9 – explicit administrator-only one-recipient Zalo test.
 * Exact allow-list is stored in Script Properties, never accepted from an
 * untrusted request alone. This does not enqueue, loop or send automatically.
 */
function sendZaloTestMessage(p) {
  p=p||{};
  const allowed=normalizeVietnamPhone(PropertiesService.getScriptProperties().getProperty('ZALO_TEST_RECIPIENT_PHONE')||'');
  const requested=normalizeVietnamPhone(p.phone);
  if(!allowed)throw new Error('TEST_RECIPIENT_NOT_CONFIGURED: đặt ZALO_TEST_RECIPIENT_PHONE trong Script Properties.');
  if(!requested||requested!==allowed)throw new Error('TEST_RECIPIENT_NOT_ALLOWED: chỉ được gửi tới số kiểm thử do quản trị viên cấu hình.');
  if(String(p.confirmation||'')!=='GUI THU ZALO')throw new Error('TEST_CONFIRMATION_REQUIRED: giáo viên phải xác nhận thao tác gửi.');
  const diag=getZaloDiagnostics({});
  if(!diag.gateway_reachable||!diag.zalo_authenticated)throw new Error('TEST_GATEWAY_NOT_READY: Zalo/Gateway chưa sẵn sàng.');
  const requestId='ADMIN_TEST_'+Utilities.getUuid();
  const msg='[AN PHUC - TIN THU NGHIEM]\n' +
    'Kiểm tra kết nối Zalo Gateway theo yêu cầu quản trị. Không phải thông báo học tập.\n' +
    'Mã đối chiếu: '+requestId;
  const r=sendZaloViaGateway(requested,msg,'',{message_type:'ADMIN_TEST',request_id:requestId,recipient_type:'parent'});
  return {request_id:requestId,status:r.dispatch_uncertain?'REVIEW_REQUIRED':r.success?'SENT':'FAILED',
    success:r.success===true,dispatch_uncertain:r.dispatch_uncertain===true,
    http_status:r.http_status||null,
    gateway_status:String(r.gateway_response&&r.gateway_response.status||''),
    note:r.dispatch_uncertain?'Đã bấm gửi nhưng chưa xác nhận; kiểm tra Zalo trước khi thử lại.':
      r.success?'Gateway báo đã gửi; hãy kiểm tra trong cuộc trò chuyện thật.':
        'Gateway từ chối/lỗi: '+String(r.message||'').slice(0,160)};
}

// --- MODULE ĐIỂM DANH & BÁO CÁO LỚP ĐÃ HỌC ---
function getStudentsByClass(params) {
  params = params || {};
  const cacheParams = { grade: params.grade || '', className: params.className || '', date: String(params.date || '').trim() };
  const cached = cacheGetJson_('students_by_class', cacheParams);
  if (cached) return cached;
  const ss = getSpreadsheet_();
  const targetDate = cacheParams.date;
  let students = filterStudents_(getSheetData('Students', ss), { grade: params.grade, className: params.className });
  if (targetDate) {
    students = students.filter(s => {
      const enrolled = parseDateHelper(s.enrollment_date || s.created_at);
      return !enrolled || enrolled.dateStr <= targetDate;
    });
  }
  const statusMap = new Map();
  const targetClassCode = classCode(params.grade, params.className);
  getSheetData('Attendance', ss).forEach(a => {
    const parsed = parseDateHelper(a.date);
    if (!parsed || parsed.dateStr !== targetDate) return;
    const rowCode = classCode(a.grade, a.class);
    // V4.27: trạng thái điểm danh phải thuộc đúng lớp đang mở.
    // Dòng legacy không có grade/class vẫn được dùng để không mất dữ liệu cũ.
    if (rowCode && targetClassCode && rowCode !== targetClassCode) return;
    statusMap.set(String(a.student_id), String(a.status || ''));
  });
  const result = students.map(s => Object.assign({}, s, { status: normalizeAttendanceStatus_(statusMap.get(String(s.student_id)) || '') }));
  cachePutJson_('students_by_class', cacheParams, result, 20);
  return result;
}

function buildAttendanceEventMessage_(student, status, formattedDate) {
  const classLabel = classCode(student.grade, student.class);
  const map = {
    Present: 'CÓ MẶT',
    P: 'VẮNG CÓ PHÉP',
    K: 'VẮNG KHÔNG PHÉP'
  };
  const label = map[status] || status;
  return `Trung tâm An Phúc Education xin thông báo: Học sinh ${student.name} - lớp ${classLabel} ${label} trong buổi học ngày ${formattedDate}. Trân trọng!`;
}

function getClassSessionDatesUpTo_(student, upToDate, sessionData, attData) {
  const code = classCode(student.grade, student.class);
  const enrolled = parseDateHelper(student.enrollment_date || student.created_at);
  const scheduled = new Set();
  const fallback = new Set();
  const add = (bucket, grade, cls, rawDate) => {
    if (classCode(grade, cls) !== code) return;
    const d = parseDateHelper(rawDate); if (!d) return;
    if (upToDate && d.dateStr > upToDate) return;
    if (enrolled && d.dateStr < enrolled.dateStr) return;
    bucket.add(d.dateStr);
  };
  (sessionData || []).forEach(x => add(scheduled, x.grade, x.class, x.date));
  // Attendance chỉ là nguồn dự phòng cho dữ liệu cũ chưa có ClassSessions.
  if (!scheduled.size) (attData || []).forEach(x => add(fallback, x.grade, x.class, x.date));
  return Array.from(scheduled.size ? scheduled : fallback).sort();
}

function getStudentAttendanceStatusMap_(student, upToDate, attData) {
  const out = new Map();
  const studentClassCode = classCode(student.grade, student.class);
  (attData || []).forEach(row => {
    if (String(row.student_id) !== String(student.student_id)) return;
    const d = parseDateHelper(row.date); if (!d) return;
    if (upToDate && d.dateStr > upToDate) return;
    const rowClassCode = classCode(row.grade, row.class);
    // V4.27 FIX: tuyệt đối không lấy K/P/Present của lớp khác để tính streak của lớp hiện tại.
    // Chỉ chấp nhận dòng legacy chưa có grade/class như fallback tương thích dữ liệu cũ.
    if (rowClassCode && studentClassCode && rowClassCode !== studentClassCode) return;
    out.set(d.dateStr, normalizeAttendanceStatus_(row.status));
  });
  return out;
}

function getStudentMonthAttendanceSummary_(student, year, month, upToDate, attData, sessionData) {
  const dates = getClassSessionDatesUpTo_(student, upToDate, sessionData, attData)
    .filter(dateStr => {
      const d = parseDateHelper(dateStr);
      return d && d.year === Number(year) && d.month === Number(month);
    });
  const statusMap = getStudentAttendanceStatusMap_(student, upToDate, attData);
  let present = 0, permitted = 0, unexcused = 0, legacy_absent = 0, missing = 0;
  dates.forEach(d => {
    const st = statusMap.get(d) || '';
    if (st === 'Present') present++;
    else if (st === 'P') permitted++;
    else if (st === 'K') unexcused++;
    else if (st === 'LegacyAbsent') legacy_absent++;
    else missing++;
  });
  return { total_sessions: dates.length, present, permitted, unexcused, legacy_absent, missing };
}

function getConsecutiveKState_(student, upToDate, attData, sessionData) {
  const dates = getClassSessionDatesUpTo_(student, upToDate, sessionData, attData);
  if (!dates.length) return { streak: 0, streak_dates: [], last_session_date: '' };
  const statusMap = getStudentAttendanceStatusMap_(student, upToDate, attData);
  let streak = 0; const reversed = [];
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i];
    if ((statusMap.get(d) || '') === 'K') { streak++; reversed.push(d); }
    else break;
  }
  return {
    streak,
    streak_dates: reversed.reverse(),
    last_session_date: dates[dates.length - 1]
  };
}

function buildUnexcusedTwoSessionAlert_(student, currentDate, attData, sessionData) {
  const state = getConsecutiveKState_(student, currentDate, attData, sessionData);
  if (state.last_session_date !== currentDate || state.streak !== 2 || state.streak_dates.length !== 2) return null;

  const current=parseDateHelper(currentDate); if(!current) return null;
  const summary=getStudentMonthAttendanceSummary_(student,current.year,current.month,currentDate,attData,sessionData);
  const totalAbsent=Number(summary.permitted||0)+Number(summary.unexcused||0)+Number(summary.legacy_absent||0);
  const fmt=d=>{const x=String(d).split('-');return x.length===3?`${x[2]}/${x[1]}/${x[0]}`:String(d);};
  const pair=state.streak_dates, code=classCode(student.grade,student.class);
  const msg='Trung tâm An Phúc Education kính gửi Quý phụ huynh học sinh '+student.name+' - lớp '+code+'. '+
    'Trong tháng '+current.month+'/'+current.year+', lớp đã học '+summary.total_sessions+' buổi; em đã vắng '+totalAbsent+' buổi. '+
    'Hai buổi học liên tiếp gần nhất ngày '+fmt(pair[0])+' và '+fmt(pair[1])+', em đều vắng không phép. '+
    'Trung tâm kính mong Quý phụ huynh phối hợp nhắc nhở em duy trì chuyên cần và theo kịp nội dung học tập. Nếu có lý do đặc biệt, kính mong Quý phụ huynh phản hồi để giáo viên nắm thông tin. Xin cảm ơn Quý phụ huynh.';
  return { msg, sourceKey:`UNEXCUSED_K2|${student.student_id}|${code}|${pair[0]}|${pair[1]}`, month:current.month, year:current.year, dates:pair, class_code:code };
}

function saveAttendance(params) {
  const records = Array.isArray(params.records) ? params.records : [];
  if (!records.length) return { success: true, messages_queued: 0, unexcused_alerts_queued: 0 };

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName('Attendance');
  const sessionSheet = ss.getSheetByName('ClassSessions');
  if (!sheet) throw new Error('Sheet Attendance không tồn tại');

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idx = key => headers.indexOf(key);
  const existingMap = new Map();
  for (let i = 1; i < data.length; i++) {
    const parsed = parseDateHelper(data[i][idx('date')]);
    if (parsed) {
      const rowClassCode = classCode(data[i][idx('grade')], data[i][idx('class')]);
      existingMap.set(String(data[i][idx('student_id')]) + '|' + rowClassCode + '|' + parsed.dateStr, i + 1);
    }
  }

  const studentsMap = new Map(getSheetDataAsObjects('Students', ss).map(st => [String(st.student_id), st]));
  const sessionData = sessionSheet ? sessionSheet.getDataRange().getValues() : [];
  const existingSessions = new Set();
  if (sessionData.length > 1) {
    for (let i = 1; i < sessionData.length; i++) {
      const parsed = parseDateHelper(sessionData[i][3]);
      if (parsed) existingSessions.add(classCode(sessionData[i][1], sessionData[i][2]) + '|' + parsed.dateStr);
    }
  }

  const newAttendanceRows = [], newSessionRows = [], messages = [], changedKRecords = [];
  const statusUpdates = [];
  records.forEach(rec => {
    const recDate = parseDateHelper(rec.date); if (!recDate) return;
    const normalizedStatus = normalizeAttendanceStatus_(rec.status);
    if (!['Present','P','K'].includes(normalizedStatus)) return;
    const recClassCode = classCode(rec.grade, rec.class);
    const key = String(rec.student_id) + '|' + recClassCode + '|' + recDate.dateStr;
    const foundRow = existingMap.get(key);
    let changed = true;
    if (foundRow && foundRow > 0) {
      const oldStatus = normalizeAttendanceStatus_(data[foundRow - 1][idx('status')]);
      changed = oldStatus !== normalizedStatus;
      if (changed) {
        statusUpdates.push({row: foundRow, value: normalizedStatus});
        data[foundRow - 1][idx('status')] = normalizedStatus;
      }
    } else {
      const row = new Array(headers.length).fill('');
      const put = (name, value) => { const j = idx(name); if (j >= 0) row[j] = value; };
      put('attendance_id', generateId('ATT')); put('student_id', rec.student_id); put('date', recDate.dateStr); put('status', normalizedStatus); put('grade', rec.grade); put('class', rec.class);
      newAttendanceRows.push(row); existingMap.set(key, -1);
    }

    if (sessionSheet) {
      const sessionKey = classCode(rec.grade, rec.class) + '|' + recDate.dateStr;
      if (!existingSessions.has(sessionKey)) {
        newSessionRows.push([generateId('SES'), rec.grade, rec.class, recDate.dateStr, new Date()]);
        existingSessions.add(sessionKey);
      }
    }

    if (!changed && foundRow) return;
    const student = studentsMap.get(String(rec.student_id));
    if (!student) return;
    if (normalizedStatus === 'K') changedKRecords.push({ student_id: rec.student_id, date: recDate.dateStr, grade:rec.grade, class:rec.class });
    const phone = normalizeVietnamPhone(student.parent_phone); const zaloName = String(student.zalo_name || '').trim();
    if (!phone && !zaloName) return;
    const parts = recDate.dateStr.split('-'); const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const attendanceStudent = Object.assign({}, student, {grade:rec.grade || student.grade, class:rec.class || student.class});
    messages.push({
      student_id: rec.student_id, name: student.name, phone, type: 'ATTENDANCE', month: recDate.month, year: recDate.year, zaloName,
      class_name: classCode(attendanceStudent.grade, attendanceStudent.class), sourceKey: `ATTENDANCE|${rec.student_id}|${classCode(attendanceStudent.grade, attendanceStudent.class)}|${recDate.dateStr}|${normalizedStatus}`,
      msg: buildAttendanceEventMessage_(attendanceStudent, normalizedStatus, formattedDate)
    });
  });

  statusUpdates.forEach(x => sheet.getRange(x.row, idx('status') + 1).setValue(x.value));
  if (newAttendanceRows.length) sheet.getRange(sheet.getLastRow() + 1, 1, newAttendanceRows.length, headers.length).setValues(newAttendanceRows);
  if (sessionSheet && newSessionRows.length) sessionSheet.getRange(sessionSheet.getLastRow() + 1, 1, newSessionRows.length, 5).setValues(newSessionRows);

  if (statusUpdates.length || newAttendanceRows.length || newSessionRows.length) bumpDataVersion_('save_attendance');
  const regularResult = queueZaloMessagesDetailed_(messages);

  // Không đọc lại toàn bộ Attendance/ClassSessions lần thứ hai. Dùng snapshot đã đọc ở đầu hàm
  // cộng với các dòng vừa thay đổi/thêm, giúp thao tác Lưu điểm danh nhanh hơn rõ rệt.
  const attendanceRowsRaw = data.slice(1).concat(newAttendanceRows);
  const freshAttendance = attendanceRowsRaw.map(row => {
    const obj = {}; headers.forEach((h, j) => { if (h) obj[h] = row[j]; }); return obj;
  });
  let freshSessions = [];
  if (sessionData.length) {
    const sessionHeaders = sessionData[0].map(h => String(h || '').trim());
    freshSessions = sessionData.slice(1).concat(newSessionRows).map(row => {
      const obj = {}; sessionHeaders.forEach((h, j) => { if (h) obj[h] = row[j]; }); return obj;
    });
  } else {
    freshSessions = newSessionRows.map(row => ({ session_id:row[0], grade:row[1], class:row[2], date:row[3], created_at:row[4] }));
  }
  const alertItems = [];
  changedKRecords.forEach(rec => {
    const student = studentsMap.get(String(rec.student_id));
    if (!student) return;
    const phone = normalizeVietnamPhone(student.parent_phone); const zaloName = String(student.zalo_name || '').trim();
    if (!phone && !zaloName) return;
    const classScopedStudent = Object.assign({}, student, {grade:rec.grade || student.grade, class:rec.class || student.class});
    const alert = buildUnexcusedTwoSessionAlert_(classScopedStudent, rec.date, freshAttendance, freshSessions);
    if (!alert) return;
    alertItems.push({
      student_id: student.student_id, name: student.name, phone, zaloName, type: 'UNEXCUSED_ABSENCE_ALERT',
      month: alert.month, year: alert.year, msg: alert.msg, class_name: classCode(classScopedStudent.grade, classScopedStudent.class), sourceKey: alert.sourceKey
    });
  });
  const alertResult = queueZaloMessagesDetailed_(alertItems);
  return {
    success: true,
    messages_queued: regularResult.queued,
    messages_duplicate_skipped: regularResult.duplicate,
    unexcused_alerts_queued: alertResult.queued,
    unexcused_alerts_duplicate_skipped: alertResult.duplicate,
    attendance_saved: records.length
  };
}

// --- MODULE HỌC PHÍ ---
function getPaymentStatus(params) {
  params = params || {};
  const cacheParams = {
    month: normalizeNumberString(params.month),
    year: normalizeNumberString(params.year),
    grade: params.grade || '',
    className: params.className || '',
    term: String(params.term || '').trim().toLowerCase()
  };
  const cached = cacheGetJson_('payment_status', cacheParams);
  if (cached) return cached;

  if (!cacheParams.className && cacheParams.term.length < 2) return [];
  const ss = getSpreadsheet_();
  const students = filterStudents_(getSheetData('Students', ss), {
    grade: params.grade,
    className: params.className,
    term: params.term
  });
  const payments = new Map();
  getSheetDataAsObjects('Tuition', ss).forEach(t => {
    if (normalizeNumberString(t.month) === cacheParams.month && normalizeNumberString(t.year) === cacheParams.year) {
      payments.set(String(t.student_id).trim(), t);
    }
  });
  const defaultFee = Number(getSettingsMap_(ss).tuition_amount_default || 0);
  const result = students.map(student => {
    const payment = payments.get(String(student.student_id).trim());
    const expectedFee = getExpectedTuitionAmount(student, defaultFee);
    return {
      student_id: String(student.student_id),
      name: student.name || '',
      grade: student.grade || '',
      class: student.class || '',
      class_info: 'K' + (student.grade || '') + '-' + (student.class || ''),
      parent_phone: student.parent_phone || '',
      zalo_name: student.zalo_name || '',
      custom_fee: expectedFee,
      is_paid: Boolean(payment),
      amount: payment ? Number(payment.amount || 0) : expectedFee,
      method: payment ? String(payment.method || '') : '',
      paid_at: payment ? formatDateTimeSafe(payment.paid_at) : ''
    };
  });
  cachePutJson_('payment_status', cacheParams, result, 25);
  return result;
}


// V4.30 - READ-ONLY TUITION NOTICE FOR MONTHLY FULL PAYMENTS
// Center policy: a valid monthly Tuition receipt means PAID IN FULL.
// No partial-payment state and no balance splitting.
function getTuitionNoticeRows(params) {
  params = params || {};
  const month = Number(params.month), year = Number(params.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > 2100)
    throw new Error('Th\u00e1ng/n\u0103m th\u00f4ng b\u00e1o kh\u00f4ng h\u1ee3p l\u1ec7.');
  const todayKey = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  if (`${year}-${String(month).padStart(2,'0')}` > todayKey.slice(0,7))
    throw new Error('Kh\u00f4ng in th\u00f4ng b\u00e1o cho th\u00e1ng trong t\u01b0\u01a1ng lai.');

  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const defaultFee = Number(settings.tuition_amount_default || 0);
  const students = filterStudents_(getSheetData('Students',ss), {
    grade:normalizeNumberString(params.grade || ''),
    className:normalizeClassName(params.className || ''),
    term:String(params.term || '').trim()
  });
  const relevantIds = new Set(students.map(s=>String(s.student_id||'').trim()));
  const paidIds = new Set(), badIds = new Set(), warnings = [];
  const tuition = getSheetData('Tuition',ss);
  tuition.forEach((t,i) => {
    if (normalizeNumberString(t.month) !== String(month) ||
        normalizeNumberString(t.year) !== String(year)) return;
    const sid = String(t.student_id || '').trim();
    if (!relevantIds.has(sid)) return;
    const raw = t.amount, amount = Number(raw);
    if (!sid || raw === '' || raw == null || !Number.isFinite(amount) || amount <= 0) {
      badIds.add(sid);
      warnings.push('B\u1ea3n ghi h\u1ecdc ph\u00ed d\u00f2ng ' + (i+2) + ' c\u00f3 s\u1ed1 ti\u1ec1n kh\u00f4ng h\u1ee3p l\u1ec7; c\u1ea7n ki\u1ec3m tra Sheet Tuition.');
      return;
    }
    paidIds.add(sid);
  });

  const rows = [], seen = new Set();
  students.forEach(s => {
    const sid = String(s.student_id || '').trim();
    if (!sid || seen.has(sid)) return;
    seen.add(sid);
    if (paidIds.has(sid) || badIds.has(sid)) return;
    if (!periodIsEligibleForStudent_(s,{year,month},todayKey)) return;
    const due = getExpectedTuitionAmount(s,defaultFee);
    if (!Number.isFinite(due) || due <= 0) {
      warnings.push('Ch\u01b0a c\u00f3 m\u1ee9c h\u1ecdc ph\u00ed h\u1ee3p l\u1ec7 cho ' + String(s.name||sid) + ' (' + sid + ').');
      return;
    }
    rows.push({
      student_id:sid, name:String(s.name||''), grade:String(s.grade||''),
      class:String(s.class||''), class_info:'K'+String(s.grade||'')+'-'+String(s.class||''),
      month, year, expected_amount:due, paid_amount:0,
      remaining_amount:due, status:'UNPAID'
    });
  });
  rows.sort((a,b)=>Number(a.grade)-Number(b.grade)||
    a.class.localeCompare(b.class,'vi')||a.name.localeCompare(b.name,'vi'));
  return {
    month, year, rows,
    summary:{count:rows.length, unpaid_count:rows.length,
      tuition_total:rows.reduce((sum,x)=>sum+x.expected_amount,0)},
    warnings:warnings.slice(0,25)
  };
}

function markAsPaid(params) {
  const id = String(params.id || '').trim();
  const month = normalizeNumberString(params.month);
  const year = normalizeNumberString(params.year);
  const amount = Number(params.amount);
  const method = String(params.method || '').trim();
  if (!id || !month || !year || !amount || !method) throw new Error('Thiếu dữ liệu bắt buộc');

  const ss = getSpreadsheet_();
  const tSheet = ss.getSheetByName('Tuition');
  const tData = tSheet.getDataRange().getValues();
  const headers = tData[0].map(h => String(h || '').trim());
  const idx = key => headers.indexOf(key);
  for (let i = 1; i < tData.length; i++) {
    if (String(tData[i][idx('student_id')]).trim() === id &&
        normalizeNumberString(tData[i][idx('month')]) === month &&
        normalizeNumberString(tData[i][idx('year')]) === year) {
      throw new Error(`Đã đóng học phí tháng ${month}/${year} rồi.`);
    }
  }

  const student = getSheetData('Students', ss).find(s => String(s.student_id).trim() === id);
  if (!student) throw new Error('Không tìm thấy học sinh');
  const tuitionId = generateId('TUI');
  const row = new Array(headers.length).fill('');
  const set = (key, value) => { const j = idx(key); if (j >= 0) row[j] = value; };
  set('tuition_id', tuitionId); set('student_id', id); set('month', month); set('year', year);
  set('amount', amount); set('method', method); set('paid_at', new Date()); set('grade', student.grade); set('class', student.class);
  tSheet.getRange(tSheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  bumpDataVersion_('mark_paid');
  return { tuition_id: tuitionId, student_id: id };
}

function buildTuitionReminderMessage(student, month, year, amount) {
  const amountStr = formatMoneyVN(amount);
  return `Trung tâm An Phúc Education xin thông báo: Học sinh ${student.name} hiện chưa hoàn tất học phí tháng ${month}/${year}. Số tiền học phí: ${amountStr} VNĐ. Kính mong Quý phụ huynh thanh toán trước ngày 27/${month}/${year}. Nếu phụ huynh đã thanh toán, vui lòng bỏ qua thông báo này. Xin cảm ơn!`;
}

function sendTuitionMessage(params) {
  const { student_id, message_type, month, year, amount, method } = params;
  const student = getSheetDataAsObjects('Students').find(s => String(s.student_id) === String(student_id));
  if (!student) throw new Error('Không tìm thấy học sinh');

  const phone = normalizeVietnamPhone(student.parent_phone);
  const zaloName = String(student.zalo_name || '').trim();
  if (!phone && !zaloName) throw new Error('Học sinh chưa có SĐT hợp lệ hoặc Tên Zalo liên lạc');

  let message = ''; let queuedAmount = Number(amount || 0); let sourceKey = '';
  if (message_type === 'PAYMENT_RECEIVED') {
    const dateStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy'); const amountStr = formatMoneyVN(amount); const methodStr = method === 'TM' ? 'tiền mặt' : 'chuyển khoản';
    message = `Trung tâm An Phúc Education xin thông báo: Ngày ${dateStr}, Trung tâm đã ghi nhận học phí tháng ${month}/${year} của học sinh ${student.name}, số tiền ${amountStr} VNĐ, hình thức ${methodStr}. Cảm ơn Quý phụ huynh!`;
    sourceKey = `PAYMENT_RECEIVED|${student_id}|${year}-${String(month).padStart(2,'0')}`;
  } else if (message_type === 'PAYMENT_REMINDER') {
    const isPaid = getSheetDataAsObjects('Tuition').some(t => String(t.student_id) === String(student_id) && normalizeNumberString(t.month) === String(month) && normalizeNumberString(t.year) === String(year));
    if (isPaid) throw new Error('Đã đóng học phí rồi.');
    const defaultFee = Number(getSettingsMap_().tuition_amount_default || 0);
    const expectedFee = getExpectedTuitionAmount(student, defaultFee);
    if (expectedFee <= 0) throw new Error(`Chưa cấu hình số tiền học phí của ${student.name}.`);
    queuedAmount = expectedFee;
    message = buildTuitionReminderMessage(student, month, year, expectedFee);
    const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
    sourceKey = `PAYMENT_REMINDER|${student_id}|${year}-${String(month).padStart(2,'0')}|${today}`;
  } else {
    throw new Error('Loại tin nhắn học phí không hợp lệ');
  }

  const qr = queueZaloMessage(student_id, student.name, phone, message_type, month, year, message, zaloName, {
    class_name: classCode(student.grade, student.class), sourceKey
  });
  return { status: qr.queued ? 'queued' : 'duplicate', message: qr.queued ? 'Đã đưa vào hàng đợi' : 'Tin tương tự đã có trong hàng đợi/đã gửi', amount: queuedAmount, duplicate: qr.duplicate > 0 };
}

function sendBulkTuitionReminders(params) {
  const month = normalizeNumberString(params.month); const year = normalizeNumberString(params.year);
  const ss = getSpreadsheet_();
  const students = filterStudents_(getSheetData('Students', ss), { grade: params.grade, className: params.className });
  const tuitions = getSheetDataAsObjects('Tuition', ss).filter(t => normalizeNumberString(t.month) === month && normalizeNumberString(t.year) === year);
  const paidIds = new Set(tuitions.map(t => String(t.student_id)));
  const defaultFee = Number(getSettingsMap_(ss).tuition_amount_default || 0);
  let skipped = 0, no_contact = 0, no_fee = 0;
  const queueItems = []; const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  students.forEach(student => {
    if (paidIds.has(String(student.student_id))) { skipped++; return; }
    const phone = normalizeVietnamPhone(student.parent_phone); const zaloName = String(student.zalo_name || '').trim();
    const expectedFee = getExpectedTuitionAmount(student, defaultFee);
    if (!phone && !zaloName) { no_contact++; return; }
    if (expectedFee <= 0) { no_fee++; return; }
    queueItems.push({
      student_id: student.student_id, name: student.name, phone, type: 'PAYMENT_REMINDER', month, year,
      msg: buildTuitionReminderMessage(student, month, year, expectedFee), zaloName,
      class_name: classCode(student.grade, student.class), sourceKey: `PAYMENT_REMINDER|${student.student_id}|${year}-${String(month).padStart(2,'0')}|${today}`
    });
  });
  const qr = queueZaloMessagesDetailed_(queueItems);
  return { queued: qr.queued, duplicate: qr.duplicate, skipped, no_contact, no_fee };
}


// --- BÁO CÁO TÌNH HÌNH HỌC SINH / HỌC PHÍ NHIỀU THÁNG ---
function parseSelectedPeriods_(params) {
  params = params || {};
  const fallbackYear = Number(params.year || new Date().getFullYear());
  let tokens = [];
  if (Array.isArray(params.periods)) tokens = params.periods.slice();
  else if (params.periods) tokens = String(params.periods).split(',');

  const periods = [];
  tokens.forEach(token => {
    const m = String(token || '').trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return;
    const y = Number(m[1]), mo = Number(m[2]);
    if (y >= 2000 && mo >= 1 && mo <= 12) periods.push({year:y, month:mo, key:`${y}-${String(mo).padStart(2,'0')}`, label:`${mo}/${y}`});
  });

  if (!periods.length) {
    let months = [];
    if (Array.isArray(params.months)) months = params.months;
    else if (params.months) months = String(params.months).split(',');
    else if (params.month) months = [params.month];
    months.map(Number).filter(m => m >= 1 && m <= 12).forEach(m => periods.push({year:fallbackYear, month:m, key:`${fallbackYear}-${String(m).padStart(2,'0')}`, label:`${m}/${fallbackYear}`}));
  }

  if (!periods.length) {
    const now = new Date(); const y = fallbackYear || now.getFullYear(); const m = now.getMonth()+1;
    periods.push({year:y, month:m, key:`${y}-${String(m).padStart(2,'0')}`, label:`${m}/${y}`});
  }

  const map = new Map(); periods.forEach(p => map.set(p.key, p));
  return Array.from(map.values()).sort((a,b) => a.key.localeCompare(b.key));
}

function periodIsEligibleForStudent_(student, period, todayKey) {
  const enrolled = parseDateHelper(student.enrollment_date || student.created_at);
  const first = `${period.year}-${String(period.month).padStart(2,'0')}-01`;
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const last = `${period.year}-${String(period.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  if (enrolled && enrolled.dateStr > last) return false;
  if (todayKey && first > todayKey) return false;
  return true;
}

function getStudentSituationReport(params, preloaded) {
  params = params || {}; preloaded = preloaded || {};
  const useCache = !Object.keys(preloaded).length;
  const reportCacheParams = {
    year: params.year || '', months: params.months || '', periods: params.periods || '',
    grade: params.grade || '', className: params.className || '', term: String(params.term || '').trim().toLowerCase(), student_id: params.student_id || ''
  };
  if (useCache) {
    const cached = cacheGetJson_('student_situation', reportCacheParams);
    if (cached) return cached;
  }

  const ss = preloaded.ss || getSpreadsheet_();
  const term = String(params.term || '').trim();
  let students = preloaded.students
    ? filterStudents_(preloaded.students, { grade: params.grade, className: params.className, term })
    : filterStudents_(getSheetData('Students', ss), { grade: params.grade, className: params.className, term });
  if (params.student_id) students = students.filter(s => String(s.student_id) === String(params.student_id));
  if (!params.student_id && !params.className && term.length < 2) return [];

  const periods = parseSelectedPeriods_(params);
  const periodKeys = new Set(periods.map(p => p.key));
  const todayKey = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  const tuition = preloaded.tuitionData || getSheetDataAsObjects('Tuition', ss);
  const attendance = preloaded.attendanceData || getSheetDataAsObjects('Attendance', ss);
  const sessions = preloaded.sessionData || getSheetDataAsObjects('ClassSessions', ss);
  const scores = preloaded.scoresData || getSheetDataAsObjects('Scores', ss);
  const settings = preloaded.settings || getSettingsMap_(ss);
  const defaultFee = Number(settings.tuition_amount_default || 0);

  const tuitionMap = new Map();
  tuition.forEach(t => {
    const key = `${String(t.student_id)}|${normalizeNumberString(t.year)}-${String(Number(t.month)).padStart(2,'0')}`;
    if (!tuitionMap.has(key)) tuitionMap.set(key, t);
  });

  const classSessions = new Map();
  const addSession = (grade, cls, rawDate) => {
    const d = parseDateHelper(rawDate); if (!d) return;
    const pKey = `${d.year}-${String(d.month).padStart(2,'0')}`;
    if (!periodKeys.has(pKey) || d.dateStr > todayKey) return;
    const c = classCode(grade, cls); if (!c) return;
    if (!classSessions.has(c)) classSessions.set(c, new Set());
    classSessions.get(c).add(d.dateStr);
  };
  sessions.forEach(x => addSession(x.grade, x.class, x.date));
  attendance.forEach(x => addSession(x.grade, x.class, x.date));

  const attendanceMap = new Map();
  attendance.forEach(a => {
    const d = parseDateHelper(a.date); if (!d) return;
    attendanceMap.set(`${String(a.student_id)}|${d.dateStr}`, normalizeAttendanceStatus_(a.status));
  });

  const scoreMap = new Map();
  scores.forEach(s => {
    const d = parseDateHelper(s.test_date); if (!d) return;
    const pKey = `${d.year}-${String(d.month).padStart(2,'0')}`;
    if (!periodKeys.has(pKey)) return;
    const sid = String(s.student_id || '');
    if (!scoreMap.has(sid)) scoreMap.set(sid, []);
    scoreMap.get(sid).push({
      test_date: d.dateStr,
      test_type: String(s.test_type || ''),
      test_title: String(s.test_title || ''),
      score: s.score,
      comment: String(s.comment || '')
    });
  });
  scoreMap.forEach(list => list.sort((a,b) => b.test_date.localeCompare(a.test_date)));

  const result = students.map(student => {
    const enrolled = parseDateHelper(student.enrollment_date || student.created_at);
    const dates = Array.from(classSessions.get(classCode(student.grade, student.class)) || []).filter(d => !enrolled || d >= enrolled.dateStr).sort();
    let present = 0, permitted = 0, unexcused = 0, legacyAbsent = 0, missing = 0;
    const pDates = [], kDates = [], legacyDates = [];
    dates.forEach(d => {
      const st = attendanceMap.get(`${String(student.student_id)}|${d}`) || '';
      if (st === 'Present') present++;
      else if (st === 'P') { permitted++; pDates.push(d); }
      else if (st === 'K') { unexcused++; kDates.push(d); }
      else if (st === 'LegacyAbsent') { legacyAbsent++; legacyDates.push(d); }
      else missing++;
    });

    const expectedFee = getExpectedTuitionAmount(student, defaultFee);
    const eligiblePeriods = periods.filter(p => periodIsEligibleForStudent_(student, p, todayKey));
    const paidPeriods = [], unpaidPeriods = []; let paidTotal = 0;
    eligiblePeriods.forEach(p => {
      const pay = tuitionMap.get(`${String(student.student_id)}|${p.key}`);
      if (pay) {
        const amount = Number(pay.amount || 0); paidTotal += amount;
        paidPeriods.push({ key:p.key, label:p.label, amount, method:String(pay.method || ''), paid_at:formatDateTimeSafe(pay.paid_at) });
      } else {
        unpaidPeriods.push({ key:p.key, label:p.label, amount:expectedFee });
      }
    });
    const unpaidTotal = unpaidPeriods.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const scoreDetails = scoreMap.get(String(student.student_id)) || [];
    const scoreSummary = scoreDetails.map(s => {
      const type = scoreTypeLabel_(s.test_type);
      const title = s.test_title ? ` ${s.test_title}` : '';
      const dm = s.test_date.split('-');
      return `${type}${title} ${dm[2]}/${dm[1]}: ${s.score}/10${s.comment ? ` - ${s.comment}` : ''}`;
    }).join('; ');

    return {
      student_id: student.student_id,
      name: student.name,
      grade: student.grade,
      class: student.class,
      class_info: `K${student.grade}-${student.class}`,
      parent_phone: student.parent_phone || '',
      zalo_name: student.zalo_name || '',
      selected_periods: periods.map(p => p.label),
      total_sessions: dates.length,
      present_count: present,
      permitted_absence_count: permitted,
      unexcused_absence_count: unexcused,
      legacy_absence_count: legacyAbsent,
      missing_attendance_count: missing,
      permitted_absence_dates: pDates,
      unexcused_absence_dates: kDates,
      legacy_absence_dates: legacyDates,
      paid_periods: paidPeriods,
      paid_months: paidPeriods.map(x => x.label).join(', '),
      paid_total: paidTotal,
      unpaid_periods: unpaidPeriods,
      unpaid_months: unpaidPeriods.map(x => x.label).join(', '),
      unpaid_total: unpaidTotal,
      expected_monthly_fee: expectedFee,
      scores_details: scoreDetails,
      scores_summary: scoreSummary
    };
  });
  if (useCache) cachePutJson_('student_situation', reportCacheParams, result, CACHE_TTL.studentReport);
  return result;
}

function buildStudentSituationMessage_(row) {
  const periodText = (row.selected_periods || []).join(', ');
  const paidText = row.paid_months ? `${row.paid_months} (${formatMoneyVN(row.paid_total)} VNĐ)` : 'chưa ghi nhận trong các tháng đã chọn';
  const unpaidText = row.unpaid_months ? `${row.unpaid_months} - dự kiến ${formatMoneyVN(row.unpaid_total)} VNĐ` : 'không có';
  const scoreText = row.scores_summary ? ` Kết quả kiểm tra: ${row.scores_summary}.` : ' Chưa có điểm kiểm tra trong phạm vi đã chọn.';
  return `Trung tâm An Phúc Education kính gửi Quý phụ huynh báo cáo tình hình của học sinh ${row.name} - lớp ${String(row.grade)}${String(row.class)} trong các tháng ${periodText}: ` +
    `lớp có ${row.total_sessions} buổi học; em có mặt ${row.present_count} buổi, vắng có phép (P) ${row.permitted_absence_count} buổi, vắng không phép (K) ${row.unexcused_absence_count} buổi` +
    `${row.legacy_absence_count ? `, và ${row.legacy_absence_count} buổi vắng cũ chưa phân loại P/K` : ''}.` + scoreText + ' ' +
    `Học phí đã ghi nhận: ${paidText}. Học phí chưa ghi nhận: ${unpaidText}. ` +
    `Nếu thông tin chưa cập nhật kịp thời, kính mong Quý phụ huynh phản hồi để Trung tâm kiểm tra. Xin cảm ơn Quý phụ huynh.`;
}

function sendStudentSituationReport(params) {
  const rows = getStudentSituationReport(params);
  if (!rows.length) throw new Error('Không tìm thấy học sinh hoặc dữ liệu báo cáo.');
  const row = rows[0];
  const phone = normalizeVietnamPhone(row.parent_phone); const zaloName = String(row.zalo_name || '').trim();
  if (!phone && !zaloName) throw new Error('Học sinh chưa có SĐT/Tên Zalo liên lạc.');
  const periods = parseSelectedPeriods_(params); const periodKey = periods.map(p => p.key).join('_');
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  const qr = queueZaloMessage(row.student_id, row.name, phone, 'STUDENT_SITUATION_REPORT', '', '', buildStudentSituationMessage_(row), zaloName, {
    class_name: classCode(row.grade, row.class), sourceKey: `STUDENT_SITUATION|${row.student_id}|${periodKey}|${today}`
  });
  return { queued: qr.queued, duplicate: qr.duplicate, student_id: row.student_id, name: row.name };
}

function sendBulkStudentSituationReports(params) {
  const rows = getStudentSituationReport(params); const periods = parseSelectedPeriods_(params); const periodKey = periods.map(p => p.key).join('_');
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  let no_contact = 0; const items = [];
  rows.forEach(row => {
    const phone = normalizeVietnamPhone(row.parent_phone); const zaloName = String(row.zalo_name || '').trim();
    if (!phone && !zaloName) { no_contact++; return; }
    items.push({ student_id: row.student_id, name: row.name, phone, zaloName, type:'STUDENT_SITUATION_REPORT', month:'', year:'',
      msg:buildStudentSituationMessage_(row), class_name:classCode(row.grade,row.class), sourceKey:`STUDENT_SITUATION|${row.student_id}|${periodKey}|${today}` });
  });
  const qr = queueZaloMessagesDetailed_(items);
  return { total: rows.length, queued: qr.queued, duplicate: qr.duplicate, no_contact };
}

function buildMultiMonthTuitionReminderMessage_(row) {
  const months = row.unpaid_months || '';
  return `Trung tâm An Phúc Education kính gửi Quý phụ huynh học sinh ${row.name} - lớp ${String(row.grade)}${String(row.class)}. ` +
    `Theo dữ liệu hiện tại, Trung tâm chưa ghi nhận học phí các tháng: ${months}. Tổng số tiền dự kiến: ${formatMoneyVN(row.unpaid_total)} VNĐ. ` +
    `Kính mong Quý phụ huynh thu xếp hoàn tất học phí. Nếu Quý phụ huynh đã thanh toán hoặc có thông tin cần đối chiếu, vui lòng phản hồi để Trung tâm kiểm tra và cập nhật. Xin trân trọng cảm ơn.`;
}

function sendMultiMonthTuitionReminder(params) {
  const rows = getStudentSituationReport(params);
  if (!rows.length) throw new Error('Không tìm thấy học sinh.');
  const row = rows[0];
  if (!row.unpaid_periods || !row.unpaid_periods.length) throw new Error('Học sinh không còn tháng học phí chưa đóng trong phạm vi đã chọn.');
  if (!(Number(row.unpaid_total) > 0)) throw new Error('Chưa cấu hình mức học phí.');
  const phone = normalizeVietnamPhone(row.parent_phone); const zaloName = String(row.zalo_name || '').trim();
  if (!phone && !zaloName) throw new Error('Học sinh chưa có SĐT/Tên Zalo liên lạc.');
  const periodKey = row.unpaid_periods.map(p => p.key).join('_'); const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  const qr = queueZaloMessage(row.student_id, row.name, phone, 'PAYMENT_REMINDER_MULTI', '', '', buildMultiMonthTuitionReminderMessage_(row), zaloName, {
    class_name: classCode(row.grade,row.class), sourceKey:`PAYMENT_REMINDER_MULTI|${row.student_id}|${periodKey}|${today}`
  });
  return { queued: qr.queued, duplicate: qr.duplicate, unpaid_months: row.unpaid_months, unpaid_total: row.unpaid_total };
}

function sendBulkMultiMonthTuitionReminders(params) {
  const rows = getStudentSituationReport(params); const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  let no_contact = 0, no_fee = 0, no_debt = 0; const items = [];
  rows.forEach(row => {
    if (!row.unpaid_periods || !row.unpaid_periods.length) { no_debt++; return; }
    if (!(Number(row.unpaid_total) > 0)) { no_fee++; return; }
    const phone = normalizeVietnamPhone(row.parent_phone); const zaloName = String(row.zalo_name || '').trim();
    if (!phone && !zaloName) { no_contact++; return; }
    const periodKey = row.unpaid_periods.map(p => p.key).join('_');
    items.push({ student_id:row.student_id, name:row.name, phone, zaloName, type:'PAYMENT_REMINDER_MULTI', month:'', year:'',
      msg:buildMultiMonthTuitionReminderMessage_(row), class_name:classCode(row.grade,row.class), sourceKey:`PAYMENT_REMINDER_MULTI|${row.student_id}|${periodKey}|${today}` });
  });
  const qr = queueZaloMessagesDetailed_(items);
  return { total:rows.length, queued:qr.queued, duplicate:qr.duplicate, no_contact, no_fee, no_debt };
}


// --- V4.3: TRẠNG THÁI / ĐÁNH THỨC HÀNG ĐỢI ZALO ---
function getZaloQueueStatus() {
  const sheet = getSpreadsheet_().getSheetByName('MessageLogs');
  if (!sheet || sheet.getLastRow() <= 1) return { waiting:0, pending:0, waiting_server:0, processing:0, review_required:0, failed:0, failed_group:0 };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const statusIdx = headers.indexOf('status');
  if (statusIdx < 0) return { waiting:0, pending:0, waiting_server:0, processing:0, review_required:0, failed:0, failed_group:0 };
  const values = sheet.getRange(2, statusIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  const out = { waiting:0, pending:0, waiting_server:0, processing:0, review_required:0, failed:0, failed_group:0 };
  values.forEach(r => {
    const s = String(r[0] || '').trim().toUpperCase();
    if (s === 'PENDING') out.pending++;
    else if (s === 'WAITING_SERVER') out.waiting_server++;
    else if (s === 'PROCESSING') out.processing++;
    else if (s === 'REVIEW_REQUIRED') out.review_required++;
    else if (s === 'FAILED') out.failed++;
    else if (s === 'FAILED_GROUP') { out.failed++; out.failed_group++; }
  });
  out.waiting = out.pending + out.waiting_server;
  return out;
}

function wakeupZaloQueue(params) {
  params=params||{};
  const provided=String(params._wake_key||params.wake_key||'').trim();
  if(!provided || !safeEquals_(provided,getZaloWakeKey_())) {
    securityLog_('ZALO_WAKE','BLOCKED','gateway',getSecurityClientHash_(params),'Wake key không hợp lệ');
    throw new Error('Không được phép đánh thức hàng đợi Zalo.');
  }
  const maxRounds = Math.min(3, Math.max(1, Number(params.rounds || 3)));
  let processed = 0, sent = 0, failed = 0, last = null;
  for (let i = 0; i < maxRounds; i++) {
    const status = getZaloQueueStatus();
    if (!status.waiting) break;
    last = processZaloQueue();
    processed += Number(last.processed || 0);
    sent += Number(last.sent || 0);
    failed += Number(last.failed || 0);
    if (Number(last.waiting_server || 0) > 0 || last.busy) break;
  }
  securityLog_('ZALO_WAKE','SUCCESS','gateway',getSecurityClientHash_(params),'processed='+processed+', sent='+sent+', failed='+failed);
  return { processed, sent, failed, queue:getZaloQueueStatus(), last_result:last,
    gateway_preflight:zaloPreflightV4291_().code };
}

/** V4.28.8 - Verify from GAS cloud that the configured public Ngrok URL
 * actually reaches this exact Windows Gateway instance. Read-only, wake-key protected.
 * Never sends Zalo messages, never returns any credential or student data.
 */
function gatewayProbeV4288(p) {
  p=p||{};
  const key=String(p._wake_key||p.wake_key||'').trim();
  if (!key || !safeEquals_(key,getZaloWakeKey_())) throw new Error('Không có quyền chẩn đoán Gateway.');
  const props=PropertiesService.getScriptProperties();
  const url=String(props.getProperty('ZALO_GATEWAY_URL')||'').trim().replace(/\/+$/,'');
  const result={build:'ANPHUC_GATEWAY_PROBE_V4288',checked_at:new Date().toISOString(),
    configured_url:url,cloud_reachable:false,instance_match:false,zalo_authenticated:false,
    browser_alive:false,media_ready:false,trigger_text:false,trigger_media:false};
  try {
    const expected=String(p.gateway_instance_id||'').trim();
    if (!/^https:\/\/[^/]+$/i.test(url)) throw new Error('ZALO_GATEWAY_URL phải là URL HTTPS gốc, không thêm đường dẫn.');
    if (!/^[a-f0-9]{32}$/i.test(expected)) throw new Error('Thiếu gateway_instance_id hợp lệ từ Gateway máy tính.');
    const response=UrlFetchApp.fetch(url+'/health',{muteHttpExceptions:true,followRedirects:false,
      headers:zaloGatewayHeadersV4291_(),timeout:20000});
    result.gateway_http=response.getResponseCode();
    if(result.gateway_http!==200) throw new Error('Apps Script → Ngrok HTTP '+result.gateway_http);
    const health=JSON.parse(response.getContentText());
    if(health.service!=='zalo-gateway') throw new Error('URL không trỏ đến dịch vụ Zalo Gateway.');
    result.cloud_reachable=true;
    result.instance_match=health.gateway_instance_id===expected;
    result.zalo_authenticated=health.zalo_authenticated===true;
    result.browser_alive=health.browser_alive===true;
    result.api_key_configured=health.api_key_configured===true;
    if(result.api_key_configured){
      const auth=UrlFetchApp.fetch(url+'/auth-check',{
        muteHttpExceptions:true,followRedirects:false,headers:zaloGatewayHeadersV4291_()});
      result.api_key_verified=auth.getResponseCode()===200;
      if(!result.api_key_verified)result.error='X-API-Key khong trung voi Gateway (HTTP '+auth.getResponseCode()+').';
    }
    result.media_ready=health.score_media_ready===true;
    result.boot_state=String(health.boot_state||'');
    if(!result.instance_match) result.error='Domain Ngrok đang trỏ sang một Gateway khác.';
  } catch(e) {result.error=String(e&&e.message||e).slice(0,240);}
  try {
    const triggers=ScriptApp.getProjectTriggers().map(x=>x.getHandlerFunction());
    result.trigger_text=triggers.indexOf('processZaloQueue')>=0;
    result.trigger_media=triggers.indexOf('scoreMediaProcessPending')>=0;
  } catch(e) {result.trigger_error=String(e.message||e).slice(0,140);}
  try {result.text_queue=getZaloQueueStatus();}
  catch(e) {result.queue_error=String(e.message||e).slice(0,140);}
  try {
    const sh=getSpreadsheet_().getSheetByName('ZaloMediaQueue');
    if(sh&&sh.getLastRow()>1){
      const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String),k=h.indexOf('status');
      if(k>=0){const states=sh.getRange(2,k+1,sh.getLastRow()-1,1).getValues();
        result.media_queue={queued:states.filter(r=>String(r[0])==='QUEUED').length,
          sending:states.filter(r=>String(r[0])==='SENDING').length,
          review:states.filter(r=>/UNKNOWN|PARTIAL|REVIEW/.test(String(r[0]))).length};}
    }
  } catch(e) {result.media_queue_error=String(e.message||e).slice(0,140);}
  result.ready=result.cloud_reachable&&result.instance_match&&result.zalo_authenticated&&result.browser_alive&&result.api_key_verified===true;
  return result;
}

// --- V4.5: ĐIỂM SỐ ---
function scoreTypeLabel_(type) {
  const map = { '15P':'15 phút', 'DINH_KY':'Định kỳ', 'THI_THU_10':'Thi thử vào 10' };
  return map[String(type || '').trim().toUpperCase()] || String(type || 'Điểm');
}

function getScoresByClass(params) {
  params = params || {};
  const grade = normalizeNumberString(params.grade);
  const className = normalizeClassName(params.className);
  const testDate = String(params.test_date || '').trim();
  const testType = String(params.test_type || '').trim().toUpperCase();
  const testTitle = String(params.test_title || '').trim();
  if (!grade || !className || !testDate || !testType) throw new Error('Thiếu Khối/Lớp/Ngày kiểm tra/Loại kiểm tra');

  const cacheParams = { grade, className, test_date:testDate, test_type:testType, test_title:testTitle };
  const cached = cacheGetJson_('scores_by_class', cacheParams);
  if (cached) return cached;

  const ss = getSpreadsheet_();
  const students = filterStudents_(getSheetData('Students', ss), { grade, className }).filter(s => {
    const enrolled = parseDateHelper(s.enrollment_date || s.created_at);
    return !enrolled || enrolled.dateStr <= testDate;
  });
  const scoreMap = new Map();
  getSheetData('Scores', ss).forEach(s => {
    const d = parseDateHelper(s.test_date);
    if (!d || d.dateStr !== testDate || String(s.test_type || '').trim().toUpperCase() !== testType) return;
    scoreMap.set(String(s.student_id), s);
  });
  const result = students.map(s => {
    const saved = scoreMap.get(String(s.student_id));
    return {
      student_id:String(s.student_id), name:s.name || '', grade:s.grade || '', class:s.class || '', class_info:`K${s.grade}-${s.class}`,
      parent_phone:s.parent_phone||'', zalo_name:s.zalo_name||'',
      score_id:saved ? saved.score_id : '', score:saved ? saved.score : '', comment:saved ? String(saved.comment || '') : '',
      test_title:saved ? String(saved.test_title || testTitle) : testTitle
    };
  });
  cachePutJson_('scores_by_class', cacheParams, result, CACHE_TTL.Scores);
  return result;
}

function saveScores(params) {
  params=params||{};
  const grade=normalizeNumberString(params.grade), className=normalizeClassName(params.className), testDate=String(params.test_date||'').trim(), testType=String(params.test_type||'').trim().toUpperCase(), testTitle=String(params.test_title||'').trim();
  const records=Array.isArray(params.records)?params.records:[];
  const sendMode=String(params.send_mode||'').trim().toLowerCase() || ((params.send_group===true||String(params.send_group).toLowerCase()==='true')?'group':((params.send_parent===true||String(params.send_parent).toLowerCase()==='true'||params.send_zalo===true||String(params.send_zalo).toLowerCase()==='true')?'parents':'none'));
  if(sendMode==='group')throw new Error('Gửi báo cáo nhóm phải qua màn hình Xem trước và Giáo viên duyệt riêng. Hãy lưu điểm bằng send_mode=none trước.');
  const skipWeak=params.skip_weak===true||String(params.skip_weak).toLowerCase()==='true', minScore=Number.isFinite(Number(params.min_score))?Number(params.min_score):5;
  if(!grade||!className||!testDate||!testType||!testTitle)throw new Error('Thiếu thông tin bài kiểm tra');
  if(!['15P','DINH_KY','THI_THU_10'].includes(testType))throw new Error('Loại kiểm tra không hợp lệ');
  if(!records.length)throw new Error('Chưa có dữ liệu điểm để lưu');

  const ss=getSpreadsheet_(), sheet=ss.getSheetByName('Scores'); if(!sheet)throw new Error('Chưa có sheet Scores. Hãy chạy setupSystemV48().');
  const all=sheet.getDataRange().getValues(), headers=all[0].map(h=>String(h||'').trim()), idx=k=>headers.indexOf(k), body=all.slice(1), keyToBodyIndex=new Map();
  body.forEach((row,i)=>{const d=parseDateHelper(row[idx('test_date')]);keyToBodyIndex.set(`${String(row[idx('student_id')])}|${d?d.dateStr:''}|${String(row[idx('test_type')]||'').trim().toUpperCase()}`,i);});
  const students=filterStudents_(getSheetData('Students',ss),{grade,className}), studentsMap=new Map(students.map(s=>[String(s.student_id),s]));
  const messageRows=[]; let saved=0,deleted=0;
  records.forEach(rec=>{
    const studentId=String(rec.student_id||'').trim(), student=studentsMap.get(studentId); if(!student)return;
    const key=`${studentId}|${testDate}|${testType}`, existingIndex=keyToBodyIndex.has(key)?keyToBodyIndex.get(key):-1, scoreBlank=rec.score===''||rec.score===null||rec.score===undefined, comment=String(rec.comment||'').trim();
    if(scoreBlank&&!comment){if(existingIndex>=0&&body[existingIndex]){body[existingIndex]=null;deleted++;}return;}
    let scoreValue=''; if(!scoreBlank){scoreValue=Number(rec.score);if(!Number.isFinite(scoreValue)||scoreValue<0||scoreValue>10)throw new Error(`Điểm của ${student.name} phải từ 0 đến 10.`);}
    let row=existingIndex>=0&&body[existingIndex]?body[existingIndex].slice():new Array(headers.length).fill('');
    if(existingIndex<0){row[idx('score_id')]=generateId('SC');row[idx('created_at')]=new Date();}
    const set=(k,v)=>{const j=idx(k);if(j>=0)row[j]=v;};
    set('student_id',studentId);set('name',student.name||'');set('grade',grade);set('class',className);set('test_date',testDate);set('test_type',testType);set('test_title',testTitle);set('score',scoreValue);set('comment',comment);
    if(existingIndex>=0)body[existingIndex]=row;else{keyToBodyIndex.set(key,body.length);body.push(row);} saved++;
    if(!scoreBlank)messageRows.push({student,score:scoreValue,comment});
  });
  const cleanBody=body.filter(Boolean), oldRows=Math.max(0,all.length-1); if(oldRows)sheet.getRange(2,1,oldRows,headers.length).clearContent(); if(cleanBody.length)sheet.getRange(2,1,cleanBody.length,headers.length).setValues(cleanBody); bumpDataVersion_('save_scores');

  const dateParts=testDate.split('-'),dateText=dateParts.length===3?`${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`:testDate;
  let queueResult={queued:0,duplicate:0}, skippedWeak=0, groupMissing=false;
  if(sendMode==='parents'){
    const items=[]; messageRows.forEach(x=>{if(skipWeak&&Number(x.score)<minScore){skippedWeak++;return;}const phone=normalizeVietnamPhone(x.student.parent_phone),zaloName=String(x.student.zalo_name||'').trim();if(!phone&&!zaloName)return;const msg=`Trung tâm An Phúc Education thông báo kết quả ${testTitle} ngày ${dateText} của em ${x.student.name} - lớp ${classCode(x.student.grade,x.student.class)}: Điểm số: ${x.score}/10. Nhận xét của giáo viên: ${x.comment||'Chưa có nhận xét thêm'}. Trân trọng!`;items.push({student_id:x.student.student_id,name:x.student.name,phone,zaloName,type:'SCORE_RESULT',month:'',year:'',msg,class_name:classCode(x.student.grade,x.student.class),sourceKey:`SCORE|${x.student.student_id}|${testDate}|${testType}|${x.score}`});});
    queueResult=queueZaloMessagesDetailed_(items);
  } else if(sendMode==='group'){
    const group=getClassZaloName(grade,className); if(!group)groupMissing=true; else{
      const lines=messageRows.map((x,i)=>`${i+1}. ${x.student.name}: ${x.score}/10`); const msg=`📊 [KẾT QUẢ ${scoreTypeLabel_(testType).toUpperCase()} - LỚP ${grade}${className}]
Bài: ${testTitle}
Ngày: ${dateText}
${lines.join('\n')}
Trung tâm An Phúc Education.`;
      queueResult=queueZaloMessage(`CLASS_${classCode(grade,className)}`,`Lớp ${classCode(grade,className)}`,'','CLASS_SESSION_REPORT','','',msg,group,{class_name:classCode(grade,className),sourceKey:`SCORE_GROUP|${grade}|${className}|${testDate}|${testType}|${testTitle}`});
    }
  }
  return{saved,deleted,queued:queueResult.queued||0,duplicate:queueResult.duplicate||0,send_mode:sendMode,skipped_weak:skippedWeak,min_score:minScore,group_missing:groupMissing};
}

// --- V4.5: KHO HỌC LIỆU SỐ / BÀI TẬP ---
function getHomeworkList(params) {
  params = params || {};
  const grade = normalizeNumberString(params.grade);
  const className = normalizeClassName(params.className);
  const cacheParams = { grade, className };
  const cached = cacheGetJson_('homework_list', cacheParams);
  if (cached) return cached;
  let rows = getSheetData('Homework').filter(x => {
    if (grade && normalizeNumberString(x.grade) !== grade) return false;
    if (className && normalizeClassName(x.class) !== className) return false;
    return true;
  }).map(x => Object.assign({}, x, {
    class_info:`K${x.grade}-${x.class}`,
    assigned_date:(parseDateHelper(x.assigned_date) || {}).dateStr || String(x.assigned_date || ''),
    due_date:(parseDateHelper(x.due_date) || {}).dateStr || String(x.due_date || '')
  }));
  rows.sort((a,b) => String(b.assigned_date || '').localeCompare(String(a.assigned_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  cachePutJson_('homework_list', cacheParams, rows, CACHE_TTL.Homework);
  return rows;
}

function saveAndSendHomework(params) {
  params = params || {};
  const grade = normalizeNumberString(params.grade);
  const className = normalizeClassName(params.className);
  const assignedDate = String(params.assigned_date || Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd')).trim();
  const dueDate = String(params.due_date || '').trim();
  const title = String(params.title || '').trim();
  const materialUrl = String(params.material_url || '').trim();
  const note = String(params.note || '').trim();
  const sendToGroup = params.send_to_group === true || String(params.send_to_group).toLowerCase() === 'true';
  if (!grade || !className || !title || !materialUrl) throw new Error('Hãy nhập Khối, Lớp, Tiêu đề và Link học liệu.');

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName('Homework');
  if (!sheet) throw new Error('Chưa có sheet Homework. Hãy chạy setupSystemV48().');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const idx = key => headers.indexOf(key);
  const hwId = generateId('HW');

  let queued = 0, duplicate = 0, zaloStatus = 'NOT_SENT', zaloName = '';
  if (sendToGroup) {
    zaloName = getClassZaloName(grade, className);
    if (!zaloName) throw new Error(`Lớp ${grade}${className} chưa cấu hình tên nhóm Zalo.`);
    const fmt = raw => {
      const d = parseDateHelper(raw); if (!d) return raw || '--';
      const p = d.dateStr.split('-'); return `${p[2]}/${p[1]}/${p[0]}`;
    };
    const msg = `📚 [BÀI TẬP & HỌC LIỆU - LỚP TOÁN ${grade}${className}]\nNgày giao: ${fmt(assignedDate)}\nNội dung: ${title}\n🔗 Link tài liệu/bài tập: ${materialUrl}\n⏰ Hạn hoàn thành: ${fmt(dueDate)}\n📝 Dặn dò: ${note || 'Hoàn thành đúng hạn.'}\nChúc các em ôn tập tốt!`;
    const qr = queueZaloMessage(`CLASS_${classCode(grade,className)}`, `Lớp Toán ${classCode(grade,className)}`, '', 'CLASS_SESSION_REPORT', '', '', msg, zaloName, {
      class_name:classCode(grade,className), sourceKey:`HOMEWORK|${hwId}`
    });
    queued = qr.queued || 0; duplicate = qr.duplicate || 0;
    zaloStatus = queued ? 'QUEUED' : (duplicate ? 'DUPLICATE' : 'NOT_SENT');
  }

  const row = new Array(headers.length).fill('');
  const set = (key, value) => { const j = idx(key); if (j >= 0) row[j] = value; };
  set('hw_id', hwId); set('grade', grade); set('class', className); set('assigned_date', assignedDate); set('due_date', dueDate);
  set('title', title); set('material_url', materialUrl); set('note', note); set('zalo_sent', zaloStatus); set('created_at', new Date());
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  bumpDataVersion_('homework');
  return { hw_id:hwId, queued, duplicate, zalo_name:zaloName, zalo_sent:zaloStatus };
}

// --- V4.5: CỔNG TRA CỨU PHỤ HUYNH ---
function schoolYearPeriods_(startYear) {
  const y = Number(startYear);
  const out = [];
  for (let m = 9; m <= 12; m++) out.push({year:y, month:m, key:`${y}-${String(m).padStart(2,'0')}`});
  for (let m = 1; m <= 8; m++) out.push({year:y+1, month:m, key:`${y+1}-${String(m).padStart(2,'0')}`});
  return out;
}

function lookupParentPortal(params) {
  params = params || {};
  const query = String(params.phone || params.student_id || params.query || '').trim();
  const phone = normalizeVietnamPhone(query);
  const studentCode = phone ? '' : query.toUpperCase();
  if (!phone && !/^ST[A-Z0-9_-]{3,}$/i.test(studentCode)) throw new Error('Vui lòng nhập SĐT phụ huynh hợp lệ hoặc Mã học sinh.');

  const now = new Date();
  const currentSchoolStart = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const startYear = Number(params.school_year_start || params.year || currentSchoolStart);
  const cacheParams = { phone:phone || '', student_id:studentCode || '', school_year_start:startYear };
  const cached = cacheGetJson_('parent_portal', cacheParams);
  if (cached) return cached;

  const ss = getSpreadsheet_();
  const allStudents = getSheetData('Students', ss);
  const matched = allStudents.filter(s => phone
    ? normalizeVietnamPhone(s.parent_phone) === phone
    : String(s.student_id || '').trim().toUpperCase() === studentCode);
  if (!matched.length) {
    const empty = { school_year:`${startYear}-${startYear+1}`, students:[] };
    cachePutJson_('parent_portal', cacheParams, empty, 60);
    return empty;
  }

  const tuition = getSheetData('Tuition', ss);
  const attendance = getSheetData('Attendance', ss);
  const sessions = getSheetData('ClassSessions', ss);
  const materials = getSheetData('Materials', ss);
  const scores = getSheetData('Scores', ss);
  const homework = getSheetData('Homework', ss);
  const settings = getSettingsMap_(ss);
  const periods = schoolYearPeriods_(startYear);
  const periodString = periods.map(p => p.key).join(',');
  const startKey = `${startYear}-09-01`, endKey = `${startYear+1}-08-31`;

  const resultStudents = matched.map(student => {
    const situation = getStudentSituationReport(
      { student_id:student.student_id, periods:periodString },
      { ss, students:[student], tuitionData:tuition, attendanceData:attendance, sessionData:sessions, scoresData:scores, settings }
    )[0] || {};
    const material = materials.find(m => String(m.student_id) === String(student.student_id)) || {};
    const studentScores = scores.filter(s => {
      if (String(s.student_id) !== String(student.student_id)) return false;
      const d = parseDateHelper(s.test_date); return d && d.dateStr >= startKey && d.dateStr <= endKey;
    }).map(s => {
      const d = parseDateHelper(s.test_date);
      return { test_date:d ? d.dateStr : String(s.test_date || ''), test_type:s.test_type || '', test_type_label:scoreTypeLabel_(s.test_type), test_title:s.test_title || '', score:s.score, comment:s.comment || '' };
    }).sort((a,b) => b.test_date.localeCompare(a.test_date));

    const classHw = homework.filter(h => normalizeNumberString(h.grade) === normalizeNumberString(student.grade) && normalizeClassName(h.class) === normalizeClassName(student.class))
      .map(h => { const d=parseDateHelper(h.assigned_date); return Object.assign({}, h, {assigned_key:d?d.dateStr:''}); })
      .filter(h => !h.assigned_key || (h.assigned_key >= startKey && h.assigned_key <= endKey))
      .sort((a,b) => String(b.assigned_key).localeCompare(String(a.assigned_key))).slice(0,5)
      .map(h => ({ hw_id:h.hw_id, assigned_date:h.assigned_key || h.assigned_date, due_date:(parseDateHelper(h.due_date)||{}).dateStr || String(h.due_date||''), title:h.title||'', material_url:h.material_url||'', note:h.note||'' }));

    return {
      student_id:student.student_id,
      name:student.name,
      grade:student.grade,
      class:student.class,
      class_info:`K${student.grade}-${student.class}`,
      enrollment_date:(parseDateHelper(student.enrollment_date || student.created_at) || {}).dateStr || '',
      attendance:{
        total_sessions:Number(situation.total_sessions || 0),
        present:Number(situation.present_count || 0),
        permitted_absence:Number(situation.permitted_absence_count || 0),
        unexcused_absence:Number(situation.unexcused_absence_count || 0),
        permitted_dates:situation.permitted_absence_dates || [],
        unexcused_dates:situation.unexcused_absence_dates || []
      },
      tuition:{ paid:situation.paid_periods || [], unpaid:situation.unpaid_periods || [], paid_total:Number(situation.paid_total || 0), unpaid_total:Number(situation.unpaid_total || 0) },
      materials:[1,2,3,4,5,6].map(n => ({ batch:n, received:Boolean(material['batch'+n]) })),
      scores:studentScores,
      homework:classHw
    };
  });

  const result = { school_year:`${startYear}-${startYear+1}`, students:resultStudents };
  cachePutJson_('parent_portal', cacheParams, result, 60);
  return result;
}

// --- MODULE TÀI LIỆU ---
function getMaterialStatus(params) {
  const students = getStudents({ grade: params.grade, className: params.className });
  const matMap = new Map(getSheetData('Materials').map(m => [String(m.student_id), m]));
  return students.map(s => {
    const mat = matMap.get(String(s.student_id)) || {};
    return {
      student_id: s.student_id, name: s.name, class_info: `K${s.grade}-${s.class}`,
      batch1: mat.batch1 === true || mat.batch1 === 'TRUE', batch2: mat.batch2 === true || mat.batch2 === 'TRUE', batch3: mat.batch3 === true || mat.batch3 === 'TRUE',
      batch4: mat.batch4 === true || mat.batch4 === 'TRUE', batch5: mat.batch5 === true || mat.batch5 === 'TRUE', batch6: mat.batch6 === true || mat.batch6 === 'TRUE'
    };
  });
}
function updateMaterialStatus(params) {
  const sheet = getSpreadsheet_().getSheetByName('Materials'); const data = sheet.getDataRange().getValues();
  let foundRow = -1; for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(params.id)) { foundRow = i + 1; break; } }
  if (foundRow > -1) { sheet.getRange(foundRow, params.batch + 1).setValue(params.checked); } 
  else { let newRow = [params.id, false, false, false, false, false, false]; newRow[params.batch] = params.checked; sheet.appendRow(newRow); }
  bumpDataVersion_('materials');
  return { updated: true };
}

// --- MODULE THỐNG KÊ ---
function getDashboardStats(params) {
  params = params || {};
  const cacheParams = {
    grade: params.grade || '', className: params.className || '',
    month: normalizeNumberString(params.month || (new Date().getMonth() + 1)),
    year: normalizeNumberString(params.year || new Date().getFullYear())
  };
  const cached = cacheGetJson_('dashboard', cacheParams);
  if (cached) return cached;
  const ss = getSpreadsheet_();
  const students = filterStudents_(getSheetData('Students', ss), cacheParams);
  const studentIds = new Set(students.map(s => String(s.student_id)));
  const paidIds = new Set();
  getSheetData('Tuition', ss).forEach(t => {
    if (studentIds.has(String(t.student_id)) && normalizeNumberString(t.month) === cacheParams.month && normalizeNumberString(t.year) === cacheParams.year) paidIds.add(String(t.student_id));
  });
  const result = { total_students: students.length, paid_count: paidIds.size, unpaid_count: Math.max(0, students.length - paidIds.size) };
  cachePutJson_('dashboard', cacheParams, result, CACHE_TTL.dashboard);
  return result;
}

function normalizeAttendanceStatus_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'present' || s === 'có mặt' || s === 'co mat' || s === 'có' || s === 'co') return 'Present';
  if (s === 'p' || s === 'vắng có phép' || s === 'vang co phep' || s === 'permitted' || s === 'excused') return 'P';
  if (s === 'k' || s === 'vắng không phép' || s === 'vang khong phep' || s === 'unexcused') return 'K';
  // Dữ liệu cũ chỉ có Absent/Vắng, không đủ căn cứ xếp P hay K. Giữ thành nhóm lịch sử riêng.
  if (s === 'absent' || s === 'vắng' || s === 'vang') return 'LegacyAbsent';
  return String(value || '').trim();
}

function buildStatistics_(params, students, tuitionData, attData, sessionData, settings) {
  const targetMonth = parseInt(params.month, 10); const targetYear = parseInt(params.year, 10);
  if (!targetMonth || !targetYear) throw new Error('Tháng/Năm không hợp lệ');
  const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1; const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
  const defaultFee = Number((settings || {}).tuition_amount_default || 0);
  let total_revenue = 0, cash_total = 0, transfer_total = 0;
  const paid_list = [], unpaid_list = [], unpaid_two_months_list = [], absent_list = [];

  const currentPay = new Map(), prevPay = new Map();
  (tuitionData || []).forEach(t => {
    const id = String(t.student_id || '');
    const m = normalizeNumberString(t.month), y = normalizeNumberString(t.year);
    if (m === String(targetMonth) && y === String(targetYear) && !currentPay.has(id)) currentPay.set(id, t);
    if (m === String(prevMonth) && y === String(prevYear) && !prevPay.has(id)) prevPay.set(id, t);
  });

  const endDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`;
  const attendanceStatus = new Map();
  const classSessions = new Map();
  const attendanceFallbackSessions = new Map();
  const addSession = (targetMap, grade, className, rawDate) => {
    const parsed = parseDateHelper(rawDate);
    if (!parsed || parsed.dateStr > endDate) return;
    const code = classCode(grade, className);
    if (!code) return;
    if (!targetMap.has(code)) targetMap.set(code, new Set());
    targetMap.get(code).add(parsed.dateStr);
  };
  // ClassSessions là nguồn lịch học chuẩn. Attendance chỉ dùng làm fallback cho dữ liệu cũ.
  (sessionData || []).forEach(row => addSession(classSessions, row.grade, row.class, row.date));
  (attData || []).forEach(a => {
    const parsed = parseDateHelper(a.date);
    if (!parsed || parsed.dateStr > endDate) return;
    addSession(attendanceFallbackSessions, a.grade, a.class, a.date);
    attendanceStatus.set(String(a.student_id || '') + '|' + parsed.dateStr, normalizeAttendanceStatus_(a.status));
  });
  attendanceFallbackSessions.forEach((set, code) => {
    if (!classSessions.has(code) || classSessions.get(code).size === 0) classSessions.set(code, set);
  });
  const classSessionDates = new Map();
  classSessions.forEach((set, code) => classSessionDates.set(code, Array.from(set).sort().reverse()));

  students.forEach(original => {
    const s = Object.assign({}, original);
    const id = String(s.student_id || '');
    const tuiCurrent = currentPay.get(id); const tuiPrev = prevPay.get(id);
    s.class_info = `K${s.grade}-${s.class}`;
    s.expected_fee = getExpectedTuitionAmount(s, defaultFee);
    if (tuiCurrent) {
      const amt = parseFloat(tuiCurrent.amount) || 0; total_revenue += amt;
      if (String(tuiCurrent.method) === 'TM') cash_total += amt;
      if (String(tuiCurrent.method) === 'CK') transfer_total += amt;
      paid_list.push(Object.assign({}, s, { paid_at: formatDateTimeSafe(tuiCurrent.paid_at), method: tuiCurrent.method, amount: amt, note: s.note }));
    } else {
      unpaid_list.push(s);
      if (!tuiPrev) unpaid_two_months_list.push(s);
    }

    // Chuỗi vắng được tính theo đúng lịch buổi học của lớp. Thiếu điểm danh hoặc Có mặt sẽ ngắt chuỗi.
    const dates = classSessionDates.get(classCode(s.grade, s.class)) || [];
    if (!dates.length) return;
    const latest = parseDateHelper(dates[0]);
    if (!latest || latest.year !== targetYear || latest.month !== targetMonth) return;
    const enrolled = parseDateHelper(s.enrollment_date || s.created_at);
    let streak = 0; const absentDates = [];
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (enrolled && d < enrolled.dateStr) break;
      const status = attendanceStatus.get(id + '|' + d) || '';
      if (status === 'K') { streak++; absentDates.push(d); }
      else break;
    }
    if (streak >= 2) {
      const chronological = absentDates.slice().reverse();
      absent_list.push(Object.assign({}, s, {
        absent_count: streak,
        absent_dates: chronological.map(d => { const x=d.split('-'); return `${x[2]}/${x[1]}`; }).join(', '),
        streak_start: chronological[0] || '',
        streak_end: chronological[chronological.length - 1] || '',
        last_session_date: dates[0] || ''
      }));
    }
  });

  return {
    total_students: students.length, paid_count: paid_list.length, unpaid_count: unpaid_list.length,
    total_revenue, cash_total, transfer_total, paid_list, unpaid_list, unpaid_two_months_list,
    absent_list, prev_month_label: `Tháng ${prevMonth}`
  };
}

function buildLessonReport_(params, attData, sessionData, classZaloMap) {
  const targetMonth = parseInt(params.month, 10); const targetYear = parseInt(params.year, 10); const classMap = {};
  const addSession = (grade, className, rawDate) => {
    const parsed = parseDateHelper(rawDate);
    if (!parsed || parsed.year !== targetYear || parsed.month !== targetMonth) return;
    if (params.grade && normalizeNumberString(grade) !== normalizeNumberString(params.grade)) return;
    if (params.className && normalizeClassName(className) !== normalizeClassName(params.className)) return;
    const code = classCode(grade, className);
    if (!classMap[code]) classMap[code] = { grade: normalizeNumberString(grade), class_name_raw: normalizeClassName(className), dates: new Set() };
    classMap[code].dates.add(parsed.dateStr);
  };
  (attData || []).forEach(a => addSession(a.grade, a.class, a.date));
  (sessionData || []).forEach(row => addSession(row.grade, row.class, row.date));
  const data = Object.keys(classMap).map(code => {
    const item = classMap[code]; const datesArr = Array.from(item.dates).sort();
    const datesStr = datesArr.map(d => { const parts=d.split('-'); return `${parts[2]}/${parts[1]}`; }).join(', ');
    return {
      grade: item.grade, class_code: item.class_name_raw, class_name: `K${item.grade}-${item.class_name_raw}`,
      total_sessions: datesArr.length, dates_str: datesStr, zalo_name: getClassZaloName(item.grade, item.class_name_raw, classZaloMap)
    };
  });
  data.sort((a,b) => (Number(a.grade) - Number(b.grade)) || a.class_code.localeCompare(b.class_code, 'vi'));
  return data;
}

function getStatistics(params) {
  params = params || {};
  const cacheParams = { month:normalizeNumberString(params.month), year:normalizeNumberString(params.year), grade:params.grade || '', className:params.className || '' };
  const cached = cacheGetJson_('statistics', cacheParams);
  if (cached) return cached;
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const students = filterStudents_(getSheetData('Students', ss), { grade: params.grade, className: params.className });
  const result = buildStatistics_(params, students, getSheetData('Tuition', ss), getSheetData('Attendance', ss), getSheetData('ClassSessions', ss), settings);
  cachePutJson_('statistics', cacheParams, result, CACHE_TTL.report);
  return result;
}

function getLessonReport(params) {
  params = params || {};
  const cacheParams = { month:normalizeNumberString(params.month), year:normalizeNumberString(params.year), grade:params.grade || '', className:params.className || '' };
  const cached = cacheGetJson_('lesson_report', cacheParams);
  if (cached) return cached;
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const result = buildLessonReport_(params, getSheetData('Attendance', ss), getSheetData('ClassSessions', ss), getClassZaloMap_(settings));
  cachePutJson_('lesson_report', cacheParams, result, CACHE_TTL.report);
  return result;
}

function getReportBundle(params) {
  params = params || {};
  const cacheParams = {
    month: normalizeNumberString(params.month), year: normalizeNumberString(params.year),
    grade: normalizeNumberString(params.grade), className: normalizeClassName(params.className)
  };
  const cached = cacheGetJson_('report_bundle', cacheParams);
  if (cached) return cached;
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const students = filterStudents_(getSheetData('Students', ss), { grade: cacheParams.grade, className: cacheParams.className });
  const tuitionData = getSheetData('Tuition', ss);
  const attData = getSheetData('Attendance', ss);
  const sessionData = getSheetData('ClassSessions', ss);
  const result = {
    statistics: buildStatistics_(cacheParams, students, tuitionData, attData, sessionData, settings),
    lesson_report: buildLessonReport_(cacheParams, attData, sessionData, getClassZaloMap_(settings))
  };
  cachePutJson_('report_bundle', cacheParams, result, CACHE_TTL.report);
  return result;
}

function buildClassLessonMessage(reportItem, month, year) {
  const classLabel = `${reportItem.grade}${reportItem.class_code}`;
  const datesText = reportItem.dates_str ? ` Các ngày học: ${reportItem.dates_str}.` : '';
  return `Trung tâm An Phúc Education xin thông báo: Trong tháng ${month}/${year}, lớp Toán ${classLabel} đã học ${reportItem.total_sessions} buổi.${datesText} Trân trọng!`;
}

function hasPendingClassLessonMessage(grade, className, month, year, logs) {
  const rows = logs || getSheetDataAsObjects('MessageLogs');
  const targetName = `Lớp Toán ${classCode(grade, className)}`;
  return rows.some(row =>
    String(row.message_type) === 'CLASS_SESSION_REPORT' &&
    normalizeNumberString(row.month) === normalizeNumberString(month) &&
    normalizeNumberString(row.year) === normalizeNumberString(year) &&
    String(row.name || '').trim() === targetName &&
    ['PENDING', 'WAITING_SERVER', 'PROCESSING', 'SUCCESS', 'DUPLICATE_SKIPPED'].includes(String(row.status || '').trim().toUpperCase())
  );
}

function sendClassLessonReport(params) {
  const grade = normalizeNumberString(params.grade); const className = normalizeClassName(params.className);
  const month = normalizeNumberString(params.month); const year = normalizeNumberString(params.year);
  if (!grade || !className || !month || !year) throw new Error('Thiếu Khối/Lớp/Tháng/Năm');

  const zaloName = getClassZaloName(grade, className);
  if (!zaloName) throw new Error(`Lớp ${grade}${className} chưa có tên nhóm Zalo. Hãy bấm 'Thêm nhóm Zalo' trên báo cáo.`);
  const report = getLessonReport({ grade, className, month, year });
  if (!report.length) throw new Error(`Tháng ${month}/${year} chưa có dữ liệu buổi học của lớp ${grade}${className}.`);
  const item = report[0];
  if (hasPendingClassLessonMessage(grade, className, month, year)) {
    return { queued: 0, duplicate: true, class_name: item.class_name, zalo_name: zaloName, message: 'Tin cùng tháng đang nằm trong hàng đợi.' };
  }

  const msg = buildClassLessonMessage(item, month, year);
  const qr = queueZaloMessage(`CLASS_${classCode(grade, className)}`, `Lớp Toán ${classCode(grade, className)}`, '', 'CLASS_SESSION_REPORT', month, year, msg, zaloName, {
    class_name: classCode(grade, className), sourceKey: `CLASS_SESSION_REPORT|${classCode(grade, className)}|${year}-${String(month).padStart(2,'0')}`
  });
  return { queued: qr.queued, duplicate: qr.duplicate > 0, class_name: item.class_name, total_sessions: item.total_sessions, zalo_name: zaloName, message_text: msg };
}

function sendBulkClassLessonReports(params) {
  const month = normalizeNumberString(params.month); const year = normalizeNumberString(params.year);
  // V4.28.1: bulk means ALL grades. The report-page grade/class filters must not limit this action.
  const report = getLessonReport({ month, year });
  const logs = getSheetDataAsObjects('MessageLogs');
  let queued = 0, skipped_no_zalo = 0, duplicate = 0;
  const details = [], queueItems = [];
  report.forEach(item => {
    const zaloName = String(item.zalo_name || '').trim();
    if (!zaloName) { skipped_no_zalo++; details.push({ class_name: item.class_name, status: 'NO_ZALO' }); return; }
    if (hasPendingClassLessonMessage(item.grade, item.class_code, month, year, logs)) { duplicate++; details.push({ class_name: item.class_name, status: 'DUPLICATE' }); return; }
    const msg = buildClassLessonMessage(item, month, year);
    queueItems.push({ student_id: `CLASS_${classCode(item.grade, item.class_code)}`, name: `Lớp Toán ${classCode(item.grade, item.class_code)}`, phone: '', type: 'CLASS_SESSION_REPORT', month, year, msg, zaloName,
      class_name: classCode(item.grade, item.class_code), sourceKey: `CLASS_SESSION_REPORT|${classCode(item.grade, item.class_code)}|${year}-${String(month).padStart(2,'0')}` });
    details.push({ class_name: item.class_name, status: 'QUEUED', zalo_name: zaloName });
  });
  const qr = queueZaloMessagesDetailed_(queueItems);
  return { queued: qr.queued, skipped_no_zalo, duplicate: duplicate + qr.duplicate, total: report.length, details };
}


function setupSystemV411() {
  const result = setupSystemV410();
  initSheets();
  const settings = getSettingsMap_(getSpreadsheet_(), true);
  const updates = {};
  if (!String(settings.registration_notify_group || '').trim() && !normalizeVietnamPhone(settings.registration_notify_phone)) {
    updates.registration_notify_phone = DEFAULT_CENTER_ZALO;
  }
  if (!String(settings.exam_redirect_base_url || '').trim()) {
    updates.exam_redirect_base_url = 'https://anphuceducation.netlify.app/student';
  }
  if (Object.keys(updates).length) upsertSettingsBatch_(updates);
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v411');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.11','system','Bổ sung nhập Excel kiểm tra trực tiếp, URL đề trực tiếp và thông báo đăng ký về Zalo Trung tâm');
  return Object.assign({}, result, {
    version:'V4.13',
    message:'Đã nâng cấp V4.11: có thể nhập trực tiếp file Excel 3 sheet vào Google Sheet, mã/link mở trang kiểm tra, đăng ký mới thông báo về Zalo Trung tâm.'
  });
}

function setupSystemV413() {
  const result=setupSystemV411();
  initSheets();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v412');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.13','system','Cố định trang làm bài học sinh, tối ưu giao diện Kiểm tra trực tuyến, giữ lazy-load');
  return Object.assign({},result,{
    version:'V4.13',
    message:'Đã nâng cấp V4.13 Exam UX. Hãy Deploy New Version và kiểm tra trạng thái Backend trên Cổng phụ huynh.'
  });
}



function setupSystemV414() {
  const result=setupSystemV413();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ADMIN_SESSION_VERSION_PROPERTY))props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,Utilities.getUuid());
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v414');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.14','system','Parent Mobile-First UI, 12h backend auth, public bootstrap cache, student-id rate limit, registration honeypot');
  return Object.assign({},result,{version:'V4.14',message:'Đã nâng cấp V4.14 Parent UX + Server Security + Public Bootstrap Cache. Dữ liệu cũ được giữ nguyên.'});
}


function setupSystemV415() {
  const result=setupSystemV414();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY))props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  if(!String(props.getProperty('ZALO_GATEWAY_URL')||'').trim())props.setProperty('ZALO_GATEWAY_URL','https://pummel-crumb-ferret.ngrok-free.dev');
  upsertSettingsBatch_({exam_redirect_base_url:'https://anphuceducation.netlify.app/student'});
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v415');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.15','system','Đồng bộ Zalo Gateway, quản lý đề trực tiếp trên Google Sheet và link làm bài chỉnh được');
  return Object.assign({},result,{version:'V4.18',message:'Đã nâng cấp V4.15. Hãy thay đồng thời Python/BAT V4.15 và khởi động lại Zalo Gateway.'});
}

function setupSystemV416() {
  const result=setupSystemV415();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY))props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v416');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.17','system','Zalo dual-auth fallback, driver recovery and retry-safe queue');
  return Object.assign({},result,{version:'V4.18',message:'Đã nâng cấp V4.17 Zalo Recovery. Thay đồng thời Python/BAT V4.17 và khởi động lại Gateway.'});
}



// -----------------------------------------------------------------------------
// V4.17 - SINGLE ZALO GATEWAY
// Chỉ dùng một Python gateway: zalo_server.py. Giữ nguyên API key/wake key V4.16
// để nâng cấp không làm mất hàng đợi và không buộc đổi khóa.
// -----------------------------------------------------------------------------
function resetZaloSecurityV417(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  securityLog_('ZALO_SECURITY','RESET','V4.17','admin','Single gateway zalo_server.py; header + JSON body API key fallback');
  return {updated:true,key_fingerprint:zaloKeyFingerprint_(DEFAULT_ZALO_GATEWAY_API_KEY),version:'V4.18'};
}

function setupSystemV417(){
  const result=setupSystemV416();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY))props.setProperty(ZALO_GATEWAY_API_KEY_PROPERTY,DEFAULT_ZALO_GATEWAY_API_KEY);
  if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.17','system','Single Python gateway zalo_server.py; safe startup cleanup; health check before ngrok/wakeup');
  return Object.assign({},result,{version:'V4.18',message:'Đã nâng cấp V4.17 Single Zalo Gateway. Máy Zalo chỉ chạy zalo_server.py thông qua khoi_dong.bat.'});
}


// -----------------------------------------------------------------------------
// V4.18 - SIMPLE/STABLE ZALO GATEWAY
// Quay về cơ chế gửi ổn định: POST JSON trực tiếp, không X-API-Key/fingerprint.
// Vẫn giữ Wake key cho lệnh đánh thức hàng đợi từ BAT -> Apps Script.
// -----------------------------------------------------------------------------
function setupSystemV418(){
  const result=setupSystemV417();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
  if(!String(props.getProperty('ZALO_GATEWAY_URL')||'').trim()) props.setProperty('ZALO_GATEWAY_URL','https://pummel-crumb-ferret.ngrok-free.dev');
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v418');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.18','system','Simple stable Zalo gateway: JSON POST, no gateway API-key handshake; single zalo_server.py');
  return Object.assign({},result,{version:'V4.18',message:'Đã nâng cấp V4.18 Simple Zalo. Chỉ chạy zalo_server.py qua khoi_dong.bat; không cần đồng bộ API key.'});
}


// -----------------------------------------------------------------------------
// V4.19 - MODULAR TUITION AUTO + ZALO CONTACT HEALTH
// Hai module di kem: Module_TuitionAuto.gs va Module_ZaloContacts.gs
// -----------------------------------------------------------------------------
function setupSystemV419(){
  const result=setupSystemV418();
  const tuitionTrigger=setupTuitionAutoV419_();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v419');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.19','system','Auto tuition day 25 + unreachable Zalo list + modular extensions');
  return Object.assign({},result,{
    version:'V4.19',
    tuition_auto_trigger:tuitionTrigger,
    message:'Đã nâng cấp V4.19. Tự động nhắc học phí ngày 25 được bật; học sinh nợ từ 2 tháng được ưu tiên; có danh sách học sinh không liên lạc được qua Zalo.'
  });
}


// -----------------------------------------------------------------------------
// V4.20 - TEACHER/PARENT PORTAL + AUTO GRADING MODULES
// Modules: ExamCore, ExamUpload, AIProvider, ExamGrading, ExamReview, ExamParentReport
// -----------------------------------------------------------------------------
function setupSystemV420(){
  const result=setupSystemV419();
  initSheets();
  const examModule=setupExamModuleV420_();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v420');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.20','system','Teacher/Parent landing + AI grading + teacher review + parent Zalo feedback');
  return Object.assign({},result,{
    version:'V4.20',
    exam_module:examModule,
    message:'Đã nâng cấp V4.20: tách Cổng Phụ huynh/Giáo viên; bổ sung chấm bài AI trắc nghiệm + tự luận, giáo viên duyệt và gửi nhận xét Zalo.'
  });
}


// -----------------------------------------------------------------------------
// V4.21 - AUTO IMPORT ĐỀ + ĐÁP ÁN JSON (MC/TF/SA/LA)
// -----------------------------------------------------------------------------
function setupSystemV421(){
  const result=setupSystemV420();
  initSheets();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v421');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.21','system','Auto import exam JSON MC/TF/SA/LA + type-aware grading');
  return Object.assign({},result,{
    version:'V4.21',
    message:'Đã nâng cấp V4.21: tải trực tiếp file đề/đáp án JSON, tự nhận MC/TF/SA/LA, tự dựng điểm và barem; chấm khách quan theo loại câu, tự luận AI + giáo viên duyệt.'
  });
}


// -----------------------------------------------------------------------------
// V4.22 - OMR A/B + HANDWRITING C/D + ANNOTATED PARENT VIEW
// -----------------------------------------------------------------------------
function setupSystemV422(){
  const result=setupSystemV421();
  initSheets();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')) props.setProperty('ANPHUC_EXAM_SHEET_TEMPLATE','ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1');
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v422');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.22','system','OMR A/B + handwritten C/D + red annotations + parent graded-paper viewer');
  return Object.assign({},result,{
    version:'V4.22',
    answer_sheet_template:props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE'),
    message:'Đã nâng cấp V4.22: Mục A/B đọc ô tô OMR; Mục C trả lời ngắn viết tay; Mục D tự luận viết tay; AI tạo nhận xét đỏ trên bài, GV duyệt và phụ huynh xem bài đã chấm.'
  });
}


// -----------------------------------------------------------------------------
// V4.23 - AUTH REPAIR + PARENT UX 2026
// Chạy trực tiếp setupSystemV423() MỘT LẦN trong Apps Script Editor sau khi cập nhật.
// Vì thao tác chạy từ Editor đã được chủ dự án Google xác thực, hàm này có thể
// khôi phục credential quản trị mà không cần mở endpoint reset công khai.
// -----------------------------------------------------------------------------
function repairAdminLoginV423(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ADMIN_USERNAME_PROPERTY, DEFAULT_ADMIN_USERNAME);
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY, DEFAULT_ADMIN_PASSWORD_HASH);
  props.setProperty(ADMIN_SESSION_VERSION_PROPERTY, Utilities.getUuid());
  // Rate-limit V4.23 dùng namespace AP423_RL_ nên các khóa tạm cũ không còn chặn đăng nhập.
  securityLog_('ADMIN_AUTH','REPAIRED','V4.23','system','Reset admin username/password hash to known bootstrap credential and rotated session version');
  return {
    repaired:true,
    username:DEFAULT_ADMIN_USERNAME,
    password_reset_to_bootstrap:true,
    session_hours:ADMIN_SESSION_SECONDS/3600,
    note:'Đã khôi phục đăng nhập quản trị. Hãy đăng nhập rồi đổi mật khẩu trong tab Cài đặt.'
  };
}

function setupSystemV423(){
  const result=setupSystemV422();
  const auth=repairAdminLoginV423();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v423');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.23','system','Auth repair + Parent UX 2026; exam/Zalo data preserved');
  return Object.assign({},result,{
    version:'V4.25',
    auth_repair:auth,
    message:'V4.23 đã khôi phục đăng nhập Giáo viên và chuẩn bị backend cho Cổng Phụ huynh 2026. Dữ liệu cũ được giữ nguyên.'
  });
}


// -----------------------------------------------------------------------------
// V4.24 - COMPLETE MODULE PREFLIGHT + AUTH ROUTE FIX
// Chạy setupSystemV424() MỘT LẦN sau khi đã dán đủ các file module trong bộ V4.24.
// -----------------------------------------------------------------------------
function checkSystemModulesV424(){
  const checks = [
    {file:'Module_ExamCore.gs', fn:'setupExamModuleV420_', ok:(typeof setupExamModuleV420_ === 'function')},
    {file:'Module_ExamImport.gs', fn:'previewExamJsonDefinition', ok:(typeof previewExamJsonDefinition === 'function')},
    {file:'Module_ExamUpload.gs', fn:'createExamSubmission', ok:(typeof createExamSubmission === 'function')},
    {file:'Module_ExamGrading.gs', fn:'gradeExamSubmissionAI', ok:(typeof gradeExamSubmissionAI === 'function')},
    {file:'Module_ExamReview.gs', fn:'reviewExamSubmission', ok:(typeof reviewExamSubmission === 'function')},
    {file:'Module_ExamParentReport.gs', fn:'getParentGradedExam', ok:(typeof getParentGradedExam === 'function')},
    {file:'Module_AIProvider.gs', fn:'getAIGradingSettings', ok:(typeof getAIGradingSettings === 'function')},
    {file:'Module_TuitionAuto.gs', fn:'setupTuitionAutoV419_', ok:(typeof setupTuitionAutoV419_ === 'function')},
    {file:'Module_ZaloContacts.gs', fn:'getUnreachableZaloStudents', ok:(typeof getUnreachableZaloStudents === 'function')}
  ];
  const missing = checks.filter(x=>!x.ok).map(x=>x.file + ' -> ' + x.fn);
  return {ok:missing.length===0, missing:missing, modules:checks};
}

function setupSystemV424(){
  const preflight = checkSystemModulesV424();
  if(!preflight.ok){
    throw new Error('V4.24 chưa đủ module: ' + preflight.missing.join('; ') + '. Hãy dán đủ file trong thư mục AppsScript_Modular trước khi chạy setup.');
  }
  const result = setupSystemV423();
  // Khôi phục auth thêm một lần khi chuyển sang V4.24 để loại trừ credential/token cũ.
  const auth = repairAdminLoginV423();
  invalidateSettingsCache_();
  bumpDataVersion_('setup_v424');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.24','system','Safe module routing + full module preflight + auth repair');
  return Object.assign({}, result, {
    version:'V4.25',
    module_preflight:preflight,
    auth_repair:auth,
    message:'V4.24: sửa triệt để lỗi module chấm bài làm chặn đăng nhập; kiểm tra đủ module; giữ nguyên OMR/AI, phụ huynh 2026 và dữ liệu hiện có.'
  });
}


// -----------------------------------------------------------------------------
// V4.25 - RECOVERY SETUP / MODULE PREFLIGHT
// This setup intentionally does NOT call the V4.19->V4.24 modular setup chain,
// so a missing optional module cannot prevent auth/core recovery.
// -----------------------------------------------------------------------------
function checkSystemModulesV425(){
  const checks = [
    {file:'Module_ExamCore.gs', fn:'setupExamModuleV420_'},
    {file:'Module_ExamImport.gs', fn:'previewExamJsonDefinition'},
    {file:'Module_ExamUpload.gs', fn:'createExamSubmission'},
    {file:'Module_ExamGrading.gs', fn:'gradeExamSubmissionAI'},
    {file:'Module_ExamReview.gs', fn:'reviewExamSubmission'},
    {file:'Module_ExamParentReport.gs', fn:'getParentGradedExam'},
    {file:'Module_AIProvider.gs', fn:'getAIGradingSettings'},
    {file:'Module_TuitionAuto.gs', fn:'setupTuitionAutoV419_'},
    {file:'Module_ZaloContacts.gs', fn:'getUnreachableZaloStudents'}
  ].map(function(x){ return {file:x.file, fn:x.fn, ok:hasGlobalFunctionV425_(x.fn)}; });
  const missing = checks.filter(function(x){return !x.ok;}).map(function(x){return x.file + ' -> ' + x.fn;});
  return {ok:missing.length===0, missing:missing, modules:checks, version:'V4.25'};
}

function repairAdminLoginV425(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ADMIN_USERNAME_PROPERTY, DEFAULT_ADMIN_USERNAME);
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY, DEFAULT_ADMIN_PASSWORD_HASH);
  props.setProperty(ADMIN_SESSION_VERSION_PROPERTY, Utilities.getUuid());
  securityLog_('ADMIN_AUTH','REPAIRED','V4.25','system','Reset bootstrap credential and rotate all previous admin sessions');
  return {repaired:true, username:DEFAULT_ADMIN_USERNAME, session_hours:ADMIN_SESSION_SECONDS/3600};
}

function setupSystemV425(){
  // Core/base setup only. V4.18 has no dependency on the modular grading files.
  const base=setupSystemV418();
  initSheets();
  const auth=repairAdminLoginV425();
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')) props.setProperty('ANPHUC_EXAM_SHEET_TEMPLATE','ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1');

  const preflight=checkSystemModulesV425();
  const optionalSetup={};
  // Configure optional modules only if present; never block core recovery.
  if(hasGlobalFunctionV425_('setupTuitionAutoV419_')){
    try{optionalSetup.tuition_auto=invokeOptionalModuleV425_({file:'Module_TuitionAuto.gs',fn:'setupTuitionAutoV419_'},{});}catch(e){optionalSetup.tuition_auto_error=String(e.message||e);}
  }
  if(hasGlobalFunctionV425_('setupExamModuleV420_')){
    try{optionalSetup.exam=invokeOptionalModuleV425_({file:'Module_ExamCore.gs',fn:'setupExamModuleV420_'},{});}catch(e){optionalSetup.exam_error=String(e.message||e);}
  }

  invalidateSettingsCache_();
  bumpDataVersion_('setup_v425');
  securityLog_('SYSTEM_SETUP','SUCCESS','V4.25','system','Isolated router + parent/admin recovery + modular preflight');
  return {
    version:'V4.25',
    core_ready:true,
    auth_repair:auth,
    module_preflight:preflight,
    optional_setup:optionalSetup,
    base_version:base && base.version ? base.version : 'V4.18',
    message:preflight.ok
      ? 'V4.25 đã khôi phục đăng nhập và Cổng phụ huynh; toàn bộ module đã sẵn sàng.'
      : 'V4.25 core đã khôi phục. Một số module tùy chọn còn thiếu: ' + preflight.missing.join('; ')
  };
}

function promoteNewSchoolYearV425(params){
  params=params||{};
  // Keep this legacy button safe: require an explicit second confirmation value.
  if(String(params.confirm||'')!=='OK_V425'){
    throw new Error('Chức năng lên lớp cần xác nhận đặc biệt. Phiên V4.25 không tự thay đổi khối học sinh để tránh cập nhật nhầm dữ liệu.');
  }
  throw new Error('Chức năng lên lớp tự động chưa được bật trong V4.25. Hãy xử lý theo danh sách học sinh sau khi sao lưu Sheet.');
}


// -----------------------------------------------------------------------------
// V4.26 - UNIFIED STABLE CORE + SINGLE ZALO GATEWAY
// Không gọi chuỗi setup cũ. Core có thể phục hồi độc lập ngay cả khi module AI thiếu.
// -----------------------------------------------------------------------------
function checkSystemV426(){
  const props=PropertiesService.getScriptProperties();
  const modules=checkSystemModulesV425();
  const gatewayUrl=String(props.getProperty('ZALO_GATEWAY_URL')||'').trim();
  return {
    ok:true,
    version:'V4.27',
    core:{
      spreadsheet_ready:!!getSpreadsheet_(),
      admin_user:String(props.getProperty(ADMIN_USERNAME_PROPERTY)||DEFAULT_ADMIN_USERNAME),
      gateway_url:gatewayUrl,
      wake_key_ready:!!String(props.getProperty(ZALO_WAKE_KEY_PROPERTY)||DEFAULT_ZALO_WAKE_KEY)
    },
    modules:modules
  };
}

function repairAdminLoginV426(){
  const props=PropertiesService.getScriptProperties();
  props.setProperty(ADMIN_USERNAME_PROPERTY,DEFAULT_ADMIN_USERNAME);
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY,DEFAULT_ADMIN_PASSWORD_HASH);
  props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,Utilities.getUuid());
  securityLog_('ADMIN_AUTH','REPAIRED','V4.26','system','Reset bootstrap credential + rotate sessions');
  return {repaired:true,username:DEFAULT_ADMIN_USERNAME,session_hours:ADMIN_SESSION_SECONDS/3600};
}

function setupSystemV426(){
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    initSheets();
    normalizeScoresColumnOrder_();
    fillScoreNames_();
    ensureSingleZaloQueueTrigger_();

    const props=PropertiesService.getScriptProperties();
    if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
    if(!String(props.getProperty('ZALO_GATEWAY_URL')||'').trim()){
      props.setProperty('ZALO_GATEWAY_URL','https://pummel-crumb-ferret.ngrok-free.dev');
    }
    if(!props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')){
      props.setProperty('ANPHUC_EXAM_SHEET_TEMPLATE','ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1');
    }

    const auth=repairAdminLoginV426();
    const moduleCheck=checkSystemModulesV425();
    const optional={};
    if(hasGlobalFunctionV425_('setupTuitionAutoV419_')){
      try{optional.tuition_auto=invokeOptionalModuleV425_({file:'Module_TuitionAuto.gs',fn:'setupTuitionAutoV419_'},{});}catch(e){optional.tuition_auto_error=String(e.message||e);}
    }
    if(hasGlobalFunctionV425_('setupExamModuleV420_')){
      try{optional.exam=invokeOptionalModuleV425_({file:'Module_ExamCore.gs',fn:'setupExamModuleV420_'},{});}catch(e){optional.exam_error=String(e.message||e);}
    }

    invalidateSettingsCache_();
    bumpDataVersion_('setup_v426');
    securityLog_('SYSTEM_SETUP','SUCCESS','V4.26','system','Unified stable core + single simple Zalo gateway + isolated modules');
    return {
      version:'V4.27',
      core_ready:true,
      auth_repair:auth,
      gateway_url:String(props.getProperty('ZALO_GATEWAY_URL')||''),
      module_preflight:moduleCheck,
      optional_setup:optional,
      message:moduleCheck.ok
        ? 'V4.26 sẵn sàng: đăng nhập, phụ huynh, Zalo và toàn bộ module đã đồng bộ.'
        : 'V4.26 core đã sẵn sàng; một số module tùy chọn thiếu: '+moduleCheck.missing.join('; ')
    };
  }finally{
    try{lock.releaseLock();}catch(e){}
  }
}


// -----------------------------------------------------------------------------
// V4.27 - EXAM STABILIZATION + CLASS-SCOPED ATTENDANCE K2
// Chỉ cô lập module Chấm bài và sửa cảnh báo K2 theo đúng lớp.
// Các module ổn định khác giữ nguyên hành vi V4.26.
// -----------------------------------------------------------------------------
const V427_BUILD_ID = 'V4.27-20261031-01';

function moduleHealthV427_(file, fn){
  return {file:file, entrypoint:fn, ready:hasGlobalFunctionV425_(fn)};
}

function getSystemManifestV427(){
  const modules = {
    exam_core: moduleHealthV427_('Module_ExamCore.gs','setupExamModuleV420_'),
    exam_import: moduleHealthV427_('Module_ExamImport.gs','previewExamJsonDefinition'),
    exam_upload: moduleHealthV427_('Module_ExamUpload.gs','createExamSubmission'),
    exam_grading: moduleHealthV427_('Module_ExamGrading.gs','gradeExamSubmissionAI'),
    exam_review: moduleHealthV427_('Module_ExamReview.gs','reviewExamSubmission'),
    exam_parent: moduleHealthV427_('Module_ExamParentReport.gs','getParentGradedExam'),
    ai_provider: moduleHealthV427_('Module_AIProvider.gs','getAIGradingSettings'),
    tuition_auto: moduleHealthV427_('Module_TuitionAuto.gs','setupTuitionAutoV419_'),
    zalo_contacts: moduleHealthV427_('Module_ZaloContacts.gs','getUnreachableZaloStudents')
  };
  const examKeys=['exam_core','exam_import','exam_upload','exam_grading','exam_review','exam_parent','ai_provider'];
  const missingExam=examKeys.filter(k=>!modules[k].ready).map(k=>modules[k].file+' -> '+modules[k].entrypoint);
  return {
    version:'V4.27',
    build:V427_BUILD_ID,
    api_build:ANPHUC_API_BUILD,
    core_ready:true,
    exam_ready:missingExam.length===0,
    missing_exam:missingExam,
    modules:modules,
    attendance_k2_scope:'student_id + class_code + session_date'
  };
}

function checkSystemModulesV427(){
  const m=getSystemManifestV427();
  const missingAll=Object.keys(m.modules).filter(k=>!m.modules[k].ready).map(k=>m.modules[k].file+' -> '+m.modules[k].entrypoint);
  return {ok:missingAll.length===0, exam_ready:m.exam_ready, missing:missingAll, missing_exam:m.missing_exam, modules:m.modules, version:'V4.27', build:V427_BUILD_ID};
}

function checkSystemV427(){
  const props=PropertiesService.getScriptProperties();
  return {
    ok:true,
    version:'V4.27',
    build:V427_BUILD_ID,
    core:{
      spreadsheet_ready:!!getSpreadsheet_(),
      admin_user:String(props.getProperty(ADMIN_USERNAME_PROPERTY)||DEFAULT_ADMIN_USERNAME),
      gateway_url:String(props.getProperty('ZALO_GATEWAY_URL')||'').trim()
    },
    manifest:getSystemManifestV427()
  };
}

function setupSystemV427(){
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    initSheets();
    normalizeScoresColumnOrder_();
    fillScoreNames_();
    ensureSingleZaloQueueTrigger_();
    const props=PropertiesService.getScriptProperties();
    if(!props.getProperty(ZALO_WAKE_KEY_PROPERTY))props.setProperty(ZALO_WAKE_KEY_PROPERTY,DEFAULT_ZALO_WAKE_KEY);
    if(!String(props.getProperty('ZALO_GATEWAY_URL')||'').trim()) props.setProperty('ZALO_GATEWAY_URL','https://pummel-crumb-ferret.ngrok-free.dev');
    if(!props.getProperty('ANPHUC_EXAM_SHEET_TEMPLATE')) props.setProperty('ANPHUC_EXAM_SHEET_TEMPLATE','ANPHUC_OMR_12MC_4TF_4SA_ESSAY_V1');

    // Giữ cơ chế đăng nhập đang ổn định; chỉ rotate session để tránh token cũ lệch version.
    props.setProperty(ADMIN_SESSION_VERSION_PROPERTY,Utilities.getUuid());

    const manifest=getSystemManifestV427();
    const optional={};
    if(manifest.modules.tuition_auto.ready){
      try{optional.tuition_auto=invokeOptionalModuleV425_({file:'Module_TuitionAuto.gs',fn:'setupTuitionAutoV419_'},{});}catch(e){optional.tuition_auto_error=String(e.message||e);}
    }
    if(manifest.modules.exam_core.ready){
      try{optional.exam=invokeOptionalModuleV425_({file:'Module_ExamCore.gs',fn:'setupExamModuleV420_'},{});}catch(e){optional.exam_error=String(e.message||e);}
    }
    invalidateSettingsCache_();
    bumpDataVersion_('setup_v427');
    securityLog_('SYSTEM_SETUP','SUCCESS','V4.27','system','Exam stabilization + class-scoped K2 attendance; stable modules preserved');
    return {
      version:'V4.27', build:V427_BUILD_ID, core_ready:true,
      manifest:manifest, optional_setup:optional,
      message:manifest.exam_ready
        ? 'V4.27 sẵn sàng. Module chấm bài đủ; cảnh báo K2 đã khóa theo đúng lớp.'
        : 'V4.27 core sẵn sàng nhưng module Chấm bài còn thiếu: '+manifest.missing_exam.join('; ')
    };
  } finally { try{lock.releaseLock();}catch(e){} }
}


// V4.28 manual one-time setup; DOES NOT change passwords, students, attendance or other modules.
function setupZaloV428() {
  const meta = ensureMessageLogColumns_();
  return {success:true,version:'V4.28-Zalo',columns_added_or_verified:['recipient_type','group_name','next_retry_at'],
    sheet:meta.sheet.getName(),queue:getZaloQueueStatus(),message:'Khong can deploy frontend; chi can Deploy New Version Apps Script.'};
}

// V4.28.1 dedicated one-time installation; does not change student or admin data.
function setupZaloV4281() {
  const meta=ensureMessageLogColumns_();
  const trigger=ensureSingleZaloQueueTrigger_();
  return {success:true,version:'V4.28.1-Zalo',trigger,queue:getZaloQueueStatus(),
    sheet:meta.sheet.getName(),message:'Da tao/kiem tra trigger moi phut. Khong can deploy index.html.'};
}

// Run manually in Apps Script editor to see why some grades are not sent.
// Diagnostics are read-only: they never resend or edit students.
function diagnoseZaloV4281(month,year) {
  const t=ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()==='processZaloQueue');
  const now=new Date(),recent=new Date(now.getFullYear(),now.getMonth()-(now.getDate()<=7?1:0),1);
  const m=month||recent.getMonth()+1,y=year||recent.getFullYear();
  const meta=ensureMessageLogColumns_(),rows=meta.sheet.getDataRange().getValues(),heads=rows[0].map(String);
  const ix=k=>heads.indexOf(k);const byGrade={},unfinished=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i],type=String(r[ix('message_type')]||'').toUpperCase();
    if(type!=='CLASS_SESSION_REPORT')continue;
    if(String(r[ix('month')]||'').trim()!==String(m) || String(r[ix('year')]||'').trim()!==String(y))continue;
    const cl=String(r[ix('class_name')]||'').trim();
    const match=cl.match(/^[Kk]?(\d{1,2})/),grade=match?match[1]:'UNKNOWN';
    const state=String(r[ix('status')]||'').toUpperCase();
    if(!byGrade[grade])byGrade[grade]={total:0,statuses:{},classes:[]};
    const v=byGrade[grade];v.total++;v.statuses[state]=(v.statuses[state]||0)+1;
    v.classes.push({class_name:cl,group_name:String(r[ix('group_name')]||r[ix('zalo_name')]||''),status:state,
      last_attempt:r[ix('last_attempt_at')]||'',log_id:String(r[ix('log_id')]||'')});
    if(state==='PROCESSING'||state==='REVIEW_REQUIRED')unfinished.push({class_name:cl,state,log_id:String(r[ix('log_id')]||'')});
  }
  let report=[],reportError='';
  try {report=getLessonReport({month:String(m),year:String(y)}).map(x=>({class_name:x.class_name,zalo_name:x.zalo_name||''}));}
  catch(e){reportError=String(e.message||e);}
  const listed=new Set(Object.values(byGrade).flatMap(g=>g.classes.map(x=>x.class_name)));
  const result={version:'V4.28.1-Zalo',time:now,month:m,year:y,trigger_count:t.length,queue:getZaloQueueStatus(),by_grade:byGrade,
    classes_in_month:report.length,not_queued_classes:report.filter(x=>!listed.has(x.class_name)),
    unfinished,report_error:reportError,
    help:'Neu trigger_count=0, chay setupZaloV4281(). REVIEW_REQUIRED phai kiem tra tin da gui tren Zalo truoc khi gui lai.'};
  Logger.log(JSON.stringify(result));
  return result;
}


// ===== AN PHUC SCORE MEDIA V4.28.1 (INTEGRATED; APPROVAL REQUIRED) =====
/**
 * AN PHUC – Score Media Add-on V1 (GAS V8).
 * Add as a NEW file in the SAME Apps Script project as Code.gs V4.27.
 * Does not replace existing attendance/tuition/message routes.
 * IMPORTANT: Register only the 4 media actions in the EXISTING authenticated
 * router as documented in HUONG_DAN_TICH_HOP_ZALO.md. No public endpoints.
 */
// Dia chi do giao vien xac nhan; scoreMediaSetup() dien tu dong vao Script Properties.
const SM_DEFAULT_DRIVE_FOLDER_ID = '1yEYr9f8UhQL5iS35FBqiRxgXOMGFWlnG';
const SM_DEFAULT_GATEWAY_URL = 'https://pummel-crumb-ferret.ngrok-free.dev';
const SM_GROUP_SHEET = 'ZaloGroupMappings';
const SM_QUEUE_SHEET = 'ZaloMediaQueue';
const SM_FIELDS = ['job_id','client_request_id','created_at','updated_at','status','grade','class_name','group_id','group_name','test_date','test_type','test_title','message','send_text','send_png','send_excel','png_file_id','excel_file_id','records_json','text_status','png_status','excel_status','last_error','approved_at','approved_by','text_receipt','png_receipt','excel_receipt'];
const SM_GROUP_FIELDS = ['grade','class_name','group_id','group_name','verified_at','enabled'];

function scoreMediaSpreadsheet_() {
  if (typeof getSpreadsheet_ === 'function') return getSpreadsheet_();
  const id = PropertiesService.getScriptProperties().getProperty('SCORE_MEDIA_SPREADSHEET_ID');
  if (!id) throw new Error('Chưa cấu hình SCORE_MEDIA_SPREADSHEET_ID.');
  return SpreadsheetApp.openById(id);
}
function scoreMediaRequireAuth_(p) {
  // Fail closed: never allow a public caller to send to a Zalo group.
  if (typeof validateAdminSession !== 'function') throw new Error('Thiếu xác thực V4.27: cần adapter validateAdminSession.');
  const checked = validateAdminSession({_auth_token:String(p._auth_token||''),_client_id:String(p._client_id||'')});
  const data = checked && (checked.data || checked);
  if (!data || data.valid !== true) throw new Error('Phiên giáo viên không hợp lệ hoặc đã hết hạn.');
  return String(data.username||data.user||'admin');
}
function scoreMediaSetup() {
  // Chi thiet lap cac gia tri media da duoc giao vien cung cap.
  // Tuyet doi khong sua SCORE_MEDIA_GATEWAY_SECRET: khoa phai tao tren may giao vien.
  const props=PropertiesService.getScriptProperties();
  props.setProperty('SCORE_MEDIA_DRIVE_FOLDER_ID', SM_DEFAULT_DRIVE_FOLDER_ID);
  props.setProperty('SCORE_MEDIA_GATEWAY_URL', SM_DEFAULT_GATEWAY_URL);
  // The text queue and score-media queue MUST use the same confirmed Ngrok domain.
  // This change runs only after the owner explicitly executes scoreMediaSetup().
  const oldTextGateway=String(props.getProperty('ZALO_GATEWAY_URL')||'').trim();
  props.setProperty('ZALO_GATEWAY_URL', SM_DEFAULT_GATEWAY_URL);
  if(oldTextGateway && oldTextGateway!==SM_DEFAULT_GATEWAY_URL)
    console.warn('V4.28.8: ZALO_GATEWAY_URL được đồng bộ sang domain Ngrok đã xác nhận.');
  // Kiem tra quyen truy cap Drive truoc khi tao sheet, tra loi de hieu khi chua co quyen.
  const reportFolder=DriveApp.getFolderById(SM_DEFAULT_DRIVE_FOLDER_ID);
  if(!reportFolder || !reportFolder.getName()) throw new Error('Khong truy cap duoc thu muc Drive An Phuc ZaloReports. Kiem tra tai khoan Apps Script va quyen thu muc.');
  const ss=scoreMediaSpreadsheet_();
  [[SM_GROUP_SHEET,SM_GROUP_FIELDS],[SM_QUEUE_SHEET,SM_FIELDS]].forEach(function(spec) {
    let sh=ss.getSheetByName(spec[0]);if(!sh)sh=ss.insertSheet(spec[0]);
    if(sh.getLastRow()===0){sh.appendRow(spec[1]);sh.setFrozenRows(1);sh.getRange(1,1,1,spec[1].length).setBackground('#dbeafe').setFontWeight('bold');}
    const existing=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(String);
    spec[1].forEach(function(h){if(existing.indexOf(h)<0){sh.getRange(1,sh.getLastColumn()+1).setValue(h);existing.push(h);}});
  });
  const groups=ss.getSheetByName(SM_GROUP_SHEET);
  if(groups.getLastRow()<2 && typeof CLASS_ZALO_GROUPS==='object'){
    const map=typeof getClassZaloMap_==='function'?getClassZaloMap_():CLASS_ZALO_GROUPS;
    const values=Object.keys(map).filter(k=>/^(6|7|8|9|10|11|12)[A-Z0-9]+$/.test(k)).sort().map(code=>{
      const match=code.match(/^(6|7|8|9|10|11|12)(.+)$/);
      return [match[1],match[2],'AP_'+code+'_INTERNAL',String(map[code]||''),'',false];
    });
    if(values.length)groups.getRange(2,1,values.length,SM_GROUP_FIELDS.length).setValues(values);
  }
  scoreMediaEnsureTrigger_();
  return {ready:true,folder:reportFolder.getName(),gateway:SM_DEFAULT_GATEWAY_URL,secret_configured:String(props.getProperty('SCORE_MEDIA_GATEWAY_SECRET')||'').length>=24,sheets:[SM_GROUP_SHEET,SM_QUEUE_SHEET],note:'Drive/Ngrok da tu dien. Neu secret_configured=false, chi can dan 1 khoa vao Script Properties. Cac nhom moi dang khoa cho den khi giao vien xac minh.'};
}
// Pending group report jobs are retried ONLY if no transmission was attempted.
// The authenticated Gateway retains a persistent per-component ledger.
function scoreMediaEnsureTrigger_(){
  const all=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='scoreMediaProcessPending');
  if(!all.length)ScriptApp.newTrigger('scoreMediaProcessPending').timeBased().everyMinutes(1).create();
  if(all.length>1)all.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  if(typeof ensureSingleZaloQueueTrigger_==='function')ensureSingleZaloQueueTrigger_();
  return {media_trigger:true,parent_text_trigger:true};
}
function scoreMediaProcessPending(){
  const jobs=scoreMediaItems_(SM_QUEUE_SHEET).filter(x=>String(x.data.status)==='QUEUED').slice(0,3);
  const results=[];
  for(const job of jobs){
    try{results.push(scoreMediaProcessOne_(String(job.data.job_id)));}
    catch(e){results.push({job_id:String(job.data.job_id),status:'QUEUED',error:String(e.message||e)});}
  }
  return {processed:results.length,results};
}
function scoreMediaSheet_(name) {
  const sh=scoreMediaSpreadsheet_().getSheetByName(name);
  if(!sh)throw new Error('Thiếu sheet '+name+'. Hãy chạy scoreMediaSetup() một lần.');
  return sh;
}
function scoreMediaItems_(name){
  const sh=scoreMediaSheet_(name),values=sh.getDataRange().getValues();if(values.length<2)return [];
  const heads=values[0].map(String);
  return values.slice(1).map((values,i)=>({row:i+2,data:heads.reduce((o,k,n)=>(o[k]=values[n],o),{})}));
}
function scoreMediaFieldIndex_(sh){
  const names=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  return Object.fromEntries(names.map((n,i)=>[String(n),i]));
}
function scoreMediaSave_(sheet,row,changes){
  const sh=scoreMediaSheet_(sheet),indices=scoreMediaFieldIndex_(sh);
  Object.keys(changes).forEach(function(k){if(indices[k]===undefined)throw new Error('Thiếu cột '+k);sh.getRange(row,indices[k]+1).setValue(changes[k]);});
}
function scoreMediaAppend_(changes){
  const sh=scoreMediaSheet_(SM_QUEUE_SHEET),idx=scoreMediaFieldIndex_(sh);
  const values=Array(sh.getLastColumn()).fill('');Object.keys(changes).forEach(k=>{if(idx[k]===undefined)throw new Error('Thiếu cột '+k);values[idx[k]]=changes[k];});
  sh.appendRow(values);return sh.getLastRow();
}
function scoreMediaRequireContext_(p){
  const grade=String(p.grade||'').trim(),className=String(p.className||'').trim();
  if(!/^(6|7|8|9|10|11|12)$/.test(grade)||!/^[\p{L}0-9 ()_-]{1,40}$/u.test(className))throw new Error('Khối/lớp không hợp lệ.');
  return {grade,className};
}
function scoreMediaGroup_(p){
  const c=scoreMediaRequireContext_(p),code=classCode(c.grade,c.className);
  // Nguồn chân lý DUY NHẤT: cấu hình nhóm ở phần Báo cáo/Cài đặt lớp (sheet Settings).
  // Không bắt GV phải duy trì một tên nhóm khác trong ZaloGroupMappings.
  const name=String(getClassZaloName(c.grade,c.className)||'').trim();
  if(!name)throw new Error('Lớp '+code+' chưa có nhóm Zalo trong phần Báo cáo / Cấu hình lớp. Hãy thiết lập tên nhóm tại đó.');
  const maps=scoreMediaItems_(SM_GROUP_SHEET).filter(x=>String(x.data.grade).trim()===c.grade&&String(x.data.class_name).trim().toUpperCase()===c.className.toUpperCase());
  if(maps.length>1)throw new Error('Có nhiều dòng cho lớp '+code+' trong ZaloGroupMappings; cần xử lý dữ liệu trùng để tránh gửi nhầm.');
  const row=maps.length?maps[0].data:null;
  // Nếu đã xác minh và khóa thủ công: giữ chính sách khóa, tuyệt đối không tự mở.
  const verified=!!(row&&row.verified_at),enabled=!!(row&&['TRUE','1','YES','ON','ENABLED'].includes(String(row.enabled).toUpperCase()));
  if(verified&&!enabled)throw new Error('Nhóm lớp '+code+' đã bị khóa gửi trong ZaloGroupMappings. Hãy kiểm tra với quản trị viên.');
  const sameName=!!(row&&String(row.group_name||'').trim().normalize('NFC')===name.normalize('NFC'));
  const id=String(row&&row.group_id||'').trim()||('AP_'+code+'_INTERNAL');
  // Nếu tên nhóm thay đổi trong Báo cáo thì GV phải xem trước và duyệt lại.
  // Gateway luôn nhận tên nhóm mới lấy trực tiếp từ Settings.
  return {grade:c.grade,class_name:c.className,group_id:id,group_name:name,
    verified_at:verified&&sameName?String(row.verified_at):'',mapping_verified:verified&&enabled&&sameName,
    source:'class_report_settings',enabled:true};
}
function getScoreReportDestination(p){scoreMediaRequireAuth_(p);return scoreMediaGroup_(p);}
function scoreMediaNormalizeScore_(v){
  const s=String(v===null||v===undefined?'':v).trim().replace(',','.');
  if(!s||/^(vắng|vang|p|k|nghỉ|nghi)$/i.test(s))return '';
  if(!/^\d+(?:\.\d+)?$/.test(s)||!isFinite(Number(s))||Number(s)<0||Number(s)>10)throw new Error('Có điểm không hợp lệ.');
  return String(Number(s));
}
function scoreMediaVerifySaved_(p){
  if(typeof getScoresByClass!=='function')throw new Error('Backend chưa tích hợp hàm getScoresByClass để đối chiếu dữ liệu đã lưu.');
  // This must call the existing V4.27 score reader, NEVER trust client scores alone.
  const q={grade:p.grade,className:p.className,test_date:p.test_date,test_type:p.test_type,test_title:p.test_title};
  const result=getScoresByClass(q),actual=Array.isArray(result)?result:(Array.isArray(result&&result.data)?result.data:[]);
  const client=Array.isArray(p.records)?p.records:[];
  if(!actual.length||client.length!==actual.length)throw new Error('Danh sách học sinh chưa được lưu hoặc không trùng dữ liệu Sheets. Hãy tải lại điểm.');
  if(new Set(client.map(x=>String(x.student_id||''))).size!==client.length)throw new Error('Danh sách có mã học sinh trùng; không thể gửi.');
  const byId=new Map(actual.map(x=>[String(x.student_id||''),x]));
  if(!client.length||!actual.some(x=>String(x.score_id||'').trim()))throw new Error('Chưa có bảng điểm nào được lưu cho bài kiểm tra này.');
  for(const r of client){
    const id=String(r.student_id||''),saved=byId.get(id);
    if(!id||!saved)throw new Error('Không tìm thấy học sinh trong dữ liệu Sheets.');
    if(String(saved.score_id||'').trim() && String(saved.test_title||'').trim()!==String(p.test_title||'').trim())throw new Error('Tên bài kiểm tra đã khác dữ liệu Google Sheets; vui lòng tải lại điểm.');
    if(scoreMediaNormalizeScore_(saved.score)!==scoreMediaNormalizeScore_(r.score))throw new Error('Điểm đã thay đổi trên Google Sheets. Vui lòng tải lại bảng điểm.');
    // Comments are stored by saveScores. If backend normalizes absent comments,
    // both must still match the currently stored version before release.
    if(String(saved.comment||'').trim()!==String(r.comment||'').trim())throw new Error('Nhận xét đã thay đổi trên Google Sheets. Vui lòng tải lại bảng điểm.');
  }
}
function scoreMediaDecode_(value,mime,maxBytes){
  const data=String(value||'');if(data.length>Math.ceil(maxBytes*4/3)+8)throw new Error('Tệp đính kèm quá kích thước cho phép.');
  if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(data))throw new Error('Tệp đính kèm không đúng base64.');
  const bytes=Utilities.base64Decode(data);if(bytes.length>maxBytes)throw new Error('Tệp vượt giới hạn '+maxBytes+' byte.');
  // GAS Utilities.base64Decode() may expose bytes as signed values (-119 instead of 137).
  const unsigned=i=>(bytes[i]&255);
  if(mime==='image/png' && !(bytes.length>=8&&unsigned(0)===137&&unsigned(1)===80&&unsigned(2)===78&&unsigned(3)===71&&unsigned(4)===13&&unsigned(5)===10&&unsigned(6)===26&&unsigned(7)===10))throw new Error('Không phải ảnh PNG hợp lệ.');
  if(mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && !(bytes[0]===80&&bytes[1]===75))throw new Error('Không phải file XLSX hợp lệ.');
  return Utilities.newBlob(bytes,mime);
}
function scoreMediaFilename_(value,suffix){
  let name=String(value||'').replace(/[^a-zA-Z0-9_\-.]/g,'_').slice(0,120);
  if(!name.toLowerCase().endsWith(suffix))name+=suffix;
  return name;
}
function scoreMediaDriveFolder_(){
  const id=PropertiesService.getScriptProperties().getProperty('SCORE_MEDIA_DRIVE_FOLDER_ID');
  if(!id)throw new Error('Thiếu SCORE_MEDIA_DRIVE_FOLDER_ID trong Script Properties.');
  return DriveApp.getFolderById(id);
}
function prepareScoreGroupReport(p){
  const username=scoreMediaRequireAuth_(p),dest=scoreMediaGroup_(p);
  if(String(dest.group_id)!==String(p.group_id||''))throw new Error('Mã nhóm Zalo không khớp cấu hình.');
  const requestId=String(p.request_id||'');if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))throw new Error('Mã yêu cầu không hợp lệ.');
  const existing=scoreMediaItems_(SM_QUEUE_SHEET).find(x=>String(x.data.client_request_id)===requestId);
  if(existing)return {draft_id:existing.data.job_id,group_id:existing.data.group_id,status:existing.data.status,duplicate:true};
  const text=p.send_text===true,png=p.send_png===true,excel=p.send_excel===true;
  if(!text&&!png&&!excel)throw new Error('Chưa chọn nội dung cần gửi.');
  const message=String(p.message||'').trim();if(text&&(!message||message.length>3500))throw new Error('Nội dung tin nhắn trống hoặc dài quá 3500 ký tự.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(p.test_date||''))||!String(p.test_type||'').trim()||!String(p.test_title||'').trim())throw new Error('Thiếu thông tin bài kiểm tra.');
  if(String(p.test_title).length>200)throw new Error('Tên bài kiểm tra quá dài.');
  scoreMediaVerifySaved_(p);
  const lock=LockService.getScriptLock();lock.waitLock(28000);
  try{
    const again=scoreMediaItems_(SM_QUEUE_SHEET).find(x=>String(x.data.client_request_id)===requestId);
    if(again)return {draft_id:again.data.job_id,group_id:again.data.group_id,status:again.data.status,duplicate:true};
    const folder=scoreMediaDriveFolder_(),id=Utilities.getUuid(),now=new Date().toISOString();
    let pngId='',excelId='';
    try{
      if(png){if(!p.png_base64)throw new Error('Thiếu ảnh PNG.');pngId=folder.createFile(scoreMediaDecode_(p.png_base64,'image/png',4*1024*1024).setName(scoreMediaFilename_(p.png_filename,'.png'))).getId();}
      if(excel){if(!p.excel_base64)throw new Error('Thiếu Excel.');excelId=folder.createFile(scoreMediaDecode_(p.excel_base64,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',4*1024*1024).setName(scoreMediaFilename_(p.excel_filename,'.xlsx'))).getId();}
      scoreMediaAppend_({job_id:id,client_request_id:requestId,created_at:now,updated_at:now,status:'PREPARED',grade:dest.grade,class_name:dest.class_name,group_id:dest.group_id,group_name:dest.group_name,test_date:p.test_date,test_type:p.test_type,test_title:p.test_title,message:message,send_text:text,send_png:png,send_excel:excel,png_file_id:pngId,excel_file_id:excelId,records_json:JSON.stringify(p.records),text_status:text?'PENDING':'SKIPPED',png_status:png?'PENDING':'SKIPPED',excel_status:excel?'PENDING':'SKIPPED',approved_by:username});
    }catch(e){if(pngId)DriveApp.getFileById(pngId).setTrashed(true);if(excelId)DriveApp.getFileById(excelId).setTrashed(true);throw e;}
    return {draft_id:id,group_id:dest.group_id,group_name:dest.group_name,status:'PREPARED'};
  }finally{lock.releaseLock();}
}
function scoreMediaGetJob_(jobId){
  const result=scoreMediaItems_(SM_QUEUE_SHEET).find(x=>String(x.data.job_id)===String(jobId));
  if(!result)throw new Error('Không tìm thấy lệnh gửi.');return result;
}
function approveScoreGroupReport(p){
  const username=scoreMediaRequireAuth_(p);
  const conf=PropertiesService.getScriptProperties();
  if(!/^https:\/\//i.test(String(conf.getProperty('SCORE_MEDIA_GATEWAY_URL')||''))||String(conf.getProperty('SCORE_MEDIA_GATEWAY_SECRET')||'').length<24)throw new Error('Chưa cấu hình SCORE_MEDIA_GATEWAY_URL HTTPS và SCORE_MEDIA_GATEWAY_SECRET (ít nhất 24 ký tự); không thể duyệt gửi.');
  const lock=LockService.getScriptLock();lock.waitLock(28000);
  let job;
  try{
    job=scoreMediaGetJob_(p.draft_id);let d=job.data;
    if(String(d.group_id)!==String(p.group_id||''))throw new Error('Nhóm nhận khác với bản đã chuẩn bị.');
    if(d.status!=='PREPARED')return {job_id:d.job_id,status:d.status,duplicate:true};
    const currentGroup=scoreMediaGroup_({grade:d.grade,className:d.class_name});
    if(String(currentGroup.group_id)!==String(d.group_id)||String(currentGroup.group_name)!==String(d.group_name))throw new Error('Nhóm nhận đã thay đổi sau khi xem trước; cần tạo báo cáo mới.');
    scoreMediaVerifySaved_({grade:d.grade,className:d.class_name,test_date:d.test_date,test_type:d.test_type,test_title:d.test_title,records:JSON.parse(String(d.records_json||'[]'))});
    scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'QUEUED',approved_at:new Date().toISOString(),approved_by:username,updated_at:new Date().toISOString()});
  }finally{lock.releaseLock();}
  // One immediate attempt; if uncertain, do not automatically retry the same message.
  try{scoreMediaProcessOne_(p.draft_id);}catch(e){console.warn('Score media:',e.message);}
  job=scoreMediaGetJob_(p.draft_id);
  return {job_id:job.data.job_id,status:job.data.status};
}
function scoreMediaHmac_(body,secret){
  const mac=Utilities.computeHmacSha256Signature(body,secret);
  return Utilities.base64EncodeWebSafe(mac).replace(/=+$/,'');
}
function scoreMediaProcessOne_(jobId){
  let job=scoreMediaGetJob_(jobId),d=job.data;
  if(String(d.status)!=='QUEUED')return {job_id:jobId,status:d.status};
  const props=PropertiesService.getScriptProperties();
  const url=String(props.getProperty('SCORE_MEDIA_GATEWAY_URL')||'').replace(/\/+$/,''),secret=String(props.getProperty('SCORE_MEDIA_GATEWAY_SECRET')||'');
  if(!/^https:\/\//i.test(url)||secret.length<24)throw new Error('Gateway media cần URL HTTPS và secret ít nhất 24 ký tự.');
  // Preflight is independent of the send endpoint. If offline, keep QUEUED.
  try{
    const health=UrlFetchApp.fetch(url+'/health',{muteHttpExceptions:true,followRedirects:false,headers:zaloGatewayHeadersV4291_()});
    if(health.getResponseCode()!==200)throw new Error('Gateway chưa sẵn sàng (HTTP '+health.getResponseCode()+').');
    const h=JSON.parse(health.getContentText());
    if(h.browser_alive!==true||h.zalo_authenticated!==true||h.score_media_ready!==true||h.boot_state!=='ready')throw new Error('Gateway chưa đăng nhập Zalo hoặc chức năng gửi ảnh chưa sẵn sàng: '+String(h.score_media_error||h.boot_error||h.boot_state||''));
  }catch(e){
    scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'QUEUED',updated_at:new Date().toISOString(),last_error:'Đang chờ Gateway: '+String(e.message||e).slice(0,250)});
    return {job_id:jobId,status:'QUEUED'};
  }
  const lock=LockService.getScriptLock();lock.waitLock(28000);
  try{
    job=scoreMediaGetJob_(jobId);
    if(String(job.data.status)!=='QUEUED')return {job_id:jobId,status:job.data.status};
    scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'SENDING',updated_at:new Date().toISOString()});
  }finally{lock.releaseLock();}
  d=job.data;
  try{
    const parts=[];
    if(String(d.send_text).toLowerCase()==='true')parts.push({kind:'text',message:String(d.message||'')});
    for(const item of [{enabled:d.send_png,kind:'png',id:d.png_file_id},{enabled:d.send_excel,kind:'excel',id:d.excel_file_id}]){
      if(String(item.enabled).toLowerCase()!=='true')continue;
      const blob=DriveApp.getFileById(String(item.id)).getBlob();
      if(blob.getSize()>4*1024*1024)throw new Error('Tệp '+item.kind+' vượt giới hạn 4 MB.');
      parts.push({kind:item.kind,filename:DriveApp.getFileById(String(item.id)).getName(),data_base64:Utilities.base64Encode(blob.getBytes())});
    }
    if(!parts.length)throw new Error('Lệnh gửi không có thành phần hợp lệ.');
    const payload=JSON.stringify({job_id:String(d.job_id),group_id:String(d.group_id),group_name:String(d.group_name),parts});
    const res=UrlFetchApp.fetch(url+'/anphuc/score-media',{
      method:'post',contentType:'application/json',payload,
      headers:Object.assign({'X-AP-Score-Signature':scoreMediaHmac_(payload,secret)},zaloGatewayHeadersV4291_()),muteHttpExceptions:true,followRedirects:false
    });
    if(res.getResponseCode()===503){
      try{
        const notice=JSON.parse(res.getContentText());
        if(notice.status==='NOT_READY_NO_DISPATCH'){
          scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'QUEUED',updated_at:new Date().toISOString(),last_error:'Gateway tạm offline trước khi gửi. Sẽ tự thử khi online.'});
          return {job_id:jobId,status:'QUEUED'};
        }
      }catch(_){}
    }
    if(res.getResponseCode()!==200){
      const error='Gateway HTTP '+res.getResponseCode()+': '+res.getContentText().slice(0,180);
      if([400,403,413].includes(res.getResponseCode())){
        scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'FAILED',updated_at:new Date().toISOString(),last_error:error});
        return {job_id:jobId,status:'FAILED',error};
      }
      throw new Error(error);
    }
    const result=JSON.parse(res.getContentText()),components=result.components||{};
    const statuses=parts.map(part=>String(components[part.kind]?.status||'UNKNOWN'));
    const all=statuses.every(x=>x==='SENT'),any=statuses.some(x=>x==='SENT');
    const overall=all?'SENT':any?'PARTIAL':'UNKNOWN';
    const receipts={};['text','png','excel'].forEach(kind=>{if(components[kind]){
      receipts[kind+'_status']=components[kind].status||'UNKNOWN';
      receipts[kind+'_receipt']=String(components[kind].message_id||'');
    }});
    scoreMediaSave_(SM_QUEUE_SHEET,job.row,Object.assign({status:overall,updated_at:new Date().toISOString(),last_error:String(result.error||Object.entries(components).filter(x=>x[1]?.error).map(x=>x[0]+': '+x[1].error).join(' | ')||'').slice(0,400)},receipts));
    return {job_id:jobId,status:overall};
  }catch(e){
    // Gateway or Chrome might have sent something before an exception.
    // No implicit retry: an administrator must inspect the Zalo group.
    scoreMediaSave_(SM_QUEUE_SHEET,job.row,{status:'UNKNOWN',updated_at:new Date().toISOString(),last_error:String(e.message||e).slice(0,400)});
    return {job_id:jobId,status:'UNKNOWN'};
  }
}
function getScoreGroupSendStatus(p){
  scoreMediaRequireAuth_(p);const d=scoreMediaGetJob_(p.job_id).data;
  return {job_id:d.job_id,status:String(d.status),grade:String(d.grade),class_name:String(d.class_name),group_name:String(d.group_name),text_status:String(d.text_status),png_status:String(d.png_status),excel_status:String(d.excel_status),last_error:String(d.last_error||''),updated_at:String(d.updated_at||'')};
}



// Gửi hàng loạt tin RIÊNG cho PH có điểm >=9 hoặc <=5, chỉ sau khi GV đã lưu và xác nhận.
// Tận dụng MessageLogs/Zalo queue cũ, KHÔNG gửi trực tiếp từ frontend và KHÔNG gửi cả lớp.
function queueScoreParentHighlights(p){
  p=p||{};scoreMediaRequireAuth_(p);
  const ctx=scoreMediaRequireContext_(p),kind=String(p.kind||'');
  if(!['high','low','both'].includes(kind))throw new Error('Nhóm điểm không hợp lệ.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(p.test_date||''))||!String(p.test_type||'')||!String(p.test_title||'').trim())throw new Error('Thiếu bài kiểm tra hoặc ngày kiểm tra.');
  if(!Array.isArray(p.records)||p.records.length>100)throw new Error('Số lượng học sinh không hợp lệ (tối đa 100).');
  scoreMediaVerifySaved_(p); // Phải khớp Sheets, không tin điểm từ trình duyệt.
  const actual=getScoresByClass({grade:ctx.grade,className:ctx.className,test_date:p.test_date,test_type:p.test_type,test_title:p.test_title});
  const notes=(p.notes&&typeof p.notes==='object'&&!Array.isArray(p.notes))?p.notes:{};
  const items=[],missing=[],students=filterStudents_(getSheetData('Students',getSpreadsheet_()),{grade:ctx.grade,className:ctx.className});
  const studentsById=new Map(students.map(s=>[String(s.student_id),s]));
  const dateText=String(p.test_date).split('-').reverse().join('/');
  let eligible=0;
  actual.forEach(row=>{
    const score=scoreMediaNormalizeScore_(row.score);
    if(score==='')return;
    const value=Number(score),high=value>=9,low=value<=5;
    if(!(kind==='both'?(high||low):kind==='high'?high:low))return;
    eligible++;
    const id=String(row.student_id||''),student=studentsById.get(id);if(!student)return;
    const phone=normalizeVietnamPhone(student.parent_phone),zaloName=String(student.zalo_name||'').trim();
    if(!phone&&!zaloName){missing.push({student_id:id,name:student.name});return;}
    const teacherNote=String(notes[id]!==undefined?notes[id]:'').trim();
    if(teacherNote.length>1000)throw new Error('Nhận xét quá dài với em '+student.name);
    const own=String(row.comment||'').trim();
    const defaultNote=high
      ?'Trung tâm xin chúc mừng gia đình! Em đã có kết quả học tập nổi bật, thể hiện sự chăm chỉ và nắm vững kiến thức.'+(own?' Nhận xét của giáo viên: '+own+'.':'')+' Mong gia đình tiếp tục động viên em phát huy tinh thần này.'
      :'Kết quả bài kiểm tra cho thấy em cần củng cố thêm một số nội dung. Trung tâm sẽ kiểm tra lại những phần em chưa vững và tăng cường hướng dẫn, luyện tập.'+(own?' Nhận xét của giáo viên: '+own+'.':'')+' Rất mong gia đình phối hợp nhắc em dành thời gian ôn bài; thầy cô sẽ theo sát để giúp em tiến bộ.';
    const msg='Chào phụ huynh em '+student.name+'! Trung tâm Toán An Phúc xin thông báo kết quả '+p.test_title+' ngày '+dateText+': em đạt '+value+'/10 điểm. '+(notes[id]!==undefined?teacherNote:defaultNote)+' Trân trọng!';
    const sourceKey='SCORE_HIGHLIGHT|'+id+'|'+p.test_date+'|'+p.test_type+'|'+hashText_(String(p.test_title)+'|'+score+'|'+msg);
    items.push({student_id:id,name:student.name,phone,zaloName,type:high?'SCORE_PRAISE':'SCORE_SUPPORT',msg,
      class_name:classCode(ctx.grade,ctx.className),sourceKey});
  });
  if(eligible===0)throw new Error('Không có học sinh đạt ngưỡng đã chọn.');
  // Ensure automatic delivery even if the old text queue trigger was deleted.
  if(typeof ensureSingleZaloQueueTrigger_!=='function')throw new Error('Thiếu hàm cài đặt lịch tự gửi Zalo. Hãy triển khai lại Code.gs.');
  try{ensureSingleZaloQueueTrigger_();}catch(e){throw new Error('Chưa bật được lịch gửi Zalo tự động: '+String(e.message||e)+'. Hãy chạy scoreMediaSetup() bằng tài khoản chủ dự án.');}
  const result=queueZaloMessagesDetailed_(items);
  return {eligible,queued:result.queued||0,duplicate:result.duplicate||0,missing_contact:missing.length,
    missing_students:missing.slice(0,20),kind,waiting:true,trigger_ready:true,
    note:'Tin mới được xếp vào hàng đợi; kiểm tra trạng thái Zalo trước khi xác nhận đã gửi.'};
}


/** V4.29.1: Read-only queue audit summary. No phone, message, cookie or token returned. */
function zaloQueueAuditV4291(){
  const m=ensureMessageLogColumns_(), rows=m.sheet.getDataRange().getValues();
  const h=rows[0].map(String), ix=n=>h.indexOf(n), out={};
  for(let i=1;i<rows.length;i++){
    const status=String(rows[i][ix('status')]||'').trim().toUpperCase();
    if(!['WAITING_SERVER','REVIEW_REQUIRED'].includes(status))continue;
    const detail=ix('gateway_response')>=0?String(rows[i][ix('gateway_response')]||''):'';
    let reason='NO_DETAIL';
    try{const obj=JSON.parse(detail);reason=String(obj.status||obj.reason||'NO_STATUS').slice(0,70);}catch(e){reason=detail?'UNPARSEABLE':'EMPTY';}
    const key=status+'|'+reason;out[key]=(out[key]||0)+1;
  }
  return {success:true,counts:getZaloQueueStatus(),reasons:out,rule:'REVIEW_REQUIRED is never automatically requeued.'};
}
/** Only manual one-at-a-time release after an operator VERIFIED that Zalo never sent it. */
function zaloReleaseReviewedOneV4291(logId,confirmation){
  if(String(confirmation)!=='DA KIEM TRA ZALO CHUA GUI')throw new Error('CONFIRMATION_REQUIRED');
  const lock=LockService.getScriptLock();lock.waitLock(8000);
  try{
    const m=ensureMessageLogColumns_(),s=m.sheet,rows=s.getDataRange().getValues(),h=rows[0].map(String);
    const id=h.indexOf('log_id'),st=h.indexOf('status'),next=h.indexOf('next_retry_at');
    if(id<0||st<0)throw new Error('MESSAGE_LOG_SCHEMA_INVALID');
    const matches=[];
    for(let i=1;i<rows.length;i++)if(String(rows[i][id])===String(logId))matches.push(i+1);
    if(matches.length!==1)throw new Error('LOG_ID_NOT_UNIQUE');
    const line=matches[0];
    if(String(s.getRange(line,st+1).getValue()).trim().toUpperCase()!=='REVIEW_REQUIRED')throw new Error('NOT_REVIEW_REQUIRED');
    s.getRange(line,st+1).setValue('PENDING');
    if(next>=0)s.getRange(line,next+1).clearContent();
    securityLog_('ZALO_REVIEW_RELEASE','MANUAL','operator','local','one_record');
    return {success:true,requeued:1,log_id:String(logId),note:'One record only. Processing occurs on the next normal worker execution.'};
  }finally{lock.releaseLock();}
}


// -----------------------------------------------------------------------------
// V4.29.2 - AUTHENTICATED ONE-GATEWAY CONFIG PAIRING (POST only)
// Only a machine with a previously paired, non-default operator secret can
// update GAS transport keys. Public URL is pinned; no arbitrary destinations.
// This action NEVER sends a Zalo message or releases REVIEW_REQUIRED records.
// -----------------------------------------------------------------------------
function gatewaySyncV4292(p) {
  p=p||{};
  const props=PropertiesService.getScriptProperties();
  const expected=String(props.getProperty(ZALO_WAKE_KEY_PROPERTY)||'').trim();
  const supplied=String(p._wake_key||'').trim();
  if(expected.length<32 || expected===DEFAULT_ZALO_WAKE_KEY ||
     !supplied || !safeEquals_(supplied,expected))
    throw new Error('PAIRING_REQUIRED: cấu hình ANPHUC_ZALO_WAKE_KEY riêng trong Script Properties.');
  const domain='https://pummel-crumb-ferret.ngrok-free.dev';
  const submitted=String(p.gateway_url||'').trim().replace(/\/+$/,'');
  if(submitted!==domain) throw new Error('UNAPPROVED_GATEWAY_URL');
  const instance=String(p.gateway_instance_id||'').trim();
  if(!/^[a-f0-9]{32}$/i.test(instance))throw new Error('INVALID_GATEWAY_INSTANCE');
  const key=String(p.api_key||'').trim();
  const mediaSecret=String(p.score_media_secret||'').trim();
  if(key.length<32 || mediaSecret.length<32 || key.length>256 || mediaSecret.length>256)
    throw new Error('INVALID_SECRET_LENGTH');
  // Prove the target Gateway has the proposed API key BEFORE storing it.
  const h=UrlFetchApp.fetch(domain+'/health',{method:'get',muteHttpExceptions:true,
    followRedirects:false,headers:{'ngrok-skip-browser-warning':'true','X-API-Key':key},timeout:20000});
  if(h.getResponseCode()!==200)throw new Error('HEALTH_HTTP_'+h.getResponseCode());
  const health=JSON.parse(h.getContentText());
  if(health.service!=='zalo-gateway'||health.gateway_instance_id!==instance)
    throw new Error('GATEWAY_INSTANCE_MISMATCH');
  const check=UrlFetchApp.fetch(domain+'/auth-check',{method:'get',muteHttpExceptions:true,
    followRedirects:false,headers:{'ngrok-skip-browser-warning':'true','X-API-Key':key},timeout:20000});
  if(check.getResponseCode()!==200)throw new Error('AUTH_CHECK_HTTP_'+check.getResponseCode());
  const body=JSON.parse(check.getContentText());
  if(body.status!=='AUTH_OK'||body.gateway_instance_id!==instance)
    throw new Error('AUTH_CHECK_MISMATCH');
  // Only one atomic update. No key is returned or written to logs.
  props.setProperties({ZALO_GATEWAY_URL:domain,SCORE_MEDIA_GATEWAY_URL:domain,
    ZALO_GATEWAY_API_KEY:key,ANPHUC_ZALO_GATEWAY_API_KEY:key,
    SCORE_MEDIA_GATEWAY_SECRET:mediaSecret},false);
  return {success:true,paired:true,gateway_url:domain,
    gateway_instance_id:instance,preflight:'AUTH_OK',secrets_returned:false,
    note:'REVIEW_REQUIRED vẫn giữ nguyên, chỉ WAITING_SERVER chắc chắn chưa gửi được worker xử lý.'};
}

/** Read-only reason codes for stuck queues; does not expose pupil data. */
function gatewayQueueDiagnosticsV4292(){
  const counts=getZaloQueueStatus();
  const check=zaloPreflightV4291_();
  return {build:'ANPHUC_V4292',preflight:check.code,ready:check.ready,
    waiting_server:counts.waiting_server,review_required:counts.review_required,
    pending:counts.pending,failed:counts.failed,
    review_rule:'Never automatically requeue REVIEW_REQUIRED.'};
}

// V4.29.3: Read-only editor diagnostic. Run manually from Apps Script Editor.
// Does not return credentials, student records or message content.
function kiemTraKhoaZaloV4293(){
  const props=PropertiesService.getScriptProperties();
  const a=String(props.getProperty('ZALO_GATEWAY_API_KEY')||'').trim();
  const b=String(props.getProperty(ZALO_GATEWAY_API_KEY_PROPERTY)||'').trim();
  const wake=String(props.getProperty(ZALO_WAKE_KEY_PROPERTY)||'').trim();
  const out={build:'ANPHUC_V4293_ZALO_AUTH_SYNC_20261103',
    api_key_a_configured:a.length>=32,api_key_b_configured:b.length>=32,
    api_keys_match:!!a&&!!b&&safeEquals_(a,b),
    wake_key_paired:wake.length>=32&&wake!==DEFAULT_ZALO_WAKE_KEY,
    url:String(props.getProperty('ZALO_GATEWAY_URL')||'').trim(),
    gateway_ready:false,code:'NOT_CHECKED'};
  try {
    const result=zaloPreflightV4291_();
    out.gateway_ready=result.ready===true; out.code=String(result.code||'UNKNOWN');
  } catch(e){out.code=String(e.message||e).slice(0,160);}
  console.log(JSON.stringify(out));
  return out;
}
