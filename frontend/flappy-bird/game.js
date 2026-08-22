/*
  Flappy Bird-style canvas game. Adapted from the game structure of
  github.com/nebez/floppybird (Apache-2.0); this version uses original canvas
  drawing and no external assets or dependencies.
*/

const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const connectButton = document.querySelector('#connect');
const restartButton = document.querySelector('#restart');
const connection = document.querySelector('#connection');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND = 570;
const bird = { x: 105, y: 280, velocity: 0, radius: 17, rotation: 0 };
let gameState = 'ready';
let score = 0;
let bestScore = Number(localStorage.getItem('giant-button-flappy-best') || 0);
let pipes = [];
let lastFrame = performance.now();
let nextPipeAt = 0;
let serialPort = null;
let serialReader = null;
let serialClosing = false;
let serialBuffer = '';

function resetGame() {
  bird.y = 280;
  bird.velocity = 0;
  bird.rotation = 0;
  pipes = [];
  score = 0;
  nextPipeAt = performance.now() + 900;
  gameState = 'ready';
}

function startGame() {
  if (gameState === 'running') return;
  resetGame();
  gameState = 'running';
  flap();
}

function flap() {
  if (gameState === 'game-over') return startGame();
  if (gameState === 'ready') return startGame();
  bird.velocity = -390;
  bird.rotation = -0.5;
}

function addPipe() {
  const gap = 155;
  const top = 105 + Math.random() * 230;
  pipes.push({ x: WIDTH + 40, top, bottom: top + gap, passed: false });
}

function overlapsPipe(pipe) {
  const left = bird.x - bird.radius;
  const right = bird.x + bird.radius;
  const top = bird.y - bird.radius;
  const bottom = bird.y + bird.radius;
  return right > pipe.x && left < pipe.x + 68 && (top < pipe.top || bottom > pipe.bottom);
}

function finishGame() {
  gameState = 'game-over';
  bestScore = Math.max(bestScore, score);
  localStorage.setItem('giant-button-flappy-best', String(bestScore));
}

function update(delta, now) {
  if (gameState !== 'running') return;
  bird.velocity += 1150 * delta;
  bird.y += bird.velocity * delta;
  bird.rotation = Math.min(1.15, bird.rotation + 2.4 * delta);
  if (now >= nextPipeAt) {
    addPipe();
    nextPipeAt = now + 1450;
  }
  for (const pipe of pipes) {
    pipe.x -= 165 * delta;
    if (!pipe.passed && pipe.x + 68 < bird.x) {
      pipe.passed = true;
      score += 1;
    }
    if (overlapsPipe(pipe)) finishGame();
  }
  pipes = pipes.filter(pipe => pipe.x > -80);
  if (bird.y - bird.radius < 0 || bird.y + bird.radius > GROUND) finishGame();
}

function roundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
}

function drawPipe(pipe) {
  context.fillStyle = '#77bf45';
  context.strokeStyle = '#285c37';
  context.lineWidth = 4;
  roundedRect(pipe.x, -20, 68, pipe.top + 20, 8);
  roundedRect(pipe.x, pipe.bottom, 68, GROUND - pipe.bottom + 25, 8);
  context.fillStyle = '#9ce36c';
  context.fillRect(pipe.x + 7, 0, 9, pipe.top - 2);
  context.fillRect(pipe.x + 7, pipe.bottom + 2, 9, GROUND - pipe.bottom);
}

function drawBird() {
  context.save();
  context.translate(bird.x, bird.y);
  context.rotate(bird.rotation);
  context.fillStyle = '#ffd54e';
  context.strokeStyle = '#8a5629';
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, 0, 22, 17, 0, 0, Math.PI * 2);
  context.fill(); context.stroke();
  context.fillStyle = '#fff';
  context.beginPath(); context.arc(8, -6, 7, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = '#1a3340'; context.beginPath(); context.arc(10, -6, 2.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#f36d3d'; context.beginPath(); context.moveTo(20, 1); context.lineTo(36, 7); context.lineTo(20, 12); context.closePath(); context.fill(); context.stroke();
  context.fillStyle = '#f0ac2e'; context.beginPath(); context.ellipse(-6, 8, 11, 5, -.4, 0, Math.PI * 2); context.fill(); context.stroke();
  context.restore();
}

function drawText(text, y, size = 28, color = '#fff') {
  context.font = `900 ${size}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(23,53,74,.42)';
  context.strokeText(text, WIDTH / 2, y);
  context.fillStyle = color;
  context.fillText(text, WIDTH / 2, y);
}

function draw() {
  const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#75cbef'); sky.addColorStop(1, '#d8f6ff');
  context.fillStyle = sky; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = 'rgba(255,255,255,.6)';
  for (let cloud = 0; cloud < 4; cloud += 1) {
    const x = (cloud * 137 + 45) % WIDTH;
    const y = 62 + (cloud % 2) * 80;
    context.beginPath(); context.ellipse(x, y, 38, 14, 0, 0, Math.PI * 2); context.ellipse(x + 27, y + 3, 24, 11, 0, 0, Math.PI * 2); context.fill();
  }
  pipes.forEach(drawPipe);
  context.fillStyle = '#ded05a'; context.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
  context.fillStyle = '#a2bd49'; context.fillRect(0, GROUND, WIDTH, 10);
  drawBird();
  drawText(String(score), 72, 48);
  if (gameState === 'ready') {
    drawText('FLAP TO START', 245, 27, '#17354a');
    drawText('SPACE · CLICK · BUTTON', 280, 16, '#17354a');
  } else if (gameState === 'game-over') {
    context.fillStyle = 'rgba(255,255,255,.9)'; context.fillRect(55, 185, WIDTH - 110, 180);
    drawText('GAME OVER', 235, 31, '#f06a3d');
    drawText(`SCORE ${score}`, 285, 22, '#17354a');
    drawText(`BEST ${bestScore}`, 320, 18, '#17354a');
    drawText('FLAP TO RESTART', 345, 14, '#17354a');
  }
}

function frame(now) {
  const delta = Math.min(.035, (now - lastFrame) / 1000);
  lastFrame = now;
  update(delta, now);
  draw();
  requestAnimationFrame(frame);
}

async function connectGiantButton() {
  if (!navigator.serial) { connection.textContent = 'WEB SERIAL NEEDS CHROME OR EDGE'; return; }
  try {
    await disconnectGiantButton();
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200, bufferSize: 255 });
    serialClosing = false;
    connection.textContent = 'GIANT BUTTON CONNECTED';
    void readSerial();
  } catch { connection.textContent = 'CONNECTION FAILED'; }
}

async function readSerial() {
  try {
    serialReader = serialPort.readable.getReader();
    while (!serialClosing) {
      const { value, done } = await serialReader.read();
      if (done) break;
      serialBuffer += new TextDecoder().decode(value);
      let end;
      while ((end = serialBuffer.indexOf('\n')) >= 0) {
        const line = serialBuffer.slice(0, end).trim();
        serialBuffer = serialBuffer.slice(end + 1);
        if (line.startsWith('PRESS,')) flap();
      }
    }
  } catch { connection.textContent = 'BUTTON DISCONNECTED'; }
  finally { try { serialReader?.releaseLock(); } catch {} serialReader = null; }
}

async function disconnectGiantButton() {
  serialClosing = true;
  try { await serialReader?.cancel(); } catch {}
  try { serialReader?.releaseLock(); } catch {}
  try { await serialPort?.close(); } catch {}
  serialReader = null; serialPort = null; serialBuffer = '';
}

canvas.addEventListener('pointerdown', event => { event.preventDefault(); flap(); });
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); flap(); }
});
connectButton.addEventListener('click', connectGiantButton);
restartButton.addEventListener('click', resetGame);
window.addEventListener('beforeunload', () => { void disconnectGiantButton(); });
resetGame();
requestAnimationFrame(frame);
