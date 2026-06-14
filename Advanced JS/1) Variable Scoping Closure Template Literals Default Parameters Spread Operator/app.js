// Variable Scoping


// for (var i = 1; i < 5; i++) {
//     var myName = "Aslam"
// }

// function check() {
//     var myName = "Sadiq";
// }

// check()

// console.log(myName);




// let myName = "Ali Huzaifa";
// let myName = "Ali Huzaifa";
// console.log(myName);


// if (true) {
//     let message = "Hello World"
//     console.log(message);

// }
// if (true) {
//     let message = "Hello World2"
//     console.log(message);

// }

// function name() {
//      let message = "Hello World3"
//     console.log(message);

// }
// name()

// console.log(message);



const city = "Karachi";
city = "Lahore"
console.log(city);


// // Closure
// function parent() {
//     var message = "Hello World";

//     return function child() {
//         console.log(message);
//     }

// }

// var output = parent();
// output()





// Template Literals
// let message = `Hello    



// World`;
// console.log(message);




// const person = {
//     name: 'Ali',
//     age: 25,
//     education: "Graduate"
// }
// console.log(person.name);
// console.log(person.age);
// console.log(person.education);

// const { name, age, education } = person;
// console.log(name);
// console.log(age);
// console.log(education);

// let fruits = ["Apple", "Mango", "Banana"]
// let [fruit1, fruit2, fruit3] = fruits
// console.log(fruit1, fruit2, fruit3);




// Default Parameters
// function sum(num1 = 0, num2 = 0) {
//     return num1 + num2
// };

// const total = sum()
// console.log(total);




// Spread Operator




let fruits1 = ["Apple", "Banana", "Mango"]
let fruits2 = ["Apple", "Banana", "Mango"]
let combinedArray = [...fruits1, ...fruits2]
console.log(combinedArray);
