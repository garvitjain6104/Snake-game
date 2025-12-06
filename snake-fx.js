/* --- CONFIGURATION --- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const finalScoreEl = document.getElementById("final-score");
const gameOverOverlay = document.getElementById("game-over-overlay");
const restartBtn = document.getElementById("restart-btn");

const GRID_SIZE = 25;
const TILE_COUNT = canvas.width / GRID_SIZE;

// SPEED CONTROL: Higher # = Slower Snake (130 is "Casual")
const GAME_SPEED = 130; 

// Palette
const COLORS = {
    head: "#00f7ff",   // Cyan
    body: "#0091ff",   // Blue
    food: "#ff0055",   // Pink/Red
    grid: "rgba(0, 247, 255, 0.03)"
};

/* --- AUDIO ENGINE (Web Audio API) --- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume(); 

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'eat') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'die') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    }
}

/* --- STATE MANAGEMENT --- */
let snake = [];
let food = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
let nextVelocity = { x: 0, y: 0 };
let score = 0;
let highScore = localStorage.getItem('neonSnakeHighScore') || 0;
let lastTime = 0;
let isGameOver = false;
let animationId;

// VFX State
let particles = [];
let shakeIntensity = 0;
let pulseFrame = 0;

// Initialize High Score UI
highScoreEl.innerText = highScore;

/* --- PARTICLE SYSTEM --- */
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset
        ctx.shadowBlur = 0;
    }
}

/* --- GAME LOGIC --- */
function initGame() {
    snake = [{ x: 10, y: 10 }];
    velocity = { x: 0, y: 0 };
    nextVelocity = { x: 0, y: 0 };
    score = 0;
    shakeIntensity = 0;
    isGameOver = false;
    particles = [];
    
    scoreEl.innerText = score;
    gameOverOverlay.style.display = 'none';
    
    // Ensure Audio is ready
    if (audioCtx.state === 'suspended') audioCtx.resume();

    placeFood();
    if (animationId) cancelAnimationFrame(animationId);
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (isGameOver) return;

    const deltaTime = timestamp - lastTime;
    
    if (deltaTime > GAME_SPEED) {
        lastTime = timestamp;
        update();
    }
    
    updateVFX();
    draw();
    animationId = requestAnimationFrame(gameLoop);
}

function update() {
    // Apply buffered input
    if (nextVelocity.x !== 0 || nextVelocity.y !== 0) {
        velocity = nextVelocity;
    }
    
    // If not moving, don't update physics
    if (velocity.x === 0 && velocity.y === 0) return;

    const head = { x: snake[0].x + velocity.x, y: snake[0].y + velocity.y };

    // Wall Collision
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT || checkSelfCollision(head)) {
        gameOver();
        return;
    }

    snake.unshift(head);

    // Eat Food
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.innerText = score;
        playSound('eat');
        
        // VFX: Explosion & Shake
        spawnParticles(head.x * GRID_SIZE + GRID_SIZE/2, head.y * GRID_SIZE + GRID_SIZE/2, COLORS.food);
        shakeIntensity = 8;
        
        placeFood();
    } else {
        snake.pop();
    }
}

function updateVFX() {
    // Particles
    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0);

    // Screen Shake Decay
    if (shakeIntensity > 0) shakeIntensity *= 0.9;
    if (shakeIntensity < 0.5) shakeIntensity = 0;

    // Pulse Animation
    pulseFrame += 0.1;
}

function draw() {
    // Clear & Shake
    ctx.save();
    if (shakeIntensity > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
    }
    
    ctx.fillStyle = "rgba(5, 5, 5, 1)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawFood();
    drawSnake();
    
    // Draw Particles
    particles.forEach(p => p.draw(ctx));

    // Draw "Press Start" text if snake is not moving
    if (velocity.x === 0 && velocity.y === 0 && !isGameOver) {
        ctx.fillStyle = "white";
        ctx.font = "20px Courier New";
        ctx.textAlign = "center";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "white";
        ctx.fillText("Use Arrow keys or WASD to Play", canvas.width / 2, canvas.height / 2 + 50);
        ctx.shadowBlur = 0; 
    }
    
    ctx.restore();
}

function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=TILE_COUNT; i++) {
        ctx.moveTo(i*GRID_SIZE, 0); ctx.lineTo(i*GRID_SIZE, canvas.height);
        ctx.moveTo(0, i*GRID_SIZE); ctx.lineTo(canvas.width, i*GRID_SIZE);
    }
    ctx.stroke();
}

function drawSnake() {
    snake.forEach((seg, i) => {
        const x = seg.x * GRID_SIZE;
        const y = seg.y * GRID_SIZE;
        
        ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
        ctx.shadowBlur = i === 0 ? 20 : 10;
        ctx.shadowColor = ctx.fillStyle;
        
        // --- SAFE DRAWING METHOD (Works on all browsers) ---
        const size = GRID_SIZE - 2;
        
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x + 1, y + 1, size, size, 4);
            ctx.fill();
        } else {
            ctx.fillRect(x + 1, y + 1, size, size);
        }
        
        ctx.shadowBlur = 0;
    });
}

function drawFood() {
    const x = food.x * GRID_SIZE + GRID_SIZE/2;
    const y = food.y * GRID_SIZE + GRID_SIZE/2;
    
    const scale = 1 + Math.sin(pulseFrame) * 0.15;
    
    ctx.fillStyle = COLORS.food;
    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS.food;
    
    ctx.beginPath();
    ctx.arc(x, y, (GRID_SIZE/2 - 2) * scale, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function placeFood() {
    let valid = false;
    while (!valid) {
        food = {
            x: Math.floor(Math.random() * TILE_COUNT),
            y: Math.floor(Math.random() * TILE_COUNT)
        };
        valid = !checkSelfCollision(food);
    }
}

function checkSelfCollision(pos) {
    return snake.some(s => s.x === pos.x && s.y === pos.y);
}

function spawnParticles(x, y, color) {
    for(let i=0; i<15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function gameOver() {
    isGameOver = true;
    playSound('die');
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonSnakeHighScore', highScore);
        highScoreEl.innerText = highScore;
    }
    
    finalScoreEl.innerText = score;
    gameOverOverlay.style.display = 'flex';
}

/* --- CONTROLS (WASD + ARROWS) --- */
document.addEventListener('keydown', e => {
    // 1. Resume audio context on first user interaction
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // 2. Normalize key input
    const key = e.key.toLowerCase();
    const gameKeys = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"];
    
    if (gameKeys.includes(key)) {
        e.preventDefault();
    }

    switch(key) {
        case 'arrowup':
        case 'w':
            if(velocity.y === 0) nextVelocity = {x:0, y:-1}; 
            break;
        case 'arrowdown':
        case 's':
            if(velocity.y === 0) nextVelocity = {x:0, y:1}; 
            break;
        case 'arrowleft':
        case 'a':
            if(velocity.x === 0) nextVelocity = {x:-1, y:0}; 
            break;
        case 'arrowright':
        case 'd':
            if(velocity.x === 0) nextVelocity = {x:1, y:0}; 
            break;
    }
});

// Mobile Swipe
let touchStart = {x:0, y:0};
canvas.addEventListener('touchstart', e => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    touchStart = { x: e.changedTouches[0].screenX, y: e.changedTouches[0].screenY };
}, {passive: false});

canvas.addEventListener('touchend', e => {
    e.preventDefault(); 
    const touchEnd = { x: e.changedTouches[0].screenX, y: e.changedTouches[0].screenY };
    
    const dx = touchEnd.x - touchStart.x;
    const dy = touchEnd.y - touchStart.y;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && velocity.x === 0) nextVelocity = {x:1, y:0};
        else if (dx < 0 && velocity.x === 0) nextVelocity = {x:-1, y:0};
    } else {
        if (dy > 0 && velocity.y === 0) nextVelocity = {x:0, y:1};
        else if (dy < 0 && velocity.y === 0) nextVelocity = {x:0, y:-1};
    }
}, {passive: false});

restartBtn.addEventListener('click', initGame);

// Start on Load
initGame();