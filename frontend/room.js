const socket = io("https://server-xm7a.onrender.com");

let room;
let name;
let isHost = false;
let isPaused = false;

let currentRound = null;
let currentPhase = "lobby";
let myRole = null;

let allMines = [];
let activeMineKeys = [];

let maxMines = 3; // значение по умолчанию, обновится через settingsUpdated
let availablePacks = []; // массив названий всех доступных паков

function init() {
  const params = new URLSearchParams(window.location.search);
  room = params.get("room");
  name = params.get("name");
  socket.emit("joinRoom", { roomId: room, name });
}

/* --- Кнопки --- */
function startGame() {
  socket.emit("gameControl", { action: "start" });
}

function skipPhase() {
  socket.emit("skipPhase");
}

function togglePause() {
  socket.emit("pauseResume");
}
function updatePackSelect() {
  const select = document.getElementById('setWordPack');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = ''; // очищаем

  availablePacks.forEach(pack => {
    const option = document.createElement('option');
    option.value = pack;
    option.textContent = pack;
    select.appendChild(option);
  });

  // Восстановим выбор, если он есть в списке
  if (availablePacks.includes(currentValue)) {
    select.value = currentValue;
  } else if (availablePacks.length > 0) {
    select.value = availablePacks[0];
  }
}
function openSettings() {
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  function openSettings() {
  updatePackSelect(); // обновим селект перед открытием
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  modal.show();
}
  modal.show();
}

function saveSettings() {
  const mineTime = document.getElementById('setMineTime').value;
  const guessTime = document.getElementById('setGuessTime').value;
  const maxMinesVal = document.getElementById('setMaxMines').value;
  const wordPack = document.getElementById('setWordPack').value;
  const winScore = document.getElementById('setWinScore').value;
  socket.emit("updateSettings", { mineTime, guessTime, maxMines: maxMinesVal, wordPack, winScore });
  bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
}

function restartGame() {
  if (confirm("Полностью сбросить игру? Все очки обнулятся.")) {
    socket.emit("restartGame");
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
  }
}

/* --- UI рендер --- */
function renderRoundUI(data) {
  const wordEl = document.getElementById("word");
  const rolesEl = document.getElementById("rolesLine");
  const controlsEl = document.getElementById("explainerControls");
  const mineInput = document.getElementById("mineInput");
  const mineBtn = document.getElementById("sendMineBtn");

  const isExplainer = socket.id === data.explainerId;
  const isGuesser = socket.id === data.guesserId;
  const isMiner = !isExplainer && !isGuesser;
  myRole = isExplainer ? "explainer" : isGuesser ? "guesser" : "miner";

  wordEl.innerText = isGuesser ? "*****" : data.word;
  rolesEl.innerHTML = `
    <div class="roles-wrapper">
      <div class="player-card"><div class="player-name">${data.explainerName||"???"}</div><div class="player-role">ОБЪЯСНЯЕТ</div></div>
      <div class="vs-circle">▶</div>
      <div class="player-card"><div class="player-name">${data.guesserName||"???"}</div><div class="player-role">ОТГАДЫВАЕТ</div></div>
    </div>`;
  controlsEl.style.display = (currentPhase === "round" && isExplainer) ? "block" : "none";

  // Показ поля ввода мин для минёра
  const myMinesCount = allMines.filter(m => m.minerId === socket.id).length;
  const canStillMine = isMiner && currentPhase === "mine" && myMinesCount < maxMines;
  if (isMiner && currentPhase === "mine") {
  mineInput.style.display = "block";
  mineBtn.style.display = "inline-block";
  // Оставляем поле пустым – не подставляем старые мины
  mineInput.value = "";
}else if(!canStillMine){
  mineInput.style.display = "none";
  mineBtn.style.display = "none";
} 

  updateHostControls();
}

function updateHostControls() {
  const skipBtn = document.getElementById("skipBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const startBtn = document.getElementById("startBtn");

  // Для не-хостов скрываем все управляющие кнопки
  if (!isHost) {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
    settingsBtn.style.display = "none";
    startBtn.style.display = "none";   // <-- явно скрываем Start
    return; // дальше не идём, т.к. остальное только для хоста
  }

  // Далее код только для хоста:
  const activeGamePhases = ["mine", "round"];
  const isLobbyOrFinished = currentPhase === "lobby" || currentPhase === "finished";
  const isPausedNow = activeGamePhases.includes(currentPhase) && isPaused;

  // Кнопка Start: только в лобби или после завершения игры
  startBtn.style.display = isLobbyOrFinished ? "inline-block" : "none";

  // Кнопки Skip и Pause только в фазах mine/round
  if (activeGamePhases.includes(currentPhase)) {
    skipBtn.style.display = isPaused ? "none" : "inline-block";
    pauseBtn.style.display = "inline-block";
    pauseBtn.innerText = isPaused ? "Resume" : "Pause";
    pauseBtn.classList.toggle('btn-danger', isPaused);
    pauseBtn.classList.toggle('btn-info', !isPaused);
  } else {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
  }

  // Настройки: показываем, если лобби/finished или пауза в игровых фазах
  settingsBtn.style.display = (isLobbyOrFinished || isPausedNow) ? "inline-block" : "none";
}

/* --- События сервера --- */
socket.on("phaseChange", (data) => {
  currentPhase = data.phase;
  // Обновляем только текст внутри span, сам div#phase не трогаем
  document.getElementById("phaseText").innerText = data.phase === "finished" ? "GAME OVER" : data.phase.toUpperCase();
  document.getElementById("timer").innerText = data.time ? "⏱ " + data.time : "";

  if (data.phase === "mine") {
    // Сброс мин при новой фазе минирования
    allMines = [];
    activeMineKeys = [];
    document.getElementById("mineInput").value = "";
    renderMines();
  }
  if (data.word) {
    currentRound = data;
    renderRoundUI(data);
    renderMines();
  }
  updateHostControls();
});

socket.on("roundStart", (data) => {
  currentRound = data;
  currentPhase = "round";
  document.getElementById("phaseText").innerText = "Фаза отгадывания";
  document.getElementById("timer").innerText = data.time ? "⏱ " + data.time : ""; // <-- добавить эту строку
  allMines = data.mines || [];
  activeMineKeys = data.activeMines || [];
  renderRoundUI(data);
  renderMines();
});

socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = "⏱ " + t;
});

socket.on("playersUpdate", (players) => {
  const div = document.getElementById("players");
  div.innerHTML = players.map(p => {
    const star = p.isHost ? " ⭐" : "";
    // Если я хост, то очки — кликабельный span, иначе простой
    const scoreHtml = isHost
      ? `<span class="player-score editable-score" data-player-id="${p.id}" title="Изменить очки">${p.score}</span>`
      : `<span class="player-score">${p.score}</span>`;
    return `<div class="player-item">${p.name}${star}${scoreHtml}</div>`;
  }).join("");

  // Если я хост — навешиваю обработчики на все editable-score
  if (isHost) {
    document.querySelectorAll('.editable-score').forEach(el => {
      el.onclick = () => {
        const playerId = el.dataset.playerId;
        const currentScore = parseInt(el.innerText) || 0;
        const newScore = prompt("Новое количество очков:", currentScore);
        if (newScore !== null && !isNaN(newScore)) {
          socket.emit("updateScore", { playerId, score: parseInt(newScore) });
        }
      };
    });
  }

  // Обновляю isHost (на случай, если хост сменился)
  const me = players.find(p => p.id === socket.id);
  isHost = me?.isHost || false;
  updateHostControls();
});

socket.on("pauseToggled", (paused) => {
  isPaused = paused;
  updateHostControls();
});
socket.on("customPacksUpdated", (packs) => {
  availablePacks = packs;
  // Если модальное окно открыто, сразу обновим селект
  const select = document.getElementById('setWordPack');
  if (select && document.getElementById('settingsModal').classList.contains('show')) {
    updatePackSelect();
  }
});
socket.on("settingsUpdated", (settings) => {
  document.getElementById('setMineTime').value = settings.mineTime || 50;
  document.getElementById('setGuessTime').value = settings.guessTime || 50;
  document.getElementById('setMaxMines').value = settings.maxMines || 3;
  document.getElementById('setWordPack').value = settings.wordPack || "default";
  document.getElementById('setWinScore').value = settings.winScore || 30;
  // Обновляем локальный лимит
  maxMines = settings.maxMines || 3;
  // Если мы в фазе mine, перепроверим видимость поля ввода
  if (currentPhase === "mine" && myRole === "miner") {
    const mineInput = document.getElementById("mineInput");
    const mineBtn = document.getElementById("sendMineBtn");
    const myMines = allMines.filter(m => m.minerId === socket.id).length;
    const canMine = myMines < maxMines;
    mineInput.style.display = canMine ? "block" : "none";
    mineBtn.style.display = canMine ? "inline-block" : "none";
  }
});
socket.on("customPacksUpdated", (packs) => {
  console.log("Получены паки:", packs); // для проверки в консоли
  availablePacks = packs;
  updatePackSelect();
});
socket.on("updateScore", ({ playerId, score }) => {
  const room = rooms[socket.data.roomId];
  if (!room || socket.id !== room.hostId) return;
  // Разрешаем менять очки только в лобби, после игры или на паузе
  if (room.state !== "lobby" && room.state !== "finished" && !room.paused) return;
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;
  room.scores[playerId] = Math.max(0, Number(score) || 0);
  sendPlayersUpdate(socket.data.roomId);
});
socket.on("gameOver", (data) => {
  alert(`Победил ${data.winner}! Игра окончена.`);
  currentPhase = "finished";
  updateHostControls();
  document.getElementById("phaseText").innerText = "Игра закончена";
  document.getElementById("timer").innerText = ""; // можно оставить пустым или убрать
});

socket.on("gameRestarted", () => {
  currentPhase = "lobby";
  isPaused = false;
  allMines = [];
  activeMineKeys = [];
  currentRound = null;
  myRole = null;
  document.getElementById("word").innerText = "Ожидание...";
  document.getElementById("rolesLine").innerHTML = "";
  document.getElementById("explainerControls").style.display = "none";
  document.getElementById("mineInput").style.display = "none";
  document.getElementById("sendMineBtn").style.display = "none";
  document.getElementById("mineBox").innerHTML = "";
  document.getElementById("timer").innerText = "";
  document.getElementById("phaseText").innerText = "Лобби";
  updateHostControls();
});

/* --- Мины --- */
function sendMines() {
  if (myRole !== "miner" || currentPhase !== "mine") return;
  const input = document.getElementById("mineInput");
  const value = input.value.trim();
  if (!value) return;

  const words = value.split(",").map(w => w.trim()).filter(Boolean);
  if (words.length === 0) return;

  // Отправляем мины на сервер (добавление, а не замена)
  socket.emit("addMines", { words });

  // Очищаем поле ввода после отправки
  input.value = "";
}

function renderMines(showAll = false) {
  const box = document.getElementById("mineBox");
  if (!box) return;
  box.innerHTML = "";
  if (!allMines.length) return;

  allMines.forEach(m => {
    const mine = document.createElement("div");
    mine.className = "mine-card";
    const isOwner = m.minerId === socket.id;
    const canSee = myRole === "miner" || isOwner || showAll;

    // Основное содержимое
    let content = canSee ? m.word : "MINA";
    if (canSee && m.minerName) {
      content += `<div class="mine-author">${m.minerName}</div>`;
    }
    mine.innerHTML = content;

    const mineKey = `${m.minerId}:${m.word}`;
    if (activeMineKeys.includes(mineKey)) {
      mine.classList.add("mine-active");
    }

    // Кнопки редактирования/удаления только для владельца в фазе mine
    if (isOwner && currentPhase === "mine" && !showAll) {
      // Контейнер для иконок
      const btnContainer = document.createElement("div");
      btnContainer.className = "mine-buttons";

      const editBtn = document.createElement("span");
      editBtn.className = "mine-edit-btn";
      editBtn.innerHTML = "✎";
      editBtn.title = "Редактировать мину";
      editBtn.onclick = (e) => {
        e.stopPropagation();
        startEditMine(m);
      };

      const deleteBtn = document.createElement("span");
      deleteBtn.className = "mine-delete-btn";
      deleteBtn.innerHTML = "✕";
      deleteBtn.title = "Удалить мину";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        socket.emit("deleteMine", { word: m.word });
      };

      btnContainer.appendChild(editBtn);
      btnContainer.appendChild(deleteBtn);
      mine.appendChild(btnContainer);
    }

    // Клик для активации/деактивации (только в фазе round для владельца)
    if (myRole === "miner" && currentPhase === "round" && isOwner) {
      if (activeMineKeys.includes(mineKey)) {
        mine.onclick = () => socket.emit("deactivateMine", { word: m.word });
      } else {
        mine.onclick = () => socket.emit("activateMine", { word: m.word });
      }
    } else {
      mine.onclick = null; // убираем клик, чтобы не мешал
    }

    box.appendChild(mine);
  });
}

// Функция начала редактирования мины
function startEditMine(mineObj) {
  // Находим родительскую карточку (ближайший .mine-card)
  const card = [...document.querySelectorAll('.mine-card')].find(c => {
    return c.innerText.includes(mineObj.word) && c.querySelector('.mine-author')?.innerText === mineObj.minerName;
  });
  if (!card) return;

  // Создаём поле ввода
  const input = document.createElement("input");
  input.type = "text";
  input.value = mineObj.word;
  input.className = "mine-edit-input";
  input.style.width = "80%";

  // Кнопки сохранить/отменить
  const saveBtn = document.createElement("button");
  saveBtn.innerHTML = "✅";
  saveBtn.className = "mine-edit-save";
  const cancelBtn = document.createElement("button");
  cancelBtn.innerHTML = "✖";
  cancelBtn.className = "mine-edit-cancel";

  const editContainer = document.createElement("div");
  editContainer.className = "mine-edit-container";
  editContainer.appendChild(input);
  editContainer.appendChild(saveBtn);
  editContainer.appendChild(cancelBtn);

  // Заменяем содержимое карточки
  card.innerHTML = "";
  card.appendChild(editContainer);

  // Сохранение
  saveBtn.onclick = (e) => {
    e.stopPropagation();
    const newWord = input.value.trim();
    socket.emit("editMine", { oldWord: mineObj.word, newWord: newWord || "" });
    // Сервер отправит minesUpdated, который перерисует всё
  };

  // Отмена
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    renderMines(); // просто перерисовываем (можно без запроса к серверу)
  };

  // Фокус на поле ввода
  input.focus();
}

socket.on("mineActivated", ({ mineKey }) => {
  if (!activeMineKeys.includes(mineKey)) activeMineKeys.push(mineKey);
  renderMines();
});
socket.on("mineDeactivated", ({ mineKey }) => {
  activeMineKeys = activeMineKeys.filter(k => k !== mineKey);
  renderMines();
});
function endRound(guessed) {
  socket.emit("endRound", { guessed });
}
socket.on("minesUpdated", (minesData) => {
  // minesData = [{ minerId, minerName, words }]
  allMines = [];
  minesData.forEach(({ minerId, minerName, words }) => {
    words.forEach(word => {
      allMines.push({ minerId, minerName, word });
    });
  });
  renderMines();
  // обновим поле ввода для текущего минера
});
socket.on("roundEnd", (data) => {
  currentPhase = "results";
  renderMines(true);
  document.getElementById("word").innerText = currentRound?.word || "???";
  document.getElementById("explainerControls").style.display = "none";
  updateHostControls();
});