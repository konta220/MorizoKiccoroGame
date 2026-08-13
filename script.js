const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const morizoScoreEl = document.getElementById('morizoScore');
const kiccoroScoreEl = document.getElementById('kiccoroScore');
const timeEl = document.getElementById('time');
const startBtn = document.getElementById('startBtn');

const config = {
    width: canvas.width,
    height: canvas.height,
    timeLimit: 30,
    itemCount: 18,
};

const keys = {};
const images = {};
const activeOscillators = [];
const audio = {
    ctx: null,
    unlocked: false,
    bgTimer: null,
    bgStep: 0,
};
const touchState = {
    morizo: { up: false, down: false, left: false, right: false },
    kiccoro: { up: false, down: false, left: false, right: false },
};
let gameState = 'ready';
let remainingTime = config.timeLimit;
let lastFrame = 0;
let bgmStarted = false;

const players = {
    morizo: {
        name: 'モリゾー',
        x: 150,
        y: 180,
        speed: 3.5,
        radius: 28,
        score: 0,
        invulnerable: 0,
        color: '#79d7ff',
        controls: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
        image: null,
    },
    kiccoro: {
        name: 'キッコロ',
        x: 720,
        y: 340,
        speed: 3.7,
        radius: 25,
        score: 0,
        invulnerable: 0,
        color: '#ff9acb',
        controls: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
        image: null,
    },
};

let items = [];

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`画像の読み込みに失敗しました: ${src}`));
        img.src = src;
    });
}

async function preloadAssets() {
    try {
        images.morizo = await loadImage('morizo.png');
        images.kiccoro = await loadImage('kiccoro.png');
        images.takenoko = await loadImage('takenoko.png');
        players.morizo.image = images.morizo;
        players.kiccoro.image = images.kiccoro;
    } catch (error) {
        console.error(error);
        alert('画像が読み込めなかったので、代替のアイコンでプレイします。');
        players.morizo.image = null;
        players.kiccoro.image = null;
        images.takenoko = null;
    }
}

function spawnItems() {
    items = [];
    for (let i = 0; i < config.itemCount; i += 1) {
        let x = 60 + Math.random() * (config.width - 120);
        let y = 60 + Math.random() * (config.height - 120);

        if (distanceBetween(x, y, players.morizo.x, players.morizo.y) < 90) {
            x = 180 + Math.random() * (config.width - 360);
            y = 120 + Math.random() * (config.height - 240);
        }

        if (distanceBetween(x, y, players.kiccoro.x, players.kiccoro.y) < 90) {
            x = 360 + Math.random() * (config.width - 520);
            y = 220 + Math.random() * (config.height - 380);
        }

        items.push({ x, y, r: 12, pulse: Math.random() * Math.PI * 2 });
    }
}

function unlockAudio() {
    if (!audio.ctx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        audio.ctx = new AudioCtor();
    }

    if (audio.ctx.state === 'suspended') {
        audio.ctx.resume();
    }

    audio.unlocked = true;
}

function playPickupSound() {
    if (!audio.ctx || !audio.unlocked) return;

    const now = audio.ctx.currentTime;
    const oscillator = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.connect(gain);
    gain.connect(audio.ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.18);
}

function playMelody(frequencies, duration, volume = 0.08) {
    if (!audio.ctx || !audio.unlocked) return;

    const startTime = audio.ctx.currentTime;

    frequencies.forEach(([freq, timeOffset], index) => {
        const oscillator = audio.ctx.createOscillator();
        const gain = audio.ctx.createGain();
        const start = startTime + timeOffset;

        oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain);
        gain.connect(audio.ctx.destination);

        oscillator.start(start);
        oscillator.stop(start + duration);
        
        activeOscillators.push(oscillator);
    });
}

function playStartMusic() {
    playMelody([
        [523.25, 0],
        [659.25, 0.18],
        [783.99, 0.36],
    ], 0.25, 0.08);
}

function playEndMusic() {
    playMelody([
        [392.00, 0],
        [329.63, 0.18],
        [293.66, 0.34],
        [261.63, 0.5],
    ], 0.28, 0.07);
}

function stopBackgroundMusic() {
    if (audio.bgTimer) {
        clearInterval(audio.bgTimer);
        audio.bgTimer = null;
    }
    
    activeOscillators.forEach(osc => {
        try {
            osc.stop();
        } catch (e) {
            // 既に停止している可能性がある
        }
    });
    activeOscillators.length = 0;
}

function playBackgroundMusic() {
    if (!audio.ctx || !audio.unlocked) return;
    stopBackgroundMusic();

    const loop = [
        [523.25, 0.00],
        [587.33, 0.30],
        [659.25, 0.60],
        [587.33, 0.90],
        [523.25, 1.20],
        [659.25, 1.50],
        [783.99, 1.80],
        [659.25, 2.10],
    ];

    audio.bgTimer = setInterval(() => {
        if (gameState !== 'running') {
            stopBackgroundMusic();
            return;
        }

        playMelody(loop, 0.22, 0.07);
    }, 2400);

    playMelody(loop, 0.22, 0.07);
}


function resetGame() {
    players.morizo.score = 0;
    players.kiccoro.score = 0;
    remainingTime = config.timeLimit;
    gameState = 'idle';
    lastFrame = 0;
    bgmStarted = false;

    players.morizo.x = 150;
    players.morizo.y = 180;
    players.morizo.invulnerable = 0;
    players.kiccoro.x = 720;
    players.kiccoro.y = 340;
    players.kiccoro.invulnerable = 0;

    spawnItems();
    updateHud();
}

function updateHud() {
    morizoScoreEl.textContent = players.morizo.score;
    kiccoroScoreEl.textContent = players.kiccoro.score;
    timeEl.textContent = Math.ceil(remainingTime);
}

function distanceBetween(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}

function handlePlayerMovement(player) {
    if (!player) return;

    const touch = touchState[player.name === 'モリゾー' ? 'morizo' : 'kiccoro'];
    let moveX = 0;
    let moveY = 0;

    if (keys[player.controls.left] || touch.left) moveX -= 1;
    if (keys[player.controls.right] || touch.right) moveX += 1;
    if (keys[player.controls.up] || touch.up) moveY -= 1;
    if (keys[player.controls.down] || touch.down) moveY += 1;

    if (moveX !== 0 || moveY !== 0) {
        if (gameState === 'ready') {
            gameState = 'running';
            playBackgroundMusic();
            bgmStarted = true;
        } else if (!bgmStarted && gameState === 'running') {
            playBackgroundMusic();
            bgmStarted = true;
        }
        const length = Math.hypot(moveX, moveY) || 1;
        moveX = (moveX / length) * player.speed;
        moveY = (moveY / length) * player.speed;
    }

    player.x = clamp(player.x + moveX, player.radius + 10, config.width - player.radius - 10);
    player.y = clamp(player.y + moveY, player.radius + 10, config.height - player.radius - 10);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function collectItems() {
    items = items.filter((item) => {
        const touchedMorizo = distanceBetween(item.x, item.y, players.morizo.x, players.morizo.y) < item.r + players.morizo.radius;
        const touchedkiccoro = distanceBetween(item.x, item.y, players.kiccoro.x, players.kiccoro.y) < item.r + players.kiccoro.radius;

        if (touchedMorizo || touchedkiccoro) {
            if (touchedMorizo) {
                players.morizo.score += 1;
            }
            if (touchedkiccoro) {
                players.kiccoro.score += 1;
            }
            playPickupSound();
            updateHud();
            return false;
        }

        return true;
    });

    if (items.length < config.itemCount * 0.5) {
        spawnItems();
    }
}

function updatePlayers() {
    handlePlayerMovement(players.morizo);
    handlePlayerMovement(players.kiccoro);
}

function endGame(won) {
    if (gameState === 'ended') return;
    gameState = 'ended';
    stopBackgroundMusic();
    playEndMusic();
    startBtn.textContent = 'リトライ';

    const morizoScore = players.morizo.score;
    const kiccoroScore = players.kiccoro.score;
    const winner = morizoScore === kiccoroScore ? '引き分け' : morizoScore > kiccoroScore ? 'モリゾーの勝ち' : 'キッコロの勝ち';
    const message = `時間切れ！\nモリゾー: ${morizoScore}点\nキッコロ: ${kiccoroScore}点\n結果: ${winner}`;
    alert(message);

    const overlay = document.getElementById('startOverlay');
    overlay.classList.remove('hidden');
}

function drawBackground() {
    ctx.clearRect(0, 0, config.width, config.height);

    const sky = ctx.createLinearGradient(0, 0, 0, config.height);
    sky.addColorStop(0, '#9bd84f');
    sky.addColorStop(0.5, '#7fc844');
    sky.addColorStop(1, '#6db539');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, config.width, config.height);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 20; i += 1) {
        const x = (i * 83 + 30) % config.width;
        const y = 30 + (i % 5) * 18;
        ctx.beginPath();
        ctx.arc(x, y, 18 + (i % 3) * 8, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.01)';
    ctx.lineWidth = 1;
    for (let x = 0; x < config.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, config.height);
        ctx.stroke();
    }
    for (let y = 0; y < config.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(config.width, y);
        ctx.stroke();
    }
}

function drawItem(item) {
    const glow = 1 + Math.sin(item.pulse + performance.now() / 240) * 0.15;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.scale(glow, glow);
    ctx.globalAlpha = 0.9 + Math.sin(item.pulse + performance.now() / 240) * 0.1;

    if (images.takenoko) {
        const size = 24;
        ctx.drawImage(images.takenoko, -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = '#3a8f43';
        ctx.fillRect(-5, -12, 10, 24);
        ctx.fillStyle = '#6aabd6';
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.quadraticCurveTo(-15, -15, -14, -6);
        ctx.lineTo(-4, -6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(4, -10);
        ctx.quadraticCurveTo(15, -15, 14, -6);
        ctx.lineTo(4, -6);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function drawPlayer(player) {
    const size = player.radius * 2.2;
    const x = player.x - size / 2;
    const y = player.y - size / 2;

    ctx.save();

    if (player.image) {
        if (player.invulnerable > 0) {
            ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 80) * 0.4;
        }
        ctx.drawImage(player.image, x, y, size, size);
    } else {
        if (player.invulnerable > 0) {
            ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 80) * 0.4;
        }
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y + player.radius + 18);
    ctx.restore();
}

function drawTimeGauge() {
    const barWidth = config.width;
    const barHeight = 20;
    const progress = Math.max(0, remainingTime / config.timeLimit);
    const filledWidth = barWidth * progress;

    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, barWidth, barHeight);

    let barColor = '#4caf50';
    if (progress < 0.33) {
        barColor = '#f44336';
    } else if (progress < 0.67) {
        barColor = '#ff9800';
    }

    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, filledWidth, barHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, barWidth, barHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(remainingTime)}秒`, barWidth / 2, barHeight / 2);

    ctx.restore();
}

function tick(timestamp) {
    if (gameState === 'running') {
        if (!lastFrame) lastFrame = timestamp;
        const delta = (timestamp - lastFrame) / 1000;
        lastFrame = timestamp;

        remainingTime -= delta;
        if (remainingTime <= 0) {
            remainingTime = 0;
            endGame(false);
        }

        collectItems();
        updateHud();
    }

    updatePlayers();
    drawBackground();
    drawTimeGauge();
    items.forEach(drawItem);
    drawPlayer(players.morizo);
    drawPlayer(players.kiccoro);

    requestAnimationFrame(tick);
}

window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        event.preventDefault();
    }
    unlockAudio();
    keys[event.code] = true;
});

window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

function setTouchDirection(playerName, dir, pressed) {
    const playerKey = playerName === 'morizo' ? 'morizo' : 'kiccoro';
    touchState[playerKey][dir] = pressed;
}

document.querySelectorAll('.touch-pad').forEach((button) => {
    const player = button.dataset.player;
    const dir = button.dataset.dir;

    const press = (event) => {
        event.preventDefault();
        unlockAudio();
        setTouchDirection(player, dir, true);
    };

    const release = (event) => {
        event.preventDefault();
        setTouchDirection(player, dir, false);
    };

    button.addEventListener('touchstart', press, { passive: false });
    button.addEventListener('touchend', release, { passive: false });
    button.addEventListener('touchcancel', release, { passive: false });
    button.addEventListener('mousedown', press);
    button.addEventListener('mouseup', release);
    button.addEventListener('mouseleave', release);
});

startBtn.addEventListener('click', () => {
    const overlay = document.getElementById('startOverlay');
    overlay.classList.add('hidden');
    unlockAudio();
    stopBackgroundMusic();
    resetGame();
    gameState = 'ready';
    playStartMusic();
    startBtn.textContent = 'リスタート';
});

preloadAssets().then(() => {
    resetGame();
    requestAnimationFrame(tick);
});
