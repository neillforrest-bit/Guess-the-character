const decks = {
  classic: { name: 'Classic', characters: [
    ['Alex','🧑🏻','#ffc2b4','dark',false,false,false], ['Bailey','👩🏽','#f6c0d0','dark',true,false,false], ['Casey','🧑🏼','#f7df85','light',false,true,false], ['Drew','👨🏿','#b9e3cb','dark',false,false,true],
    ['Emery','👩🏻','#bedaff','light',false,false,false], ['Finley','🧔🏽','#ecc2ff','dark',true,true,true], ['Gray','👨🏼','#ffd2a6','light',false,false,true], ['Harper','👩🏿','#ffb9b2','dark',true,true,false],
    ['Jamie','🧑🏾','#d0f0b4','dark',false,false,false], ['Kai','👨🏻','#c8d5ff','dark',true,false,true], ['Logan','👩🏼','#f6dea0','light',false,true,false], ['Morgan','🧑🏿','#e5c6e9','dark',true,false,false]
  ]},
  party: { name: 'Party', characters: [
    ['Ace','😎','#ffd0b5','dark',true,false,false], ['Blair','🤠','#fde4a5','light',false,true,false], ['Coco','🥳','#cce5ff','dark',false,true,false], ['Dom','🕺','#d5f2c2','dark',false,false,true],
    ['Ellis','👑','#f8d4f0','light',false,true,false], ['Fox','🤓','#d8d1ff','dark',true,false,false], ['Goldie','👩‍🎤','#ffc1ba','light',false,false,false], ['Hayden','🧔','#bfe8df','dark',true,false,true],
    ['Indy','👨‍🍳','#f6dea0','dark',false,true,true], ['Jules','🪩','#d8f1ff','light',false,false,false], ['Kit','🎩','#e1cdf9','dark',true,true,false], ['Lux','👩‍🚀','#c7edce','light',false,false,false]
  ]},
  date: { name: 'Date night', characters: [
    ['Ari','🌹','#ffc9bd','dark',false,false,false], ['Bea','🎨','#e5d2ff','light',true,false,false], ['Cam','🍝','#ffdcac','dark',false,false,true], ['Dani','🎸','#c9e8ff','dark',false,true,false],
    ['Ezra','📚','#d8f0c7','light',true,false,false], ['Faye','🧁','#ffd1e4','dark',false,true,false], ['Gus','🎬','#e7daaf','dark',false,false,true], ['Hana','🌙','#cfd2ff','light',false,false,false],
    ['Ira','☕','#f0cfbc','dark',true,false,true], ['Juno','🪴','#c8eddb','dark',false,false,false], ['Kris','🎲','#f7c1ce','light',true,true,false], ['Lane','🛼','#d8d8f7','dark',false,false,false]
  ]}
};
const trivia = [
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', options: ['Mars', 'Venus', 'Saturn'] },
  { q: 'How many hearts does an octopus have?', a: '3', options: ['1', '2', '3'] },
  { q: 'What is the tallest mammal?', a: 'Giraffe', options: ['Elephant', 'Giraffe', 'Moose'] },
  { q: 'Which instrument has 88 keys?', a: 'Piano', options: ['Piano', 'Violin', 'Trumpet'] }
];
const quickQuestions = ['Glasses?', 'A hat?', 'Dark hair?', 'Light hair?', 'Facial hair?'];
let characters = [], secrets = {}, knockedOut = { 1: new Set(), 2: new Set() }, player = 1, pendingQuestion = null, bonuses = { 1: 0, 2: 0 }, triviaUsed = { 1: false, 2: false }, gameOver = false;
const $ = selector => document.querySelector(selector);
const board = $('#board'), chatLog = $('#chat-log'), askForm = $('#ask-form'), questionInput = $('#question-input'), answerControls = $('#answer-controls');

function characterFrom(raw) { const [name, avatar, color, hair, glasses, hat, facialHair] = raw; return { name, avatar, color, hair, glasses, hat, facialHair }; }
function opponent() { return player === 1 ? 2 : 1; }
function addMessage(text, type = '') { const message = document.createElement('div'); message.className = `message ${type}`; message.textContent = text; chatLog.append(message); chatLog.scrollTop = chatLog.scrollHeight; }
function renderBoard() {
  board.replaceChildren(...characters.map(character => {
    const card = document.createElement('button'); card.type = 'button'; const out = knockedOut[player].has(character.name);
    card.className = `card${out ? ' out' : ''}`; card.style.setProperty('--card-color', character.color); card.setAttribute('aria-pressed', String(out));
    card.innerHTML = `<span class="avatar" aria-hidden="true">${character.avatar}</span><span class="name">${character.name}</span>`;
    card.addEventListener('click', () => { if (gameOver || pendingQuestion) return; out ? knockedOut[player].delete(character.name) : knockedOut[player].add(character.name); renderBoard(); }); return card;
  }));
  $('#remaining').textContent = `${characters.length - knockedOut[player].size} in play`;
}
function renderTurn() {
  $('#player-badge').textContent = `P${player}`; $('#turn-label').textContent = pendingQuestion ? `Player ${opponent()} is answering` : `Player ${player} is asking`;
  $('#status-copy').textContent = pendingQuestion ? 'Pass the phone for an honest answer.' : `Ask Player ${opponent()} a yes-or-no question.`;
  $('#bonus-count').textContent = `✦ ${bonuses[player]}`; $('#clue-button').disabled = bonuses[player] < 1 || !!pendingQuestion || gameOver;
  questionInput.disabled = !!pendingQuestion || gameOver; askForm.querySelector('button').disabled = !!pendingQuestion || gameOver;
  $('#bonus-button').disabled = !!pendingQuestion || gameOver || triviaUsed[player];
  answerControls.hidden = !pendingQuestion; renderBoard();
}
function sendQuestion(question) {
  const normalized = question.trim();
  if (!normalized || pendingQuestion || gameOver) return; pendingQuestion = normalized; addMessage(`P${player}: ${pendingQuestion}`, 'self'); questionInput.value = ''; renderTurn();
}
function answerQuestion(answer) {
  if (!pendingQuestion) return; addMessage(`P${opponent()}: ${answer === 'yes' ? 'Yes!' : 'Nope.'}`, 'answer'); pendingQuestion = null; player = opponent(); triviaUsed[player] = false; renderTurn();
}
function startGame(boardName = 'classic') {
  characters = decks[boardName].characters.map(characterFrom); secrets = { 1: characters[Math.floor(Math.random() * characters.length)], 2: characters[Math.floor(Math.random() * characters.length)] };
  knockedOut = { 1: new Set(), 2: new Set() }; bonuses = { 1: 0, 2: 0 }; triviaUsed = { 1: false, 2: false }; player = 1; pendingQuestion = null; gameOver = false; chatLog.replaceChildren(); addMessage(`${decks[boardName].name} board ready. Player 1, begin.`, 'system');
  $('#guess-select').replaceChildren(...characters.map(c => new Option(c.name, c.name))); document.querySelectorAll('.board-option').forEach(button => button.classList.toggle('active', button.dataset.board === boardName)); renderTurn();
}
function useClue() {
  if (bonuses[player] < 1 || pendingQuestion || gameOver) return; bonuses[player]--; const secret = secrets[opponent()]; const clue = [`They ${secret.glasses ? 'wear' : 'do not wear'} glasses.`, `They ${secret.hat ? 'wear' : 'do not wear'} a hat.`, `Their hair is ${secret.hair}.`, `They ${secret.facialHair ? 'have' : 'do not have'} facial hair.`][Math.floor(Math.random() * 4)]; addMessage(`Bonus clue for P${player}: ${clue}`, 'system'); renderTurn();
}
function openTrivia() { if (pendingQuestion || gameOver || triviaUsed[player]) return; triviaUsed[player] = true; const card = trivia[Math.floor(Math.random() * trivia.length)]; $('#trivia-question').textContent = card.q; const options = $('#trivia-options'); options.replaceChildren(...card.options.sort(() => Math.random() - .5).map(option => { const button = document.createElement('button'); button.type = 'button'; button.textContent = option; button.addEventListener('click', () => { $('#trivia-dialog').close(); if (option === card.a) { bonuses[player]++; addMessage(`P${player} won a bonus clue!`, 'system'); } else addMessage(`Trivia miss — no bonus this time.`, 'system'); renderTurn(); }); return button; })); $('#trivia-dialog').showModal(); }
function makeGuess() { if (!gameOver && !pendingQuestion) { $('#opponent-number').textContent = opponent(); $('#guess-dialog').showModal(); } }
function submitGuess(event) { event.preventDefault(); const chosen = $('#guess-select').value, target = secrets[opponent()]; $('#guess-dialog').close(); if (chosen === target.name) { gameOver = true; $('#winner-title').textContent = `Player ${player} wins!`; $('#winner-copy').textContent = `The mystery character was ${target.name}.`; $('#winner-dialog').showModal(); addMessage(`P${player} guessed ${target.name} and won!`, 'system'); } else { addMessage(`P${player} guessed ${chosen}. Not this time.`, 'system'); player = opponent(); triviaUsed[player] = false; } renderTurn(); }

quickQuestions.forEach(question => { const button = document.createElement('button'); button.type = 'button'; button.textContent = question; button.addEventListener('click', () => sendQuestion(question)); $('#quick-questions').append(button); });
askForm.addEventListener('submit', event => { event.preventDefault(); sendQuestion(questionInput.value); });
answerControls.addEventListener('click', event => { const answer = event.target.dataset.answer; if (answer) answerQuestion(answer); });
$('#new-game').addEventListener('click', () => startGame(document.querySelector('.board-option.active').dataset.board)); document.querySelectorAll('.board-option').forEach(button => button.addEventListener('click', () => startGame(button.dataset.board)));
$('#bonus-button').addEventListener('click', openTrivia); $('#clue-button').addEventListener('click', useClue); $('#guess-button').addEventListener('click', makeGuess); $('#cancel-guess').addEventListener('click', () => $('#guess-dialog').close()); $('#cancel-trivia').addEventListener('click', () => $('#trivia-dialog').close()); $('#guess-form').addEventListener('submit', submitGuess); $('#play-again').addEventListener('click', () => { $('#winner-dialog').close(); startGame(document.querySelector('.board-option.active').dataset.board); });
startGame();
