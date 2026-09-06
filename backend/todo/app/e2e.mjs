import { chromium } from 'playwright';

const APP = 'http://localhost:3001';
const API = 'http://localhost:3000';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

// Start from a clean API state
for (const t of await (await fetch(`${API}/todos`)).json()) {
  await fetch(`${API}/todos/${t.id}`, { method: 'DELETE' });
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(APP, { waitUntil: 'networkidle' });

check('page loads with title', (await page.title()) === 'Todo App', await page.title());
check('empty state shown', await page.getByTestId('empty').isVisible());

// CREATE
await page.getByTestId('new-todo').fill('buy milk');
await page.getByTestId('add-todo').click();
await page.getByTestId('todo-item').first().waitFor();
await page.getByTestId('new-todo').fill('write tests');
await page.getByTestId('add-todo').click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="todo-item"]').length === 2);
check('two todos rendered', (await page.getByTestId('todo-item').count()) === 2);

let apiTodos = await (await fetch(`${API}/todos`)).json();
check('todos persisted to backend', apiTodos.length === 2, JSON.stringify(apiTodos));

const [first, second] = apiTodos;

// READ / counter
check('remaining counter correct', (await page.getByTestId('remaining').textContent()).includes('2 tasks'));

// UPDATE - toggle
await page.getByTestId(`toggle-${first.id}`).click();
await page.waitForFunction(
  (id) => document.querySelector(`[data-testid="title-${id}"]`)?.className.includes('line-through'),
  first.id,
);
apiTodos = await (await fetch(`${API}/todos`)).json();
check('toggle saved to backend', apiTodos.find((t) => t.id === first.id).completed === true);
check('remaining counter updated', (await page.getByTestId('remaining').textContent()).includes('1 task'));

// UPDATE - edit title
await page.getByTestId(`edit-${second.id}`).click();
await page.getByTestId(`edit-input-${second.id}`).fill('write more tests');
await page.getByTestId(`edit-input-${second.id}`).press('Enter');
await page.waitForFunction(
  (id) => document.querySelector(`[data-testid="title-${id}"]`)?.textContent === 'write more tests',
  second.id,
);
apiTodos = await (await fetch(`${API}/todos`)).json();
check('edited title saved to backend', apiTodos.find((t) => t.id === second.id).title === 'write more tests');

// FILTER
await page.getByTestId('filter-active').click();
check('active filter shows 1', (await page.getByTestId('todo-item').count()) === 1);
await page.getByTestId('filter-completed').click();
check('completed filter shows 1', (await page.getByTestId('todo-item').count()) === 1);
await page.getByTestId('filter-all').click();
check('all filter shows 2', (await page.getByTestId('todo-item').count()) === 2);

// Reload = data really came from the API, not local state
await page.reload({ waitUntil: 'networkidle' });
await page.getByTestId('todo-item').first().waitFor();
check('todos survive reload (served by API)', (await page.getByTestId('todo-item').count()) === 2);

// DELETE
await page.getByTestId(`delete-${first.id}`).click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="todo-item"]').length === 1);
apiTodos = await (await fetch(`${API}/todos`)).json();
check('delete removed from backend', apiTodos.length === 1 && apiTodos[0].id === second.id);

// Validation: Add disabled on empty input
await page.getByTestId('new-todo').fill('   ');
check('add button disabled for blank title', await page.getByTestId('add-todo').isDisabled());

// Console must be clean for all normal interactions (checked before we deliberately break the API)
check('no console errors during normal use', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

// Error surface when API is unreachable
await page.route(`${API}/todos`, (r) => r.abort());
await page.getByTestId('new-todo').fill('should fail');
await page.getByTestId('add-todo').click();
await page.getByTestId('error').waitFor({ timeout: 5000 });
check('API failure shows error banner', await page.getByTestId('error').isVisible());
await page.unroute(`${API}/todos`);

await page.screenshot({ path: 'todo-app.png', fullPage: true });
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
