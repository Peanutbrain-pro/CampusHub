
import { useEffect, useState } from "react";
import { dailyQuizService } from "./services";
import type { QuizQuestion, UserStreak } from "./services";

const QUESTION_TIME = 30;

type Question = QuizQuestion;

export default function DailyQuizPage() {
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [streak, setStreak] = useState<UserStreak | null>(null);

  const question = quizQuestions[currentQuestion];

  async function loadQuiz() {
    setLoading(true);
    setErrorMessage("");

    const result = await dailyQuizService.getTodayQuiz();

    if (result.error) {
      setErrorMessage(result.error.message);
      setLoading(false);
      return;
    }

    setQuizQuestions(result.data.questions);
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setQuizFinished(false);
    setTimeLeft(QUESTION_TIME);
    setLoading(false);

    const streakResult = await dailyQuizService.getUserStreak();

    if (!streakResult.error) {
      setStreak(streakResult.data);
    }
  }

  useEffect(() => {
    void loadQuiz();
  }, []);

  useEffect(() => {
    if (loading || submitted || quizFinished || !question) return;

    if (timeLeft <= 0) {
      setSubmitted(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setTimeLeft((previousTime) => previousTime - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [timeLeft, submitted, quizFinished, loading, question]);

  async function handleSubmit() {
    if (selectedAnswer === null || submitted || !question) return;

    const updatedAnswers = {
      ...answers,
      [question.id]: selectedAnswer,
    };

    setAnswers(updatedAnswers);

    const isCorrect = selectedAnswer === question.correctAnswerIndex;

    if (isCorrect) {
      setScore((previousScore) => previousScore + 1);
    }

    setSubmitted(true);
  }

  async function handleNextQuestion() {
    if (currentQuestion === quizQuestions.length - 1) {
      const result = await dailyQuizService.submitQuiz(answers);

      if (result.error) {
        setErrorMessage(result.error.message);
        return;
      }

      setScore(result.data.score);
      setStreak((previous) =>
        previous
          ? { ...previous, currentStreak: result.data.streakCount }
          : previous,
      );
      setQuizFinished(true);
      return;
    }

    setCurrentQuestion((previousQuestion) => previousQuestion + 1);
    setSelectedAnswer(null);
    setSubmitted(false);
    setTimeLeft(QUESTION_TIME);
  }

  function handleRestart() {
    void loadQuiz();
  }

  const progress =
    quizFinished || quizQuestions.length === 0
      ? quizFinished
        ? 100
        : 0
      : ((currentQuestion + (submitted ? 1 : 0)) / quizQuestions.length) *
        100;

  if (loading) {
    return (
      <div className="p-6 text-gray-500">
        Loading today's quiz...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Quiz</h1>
        <p className="rounded-lg bg-red-50 p-4 text-red-700">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={() => void loadQuiz()}
          className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (quizQuestions.length === 0) {
    return (
      <div className="p-6">
        No questions are available today. Please try again later.
      </div>
    );
  }

  const isCorrect =
    selectedAnswer !== null &&
    selectedAnswer === question?.correctAnswerIndex;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Quiz</h1>
        <p className="mt-2 text-sm text-gray-500">
          Challenge yourself, improve your knowledge, and track your progress.
        </p>
        {streak && (
          <p className="mt-2 text-sm font-medium text-orange-600">
            🔥 Current streak: {streak.currentStreak} day(s)
          </p>
        )}
      </div>

      <div className="max-w-3xl">
        <div className="mb-2 flex justify-between text-sm text-gray-500">
          <span>Quiz progress</span>
          <span>
            {quizFinished ? quizQuestions.length : currentQuestion + 1} of{" "}
            {quizQuestions.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {quizFinished ? (
        <div className="max-w-3xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-5xl">
            {score >= 4 ? "🏆" : score >= 3 ? "🎉" : "💪"}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Quiz Completed!
          </h2>
          <p className="mt-3 text-gray-500">
            {score >= 4
              ? "Excellent work! You have a strong understanding of these topics."
              : score >= 3
                ? "Good effort! Keep practicing to improve your score."
                : "Keep learning and try again. Every attempt helps you improve!"}
          </p>
          <div className="my-8 rounded-xl bg-blue-50 p-6">
            <p className="text-sm font-medium text-blue-700">Your final score</p>
            <p className="mt-2 text-4xl font-bold text-blue-700">
              {score} / {quizQuestions.length}
            </p>
            <p className="mt-2 text-sm text-blue-700">
              {Math.round((score / quizQuestions.length) * 100)}% correct
            </p>
          </div>
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            Restart Quiz
          </button>
        </div>
      ) : (
        <div className="max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-500">
              Question {currentQuestion + 1} of {quizQuestions.length}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              Daily Quiz
            </span>
          </div>

          <div className="mb-6 flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <span className="text-sm font-medium text-gray-600">
              Time remaining
            </span>
            <span
              className={`font-bold ${
                timeLeft <= 10 ? "text-red-600" : "text-gray-900"
              }`}
            >
              00:{String(timeLeft).padStart(2, "0")}
            </span>
          </div>

          <h2 className="mb-6 text-lg font-semibold leading-7 text-gray-900">
            {question.question}
          </h2>

          <div className="space-y-3">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const optionIsCorrect = index === question.correctAnswerIndex;

              let optionStyle =
                "border-gray-200 hover:border-blue-400 hover:bg-blue-50";

              if (submitted && optionIsCorrect) {
                optionStyle = "border-green-500 bg-green-50 text-green-800";
              } else if (submitted && isSelected && !optionIsCorrect) {
                optionStyle = "border-red-500 bg-red-50 text-red-800";
              } else if (isSelected) {
                optionStyle = "border-blue-500 bg-blue-50 text-blue-800";
              }

              return (
                <button
                  key={`${question.id}-${option}`}
                  type="button"
                  disabled={submitted}
                  onClick={() => setSelectedAnswer(index)}
                  className={`w-full rounded-lg border p-4 text-left transition duration-200 ${optionStyle} ${
                    submitted ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  <span className="mr-2 font-semibold">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {option}
                </button>
              );
            })}
          </div>

          {submitted && (
            <div
              className={`mt-6 rounded-lg p-4 ${
                isCorrect
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              <p className="font-semibold">
                {timeLeft === 0 && selectedAnswer === null
                  ? "Time is up!"
                  : isCorrect
                    ? "Correct answer! 🎉"
                    : "Incorrect answer."}
              </p>
              <p className="mt-2 text-sm">{question.explanation}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              Score: {score} / {quizQuestions.length}
            </p>
            {!submitted ? (
              <button
                type="button"
                disabled={selectedAnswer === null}
                onClick={() => void handleSubmit()}
                className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Submit Answer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleNextQuestion()}
                className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
              >
                {currentQuestion === quizQuestions.length - 1
                  ? "View Results"
                  : "Next Question →"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
