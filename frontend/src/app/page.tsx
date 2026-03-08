"use client";

import { useState, useRef, DragEvent } from "react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Skill { skill_id: string; label: string; confidence: number; source: string; }
interface RoleRec {
  role_id: string; display_name: string; match_score: number;
  matched_skills: { skill_id: string; label: string }[];
  missing_core_skills: { skill_id: string; label: string }[];
  missing_optional_skills: { skill_id: string; label: string }[];
}
interface RoadmapItem {
  id: string; title: string; url: string; provider: string;
  skills_covered: string[]; hours_estimate: number; cost_tag: string;
  covers_missing: string[]; priority: string;
}
interface Milestone { week_range: string; items: string[]; total_hours: number; }
interface Roadmap {
  recommended_items: RoadmapItem[];
  weekly_milestones: Milestone[];
  total_hours: number;
  estimated_weeks: number;
}
interface MockQuestion { question: string; one_line_answer: string; }
interface AnalyzeResult {
  profile: { headline: string; explicit_skills: string[]; experience_bullets: string[]; seniority_inferred: string; };
  extracted_skills: Skill[];
  role_recommendations: RoleRec[];
  selected_roadmaps: Record<string, Roadmap>;
  mock_questions: MockQuestion[];
  warnings: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const scoreColor = (score: number) => {
  if (score >= 70) return "text-teal";
  if (score >= 40) return "text-accent";
  return "text-muted";
};

const ScoreBar = ({ score }: { score: number }) => (
  <div className="w-full bg-cream rounded-full h-2 overflow-hidden">
    <div
      className={`h-2 rounded-full transition-all duration-700 ${score >= 70 ? "bg-teal" : score >= 40 ? "bg-accent" : "bg-muted"}`}
      style={{ width: `${score}%` }}
    />
  </div>
);

// ─────────────────────────────────────────────
// Component: Tag pill
// ─────────────────────────────────────────────
const Tag = ({ label, variant = "default" }: { label: string; variant?: "default" | "missing" | "match" | "free" | "paid" }) => {
  const styles: Record<string, string> = {
    default: "bg-cream text-ink border border-border",
    missing: "bg-accent/10 text-accent border border-accent/30",
    match: "bg-teal/10 text-teal-dim border border-teal/30",
    free: "bg-teal/10 text-teal-dim border border-teal/20",
    paid: "bg-accent/10 text-accent border border-accent/20",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [techs, setTechs] = useState<string[]>([]);
  const [budget, setBudget] = useState("all");
  const [hoursPerWeek, setHoursPerWeek] = useState(8);
  const [certFocus, setCertFocus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<AnalyzeResult | null>(null);
  const [inputMode, setInputMode] = useState<"resume" | "json">("resume");
  const [jsonInput, setJsonInput] = useState("");

  // drag/drop helpers
  const [dropActive, setDropActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropActive(true);
  };
  const handleDragLeave = () => setDropActive(false);
  const handleFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    console.log('Processing file:', file.name, 'extension:', ext);

    if (!['txt', 'html', 'pdf', 'doc', 'docx'].includes(ext || '')) {
      setError('Unsupported file format. Please use PDF, DOC, DOCX, HTML, or TXT files.');
      return;
    }

    setIsProcessingFile(true);
    setError(null);
    setUploadedFileName(file.name);

    try {
      if (ext === 'txt' || ext === 'html') {
        // Read as text directly
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          console.log('Read text directly:', text.substring(0, 100) + '...');
          setResumeText(text);
          setIsProcessingFile(false);
        };
        reader.onerror = () => {
          setError('Failed to read the file. Please try again.');
          setIsProcessingFile(false);
        };
        reader.readAsText(file);
      } else {
        // Upload to backend for extraction
        console.log('Uploading to backend for extraction...');
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch(`${API_BASE}/extract-text`, {
          method: 'POST',
          body: formData,
        });
        console.log('Backend response status:', resp.status);
        if (!resp.ok) {
          const err = await resp.json();
          console.error('Backend error:', err);
          throw new Error(err.detail || 'Failed to extract text from file');
        }
        const data = await resp.json();
        console.log('Extracted text:', data.text.substring(0, 100) + '...');
        setResumeText(data.text);
        setIsProcessingFile(false);
      }
    } catch (e) {
      console.error('Error processing file:', e);
      setError(e instanceof Error ? e.message : 'Failed to process file');
      setIsProcessingFile(false);
      setUploadedFileName(null);
    }
  };

  const resultsRef = useRef<HTMLDivElement>(null);

  const ROLE_OPTIONS = [
    { id: "cloud_engineer", label: "Cloud Engineer" },
    { id: "data_scientist", label: "Data Scientist" },
    { id: "frontend_dev", label: "Frontend Developer" },
    { id: "product_manager", label: "Product Manager" },
    { id: "devops_engineer", label: "DevOps Engineer" },
  ];

  const TECH_OPTIONS = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C#",
    "Go",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "React",
    "Node.js",
    "SQL",
    "NoSQL",
  ];

  const toggleRole = (id: string) => {
    setTargetRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleTech = (label: string) => {
    setTechs(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    );
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveRole(null);

    const payload: Record<string, unknown> = {
      github_url: githubUrl || undefined,
      target_roles: targetRoles.length > 0 ? targetRoles : undefined,
      preferences: { budget, hours_per_week: hoursPerWeek, certification_focus: certFocus },
    };

    if (inputMode === "json") {
      try {
        payload.synthetic_profile = JSON.parse(jsonInput);
      } catch {
        setError("Invalid JSON profile. Please check your input.");
        setLoading(false);
        return;
      }
    } else {
      if (!resumeText.trim()) {
        setError("Please paste your resume text or upload a file.");
        setLoading(false);
        return;
      }
      payload.resume_text = resumeText;
    }

    // require target roles
    // if (targetRoles.length === 0) {
    //   setError("Please select at least one target role.");
    //   setLoading(false);
    //   return;
    // }

    if (techs.length > 0) {
      payload.techs = techs;
    }

    try {
      console.log('Sending analysis request to backend...');
      const resp = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `API error ${resp.status}`);
      }

      const data: AnalyzeResult = await resp.json();
      console.log('Analysis completed successfully, data saved to database');

      setResult(data);
      setActiveRole(data.role_recommendations[0]?.role_id || null);
      try {
        localStorage.setItem('lastAnalysis', JSON.stringify(data));
        console.log('✅ Results stored in localStorage');
      } catch {}
      
      // Show success modal
      setModalData(data);
      setShowModal(true);

      // Show success message that data was saved
      console.log('✅ Analysis results saved to database successfully');

    } catch (e: unknown) {
      console.error('Analysis failed:', e);
      setError(e instanceof Error ? e.message : "Unexpected error occurred during analysis");
    } finally {
      setLoading(false);
    }
  };

  const activeRoadmap = activeRole ? result?.selected_roadmaps[activeRole] : null;
  const activeRoleData = result?.role_recommendations.find(r => r.role_id === activeRole);
  const roadmapItemMap = activeRoadmap
    ? Object.fromEntries(activeRoadmap.recommended_items.map(i => [i.id, i]))
    : {};

  return (
    <main className="min-h-screen bg-paper font-body">
      {/* ── HEADER ── */}
      <header className="border-b border-border bg-paper/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white"/>
              </svg>
            </div>
            <span className="font-display font-700 text-lg tracking-tight text-ink">Career Compass</span>
          </div>
          <nav className="flex items-center gap-6">
            <a
              href="/mock-interview"
              className="text-sm text-muted hover:text-accent transition-colors font-medium"
            >
              Mock Interviews
            </a>
            <a
              href="/roadmap"
              className="text-sm text-muted hover:text-accent transition-colors font-medium"
            >
              Learning Roadmap
            </a>
            <a
              href="/gap-analysis"
              className="text-sm text-muted hover:text-accent transition-colors font-medium"
            >
              Gap Analysis
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono">MVP v1.0</span>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-accent uppercase tracking-widest mb-4">Skill Gap · Roadmap · Mock Interviews</p>
          <h1 className="font-display font-800 text-5xl leading-[1.05] tracking-tight text-ink mb-4">
            Know exactly<br />
            <span className="text-accent">what to learn</span><br />
            and why.
          </h1>
          <p className="text-muted text-lg leading-relaxed font-body">
            Paste your resume, get your skill gaps, a personalized learning roadmap, and tailored mock interview questions — in seconds.
          </p>
        </div>

        {/* Quick Access Tools */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl">
          <a
            href="/mock-interview"
            className="group p-6 border border-border rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-center"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M8 12L10 14L16 8M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="font-display font-600 text-ink mb-1">Mock Interviews</h3>
            <p className="text-xs text-muted">Practice with AI-generated interview questions</p>
          </a>

          <a
            href="/roadmap"
            className="group p-6 border border-border rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-center"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="font-display font-600 text-ink mb-1">Learning Roadmap</h3>
            <p className="text-xs text-muted">Get personalized learning plans and milestones</p>
          </a>

          <a
            href="/gap-analysis"
            className="group p-6 border border-border rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-center"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M9 19V6L21 3V16M9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19ZM9 19L21 16M21 16C21 17.1046 21.8954 18 23 18C24.1046 18 25 17.1046 25 16C25 14.8954 24.1046 14 23 14C21.8954 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="font-display font-600 text-ink mb-1">Gap Analysis</h3>
            <p className="text-xs text-muted">Compare your skills against job market data</p>
          </a>
        </div>
      </section>

      {/* ── INPUT FORM ── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mode toggle */}
          <div className="border-b border-border flex">
            {(["resume", "json"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={`flex-1 py-3 text-sm font-display font-600 transition-colors ${
                  inputMode === mode
                    ? "bg-ink text-paper"
                    : "bg-white text-muted hover:text-ink"
                }`}
              >
                {mode === "resume" ? "📄 Paste Resume" : "{ } JSON Profile"}
              </button>
            ))}
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: text input */}
            <div>
              {inputMode === "resume" ? (
                <>
                  <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                    Resume Text (paste or upload file: PDF, DOC, DOCX, TXT, HTML)
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleFileDrop}
                    className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${
                      dropActive
                        ? "border-accent bg-accent/5"
                        : isProcessingFile
                        ? "border-accent/50 bg-accent/5"
                        : uploadedFileName
                        ? "border-teal/50 bg-teal/5"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <div className="text-center">
                      {isProcessingFile ? (
                        <div className="flex flex-col items-center gap-3">
                          <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                          </svg>
                          <p className="text-sm text-accent font-medium">Processing {uploadedFileName}...</p>
                        </div>
                      ) : uploadedFileName ? (
                        <div className="flex flex-col items-center gap-3">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-teal">
                            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          <div>
                            <p className="text-sm text-teal font-medium">File uploaded successfully!</p>
                            <p className="text-xs text-muted font-mono">{uploadedFileName}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-muted">
                            <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2"/>
                            <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2"/>
                            <path d="M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          <div>
                            <p className="text-sm text-muted">Drop your resume here or click to browse</p>
                            <p className="text-xs text-muted/60">Supports PDF, DOCX, HTML, TXT files</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {dropActive && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-accent font-mono text-lg">
                        Drop to upload
                      </div>
                    )}
                  </div>

                  {/* Manual text input */}
                  <div className="mt-4">
                    <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                      Or paste resume text directly
                    </label>
                    <textarea
                      className="w-full h-32 bg-paper border border-border rounded-xl p-4 text-sm font-body text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                      placeholder="Paste your resume text here..."
                      value={resumeText}
                      onChange={e => setResumeText(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.html"
                      className="flex-1 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent file:text-white hover:file:bg-accent-dim file:cursor-pointer"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          await processFile(file);
                        }
                      }}
                      disabled={isProcessingFile}
                    />
                    {uploadedFileName && (
                      <button
                        onClick={() => {
                          setResumeText("");
                          setUploadedFileName(null);
                          setError(null);
                        }}
                        className="px-3 py-2 text-xs text-muted hover:text-accent transition-colors"
                        disabled={isProcessingFile}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                    Synthetic Profile (JSON)
                  </label>
                  <textarea
                    className="w-full h-56 bg-paper border border-border rounded-xl p-4 text-xs font-mono text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                    placeholder={'{\n  "name": "Jane Doe",\n  "headline": "...",\n  "explicit_skills": ["Python", "SQL"]\n}'}
                    value={jsonInput}
                    onChange={e => setJsonInput(e.target.value)}
                  />
                </>
              )}

              <div className="mt-4">
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                  GitHub URL (optional)
                </label>
                <input
                  type="url"
                  className="w-full bg-paper border border-border rounded-xl px-4 py-2.5 text-sm font-body text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="https://github.com/yourusername"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                  Technologies / Keywords (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {TECH_OPTIONS.map(t => (
                    <button
                      key={t}
                      onClick={() => toggleTech(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-display font-600 transition-all border ${
                        techs.includes(t)
                          ? "bg-ink text-paper border-ink"
                          : "bg-paper text-ink border-border hover:border-ink"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-2">
                  Add keywords to help guide recommendations.
                </p>
              </div>
            </div>

            {/* Right: preferences */}
            <div className="flex flex-col gap-6">
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-3">
                  Target Roles (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map(r => (
                    <button
                      key={r.id}
                      onClick={() => toggleRole(r.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-display font-600 transition-all border ${
                        targetRoles.includes(r.id)
                          ? "bg-ink text-paper border-ink"
                          : "bg-paper text-ink border-border hover:border-ink"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-2">Leave blank to auto-recommend</p>
              </div>

              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-3">
                  Budget
                </label>
                <div className="flex gap-2">
                  {["all", "free", "paid"].map(b => (
                    <button
                      key={b}
                      onClick={() => setBudget(b)}
                      className={`flex-1 py-2 rounded-lg text-sm font-display font-600 capitalize transition-all border ${
                        budget === b
                          ? "bg-accent text-white border-accent"
                          : "bg-paper text-muted border-border hover:border-accent/50"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                  Hours per Week: <span className="text-ink font-600">{hoursPerWeek}h</span>
                </label>
                <input
                  type="range" min={2} max={40} step={1}
                  value={hoursPerWeek}
                  onChange={e => setHoursPerWeek(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-muted mt-1">
                  <span>2h</span><span>40h</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-paper rounded-xl border border-border">
                <div>
                  <p className="text-sm font-display font-600 text-ink">Certification Focus</p>
                  <p className="text-xs text-muted">Surface official cert paths</p>
                </div>
                <button
                  onClick={() => setCertFocus(!certFocus)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${certFocus ? "bg-accent" : "bg-border"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${certFocus ? "translate-x-7" : "translate-x-1"}`} />
                </button>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="mt-6 w-full py-4 bg-ink text-paper font-display font-700 text-base rounded-xl hover:bg-accent-dim transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                    </svg>
                    Analyzing…
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1L11.5 7H17L12.5 10.5L14 17L9 13L4 17L5.5 10.5L1 7H6.5L9 1Z" fill="currentColor"/>
                    </svg>
                    Analyze My Profile
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-accent/10 border border-accent/30 rounded-xl text-sm text-accent">
            ⚠ {error}
          </div>
        )}
      </section>

      {/* ── RESULTS ── */}
      {result && (
        <div ref={resultsRef} className="max-w-5xl mx-auto px-6 pb-24 space-y-8">
          {/* Success Message */}
          <div className="p-4 bg-teal/10 border border-teal/30 rounded-xl text-sm text-teal-dim">
            ✅ Analysis completed successfully! Your resume data and recommendations have been saved to the database for future reference.
          </div>
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 space-y-1">
              {result.warnings.map((w, i) => <p key={i}>ℹ {w}</p>)}
            </div>
          )}

          {/* ── Profile Summary ── */}
          <section>
            <h2 className="font-display font-700 text-2xl text-ink mb-4">Profile Summary</h2>
            <div className="bg-white border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-display font-700 text-xl text-ink">{result.profile.headline}</p>
                  <p className="text-sm text-muted mt-1 font-mono">
                    Level: <span className="text-ink capitalize">{result.profile.seniority_inferred}</span>
                    &nbsp;·&nbsp; {result.extracted_skills.length} skills detected
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {result.extracted_skills.slice(0, 20).map(s => (
                  <Tag key={s.skill_id} label={s.label} variant={s.confidence > 0.85 ? "match" : "default"} />
                ))}
                {result.extracted_skills.length > 20 && (
                  <span className="text-xs text-muted font-mono self-center">+{result.extracted_skills.length - 20} more</span>
                )}
              </div>
              {result.profile.experience_bullets.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs font-mono text-muted uppercase tracking-wider mb-2">Experience Highlights</p>
                  <ul className="space-y-1">
                    {result.profile.experience_bullets.slice(0, 5).map((b, i) => (
                      <li key={i} className="text-sm text-ink flex gap-2">
                        <span className="text-accent mt-0.5 shrink-0">▸</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* ── Role Recommendations ── */}
          <section>
            <h2 className="font-display font-700 text-2xl text-ink mb-4">Role Recommendations</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.role_recommendations.map((role, idx) => (
                <button
                  key={role.role_id}
                  onClick={() => setActiveRole(role.role_id)}
                  className={`text-left p-5 rounded-2xl border transition-all ${
                    activeRole === role.role_id
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border bg-white hover:border-ink/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {idx === 0 && <span className="text-[10px] font-mono text-accent uppercase tracking-widest bg-accent/10 px-1.5 py-0.5 rounded">Top match</span>}
                  </div>
                  <p className="font-display font-700 text-lg text-ink">{role.display_name}</p>
                  <p className={`font-display font-800 text-3xl mt-1 ${scoreColor(role.match_score)}`}>
                    {role.match_score}%
                  </p>
                  <ScoreBar score={role.match_score} />
                  <div className="mt-3 flex gap-3 text-xs font-mono text-muted">
                    <span className="text-teal-dim">✓ {role.matched_skills.length} matched</span>
                    <span className="text-accent">✗ {role.missing_core_skills.length} core gaps</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Gap Analysis ── */}
          {activeRoleData && (
            <section>
              <h2 className="font-display font-700 text-2xl text-ink mb-4">
                Gap Analysis — <span className="text-accent">{activeRoleData.display_name}</span>
              </h2>
              <div className="bg-white border border-border rounded-2xl p-6 grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-mono text-muted uppercase tracking-wider mb-3">Match Score</p>
                  <div className="flex items-end gap-2">
                    <span className={`font-display font-800 text-5xl ${scoreColor(activeRoleData.match_score)}`}>
                      {activeRoleData.match_score}%
                    </span>
                  </div>
                  <ScoreBar score={activeRoleData.match_score} />
                </div>
                <div>
                  <p className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
                    ✓ You Have ({activeRoleData.matched_skills.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRoleData.matched_skills.map(s => <Tag key={s.skill_id} label={s.label} variant="match" />)}
                    {activeRoleData.matched_skills.length === 0 && <p className="text-xs text-muted">None detected</p>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
                    ✗ Core Gaps ({activeRoleData.missing_core_skills.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRoleData.missing_core_skills.map(s => <Tag key={s.skill_id} label={s.label} variant="missing" />)}
                    {activeRoleData.missing_optional_skills.slice(0, 4).map(s => <Tag key={s.skill_id} label={s.label} variant="default" />)}
                    {activeRoleData.missing_core_skills.length === 0 && <p className="text-xs text-teal-dim font-mono">No core gaps! 🎉</p>}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Learning Roadmap ── */}
          {activeRoadmap && activeRoleData && (
            <section>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h2 className="font-display font-700 text-2xl text-ink">
                  Learning Roadmap — <span className="text-accent">{activeRoleData.display_name}</span>
                </h2>
                <div className="flex gap-4 text-sm font-mono text-muted">
                  <span>{activeRoadmap.total_hours}h total</span>
                  <span>~{activeRoadmap.estimated_weeks} weeks @ {hoursPerWeek}h/wk</span>
                  <span className="text-teal-dim">{activeRoadmap.recommended_items.length} resources</span>
                </div>
              </div>

              {/* Top 3 Actions */}
              <div className="bg-ink text-paper rounded-2xl p-6 mb-5">
                <p className="font-mono text-xs text-paper/50 uppercase tracking-widest mb-3">⚡ Top 3 Next Actions</p>
                <ol className="space-y-2">
                  {activeRoadmap.recommended_items.slice(0, 3).map((item, i) => (
                    <li key={item.id} className="flex gap-3 items-start">
                      <span className="font-display font-800 text-accent text-lg shrink-0">{i + 1}</span>
                      <div>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="font-display font-600 text-paper hover:text-accent-light transition-colors">
                          {item.title}
                        </a>
                        <p className="text-xs text-paper/50 mt-0.5">
                          {item.provider} · {item.hours_estimate}h · <span className={item.cost_tag === "free" ? "text-teal" : "text-accent-light"}>{item.cost_tag}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Milestone Timeline */}
              {activeRoadmap.weekly_milestones.length > 0 && (
                <div className="space-y-3 mb-5">
                  <p className="text-xs font-mono text-muted uppercase tracking-wider">Weekly Milestones</p>
                  {activeRoadmap.weekly_milestones.map((m, mi) => (
                    <div key={mi} className="bg-white border border-border rounded-xl p-4 flex gap-4 items-start">
                      <div className="shrink-0 text-center">
                        <p className="font-display font-700 text-xs text-accent">{m.week_range}</p>
                        <p className="text-xs text-muted font-mono">{m.total_hours}h</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.items.map(id => {
                          const item = roadmapItemMap[id];
                          if (!item) return null;
                          return (
                            <a key={id} href={item.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper border border-border rounded-lg text-xs font-body text-ink hover:border-accent/50 transition-colors">
                              <span>{item.title}</span>
                              <Tag label={item.cost_tag} variant={item.cost_tag === "free" ? "free" : "paid"} />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Full course table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-mono text-xs text-muted uppercase">Course</th>
                      <th className="text-left py-2 px-3 font-mono text-xs text-muted uppercase">Provider</th>
                      <th className="text-left py-2 px-3 font-mono text-xs text-muted uppercase">Hours</th>
                      <th className="text-left py-2 px-3 font-mono text-xs text-muted uppercase">Cost</th>
                      <th className="text-left py-2 px-3 font-mono text-xs text-muted uppercase">Covers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRoadmap.recommended_items.map(item => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                        <td className="py-2.5 px-3">
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="font-display font-600 text-ink hover:text-accent transition-colors">
                            {item.title}
                          </a>
                          {item.priority === "core" && (
                            <span className="ml-2 text-[10px] font-mono text-accent uppercase bg-accent/10 px-1 rounded">core</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted">{item.provider}</td>
                        <td className="py-2.5 px-3 font-mono text-ink">{item.hours_estimate}h</td>
                        <td className="py-2.5 px-3">
                          <Tag label={item.cost_tag} variant={item.cost_tag === "free" ? "free" : "paid"} />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {item.covers_missing?.slice(0, 3).map(s => (
                              <span key={s} className="text-[10px] font-mono text-muted bg-paper border border-border px-1 rounded">{s}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Mock Interview ── */}
          {result.mock_questions.length > 0 && (
            <section>
              <h2 className="font-display font-700 text-2xl text-ink mb-4">
                Mock Interview Questions
              </h2>
              <p className="text-sm text-muted mb-4">
                Tailored for a <span className="text-ink font-600 capitalize">{result.profile.seniority_inferred}</span> targeting{" "}
                <span className="text-ink font-600">{activeRoleData?.display_name}</span>. Click to reveal expected answers.
              </p>
              <div className="space-y-3">
                {result.mock_questions.map((q, i) => (
                  <div key={i} className="bg-white border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                      className="w-full p-5 flex items-start gap-4 text-left hover:bg-paper/50 transition-colors"
                    >
                      <span className="font-display font-800 text-accent text-xl shrink-0 w-7">{i + 1}</span>
                      <span className="font-body text-ink leading-relaxed">{q.question}</span>
                      <span className={`ml-auto shrink-0 text-muted transition-transform ${expandedQ === i ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </button>
                    {expandedQ === i && q.one_line_answer && (
                      <div className="border-t border-border px-5 py-4 bg-teal/5">
                        <p className="text-xs font-mono text-muted uppercase tracking-wider mb-1">Expected Answer</p>
                        <p className="text-sm text-ink leading-relaxed">{q.one_line_answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Next Steps ── */}
          <section className="border border-border rounded-2xl p-8 bg-white">
            <div className="text-center mb-6">
              <p className="font-display font-700 text-xl text-ink mb-1">Ready for the Next Step?</p>
              <p className="text-sm text-muted">Explore your career path with our specialized tools</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href={`/mock-interview?role=${encodeURIComponent(activeRoleData?.display_name || 'Software Engineer')}`}
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
                href={`/roadmap?role=${encodeURIComponent(activeRoleData?.display_name || 'Software Engineer')}`}
                className="group p-6 border border-border rounded-xl hover:border-accent transition-colors text-center"
              >
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                    <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="font-display font-600 text-ink mb-1">Learning Roadmap</h3>
                <p className="text-xs text-muted">Follow your personalized learning plan</p>
              </a>

              <a
                href={`/gap-analysis?role=${encodeURIComponent(activeRoleData?.display_name || 'Software Engineer')}`}
                className="group p-6 border border-border rounded-xl hover:border-accent transition-colors text-center"
              >
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent">
                    <path d="M9 19V6L21 3V16M9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19ZM9 19L21 16M21 16C21 17.1046 21.8954 18 23 18C24.1046 18 25 17.1046 25 16C25 14.8954 24.1046 14 23 14C21.8954 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3 className="font-display font-600 text-ink mb-1">Gap Analysis</h3>
                <p className="text-xs text-muted">Compare against 100+ job descriptions</p>
              </a>
            </div>
          </section>
        </div>
      )}

      {/* Success Modal */}
      {showModal && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-teal/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-teal">
                  <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h2 className="font-display font-700 text-xl text-ink mb-2">Analysis Complete!</h2>
              <p className="text-muted text-sm">
                Your profile has been analyzed. Here are your top recommendations:
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {modalData.role_recommendations.slice(0, 2).map((rec, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-paper rounded-lg border border-border">
                  <div>
                    <p className="font-display font-600 text-ink text-sm">{rec.display_name}</p>
                    <p className="text-xs text-muted">Match: {rec.match_score}%</p>
                  </div>
                  <ScoreBar score={rec.match_score} />
                </div>
              ))}
              <p className="text-xs text-muted text-center">
                {modalData.extracted_skills.length} skills detected
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-display font-600 text-ink text-center">What would you like to do next?</p>
              <div className="grid grid-cols-1 gap-3">
                <a
                  href="/mock-interview"
                  className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
                  onClick={() => setShowModal(false)}
                >
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
                      <path d="M8 12L10 14L16 8M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-display font-600 text-ink text-sm">Mock Interviews</p>
                    <p className="text-xs text-muted">Practice with personalized questions</p>
                  </div>
                </a>

                <a
                  href="/roadmap"
                  className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
                  onClick={() => setShowModal(false)}
                >
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
                      <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-display font-600 text-ink text-sm">Learning Roadmap</p>
                    <p className="text-xs text-muted">Get your personalized study plan</p>
                  </div>
                </a>

                <a
                  href="/gap-analysis"
                  className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
                  onClick={() => setShowModal(false)}
                >
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
                      <path d="M9 19V6L21 3V16M9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19ZM9 19L21 16M21 16C21 17.1046 21.8954 18 23 18C24.1046 18 25 17.1046 25 16C25 14.8954 24.1046 14 23 14C21.8954 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-display font-600 text-ink text-sm">Gap Analysis</p>
                    <p className="text-xs text-muted">See your skill gaps vs job market</p>
                  </div>
                </a>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-4 py-2 text-sm text-muted hover:text-ink transition-colors"
            >
              View full results below
            </button>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-muted font-mono">Career Compass MVP · Built with Next.js + FastAPI + OpenAI</p>
      </footer>
    </main>
  );
}
