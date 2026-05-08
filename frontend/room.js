const socket = io("https://server-xm7a.onrender.com");

let room;
let name;

let currentRound = null;
let currentPhase = "lobby";
let myRole = null;

let mineWords = [];
let submittedMines = false;

/* INIT */
function init() {

  const params =
    new URLSearchParams(window.location.search);

  room = params.get("room");
  name = params.get("name");

  socket.emit("joinRoom", {
    roomId: room,
    name
  });
}

/* START */
function startGame() {

  socket.emit("gameControl", {
    action: "start"
  });
}

/* UI */
function renderRoundUI(data) {

  const wordEl =
    document.getElementById("word");

  const rolesEl =
    document.getElementById("rolesLine");

  const controlsEl =
    document.getElementById("explainerControls");

  const mineInput =
    document.getElementById("mineInput");

  const mineBtn =
    document.getElementById("sendMineBtn");

  const isExplainer =
    socket.id === data.explainerId;

  const isGuesser =
    socket.id === data.guesserId;

  const isMiner =
    !isExplainer && !isGuesser;

  myRole =
    isExplainer
      ? "explainer"
      : isGuesser
      ? "guesser"
      : "miner";

  /* WORD */

  // слово видят:
  // объясняющий + минёры
  // не видит отгадывающий

  if (isGuesser) {

    wordEl.innerText = "██████";

  } else {

    wordEl.innerText = data.word;
  }

  /* ROLES */

  rolesEl.innerHTML = `
    <div class="roles-wrapper">

      <div class="player-card">
        <div class="player-name">
          ${data.explainerName}
        </div>

        <div class="player-role">
          ОБЪЯСНЯЕТ
        </div>
      </div>

      <div class="vs-circle">
        ▶
      </div>

      <div class="player-card">
        <div class="player-name">
          ${data.guesserName}
        </div>

        <div class="player-role">
          ОТГАДЫВАЕТ
        </div>
      </div>

    </div>
  `;

  /* EXPLAINER BUTTONS */

  controlsEl.style.display =
    currentPhase === "round" &&
    isExplainer
      ? "block"
      : "none";

  /* MINES INPUT */

  if (
    isMiner &&
    currentPhase === "mine" &&
    !submittedMines
  ) {

    mineInput.style.display = "block";
    mineBtn.style.display = "inline-block";

  } else {

    mineInput.style.display = "none";
    mineBtn.style.display = "none";
  }
}

/* PHASE CHANGE */
socket.on("phaseChange", (data) => {

  currentPhase = data.phase;

  document.getElementById("phase").innerText =
    data.phase.toUpperCase();

  document.getElementById("timer").innerText =
    "⏱ " + data.time;

  // новая фаза мин → сбрасываем
  if (data.phase === "mine") {

    submittedMines = false;
    mineWords = [];
  }

  // если пришли роли
  if (data.word) {

    currentRound = data;

    renderRoundUI(data);

    renderMines();
  }
});

/* ROUND START */
socket.on("roundStart", (data) => {

  currentRound = data;
  currentPhase = "round";

  renderRoundUI(data);

  renderMines();
});

/* TIMER */
socket.on("timerUpdate", (t) => {

  document.getElementById("timer").innerText =
    "⏱ " + t;
});

/* PLAYERS */
socket.on("playersUpdate", (players) => {

  document.getElementById("players").innerHTML =
    players.map(p => `
      <div class="player-item">
        ${p.name}
      </div>
    `).join("");
});

/* SEND MINES */
function sendMines() {

  if (myRole !== "miner") return;

  const input =
    document.getElementById("mineInput");

  const value =
    input.value.trim();

  if (!value) return;

  mineWords =
    value
      .split(",")
      .map(w => w.trim())
      .filter(Boolean);

  socket.emit("submitMines", {
    words: mineWords
  });

  submittedMines = true;

  input.style.display = "none";

  document.getElementById(
    "sendMineBtn"
  ).style.display = "none";

  renderMines();
}

/* RENDER MINES */
function renderMines(showAll = false) {

  const mineBox =
    document.getElementById("mineWords");

  if (!mineBox) return;

  mineBox.innerHTML = "";

  if (!mineWords.length) return;

  mineWords.forEach(word => {

    const mine =
      document.createElement("div");

    mine.className =
      "mine-card";

    const canSee =
      myRole === "miner" || showAll;

    mine.innerText =
      canSee
        ? word
        : "MINA";

    // только минёр может активировать
    if (
      myRole === "miner" &&
      currentPhase === "round"
    ) {

      mine.onclick = () => {

        mine.classList.toggle(
          "mine-active"
        );

        socket.emit("activateMine", {
          word
        });
      };
    }

    mineBox.appendChild(mine);
  });
}

/* END ROUND */
function endRound(guessed) {

  socket.emit("endRound", {
    guessed
  });
}

/* RESULTS */
socket.on("roundEnd", (data) => {

  currentPhase = "results";

  renderMines(true);

  document.getElementById("word").innerText =
    currentRound.word;

  document.getElementById(
    "explainerControls"
  ).style.display = "none";

  const board =
    document.getElementById("scoreboard");

  board.innerHTML =
    `
      <h3 class="mb-3">
        RESULTS
      </h3>
    ` +
    Object.entries(data.scores)
      .map(([id, score]) =>
        `
          <div class="score-item">
            ${id}: ${score}
          </div>
        `
      )
      .join("");
});