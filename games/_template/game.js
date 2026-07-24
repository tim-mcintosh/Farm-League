const canvas = document.getElementById('game');
const context = canvas.getContext('2d');

function drawInitialScreen() {
  context.fillStyle = '#142619';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

drawInitialScreen();

document.querySelectorAll('.game-controls button').forEach(button => {
  button.addEventListener('contextmenu', event => event.preventDefault());
});
