"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Learner = {
  id: string;
  nickname: string;
  join_code: string;
  created_at: string;
};

type WordRow = {
  id: string;
  word: string;
  meaning_ko: string;
  grade_level: number;
  image_url: string | null;
  audio_url: string | null;
};

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Home() {
  // =========================
  // A) 학습자(learner) 영역
  // =========================
  const [nickname, setNickname] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [currentLearner, setCurrentLearner] = useState<Learner | null>(null);
  const [status, setStatus] = useState<string>("");

  // =========================
  // B) 단어(words) 영역
  // =========================
  const [words, setWords] = useState<WordRow[]>([]);
  const [wordsStatus, setWordsStatus] = useState<string>("");

  // (선택) 이 기기에서 마지막 선택 학습자 자동 불러오기
  useEffect(() => {
    const savedId = localStorage.getItem("learner_id");
    if (!savedId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("learners")
        .select("*")
        .eq("id", savedId)
        .single();

      if (error) return;
      setCurrentLearner(data as Learner);
      setStatus("이 기기에서 마지막 학습자를 자동으로 불러왔어.");
    };

    load();
  }, []);

  // ✅ 단어 10개 불러오기 (페이지 열릴 때 1회)
  useEffect(() => {
    const loadWords = async () => {
      setWordsStatus("단어 불러오는 중...");

      // grade_level = 3 인 단어 중 10개 가져오기
      // (처음에는 단순히 created_at 기준으로 10개 가져오고,
      //  나중에 랜덤/세션 구성으로 바꿀 거야)
      const { data, error } = await supabase
        .from("words")
        .select("id, word, meaning_ko, grade_level, image_url, audio_url")
        .eq("grade_level", 3)
        .limit(10);

      if (error) {
        setWordsStatus(`단어 로드 실패: ${error.message}`);
        return;
      }

      setWords(data as WordRow[]);
      setWordsStatus(`단어 ${data?.length ?? 0}개 로드 완료`);
    };

    loadWords();
  }, []);

  const createLearner = async () => {
    const name = nickname.trim();
    if (!name) {
      setStatus("닉네임을 입력해줘.");
      return;
    }

    setStatus("학습자 생성 중...");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeJoinCode();

      const { data, error } = await supabase
        .from("learners")
        .insert({ nickname: name, join_code: code })
        .select("*")
        .single();

      if (!error && data) {
        const learner = data as Learner;
        setCurrentLearner(learner);
        localStorage.setItem("learner_id", learner.id);
        setStatus(`생성 완료! 학습 코드: ${learner.join_code}`);
        return;
      }

      if (
        !String(error?.message || "")
          .toLowerCase()
          .includes("duplicate")
      ) {
        setStatus(`생성 실패: ${error?.message || "알 수 없음"}`);
        return;
      }
    }

    setStatus("코드 생성이 여러 번 충돌했어. 다시 시도해줘.");
  };

  const findLearnerByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setStatus("학습자 코드를 입력해줘.");
      return;
    }

    setStatus("학습자 찾는 중...");

    const { data, error } = await supabase
      .from("learners")
      .select("*")
      .eq("join_code", code)
      .single();

    if (error || !data) {
      setStatus(`불러오기 실패: ${error?.message || "해당 코드 없음"}`);
      return;
    }

    const learner = data as Learner;
    setCurrentLearner(learner);
    localStorage.setItem("learner_id", learner.id);
    setStatus(`불러오기 완료! 닉네임: ${learner.nickname}`);
  };

  const clearLocal = () => {
    localStorage.removeItem("learner_id");
    setCurrentLearner(null);
    setStatus("이 기기에서만 학습자 선택을 지웠어.");
  };

  return (
    <main className="p-8 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">영어 단어 학습 (Supabase)</h1>

      {/* 상태 메시지 */}
      {status && (
        <div className="rounded-md border bg-yellow-50 p-3 text-sm">
          상태: {status}
        </div>
      )}

      {/* 현재 학습자 */}
      <div className="rounded-md border p-4">
        <h2 className="font-semibold mb-2">현재 선택된 학습자</h2>
        {currentLearner ? (
          <div className="space-y-1">
            <div>
              닉네임:{" "}
              <span className="font-semibold">{currentLearner.nickname}</span>
            </div>
            <div>
              학습 코드:{" "}
              <span className="font-mono font-semibold">
                {currentLearner.join_code}
              </span>
            </div>
            <button
              onClick={clearLocal}
              className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              이 기기에서 선택 지우기
            </button>
          </div>
        ) : (
          <p className="text-gray-600">아직 선택된 학습자가 없어.</p>
        )}
      </div>

      {/* 학습자 만들기 / 불러오기 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border p-4">
          <h2 className="font-semibold mb-2">1) 학습자 만들기</h2>
          <div className="flex gap-2">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임 (예: 민준)"
              className="w-full rounded-md border px-3 py-2"
            />
            <button
              onClick={createLearner}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              생성
            </button>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <h2 className="font-semibold mb-2">2) 코드로 불러오기</h2>
          <div className="flex gap-2">
            <input
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="6자리 코드 (예: A3K9ZQ)"
              className="w-full rounded-md border px-3 py-2"
            />
            <button
              onClick={findLearnerByCode}
              className="rounded-md bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
            >
              불러오기
            </button>
          </div>
        </div>
      </div>

      {/* ✅ 단어 10개 영역 */}
      <div className="rounded-md border p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold mb-2">오늘의 단어 10개</h2>
          <p className="text-xs text-gray-600">{wordsStatus}</p>
        </div>

        {words.length === 0 ? (
          <p className="text-gray-600">
            단어가 아직 안 보여. (잠시만 기다리거나 상태 메시지를 확인해줘)
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {words.map((w) => (
              <li key={w.id} className="rounded-md border p-3">
                <div className="text-lg font-bold">{w.word}</div>
                <div className="text-gray-700">{w.meaning_ko}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
