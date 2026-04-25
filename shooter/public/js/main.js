// MAIN — entry point
import { initLobby } from './lobby.js';
import { initGame } from './game.js';

const socket = io();

const connStatus = document.getElementById('connStatus');
socket.on('connect',    () => { connStatus.textContent = 'connected';    connStatus.className = 'conn-status connected'; });
socket.on('disconnect', () => { connStatus.textContent = 'disconnected'; connStatus.className = 'conn-status disconnected'; });
socket.on('connect_error', (e) => console.error('connect_error:', e));

const session = {
  socket,
  selfId: null,
  name: localStorage.getItem('shooter_name') || '',
  character: 'soldier',
};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
}

const startGame = initGame({ session, showScreen });

initLobby({
  session,
  showScreen,
  onStartGame: (data) => {
    showScreen('game');
    startGame(data);
  },
});

console.log('main.js loaded');