const API_KEY = 'c27af44c8277f0b14d1000299eff81b2'

// const response = await fetch(
//     `https://api.openweathermap.org/data/2.5/weather?q=Karachi&appid=${apiKey}&units=metric`
// );


var searchText = document.getElementById('search')
var temperature = document.getElementById('temperature')
var city = document.getElementById('city')

function success(response) {
    return response.json();
}

function finalData(data) {

    console.log(data.name);
    console.log(data.main.temp);

    temperature.innerHTML = data.main.temp + " C"
    city.innerHTML = data.name

}

function error(err) {
    console.log(err);
}

function checkWeather() {
    fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${searchText.value}&appid=${API_KEY}&units=metric`
    )
        .then(success) // Converting Process
        .then(finalData) // Final Readable Form Data
        .catch(error);
}