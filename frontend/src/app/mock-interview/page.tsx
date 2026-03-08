"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface MockQuestion {
  question: string;
  one_line_answer: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MockInterviewPage() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "Software Engineer";
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // For now, generate mock questions. In a real app, this would come from the analysis
    const mockQuestions: MockQuestion[] = [
      {
        question: `Tell me about a challenging ${role} project you've worked on and how you overcame the difficulties.`,
        one_line_answer: "Describe a specific project, the challenges faced, and the solution implemented."
      },
      {
        question: "What are your strengths and weaknesses as a developer?",
        one_line_answer: "Focus on strengths relevant to the role and show self-awareness about areas for improvement."
      },
      {
        question: `How do you stay updated with the latest trends in ${role} technologies?`,
        one_line_answer: "Mention specific resources, communities, or practices you follow regularly."
      },
      {
        question: "Describe a time when you had to learn a new technology quickly.",
        one_line_answer: "Explain the situation, your approach to learning, and the outcome."
      },
      {
        question: "How do you handle conflicting priorities or tight deadlines?",
        one_line_answer: "Discuss your prioritization framework and communication strategies."
      }
    ];
    setQuestions(mockQuestions);
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

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
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