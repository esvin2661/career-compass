"use client";

import { useState, useEffect } from "react";

export const dynamic = 'force-dynamic';

interface Skill {
  skill_id: string;
  label: string;
  confidence: number;
  source: string;
}

interface JobDescription {
  id: string;
  title: string;
  company: string;
  match_score: number;
  matched_skills: Skill[];
  missing_skills: Skill[];
  description: string;
  url: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function GapAnalysisPage() {
  const [role, setRole] = useState("Software Engineer");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    if (r) setRole(r);
  }, []);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // try load analysis from storage and compute job list
    const stored = localStorage.getItem('lastAnalysis');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const roleRec = data.role_recommendations?.find((r: any) => r.display_name === role);
        if (roleRec) {
          // build description from missing skills
          const sampleJobs: JobDescription[] = [
            {
              id: "1",
              title: roleRec.display_name,
              company: "Recommended Role",
              match_score: roleRec.match_score,
              matched_skills: roleRec.matched_skills,
              missing_skills: roleRec.missing_core_skills.concat(roleRec.missing_optional_skills),
              description: "Based on your profile, here are your gaps.",
              url: "#"
            }
          ];
          setJobDescriptions(sampleJobs);
        }
      } catch {}
    }
    // no fallback
    setLoading(false);
  }, [role]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-teal";
    if (score >= 60) return "text-accent";
    return "text-muted";
  };

  const selectedJobData = jobDescriptions.find(job => job.id === selectedJob);

  if (jobDescriptions.length === 0) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path d="M9 19V6L21 3V16M9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19ZM9 19L21 16M21 16C21 17.1046 21.8954 18 23 18C24.1046 18 25 17.1046 25 16C25 14.8954 24.1046 14 23 14C21.8954 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h2 className="font-display font-700 text-xl text-ink mb-2">No Gap Analysis Yet</h2>
          <p className="text-muted text-sm mb-6">
            Upload your resume and run an analysis to get a personalized gap analysis comparing your skills to job market requirements.
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

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-border bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white"/>
              </svg>
            </div>
            <span className="font-display font-700 text-lg tracking-tight text-ink">Gap Analysis Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono">{jobDescriptions.length} jobs analyzed</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-display font-700 text-3xl text-ink mb-2">
            Gap Analysis: {role}
          </h1>
          <p className="text-muted text-lg">
            Compare your skills against {jobDescriptions.length}+ real job descriptions to identify gaps and opportunities.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Job List */}
          <div className="lg:col-span-1">
            <h2 className="font-display font-700 text-xl text-ink mb-4">Job Matches</h2>
            <div className="space-y-3">
              {jobDescriptions.map(job => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedJob === job.id
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border bg-white hover:border-ink/30"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-display font-600 text-ink text-sm">{job.title}</h3>
                      <p className="text-xs text-muted">{job.company}</p>
                    </div>
                    <span className={`font-display font-800 text-lg ${getScoreColor(job.match_score)}`}>
                      {job.match_score}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-teal-dim">✓ {job.matched_skills.length} matched</span>
                    <span className="text-accent">✗ {job.missing_skills.length} gaps</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Job Details */}
          <div className="lg:col-span-2">
            {selectedJobData ? (
              <div className="bg-white border border-border rounded-xl p-6">
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h2 className="font-display font-700 text-2xl text-ink">{selectedJobData.title}</h2>
                      <p className="text-muted">{selectedJobData.company}</p>
                    </div>
                    <span className={`font-display font-800 text-3xl ${getScoreColor(selectedJobData.match_score)}`}>
                      {selectedJobData.match_score}%
                    </span>
                  </div>
                  <a
                    href={selectedJobData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:text-accent-dim"
                  >
                    View Job Posting →
                  </a>
                </div>

                <div className="mb-6">
                  <p className="text-ink leading-relaxed">{selectedJobData.description}</p>
                </div>

                {/* Skills Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-display font-600 text-lg text-ink mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-teal rounded-full"></span>
                      Your Matching Skills ({selectedJobData.matched_skills.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedJobData.matched_skills.map(skill => (
                        <div key={skill.skill_id} className="flex items-center justify-between p-2 bg-teal/5 rounded-lg">
                          <span className="font-mono text-sm text-ink">{skill.label}</span>
                          <span className="text-xs text-teal-dim font-mono">
                            {(skill.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                      {selectedJobData.matched_skills.length === 0 && (
                        <p className="text-sm text-muted">No matching skills detected</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-600 text-lg text-ink mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-accent rounded-full"></span>
                      Missing Skills ({selectedJobData.missing_skills.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedJobData.missing_skills.map(skill => (
                        <div key={skill.skill_id} className="flex items-center justify-between p-2 bg-accent/5 rounded-lg">
                          <span className="font-mono text-sm text-ink">{skill.label}</span>
                          <span className="text-xs text-accent font-mono">Required</span>
                        </div>
                      ))}
                      {selectedJobData.missing_skills.length === 0 && (
                        <p className="text-sm text-teal-dim font-mono">🎉 No skill gaps!</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-3">
                  <a
                    href={`/roadmap?role=${encodeURIComponent(selectedJobData.title)}`}
                    className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dim transition-colors text-sm"
                  >
                    Create Learning Plan
                  </a>
                  <a
                    href={`/mock-interview?role=${encodeURIComponent(selectedJobData.title)}`}
                    className="px-4 py-2 border border-border text-ink rounded-lg hover:border-ink transition-colors text-sm"
                  >
                    Practice Interview
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="font-display font-600 text-lg text-ink mb-2">Select a Job</h3>
                <p className="text-muted">Choose a job from the list to see detailed gap analysis</p>
              </div>
            )}
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-12">
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