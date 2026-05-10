var hours = document.getElementById('hours');
var minutes = document.getElementById('minutes');
var seconds = document.getElementById('seconds');

function watch() {
    var date = new Date();
    var currentHours = date.getHours();
    var currentMinutes = date.getMinutes();
    var currentSeconds = date.getSeconds();
    hours.innerHTML = currentHours;
    minutes.innerHTML = currentMinutes;
    seconds.innerHTML = currentSeconds;
}

setInterval(watch, 1000)