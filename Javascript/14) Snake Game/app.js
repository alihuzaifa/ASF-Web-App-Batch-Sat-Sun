// Imports
var snakeBoard = document.getElementById('board')

// Sounds Import
var boardSound = new Audio("music/music.mp3")
var foodSound = new Audio("music/food.mp3")
var gameOverSound = new Audio("music/gameover.mp3")

// Background music — play once, loop it
boardSound.loop = true
boardSound.play()

// Game variables
var nextDirection = { x: 0, y: 0 };
var direction = { x: 0, y: 0 }
var snakeBody = [
    { x: 4, y: 5 },    // head
]

var food = { x: 10, y: 8 }
var gameInterval = null
var gameRunning = true


function keyPress(event) {
    if (event.key === "ArrowRight" && direction.x !== -1) {
        nextDirection = { x: 1, y: 0 }
    }
    if (event.key === "ArrowLeft" && direction.x !== 1) {
        nextDirection = { x: -1, y: 0 }
    }
    if (event.key === "ArrowUp" && direction.y !== 1) {
        nextDirection = { x: 0, y: -1 }
    }
    if (event.key === "ArrowDown" && direction.y !== -1) {
        nextDirection = { x: 0, y: 1 }
    }
}


function renderSnake() {
    snakeBoard.innerHTML = "";
    var divArray = []

    for (var i = 0; i < snakeBody.length; i++) {
        var div = document.createElement('div');
        div.style.gridColumnStart = snakeBody[i].x
        div.style.gridRowStart = snakeBody[i].y
        if (i === 0) {
            div.classList.add("head")
        } else {
            div.classList.add("snake")
        }
        divArray.push(div)
    }

    return divArray
}

function renderFood() {
    var divArray = []
    var div = document.createElement('div');
    div.style.gridColumnStart = food.x
    div.style.gridRowStart = food.y;
    div.classList.add("food")
    divArray.push(div)
    return divArray
}


function draw() {
    var snakeDivs = renderSnake()
    var snakeFood = renderFood();

    for (var i = 0; i < snakeDivs.length; i++) {
        snakeBoard.appendChild(snakeDivs[i])
    }

    for (var i = 0; i < snakeFood.length; i++) {
        snakeBoard.appendChild(snakeFood[i])
    }
}


function moveSnake() {
    direction = nextDirection;
    var newHead = {
        x: snakeBody[0].x + direction.x,
        y: snakeBody[0].y + direction.y,
    }
    snakeBody.pop()
    snakeBody.unshift(newHead)
}


function fooRandomPosition() {
    var newPos;
    // Make sure food does not spawn on the snake body
    do {
        newPos = {
            x: Math.ceil(Math.random() * 20),
            y: Math.ceil(Math.random() * 20),
        }
    } while (isOnSnake(newPos.x, newPos.y))

    return newPos
}

// Check if a position overlaps with any snake body part
function isOnSnake(x, y) {
    for (var i = 0; i < snakeBody.length; i++) {
        if (snakeBody[i].x === x && snakeBody[i].y === y) {
            return true
        }
    }
    return false
}


function eatFood() {
    if (snakeBody[0].x === food.x && snakeBody[0].y === food.y) {
        foodSound.play()

        // Food spawns at new random position
        food = fooRandomPosition()

        // Grow snake by adding a new tail segment
        snakeBody.push({
            x: snakeBody[snakeBody.length - 1].x,
            y: snakeBody[snakeBody.length - 1].y
        })
    }
}


// Returns true if snake head hits the wall
function checkWallCollision() {
    var head = snakeBody[0]
    if (head.x < 1 || head.x > 20 || head.y < 1 || head.y > 20) {
        return true
    }
    return false
}

// Returns true if snake head hits its own body
function checkSelfCollision() {
    var head = snakeBody[0]
    for (var i = 1; i < snakeBody.length; i++) {
        if (head.x === snakeBody[i].x && head.y === snakeBody[i].y) {
            return true
        }
    }
    return false
}


function gameOver() {
    gameRunning = false
    clearInterval(gameInterval)
    boardSound.pause()
    gameOverSound.play()

    // Show game over message on the board
    snakeBoard.innerHTML = ""
    var msg = document.createElement('div')
    msg.innerText = "Game Over!"
    msg.style.gridColumn = "1 / -1"
    msg.style.gridRow = "1 / -1"
    msg.style.display = "flex"
    msg.style.alignItems = "center"
    msg.style.justifyContent = "center"
    msg.style.fontSize = "2rem"
    msg.style.color = "red"
    msg.style.fontWeight = "bold"
    snakeBoard.appendChild(msg)
}


function gameRun() {
    moveSnake()

    // Check collisions AFTER moving
    if (checkWallCollision() || checkSelfCollision()) {
        gameOver()
        return
    }

    eatFood()
    draw()
}

gameInterval = setInterval(gameRun, 150)

document.addEventListener("keydown", keyPress)