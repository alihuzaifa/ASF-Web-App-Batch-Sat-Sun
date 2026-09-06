export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const listTodos = () => request<Todo[]>('/todos');

export const createTodo = (title: string) =>
  request<Todo>('/todos', { method: 'POST', body: JSON.stringify({ title }) });

export const updateTodo = (id: number, patch: Partial<Pick<Todo, 'title' | 'completed'>>) =>
  request<Todo>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(patch) });

export const deleteTodo = (id: number) =>
  request<Todo>(`/todos/${id}`, { method: 'DELETE' });
