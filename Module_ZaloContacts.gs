// ============================================================================
// MODULE V4.19 - DANH SACH HOC SINH KHONG LIEN LAC DUOC QUA ZALO
// ============================================================================

function isInfrastructureZaloFailureV419_(text) {
  const s = String(text || '').toUpperCase();
  return /BOT_OFFLINE|DRIVER_FAILED|ZALO_NOT_READY|SELENIUM_ERROR|WAITING_SERVER|ERR_NGROK|TUNNEL|HTTP\s*(502|503|504)/.test(s);
}

function isContactZaloFailureV419_(status, gatewayResponse) {
  const st = String(status || '').trim().toUpperCase();
  const body = String(gatewayResponse || '');
  if (st !== 'FAILED') return false;
  if (isInfrastructureZaloFailureV419_(body)) return false;
  if (!body) return true;
  return /NOT_FOUND|RECIPIENT_NOT_CONFIRMED|RECIPIENT_CHANGED|AMBIGUOUS_ZALO_NAME|NO_RECIPIENT_KEY|CHAT_INPUT_NOT_FOUND|COMPOSER_MISMATCH|SEND_TRIGGER_FAILED|SEND_NOT_CONFIRMED|SELF_ACCOUNT|409|422/.test(body.toUpperCase());
}

function getRecentMessageLogsForContactsV419_(limit) {
  const sheet = getSpreadsheet_().getSheetByName('MessageLogs');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const lastRow = sheet.getLastRow();
  const maxRows = Math.max(100, Math.min(Number(limit || 5000), 10000));
  const start = Math.max(2, lastRow - maxRows + 1);
  const values = sheet.getRange(start, 1, lastRow - start + 1, headers.length).getValues();
  return values.map((row, i) => {
    const obj = { _row: start + i };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
}

function getUnreachableZaloStudents(params) {
  params = params || {};
  const ss = getSpreadsheet_();
  const students = getSheetData('Students', ss);
  const logs = getRecentMessageLogsForContactsV419_(params.limit || 5000);
  const latest = new Map();
  const failureCount = new Map();

  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    const sid = String(log.student_id || '').trim();
    if (!sid) continue;
    if (!latest.has(sid)) latest.set(sid, log);
    if (isContactZaloFailureV419_(log.status, log.gateway_response)) {
      failureCount.set(sid, Number(failureCount.get(sid) || 0) + 1);
    }
  }

  const rows = [];
  students.forEach(s => {
    const sid = String(s.student_id || '').trim();
    if (!sid) return;
    const phone = normalizeVietnamPhone(s.parent_phone);
    const zaloName = String(s.zalo_name || '').trim();
    const last = latest.get(sid);
    const missingContact = !phone && !zaloName;
    const lastFailed = !!(last && isContactZaloFailureV419_(last.status, last.gateway_response));
    if (!missingContact && !lastFailed) return;

    let reason = missingContact ? 'Chưa có SĐT hợp lệ và chưa có Tên Zalo' : 'Gateway không mở/xác nhận được Zalo của phụ huynh';
    if (lastFailed) {
      const gr = String(last.gateway_response || '').trim();
      if (gr) {
        try {
          const parsed = JSON.parse(gr);
          if (typeof parsed === 'string') reason = parsed.slice(0, 260);
          else reason = String((parsed && (parsed.message || parsed.status)) || reason);
        } catch (e) {
          reason = gr.slice(0, 260);
        }
      }
    }

    rows.push({
      student_id: sid,
      name: String(s.name || ''),
      grade: String(s.grade || ''),
      class: String(s.class || ''),
      class_info: `K${s.grade || ''}-${s.class || ''}`,
      parent_phone: String(s.parent_phone || ''),
      normalized_phone: phone,
      zalo_name: zaloName,
      issue_type: missingContact ? 'MISSING_CONTACT' : 'ZALO_FAILED',
      reason,
      failure_count: Number(failureCount.get(sid) || 0),
      last_log_id: last ? String(last.log_id || '') : '',
      last_message_type: last ? String(last.message_type || '') : '',
      last_message: last ? String(last.message || '') : '',
      last_attempt_at: last ? formatDateTimeSafe(last.last_attempt_at || last.processed_at || last.created_at) : '',
      retryable: !!(!missingContact && last && String(last.message || '').trim())
    });
  });

  rows.sort((a, b) => {
    if (a.issue_type !== b.issue_type) return a.issue_type === 'MISSING_CONTACT' ? -1 : 1;
    if (b.failure_count !== a.failure_count) return b.failure_count - a.failure_count;
    return `${a.grade}${a.class}${a.name}`.localeCompare(`${b.grade}${b.class}${b.name}`, 'vi');
  });

  return {
    total: rows.length,
    missing_contact: rows.filter(x => x.issue_type === 'MISSING_CONTACT').length,
    failed_zalo: rows.filter(x => x.issue_type === 'ZALO_FAILED').length,
    items: rows
  };
}

function retryUnreachableZaloStudent(params) {
  params = params || {};
  const sid = String(params.student_id || '').trim();
  if (!sid) throw new Error('Thiếu mã học sinh.');
  const student = getSheetData('Students').find(s => String(s.student_id || '').trim() === sid);
  if (!student) throw new Error('Không tìm thấy học sinh.');
  const phone = normalizeVietnamPhone(student.parent_phone);
  const zaloName = String(student.zalo_name || '').trim();
  if (!phone && !zaloName) throw new Error('Học sinh chưa có SĐT hợp lệ hoặc Tên Zalo. Hãy cập nhật thông tin trước.');

  const logs = getRecentMessageLogsForContactsV419_(5000);
  let source = null;
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (String(log.student_id || '').trim() !== sid) continue;
    if (!String(log.message || '').trim()) continue;
    if (isContactZaloFailureV419_(log.status, log.gateway_response)) { source = log; break; }
  }
  if (!source) throw new Error('Không tìm thấy tin Zalo lỗi gần nhất để thử gửi lại.');

  const minuteKey = Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMddHHmm');
  const qr = queueZaloMessage(
    sid,
    student.name,
    phone,
    String(source.message_type || 'RETRY_ZALO'),
    source.month || '',
    source.year || '',
    String(source.message || ''),
    zaloName,
    {
      class_name: classCode(student.grade, student.class),
      sourceKey: `RETRY_ZALO|${source.log_id || sid}|${minuteKey}`
    }
  );
  return { queued: qr.queued, duplicate: qr.duplicate, student_id: sid, name: student.name, source_log_id: source.log_id || '' };
}
