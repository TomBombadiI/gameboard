const server = 'http://localhost:8080';

class IntervalTimer {
    constructor(callback, interval) {
        var timerId, startTime, remaining = 0;
        var state = 0; //  0 = idle, 1 = running, 2 = paused, 3= resumed

        this.pause = function () {
            if (state != 1) return;

            remaining = interval - (new Date() - startTime);
            window.clearInterval(timerId);
            state = 2;
        };

        this.resume = function () {
            if (state != 2) return;

            state = 3;
            window.setTimeout(this.timeoutCallback, remaining);
        };

        this.timeoutCallback = function () {
            if (state != 3) return;

            callback();

            startTime = new Date();
            timerId = window.setInterval(callback, interval);
            state = 1;
        };

        startTime = new Date();
        timerId = window.setInterval(callback, interval);
        state = 1;
    }
}

window.player = null;
let auth = false;
let gameboard = document.getElementById('gameboard');
let username = document.getElementById('username');
let currentGame = document.getElementById('currentGame');
let currentPosition = document.getElementById('currentPosition');

const rollingDiceHTML = document.querySelector('.rolling-dice').innerHTML;

const rollingDiceElement = document.querySelector('.rolling-dice');
const passOrDropWrapper = document.querySelector('.pass-or-drop');
const passGameButton = document.getElementById('passGameButton');
const dropGameButton = document.getElementById('dropGameButton');
const rollDiceButton = document.getElementById('rollDiceButton');

renderGameboard();
await restoreSession();

const loginPopup = new Popup({
    id: "loginPopup",
    title: "Введите свои данные",
    content: `<form class="popup-form">
                <input required minlength="2" type="text" placeholder="Имя" id="name">
                <input required type="text" placeholder="Emoji" id="emoji" readonly>
                <div class="emoji-window">
                    <emoji-picker id="emojiPicker"></emoji-picker>
                </div>
                <button type="submit" class="button" id="joinGameButton">Присоединиться</button>
            </form>`,
    showImmediately: !auth,
    allowClose: false,
    hideCloseButton: true,
    css: `
        .popup-title {
            font-size: 36px !important;
        }
    `
});

const waitForPopup = setInterval(() => {
    const loginPopupElement = document.querySelector('.loginPopup');
    if (loginPopupElement) {
        clearInterval(waitForPopup);

        const emojiPicker = document.getElementById('emojiPicker');
        const emojiInput = document.getElementById('emoji');
        const emojiWindow = document.querySelector('.emoji-window');

        emojiInput.addEventListener('click', () => {
            emojiWindow.classList.toggle('active');
        });

        emojiPicker.addEventListener('emoji-click', (e) => {
            emojiInput.value = e.detail.unicode;
            emojiWindow.classList.remove('active');
        });

        // Закрытие emoji-picker при клике вне него
        document.addEventListener('click', (e) => {
            if (!emojiInput.contains(e.target) && !emojiPicker.contains(e.target)) {
                emojiWindow.classList.remove('active');
            }
        });

        const loginForm = loginPopupElement.querySelector('form');
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const name = loginForm.querySelector('#name').value;
            const emoji = loginForm.querySelector('#emoji').value;

            login(name, emoji);
        });
    }
}, 100);

const logoutButton = document.querySelector('#logoutButton');
logoutButton.addEventListener('click', function () {
    window.loop.pause();
    localStorage.removeItem("playerName");
    location.reload();
});

rollDiceButton.addEventListener('click', () => {
    rollDiceHandler();
});

function rollDiceHandler() {
    window.loop.pause();
    refreshRolling();

    const rollingDiceImgElement = rollingDiceElement.querySelector('img');
    const resultWrapper = rollingDiceElement.querySelector('.result-wrapper');
    const resultValueElement = rollingDiceElement.querySelector('.result-value');
    const rollDiceNextButton = rollingDiceElement.querySelector('#rollDiceNextButton');

    rollingDiceElement.classList.add('active');
    const rolling = setTimeout(async () => {

        let rollingData = await rollDice();

        rollingDiceImgElement.src = `./images/dice-${rollingData.dice}.png`;
        resultWrapper.classList.add('active');
        rollDiceNextButton.classList.add('active');
        resultValueElement.textContent = rollingData.dice;

        if (rollingData.newPosition === 1000) {
            finishGame();
            return
        }

        rollDiceNextButton.addEventListener('click', () => {
            const randomGamePopup = new Popup({
                id: "randomGamePopup",
                title: "Случайная игра",
                content: `<p>Выпало: <b>${rollingData.game.name}</b></p><button class="button">Начать</button>`,
                allowClose: false,
                hideCloseButton: true,
                css: `
                    .popup-title {
                        font-size: 36px !important;
                    }
                    .popup-body button {
                        margin-top: 20px;
                    }
                `,
                loadCallback: () => {
                    document
                        .querySelector(".randomGamePopup button")
                        .addEventListener("click", () => {
                            randomGamePopup.hide();
                            updateGameboard();
                            rollDiceButton.hidden = true;
                            passOrDropWrapper.classList.remove('hidden');
                            currentGame.textContent = rollingData.game.name;
                            currentPosition.textContent = rollingData.newPosition;
                            window.loop.resume();
                        });
                },
            });

            rollingDiceElement.classList.remove('active');
            randomGamePopup.show();
        });

    }, 1500);
}

passGameButton.addEventListener('click', async () => {
    window.loop.pause();
    if (!window.player || !window.player.current_game) return;

    const timeSpent = prompt("Сколько часов потратил на игру?");
    if (timeSpent === null || isNaN(timeSpent) || timeSpent < 0) return;

    const response = await fetch(`${server}/complete_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: window.player.name, time_spent: Number(timeSpent) }),
    });

    const data = await response.json();

    if (data.player.position && data.player.position === 1000) {
        finishGame();
    }

    rollDiceHandler();
});

dropGameButton.addEventListener('click', async () => {
    if (!window.player || !window.player.current_game) return;

    const timeSpent = prompt("Сколько часов потратил на игру?");
    if (timeSpent === null || isNaN(timeSpent) || timeSpent < 0) return;

    const response = await fetch(`${server}/drop_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: window.player.name, time_spent: Number(timeSpent) })
    });

    const data = await response.json();

    rollDiceHandler();
});

function finishGame() {
    rollDiceButton?.remove();
    passOrDropWrapper?.remove();
    rollingDiceElement?.remove();
    alert('Вы прошли игру!');
}

function refreshRolling() {
    rollingDiceElement.innerHTML = rollingDiceHTML;
    document.querySelector('.randomGamePopup')?.remove();
}

async function login(name, emoji) {
    const data = JSON.stringify({ name: name, emoji: emoji ? emoji : '🙂' });

    try {
        const response = await fetch(`${server}/login`, {
            method: 'POST',
            body: data,
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();

        if (result.error) {
            alert(result.error);
            return null; // Возвращаем null в случае ошибки
        }

        auth = true;
        localStorage.setItem("playerName", JSON.stringify(result.name));

        if (document.querySelector('.loginPopup')) {
            loginPopup.hide();
        }

        setUserData(result);
        updateGameboard();

        if (result.status === 'playing') {
            passOrDropWrapper.classList.remove('hidden');
            rollDiceButton.hidden = true;
        }

        window.loop = new IntervalTimer(() => {
            updateGameboard();
            updateLeaderboard();
            updateUserHistory();
        }, 1000);

        return result; // Возвращаем данные игрока
    } catch (ex) {
        console.log(ex);
        alert('Произошла ошибка сети!');
        return null; // Возвращаем null при ошибке сети
    }
}

async function restoreSession() {
    const savedPlayerName = localStorage.getItem("playerName");

    if (savedPlayerName) {
        const playerName = JSON.parse(savedPlayerName);
        return login(playerName);
    }
}

function setUserData(player) {
    window.player = player;
    document.documentElement.classList.remove('nologin');
    username.textContent = `${player.emoji} ${player.name}`;
    currentPosition.textContent = player.position;
    currentGame.textContent = player.current_game ?? '-';
}

async function renderGameboard() {
    // Загружаем специальные клетки
    const response = await fetch(`${server}/special_cells`);
    const specialCells = await response.json();

    const gameboard = document.getElementById("gameboard");
    gameboard.innerHTML = ""; // Очищаем перед рендерингом

    for (let i = 0; i < 1000; i++) {
        const cell = document.createElement("li");
        cell.classList.add("gameboard__cell");

        // Проверяем, является ли клетка специальной и добавляем класс
        if (specialCells.red.includes(i + 1)) {
            cell.classList.add("cell-red"); // Красная клетка (движение назад)
        }
        else if (specialCells.green.includes(i + 1)) {
            cell.classList.add("cell-green"); // Зеленая клетка (удвоение очков)
        }
        else if (specialCells.blue.includes(i + 1)) {
            cell.classList.add("cell-blue"); // Синяя клетка (выбор пройденной игры)
        }
        else if (specialCells.yellow[i + 1]) {
            cell.classList.add("cell-yellow"); // Желтая клетка (игра по жанру)
        }

        gameboard.appendChild(cell);
    }
}

function updateGameboard() {
    fetch(`${server}/players`, {
        method: 'get',
    })
        .then(response => response.json())
        .then(players => {

            const playersByCell = {};
            players.forEach(player => {
                if (!playersByCell[player.position]) {
                    playersByCell[player.position] = [];
                }
                playersByCell[player.position].push(player.emoji);
            });

            // Обновляем только измененные клетки
            for (let i = 0; i < 1000; i++) {
                const cell = gameboard.children[i]; // Получаем уже существующую ячейку

                // Очищаем содержимое клетки
                cell.innerHTML = "";

                // Если в клетке есть игроки, добавляем их эмодзи
                if (playersByCell[i + 1]) {
                    playersByCell[i + 1].forEach(emoji => {
                        const span = document.createElement("span");
                        span.textContent = emoji;
                        cell.appendChild(span);
                        updateCell(cell);
                    });
                }
            }

        })
        .catch(ex => {
            alert('Ошибка сервера');
            console.log(ex);
        })
}

function updateCell(cell) {
    const count = cell.children.length;
    cell.style.setProperty('--count', Math.ceil(Math.sqrt(count)));
}

async function rollDice() {
    try {
        let response = await fetch(`${server}/random`, {
            method: 'post',
            body: JSON.stringify({ name: JSON.parse(localStorage.getItem('playerName')) }),
            headers: { "Content-Type": "application/json" }
        });

        if (response.ok) {
            let json = await response.json();

            return json;
        }

        alert('Ошибка сервера');
    } catch (ex) {
        console.log(ex);
        alert('Неизвестная ошибка');
    }
}

function updateLeaderboard() {
    fetch(`${server}/leaderboard`)
        .then(response => response.json())
        .then(players => {
            const leaderboardList = document.querySelector(".user-top__list");
            leaderboardList.innerHTML = ""; // Очищаем список

            players.forEach(player => {
                const listItem = document.createElement("li");
                listItem.classList.add("user-top__item");

                listItem.innerHTML = `
                    <span class="user-top__item-name">
                        ${player.name}
                    </span>
                    <strong class="user-top__item-points">
                        (${player.position})
                    </strong>
                `;

                leaderboardList.appendChild(listItem);
            });
        })
        .catch(err => console.error("Ошибка загрузки лидеров:", err));
}

function updateUserHistory() {
    const player = window.player;
    if (!player) return;

    fetch(`${server}/game_history?name=${player.name}`)
        .then(response => response.json())
        .then(history => {
            const historyList = document.getElementById("userHistory");
            historyList.innerHTML = ""; // Очищаем старые данные

            if (history.length === 0) {
                historyList.innerHTML = "<li class='user-stat__history-item'>История пуста</li>";
                return;
            }

            history.forEach(entry => {
                const listItem = document.createElement("li");
                listItem.classList.add("user-stat__history-item");

                // Время прохождения (если есть)
                const timeSpent = entry.time_spent ? ` (${entry.time_spent}ч)` : "";

                // Форматируем дату
                const formattedDate = new Date(entry.timestamp).toLocaleDateString();

                listItem.innerHTML = `
                    <span>${formattedDate}</span> – 
                    <strong>${entry.game_name}</strong> – 
                    <em>${entry.status === "completed" ? "Пройдена" : "Дропнута"}</em>${timeSpent} – 
                    позиция: ${entry.position}, новая позиция: ${entry.new_position}
                `;

                historyList.appendChild(listItem);
            });
        })
        .catch(err => console.error("Ошибка загрузки истории:", err));
}

updateUserHistory();
updateLeaderboard();
