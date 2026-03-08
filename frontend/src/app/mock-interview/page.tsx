"use client";

import { useState, useEffect } from "react";

export const dynamic = 'force-dynamic';

interface MockQuestion {
  question: string;
  one_line_answer: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MockInterviewPage() {
  const [role, setRole] = useState("Software Engineer");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    if (r) setRole(r);
  }, []);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // try load last analysis from storage
    const stored = localStorage.getItem('lastAnalysis');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const qi: MockQuestion[] = data.mock_questions || [];
        setQuestions(qi.length ? qi : []);
      } catch {}
    }
    // no fallback static questions
    setLoading(false);
  }, [role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted">Loading interview questions...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path d="M8 12L10 14L16 8M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h2 className="font-display font-700 text-xl text-ink mb-2">No Interview Questions Yet</h2>
          <p className="text-muted text-sm mb-6">
            Upload your resume and run an analysis to get personalized mock interview questions tailored to your profile.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-display font-600 rounded-lg hover:bg-accent-dim transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1L11.5 7H17L12.5 10.5L14 17L9 13L4 17L5.5 10.5L1 7H6.5L9 1Z" fill="currentColor"/>
            </svg>
            Analyze My Profile
          </a>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-border bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white"/>
              </svg>
            </div>
            <span className="font-display font-700 text-lg tracking-tight text-ink">Mock Interview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono">Question {currentQuestion + 1} of {questions.length}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="font-display font-700 text-2xl text-ink mb-2">
              Mock Interview: {role}
            </h1>
            <p className="text-muted">
              Practice your interview skills with tailored questions for this role.
            </p>
          </div>

          {/* Question Card */}
          <div className="bg-cream rounded-xl p-6 mb-6">
            <h2 className="font-display font-600 text-xl text-ink mb-4">
              Question {currentQuestion + 1}
            </h2>
            <p className="text-ink text-lg leading-relaxed mb-6">
              {question.question}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAnswer(!showAnswer)}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dim transition-colors"
              >
                {showAnswer ? "Hide Answer" : "Show Answer Hint"}
              </button>
            </div>

            {showAnswer && (
              <div className="mt-4 p-4 bg-teal/10 border border-teal/20 rounded-lg">
                <p className="text-sm font-mono text-muted uppercase tracking-wider mb-2">Answer Hint</p>
                <p className="text-ink">{question.one_line_answer}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                setCurrentQuestion(Math.max(0, currentQuestion - 1));
                setShowAnswer(false);
              }}
              disabled={currentQuestion === 0}
              className="px-6 py-3 border border-border text-ink rounded-lg hover:border-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <div className="flex gap-2">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentQuestion(idx);
                    setShowAnswer(false);
                  }}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    idx === currentQuestion ? "bg-accent" : "bg-border hover:bg-muted"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => {
                setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1));
                setShowAnswer(false);
              }}
              disabled={currentQuestion === questions.length - 1}
              className="px-6 py-3 bg-ink text-paper rounded-lg hover:bg-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 border border-border text-ink rounded-lg hover:border-ink transition-colors"
          >
            ← Back to Career Compass
          </a>
        </div>
      </main>
    </div>
  );
}