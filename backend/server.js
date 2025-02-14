const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const fs = require("fs");
const path = require("path");

// Функция чтения JSON-файла
function readData(file) {
    const filePath = path.join(__dirname, `db/${file}.json`);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Функция записи JSON-файла
function writeData(file, data) {
    const filePath = path.join(__dirname, `db/${file}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), "utf8");
}

app.post("/login", (req, res) => {
    const { name, emoji = "🙂" } = req.body;
    if (!name) return res.status(400).json({ error: "Имя игрока обязательно" });

    let players = readData("players");
    let games = readData("games");
    let playerGames = readData("player_games");

    let player = players.find(p => p.name === name);

    if (!player) {
        player = {
            id: players.length + 1,
            name,
            emoji,
            position: 1,
            bonus: 0,
            penalty: 0,
            current_game: null,
            status: "idle",
            last_dice: 0
        };
        players.push(player);
        writeData("players", players);
        console.log(`✅ Новый игрок: ${name}`);
    } else {
        console.log(`🔄 Игрок ${name} вернулся в игру`);
    }

    // Проверяем, есть ли запись в player_games
    let playerGameEntry = playerGames.find(pg => pg.player_id === player.id);
    if (!playerGameEntry) {
        playerGameEntry = { player_id: player.id, active_games: null, completed_games: [] };
        playerGames.push(playerGameEntry);
        writeData("player_games", playerGames);
        console.log(`🆕 Создана запись в player_games для игрока: ${name}`);
    }

    // Добавляем название текущей игры
    const currentGameName = player.current_game
        ? games.find(game => game.id === player.current_game)?.name || "Нет игры"
        : "Нет игры";

    player.current_game = currentGameName;

    res.json(player);
});

app.get("/players", (req, res) => {
    const players = readData("players");
    const games = readData("games");

    // Добавляем название игры в данные игроков
    const playersWithGames = players.map(player => ({
        ...player,
        current_game_name: player.current_game
            ? games.find(game => game.id === player.current_game)?.name || "Нет игры"
            : "Нет игры"
    }));

    res.json(playersWithGames);
});

app.post("/random", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Имя игрока обязательно" });

    let players = readData("players");
    let games = readData("games");
    let playerGames = readData("player_games");
    let specialCells = readData("special_cells");

    let player = players.find(p => p.name === name);
    if (!player) return res.status(404).json({ error: "Игрок не найден" });

    let playerGameEntry = playerGames.find(pg => pg.player_id === player.id);

    let message = "";
    let selectedGame = null;

    // 📍 Запоминаем текущую позицию перед броском
    const previousPosition = player.position;

    // 🎲 Бросаем кубик (1-6)
    const dice = Math.floor(Math.random() * 6) + 1;
    player.position += dice;
    player.last_dice = dice;

    // 🛑 Проверяем, достиг ли игрок 1000-й клетки
    if (player.position >= 1000) {
        player.position = 1000;
        player.status = "finished";
        player.current_game = null;
        message = "🎉 Поздравляем! Вы дошли до 1000-й клетки и завершили игру!";

        writeData("players", players);
        return res.json({ dice, newPosition: player.position, game: null, message });
    }

    // 🛑 Проверяем клетку, на которой СТОЯЛ игрок
    if (specialCells.red.includes(previousPosition)) {
        player.position -= dice * 2; // Двигаемся назад
        message += "🔴 Красная клетка! Движение назад! ";
    }

    if (specialCells.green.includes(previousPosition)) {
        player.position += dice; // Удваиваем ход
        message += "🟢 Зеленая клетка! Очки удвоены! ";
    }

    // 🟡 🟢 🔴 🔵 Логика выбора игры В ЛЮБОМ СЛУЧАЕ!
    if (specialCells.blue.includes(previousPosition)) {
        if (playerGameEntry.completed_games.length > 0) {
            const pastGames = games.filter(g => playerGameEntry.completed_games.includes(g.id));
            if (pastGames.length > 0) {
                selectedGame = pastGames[Math.floor(Math.random() * pastGames.length)];
                message += "🔵 Синяя клетка! Выбрана пройденная игра. ";
            } else {
                message += "🔵 Синяя клетка, но у вас нет пройденных игр. ";
            }
        }
    }

    if (!selectedGame) {
        if (specialCells.yellow[previousPosition]) {
            const genre = specialCells.yellow[previousPosition];
            const genreGames = games.filter(g => g.genre === genre &&
                !playerGameEntry.completed_games.includes(g.id) &&
                playerGameEntry.active_games !== g.id);
            if (genreGames.length > 0) {
                selectedGame = genreGames[Math.floor(Math.random() * genreGames.length)];
                message += `🟡 Желтая клетка! Выбрана игра жанра ${genre}. `;
            } else {
                message += `🟡 Желтая клетка, но игр жанра ${genre} больше нет. `;
            }
        } else {
            // Красная, синяя или обычная → ЛЮБАЯ доступная игра
            const availableGames = games.filter(g =>
                !playerGameEntry.completed_games.includes(g.id) &&
                playerGameEntry.active_games !== g.id);
            if (availableGames.length > 0) {
                selectedGame = availableGames[Math.floor(Math.random() * availableGames.length)];
                message += "🎲 Выбрана случайная игра. ";
            } else {
                message += "🎲 Все игры уже пройдены! ";
            }
        }
    }

    // ✅ Игра выбирается ВСЕГДА
    if (selectedGame) {
        player.current_game = selectedGame.id;
        player.status = "playing";

        if (!playerGameEntry) {
            playerGames.push({ player_id: player.id, active_games: selectedGame.id, completed_games: [] });
        } else {
            playerGameEntry.active_games = selectedGame.id;
        }
    }

    writeData("players", players);
    writeData("player_games", playerGames);

    res.json({ dice, newPosition: player.position, game: selectedGame, message });
});

app.post("/complete_game", (req, res) => {
    const { name, time_spent } = req.body;
    if (!name) return res.status(400).json({ error: "Имя игрока обязательно" });

    let players = readData("players");
    let playerGames = readData("player_games");
    let gameHistory = readData("game_history");
    let games = readData("games");

    let player = players.find(p => p.name === name);
    if (!player || !player.current_game) {
        return res.status(400).json({ error: "Игрок не в активной игре" });
    }

    let playerGameEntry = playerGames.find(pg => pg.player_id === player.id);
    if (!playerGameEntry) return res.status(400).json({ error: "Игрок не найден в списке игр" });

    let currentGame = games.find(g => g.id === player.current_game);

    // Добавляем игру в `completed_games` и очищаем `active_games`
    playerGameEntry.completed_games.push(player.current_game);
    playerGameEntry.active_games = null;

    // Рассчитываем бонусные ходы
    const bonusMoves = calculateReward(time_spent, 'completed');
    const pos = player.position;
    player.position += bonusMoves;

    let message = `Игра пройдена! +${bonusMoves} хода`;

    // Проверяем, достиг ли игрок 1000-й клетки
    if (player.position >= 1000) {
        player.position = 1000;
        player.status = "finished";
        player.current_game = null;
        message = "🎉 Поздравляем! Вы дошли до 1000-й клетки и завершили игру!";
    } else {
        player.current_game = null;
        player.status = "completed";
    }

    // Логируем ход в `game_history.json`
    gameHistory.push({
        player_id: player.id,
        player_name: player.name,
        game_id: currentGame?.id || null,
        game_name: currentGame?.name || "Нет игры",
        status: "completed",
        time_spent: time_spent || null,
        dice: player.last_dice,
        new_position: player.position,
        position: pos,
        timestamp: new Date().toISOString()
    });

    writeData("player_games", playerGames);
    writeData("players", players);
    writeData("game_history", gameHistory);

    res.json({ message, player });
});

app.post("/drop_game", (req, res) => {
    const { name, time_spent } = req.body;
    if (!name) return res.status(400).json({ error: "Имя игрока обязательно" });

    let players = readData("players");
    let playerGames = readData("player_games");
    let gameHistory = readData("game_history");
    let games = readData("games");

    let player = players.find(p => p.name === name);
    if (!player || !player.current_game) {
        return res.status(400).json({ error: "Игрок не в активной игре" });
    }

    let playerGameEntry = playerGames.find(pg => pg.player_id === player.id);
    if (!playerGameEntry) return res.status(400).json({ error: "Игрок не найден в списке игр" });

    let currentGame = games.find(g => g.id === player.current_game);

    // Добавляем игру в `completed_games` и очищаем `active_games`
    playerGameEntry.completed_games.push(player.current_game);
    playerGameEntry.active_games = null;

    // Откатываем позицию назад
    const penaltyMoves = calculateReward(time_spent, "dropped");
    const pos = player.position;
    player.position += penaltyMoves;
    player.position = Math.max(player.position, 1); // Не даем уйти в минус

    // Удаляем активную игру (не добавляем в `completed_games`)
    playerGameEntry.active_games = null;

    // Очищаем текущую игру
    player.current_game = null;
    player.status = "idle";

    // Логируем ход в `game_history.json`
    gameHistory.push({
        player_id: player.id,
        player_name: player.name,
        game_id: currentGame?.id || null,
        game_name: currentGame?.name || "Нет игры",
        status: "dropped",
        time_spent: null,
        dice: player.last_dice,
        new_position: player.position,
        position: pos,
        timestamp: new Date().toISOString()
    });

    writeData("player_games", playerGames);
    writeData("players", players);
    writeData("game_history", gameHistory);

    res.json({ message: "Игра дропнута, позиция восстановлена", player });
});

app.get("/special_cells", (req, res) => {
    const specialCells = readData("special_cells");
    res.json(specialCells);
});

app.get("/leaderboard", (req, res) => {
    let players = readData("players");

    // Сортируем по позиции (от большего к меньшему)
    let leaderboard = players
        .sort((a, b) => b.position - a.position)
        .map(player => ({
            name: `${player.emoji} ${player.name}`,
            position: player.position
        }));

    res.json(leaderboard);
});

app.get("/game_history", (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Имя игрока обязательно" });

    let players = readData("players");
    let gameHistory = readData("game_history");

    let player = players.find(p => p.name === name);
    if (!player) return res.status(404).json({ error: "Игрок не найден" });

    const playerHistory = gameHistory
        .filter(h => h.player_id === player.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Сортируем по дате (сначала последние)

    res.json(playerHistory);
});

function calculateReward(hours, status) {
    const rewards = readData("rewards");

    if (!hours || hours < 1) return 0; // Если время некорректное, бонус/штраф = 0

    const category = rewards[status];
    if (!category) return 0; // Если статус неизвестен

    for (const range of category) {
        if (hours >= range.min && (range.max === null || hours <= range.max)) {
            return range.bonus || range.penalty || 0;
        }
    }

    return 0;
}

// Запуск сервера
app.listen(8080, () => {
    console.log("🚀 Сервер запущен на порту 8080");
});
