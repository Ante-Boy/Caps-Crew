// Get canvas and context
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to fill screen
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Characters for rain effect
const chars = 'アカサタナハマヤラワABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$%&*';
const fontSize = 15;

// Calculate columns and initial drops
let columns = Math.floor(canvas.width / fontSize);
let drops = Array(columns).fill(0).map(() => Math.random() * canvas.height / fontSize);

// Draw Matrix rain
function drawMatrix() {
  // Fade effect on black background
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Set crisp neon-green glyphs with no glow
  ctx.fillStyle = '#00ff00';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.font = `${fontSize}px monospace`;

  // Loop through drops
  for (let i = 0; i < drops.length; i++) {
    const char = chars.charAt(Math.floor(Math.random() * chars.length));
    ctx.fillText(char, i * fontSize, drops[i] * fontSize);

    // Reset drop to top randomly
    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }

  // Animate next frame
  requestAnimationFrame(drawMatrix);
}

drawMatrix();
