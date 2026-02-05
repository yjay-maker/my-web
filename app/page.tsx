"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type QuizAttemptRow = {
  id: string;
  learner_id: string;
  score: number;
  total: number;
  created_at: string;
};

type QuizQuestion = {
  id: string;
  prompt: string; // 문제(뜻)
  answer: string; // 정답(영어)
  choices: string[]; // 4지선다
};

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuiz(words: WordRow[]): QuizQuestion[] {
  const pool = words.map((w) => w.word);
  return words.map((w) => {
    const wrong = shuffle(pool.filter((x) => x !== w.word)).slice(0, 3);
    const choices = shuffle([w.word, ...wrong]);
    return {
      id: w.id,
      prompt: w.meaning_ko || "(뜻 없음)",
      answer: w.word,
      choices,
    };
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function Home() {
  // 상태 메시지
  const [status, setStatus] = useState<string>("");

  // A) 학습자
  const [learners, setLearners] = useState<Learner[]>([]);
  const [currentLearner, setCurrentLearner] = useState<Learner | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createNickname, setCreateNickname] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Learner | null>(null);

  // B) 단어
  const [words, setWords] = useState<WordRow[]>([]);
  const [wordsStatus, setWordsStatus] = useState<string>("");

  // ✅ 반복 모드(설정) + 재생 상태(실행)
  const [repeatOn, setRepeatOn] = useState(false); // 설정 스위치 (ON이어도 자동재생 X)
  const [repeatMode, setRepeatMode] = useState<"none" | "word" | "all">("none");
  const [repeatWordId, setRepeatWordId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);

  // C) 퀴즈
  const [view, setView] = useState<"learn" | "quiz" | "result">("learn");
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);

  // ✅ “선택(미제출)”과 “제출(채점)” 분리
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submittedChoice, setSubmittedChoice] = useState<string | null>(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [quizStatus, setQuizStatus] = useState("");

  // 최근 점수
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);

  const learnersEmpty = useMemo(() => learners.length === 0, [learners]);
  const selectedId = currentLearner?.id ?? null;

  // --- TTS helpers (Promise 기반) ---
  const speakOnce = (text: string) => {
    if (typeof window === "undefined") return Promise.resolve();

    return new Promise<void>((resolve) => {
      try {
        window.speechSynthesis.cancel();

        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 0.95;

        const done = () => resolve();
        u.onend = done;
        u.onerror = done;

        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  };

  const stopAudio = () => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setPlayingWordId(null);
  };

  // 반복 루프 제어용 토큰
  const loopTokenRef = useRef(0);

  const stopRepeat = () => {
    loopTokenRef.current += 1; // 기존 루프 종료
    stopAudio();
    setRepeatMode("none");
    setRepeatWordId(null);
  };

  // learners 로드
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

  // attempts 로드
  const loadAttempts = async (learnerId: string) => {
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("learner_id", learnerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setQuizStatus(`기록 로드 실패: ${error.message}`);
      return;
    }
    setAttempts((data ?? []) as QuizAttemptRow[]);
  };

  // 첫 로드
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
        await loadAttempts((data as Learner).id);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // words 로드
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

  // ✅ repeatOn이 OFF로 바뀌면 반복 재생도 같이 정지
  useEffect(() => {
    if (!repeatOn) {
      stopRepeat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatOn]);

  // ✅ 반복 재생 루프: mode(word/all)일 때만 돌아감
  useEffect(() => {
    const run = async () => {
      if (!repeatOn) return;
      if (repeatMode === "none") return;
      if (words.length === 0) return;

      const token = ++loopTokenRef.current;

      // “단어 반복”
      if (repeatMode === "word") {
        const w = words.find((x) => x.id === repeatWordId);
        if (!w) return;

        while (
          loopTokenRef.current === token &&
          repeatOn &&
          repeatMode === "word"
        ) {
          setIsPlaying(true);
          setPlayingWordId(w.id);

          await speakOnce(w.word);
          if (loopTokenRef.current !== token) break;

          // 텀 (발음 끝난 뒤 잠깐 쉬기)
          await wait(900);
        }

        if (loopTokenRef.current === token) {
          setIsPlaying(false);
          setPlayingWordId(null);
        }
        return;
      }

      // “전체 듣기 반복”
      if (repeatMode === "all") {
        let i = 0;

        while (
          loopTokenRef.current === token &&
          repeatOn &&
          repeatMode === "all"
        ) {
          const w = words[i % words.length];
          setIsPlaying(true);
          setPlayingWordId(w.id);

          await speakOnce(w.word);
          if (loopTokenRef.current !== token) break;

          await wait(900);

          i = (i + 1) % words.length;
        }

        if (loopTokenRef.current === token) {
          setIsPlaying(false);
          setPlayingWordId(null);
        }
      }
    };

    run();

    return () => {
      // effect가 다시 실행될 때 이전 루프는 token 변경으로 종료됨
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatOn, repeatMode, repeatWordId, words]);

  // 학습자 선택
  const selectLearner = async (l: Learner) => {
    setCurrentLearner(l);
    localStorage.setItem("learner_id", l.id);
    setStatus(`학습자 선택: ${l.nickname}`);
    await loadAttempts(l.id);
  };

  const clearSelectedLearner = () => {
    setCurrentLearner(null);
    localStorage.removeItem("learner_id");
    setStatus("현재 선택된 학습자를 해제했어.");
  };

  // 학습자 생성
  const openCreate = () => {
    setCreateNickname("");
    setCreateOpen(true);
    setStatus("");
  };

  const closeCreate = () => setCreateOpen(false);

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

        await loadLearners();
        await selectLearner(learner);

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

  // 삭제 확인
  const openDeleteConfirm = (l: Learner) => setDeleteTarget(l);
  const closeDeleteConfirm = () => setDeleteTarget(null);

  const deleteLearner = async () => {
    if (!deleteTarget) return;

    setStatus("학습자 삭제 중...");

    const { error } = await supabase
      .from("learners")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      setStatus(`삭제 실패: ${error.message}`);
      return;
    }

    if (currentLearner?.id === deleteTarget.id) {
      clearSelectedLearner();
    }

    setDeleteTarget(null);
    await loadLearners();
    setStatus("삭제 완료");
  };

  // ✅ 발음 버튼 클릭 동작(반복/단발 분기)
  const onClickListenWord = async (w: WordRow) => {
    if (!repeatOn) {
      // 반복 OFF: 그냥 1번만 재생
      stopRepeat();
      setIsPlaying(true);
      setPlayingWordId(w.id);
      await speakOnce(w.word);
      setIsPlaying(false);
      setPlayingWordId(null);
      return;
    }

    // 반복 ON: 해당 단어 반복 토글
    const isSameWordRepeating = repeatMode === "word" && repeatWordId === w.id;
    if (isSameWordRepeating) {
      stopRepeat(); // 다시 누르면 멈춤
      return;
    }

    // 다른 반복(전체/다른 단어) 중이면 끊고 이 단어로 전환
    stopRepeat();
    setRepeatWordId(w.id);
    setRepeatMode("word");
  };

  // ✅ 전체 듣기 버튼
  const onClickListenAll = async () => {
    if (!repeatOn) {
      // 반복 OFF: 전체를 1회만 순서대로 재생
      stopRepeat();
      if (words.length === 0) return;

      loopTokenRef.current += 1;
      const token = loopTokenRef.current;

      setIsPlaying(true);
      for (const w of words) {
        if (loopTokenRef.current !== token) break;
        setPlayingWordId(w.id);
        await speakOnce(w.word);
        await wait(900);
      }

      if (loopTokenRef.current === token) {
        setIsPlaying(false);
        setPlayingWordId(null);
      }
      return;
    }

    // 반복 ON: 전체 반복 토글
    if (repeatMode === "all") {
      stopRepeat();
      return;
    }

    stopRepeat();
    setRepeatMode("all");
  };

  // 퀴즈 시작
  const startQuiz = () => {
    if (!currentLearner) {
      setQuizStatus("먼저 학습자를 선택해줘.");
      return;
    }
    if (words.length < 4) {
      setQuizStatus("퀴즈를 만들기엔 단어가 부족해. (최소 4개 필요)");
      return;
    }

    // 퀴즈 시작 시 오디오 정리
    stopRepeat();

    const q = buildQuiz(words);
    setQuiz(q);
    setQIndex(0);

    setSelectedChoice(null);
    setSubmittedChoice(null);

    setCorrectCount(0);
    setQuizStatus("");
    setView("quiz");
  };

  const currentQ = quiz[qIndex];
  const totalQ = quiz.length;

  const onSelectChoice = (c: string) => {
    if (submittedChoice) return; // 이미 제출했으면 선택 변경 못하게(실수 방지)
    setSelectedChoice(c);
  };

  const onSubmitChoice = () => {
    if (!currentQ) return;
    if (!selectedChoice) return;

    setSubmittedChoice(selectedChoice);

    if (selectedChoice === currentQ.answer) {
      setCorrectCount((v) => v + 1);
    }
  };

  const onNextQuestion = () => {
    if (!currentQ) return;

    // 다음 문제로
    const next = qIndex + 1;
    if (next >= totalQ) {
      setView("result");
      return;
    }

    setQIndex(next);
    setSelectedChoice(null);
    setSubmittedChoice(null);
  };

  const saveResult = async () => {
    if (!currentLearner) return;

    setQuizStatus("점수 저장 중...");

    const { error } = await supabase.from("quiz_attempts").insert({
      learner_id: currentLearner.id,
      score: correctCount,
      total: quiz.length,
    });

    if (error) {
      setQuizStatus(`저장 실패: ${error.message}`);
      return;
    }

    setQuizStatus("저장 완료! 🎀");
    await loadAttempts(currentLearner.id);
  };

  const backToLearn = () => {
    setView("learn");
    setQuiz([]);
    setQIndex(0);
    setSelectedChoice(null);
    setSubmittedChoice(null);
    setCorrectCount(0);
    setQuizStatus("");
  };

  // 버튼 활성 색상 판단
  const isWordRepeating = (id: string) =>
    repeatOn && repeatMode === "word" && repeatWordId === id;
  const isAllRepeating = repeatOn && repeatMode === "all";

  return (
    <main className="min-h-screen bg-pink-50 p-6 flex justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <header className="text-center space-y-1">
          <h1 className="text-3xl font-extrabold text-pink-600">
            🌸 영어 단어 놀이 🌸
          </h1>
          <p className="text-sm text-pink-400">오늘도 즐겁게 공부해요!</p>
        </header>

        {/* 상태 메시지 */}
        {status && (
          <div className="rounded-2xl bg-white p-4 shadow-md border border-pink-100 text-sm">
            <span className="font-semibold text-pink-600">알림</span> · {status}
          </div>
        )}

        {/* 학습자 선택 */}
        <section className="rounded-2xl bg-white p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-pink-600">👧 학습자</h2>

            <div className="flex items-center gap-2">
              {currentLearner && (
                <button
                  onClick={clearSelectedLearner}
                  className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-500 hover:bg-pink-50 active:scale-95 transition"
                >
                  선택 해제
                </button>
              )}

              <button
                onClick={openCreate}
                className="rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 transition"
              >
                + 학습자 만들기
              </button>
            </div>
          </div>

          {learnersEmpty ? (
            <p className="text-gray-600">
              아직 학습자가 없어.{" "}
              <span className="font-semibold text-pink-600">학습자 만들기</span>
              로 먼저 만들어줘.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {learners.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <button
                    onClick={() => selectLearner(l)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                      selectedId === l.id
                        ? "bg-pink-500 text-white shadow"
                        : "bg-pink-100 text-pink-700 hover:bg-pink-200"
                    }`}
                  >
                    {l.nickname}
                  </button>

                  <button
                    onClick={() => openDeleteConfirm(l)}
                    className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-red-500 shadow-sm hover:bg-red-50 active:scale-95 transition"
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-pink-50 p-4 border border-pink-100">
            <p className="text-sm text-gray-700">
              현재 선택:{" "}
              <span className="font-extrabold text-pink-600">
                {currentLearner ? currentLearner.nickname : "없음"}
              </span>
            </p>

            {currentLearner && (
              <div className="pt-3">
                <p className="text-xs font-semibold text-pink-600 mb-1">
                  최근 퀴즈 기록 (최신 10개)
                </p>
                {attempts.length === 0 ? (
                  <p className="text-sm text-gray-600">아직 기록이 없어요.</p>
                ) : (
                  <ul className="space-y-1">
                    {attempts.map((a) => (
                      <li key={a.id} className="text-sm text-gray-700">
                        <span className="text-pink-500">🎀</span>{" "}
                        {new Date(a.created_at).toLocaleString()} —{" "}
                        <span className="font-semibold">
                          {a.score}/{a.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {/* learn */}
        {view === "learn" && (
          <section className="rounded-2xl bg-white p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-pink-600">📚 오늘의 단어 10개</h2>

              <div className="flex items-center gap-2">
                {/* 반복 스위치: ON이어도 자동재생 X */}
                <button
                  onClick={() => setRepeatOn((v) => !v)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                    repeatOn
                      ? "bg-pink-500 text-white shadow"
                      : "bg-white border border-pink-200 text-pink-600 hover:bg-pink-50"
                  }`}
                >
                  🔁 반복 {repeatOn ? "ON" : "OFF"}
                </button>

                {/* 전체 듣기 */}
                <button
                  onClick={onClickListenAll}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                    isAllRepeating
                      ? "bg-purple-500 text-white shadow"
                      : "bg-white border border-pink-200 text-pink-600 hover:bg-pink-50"
                  }`}
                  title={
                    repeatOn
                      ? "반복 ON이면 전체 반복, OFF이면 1회 재생"
                      : "전체 단어를 1번씩 재생"
                  }
                >
                  🎧 전체 듣기
                </button>

                <p className="text-xs text-pink-400">{wordsStatus}</p>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {repeatOn
                ? "반복 ON: 단어의 ‘발음 듣기’를 누르면 그 단어가 반복돼요. 다시 누르면 멈춰요."
                : "반복 OFF: 발음은 1번만 재생돼요. (반복하려면 반복 ON을 켜세요)"}
              {isPlaying && playingWordId ? (
                <span className="ml-2 text-pink-600 font-semibold">
                  • 재생 중…
                </span>
              ) : null}
            </div>

            {words.length === 0 ? (
              <p className="text-gray-600">
                단어가 아직 안 보여. 잠시만 기다려줘.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {words.map((w) => (
                  <li
                    key={w.id}
                    className={`rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm border transition ${
                      playingWordId === w.id
                        ? "bg-pink-100 border-pink-200"
                        : "bg-pink-50 border-pink-100"
                    }`}
                  >
                    <div>
                      <div className="text-xl font-extrabold text-pink-600">
                        {w.word}
                      </div>
                      <div className="text-sm text-gray-600">
                        {w.meaning_ko}
                      </div>
                    </div>

                    <button
                      onClick={() => onClickListenWord(w)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold shadow active:scale-95 transition ${
                        isWordRepeating(w.id)
                          ? "bg-pink-500 text-white"
                          : "bg-white text-pink-600 hover:bg-pink-100"
                      }`}
                      title={
                        repeatOn
                          ? isWordRepeating(w.id)
                            ? "반복 중(다시 누르면 멈춤)"
                            : "이 단어를 반복"
                          : "발음을 1번 듣기"
                      }
                    >
                      🔊 발음 듣기
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-1 flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                학습자 선택 후{" "}
                <span className="font-semibold text-pink-600">퀴즈</span>를
                시작할 수 있어요.
              </p>

              <button
                onClick={startQuiz}
                className="rounded-full bg-purple-400 px-5 py-2 text-white font-extrabold hover:bg-purple-500 active:scale-95 transition disabled:opacity-40"
                disabled={!currentLearner || words.length < 4}
              >
                🧠 퀴즈 시작!
              </button>
            </div>

            {quizStatus && (
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-pink-100 text-sm">
                <span className="font-semibold text-pink-600">퀴즈 알림</span> ·{" "}
                {quizStatus}
              </div>
            )}
          </section>
        )}

        {/* quiz */}
        {view === "quiz" && currentQ && (
          <section className="rounded-2xl bg-white p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-pink-600">🧠 퀴즈</h2>
              <p className="text-sm text-pink-400">
                {qIndex + 1} / {quiz.length}
              </p>
            </div>

            <div className="rounded-2xl bg-pink-50 p-5 border border-pink-100 space-y-2">
              <p className="text-sm text-pink-500 font-semibold">
                뜻을 보고 영어 단어를 고르세요
              </p>
              <p className="text-3xl font-extrabold text-gray-800">
                {currentQ.prompt}
              </p>
            </div>

            <div className="grid gap-3">
              {currentQ.choices.map((c) => {
                const isSelected = selectedChoice === c;
                const isSubmitted = submittedChoice !== null;
                const isAnswer = c === currentQ.answer;
                const isChosen = submittedChoice === c;

                // 제출 전: 선택 강조만
                // 제출 후: 정답 초록, 제출한 오답 빨강
                let cls =
                  "rounded-2xl border-2 p-4 text-lg font-semibold transition active:scale-[0.99] text-left";

                if (!isSubmitted) {
                  cls += isSelected
                    ? " bg-pink-200 border-pink-400"
                    : " bg-white border-pink-200 hover:bg-pink-50";
                } else {
                  if (isAnswer)
                    cls += " bg-green-400 text-white border-green-500";
                  else if (isChosen && !isAnswer)
                    cls += " bg-red-400 text-white border-red-500";
                  else cls += " bg-white border-pink-200 opacity-80";
                }

                return (
                  <button
                    key={c}
                    onClick={() => onSelectChoice(c)}
                    className={cls}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {/* 제출/다음 */}
            <div className="flex items-center justify-between pt-1 gap-2">
              <button
                onClick={backToLearn}
                className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-500 hover:bg-pink-50 active:scale-95 transition"
              >
                ← 학습으로
              </button>

              <div className="flex items-center gap-2">
                {!submittedChoice ? (
                  <button
                    onClick={onSubmitChoice}
                    disabled={!selectedChoice}
                    className="rounded-full bg-pink-500 px-5 py-2 text-white font-extrabold hover:bg-pink-600 active:scale-95 transition disabled:opacity-40"
                  >
                    ✅ 확인
                  </button>
                ) : (
                  <button
                    onClick={onNextQuestion}
                    className="rounded-full bg-purple-500 px-5 py-2 text-white font-extrabold hover:bg-purple-600 active:scale-95 transition"
                  >
                    {qIndex + 1 >= quiz.length ? "🎉 결과 보기" : "➡️ 다음"}
                  </button>
                )}
              </div>
            </div>

            {/* 피드백 메시지 */}
            {submittedChoice && (
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-pink-100 text-sm">
                {submittedChoice === currentQ.answer ? (
                  <span className="font-semibold text-green-600">정답! 🌟</span>
                ) : (
                  <span className="font-semibold text-red-600">
                    아쉬워요! 정답은{" "}
                    <span className="underline">{currentQ.answer}</span> 💡
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        {/* result */}
        {view === "result" && (
          <section className="rounded-2xl bg-white p-5 shadow-md space-y-4">
            <h2 className="font-bold text-pink-600">🎉 결과</h2>

            <div className="rounded-2xl bg-pink-50 p-5 border border-pink-100">
              <p className="text-sm text-pink-500 font-semibold mb-1">
                오늘 점수
              </p>
              <p className="text-3xl font-extrabold text-gray-800">
                {correctCount} / {quiz.length}
              </p>
              <p className="text-sm text-gray-600 mt-1">잘했어요! 🌟</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={backToLearn}
                className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-500 hover:bg-pink-50 active:scale-95 transition"
              >
                학습으로
              </button>

              <button
                onClick={saveResult}
                className="rounded-full bg-pink-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-pink-600 active:scale-95 transition disabled:opacity-40"
                disabled={!currentLearner}
              >
                🎀 점수 저장
              </button>
            </div>

            {quizStatus && (
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-pink-100 text-sm">
                <span className="font-semibold text-pink-600">알림</span> ·{" "}
                {quizStatus}
              </div>
            )}
          </section>
        )}

        {/* 생성 모달 */}
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-pink-600">
                  👧 학습자 만들기
                </h3>
                <button
                  onClick={closeCreate}
                  className="rounded-full px-3 py-2 hover:bg-gray-100 active:scale-95 transition"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <input
                value={createNickname}
                onChange={(e) => setCreateNickname(e.target.value)}
                placeholder="닉네임 (예: 민준)"
                className="w-full rounded-2xl border border-pink-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-200"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    createLearner();
                }}
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeCreate}
                  className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-500 hover:bg-pink-50 active:scale-95 transition"
                >
                  취소
                </button>
                <button
                  onClick={createLearner}
                  className="rounded-full bg-pink-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-pink-600 active:scale-95 transition"
                >
                  생성
                </button>
              </div>

              <p className="text-xs text-gray-500">
                * 지금은 로그인 없는 MVP라 학습자가 목록에 보여요.
              </p>
            </div>
          </div>
        )}

        {/* 삭제 확인 모달 */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4">
              <h3 className="text-xl font-extrabold text-pink-600">
                🧹 학습자 삭제
              </h3>

              <div className="rounded-2xl bg-pink-50 p-4 border border-pink-100">
                <p className="text-sm text-gray-700">
                  정말로{" "}
                  <span className="font-extrabold text-pink-600">
                    {deleteTarget.nickname}
                  </span>{" "}
                  학습자를 삭제할까?
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  삭제하면 되돌릴 수 없어요.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeDeleteConfirm}
                  className="rounded-full border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-500 hover:bg-pink-50 active:scale-95 transition"
                >
                  취소
                </button>
                <button
                  onClick={deleteLearner}
                  className="rounded-full bg-red-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-red-600 active:scale-95 transition"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
