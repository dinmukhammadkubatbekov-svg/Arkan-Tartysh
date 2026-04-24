// =============================================
// АРКАН ТАРТЫШ v3 — Клиент
// Ритм, ELO, статистика, серии, реванш
// =============================================

const socket = io();

// ===== АВАТАРКИ =====
const AVATARS = [
  { emoji: '🐻', name: 'Медведь',    desc: 'Силач и упрямец',      cat: 'Хищники' },
  { emoji: '🐯', name: 'Тигр',       desc: 'Быстрый и яростный',   cat: 'Хищники' },
  { emoji: '🦁', name: 'Лев',        desc: 'Царь зверей',          cat: 'Хищники' },
  { emoji: '🐺', name: 'Волк',       desc: 'Упорный охотник',      cat: 'Хищники' },
  { emoji: '🐆', name: 'Леопард',    desc: 'Ловкий и точный',      cat: 'Хищники' },
  { emoji: '🦊', name: 'Лиса',       desc: 'Хитрый и шустрый',     cat: 'Хищники' },
  { emoji: '🐻‍❄️', name: 'Белый медведь', desc: 'Ледяная сила',    cat: 'Хищники' },
  { emoji: '🦝', name: 'Енот',       desc: 'Шустрый воришка',      cat: 'Хищники' },
  { emoji: '🐘', name: 'Слон',       desc: 'Непоколебимый гигант', cat: 'Животные' },
  { emoji: '🦏', name: 'Носорог',    desc: 'Броня как сталь',      cat: 'Животные' },
  { emoji: '🦛', name: 'Бегемот',    desc: 'Тяжело, но мощно',    cat: 'Животные' },
  { emoji: '🐂', name: 'Бык',        desc: 'Упорный и сильный',    cat: 'Животные' },
  { emoji: '🦬', name: 'Бизон',      desc: 'Стремительный таран',  cat: 'Животные' },
  { emoji: '🐎', name: 'Конь',       desc: 'Свободный и быстрый',  cat: 'Животные' },
  { emoji: '🦒', name: 'Жираф',      desc: 'Высоко смотрит',       cat: 'Животные' },
  { emoji: '🦓', name: 'Зебра',      desc: 'Полосатый боец',       cat: 'Животные' },
  { emoji: '🦅', name: 'Орёл',       desc: 'Острый глаз и коготь', cat: 'Птицы' },
  { emoji: '🦆', name: 'Утка',       desc: 'Кряк-кряк, и победа!',cat: 'Птицы' },
  { emoji: '🦉', name: 'Сова',       desc: 'Мудрый стратег',       cat: 'Птицы' },
  { emoji: '🦜', name: 'Попугай',    desc: 'Голосистый боец',      cat: 'Птицы' },
  { emoji: '🐧', name: 'Пингвин',    desc: 'Хладнокровный боец',   cat: 'Птицы' },
  { emoji: '🦩', name: 'Фламинго',   desc: 'Розовый ураган',       cat: 'Птицы' },
  { emoji: '🦈', name: 'Акула',      desc: 'Хищник глубин',        cat: 'Морские' },
  { emoji: '🐬', name: 'Дельфин',    desc: 'Умный и быстрый',      cat: 'Морские' },
  { emoji: '🐙', name: 'Осьминог',   desc: 'Восемь рук — все тянут!', cat: 'Морские' },
  { emoji: '🦀', name: 'Краб',       desc: 'Клешни не подведут',   cat: 'Морские' },
  { emoji: '🐲', name: 'Дракон',     desc: 'Огненная мощь!',       cat: 'Особые' },
  { emoji: '🦄', name: 'Единорог',   desc: 'Магическая сила',      cat: 'Особые' },
  { emoji: '🤖', name: 'Робот',      desc: 'Расчётливый и точный', cat: 'Особые' },
  { emoji: '🔥', name: 'Огонь',      desc: 'Неукротимая стихия',   cat: 'Особые' },
];

const CATEGORIES = ['Все', 'Хищники', 'Животные', 'Птицы', 'Морские', 'Особые'];

// ===== СОСТОЯНИЕ =====
let myPlayerNum  = null;
let gameState    = null;
let myAvatar     = AVATARS[0];
let myName       = '';
let selectedCat  = 'Все';

const playerData = {
  player1: { avatar: '🐻', name: 'Игрок 1' },
  player2: { avatar: '🐯', name: 'Игрок 2' },
};

// ===== РИТМ (клиентская сторона) =====
let beatMs       = 666;
let nextBeatTime = 0;
let clockOffset  = 0;
let beatIndex    = 0;
let animFrameId  = null;
let markers      = [];

function serverNow() { return Date.now() + clockOffset; }

// ===== ЛИДЕРБОРД =====
const LB_KEY = 'arkan_tartysh_lb_v3';

function getLB() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}
function saveLB(data) { localStorage.setItem(LB_KEY, JSON.stringify(data)); }

function recordResult(name, avatar, isWin, accuracy, eloChange, newRating) {
  if (!name || name.trim() === '') name = 'Аноним';
  const lb = getLB();
  let entry = lb.find(e => e.name === name);
  if (!entry) {
    entry = { name, avatar, wins: 0, games: 0, totalAcc: 0, rating: newRating || 1000 };
    lb.push(entry);
  }
  entry.avatar   = avatar;
  entry.games   += 1;
  if (isWin) entry.wins += 1;
  entry.totalAcc = Math.round(((entry.totalAcc * (entry.games - 1)) + accuracy) / entry.games);
  if (newRating !== undefined) entry.rating = newRating;
  saveLB(lb);
}

function loadLeaderboard() {
  const lb = getLB();
  lb.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));

  const empty  = document.getElementById('lb-empty');
  const podium = document.getElementById('lb-podium');
  const tbody  = document.getElementById('lb-tbody');
  if (!empty || !podium || !tbody) return;

  if (lb.length === 0) {
    empty.style.display = 'flex';
    podium.innerHTML    = '';
    tbody.innerHTML     = '';
    return;
  }
  empty.style.display = 'none';

  const podiumRanks = [
    { rank: 2, idx: 1 },
    { rank: 1, idx: 0 },
    { rank: 3, idx: 2 },
  ];
  podium.innerHTML = podiumRanks.map(({ rank, idx }) => {
    const p = lb[idx];
    if (!p) return `<div class="lb-podium-item rank-${rank}"><div class="lb-podium-block">&nbsp;</div></div>`;
    const medals = ['', '🥇', '🥈', '🥉'];
    return `
      <div class="lb-podium-item rank-${rank}">
        <div class="lb-podium-avatar">${p.avatar}</div>
        <div class="lb-podium-name">${escHtml(p.name)}</div>
        <div class="lb-podium-wins">${p.rating || 1000} ELO</div>
        <div class="lb-podium-block">${medals[rank]}</div>
      </div>`;
  }).join('');

  tbody.innerHTML = lb.map((p, i) => {
    const pct = p.games ? Math.round(p.wins / p.games * 100) : 0;
    const badgeCls = i < 3 ? `r${i+1}` : '';
    const isMe = p.name === myName;
    return `<tr class="${isMe ? 'me' : ''}">
      <td><span class="lb-rank-badge ${badgeCls}">${i + 1}</span></td>
      <td><div class="lb-player-cell"><span class="lb-av">${p.avatar}</span><span class="lb-pname">${escHtml(p.name)}</span></div></td>
      <td>${p.rating || 1000}</td>
      <td>${p.wins}/${p.games}</td>
      <td class="lb-winrate">${pct}%</td>
      <td>${p.totalAcc || 0}%</td>
    </tr>`;
  }).join('');
}

function clearLeaderboard() {
  if (confirm('Очистить весь лидерборд?')) {
    localStorage.removeItem(LB_KEY);
    loadLeaderboard();
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== ЭКРАНЫ =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ===== АВАТАР-ЭКРАН =====
function renderCats() {
  const el = document.getElementById('avatar-cats');
  if (!el) return;
  el.innerHTML = CATEGORIES.map(c =>
    `<button class="avatar-cat-btn ${c === selectedCat ? 'active' : ''}"
       onclick="selectCat('${c}')">${c}</button>`
  ).join('');
}

function renderGrid() {
  const filtered = selectedCat === 'Все'
    ? AVATARS
    : AVATARS.filter(a => a.cat === selectedCat);
  const el = document.getElementById('avatar-grid');
  if (!el) return;
  el.innerHTML = filtered.map((av) => {
    const realIdx = AVATARS.indexOf(av);
    return `<div class="avatar-cell ${myAvatar === av ? 'selected' : ''}"
               onclick="selectAvatar(${realIdx})"
               title="${av.name}">${av.emoji}</div>`;
  }).join('');
}

function selectCat(cat) {
  selectedCat = cat;
  renderCats();
  renderGrid();
}

function selectAvatar(idx) {
  myAvatar = AVATARS[idx];
  const prev = document.getElementById('avatar-preview');
  const prevName = document.getElementById('avatar-preview-name');
  const prevDesc = document.getElementById('avatar-preview-desc');
  const confIcon = document.getElementById('confirm-icon');
  if (prev) prev.textContent = myAvatar.emoji;
  if (prevName) prevName.textContent = myAvatar.name;
  if (prevDesc) prevDesc.textContent = myAvatar.desc;
  if (confIcon) confIcon.textContent = myAvatar.emoji;
  renderGrid();
}

function confirmAvatar() {
  const nameInput = document.getElementById('player-name-input')?.value.trim();
  myName = nameInput || myAvatar.name;
  showScreen('screen-waiting');
  const wa = document.getElementById('waiting-avatar');
  const wn = document.getElementById('waiting-name-label');
  if (wa) wa.textContent = myAvatar.emoji;
  if (wn) wn.textContent = `${myName} готов к бою!`;
  socket.emit('find_game', { avatar: myAvatar.emoji, name: myName });
}

// ===========================
// РИТМ-ДОРОЖКА
// ===========================

const MARKERS_COUNT = 5;

function initRhythmTrack() {
  const track = document.getElementById('rhythm-track');
  if (!track) return;
  track.querySelectorAll('.rhythm-marker').forEach(m => m.remove());
  markers = [];
}

function scheduleMarkers() {
  const track = document.getElementById('rhythm-track');
  if (!track) return;

  for (let i = 0; i < MARKERS_COUNT; i++) {
    const beatTime = nextBeatTime + i * beatMs;
    if (markers.find(m => m.time === beatTime)) continue;

    const el = document.createElement('div');
    el.className = 'rhythm-marker';
    track.appendChild(el);
    markers.push({ time: beatTime, el });
  }
}

function rhythmLoop() {
  animFrameId = requestAnimationFrame(rhythmLoop);
  const track = document.getElementById('rhythm-track');
  if (!track || !track.offsetWidth) return;

  const now    = serverNow();
  const trackW = track.offsetWidth;
  const hitZoneX  = trackW * 0.18;
  const travelTime = beatMs * 3;

  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const timeLeft = m.time - now;
    const progress = 1 - timeLeft / travelTime;
    const x = hitZoneX + (trackW - hitZoneX) * (1 - progress);
    m.el.style.transform = `translateX(${x}px)`;

    const dist = Math.abs(timeLeft);
    if (dist < 80) {
      m.el.classList.add('in-zone-perfect');
      m.el.classList.remove('in-zone-good');
    } else if (dist < 180) {
      m.el.classList.add('in-zone-good');
      m.el.classList.remove('in-zone-perfect');
    } else {
      m.el.classList.remove('in-zone-perfect', 'in-zone-good');
    }

    if (timeLeft < -beatMs * 0.6) {
      m.el.remove();
      markers.splice(i, 1);
    }
  }

  // Пульс hit-zone
  const nextIn = nextBeatTime - now;
  const beatPhase = ((nextIn % beatMs) + beatMs) % beatMs;
  const pulse = Math.max(0, 1 - beatPhase / (beatMs * 0.3));
  const hz = document.getElementById('hit-zone');
  if (hz) {
    hz.style.boxShadow = `0 0 ${8 + pulse*24}px ${4 + pulse*16}px rgba(244,162,97,${0.2 + pulse*0.6})`;
    hz.style.transform = `scaleY(${1 + pulse*0.15})`;
  }
}

function stopRhythmLoop() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  markers.forEach(m => { try { m.el.remove(); } catch(e){} });
  markers = [];
}

// ===========================
// ИГРОВЫЕ ДЕЙСТВИЯ
// ===========================

function doPull() {
  if (!gameState || !gameState.started || gameState.finished) return;
  socket.emit('pull');
  const btn = document.getElementById('btn-pull');
  if (btn) {
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 80);
  }
}

function requestRematch() {
  socket.emit('request_rematch');
}

// ===========================
// UPDATE UI
// ===========================

function updateRopeUI(ropePosition) {
  const pct = (ropePosition + 100) / 200 * 100;
  const markerEl = document.getElementById('rope-marker');
  if (markerEl) markerEl.style.left = pct + '%';

  document.getElementById('wz-left')?.classList.toggle('glow', ropePosition < -60);
  document.getElementById('wz-right')?.classList.toggle('glow', ropePosition > 60);

  const inner = document.getElementById('marker-inner');
  if (inner) {
    if (ropePosition < -10)     inner.textContent = playerData.player1.avatar;
    else if (ropePosition > 10) inner.textContent = playerData.player2.avatar;
    else                        inner.textContent = '⚡';
  }

  const msg = ropePosition < -20
    ? `${playerData.player1.avatar} ${playerData.player1.name} ведёт!`
    : ropePosition > 20
    ? `${playerData.player2.avatar} ${playerData.player2.name} ведёт!`
    : '⚔️ Равный бой!';
  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = msg;
}

function updateHitsUI(hits) {
  if (!hits || !myPlayerNum) return;
  const myHits  = hits[myPlayerNum];
  const oppKey  = myPlayerNum === 'player1' ? 'player2' : 'player1';
  const oppHits = hits[oppKey];

  if (myHits) {
    const total = myHits.perfect + myHits.good + myHits.miss;
    const acc   = total ? Math.round((myHits.perfect + myHits.good * 0.5) / total * 100) : 0;
    const el = document.getElementById('my-accuracy');
    if (el) el.textContent = acc + '%';
    const streakEl = document.getElementById('my-perfect-streak');
    if (streakEl) streakEl.textContent = myHits.currentPerfectStreak > 1 ? `🔥${myHits.currentPerfectStreak}x` : '';
  }

  if (oppHits) {
    const total = oppHits.perfect + oppHits.good + oppHits.miss;
    const acc   = total ? Math.round((oppHits.perfect + oppHits.good * 0.5) / total * 100) : 0;
    const el = document.getElementById('opp-accuracy');
    if (el) el.textContent = acc + '%';
  }
}

function showHitFeedback(quality, streak) {
  const el = document.getElementById('hit-feedback');
  if (!el) return;
  const texts = {
    perfect: streak > 4 ? `🔥 PERFECT x${streak}!` : '⚡ PERFECT!',
    good:    '✓ GOOD',
    miss:    '✗ MISS',
  };
  const colors = { perfect: '#f4a261', good: '#4cc9f0', miss: '#e63946' };
  el.textContent  = texts[quality];
  el.style.color  = colors[quality];
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = 'feedbackPop 0.6s ease forwards'; });

  if (quality === 'miss') {
    document.getElementById('screen-game')?.classList.add('shake');
    setTimeout(() => document.getElementById('screen-game')?.classList.remove('shake'), 400);
  }
  if (quality === 'perfect' && streak >= 5) {
    showStreakEffect(streak);
  }
}

function showStreakEffect(streak) {
  const el = document.getElementById('streak-effect');
  if (!el) return;
  el.textContent = `🔥 ${streak} PERFECT STREAK!`;
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = 'streakShow 1.5s ease forwards'; });
}

// ===========================
// КЛАВИШИ
// ===========================

document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); doPull(); }
});

// ===========================
// ЗВЁЗДЫ
// ===========================

function createStars() {
  const el = document.getElementById('stars');
  if (!el) return;
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    const size = Math.random() * 2 + 1;
    s.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:rgba(255,255,255,${Math.random()*.5+.1});border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;animation:twinkle ${2+Math.random()*3}s ease-in-out infinite;animation-delay:${Math.random()*3}s;`;
    el.appendChild(s);
  }
  if (!document.getElementById('star-style')) {
    const style = document.createElement('style');
    style.id = 'star-style';
    style.textContent = `@keyframes twinkle{0%,100%{opacity:.2;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}`;
    document.head.appendChild(style);
  }
}

// ===========================
// SOCKET.IO
// ===========================

socket.on('game_found', (data) => {
  myPlayerNum = data.playerNum;
  playerData.player1 = { avatar: data.avatars.player1, name: data.names.player1 };
  playerData.player2 = { avatar: data.avatars.player2, name: data.names.player2 };

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('you-p1',   myPlayerNum === 'player1' ? 'ТЫ' : '');
  setEl('you-p2',   myPlayerNum === 'player2' ? 'ТЫ' : '');
  setEl('av-game-p1', playerData.player1.avatar);
  setEl('av-game-p2', playerData.player2.avatar);
  setEl('gname-p1', playerData.player1.name);
  setEl('gname-p2', playerData.player2.name);
  setEl('cd-av-p1',   playerData.player1.avatar);
  setEl('cd-av-p2',   playerData.player2.avatar);
  setEl('cd-name-p1', playerData.player1.name);
  setEl('cd-name-p2', playerData.player2.name);

  if (data.ratings) {
    const r1 = data.ratings.player1, r2 = data.ratings.player2;
    const rk1 = data.ranks?.player1, rk2 = data.ranks?.player2;
    setEl('elo-p1', `${rk1?.icon||'🥉'} ${r1}`);
    setEl('elo-p2', `${rk2?.icon||'🥉'} ${r2}`);
  }
});

socket.on('countdown', (data) => {
  showScreen('screen-countdown');
  const el = document.getElementById('countdown-num');
  if (el) {
    el.textContent = data.count === 0 ? 'GO!' : data.count;
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = 'pop .4s ease'; });
  }
});

socket.on('game_start', (data) => {
  const now = Date.now();
  // Правильная синхронизация: clockOffset = разница серверного времени и локального
  // (data.serverTime отправляется в момент отправки пакета, поправка на RTT/2)
  clockOffset  = data.serverTime - now;
  beatMs       = data.beatMs;
  nextBeatTime = data.nextBeatTime;
  beatIndex    = 0;

  gameState         = data.gameState || {};
  gameState.started = true;

  showScreen('screen-game');
  initRhythmTrack();
  scheduleMarkers();
  rhythmLoop();
  updateRopeUI(0);
  updateHitsUI(null);

  const fbEl = document.getElementById('hit-feedback');
  if (fbEl) fbEl.textContent = '';
  const skEl = document.getElementById('my-perfect-streak');
  if (skEl) skEl.textContent = '';
});

socket.on('beat', (data) => {
  nextBeatTime = data.nextBeatTime;
  beatIndex    = data.beatIndex;
  scheduleMarkers();
  updateRopeUI(data.ropePosition);
  updateHitsUI(data.hits);

  const bp = document.getElementById('beat-pulse');
  if (bp) {
    bp.style.animation = 'none';
    requestAnimationFrame(() => { bp.style.animation = 'beatPop 0.3s ease'; });
  }
});

socket.on('hit_result', (data) => {
  updateRopeUI(data.ropePosition);
  updateHitsUI(data.hits);

  if (data.playerNum === myPlayerNum) {
    showHitFeedback(data.quality, data.perfectStreak);
  }

  const oppKey = data.playerNum === 'player1' ? 'av-game-p1' : 'av-game-p2';
  const oppEl  = document.getElementById(oppKey);
  if (oppEl) {
    oppEl.style.animation = 'none';
    const animName = { perfect: 'avatarPerfect', good: 'avatarGood', miss: 'avatarMiss' }[data.quality];
    requestAnimationFrame(() => { oppEl.style.animation = `${animName} 0.4s ease`; });
  }
});

// ===========================
// КОНФЕТТИ
// ===========================
let confettiAnimId = null;
const CONFETTI_COLORS = ['#ffd700','#f4a261','#4cc9f0','#e63946','#ffffff','#a8dadc','#ff6b6b','#90e0ef'];

function launchConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 120 }, () => ({
    x:  Math.random() * canvas.width,
    y:  Math.random() * canvas.height - canvas.height,
    w:  6 + Math.random() * 8,
    h:  10 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.18,
    vx: (Math.random() - 0.5) * 3,
    vy: 2.5 + Math.random() * 4,
    alpha: 1,
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.rot += p.rotSpeed;
      if (p.y > canvas.height * 0.7) p.alpha -= 0.018;
      if (p.alpha <= 0) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) confettiAnimId = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  draw();
}

function showFinishOverlay(iWon, winnerName, winnerAvatar, loserAvatar, eloChange, newRating) {
  const overlay = document.getElementById('finish-overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  // небольшая пауза — дать браузеру отрисовать overlay перед анимацией
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('visible')));

  const el = (id) => document.getElementById(id);
  el('fin-winner-av').textContent = winnerAvatar;
  el('fin-loser-av').textContent  = loserAvatar;
  el('fin-title').textContent     = iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
  el('fin-title').className       = 'finish-title' + (iWon ? '' : ' lose');
  el('fin-name').textContent      = winnerName + ' победил!';

  const eloEl = el('fin-elo');
  if (eloEl) {
    eloEl.textContent = `ELO: ${eloChange >= 0 ? '+' : ''}${eloChange} → ${newRating || 1000}`;
    eloEl.className   = 'finish-elo' + (iWon ? '' : ' negative');
  }

  el('fin-rematch-status').textContent = '';
  const btnR = el('fin-btn-rematch');
  if (btnR) { btnR.querySelector('.btn-text').textContent = 'Реванш!'; btnR.disabled = false; }

  if (iWon) {
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) launchConfetti(canvas);
  }
}

function hideFinishOverlay() {
  const overlay = document.getElementById('finish-overlay');
  if (!overlay) return;
  if (confettiAnimId) { cancelAnimationFrame(confettiAnimId); confettiAnimId = null; }
  overlay.classList.remove('visible');
  setTimeout(() => overlay.classList.add('hidden'), 400);
}

socket.on('game_over', (data) => {
  stopRhythmLoop();

  const iWon      = data.winner === myPlayerNum;
  const myAcc     = data.accuracy?.[myPlayerNum] ?? 0;
  const oppKey    = myPlayerNum === 'player1' ? 'player2' : 'player1';
  const eloChange = iWon ? (data.ratingChanges?.winner ?? 0) : (data.ratingChanges?.loser ?? 0);
  const newRating = data.newRatings?.[myPlayerNum];
  const newRank   = data.newRanks?.[myPlayerNum];

  recordResult(myName, myAvatar.emoji, iWon, myAcc, eloChange, newRating);

  // Определяем аватары победителя и проигравшего для оверлея
  const winnerKey    = data.winner;
  const loserKey     = winnerKey === 'player1' ? 'player2' : 'player1';
  const winnerAvatar = playerData[winnerKey].avatar;
  const loserAvatar  = playerData[loserKey].avatar;
  const winnerName   = playerData[winnerKey].name;

  // Показываем финиш-оверлей поверх игрового экрана
  showFinishOverlay(iWon, winnerName, winnerAvatar, loserAvatar, eloChange, newRating);

  // Заполняем экран game_over в фоне (для лидерборда и реванша)
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('go-avatar', iWon ? myAvatar.emoji : '😔');
  const badge = document.getElementById('go-badge');
  if (badge) { badge.textContent = iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'; badge.className = 'go-badge ' + (iWon ? 'win' : 'lose'); }
  setEl('winner-text', iWon ? '🎉 Ты победил!' : 'Ты проиграл');
  setEl('go-accuracy', `Точность: ${myAcc}%`);
  const eloEl = document.getElementById('go-elo');
  if (eloEl) { eloEl.textContent = `ELO: ${eloChange >= 0 ? '+' : ''}${eloChange} (${newRating || 1000})`; eloEl.className = 'go-elo ' + (iWon ? 'positive' : 'negative'); }
  if (newRank) setEl('go-rank', `${newRank.icon} ${newRank.name}`);

  const ws = data.winnerStats;
  const statsEl = document.getElementById('go-win-stats');
  if (statsEl && iWon && ws) {
    statsEl.innerHTML = `
      <div class="go-stat">🏆 Побед подряд: <b>${ws.currentWinStreak}</b></div>
      <div class="go-stat">⚡ Лучший Perfect Streak: <b>${ws.bestPerfectStreak}x</b></div>
      <div class="go-stat">📊 Средняя точность: <b>${ws.totalAccuracy}%</b></div>`;
  } else if (statsEl) { statsEl.innerHTML = ''; }

  const myHits  = data.hits?.[myPlayerNum]  || { perfect:0, good:0, miss:0 };
  const oppHits = data.hits?.[oppKey] || { perfect:0, good:0, miss:0 };
  const oppAcc  = data.accuracy?.[oppKey] ?? 0;
  const scoreEl = document.getElementById('go-score');
  if (scoreEl) {
    scoreEl.innerHTML = `
      <div class="go-score-row">
        <span>${myAvatar.emoji} <b>${escHtml(myName)}</b></span>
        <span class="go-perfect">${myHits.perfect}✦</span>
        <span class="go-good">${myHits.good}●</span>
        <span class="go-miss">${myHits.miss}✗</span>
        <span>${myAcc}%</span>
      </div>
      <div class="go-score-row opp">
        <span>${playerData[oppKey].avatar} <b>${escHtml(playerData[oppKey].name)}</b></span>
        <span class="go-perfect">${oppHits.perfect}✦</span>
        <span class="go-good">${oppHits.good}●</span>
        <span class="go-miss">${oppHits.miss}✗</span>
        <span>${oppAcc}%</span>
      </div>`;
  }

  const rsEl = document.getElementById('rematch-status');
  if (rsEl) rsEl.textContent = '';
  const btnR = document.getElementById('btn-rematch');
  if (btnR) { btnR.textContent = '⚡ Реванш!'; btnR.disabled = false; }

  // Переключаем экран через 2.5с — дать насладиться анимацией
  setTimeout(() => {
    hideFinishOverlay();
    showScreen('screen-gameover');
  }, 2500);
});

socket.on('rematch_status', (status) => {
  const myReady  = status[myPlayerNum];
  const oppKey   = myPlayerNum === 'player1' ? 'player2' : 'player1';
  const oppReady = status[oppKey];

  // обновляем кнопки и в основном экране, и в оверлее
  [['btn-rematch','rematch-status'], ['fin-btn-rematch','fin-rematch-status']].forEach(([btnId, statusId]) => {
    const btn = document.getElementById(btnId);
    const statusEl = document.getElementById(statusId);
    if (myReady && btn) {
      const textEl = btn.querySelector('.btn-text') || btn;
      if (textEl.classList.contains('btn-text')) textEl.textContent = '✅ Ждём...';
      else btn.textContent = '✅ Ждём соперника...';
      btn.disabled = true;
    }
    if (statusEl) statusEl.textContent = oppReady ? '⚡ Соперник хочет реванш!' : '';
  });
});

socket.on('rematch_starting', () => {
  hideFinishOverlay();
  ['rematch-status','fin-rematch-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '🚀 Реванш начинается!';
  });
});

socket.on('opponent_disconnected', () => {
  stopRhythmLoop();
  hideFinishOverlay();
  showScreen('screen-disconnect');
});

// ===========================
// ИНИЦИАЛИЗАЦИЯ
// ===========================
createStars();
initAvatarPage();

function initAvatarPage() {
  selectAvatar(0);
  renderCats();
  renderGrid();
}
