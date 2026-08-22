/* Giant Button Lab: reaction time, CPS, and Flappy Bird in one static page. */

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
const reactionModeButton = document.querySelector('#reaction-mode-button');
const cpsModeButton = document.querySelector('#cps-mode-button');
const flappyModeButton = document.querySelector('#flappy-mode-button');
const disconnectButton = document.querySelector('#disconnect-button');

let state = 'disconnected';
let testMode = 'reaction';
let buttonDown = false;
let serialPort = null;
let reader = null;
let serialBuffer = '';
let closing = false;
let waitTimer = null;
let paintFrame = null;
let cpsTimer = null;
let cpsEndsAt = null;
let cpsPresses = 0;
let stimulusTime = null;
let lastArduinoMicros = null;
let errorMessage = '';
let trialResults = [];
let cpsResults = [];
let logLines = [];

let flappyCanvas = null;
let flappyContext = null;
let flappyFrame = null;
let flappyState = 'ready';
let flappyScore = 0;
let flappyBest = Number(localStorage.getItem('giant-button-flappy-best') || 0);
let flappyPipes = [];
let flappyBird = null;
let flappyLastFrame = 0;
let flappyNextPipeAt = 0;

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
  stopFlappy();
}

function page(eyebrow, title, text, actions = '') {
  return `<p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${text}</p>${actions}`;
}

function render() {
  deviceStatus.textContent = state === 'disconnected' ? 'OFFLINE' : buttonDown ? 'BUTTON HELD' : 'BUTTON RELEASED';
  if (state === 'disconnected') {
    stage.innerHTML = page('GIANT BUTTON LAB', 'Connect the<br>Nano.', 'Choose the Nano’s COM port. The physical button is the only game control.', '<div class="button-row"><button class="primary" id="connect-button">Connect Arduino</button></div><span class="hint">Chrome or Edge on Windows · 115200 baud · switch on D2</span>');
  } else if (state === 'connecting') {
    stage.innerHTML = page('CONNECTING', 'Finding the<br>giant button…', 'Select the Nano’s COM port. It may reset once connected.');
  } else if (testMode === 'flappy' && state === 'ready') {
    stage.innerHTML = '<p class="eyebrow">FLAPPY BIRD</p><h1>Button<br>Bird</h1><p>Press the giant button to start and flap. Press again after a crash to restart.</p><canvas class="flappy-game" id="flappy-game" width="420" height="620" aria-label="Flappy Bird controlled by the giant button"></canvas>';
    startFlappy();
  } else if (state === 'ready') {
    stage.innerHTML = testMode === 'cps'
      ? page('CPS TEST', 'How fast can<br>you press?', `Press the giant button once to start, then press as many times as you can in ${SETTINGS.cpsDurationSeconds} seconds.`)
      : page('REACTION TIME', 'Fast hands?', 'Press the giant button once to start. Release it, wait for green GO, then press again as fast as you can.');
  } else if (state === 'waiting') {
    stage.innerHTML = page('WAIT FOR IT', 'Hold<br>steady.', 'Pressing now is a false start.');
  } else if (state === 'go') {
    stage.innerHTML = '<h1 class="go">GO!</h1>';
  } else if (state === 'result') {
    const last = trialResults.at(-1);
    stage.innerHTML = `<p class="eyebrow">REACTION TIME</p><h1 class="result">${Math.round(last.reactionTimeMs)}<small> ms</small></h1><p>Raw arrival: ${last.rawReactionTimeMs.toFixed(1)} ms · corrected by ${last.linkDelayMs.toFixed(2)} ms. Press the giant button to start again.</p>`;
  } else if (state === 'cps-active') {
    const remaining = Math.max(0, (cpsEndsAt - performance.now()) / 1000);
    stage.innerHTML = `<p class="eyebrow">CPS TEST</p><h1 class="result">${cpsPresses}<small> clicks</small></h1><p>${remaining.toFixed(1)} seconds remaining · press as fast as you can</p>`;
  } else if (state === 'cps-result') {
    const last = cpsResults.at(-1);
    stage.innerHTML = `<p class="eyebrow">CPS RESULT</p><h1 class="result">${last.cps.toFixed(1)}<small> CPS</small></h1><p>${last.clicks} clicks in ${last.durationSeconds} seconds. Press the giant button to start again.</p>`;
  } else if (state === 'false-start') {
    stage.innerHTML = page('FALSE START', 'TOO<br>EARLY', 'Release the giant button, then press it once to start another attempt.');
  } else {
    stage.innerHTML = page('TRIAL STOPPED', 'Something<br>changed.', errorMessage, '<button class="primary" id="recover-button">Reconnect Arduino</button>');
  }
  document.querySelector('#connect-button')?.addEventListener('click', connectArduino);
  document.querySelector('#recover-button')?.addEventListener('click', connectArduino);
  updatePanel();
}

function card(value, label) { return `<div><b>${value}</b><span>${label}</span></div>`; }

function updatePanel() {
  if (testMode === 'reaction') {
    const values = trialResults.filter(row => row.valid && !row.falseStart && row.reactionTimeMs !== null).map(row => row.reactionTimeMs);
    if (!values.length) statistics.innerHTML = '<p class="muted">No valid trials yet.</p>';
    else {
      const sorted = [...values].sort((a, b) => a - b);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      statistics.innerHTML = `<div class="stats">${card(values.length, 'valid')}${card(average.toFixed(1), 'average ms')}${card(sorted[0].toFixed(1), 'fastest ms')}${card(sorted.at(-1).toFixed(1), 'slowest ms')}</div>`;
    }
    counts.textContent = `${trialResults.filter(row => row.falseStart).length} false starts · ${trialResults.filter(row => !row.valid).length} invalid`;
  } else if (testMode === 'cps') {
    const values = cpsResults.map(row => row.cps);
    if (!values.length) statistics.innerHTML = '<p class="muted">No CPS tests yet.</p>';
    else {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      statistics.innerHTML = `<div class="stats">${card(values.length, 'tests')}${card(average.toFixed(1), 'average CPS')}${card(Math.max(...values).toFixed(1), 'best CPS')}${card(cpsResults.reduce((sum, row) => sum + row.clicks, 0), 'total clicks')}</div>`;
    }
    counts.textContent = `${cpsResults.length} completed CPS tests`;
  } else {
    statistics.innerHTML = `<div class="stats">${card(flappyScore, 'current score')}${card(flappyBest, 'best score')}</div>`;
    counts.textContent = 'Use only the giant button to flap';
  }
  const results = testMode === 'reaction' ? trialResults : testMode === 'cps' ? cpsResults : [];
  exportButton.disabled = !results.length;
  clearButton.disabled = !results.length;
  reactionModeButton.disabled = testMode === 'reaction' || state === 'cps-active';
  cpsModeButton.disabled = testMode === 'cps' || state === 'cps-active';
  flappyModeButton.disabled = testMode === 'flappy' || state === 'cps-active';
  disconnectButton.hidden = state === 'disconnected';
  diagnostics.innerHTML = `<dt>Test</dt><dd>${testMode}</dd><dt>State</dt><dd>${state}</dd><dt>Button</dt><dd>${buttonDown ? 'pressed' : 'released'}</dd><dt>Arduino μs</dt><dd>${lastArduinoMicros ?? '—'}</dd><dt>Delay correction</dt><dd>${SETTINGS.calibratedLinkDelayMilliseconds.toFixed(2)} ms</dd>`;
  if (!logLines.length) serialLog.textContent = 'No serial traffic.';
}

function recordReaction(pressTime, arduinoMicros, falseStart, valid = true, invalidReason = '') {
  const rawReactionTimeMs = falseStart || stimulusTime === null ? null : Math.max(0, pressTime - stimulusTime);
  trialResults.push({
    trialNumber: trialResults.length + 1,
    reactionTimeMs: rawReactionTimeMs === null ? null : Math.max(0, rawReactionTimeMs - SETTINGS.calibratedLinkDelayMilliseconds),
    rawReactionTimeMs, linkDelayMs: SETTINGS.calibratedLinkDelayMilliseconds,
    falseStart, browserStimulusTimestampMs: stimulusTime, browserPressReceivedTimestampMs: pressTime,
    arduinoPressMicros: arduinoMicros, dateTime: new Date().toISOString(), source: 'hardware', valid, invalidReason,
  });
}

function fail(message, recordInvalid = false) {
  stopTimers();
  if (recordInvalid && testMode === 'reaction') recordReaction(performance.now(), null, false, false, message);
  errorMessage = message;
  setState('error');
}

function receivedPress(arduinoMicros) {
  buttonDown = true;
  lastArduinoMicros = arduinoMicros;
  const now = performance.now();
  if (testMode === 'flappy' && state === 'ready') return flapFlappy();
  if (testMode === 'reaction' && ['ready', 'result', 'false-start'].includes(state)) return startReaction();
  if (testMode === 'cps' && ['ready', 'cps-result'].includes(state)) return startCpsTest(true);
  if (state === 'cps-active') { cpsPresses += 1; return render(); }
  if (state === 'waiting') { stopTimers(); recordReaction(now, arduinoMicros, true); return setState('false-start'); }
  if (state === 'go') {
    if (stimulusTime === null) return fail('Trial invalidated because the GO frame was not confirmed as paint-ready.', true);
    recordReaction(now, arduinoMicros, false); setState('result');
  }
}

function startReaction() {
  stimulusTime = null;
  setState('waiting');
  const delay = SETTINGS.minimumWaitMilliseconds + Math.random() * (SETTINGS.maximumWaitMilliseconds - SETTINGS.minimumWaitMilliseconds);
  waitTimer = setTimeout(() => {
    if (state !== 'waiting') return;
    setState('go');
    paintFrame = requestAnimationFrame(() => { if (state === 'go') stimulusTime = performance.now(); });
  }, delay);
}

function startCpsTest(countOpeningPress) {
  cpsPresses = countOpeningPress ? 1 : 0;
  cpsEndsAt = performance.now() + SETTINGS.cpsDurationSeconds * 1000;
  setState('cps-active');
  cpsTimer = setInterval(() => {
    if (state !== 'cps-active') return;
    if (performance.now() < cpsEndsAt) return render();
    clearInterval(cpsTimer); cpsTimer = null;
    cpsResults.push({ testNumber: cpsResults.length + 1, clicks: cpsPresses, durationSeconds: SETTINGS.cpsDurationSeconds, cps: cpsPresses / SETTINGS.cpsDurationSeconds, dateTime: new Date().toISOString(), source: 'hardware' });
    setState('cps-result');
  }, 50);
}

async function connectArduino() {
  if (!navigator.serial) return fail('Web Serial requires desktop Chrome or Edge over HTTPS.');
  setState('connecting'); errorMessage = '';
  try {
    await disconnectArduino(false);
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: SETTINGS.baudRate, bufferSize: 255 });
    closing = false;
    void readSerial();
    setState('ready');
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
  const [kind, value] = line.split(',');
  if (kind === 'READY' && ['waiting', 'go'].includes(state)) return fail('Trial invalidated because the Arduino reset.', true);
  if (kind === 'PRESS') {
    const micros = Number(value);
    if (Number.isInteger(micros) && micros >= 0) receivedPress(micros);
  } else if (kind === 'RELEASE') {
    buttonDown = false;
    lastArduinoMicros = Number(value) || lastArduinoMicros;
    if (testMode !== 'flappy') render();
  }
}

async function disconnectArduino(showState = true) {
  closing = true;
  stopTimers();
  try { await reader?.cancel(); } catch {}
  try { reader?.releaseLock(); } catch {}
  try { await serialPort?.close(); } catch {}
  reader = null; serialPort = null; serialBuffer = ''; buttonDown = false;
  if (showState) setState('disconnected');
}

function setMode(next) {
  if (state === 'cps-active') return;
  stopTimers();
  testMode = next;
  setState(state === 'disconnected' ? 'disconnected' : 'ready');
}

function downloadCsv(headers, rows, keys, filename) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}-${new Date().toISOString().replaceAll(':', '-')}.csv`; link.click(); URL.revokeObjectURL(url);
}

function exportCsv() {
  if (testMode === 'cps') return downloadCsv(['test_number', 'clicks', 'duration_seconds', 'clicks_per_second', 'date_time'], cpsResults, ['testNumber', 'clicks', 'durationSeconds', 'cps', 'dateTime'], 'cps-tests');
  downloadCsv(['trial_number', 'reaction_time_ms_corrected', 'reaction_time_ms_raw', 'estimated_link_delay_ms', 'false_start', 'date_time'], trialResults, ['trialNumber', 'reactionTimeMs', 'rawReactionTimeMs', 'linkDelayMs', 'falseStart', 'dateTime'], 'reaction-times');
}

function stopFlappy() { cancelAnimationFrame(flappyFrame); flappyFrame = null; flappyCanvas = null; flappyContext = null; }

function startFlappy() {
  stopFlappy();
  flappyCanvas = document.querySelector('#flappy-game');
  flappyContext = flappyCanvas?.getContext('2d');
  if (!flappyContext) return;
  flappyBird = { x: 105, y: 280, velocity: 0, radius: 17, rotation: 0 };
  flappyPipes = []; flappyScore = 0; flappyState = 'ready'; flappyLastFrame = performance.now(); flappyNextPipeAt = flappyLastFrame + 900;
  flappyFrame = requestAnimationFrame(flappyLoop);
}

function flapFlappy() {
  if (!flappyContext) return;
  if (flappyState === 'game-over') startFlappy();
  if (flappyState === 'ready') flappyState = 'running';
  flappyBird.velocity = -390; flappyBird.rotation = -.5;
}

function flappyLoop(now) {
  if (!flappyContext || testMode !== 'flappy' || state !== 'ready') return;
  const delta = Math.min(.035, (now - flappyLastFrame) / 1000);
  flappyLastFrame = now;
  if (flappyState === 'running') updateFlappy(delta, now);
  drawFlappy();
  flappyFrame = requestAnimationFrame(flappyLoop);
}

function updateFlappy(delta, now) {
  flappyBird.velocity += 1150 * delta; flappyBird.y += flappyBird.velocity * delta; flappyBird.rotation = Math.min(1.15, flappyBird.rotation + 2.4 * delta);
  if (now >= flappyNextPipeAt) { const top = 105 + Math.random() * 230; flappyPipes.push({ x: 460, top, bottom: top + 155, passed: false }); flappyNextPipeAt = now + 1450; }
  for (const pipe of flappyPipes) {
    pipe.x -= 165 * delta;
    if (!pipe.passed && pipe.x + 68 < flappyBird.x) { pipe.passed = true; flappyScore += 1; }
    const hitPipe = flappyBird.x + flappyBird.radius > pipe.x && flappyBird.x - flappyBird.radius < pipe.x + 68 && (flappyBird.y - flappyBird.radius < pipe.top || flappyBird.y + flappyBird.radius > pipe.bottom);
    if (hitPipe) finishFlappy();
  }
  flappyPipes = flappyPipes.filter(pipe => pipe.x > -80);
  if (flappyBird.y - flappyBird.radius < 0 || flappyBird.y + flappyBird.radius > 570) finishFlappy();
}

function finishFlappy() { flappyState = 'game-over'; flappyBest = Math.max(flappyBest, flappyScore); localStorage.setItem('giant-button-flappy-best', String(flappyBest)); updatePanel(); }
function flappyRect(x, y, width, height, radius) { flappyContext.beginPath(); flappyContext.roundRect(x, y, width, height, radius); flappyContext.fill(); flappyContext.stroke(); }
function flappyText(text, y, size, color = '#fff') { flappyContext.font = `900 ${size}px system-ui`; flappyContext.textAlign = 'center'; flappyContext.lineWidth = 5; flappyContext.strokeStyle = 'rgba(23,53,74,.42)'; flappyContext.strokeText(text, 210, y); flappyContext.fillStyle = color; flappyContext.fillText(text, 210, y); }

function drawFlappy() {
  const sky = flappyContext.createLinearGradient(0, 0, 0, 620); sky.addColorStop(0, '#75cbef'); sky.addColorStop(1, '#d8f6ff'); flappyContext.fillStyle = sky; flappyContext.fillRect(0, 0, 420, 620);
  flappyContext.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 4; i += 1) { const x = i * 137 + 45; const y = 62 + (i % 2) * 80; flappyContext.beginPath(); flappyContext.ellipse(x, y, 38, 14, 0, 0, Math.PI * 2); flappyContext.ellipse(x + 27, y + 3, 24, 11, 0, 0, Math.PI * 2); flappyContext.fill(); }
  flappyContext.lineWidth = 4; flappyContext.strokeStyle = '#285c37'; flappyContext.fillStyle = '#77bf45'; for (const pipe of flappyPipes) { flappyRect(pipe.x, -20, 68, pipe.top + 20, 8); flappyRect(pipe.x, pipe.bottom, 68, 595 - pipe.bottom, 8); }
  flappyContext.fillStyle = '#ded05a'; flappyContext.fillRect(0, 570, 420, 50); flappyContext.fillStyle = '#a2bd49'; flappyContext.fillRect(0, 570, 420, 10);
  flappyContext.save(); flappyContext.translate(flappyBird.x, flappyBird.y); flappyContext.rotate(flappyBird.rotation); flappyContext.fillStyle = '#ffd54e'; flappyContext.strokeStyle = '#8a5629'; flappyContext.lineWidth = 3; flappyContext.beginPath(); flappyContext.ellipse(0, 0, 22, 17, 0, 0, Math.PI * 2); flappyContext.fill(); flappyContext.stroke(); flappyContext.fillStyle = '#fff'; flappyContext.beginPath(); flappyContext.arc(8, -6, 7, 0, Math.PI * 2); flappyContext.fill(); flappyContext.stroke(); flappyContext.fillStyle = '#1a3340'; flappyContext.beginPath(); flappyContext.arc(10, -6, 2.5, 0, Math.PI * 2); flappyContext.fill(); flappyContext.fillStyle = '#f36d3d'; flappyContext.beginPath(); flappyContext.moveTo(20, 1); flappyContext.lineTo(36, 7); flappyContext.lineTo(20, 12); flappyContext.closePath(); flappyContext.fill(); flappyContext.restore();
  flappyText(String(flappyScore), 72, 48);
  if (flappyState === 'ready') { flappyText('PRESS BUTTON TO START', 245, 21, '#17354a'); }
  if (flappyState === 'game-over') { flappyContext.fillStyle = 'rgba(255,255,255,.9)'; flappyContext.fillRect(45, 185, 330, 175); flappyText('GAME OVER', 235, 30, '#f06a3d'); flappyText(`SCORE ${flappyScore}`, 280, 20, '#17354a'); flappyText(`BEST ${flappyBest}`, 315, 18, '#17354a'); flappyText('PRESS BUTTON TO RESTART', 340, 13, '#17354a'); }
}

exportButton.addEventListener('click', exportCsv);
clearButton.addEventListener('click', () => { if (testMode === 'reaction') trialResults = []; else if (testMode === 'cps') cpsResults = []; render(); });
reactionModeButton.addEventListener('click', () => setMode('reaction'));
cpsModeButton.addEventListener('click', () => setMode('cps'));
flappyModeButton.addEventListener('click', () => setMode('flappy'));
disconnectButton.addEventListener('click', () => disconnectArduino());
function invalidateHidden() {
  if (!(document.hidden || !document.hasFocus())) return;
  if (['waiting', 'go'].includes(state)) fail('Trial invalidated because this page lost focus.', true);
  else if (state === 'cps-active') fail('CPS test stopped because this page lost focus.');
}
document.addEventListener('visibilitychange', invalidateHidden);
window.addEventListener('blur', invalidateHidden);
render();
