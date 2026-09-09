const boards = {
  festival: { name: 'Festival crew', characters: [
    ['Nova','🎤','star earrings · microphone','music'], ['Milo','🛹','striped tee · skateboard','sport'], ['Zuri','📷','round glasses · camera','creative'], ['Theo','🧢','cap · backpack','travel'], ['Pia','🌻','flower clip · tote bag','nature'], ['Remy','🎧','headphones · hoodie','music']
  ]},
  mystery: { name: 'Midnight mystery', characters: [
    ['Ivy','🕵️','magnifying glass · trench coat','detective'], ['Ash','🕯️','candle · scarf','cozy'], ['Cleo','🔮','crystal ball · moon pin','magic'], ['Rowan','🗝️','old key · bow tie','detective'], ['Sage','🦇','bat brooch · cape','magic'], ['Jett','📜','map · explorer hat','travel']
  ]},
  makers: { name: 'Maker mash-up', characters: [
    ['Luna','🎨','paint brush · beret','creative'], ['Ollie','🍳','chef hat · whisk','food'], ['Nia','🪴','watering can · apron','nature'], ['Beau','🧩','puzzle piece · sweater','games'], ['Kiki','🪄','magic wand · stars','magic'], ['Dex','🛠️','tool belt · goggles','maker']
  ]},
  getaway: { name: 'Weekend getaway', characters: [
    ['Skye','🗺️','map · sun hat','travel'], ['Finn','🏄','surfboard · shades','sport'], ['Mara','📚','novel · knit scarf','cozy'], ['Rio','🎸','guitar · denim jacket','music'], ['Asha','🧁','cupcake · bow','food'], ['Kit','🎲','dice · varsity jacket','games']
  ]},
  arcade: { name: 'Arcade all-stars', characters: [
    ['Pixel','👾','arcade joystick · visor','games'], ['Rex','🏆','trophy · tracksuit','sport'], ['Echo','🎹','keyboard · headphones','music'], ['Moss','🌵','cactus pin · overalls','nature'], ['Vivi','🧪','beaker · lab coat','maker'], ['Sol','✨','sparkle cape · moon pin','magic']
  ]},
  studio: { name: 'Studio squad', characters: [
    ['June','🎬','clapperboard · beanie','creative'], ['Ari','🪁','kite · windbreaker','travel'], ['Bex','🥨','pretzel · apron','food'], ['Sam','🧸','teddy · cardigan','cozy'], ['Taz','🧗','rope · helmet','sport'], ['Wren','🦉','owl pin · notebook','nature']
  ]}
};
const trivia = [
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', options: ['Mars', 'Venus', 'Saturn'] },
  { q: 'How many hearts does an octopus have?', a: '3', options: ['1', '2', '3'] },
  { q: 'What is the tallest mammal?', a: 'Giraffe', options: ['Elephant', 'Giraffe', 'Moose'] },
  { q: 'Which instrument has 88 keys?', a: 'Piano', options: ['Piano', 'Violin', 'Trumpet'] }
];
const quickQuestions = ['Wearing glasses?', 'Holding something?', 'A hat or headwear?', 'Music themed?', 'Nature themed?'];
let characters = [], secrets = {}, knockedOut = new Set(), player = 1, pendingQuestion = null, bonuses = { 1: 0, 2: 0 }, triviaUsed = { 1: false, 2: false }, twistUsed = { 1: false, 2: false }, encorePlayer = null, gameOver = false;
const $ = selector => document.querySelector(selector);
const board = $('#board'), chatLog = $('#chat-log'), askForm = $('#ask-form'), questionInput = $('#question-input'), answerControls = $('#answer-controls');
function characterFrom(raw) { const [name, avatar, clues, theme] = raw; return { name, avatar, clues, theme }; }
function opponent() { return player === 1 ? 2 : 1; }
function addMessage(text, type = '') { const message = document.createElement('div'); message.className = `message ${type}`; message.textContent = text; chatLog.append(message); chatLog.scrollTop = chatLog.scrollHeight; }
function renderBoard() {
  board.replaceChildren(...characters.map(character => {
    const card = document.createElement('button'), out = knockedOut.has(character.name); card.type = 'button'; card.className = `card${out ? ' out' : ''}`; card.setAttribute('aria-pressed', String(out));
    card.innerHTML = `<span class="avatar" aria-hidden="true">${character.avatar}</span><span class="name">${character.name}</span><span class="trait">${character.clues}</span>`;
    card.addEventListener('click', () => { if (gameOver || pendingQuestion) return; out ? knockedOut.delete(character.name) : knockedOut.add(character.name); renderBoard(); }); return card;
  }));
  $('#remaining').textContent = `${characters.length - knockedOut.size} in play`;
}
function renderTurn() {
  $('#player-badge').textContent = `P${player}`; $('#turn-label').textContent = pendingQuestion ? `Player ${opponent()} is answering` : `Player ${player} is asking`;
  $('#status-copy').textContent = pendingQuestion ? 'Pass the phone for an honest answer.' : 'One shared board. One mystery character.';
  $('#bonus-count').textContent = `✦ ${bonuses[player]}`; $('#clue-button').disabled = bonuses[player] < 1 || !!pendingQuestion || gameOver;
  questionInput.disabled = !!pendingQuestion || gameOver; askForm.querySelector('button').disabled = !!pendingQuestion || gameOver; $('#bonus-button').disabled = !!pendingQuestion || gameOver || triviaUsed[player]; $('#twist-button').disabled = !!pendingQuestion || gameOver || twistUsed[player]; answerControls.hidden = !pendingQuestion; renderBoard();
}
function sendQuestion(question) { const normalized = question.trim(); if (!normalized || pendingQuestion || gameOver) return; pendingQuestion = normalized; addMessage(`P${player}: ${pendingQuestion}`, 'self'); questionInput.value = ''; renderTurn(); }
function answerQuestion(answer) {
  if (!pendingQuestion) return;
  const asker = player;
  addMessage(`P${opponent()}: ${answer === 'yes' ? 'Yes!' : 'Nope.'}`, 'answer');
  pendingQuestion = null;
  if (encorePlayer === asker) { addMessage(`Encore! P${asker} asks once more.`, 'system'); encorePlayer = null; } else { player = opponent(); triviaUsed[player] = false; twistUsed[player] = false; }
  renderTurn();
}
function startGame(boardName = 'festival') {
  characters = boards[boardName].characters.map(characterFrom); secrets = {}; knockedOut = new Set(); bonuses = { 1: 0, 2: 0 }; triviaUsed = { 1: false, 2: false }; twistUsed = { 1: false, 2: false }; encorePlayer = null; player = 1; pendingQuestion = null; gameOver = false;
  chatLog.replaceChildren(); addMessage(`${boards[boardName].name} board ready. Each player chooses a secret from this shared board.`, 'system'); $('#board-title').textContent = boards[boardName].name; $('#guess-select').replaceChildren(...characters.map(c => new Option(c.name, c.name))); $('#secret-select').replaceChildren(...characters.map(c => new Option(c.name, c.name))); document.querySelectorAll('.board-option').forEach(button => button.classList.toggle('active', button.dataset.board === boardName)); renderTurn(); openSecretDeal();
}
function openSecretDeal() { $('#secret-player').textContent = player; $('#secret-dialog').showModal(); }
function useClue() { if (bonuses[player] < 1 || pendingQuestion || gameOver) return; bonuses[player]--; const clue = secrets[opponent()].clues.split(' · ')[Math.floor(Math.random() * 2)]; addMessage(`Bonus clue for P${player}: The mystery character has ${clue}.`, 'system'); renderTurn(); }
function openTrivia() { if (pendingQuestion || gameOver || triviaUsed[player]) return; triviaUsed[player] = true; const card = trivia[Math.floor(Math.random() * trivia.length)]; $('#trivia-question').textContent = card.q; const options = $('#trivia-options'); options.replaceChildren(...card.options.sort(() => Math.random() - .5).map(option => { const button = document.createElement('button'); button.type = 'button'; button.textContent = option; button.addEventListener('click', () => { $('#trivia-dialog').close(); if (option === card.a) { bonuses[player]++; addMessage(`P${player} won a bonus clue!`, 'system'); } else addMessage('Trivia miss — the other player gets the next turn.', 'system'); if (option !== card.a) { player = opponent(); triviaUsed[player] = false; twistUsed[player] = false; } renderTurn(); }); return button; })); $('#trivia-dialog').showModal(); }
function openTwist() {
  if (pendingQuestion || gameOver || twistUsed[player]) return;
  twistUsed[player] = true;
  const twists = [
    { copy: 'Encore: after your next answer, you keep the mic for one extra question.', apply: () => { encorePlayer = player; } },
    { copy: 'Flash clue: take a free bonus clue for the shared mystery.', apply: () => { bonuses[player]++; } },
    { copy: `Theme reveal: Player ${opponent()}'s secret belongs to the ${secrets[opponent()].theme} crew.`, apply: () => {} }
  ];
  const twist = twists[Math.floor(Math.random() * twists.length)]; twist.apply(); $('#twist-copy').textContent = twist.copy; addMessage(`P${player} drew a twist card.`, 'system'); renderTurn(); $('#twist-dialog').showModal();
}
function makeGuess() { if (!gameOver && !pendingQuestion) { $('#opponent-number').textContent = opponent(); $('#guess-dialog').showModal(); } }
function submitGuess(event) { event.preventDefault(); const chosen = $('#guess-select').value; $('#guess-dialog').close(); if (chosen === secrets[opponent()].name) { gameOver = true; $('#winner-title').textContent = `Player ${player} wins!`; $('#winner-copy').textContent = `Player ${opponent()}'s secret character was ${secrets[opponent()].name}.`; $('#winner-dialog').showModal(); addMessage(`P${player} guessed ${secrets[opponent()].name} and won!`, 'system'); } else { addMessage(`P${player} guessed ${chosen}. Not this time.`, 'system'); player = opponent(); triviaUsed[player] = false; twistUsed[player] = false; } renderTurn(); }
quickQuestions.forEach(question => { const button = document.createElement('button'); button.type = 'button'; button.textContent = question; button.addEventListener('click', () => sendQuestion(question)); $('#quick-questions').append(button); });
askForm.addEventListener('submit', event => { event.preventDefault(); sendQuestion(questionInput.value); }); answerControls.addEventListener('click', event => { if (event.target.dataset.answer) answerQuestion(event.target.dataset.answer); });
$('#new-game').addEventListener('click', () => startGame(document.querySelector('.board-option.active').dataset.board)); document.querySelectorAll('.board-option').forEach(button => button.addEventListener('click', () => startGame(button.dataset.board)));
$('#secret-form').addEventListener('submit', event => { event.preventDefault(); secrets[player] = characters.find(character => character.name === $('#secret-select').value); $('#secret-dialog').close(); if (player === 1) { player = 2; addMessage('Player 2, choose a secret and pass the phone back.', 'system'); renderTurn(); setTimeout(openSecretDeal, 150); } else { player = 1; addMessage('Secrets chosen. Player 1 asks first.', 'system'); renderTurn(); } });
$('#bonus-button').addEventListener('click', openTrivia); $('#clue-button').addEventListener('click', useClue); $('#twist-button').addEventListener('click', openTwist); $('#guess-button').addEventListener('click', makeGuess); $('#cancel-guess').addEventListener('click', () => $('#guess-dialog').close()); $('#cancel-trivia').addEventListener('click', () => $('#trivia-dialog').close()); $('#close-twist').addEventListener('click', () => $('#twist-dialog').close()); $('#guess-form').addEventListener('submit', submitGuess); $('#play-again').addEventListener('click', () => { $('#winner-dialog').close(); startGame(document.querySelector('.board-option.active').dataset.board); });
startGame();
