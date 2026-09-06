'use client';

import { useEffect, useState } from 'react';
import { createTodo, deleteTodo, listTodos, updateTodo, type Todo } from '@/lib/api';

type Filter = 'all' | 'active' | 'completed';

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  useEffect(() => {
    listTodos()
      .then(setTodos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach the API'))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await run(async () => {
      const created = await createTodo(title);
      setTodos((prev) => [...prev, created]);
      setTitle('');
    });
  };

  const handleToggle = async (todo: Todo) => {
    // Flip immediately so the checkbox feels instant, then roll back if the API rejects it.
    const next = !todo.completed;
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: next } : t)));
    setError(null);
    try {
      const updated = await updateTodo(todo.id, { completed: next });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)));
      setError(e instanceof Error ? e.message : 'Could not update the todo');
    }
  };

  const handleDelete = (id: number) =>
    run(async () => {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    });

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.title);
  };

  const saveEdit = async (id: number) => {
    if (!editText.trim()) return;
    await run(async () => {
      const updated = await updateTodo(id, { title: editText });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingId(null);
    });
  };

  const visible = todos.filter((t) =>
    filter === 'active' ? !t.completed : filter === 'completed' ? t.completed : true,
  );
  const remaining = todos.filter((t) => !t.completed).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Todos
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" data-testid="remaining">
          {remaining} {remaining === 1 ? 'task' : 'tasks'} remaining
        </p>
      </header>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          data-testid="new-todo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-300"
        />
        <button
          type="submit"
          data-testid="add-todo"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
          disabled={!title.trim()}
        >
          Add
        </button>
      </form>

      {error && (
        <p
          data-testid="error"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex gap-1">
        {(['all', 'active', 'completed'] as Filter[]).map((f) => (
          <button
            key={f}
            data-testid={`filter-${f}`}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f
                ? 'bg-neutral-900 text-white dark:bg-neutral-50 dark:text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p data-testid="empty" className="text-sm text-neutral-500">
          Nothing here yet.
        </p>
      ) : (
        <ul data-testid="todo-list" className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {visible.map((todo) => (
            <li key={todo.id} data-testid="todo-item" className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                data-testid={`toggle-${todo.id}`}
                checked={todo.completed}
                onChange={() => handleToggle(todo)}
                className="size-4 shrink-0 accent-neutral-900 dark:accent-neutral-100"
              />

              {editingId === todo.id ? (
                <input
                  autoFocus
                  data-testid={`edit-input-${todo.id}`}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => saveEdit(todo.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(todo.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                />
              ) : (
                <span
                  data-testid={`title-${todo.id}`}
                  onDoubleClick={() => startEdit(todo)}
                  className={`flex-1 text-sm ${
                    todo.completed
                      ? 'text-neutral-400 line-through dark:text-neutral-600'
                      : 'text-neutral-900 dark:text-neutral-100'
                  }`}
                >
                  {todo.title}
                </span>
              )}

              <button
                data-testid={`edit-${todo.id}`}
                onClick={() => (editingId === todo.id ? saveEdit(todo.id) : startEdit(todo))}
                className="text-xs text-neutral-400 transition hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                {editingId === todo.id ? 'Save' : 'Edit'}
              </button>
              <button
                data-testid={`delete-${todo.id}`}
                onClick={() => handleDelete(todo.id)}
                className="text-xs text-neutral-400 transition hover:text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
