const characters=[
  {name:'Marley',emoji:'🐱',description:'the munchkin kitten'},
  {name:'Dilly',emoji:'🐱',description:'the munchkin kitten'},
  {name:'Bruno',emoji:'🐶',description:'the grumpy bulldog'},
  {name:'Pico',emoji:'🦜',description:'the sneaky parrot'},
];
const $=selector=>document.querySelector(selector);
const deviceId=localStorage.guessWhoDeviceId||(localStorage.guessWhoDeviceId=crypto.randomUUID());
const gameId=new URLSearchParams(location.search).get('game');
let state=null,player=null,lockingSecret=false,secretDialogShown=false,requesting=false;

function notice(title,copy){$('#notice-title').textContent=title;$('#notice-copy').textContent=copy;$('#notice-dialog').showModal()}
function retryable(error){return error.status===409}
async function api(action,payload={}){
  const response=await fetch('/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,gameId:state?.id||gameId,deviceId,payload})});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error);error.status=response.status;throw error}
  state=data.game;player=data.player;render();return data;
}
async function action(name,payload={}){
  if(requesting)return;
  requesting=true;
  try{for(let attempt=0;attempt<3;attempt++){try{return await api(name,payload)}catch(error){if(!retryable(error)||attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,300))}}}catch(error){notice('Game update failed',error.message)}finally{requesting=false}
}
function isMyTurn(){return state?.startedAt&&state.currentPlayer===player&&!state.pendingQuestion&&!state.winner}
function render(){
  const joined=state?.joinedCount||0,ready=Boolean(state?.startedAt),mine=Boolean(player&&state?.secrets?.[player]);
  $('#status-title').textContent=!state?'Create a game to begin':state.winner?state.winner===player?'You win!':'Your opponent wins.':!joined||joined<2?'Waiting for Player 2':!ready?'Choose and lock your character':'Game in progress';
  $('#status-copy').textContent=!state?'Invite one friend on their phone.':!joined||joined<2?'The lobby opens character selection at 2/2 phones.':!ready?mine?'Waiting for opponent...':'Choose your secret character.':isMyTurn()?'Your turn: ask or eliminate.':'Watch for your turn.';
  $('#invite-copy').textContent=state?`${joined}/2 phones joined`:'Start a private 1v1 game.';
  $('#share-button').textContent=state?'Share invite':'Create & share';
  $('#phone-one').textContent=joined>=1?'Player 1 joined':'Waiting for Player 1';
  $('#phone-two').textContent=joined>=2?'Player 2 joined':'Waiting for Player 2';
  $('#lobby').hidden=Boolean(ready);$('#game').hidden=!ready;
  if(!state||!ready)return;
  $('#turn-label').textContent=state.winner?state.winner===player?'You guessed it!':'They guessed it.':isMyTurn()?'Your turn':'Opponent’s turn';
  const eliminated=new Set(state.eliminated[player]||[]);
  $('#board').replaceChildren(...characters.map(character=>{const card=document.createElement('button');card.type='button';card.className=`card${eliminated.has(character.name)?' eliminated':''}`;card.disabled=!isMyTurn();card.innerHTML=`<span>${character.emoji}</span><strong>${character.name}</strong><small>${character.description}</small>`;card.onclick=()=>action('eliminate',{name:character.name});return card}));
  $('#messages').replaceChildren(...(state.messages||[]).map(entry=>{const line=document.createElement('p');line.textContent=entry.text;return line}));
  const answerForMe=state.pendingQuestion?.asker&&state.pendingQuestion.asker!==player;
  $('#answer-controls').hidden=!answerForMe;$('#ask-form').hidden=Boolean(answerForMe);$('#question-input').disabled=!isMyTurn();$('#ask-form button').disabled=!isMyTurn();$('#guess-button').disabled=!isMyTurn();
}
async function createOrShare(){
  try{if(!state)await api('create');const url=new URL(location);url.searchParams.set('game',state.id);if(navigator.share)await navigator.share({title:'Guess Who? 1v1',text:'Join my two-phone game!',url:url.href});else{await navigator.clipboard.writeText(url.href);notice('Invite copied','Send this link to exactly one friend.')}}catch(error){if(error.name!=='AbortError')notice('Could not share',error.message)}
}
$('#share-button').onclick=createOrShare;
$('#secret-form').onsubmit=async event=>{event.preventDefault();if(lockingSecret||state?.secrets?.[player])return;lockingSecret=true;const button=$('#lock-secret');button.disabled=true;button.textContent='Waiting for opponent...';try{const result=await action('secret',{secret:$('#secret-select').value});if(result)$('#secret-dialog').close()}finally{lockingSecret=false;if(!state?.secrets?.[player]){button.disabled=false;button.textContent='Lock it in'}}};
$('#ask-form').onsubmit=event=>{event.preventDefault();const question=$('#question-input').value.trim();if(question){$('#question-input').value='';action('ask',{question})}};
$('#answer-controls').onclick=event=>{if(event.target.dataset.answer)action('answer',{answer:event.target.dataset.answer})};
$('#guess-button').onclick=()=>{if(!isMyTurn())return;$('#guess-select').replaceChildren(...characters.map(character=>new Option(character.name,character.name)));$('#guess-dialog').showModal()};
$('#guess-form').onsubmit=event=>{event.preventDefault();$('#guess-dialog').close();action('guess',{name:$('#guess-select').value})};
$('#cancel-guess').onclick=()=>$('#guess-dialog').close();
(async()=>{if(!gameId){render();return}try{await action('join')}catch{}})();
setInterval(()=>{if(state)api('state').catch(()=>{})},800);
setInterval(()=>{if(!state?.startedAt&&player&&state?.joinedCount===2&&!state.secrets?.[player]&&!secretDialogShown){secretDialogShown=true;$('#secret-select').replaceChildren(...characters.map(character=>new Option(character.name,character.name)));$('#secret-dialog').showModal()}},200);
