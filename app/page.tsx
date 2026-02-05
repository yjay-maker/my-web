"use client";

import { useEffect, useMemo, useState } from "react";
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

function speak(text: string) {
  if (typeof window === "undefined") return;

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export default function Home() {
  // =========================
  // 상태 메시지
  // =========================
  const [status, setStatus] = useState<string>("");

  // =========================
  // A) 학습자 관리
  // =========================
  const [learners, setLearners] = useState<Learner[]>([]);
  const [currentLearner, setCurrentLearner] = useState<Learner | null>(null);

  // 생성 모달
  const [createOpen, setCreateOpen] = useState(false);
  const [createNickname, setCreateNickname] = useState("");

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<Learner | null>(null);

  // =========================
  // B) 단어 + 발음
  // =========================
  const [words, setWords] = useState<WordRow[]>([]);
  const [wordsStatus, setWordsStatus] = useState<string>("");

  const [repeatOn, setRepeatOn] = useState(false);
  const [repeatIndex, setRepeatIndex] = useState<number>(0);

  // -------------------------
  // learners 불러오기
  // -------------------------
  const loadLearners = async () => {
    const { data, error } = await supabase
      .from("learners")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`학습자 목록 로드 실패: ${error.message}`);
      return;
    }
    setLearners((data ?? []) as Learner[]);
  };

  // -------------------------
  // 처음 로드: 학습자 목록 + 마지막 선택 학습자 복원
  // -------------------------
  useEffect(() => {
    const init = async () => {
      await loadLearners();

      const savedId = localStorage.getItem("learner_id");
      if (!savedId) return;

      const { data, error } = await supabase
        .from("learners")
        .select("*")
        .eq("id", savedId)
        .single();

      if (!error && data) {
        setCurrentLearner(data as Learner);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // words 10개 불러오기
  // -------------------------
  useEffect(() => {
    const loadWords = async () => {
      setWordsStatus("단어 불러오는 중...");

      const { data, error } = await supabase
        .from("words")
        .select("id, word, meaning_ko, grade_level, image_url, audio_url")
        .eq("grade_level", 3)
        .limit(10);

      if (error) {
        setWordsStatus(`단어 로드 실패: ${error.message}`);
        return;
      }

      setWords((data ?? []) as WordRow[]);
      setWordsStatus(`단어 ${(data ?? []).length}개 로드 완료`);
    };

    loadWords();
  }, []);

  // -------------------------
  // 반복 재생
  // -------------------------
  useEffect(() => {
    if (!repeatOn) return;
    if (words.length === 0) return;

    let cancelled = false;

    const playLoop = () => {
      if (cancelled) return;

      const w = words[repeatIndex % words.length];
      speak(w.word);

      const t = window.setTimeout(() => {
        if (cancelled) return;
        setRepeatIndex((prev) => (prev + 1) % words.length);
      }, 2000);

      return () => window.clearTimeout(t);
    };

    const cleanup = playLoop();

    return () => {
      cancelled = true;
      window.speechSynthesis.cancel();
      if (typeof cleanup === "function") cleanup();
    };
  }, [repeatOn, repeatIndex, words]);

  // -------------------------
  // 학습자 선택
  // -------------------------
  const selectLearner = (l: Learner) => {
    setCurrentLearner(l);
    localStorage.setItem("learner_id", l.id);
    setStatus(`학습자 선택: ${l.nickname}`);
  };

  const clearSelectedLearner = () => {
    setCurrentLearner(null);
    localStorage.removeItem("learner_id");
    setStatus("현재 선택된 학습자를 해제했어.");
  };

  // -------------------------
  // 학습자 생성 (모달)
  // -------------------------
  const openCreate = () => {
    setCreateNickname("");
    setCreateOpen(true);
    setStatus("");
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const createLearner = async () => {
    const name = createNickname.trim();
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

        // 목록 갱신 + 자동 선택
        await loadLearners();
        selectLearner(learner);

        setCreateOpen(false);
        setStatus(`학습자 생성 완료: ${learner.nickname}`);
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

  // -------------------------
  // 학습자 삭제 (확인 모달)
  // -------------------------
  const openDeleteConfirm = (l: Learner) => {
    setDeleteTarget(l);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
  };

  const deleteLearner = async () => {
    if (!deleteTarget) return;

    setStatus("학습자 삭제 중...");

    const { error } = await supabase
      .from("learners")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      setStatus(
        `삭제 실패: ${error.message} (Supabase learners RLS에 DELETE 정책이 있는지 확인해줘)`,
      );
      return;
    }

    // 현재 선택된 학습자를 삭제한 경우 선택 해제
    if (currentLearner?.id === deleteTarget.id) {
      clearSelectedLearner();
    }

    setDeleteTarget(null);
    await loadLearners();
    setStatus("삭제 완료");
  };

  const selectedId = currentLearner?.id ?? null;

  const learnersEmpty = useMemo(() => learners.length === 0, [learners]);

  return (
    <main className="p-8 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">영어 단어 학습 (Supabase)</h1>

      {/* 상태 메시지 */}
      {status && (
        <div className="rounded-md border bg-yellow-50 p-3 text-sm">
          상태: {status}
        </div>
      )}

      {/* =========================
          학습자 선택 UI
         ========================= */}
      <section className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">학습자 선택</h2>

          <div className="flex items-center gap-2">
            {currentLearner && (
              <button
                onClick={clearSelectedLearner}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                선택 해제
              </button>
            )}

            <button
              onClick={openCreate}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              + 학습자 생성
            </button>
          </div>
        </div>

        {learnersEmpty ? (
          <p className="text-gray-600">
            아직 학습자가 없어. “학습자 생성”으로 먼저 만들어줘.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {learners.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <button
                  onClick={() => selectLearner(l)}
                  className={`rounded-md border px-3 py-2 text-sm hover:bg-gray-50 ${
                    selectedId === l.id
                      ? "bg-gray-900 text-white hover:bg-gray-900"
                      : ""
                  }`}
                  aria-label={`${l.nickname} 선택`}
                >
                  {l.nickname}
                </button>

                <button
                  onClick={() => openDeleteConfirm(l)}
                  className="rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                  aria-label={`${l.nickname} 삭제`}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {currentLearner ? (
          <p className="text-sm text-gray-700">
            현재 선택:{" "}
            <span className="font-semibold">{currentLearner.nickname}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-700">
            현재 선택: <span className="font-semibold">없음</span>
          </p>
        )}
      </section>

      {/* =========================
          단어 10개 + 발음
         ========================= */}
      <section className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">오늘의 단어 10개</h2>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // 반복 시작 시 0부터
                setRepeatIndex(0);
                setRepeatOn((v) => !v);
              }}
              className={`rounded-md border px-3 py-2 text-sm ${
                repeatOn ? "bg-gray-900 text-white" : "hover:bg-gray-50"
              }`}
            >
              🔁 반복 {repeatOn ? "ON" : "OFF"}
            </button>

            <p className="text-xs text-gray-600">{wordsStatus}</p>
          </div>
        </div>

        {words.length === 0 ? (
          <p className="text-gray-600">
            단어가 아직 안 보여. (잠시만 기다리거나 상태 메시지를 확인해줘)
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {words.map((w) => (
              <li
                key={w.id}
                className="rounded-md border p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-lg font-bold">{w.word}</div>
                  <div className="text-gray-700">{w.meaning_ko}</div>
                </div>

                <button
                  onClick={() => speak(w.word)}
                  className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                  aria-label={`${w.word} 발음 듣기`}
                >
                  🔊 발음
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* =========================
          생성 모달
         ========================= */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">학습자 생성</h3>
              <button
                onClick={closeCreate}
                className="rounded-md px-2 py-1 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <input
              value={createNickname}
              onChange={(e) => setCreateNickname(e.target.value)}
              placeholder="닉네임 (예: 민준)"
              className="w-full rounded-md border px-3 py-2"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  createLearner();
              }}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={closeCreate}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={createLearner}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                생성
              </button>
            </div>

            <p className="text-xs text-gray-600">
              * 지금은 로그인 없이 쓰는 MVP라, 학습자는 모두 목록에 보이도록
              되어 있어.
            </p>
          </div>
        </div>
      )}

      {/* =========================
          삭제 확인 모달
         ========================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg space-y-3">
            <h3 className="font-semibold">학습자 삭제</h3>

            <p className="text-sm text-gray-700">
              정말로{" "}
              <span className="font-semibold">{deleteTarget.nickname}</span>{" "}
              학습자를 삭제할까?
            </p>
            <p className="text-xs text-gray-500">
              삭제하면 되돌릴 수 없어. (학습 기록 연결은 다음 단계에서 함께
              설계할 거야)
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeDeleteConfirm}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={deleteLearner}
                className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
