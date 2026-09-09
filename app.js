const characters = [
  { name: 'Alex', avatar: '🧑🏻', color: '#ffc2b4', hair: 'dark', glasses: false, hat: false, facialHair: false },
  { name: 'Bailey', avatar: '👩🏽', color: '#f6c0d0', hair: 'dark', glasses: true, hat: false, facialHair: false },
  { name: 'Casey', avatar: '🧑🏼', color: '#f7df85', hair: 'light', glasses: false, hat: true, facialHair: false },
  { name: 'Drew', avatar: '👨🏿', color: '#b9e3cb', hair: 'dark', glasses: false, hat: false, facialHair: true },
  { name: 'Emery', avatar: '👩🏻', color: '#bedaff', hair: 'light', glasses: false, hat: false, facialHair: false },
  { name: 'Finley', avatar: '🧔🏽', color: '#ecc2ff', hair: 'dark', glasses: true, hat: true, facialHair: true },
  { name: 'Gray', avatar: '👨🏼', color: '#ffd2a6', hair: 'light', glasses: false, hat: false, facialHair: true },
  { name: 'Harper', avatar: '👩🏿', color: '#ffb9b2', hair: 'dark', glasses: true, hat: true, facialHair: false },
  { name: 'Jamie', avatar: '🧑🏾', color: '#d0f0b4', hair: 'dark', glasses: false, hat: false, facialHair: false },
  { name: 'Kai', avatar: '👨🏻', color: '#c8d5ff', hair: 'dark', glasses: true, hat: false, facialHair: true },
  { name: 'Logan', avatar: '👩🏼', color: '#f6dea0', hair: 'light', glasses: false, hat: true, facialHair: false },
  { name: 'Morgan', avatar: '🧑🏿', color: '#e5c6e9', hair: 'dark', glasses: true, hat: false, facialHair: false }
];
const questions = [
  ['Do they wear glasses?', character => character.glasses],
  ['Do they wear a hat?', character => character.hat],
  ['Do they have dark hair?', character => character.hair === 'dark'],
  ['Do they have light hair?', character => character.hair === 'light'],
  ['Do they have facial hair?', character => character.facialHair]
];
let secret;
let player = 1;
const board = document.querySelector('#board');
const turn = document.querySelector('#turn');
const answer = document.querySelector('#answer');
const questionList = document.querySelector('#questions');
const guessDialog = document.querySelector('#guess-dialog');
const guessSelect = document.querySelector('#guess-select');

function pickSecret() { return characters[Math.floor(Math.random() * characters.length)]; }
function renderBoard() {
  board.replaceChildren(...characters.map(character => {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'card'; card.style.setProperty('--card-color', character.color);
    card.setAttribute('aria-pressed', 'false'); card.innerHTML = `<span class="avatar" aria-hidden="true">${character.avatar}</span><span class="name">${character.name}</span>`;
    card.addEventListener('click', () => { const out = card.classList.toggle('out'); card.setAttribute('aria-pressed', String(out)); });
    return card;
  }));
}
function switchPlayer() { player = player === 1 ? 2 : 1; turn.textContent = `Player ${player}'s turn`; }
function askQuestion(label, test) { answer.textContent = secret && test(secret) ? `Yes — ${label.slice(3).toLowerCase()}` : `No — ${label.slice(3).toLowerCase()}`; switchPlayer(); }
function startGame() {
  secret = pickSecret(); player = 1; turn.textContent = "Player 1's turn"; answer.textContent = 'Choose a question to start.';
  guessSelect.replaceChildren(...characters.map(character => new Option(character.name, character.name)));
  renderBoard();
}
questions.forEach(([label, test]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => askQuestion(label, test)); questionList.append(button); });
document.querySelector('#new-game').addEventListener('click', startGame);
document.querySelector('#guess-button').addEventListener('click', () => guessDialog.showModal());
document.querySelector('#cancel-guess').addEventListener('click', () => guessDialog.close());
document.querySelector('#guess-form').addEventListener('submit', event => { event.preventDefault(); const correct = guessSelect.value === secret.name; answer.textContent = correct ? `Correct! Player ${player} wins — it was ${secret.name}. Start a new game to play again.` : `Not ${guessSelect.value}. Player ${player}'s turn is over.`; guessDialog.close(); if (!correct) switchPlayer(); });
startGame();
