/* Giant Button Reaction Tester — plain JavaScript, no build step required. */

const SETTINGS = {
  baudRate: 115200,
  minimumWaitMilliseconds: 1500,
  maximumWaitMilliseconds: 5000,
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
const modeButton = document.querySelector('#mode-button');
const disconnectButton = document.querySelector('#disconnect-button');

let state = 'disconnected';
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
let stimulusTime = null;
let lastArduinoMicros = null;
let errorMessage = '';
let trialResults = [];
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
  waitTimer = null;
  paintFrame = null;
}

function page(eyebrow, title, text, actions = '') {
  return `<p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${text}</p>${actions}`;
}

function startButton() {
  return `<button class="primary" id="start-button" ${buttonDown ? 'disabled' : ''}>${buttonDown ? 'Release button' : 'Start trial'}</button>`;
}

function render() {
  deviceStatus.textContent = source === 'simulator' ? 'SIMULATOR' : state === 'disconnected' ? 'OFFLINE' : buttonDown ? 'BUTTON HELD' : 'BUTTON RELEASED';
  if (state === 'disconnected') {
    stage.innerHTML = page('REACTION TIME TESTER', 'Ready when<br>you are.', 'Connect the Arduino Nano, then hit the giant button the instant the screen turns green.', '<div class="button-row"><button class="primary" id="connect-button">Connect Arduino</button><button id="simulator-button">Use keyboard simulator</button></div><span class="hint">Chrome or Edge on Windows · 115200 baud · switch on D2</span>');
  } else if (state === 'connecting') {
    stage.innerHTML = page('CONNECTING', 'Finding the<br>giant button…', 'Select the Nano’s COM port. It may reset once connected.');
  } else if (state === 'ready') {
    stage.innerHTML = page('SYSTEM READY', 'Fast hands?', 'Keep the button released. The wait is random, so don’t anticipate it.', startButton());
  } else if (state === 'waiting') {
    stage.innerHTML = page('WAIT FOR IT', 'Hold<br>steady.', 'Pressing now is a false start.');
  } else if (state === 'go') {
    stage.innerHTML = '<h1 class="go">GO!</h1>';
  } else if (state === 'result') {
    const last = trialResults.at(-1);
    stage.innerHTML = `<p class="eyebrow">REACTION TIME</p><h1 class="result">${Math.round(last.reactionTimeMs)}<small> ms</small></h1><p>Measured arrival time: ${last.reactionTimeMs.toFixed(1)} ms${last.source === 'simulator' ? ' · simulated' : ''}</p>${startButton()}`;
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
  const values = trialResults.filter(row => row.valid && !row.falseStart && row.reactionTimeMs !== null).map(row => row.reactionTimeMs);
  if (!values.length) statistics.innerHTML = '<p class="muted">No valid trials yet.</p>';
  else {
    const sorted = [...values].sort((a, b) => a - b);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) : null;
    const card = (value, label) => `<div><b>${value}</b><span>${label}</span></div>`;
    statistics.innerHTML = `<div class="stats">${card(values.length, 'valid')}${card(average.toFixed(1), 'average ms')}${card(median.toFixed(1), 'median ms')}${card(sorted[0].toFixed(1), 'fastest ms')}${card(sorted.at(-1).toFixed(1), 'slowest ms')}${card(sd === null ? '—' : sd.toFixed(1), 'std dev ms')}</div>`;
  }
  counts.textContent = `${trialResults.filter(row => row.falseStart).length} false starts · ${trialResults.filter(row => !row.valid).length} invalid`;
  exportButton.disabled = !trialResults.length;
  clearButton.disabled = !trialResults.length;
  modeButton.hidden = source !== 'simulator';
  disconnectButton.hidden = source !== 'hardware' || state === 'disconnected';
  diagnostics.innerHTML = `<dt>State</dt><dd>${state}</dd><dt>Source</dt><dd>${source}</dd><dt>Button</dt><dd>${buttonDown ? 'pressed' : 'released'}</dd><dt>Stimulus</dt><dd>${stimulusTime?.toFixed(3) ?? '—'}</dd><dt>Arduino μs</dt><dd>${lastArduinoMicros ?? '—'}</dd>`;
  if (!logLines.length) serialLog.textContent = 'No serial traffic.';
}

function record(pressTime, arduinoMicros, falseStart, valid = true, invalidReason = '') {
  trialResults.push({
    trialNumber: trialResults.length + 1,
    reactionTimeMs: falseStart || stimulusTime === null ? null : Math.max(0, pressTime - stimulusTime),
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
  if (state === 'waiting') {
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
    source = 'hardware'; setState('ready');
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

function useSimulator() { void disconnectArduino(false); source = 'simulator'; buttonDown = false; setState('ready'); }

function exportCsv() {
  const keys = ['trialNumber', 'reactionTimeMs', 'falseStart', 'browserStimulusTimestampMs', 'browserPressReceivedTimestampMs', 'arduinoPressMicros', 'dateTime', 'source', 'valid', 'invalidReason'];
  const headers = ['trial_number', 'reaction_time_ms', 'false_start', 'browser_stimulus_timestamp_ms', 'browser_press_received_timestamp_ms', 'arduino_press_micros', 'date_time', 'source', 'valid', 'invalid_reason'];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers, ...trialResults.map(row => keys.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = `reaction-times-${new Date().toISOString().replaceAll(':', '-')}.csv`; link.click(); URL.revokeObjectURL(url);
}

exportButton.addEventListener('click', exportCsv);
clearButton.addEventListener('click', () => { trialResults = []; render(); });
disconnectButton.addEventListener('click', () => disconnectArduino());
modeButton.addEventListener('click', () => { source = 'hardware'; setState('disconnected'); });
window.addEventListener('keydown', event => {
  if (source === 'simulator' && event.code === 'Space' && !event.repeat && !['BUTTON', 'INPUT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); receivedPress(null); }
});
window.addEventListener('keyup', event => { if (source === 'simulator' && event.code === 'Space') { buttonDown = false; render(); } });
function invalidateHidden() { if ((document.hidden || !document.hasFocus()) && ['waiting', 'go'].includes(state)) fail('Trial invalidated because this page lost focus.', true); }
document.addEventListener('visibilitychange', invalidateHidden);
window.addEventListener('blur', invalidateHidden);
render();
