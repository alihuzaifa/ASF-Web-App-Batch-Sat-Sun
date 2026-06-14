

// Hoisting


// function greet(userName) {
//     return `Hello ${userName}`
// }

// console.log(userName);
// let userName = "Ali"
// console.log(userName);



// const greet = userName => `Hello ${userName}`
// const result = greet("Ali");
// console.log(result);













// Rest Parameters
// const userHobbies = (...hobbies) => {
//     console.log(hobbies);
// }

// const result = userHobbies("Swimming", "Cricket", "Traveling")


// // Ternary Operator
// const evenOddChecker = (number) => {
//     // if (number % 2 === 0) {
//     //     return "Even Number"
//     // } else {
//     //     return "Odd Number"
//     // }
//     // number % 2 === 0 ? return "Even Number": ""
//     return number % 2 === 0 ? "Even Number" : "Odd Number"
// }

// const result = evenOddChecker(3)
// console.log(result);

// const user = {
//     address: {
//         city: "Karachi"
//     }
// }

// Optional Chaining
// const user = {};
// console.log(user?.address?.city);







// Promises
// function greet() {
//     console.log("Hello");
// }
// setInterval(greet, 1000);


// function greet(resolve, reject) {
//     var isInternetAvailable = false;
//     if (isInternetAvailable === true) {
//         resolve(["Apple", "Banana"])
//     } else {
//         reject("Something went wrong")
//     }
// }

// function success(result) {
//     console.log(result);
// }
// function error(message) {
//     console.log(message);
// }

// new Promise(greet).then(success).catch(error)



function success(result) {
    console.log(result);
}
function error(message) {
    console.log(message);
}
fetch("https://jsonplaceholder.org/users").then(success).catch(error)