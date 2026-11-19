/**
 * Blackcard Google Sheet → CRM sync. Paste into the sheet: Extensions → Apps Script.
 *
 * Script Properties (Project Settings → Script Properties):
 *   SYNC_URL     https://<backend>/api/v1/sheet-sync      (local test: an ngrok URL to localhost)
 *   SYNC_SECRET  same value as SHEET_SYNC_PUSH_SECRET in the backend env
 *
 * The script only READS the sheet. It sends the two tabs to the backend, which decides what
 * to change in the CRM (dry run unless the backend env allows writes).
 */
var TABS = ['Main Sheet-New', 'PMT'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM Sync')
    .addItem('Sync now', 'syncNow')
    .addItem('Dry run (no CRM changes)', 'dryRunNow')
    .addItem('Show last result', 'showLastResult')
    .addSeparator()
    .addItem('Schedule: once a day', 'scheduleDaily')
    .addItem('Schedule: every 15 minutes (testing)', 'scheduleEvery15Minutes')
    .addItem('Stop schedule', 'stopSchedule')
    .addToUi();
}

function syncNow() { return push_(false); }
function dryRunNow() { return push_(true); }

/** Runs once a day around 2 AM in the sheet's time zone. Change atHour() to move it. */
function scheduleDaily() {
  stopSchedule();
  ScriptApp.newTrigger('syncNow').timeBased().everyDays(1).atHour(2).create();
  notify_('Sync scheduled once a day (around 2 AM).');
}

function scheduleEvery15Minutes() {
  stopSchedule();
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(15).create();
  notify_('Sync scheduled every 15 minutes. Use "Schedule: once a day" when testing is done.');
}

function stopSchedule() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncNow'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function showLastResult() {
  var res = call_('get', '/status');
  notify_(JSON.stringify(res.body, null, 2).slice(0, 4000));
}

function push_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var tabs = {};
  TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error('Tab "' + name + '" not found.');
    tabs[name] = sheet.getDataRange().getValues().map(function (row) {
      return row.map(function (v) { return toCell_(v, tz); });
    });
  });
  var res = call_('post', '/push', { tabs: tabs, dryRun: dryRun });
  var msg = res.code === 202
    ? 'Sync started (' + res.body.mode + ')' +
      (res.body.writesDisabledBecause ? ' — writes off: ' + res.body.writesDisabledBecause : '') +
      '. Use "Show last result" in a minute or two.'
    : 'Sync not started (' + res.code + '): ' + (res.body.message || JSON.stringify(res.body));
  console.log(msg);
  notify_(msg);
}

/**
 * Same values the .xlsx download gives the backend: dates as serial day numbers, numbers and
 * percentages (fractions) as numbers, empty cells as null.
 */
function toCell_(v, tz) {
  if (v === '' || v === null) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var p = Utilities.formatDate(v, tz, 'yyyy-MM-dd').split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000 + 25569;
  }
  return v;
}

function call_(method, path, payload) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SYNC_URL');
  var secret = props.getProperty('SYNC_SECRET');
  if (!url || !secret) throw new Error('Set SYNC_URL and SYNC_SECRET in Project Settings → Script Properties.');
  var options = {
    method: method,
    headers: { 'x-sheet-sync-secret': secret, 'ngrok-skip-browser-warning': '1' },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(url.replace(/\/$/, '') + path, options);
  var body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = { message: res.getContentText().slice(0, 500) }; }
  return { code: res.getResponseCode(), body: body };
}

/** Pop-up when run from the menu; log only when run by the schedule. */
function notify_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
