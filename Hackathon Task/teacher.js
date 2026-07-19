// teacher.js - basic CRUD for teachers

// db ko credentials.js se import karo (default export hai, isliye braces nahi)
import db from "./credentials.js";

// -------- har element ko ek variable me le lo --------
const nameInput = document.getElementById("name");
const subjectInput = document.getElementById("subject");
const emailInput = document.getElementById("email");
const table = document.getElementById("teacherTable");

// abhi konsi row edit ho rahi hai uski id yahan rakhenge
// null = naya record (add mode), koi number = us row ko update karna hai
let editId = null;

// supabase se aaya hua saara data yahan rakhenge
// (edit ke waqt id se record yahin se dhoondenge, HTML me naam daalne ki zaroorat nahi)
let teachers = [];

// -------- READ: table me data show karo --------
async function loadTeachers() {
  // supabase se data get karo
  const { data, error } = await db.from("teachers").select("*");

  if (error) {
    alert("Error: " + error.message);
    return;
  }

  // aaya hua data yaad rakho (edit ke waqt id se dhoondenge)
  teachers = data;

  // pehle table khali karo (purana data hatao)
  table.innerHTML = "";

  // for loop chala kar seedha table ke innerHTML me row add karo
  // onclick me sirf id (number) bhej rahe hain - koi text nahi,
  // isliye apostrophe waala issue nahi aayega
  for (let i = 0; i < data.length; i++) {
    const t = data[i];
    table.innerHTML += "<tr>" +
      "<td>" + t.id + "</td>" +
      "<td>" + t.name + "</td>" +
      "<td>" + t.subject + "</td>" +
      "<td>" + t.email + "</td>" +
      "<td>" +
        "<button class='btn-edit' onclick='editTeacher(" + t.id + ")'>Edit</button>" +
        "<button class='btn-delete' onclick='deleteTeacher(" + t.id + ")'>Delete</button>" +
      "</td>" +
      "</tr>";
  }
}

// -------- CREATE + UPDATE: save button --------
async function saveTeacher() {
  const name = nameInput.value;
  const subject = subjectInput.value;
  const email = emailInput.value;

  if (name === "" || subject === "" || email === "") {
    alert("Sab fields bharo");
    return;
  }

  if (editId === null) {
    // naya record add karo (CREATE)
    const { error } = await db.from("teachers").insert([
      { name: name, subject: subject, email: email },
    ]);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
  } else {
    // purana record update karo (UPDATE)
    const { error } = await db
      .from("teachers")
      .update({ name: name, subject: subject, email: email })
      .eq("id", editId);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
  }

  clearForm();
  loadTeachers();
}

// -------- EDIT: form me data bhar do --------
function editTeacher(id) {
  // id se record array me se dhoondo
  const t = teachers.find(function (x) {
    return x.id === id;
  });
  if (!t) return;

  editId = id; // yaad rakho konsi row update karni hai
  nameInput.value = t.name;
  subjectInput.value = t.subject;
  emailInput.value = t.email;
}

// -------- DELETE --------
async function deleteTeacher(id) {
  const ok = confirm("Delete karna hai?");
  if (!ok) return;

  const { error } = await db.from("teachers").delete().eq("id", id);
  if (error) {
    alert("Error: " + error.message);
    return;
  }
  loadTeachers();
}

// -------- form khali karo --------
function clearForm() {
  editId = null; // wapas add mode par le aao
  nameInput.value = "";
  subjectInput.value = "";
  emailInput.value = "";
}

// module me functions global nahi hote, isliye window pe daal do
// taake HTML ke onclick="..." kaam karen
window.saveTeacher = saveTeacher;
window.editTeacher = editTeacher;
window.deleteTeacher = deleteTeacher;

// page load hote hi data le aao
loadTeachers();
