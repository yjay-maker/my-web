"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Learner = {
  id: string;
  nickname: string;
  join_code: string;
  created_at: string;
};

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [currentLearner, setCurrentLearner] = useState<Learner | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const savedId = localStorage.getItem("learner_id");
    if (!savedId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("learners")
        .select("*")
        .eq("id", savedId)
        .single();

      if (error) {
        setStatus(`(자동 불러오기 실패) ${error.message}`);
        return;
      }

      setCurrentLearner(data as Learner);
      setStatus("이 기기에서 마지막 학습자를 자동으로 불러왔어.");
    };

    load();
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
    <main className="p-8 max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">학습자 테스트 (Supabase)</h1>

      {/* ✅ 상태 메시지를 상단에 고정 노출 */}
      {status && (
        <div className="rounded-md border bg-yellow-50 p-3 text-sm">
          상태: {status}
        </div>
      )}

      {/* ✅ 성공하면 바로 눈에 띄게 */}
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
        <h2 className="font-semibold mb-2">2) 코드로 학습자 불러오기</h2>
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
    </main>
  );
}
