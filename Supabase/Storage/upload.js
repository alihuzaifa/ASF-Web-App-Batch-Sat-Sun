import supabase from './credentials.js';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const uploadBtn = document.getElementById('uploadBtn');
const uploadAlert = document.getElementById('uploadAlert');
const uploadStats = document.getElementById('uploadStats');
const fileCount = document.getElementById('fileCount');
const clearAllBtn = document.getElementById('clearAll');

let files = [];

function showAlert(message, type = 'error') {
  uploadAlert.textContent = message;
  uploadAlert.className = `alert alert-${type} show`;
}

function hideAlert() {
  uploadAlert.classList.remove('show');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    showAlert(`"${file.name}" is not a supported image format.`);
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    showAlert(`"${file.name}" exceeds the 5 MB limit.`);
    return false;
  }
  return true;
}

function addFiles(newFiles) {
  hideAlert();
  const valid = Array.from(newFiles).filter(isValidFile);
  if (!valid.length) return;

  const existing = new Set(files.map((f) => `${f.name}-${f.size}`));
  const unique = valid.filter((f) => !existing.has(`${f.name}-${f.size}`));

  if (unique.length < valid.length) {
    showAlert('Some duplicate files were skipped.', 'info');
  }

  files = [...files, ...unique];
  renderPreviews();
}

function removeFile(index) {
  files.splice(index, 1);
  renderPreviews();
  hideAlert();
}

async function clearAll() {
  files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
  files = [];
  renderPreviews();
  hideAlert();
}

function renderPreviews() {
  previewGrid.innerHTML = '';

  files.forEach((file, index) => {
    if (!file.previewUrl) {
      file.previewUrl = URL.createObjectURL(file);
    }

    const card = document.createElement('div');
    card.className = 'preview-card';
    card.innerHTML = `
      <img src="${file.previewUrl}" alt="${file.name}" />
      <div class="preview-overlay">
        <button type="button" class="preview-remove" aria-label="Remove ${file.name}">✕</button>
      </div>
      <div class="preview-info">
        <span class="preview-name" title="${file.name}">${file.name}</span>
        <span class="preview-size">${formatSize(file.size)}</span>
      </div>
    `;

    card.querySelector('.preview-remove').addEventListener('click', () => removeFile(index));
    previewGrid.appendChild(card);
  });

  const count = files.length;
  uploadStats.hidden = count === 0;
  fileCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
  uploadBtn.disabled = count === 0;
}

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((event) => {
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((event) => {
  dropzone.addEventListener(event, () => {
    dropzone.classList.remove('drag-over');
  });
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

clearAllBtn.addEventListener('click', clearAll);

async function simulateUpload() {
  if (!files.length) return;

  // uploadBtn.disabled = true;
  // uploadBtn.classList.add('is-loading');
  // uploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';

  const { data, error } = await supabase.storage.from('avatars').upload(`images/profile/${new Date().getTime()}`, files[0]);
  console.log('Simulating upload for files:', data);
  clearAll()
}

uploadBtn.addEventListener('click', simulateUpload);



// insert into
//   storage.buckets (id, name)
// values
//   ('avatars', 'avatars');
