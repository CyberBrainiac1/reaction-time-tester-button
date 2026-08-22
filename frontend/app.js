/* Giant Button Reaction Tester — plain JavaScript, no build step required. */

const SETTINGS = {
  baudRate: 115200,
  minimumWaitMilliseconds: 1500,
  maximumWaitMilliseconds: 5000,
  calibratedLinkDelayMilliseconds: 1.85,
  cpsDurationSeconds: 5,
};

const app = document.querySelector('#app');
const stage = document.querySelector('#stage');
const deviceStatus = document.querySelector('#device-status');
const statistics = document.querySelector('#statistics');
const counts = document.querySelector('#counts');
const diagnostics = document.querySelector('#diagnostics');
const serialLog = document.querySelector('#serial-log');
const exportButton = document.querySelector('#export-button');
const clearButton = document.querySelector('#clear-button');
const testModeButton = document.querySelector('#test-mode-button');
const modeButton = document.querySelector('#mode-button');
const disconnectButton = document.querySelector('#disconnect-button');

let state = 'disconnected';
let testMode = 'reaction';
let source = 'hardware';
let buttonDown = false;
let serialPort = null;
let reader = null;
let writer = null;
let serialBuffer = '';
let closing = false;
let readyCallback = null;
let waitTimer = null;
let paintFrame = null;
let cpsTimer = null;
let cpsEndsAt = null;
let cpsPresses = 0;
let stimulusTime = null;
let lastArduinoMicros = null;
let linkDelayMs = SETTINGS.calibratedLinkDelayMilliseconds;
let errorMessage = '';
let trialResults = [];
let cpsResults = [];
let logLines = [];

function setState(next) {
  state = next;
  app.dataset.state = next;
  render();
}

function addLog(message) {
  logLines.unshift(`${performance.now().toFixed(3)}  ${message}`);
  logLines = logLines.slice(0, 200);
  serialLog.textContent = logLines.join('\n');
}

function stopTimers() {
  clearTimeout(waitTimer);
  cancelAnimationFrame(paintFrame);
  clearInterval(cpsTimer);
  waitTimer = null;
  paintFrame = null;
  cpsTimer = null;
}

function page(eyebrow, title, text, actions = '') {
  return `<p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${text}</p>${actions}`;
}

function startButton() {
  const label = testMode === 'cps' ? `Start ${SETTINGS.cpsDurationSeconds}-second CPS test` : 'Start trial';
  return `<button class="primary" id="start-button" ${buttonDown ? 'disabled' : ''}>${buttonDown ? 'Release button' : label}</button>`;
}

function render() {
  deviceStatus.textContent = source === 'simulator' ? 'SIMULATOR' : state === 'disconnected' ? 'OFFLINE' : buttonDown ? 'BUTTON HELD' : 'BUTTON RELEASED';
  if (state === 'disconnected') {
    stage.innerHTML = page('REACTION TIME TESTER', 'Ready when<br>you are.', 'Connect the Arduino Nano, then hit the giant button the instant the screen turns green.', '<div class="button-row"><button class="primary" id="connect-button">Connect Arduino</button><button id="simulator-button">Use keyboard simulator</button></div><span class="hint">Chrome or Edge on Windows · 115200 baud · switch on D2</span>');
  } else if (state === 'connecting') {
    stage.innerHTML = page('CONNECTING', 'Finding the<br>giant button…', 'Select the Nano’s COM port. It may reset once connected.');
  } else if (state === 'ready') {
    stage.innerHTML = testMode === 'cps'
      ? page('CPS TEST', 'How fast can<br>you press?', `Press the giant button as many times as you can in ${SETTINGS.cpsDurationSeconds} seconds.`, startButton())
      : page('SYSTEM READY', 'Fast hands?', 'Keep the button released. The wait is random, so don’t anticipate it.', startButton());
  } else if (state === 'waiting') {
    stage.innerHTML = page('WAIT FOR IT', 'Hold<br>steady.', 'Pressing now is a false start.');
  } else if (state === 'go') {
    stage.innerHTML = '<h1 class="go">GO!</h1>';
  } else if (state === 'result') {
    const last = trialResults.at(-1);
    const measurement = last.rawReactionTimeMs?.toFixed(1) ?? last.reactionTimeMs.toFixed(1);
    const correction = last.linkDelayMs === null ? '' : ` · ${last.linkDelayMs.toFixed(2)} ms link correction`;
    stage.innerHTML = `<p class="eyebrow">REACTION TIME</p><h1 class="result">${Math.round(last.reactionTimeMs)}<small> ms</small></h1><p>Raw arrival time: ${measurement} ms${correction}${last.source === 'simulator' ? ' · simulated' : ''}</p>${startButton()}`;
  } else if (state === 'cps-active') {
    const secondsRemaining = Math.max(0, (cpsEndsAt - performance.now()) / 1000);
    stage.innerHTML = `<p class="eyebrow">CPS TEST</p><h1 class="result">${cpsPresses}<small> clicks</small></h1><p>${secondsRemaining.toFixed(1)} seconds remaining · press as fast as you can</p>`;
  } else if (state === 'cps-result') {
    const last = cpsResults.at(-1);
    stage.innerHTML = `<p class="eyebrow">CPS RESULT</p><h1 class="result">${last.cps.toFixed(1)}<small> CPS</small></h1><p>${last.clicks} clicks in ${last.durationSeconds} seconds${last.source === 'simulator' ? ' · simulated' : ''}</p>${startButton()}`;
  } else if (state === 'false-start') {
    stage.innerHTML = page('FALSE START', 'TOO<br>EARLY', 'Release the button, then try again.', startButton());
  } else {
    stage.innerHTML = page('TRIAL STOPPED', 'Something<br>changed.', errorMessage, '<button class="primary" id="recover-button">Recover</button>');
  }

  document.querySelector('#connect-button')?.addEventListener('click', connectArduino);
  document.querySelector('#simulator-button')?.addEventListener('click', useSimulator);
  document.querySelector('#start-button')?.addEventListener('click', startTrial);
  document.querySelector('#recover-button')?.addEventListener('click', () => source === 'hardware' ? connectArduino() : setState('ready'));
  updatePanel();
}

function updatePanel() {
  const card = (value, label) => `<div><b>${value}</b><span>${label}</span></div>`;
  if (testMode === 'cps') {
    const values = cpsResults.map(row => row.cps);
    if (!values.length) statistics.innerHTML = '<p class="muted">No CPS tests yet.</p>';
    else {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const best = Math.max(...values);
      const totalClicks = cpsResults.reduce((sum, row) => sum + row.clicks, 0);
      statistics.innerHTML = `<div class="stats">${card(values.length, 'tests')}${card(average.toFixed(1), 'average CPS')}${card(best.toFixed(1), 'best CPS')}${card(totalClicks, 'total clicks')}</div>`;
    }
    counts.textContent = `${cpsResults.length} completed CPS tests`;
  } else {
  const values = trialResults.filter(row => row.valid && !row.falseStart && row.reactionTimeMs !== null).map(row => row.reactionTimeMs);
  if (!values.length) statistics.innerHTML = '<p class="muted">No valid trials yet.</p>';
  else {
    const sorted = [...values].sort((a, b) => a - b);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) : null;
    statistics.innerHTML = `<div class="stats">${card(values.length, 'valid')}${card(average.toFixed(1), 'average ms')}${card(median.toFixed(1), 'median ms')}${card(sorted[0].toFixed(1), 'fastest ms')}${card(sorted.at(-1).toFixed(1), 'slowest ms')}${card(sd === null ? '—' : sd.toFixed(1), 'std dev ms')}</div>`;
  }
  counts.textContent = `${trialResults.filter(row => row.falseStart).length} false starts · ${trialResults.filter(row => !row.valid).length} invalid`;
  }
  const currentResults = testMode === 'cps' ? cpsResults : trialResults;
  exportButton.disabled = !currentResults.length;
  clearButton.disabled = !currentResults.length;
  testModeButton.textContent = testMode === 'reaction' ? 'CPS test' : 'Reaction test';
  testModeButton.disabled = state === 'cps-active';
  modeButton.hidden = source !== 'simulator';
  disconnectButton.hidden = source !== 'hardware' || state === 'disconnected';
  diagnostics.innerHTML = `<dt>Test</dt><dd>${testMode === 'cps' ? 'CPS' : 'reaction time'}</dd><dt>State</dt><dd>${state}</dd><dt>Source</dt><dd>${source}</dd><dt>Button</dt><dd>${buttonDown ? 'pressed' : 'released'}</dd><dt>Stimulus</dt><dd>${stimulusTime?.toFixed(3) ?? '—'}</dd><dt>Arduino μs</dt><dd>${lastArduinoMicros ?? '—'}</dd><dt>Delay correction</dt><dd>${linkDelayMs === null ? '—' : `${linkDelayMs.toFixed(2)} ms`}</dd>`;
  if (!logLines.length) serialLog.textContent = 'No serial traffic.';
}

function record(pressTime, arduinoMicros, falseStart, valid = true, invalidReason = '') {
  const rawReactionTimeMs = falseStart || stimulusTime === null ? null : Math.max(0, pressTime - stimulusTime);
  trialResults.push({
    trialNumber: trialResults.length + 1,
    reactionTimeMs: rawReactionTimeMs === null ? null : Math.max(0, rawReactionTimeMs - (linkDelayMs ?? 0)),
    rawReactionTimeMs, linkDelayMs: source === 'hardware' ? linkDelayMs : null,
    falseStart, browserStimulusTimestampMs: stimulusTime,
    browserPressReceivedTimestampMs: pressTime, arduinoPressMicros: arduinoMicros,
    dateTime: new Date().toISOString(), source, valid, invalidReason,
  });
}

function fail(message, recordInvalid = false) {
  stopTimers();
  if (recordInvalid) record(performance.now(), null, false, false, message);
  errorMessage = message;
  setState('error');
}

function receivedPress(arduinoMicros) {
  buttonDown = true;
  lastArduinoMicros = arduinoMicros;
  const now = performance.now();
  if (state === 'cps-active') {
    cpsPresses += 1;
    render();
  } else if (state === 'waiting') {
    stopTimers(); record(now, arduinoMicros, true); setState('false-start');
  } else if (state === 'go') {
    if (stimulusTime === null) fail('Trial invalidated because the GO frame was not confirmed as paint-ready.', true);
    else { record(now, arduinoMicros, false); setState('result'); }
  } else render();
}

async function connectArduino() {
  if (!navigator.serial) return fail('Web Serial requires desktop Chrome or Edge over HTTPS.');
  setState('connecting'); errorMessage = '';
  try {
    await disconnectArduino(false);
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: SETTINGS.baudRate, bufferSize: 255 });
    writer = serialPort.writable.getWriter(); closing = false;
    void readSerial();
    source = 'hardware'; linkDelayMs = SETTINGS.calibratedLinkDelayMilliseconds; setState('ready');
  } catch (error) { await disconnectArduino(false); fail(error.message || String(error)); }
}

async function readSerial() {
  try {
    reader = serialPort.readable.getReader();
    while (!closing) {
      const { value, done } = await reader.read();
      if (done) break;
      serialBuffer += new TextDecoder().decode(value);
      let end;
      while ((end = serialBuffer.indexOf('\n')) >= 0) {
        const line = serialBuffer.slice(0, end).replace(/\r$/, '').trim();
        serialBuffer = serialBuffer.slice(end + 1);
        if (line) handleLine(line);
      }
    }
    if (!closing) fail('The Arduino was disconnected.');
  } catch (error) { if (!closing) fail(error.message || String(error)); }
  finally { try { reader?.releaseLock(); } catch {} reader = null; }
}

function handleLine(line) {
  addLog(`< ${line}`);
  const [kind, value, ...rest] = line.split(',');
  if (kind === 'READY') {
    if (state === 'waiting' || state === 'go') fail('Trial invalidated because the Arduino reset.', true);
  }
  else if (kind === 'PRESS') {
    const micros = Number(value);
    if (Number.isInteger(micros) && micros >= 0) receivedPress(micros); else addLog('! malformed PRESS timestamp');
  } else if (kind === 'RELEASE') { buttonDown = false; lastArduinoMicros = Number(value) || lastArduinoMicros; render(); }
  else if (kind === 'ERROR') fail([value, ...rest].filter(Boolean).join(',') || 'Arduino error');
  else addLog('! unknown message');
}

async function disconnectArduino(showState = true) {
  closing = true;
  try { await reader?.cancel(); } catch {} try { reader?.releaseLock(); } catch {} reader = null;
  try { writer?.releaseLock(); } catch {} writer = null;
  try { await serialPort?.close(); } catch {} serialPort = null;
  serialBuffer = ''; buttonDown = false;
  if (showState) setState('disconnected');
}

async function startTrial() {
  if (testMode === 'cps') return startCpsTest();
  if (!['ready', 'result', 'false-start'].includes(state) || buttonDown) return;
  stimulusTime = null; setState('waiting');
  const delay = SETTINGS.minimumWaitMilliseconds + Math.random() * (SETTINGS.maximumWaitMilliseconds - SETTINGS.minimumWaitMilliseconds);
  waitTimer = setTimeout(() => {
    if (state !== 'waiting') return;
    setState('go');
    paintFrame = requestAnimationFrame(() => {
      if (state === 'go') { stimulusTime = performance.now(); addLog(`GO paint timestamp ${stimulusTime.toFixed(3)} ms`); }
    });
  }, delay);
}

function startCpsTest() {
  if (!['ready', 'cps-result'].includes(state) || buttonDown) return;
  cpsPresses = 0;
  cpsEndsAt = performance.now() + SETTINGS.cpsDurationSeconds * 1000;
  setState('cps-active');
  cpsTimer = setInterval(() => {
    if (state !== 'cps-active') return stopTimers();
    if (performance.now() >= cpsEndsAt) {
      stopTimers();
      cpsResults.push({
        testNumber: cpsResults.length + 1,
        clicks: cpsPresses,
        durationSeconds: SETTINGS.cpsDurationSeconds,
        cps: cpsPresses / SETTINGS.cpsDurationSeconds,
        dateTime: new Date().toISOString(), source,
      });
      setState('cps-result');
    } else render();
  }, 50);
}

function useSimulator() { void disconnectArduino(false); source = 'simulator'; buttonDown = false; linkDelayMs = null; setState('ready'); }

function exportCsv() {
  if (testMode === 'cps') {
    const keys = ['testNumber', 'clicks', 'durationSeconds', 'cps', 'dateTime', 'source'];
    const headers = ['test_number', 'clicks', 'duration_seconds', 'clicks_per_second', 'date_time', 'source'];
    return downloadCsv(headers, cpsResults, keys, 'cps-tests');
  }
  const keys = ['trialNumber', 'reactionTimeMs', 'rawReactionTimeMs', 'linkDelayMs', 'falseStart', 'browserStimulusTimestampMs', 'browserPressReceivedTimestampMs', 'arduinoPressMicros', 'dateTime', 'source', 'valid', 'invalidReason'];
  const headers = ['trial_number', 'reaction_time_ms_corrected', 'reaction_time_ms_raw', 'estimated_link_delay_ms', 'false_start', 'browser_stimulus_timestamp_ms', 'browser_press_received_timestamp_ms', 'arduino_press_micros', 'date_time', 'source', 'valid', 'invalid_reason'];
  downloadCsv(headers, trialResults, keys, 'reaction-times');
}

function downloadCsv(headers, rows, keys, filename) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}-${new Date().toISOString().replaceAll(':', '-')}.csv`; link.click(); URL.revokeObjectURL(url);
}

exportButton.addEventListener('click', exportCsv);
clearButton.addEventListener('click', () => { if (testMode === 'cps') cpsResults = []; else trialResults = []; render(); });
testModeButton.addEventListener('click', () => {
  if (state === 'cps-active') return;
  stopTimers();
  testMode = testMode === 'reaction' ? 'cps' : 'reaction';
  setState(state === 'disconnected' ? 'disconnected' : 'ready');
});
disconnectButton.addEventListener('click', () => disconnectArduino());
modeButton.addEventListener('click', () => { source = 'hardware'; setState('disconnected'); });
window.addEventListener('keydown', event => {
  if (source === 'simulator' && event.code === 'Space' && !event.repeat && !['BUTTON', 'INPUT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); receivedPress(null); }
});
window.addEventListener('keyup', event => { if (source === 'simulator' && event.code === 'Space') { buttonDown = false; render(); } });
function invalidateHidden() {
  if (!(document.hidden || !document.hasFocus())) return;
  if (['waiting', 'go'].includes(state)) fail('Trial invalidated because this page lost focus.', true);
  else if (state === 'cps-active') fail('CPS test stopped because this page lost focus.');
}
document.addEventListener('visibilitychange', invalidateHidden);
window.addEventListener('blur', invalidateHidden);
render();
