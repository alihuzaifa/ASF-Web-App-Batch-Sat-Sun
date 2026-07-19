// student.js - basic CRUD for students

// db ko credentials.js se import karo (default export hai, isliye braces nahi)
import db from "./credentials.js";

// -------- har element ko ek variable me le lo --------
const nameInput = document.getElementById("name");
const rollNoInput = document.getElementById("rollNo");
const classInput = document.getElementById("className");
const table = document.getElementById("studentTable");

// abhi konsi row edit ho rahi hai uski id yahan rakhenge
// null = naya record (add mode), koi number = us row ko update karna hai
let editId = null;

// supabase se aaya hua saara data yahan rakhenge
// (edit ke waqt id se record yahin se dhoondenge, HTML me naam daalne ki zaroorat nahi)
let students = [];

// -------- READ: table me data show karo --------
async function loadStudents() {
  // supabase se data get karo
  const { data, error } = await db.from("students").select("*");

  if (error) {
    alert("Error: " + error.message);
    return;
  }

  // aaya hua data yaad rakho (edit ke waqt id se dhoondenge)
  students = data;

  // pehle table khali karo (purana data hatao)
  table.innerHTML = "";

  // for loop chala kar seedha table ke innerHTML me row add karo
  // onclick me sirf id (number) bhej rahe hain - koi text nahi,
  // isliye apostrophe waala issue nahi aayega
  for (let i = 0; i < data.length; i++) {
    const s = data[i];
    table.innerHTML += "<tr>" +
      "<td>" + s.id + "</td>" +
      "<td>" + s.name + "</td>" +
      "<td>" + s.roll_no + "</td>" +
      "<td>" + s.class + "</td>" +
      "<td>" +
        "<button class='btn-edit' onclick='editStudent(" + s.id + ")'>Edit</button>" +
        "<button class='btn-delete' onclick='deleteStudent(" + s.id + ")'>Delete</button>" +
      "</td>" +
      "</tr>";
  }
}

// -------- CREATE + UPDATE: save button --------
async function saveStudent() {
  const name = nameInput.value;
  const rollNo = rollNoInput.value;
  const className = classInput.value;

  if (name === "" || rollNo === "" || className === "") {
    alert("Sab fields bharo");
    return;
  }

  if (editId === null) {
    // naya record add karo (CREATE)
    const { error } = await db.from("students").insert([
      { name: name, roll_no: rollNo, class: className },
    ]);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
  } else {
    // purana record update karo (UPDATE)
    const { error } = await db
      .from("students")
      .update({ name: name, roll_no: rollNo, class: className })
      .eq("id", editId);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
  }

  clearForm();
  loadStudents();
}

// -------- EDIT: form me data bhar do --------
function editStudent(id) {
  // id se record array me se dhoondo
  const s = students.find(function (x) {
    return x.id === id;
  });
  if (!s) return;

  editId = id; // yaad rakho konsi row update karni hai
  nameInput.value = s.name;
  rollNoInput.value = s.roll_no;
  classInput.value = s.class;
}

// -------- DELETE --------
async function deleteStudent(id) {
  const ok = confirm("Delete karna hai?");
  if (!ok) return;

  const { error } = await db.from("students").delete().eq("id", id);
  if (error) {
    alert("Error: " + error.message);
    return;
  }
  loadStudents();
}

// -------- form khali karo --------
function clearForm() {
  editId = null; // wapas add mode par le aao
  nameInput.value = "";
  rollNoInput.value = "";
  classInput.value = "";
}

// module me functions global nahi hote, isliye window pe daal do
// taake HTML ke onclick="..." kaam karen
window.saveStudent = saveStudent;
window.editStudent = editStudent;
window.deleteStudent = deleteStudent;

// page load hote hi data le aao
loadStudents();
