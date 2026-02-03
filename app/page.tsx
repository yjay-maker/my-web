"use client";

import { useEffect, useState } from "react";
import Button from "./components/Button";

type Todo = {
  id: string;
  text: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [todos, setTodos] = useState<Todo[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("todos");
    return saved ? (JSON.parse(saved) as Todo[]) : [];
  });

  useEffect(() => {
    localStorage.setItem("todos", JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    const text = input.trim();
    if (!text) return;

    setTodos((prev) => [{ id: crypto.randomUUID(), text }, ...prev]);
    setInput("");
  };

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <main className="p-8">
      <h1 className="mb-6 text-2xl font-bold">My Todo</h1>

      <div className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="할 일을 입력하세요"
          className="w-full rounded-md border px-3 py-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              addTodo();
            }
          }}
        />
        <Button label="추가" onClick={addTodo} />
      </div>

      {todos.length === 0 ? (
        <p className="text-gray-600">아직 할 일이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span>{t.text}</span>

              <button
                onClick={() => removeTodo(t.id)}
                className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                aria-label="삭제"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
