'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import suspects from '../data/suspects.json';
import trivia from '../data/trivia.json';

const rewardCopy = { clue: 'FREE CLUE · opponent trait revealed', extra: 'EXTRA TURN · keep the wire open', mute: 'MUTE · Jemma loses her next turn' };
const playCue = (type) => {
  if (typeof window === 'undefined') return;
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const tone = (at, frequency, duration, gain = .035) => { const o = context.createOscillator(), g = context.createGain(); o.type = type === 'eliminate' ? 'sine' : 'triangle'; o.frequency.setValueAtTime(frequency, at); if (type === 'eliminate') o.frequency.exponentialRampToValueAtTime(frequency * .73, at + duration); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(.001, at + duration); o.connect(g).connect(context.destination); o.start(at); o.stop(at + duration); };
  const now = context.currentTime;
  type === 'eliminate' ? tone(now, 523.25, .32) : [392, 523.25, 659.25, 783.99].forEach((note, i) => tone(now + i * .09, note, .13, .045));
};
function Portrait({ suspect, large = false }) {
  const cat = suspect.portrait.includes('cat'); const seed = [...suspect.name].reduce((a, c) => a + c.charCodeAt(0), 0); const hair = seed % 3;
  return <div className={`portrait ${cat ? 'cat' : ''} ${large ? 'large' : ''}`} aria-label={`${suspect.name} monochrome police portrait`}>
    <div className="scanlines" /><div className="portrait-noise" />
    {cat ? <><i className="ear left"/><i className="ear right"/><i className="cat-head"/><i className="cat-eye left"/><i className="cat-eye right"/><i className="whisker one"/><i className="whisker two"/></> : <><i className={`hair h${hair}`} /><i className="neck"/><i className="face"/><i className="ear left"/><i className="ear right"/><i className="eye left"/><i className="eye right"/><i className="nose"/><i className="mouth"/>{suspect.trait.includes('glasses') && <i className="glasses"/>}{suspect.trait.includes('mustache') && <i className="mustache"/>}{suspect.trait.includes('beard') && <i className="beard"/>}{/(hat|cap|beret)/.test(suspect.trait) && <i className="hat"/>}</>}
  </div>;
}
export default function Home() {
  const [secret] = useState(() => suspects[5]); const [opponentSecret] = useState(() => suspects[13]); const [eliminated, setEliminated] = useState([]); const [question, setQuestion] = useState(''); const [transcript, setTranscript] = useState([{ from: 'SYSTEM', text: 'Case opened. Keep your answers clean, detective.' }]); const [turns, setTurns] = useState(0); const [triviaCard, setTriviaCard] = useState(null); const [reward, setReward] = useState(null); const [revealed, setRevealed] = useState(''); const [guessing, setGuessing] = useState(false); const [mute, setMute] = useState(false);
  const currentTrivia = useMemo(() => trivia[turns % trivia.length], [turns]);
  const eliminate = (suspect) => { setEliminated((old) => old.includes(suspect.name) ? old.filter((name) => name !== suspect.name) : [...old, suspect.name]); playCue('eliminate'); };
  const ask = (event) => { event.preventDefault(); const clean = question.trim(); if (!clean) return; const next = turns + 1; setTranscript((old) => [...old.slice(-3), { from: 'YOU', text: clean }, { from: 'JEMMA', text: 'INTERCEPTED · answer pending' }]); setQuestion(''); setTurns(next); if (next % 3 === 0) setTriviaCard(trivia[next % trivia.length]); };
  const answerTrivia = (answer) => { if (answer !== triviaCard.answer) return setTranscript((old) => [...old, { from: 'WIRE', text: 'Wrong frequency. The line stays contested.' }]); const types = ['clue', 'extra', 'mute']; const type = types[(turns / 3 - 1) % types.length]; setTriviaCard(null); setReward(type); playCue('win'); if (type === 'clue') setRevealed(opponentSecret.trait); if (type === 'mute') setMute(true); };
  return <main className="desk"><div className="casefile">
    <header className="masthead"><div><p>PRECINCT 13 · CONFIDENTIAL</p><h1>The <em>Black</em> Book</h1><strong>YOU <span>VS.</span> JEMMA</strong></div><div className="turn-light"><i className="lamp"/><small>{mute ? 'JEMMA MUTED' : triviaCard ? 'WIRE LIVE' : 'YOUR TURN'}</small></div></header>
    <section className="hidden-docket"><div className="docket-top">YOUR HIDDEN SUSPECT <b>CLASSIFIED</b></div><Portrait suspect={secret}/><div><h2>{secret.name}</h2><p>{secret.role}</p><small>{secret.alibi}</small></div>{revealed && <mark>CLUE: {revealed}</mark>}</section>
    <section className="suspect-grid" aria-label="Suspect board">{suspects.map((suspect, index) => { const out = eliminated.includes(suspect.name); return <motion.button layout key={suspect.name} className={`suspect ${out ? 'cleared' : ''}`} onClick={() => eliminate(suspect)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: out ? .18 : 1, scale: out ? .86 : 1, y: 0 }} transition={{ delay: index * .015 }}><span className="file-no">{String(index + 1).padStart(2, '0')}</span><Portrait suspect={suspect}/><b>{suspect.name}</b><small>{suspect.role}</small>{out && <i className="cleared-stamp">CLEARED</i>}</motion.button>})}<i className="hand-cursor">☞</i></section>
    <section className="transcript"><div className="log-head"><span>INTERROGATION TRANSCRIPT</span><b>{turns % 3}/3 TURNS TO WIRE</b></div><div className="log">{transcript.map((line, index) => <p key={index}><b>{line.from}</b> {line.text}</p>)}</div><form onSubmit={ask}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a yes or no question…" maxLength="82"/><button>ASK</button></form></section>
    <footer><button className="trivia-button" onClick={() => setTriviaCard(currentTrivia)}>SPOT TRIVIA <span>WIRE INTERCEPT</span></button><button className="guess-button" onClick={() => setGuessing(true)}>MAKE A GUESS</button></footer>
    <p className="desk-note">Tap a docket to cross out the innocent. Three questions trigger a live intercept.</p>
  </div>
  <AnimatePresence>{triviaCard && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="wire-card" initial={{ rotate: -4, scale: .8 }} animate={{ rotate: 0, scale: 1 }}><button className="close" onClick={() => setTriviaCard(null)}>×</button><p>CODED TRANSMISSION · {triviaCard.category.toUpperCase()}</p><h2>WIRE INTERCEPT</h2><div className="cipher">/// SIGNAL LOCKED ///</div><h3>{triviaCard.question}</h3>{triviaCard.options.map((option) => <button key={option} onClick={() => answerTrivia(option)}>{option}</button>)}<small>First clean answer earns a tactical reward.</small></motion.section></motion.div>}</AnimatePresence>
  <AnimatePresence>{reward && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.section className="reward-card" initial={{ y: 40 }} animate={{ y: 0 }}><p>INTERCEPT RESOLVED</p><h2>YOU WON THE WIRE</h2><strong>{rewardCopy[reward]}</strong><button onClick={() => setReward(null)}>BACK TO THE CASE</button></motion.section></motion.div>}</AnimatePresence>
  <AnimatePresence>{guessing && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><section className="guess-card"><p>FINAL ACCUSATION</p><h2>Name Jemma's suspect</h2><div>{suspects.map((suspect) => <button key={suspect.name} onClick={() => { setGuessing(false); setTranscript((old) => [...old, { from: 'SYSTEM', text: suspect.name === opponentSecret.name ? 'CASE CLOSED · culprit named.' : `${suspect.name} is not the culprit. Keep digging.` }]); }}>{suspect.name}</button>)}</div><button className="cancel" onClick={() => setGuessing(false)}>CANCEL</button></section></motion.div>}</AnimatePresence>
  </main>;
}
