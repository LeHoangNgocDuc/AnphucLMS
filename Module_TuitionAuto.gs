// ============================================================================
// MODULE V4.19 - TU DONG NHAC HOC PHI NGAY 25 HANG THANG
// ============================================================================

const TUITION_AUTO_TRIGGER_HANDLER_V419 = 'runDailyTuitionAutomation';
const TUITION_AUTO_DAY_V419 = 25;
const TUITION_AUTO_HOUR_V419 = 8;
const TUITION_AUTO_LAST_RUN_PROP_V419 = 'AP_V419_TUITION_AUTO_LAST_RUN';

function currentVietnamDatePartsV419_() {
  const now = new Date();
  return {
    date: Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd'),
    year: Number(Utilities.formatDate(now, 'GMT+7', 'yyyy')),
    month: Number(Utilities.formatDate(now, 'GMT+7', 'M')),
    day: Number(Utilities.formatDate(now, 'GMT+7', 'd')),
    hour: Number(Utilities.formatDate(now, 'GMT+7', 'H'))
  };
}

function currentSchoolYearStartV419_(parts) {
  const p = parts || currentVietnamDatePartsV419_();
  return p.month >= 9 ? p.year : p.year - 1;
}

function ensureTuitionAutoTriggerV419_() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === TUITION_AUTO_TRIGGER_HANDLER_V419);
  let removed = 0;
  if (triggers.length > 1) {
    for (let i = 1; i < triggers.length; i++) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  let created = false;
  if (triggers.length === 0) {
    ScriptApp.newTrigger(TUITION_AUTO_TRIGGER_HANDLER_V419)
      .timeBased()
      .everyDays(1)
      .atHour(TUITION_AUTO_HOUR_V419)
      .create();
    created = true;
  }
  return { created, removed, active: 1, day: TUITION_AUTO_DAY_V419, hour: TUITION_AUTO_HOUR_V419 };
}

function getTuitionDebtSnapshotV419_() {
  const ss = getSpreadsheet_();
  const parts = currentVietnamDatePartsV419_();
  const schoolStart = currentSchoolYearStartV419_(parts);
  const currentKey = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  const todayKey = parts.date;
  const settings = getSettingsMap_(ss);
  const defaultFee = Number(settings.tuition_amount_default || 0);
  const students = getSheetData('Students', ss);
  const tuition = getSheetDataAsObjects('Tuition', ss);

  const paid = new Set();
  tuition.forEach(t => {
    const sid = String(t.student_id || '').trim();
    const y = Number(t.year || 0);
    const m = Number(t.month || 0);
    if (!sid || !y || !m) return;
    paid.add(`${sid}|${y}-${String(m).padStart(2, '0')}`);
  });

  const allPeriods = schoolYearPeriods_(schoolStart)
    .map(p => ({
      year: Number(p.year),
      month: Number(p.month),
      key: p.key,
      label: `${Number(p.month)}/${Number(p.year)}`
    }))
    .filter(p => p.key <= currentKey);

  return students.map(student => {
    const sid = String(student.student_id || '').trim();
    if (!sid) return null;
    const expectedFee = getExpectedTuitionAmount(student, defaultFee);
    const eligible = allPeriods.filter(p => periodIsEligibleForStudent_(student, p, todayKey));
    const unpaid = eligible.filter(p => !paid.has(`${sid}|${p.key}`));
    const phone = normalizeVietnamPhone(student.parent_phone);
    const zaloName = String(student.zalo_name || '').trim();
    const debtTotal = unpaid.reduce((sum, p) => sum + Number(expectedFee || 0), 0);
    return {
      student_id: sid,
      name: String(student.name || ''),
      grade: String(student.grade || ''),
      class: String(student.class || ''),
      class_info: `K${student.grade || ''}-${student.class || ''}`,
      parent_phone: String(student.parent_phone || ''),
      phone,
      zalo_name: zaloName,
      expected_fee: expectedFee,
      unpaid_periods: unpaid,
      unpaid_months: unpaid.map(p => p.label).join(', '),
      debt_count: unpaid.length,
      debt_total: debtTotal,
      has_contact: !!(phone || zaloName)
    };
  }).filter(Boolean);
}

function buildAutoTuitionMessageV419_(row, parts) {
  const dateText = `${String(parts.day).padStart(2,'0')}/${String(parts.month).padStart(2,'0')}/${parts.year}`;
  const cls = `${row.grade}${row.class}`;
  if (Number(row.debt_count || 0) >= 2) {
    return `Trung tâm An Phúc Education kính gửi Quý phụ huynh học sinh ${row.name} - lớp ${cls}. ` +
      `Theo dữ liệu đến ngày ${dateText}, Trung tâm chưa ghi nhận học phí ${row.debt_count} tháng: ${row.unpaid_months}. ` +
      `Tổng số tiền dự kiến: ${formatMoneyVN(row.debt_total)} VNĐ. Đây là khoản học phí tồn từ 2 tháng trở lên, ` +
      `kính mong Quý phụ huynh ưu tiên đối chiếu và thu xếp hoàn tất. Nếu Quý phụ huynh đã thanh toán, vui lòng phản hồi để Trung tâm kiểm tra và cập nhật. Xin trân trọng cảm ơn.`;
  }
  const period = row.unpaid_periods[0];
  const fee = Number(row.expected_fee || 0);
  return `Trung tâm An Phúc Education kính gửi Quý phụ huynh học sinh ${row.name} - lớp ${cls}. ` +
    `Đến ngày ${dateText}, Trung tâm chưa ghi nhận học phí tháng ${period ? period.label : `${parts.month}/${parts.year}`}, ` +
    `số tiền dự kiến ${formatMoneyVN(fee)} VNĐ. Kính mong Quý phụ huynh thu xếp hoàn tất học phí. ` +
    `Nếu Quý phụ huynh đã thanh toán, vui lòng phản hồi để Trung tâm kiểm tra và cập nhật. Xin trân trọng cảm ơn.`;
}

function runAutoTuitionReminder25V419_(options) {
  options = options || {};
  const force = !!options.force;
  const parts = currentVietnamDatePartsV419_();
  const props = PropertiesService.getScriptProperties();
  const today = parts.date;

  if (!force && parts.day !== TUITION_AUTO_DAY_V419) {
    return { skipped: true, reason: 'NOT_DAY_25', today, day: parts.day, scheduled_day: TUITION_AUTO_DAY_V419 };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!force) {
      const lastRaw = String(props.getProperty(TUITION_AUTO_LAST_RUN_PROP_V419) || '').trim();
      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw);
          if (last && last.date === today) return Object.assign({ skipped: true, reason: 'ALREADY_RUN_TODAY' }, last);
        } catch (e) {}
      }
    }

    const rows = getTuitionDebtSnapshotV419_();
    const debtRows = rows.filter(r => Number(r.debt_count || 0) > 0);
    debtRows.sort((a, b) => {
      const pa = Number(a.debt_count || 0) >= 2 ? 0 : 1;
      const pb = Number(b.debt_count || 0) >= 2 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (Number(b.debt_count || 0) !== Number(a.debt_count || 0)) return Number(b.debt_count || 0) - Number(a.debt_count || 0);
      return `${a.grade}${a.class}${a.name}`.localeCompare(`${b.grade}${b.class}${b.name}`, 'vi');
    });

    let noContact = 0, noFee = 0, debt2plus = 0, debt1 = 0;
    const items = [];
    debtRows.forEach(row => {
      if (!row.has_contact) { noContact++; return; }
      if (!(Number(row.expected_fee || 0) > 0)) { noFee++; return; }
      const isPriority = Number(row.debt_count || 0) >= 2;
      if (isPriority) debt2plus++; else debt1++;
      const debtKey = row.unpaid_periods.map(p => p.key).join('_');
      items.push({
        student_id: row.student_id,
        name: row.name,
        phone: row.phone,
        zaloName: row.zalo_name,
        type: isPriority ? 'PAYMENT_DEBT_2PLUS_AUTO' : 'PAYMENT_REMINDER_AUTO_25',
        month: parts.month,
        year: parts.year,
        msg: buildAutoTuitionMessageV419_(row, parts),
        class_name: classCode(row.grade, row.class),
        sourceKey: `AUTO_TUITION_25|${row.student_id}|${today}|${debtKey}`
      });
    });

    const queued = queueZaloMessagesDetailed_(items);
    const result = {
      date: today,
      forced: force,
      total_students: rows.length,
      total_debt_students: debtRows.length,
      debt_2plus: debt2plus,
      debt_1month: debt1,
      queued: queued.queued,
      duplicate: queued.duplicate,
      no_contact: noContact,
      no_fee: noFee,
      run_at: Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss')
    };
    props.setProperty(TUITION_AUTO_LAST_RUN_PROP_V419, JSON.stringify(result));
    securityLog_('TUITION_AUTO_25', 'RUN', today, 'system', JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runDailyTuitionAutomation() {
  return runAutoTuitionReminder25V419_({ force: false });
}

function runTuitionReminderNow(params) {
  params = params || {};
  return runAutoTuitionReminder25V419_({ force: true });
}

function getTuitionAutomationStatus() {
  const props = PropertiesService.getScriptProperties();
  let last = null;
  try { last = JSON.parse(String(props.getProperty(TUITION_AUTO_LAST_RUN_PROP_V419) || 'null')); } catch (e) {}
  const count = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === TUITION_AUTO_TRIGGER_HANDLER_V419).length;
  return {
    enabled: count > 0,
    trigger_count: count,
    day: TUITION_AUTO_DAY_V419,
    hour: TUITION_AUTO_HOUR_V419,
    timezone: 'GMT+7',
    last_run: last,
    message: count > 0
      ? 'Tự động kiểm tra mỗi ngày khoảng 08:00 và chỉ xếp tin học phí vào ngày 25. Học sinh nợ từ 2 tháng trở lên được ưu tiên trước.'
      : 'Chưa có trigger tự động. Hãy chạy setupSystemV419() một lần.'
  };
}

function setupTuitionAutoV419_() {
  return ensureTuitionAutoTriggerV419_();
}
