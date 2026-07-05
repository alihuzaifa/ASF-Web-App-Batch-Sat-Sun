const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    , 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
]
// let finalNumbers = []

// for (let index = 0; index < numbers.length; index++) {
//     console.log(numbers[index]);

//     finalNumbers.push(numbers[index] * 10)
// }

// console.log(finalNumbers);

// Map Method
// function callback(item, index, array) {
//     return item * 10
// }

// const finalNumbers = numbers.map(callback)
// console.log(finalNumbers);


// const finalNumbers = numbers.map(item => item * 10)
// console.log(finalNumbers);

// Filter

// const finalNumbers = []
// for (var i = 0; i < numbers.length; i++) {
//     if (numbers[i] % 2 !== 0) {
//         finalNumbers.push(numbers[i])
//     }
// }


// const finalNumbers = numbers.filter(item => item % 2 !== 0)
// console.log(finalNumbers);
const total = numbers.reduce((initialValue, item) => initialValue + item, 0)
console.log(total);


var item = document.getElementById("item")
var charges = document.getElementById("charges")

const allItems = []

function addItem() {
    const obj = {
        name: item.ariaValueMax,
        charges: charges.value
    }
    allItems.push(obj)
    item.value = ""
    charges.value = ""
}

function deleteItem(index) {
    const filteredArrayItems = allItems.filter((_, i) => {
        return i !== index
    })
}