// ====================================
// АРКАН ТАРТЫШ v3 — Сервер
// Система ритма, ELO, статистика, серии, быстрый реванш
// Запуск: node server.js
// ====================================

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ====================================
// ХРАНИЛИЩА
// ====================================

let waitingPlayer = null;       // Ожидающий игрок
const rooms     = {};           // Активные комнаты
const players   = {};           // Данные игроков по socket.id: { rating, stats, ... }

// ====================================
// КОНСТАНТЫ РИТМА
// ====================================

const BPM           = 90;                        // Удары в минуту
const BEAT_MS       = (60 / BPM) * 1000;        // ≈666ms
const PERFECT_WINDOW = 80;                        // ±80ms — Perfect
const GOOD_WINDOW    = 180;                        // ±180ms — Good
const MISS_PENALTY   = 5;                          // Штраф за Miss/спам (единиц каната)
const PERFECT_FORCE  = 14.0;                       // Рывок Perfect
const GOOD_FORCE     = 7.0;                        // Рывок Good

// ====================================
// РАНГИ (ELO)
// ====================================

const RANKS = [
  { name: 'Legend', min: 1800, icon: '👑' },
  { name: 'Gold',   min: 1400, icon: '🥇' },
  { name: 'Silver', min: 1100, icon: '🥈' },
  { name: 'Bronze', min:    0, icon: '🥉' },
];

function getRank(rating) {
  return RANKS.find(r => rating >= r.min) || RANKS[RANKS.length - 1];
}

// Простая ELO формула
function calcElo(winnerRating, loserRating) {
  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser  = 1 - expectedWinner;
  return {
    winnerDelta: Math.round(K * (1 - expectedWinner)),
    loserDelta:  Math.round(K * (0 - expectedLoser)),
  };
}

// ====================================
// ДАННЫЕ ИГРОКА
// ====================================

function createPlayerData(name, avatar) {
  return {
    name,
    avatar,
    rating:      1000,
    games:       0,
    wins:        0,
    totalAccuracy:     0,
    bestPerfectStreak: 0,
    winStreak:         0,
    currentWinStreak:  0,
  };
}

function getOrCreatePlayer(socketId, name, avatar) {
  if (!players[socketId]) {
    players[socketId] = createPlayerData(name, avatar);
  } else {
    players[socketId].name   = name;
    players[socketId].avatar = avatar;
  }
  return players[socketId];
}

// ====================================
// СОСТОЯНИЕ ИГРЫ
// ====================================

function createGameState(bpm) {
  return {
    ropePosition: 0,
    started:  false,
    finished: false,
    winner:   null,
    // Ритм
    bpm,
    beatMs:   (60 / bpm) * 1000,
    nextBeatTime: null,  // Серверное время следующего удара (ms)
    // Точность / серии
    hits: {
      player1: { perfect: 0, good: 0, miss: 0, currentPerfectStreak: 0 },
      player2: { perfect: 0, good: 0, miss: 0, currentPerfectStreak: 0 },
    },
    // Визуальный пульс (для клиента)
    beatIndex: 0,
  };
}

// ====================================
// MATCHMAKING И ПОДКЛЮЧЕНИЯ
// ====================================

io.on('connection', (socket) => {
  console.log(`✅ Подключился: ${socket.id}`);

  // Игрок ищет матч
  socket.on('find_game', (data) => {
    const avatar = data?.avatar || '❓';
    const name   = (data?.name || 'Аноним').slice(0, 16);
    const pd     = getOrCreatePlayer(socket.id, name, avatar);

    // Если этот сокет уже ждёт — не добавляем повторно
    if (waitingPlayer?.socket.id === socket.id) return;

    if (!waitingPlayer) {
      waitingPlayer = { socket, avatar, name };
      socket.emit('waiting');
      console.log(`⏳ ${name} (рейтинг: ${pd.rating}) ждёт соперника`);
    } else {
      const roomId = `room_${Date.now()}`;
      const p1     = waitingPlayer;
      const p2     = { socket, avatar, name };
      waitingPlayer = null;

      p1.socket.join(roomId);
      p2.socket.join(roomId);

      const pd1 = getOrCreatePlayer(p1.socket.id, p1.name, p1.avatar);
      const pd2 = getOrCreatePlayer(socket.id, p2.name, p2.avatar);

      rooms[roomId] = {
        players: [p1.socket.id, socket.id],
        sockets: { player1: p1.socket, player2: p2.socket },
        names:   { player1: p1.name,   player2: p2.name   },
        avatars: { player1: p1.avatar, player2: p2.avatar },
        gameState:      createGameState(BPM),
        countdownTimer: null,
        beatInterval:   null,
        rematch:        { player1: false, player2: false },
      };

      p1.socket.roomId    = roomId;
      p2.socket.roomId    = roomId;
      p1.socket.playerNum = 'player1';
      p2.socket.playerNum = 'player2';

      console.log(`🎮 ${roomId} | ${p1.name} (${pd1.rating}) vs ${p2.name} (${pd2.rating})`);

      const sharedInfo = {
        avatars: rooms[roomId].avatars,
        names:   rooms[roomId].names,
        ratings: { player1: pd1.rating, player2: pd2.rating },
        ranks:   { player1: getRank(pd1.rating), player2: getRank(pd2.rating) },
      };
      p1.socket.emit('game_found', { playerNum: 'player1', ...sharedInfo });
      p2.socket.emit('game_found', { playerNum: 'player2', ...sharedInfo });

      startCountdown(roomId);
    }
  });

  // ====================================
  // СОБЫТИЕ НАЖАТИЯ (Rhythm Pull)
  // ====================================
  socket.on('pull', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameState.started || room.gameState.finished) return;

    const gs   = room.gameState;
    const pNum = socket.playerNum;
    const now  = Date.now();

    // Вычисляем отклонение от ближайшего удара
    const nextBeat = gs.nextBeatTime;
    const prevBeat = nextBeat - gs.beatMs;

    const distToNext = Math.abs(now - nextBeat);
    const distToPrev = Math.abs(now - prevBeat);
    const diff = Math.min(distToNext, distToPrev);

    let quality;
    if (diff <= PERFECT_WINDOW) {
      quality = 'perfect';
    } else if (diff <= GOOD_WINDOW) {
      quality = 'good';
    } else {
      quality = 'miss';
    }

    const hits = gs.hits[pNum];

    if (quality === 'perfect') {
      hits.perfect++;
      hits.currentPerfectStreak++;
      const force = pNum === 'player1' ? -PERFECT_FORCE : PERFECT_FORCE;
      gs.ropePosition += force;

    } else if (quality === 'good') {
      hits.good++;
      hits.currentPerfectStreak = 0;
      const force = pNum === 'player1' ? -GOOD_FORCE : GOOD_FORCE;
      gs.ropePosition += force;

    } else {
      // Miss — штраф (канат уходит назад)
      hits.miss++;
      hits.currentPerfectStreak = 0;
      const penalty = pNum === 'player1' ? MISS_PENALTY : -MISS_PENALTY;
      gs.ropePosition += penalty;
    }

    // Проверяем конец игры ДО зажима — иначе Math.max/min не даёт достичь ±100
    const emitHit = () => io.to(socket.roomId).emit('hit_result', {
      playerNum: pNum,
      quality,
      ropePosition: gs.ropePosition,
      hits: gs.hits,
      perfectStreak: hits.currentPerfectStreak,
    });

    if (gs.ropePosition <= -100) {
      gs.ropePosition = -100;
      emitHit();
      return endGame(socket.roomId, 'player1');
    } else if (gs.ropePosition >= 100) {
      gs.ropePosition = 100;
      emitHit();
      return endGame(socket.roomId, 'player2');
    }

    gs.ropePosition = Math.max(-100, Math.min(100, gs.ropePosition));
    emitHit();
  });

  // ====================================
  // РЕВАНШ
  // ====================================
  socket.on('request_rematch', () => {
    const room = rooms[socket.roomId];
    if (!room || !room.gameState.finished) return;

    const pNum = socket.playerNum;
    room.rematch[pNum] = true;

    // Сообщить сопернику
    io.to(socket.roomId).emit('rematch_status', room.rematch);

    // Если оба согласны — сразу новый матч
    if (room.rematch.player1 && room.rematch.player2) {
      clearTimers(socket.roomId);
      room.gameState = createGameState(BPM);
      room.rematch   = { player1: false, player2: false };
      io.to(socket.roomId).emit('rematch_starting');
      startCountdown(socket.roomId);
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log(`❌ Отключился: ${socket.id}`);
    if (waitingPlayer?.socket.id === socket.id) waitingPlayer = null;
    if (socket.roomId && rooms[socket.roomId]) {
      clearTimers(socket.roomId);
      io.to(socket.roomId).emit('opponent_disconnected');
      delete rooms[socket.roomId];
    }
    // Не удаляем данные игрока — рейтинг сохраняется в сессии
  });

  // Запрос данных игрока (статистика)
  socket.on('get_my_stats', () => {
    const pd = players[socket.id];
    if (pd) socket.emit('my_stats', pd);
  });
});

// ====================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ====================================

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.gameState.countdown = 3;
  io.to(roomId).emit('countdown', { count: 3 });

  let count = 3;
  room.countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(room.countdownTimer);
      io.to(roomId).emit('countdown', { count: 0 }); // отправляем "GO"
      startRhythm(roomId);
    } else {
      io.to(roomId).emit('countdown', { count });
    }
  }, 1000);
}

function startRhythm(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.gameState.started = true;
  // Устанавливаем первый бит чуть вперёд, чтобы клиенты успели подготовиться
  room.gameState.nextBeatTime = Date.now() + BEAT_MS;
  room.gameState.beatIndex    = 0;

  // Отправить стартовое состояние с временем первого удара
  io.to(roomId).emit('game_start', {
    gameState:     room.gameState,
    serverTime:    Date.now(),
    nextBeatTime:  room.gameState.nextBeatTime,
    beatMs:        BEAT_MS,
    bpm:           BPM,
  });

  // Тикаем на сервере каждый бит
  room.beatInterval = setInterval(() => {
    if (!rooms[roomId] || rooms[roomId].gameState.finished) {
      clearInterval(room.beatInterval);
      return;
    }
    const gs = rooms[roomId].gameState;
    gs.nextBeatTime += gs.beatMs;
    gs.beatIndex++;

    // Канат медленно возвращается к центру (натяжение)
    if (Math.abs(gs.ropePosition) > 0) {
      gs.ropePosition *= 0.985;
      if (Math.abs(gs.ropePosition) < 0.3) gs.ropePosition = 0;
    }

    io.to(roomId).emit('beat', {
      beatIndex:    gs.beatIndex,
      nextBeatTime: gs.nextBeatTime,
      serverTime:   Date.now(),
      ropePosition: gs.ropePosition,
      hits:         gs.hits,
    });
  }, BEAT_MS);
}

function endGame(roomId, winner) {
  const room = rooms[roomId];
  if (!room) return;

  clearTimers(roomId);
  room.gameState.finished = true;
  room.gameState.winner   = winner;
  const loser = winner === 'player1' ? 'player2' : 'player1';

  // Вычисляем точность каждого игрока
  function calcAccuracy(hits) {
    const total = hits.perfect + hits.good + hits.miss;
    if (total === 0) return 0;
    return Math.round((hits.perfect * 1 + hits.good * 0.5) / total * 100);
  }

  const winnerSocketId = room.sockets[winner].id;
  const loserSocketId  = room.sockets[loser].id;

  const pdWinner = players[winnerSocketId];
  const pdLoser  = players[loserSocketId];

  let ratingChanges = { winner: 0, loser: 0 };

  if (pdWinner && pdLoser) {
    // ELO
    const { winnerDelta, loserDelta } = calcElo(pdWinner.rating, pdLoser.rating);
    pdWinner.rating = Math.max(0, pdWinner.rating + winnerDelta);
    pdLoser.rating  = Math.max(0, pdLoser.rating  + loserDelta);
    ratingChanges = { winner: winnerDelta, loser: loserDelta };

    // Статистика победителя
    const hitsW = room.gameState.hits[winner];
    const acc   = calcAccuracy(hitsW);
    pdWinner.games++;
    pdWinner.wins++;
    pdWinner.currentWinStreak++;
    pdWinner.winStreak = Math.max(pdWinner.winStreak, pdWinner.currentWinStreak);
    pdWinner.bestPerfectStreak = Math.max(pdWinner.bestPerfectStreak, hitsW.currentPerfectStreak);
    pdWinner.totalAccuracy = Math.round((pdWinner.totalAccuracy * (pdWinner.games - 1) + acc) / pdWinner.games);

    // Статистика проигравшего
    const hitsL = room.gameState.hits[loser];
    const accL  = calcAccuracy(hitsL);
    pdLoser.games++;
    pdLoser.currentWinStreak = 0;
    pdLoser.totalAccuracy = Math.round((pdLoser.totalAccuracy * (pdLoser.games - 1) + accL) / pdLoser.games);
  }

  const winnerAcc = pdWinner ? calcAccuracy(room.gameState.hits[winner]) : 0;
  const loserAcc  = pdLoser  ? calcAccuracy(room.gameState.hits[loser])  : 0;

  io.to(roomId).emit('game_over', {
    winner,
    hits: room.gameState.hits,
    accuracy:       { [winner]: winnerAcc, [loser]: loserAcc },
    ratingChanges,
    newRatings: {
      [winner]: pdWinner?.rating,
      [loser]:  pdLoser?.rating,
    },
    newRanks: {
      [winner]: pdWinner ? getRank(pdWinner.rating) : null,
      [loser]:  pdLoser  ? getRank(pdLoser.rating)  : null,
    },
    winnerStats: pdWinner ? {
      winStreak:         pdWinner.winStreak,
      currentWinStreak:  pdWinner.currentWinStreak,
      bestPerfectStreak: pdWinner.bestPerfectStreak,
      totalAccuracy:     pdWinner.totalAccuracy,
      games:             pdWinner.games,
      wins:              pdWinner.wins,
    } : null,
  });

  console.log(`🏆 ${roomId}: ${room.names[winner]} победил (${winnerAcc}% точность, ELO +${ratingChanges.winner})`);
}

function clearTimers(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearInterval(room.countdownTimer);
  clearInterval(room.beatInterval);
}

// ====================================
// ЗАПУСК
// ====================================
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`
🎮 =============================================
   АРКАН ТАРТЫШ v3 — Сервер запущен!
   http://localhost:${PORT}
   BPM: ${BPM} | Perfect: ±${PERFECT_WINDOW}ms | Good: ±${GOOD_WINDOW}ms
🎮 =============================================
  `);
});
