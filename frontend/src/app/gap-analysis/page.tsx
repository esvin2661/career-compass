"use client";

import { useState, useEffect } from "react";

interface Skill {
  skill_id: string;
  label: string;
  confidence: number;
  source: string;
}

interface GapAnalysisData {
  role: string;
  matchScore: number;
  userProfile: any;
  matchedSkills: Skill[];
  coreGaps: Skill[];
  optionalGaps: Skill[];
  allExtractedSkills: Skill[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function GapAnalysisPage() {
  const [role, setRole] = useState("Software Engineer");
  const [gapData, setGapData] = useState<GapAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalizedSummary, setPersonalizedSummary] = useState<string | null>(null);
  const [sortByGap, setSortByGap] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    if (r) setRole(decodeURIComponent(r));
  }, []);

  useEffect(() => {
    // Load analysis from storage and prepare gap analysis
    const stored = localStorage.getItem('lastAnalysis');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const roleRec = data.role_recommendations?.find((r: any) => r.display_name === role);
        if (roleRec) {
          const analysisData: GapAnalysisData = {
            role: roleRec.display_name,
            matchScore: roleRec.match_score,
            userProfile: data.profile,
            matchedSkills: roleRec.matched_skills,
            coreGaps: roleRec.missing_core_skills,
            optionalGaps: roleRec.missing_optional_skills,
            allExtractedSkills: data.extracted_skills,
          };
          setGapData(analysisData);
          generatePersonalizedSummary(data, roleRec);
        }
      } catch (e) {
        console.error("Failed to load analysis:", e);
      }
    }
    setLoading(false);
  }, [role]);

  const generatePersonalizedSummary = async (analysisData: any, roleData: any) => {
    try {
      const response = await fetch(`${API_BASE}/generate-gap-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role_name: roleData.display_name,
          user_profile: analysisData.profile,
          skills_data: {
            matched_skills: roleData.matched_skills,
            missing_core_skills: roleData.missing_core_skills,
            missing_optional_skills: roleData.missing_optional_skills,
            match_score: roleData.match_score
          }
        }),
      });
      const result = await response.json();
      setPersonalizedSummary(result.summary);
    } catch (error) {
      console.warn('Failed to generate personalized summary:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-teal";
    if (score >= 60) return "text-accent";
    return "text-amber-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-teal/10";
    if (score >= 60) return "bg-accent/10";
    return "bg-amber-50";
  };

  const estimatedHoursPerSkill = 40; // Average hours to learn a core skill

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted">Loading gap analysis...</p>
        </div>
      </div>
    );
  }

  if (!gapData) {
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
            Upload your resume and run an analysis to get a detailed gap analysis for this role.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-display font-600 rounded-lg hover:bg-accent-dim transition-colors"
          >
            ← Back to Career Compass
          </a>
        </div>
      </div>
    );
  }

  const totalCoreHours = gapData.coreGaps.length * estimatedHoursPerSkill;
  const totalOptionalHours = gapData.optionalGaps.length * estimatedHoursPerSkill;

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
            <span className="font-display font-700 text-lg tracking-tight text-ink">Skill Gap Analysis</span>
          </div>
          <a
            href="/"
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            ← Back
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Title & Summary */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="font-display font-700 text-4xl text-ink">
              Gap Analysis: {gapData.role}
            </h1>
            <span className={`font-display font-800 text-3xl px-4 py-2 rounded-lg ${getScoreBgColor(gapData.matchScore)} ${getScoreColor(gapData.matchScore)}`}>
              {gapData.matchScore}%
            </span>
          </div>
          <p className="text-muted text-lg mb-4">
            Detailed skill comparison and learning roadmap for {gapData.userProfile.headline}
          </p>

          {personalizedSummary && (
            <div className="mt-4 p-6 bg-accent/5 border border-accent/20 rounded-xl">
              <p className="text-ink text-base leading-relaxed">{personalizedSummary}</p>
            </div>
          )}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-white border border-border rounded-xl p-6">
            <div className="text-2xl font-display font-800 text-teal mb-1">{gapData.matchedSkills.length}</div>
            <div className="text-xs font-mono text-muted uppercase">Skills You Have</div>
          </div>
          <div className="bg-white border border-border rounded-xl p-6">
            <div className="text-2xl font-display font-800 text-accent mb-1">{gapData.coreGaps.length}</div>
            <div className="text-xs font-mono text-muted uppercase">Core Gaps</div>
          </div>
          <div className="bg-white border border-border rounded-xl p-6">
            <div className="text-2xl font-display font-800 text-accent mb-1">{totalCoreHours}h</div>
            <div className="text-xs font-mono text-muted uppercase">Est. Core Learning</div>
          </div>
          <div className="bg-white border border-border rounded-xl p-6">
            <div className="text-2xl font-display font-800 text-ink mb-1">{Math.ceil(totalCoreHours / 15)} weeks</div>
            <div className="text-xs font-mono text-muted uppercase">At 15h/week</div>
          </div>
        </div>

        {/* Main Analysis Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Your Skills */}
          <div className="bg-white border border-border rounded-xl p-6">
            <h2 className="font-display font-700 text-lg text-ink mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-teal rounded-full"></span>
              Your Skills ({gapData.matchedSkills.length})
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {gapData.matchedSkills.map(skill => (
                <div key={skill.skill_id} className="p-3 bg-teal/5 rounded-lg border border-teal/20">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm text-ink">{skill.label}</span>
                    <div className="flex items-center gap-1">
                      <div className="w-8 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal"
                          style={{ width: `${skill.confidence * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-teal-dim font-mono">{(skill.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
              {gapData.matchedSkills.length === 0 && (
                <p className="text-sm text-muted italic">No matching skills detected</p>
              )}
            </div>
          </div>

          {/* Core Gaps */}
          <div className="bg-white border border-accent/30 rounded-xl p-6">
            <h2 className="font-display font-700 text-lg text-accent mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-accent rounded-full"></span>
              Core Gaps ({gapData.coreGaps.length})
            </h2>
            <p className="text-xs text-muted mb-4">Required for the role. Prioritize learning these.</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {gapData.coreGaps.map((skill, idx) => (
                <div key={skill.skill_id} className="p-3 bg-accent/5 rounded-lg border border-accent/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <span className="font-mono text-sm text-ink">{skill.label}</span>
                      <p className="text-xs text-muted mt-0.5">~{estimatedHoursPerSkill}h to learn</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-accent/20 text-accent font-mono rounded">#{idx + 1}</span>
                  </div>
                </div>
              ))}
              {gapData.coreGaps.length === 0 && (
                <p className="text-sm text-teal-dim font-mono">🎉 No core gaps!</p>
              )}
            </div>
          </div>

          {/* Optional Skills */}
          <div className="bg-white border border-border rounded-xl p-6">
            <h2 className="font-display font-700 text-lg text-ink mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-muted rounded-full"></span>
              Nice-to-Have ({gapData.optionalGaps.length})
            </h2>
            <p className="text-xs text-muted mb-4">Enhance your profile. Learn after core skills.</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {gapData.optionalGaps.map(skill => (
                <div key={skill.skill_id} className="p-3 bg-muted/5 rounded-lg border border-muted/20">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm text-ink">{skill.label}</span>
                    <span className="text-xs px-2 py-1 bg-muted/10 text-muted font-mono rounded">optional</span>
                  </div>
                </div>
              ))}
              {gapData.optionalGaps.length === 0 && (
                <p className="text-sm text-muted italic">No nice-to-have skills</p>
              )}
            </div>
          </div>
        </div>

        {/* Action Plan */}
        <div className="bg-white border border-border rounded-xl p-8 mb-12">
          <h2 className="font-display font-700 text-2xl text-ink mb-6">Your Action Plan</h2>

          <div className="space-y-6">
            {/* Phase 1: Core Skills */}
            <div className="border-l-4 border-accent pl-6 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <span className="font-display font-800 text-accent">1</span>
                </div>
                <div>
                  <h3 className="font-display font-600 text-lg text-ink">Master Core Skills</h3>
                  <p className="text-sm text-muted">Estimated: {totalCoreHours}h ({Math.ceil(totalCoreHours / 15)} weeks @ 15h/week)</p>
                </div>
              </div>
              <div className="ml-13 space-y-3">
                {gapData.coreGaps.slice(0, 5).map((skill, idx) => (
                  <div key={skill.skill_id} className="flex items-start gap-3">
                    <span className="text-accent font-display font-600">{idx + 1}.</span>
                    <div className="flex-1">
                      <p className="font-mono text-ink">{skill.label}</p>
                      <p className="text-xs text-muted mt-1">Start with foundational concepts, then practice with real projects</p>
                    </div>
                  </div>
                ))}
                {gapData.coreGaps.length > 5 && (
                  <p className="text-sm text-muted italic ml-6">+ {gapData.coreGaps.length - 5} more core skills</p>
                )}
              </div>
            </div>

            {/* Phase 2: Build Projects */}
            <div className="border-l-4 border-teal pl-6 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-teal/10 rounded-lg flex items-center justify-center">
                  <span className="font-display font-800 text-teal">2</span>
                </div>
                <div>
                  <h3 className="font-display font-600 text-lg text-ink">Build Portfolio Projects</h3>
                  <p className="text-sm text-muted">Estimated: 60-80h (4-5 weeks</p>
                </div>
              </div>
              <div className="ml-13 space-y-3">
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="text-teal mt-1">✓</span>
                    <span className="text-sm text-ink">Create 2-3 projects demonstrating your core skills</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-teal mt-1">✓</span>
                    <span className="text-sm text-ink">Find real projects on GitHub, LeetCode, or Kaggle in your target domain</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-teal mt-1">✓</span>
                    <span className="text-sm text-ink">Document your code and include detailed READMEs</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Phase 3: Interview Prep */}
            <div className="border-l-4 border-ink pl-6 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-ink/10 rounded-lg flex items-center justify-center">
                  <span className="font-display font-800 text-ink">3</span>
                </div>
                <div>
                  <h3 className="font-display font-600 text-lg text-ink">Interview Preparation</h3>
                  <p className="text-sm text-muted">Estimated: 30-40h (2-3 weeks)</p>
                </div>
              </div>
              <div className="ml-13 space-y-3">
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="mt-1">→</span>
                    <span className="text-sm text-ink">Practice technical interviews with our mock interview tool</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1">→</span>
                    <span className="text-sm text-ink">Study system design if applying for senior roles</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1">→</span>
                    <span className="text-sm text-ink">Prepare story examples from your projects for behavioral questions</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href={`/mock-interview?role=${encodeURIComponent(gapData.role)}`}
            className="group p-6 border border-border rounded-xl hover:border-accent transition-colors text-center"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M8 12L10 14L16 8M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="font-display font-600 text-ink mb-1">Mock Interviews</h3>
            <p className="text-xs text-muted">Practice with tailored interview questions</p>
          </a>

          <a
            href="/"
            className="group p-6 border border-border rounded-xl hover:border-accent transition-colors text-center"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M12 2L15.09 8.26H22L17.82 12.46L20.91 18.73L15.73 14.54L10.55 18.73L13.64 12.46L9.46 8.26H16.91L12 2Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="font-display font-600 text-ink mb-1">New Analysis</h3>
            <p className="text-xs text-muted">Upload a new resume and run analysis</p>
          </a>
        </div>
      </main>
    </div>
  );
}