"use client";

import { useState, useEffect } from "react";

interface RoadmapItem {
  id: string;
  title: string;
  url: string;
  provider: string;
  skills_covered: string[];
  hours_estimate: number;
  cost_tag: string;
  covers_missing: string[];
  priority: string;
}

interface Milestone {
  week_range: string;
  items: string[];
  total_hours: number;
}

interface Roadmap {
  recommended_items: RoadmapItem[];
  weekly_milestones: Milestone[];
  total_hours: number;
  estimated_weeks: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RoadmapPage() {
  const [role, setRole] = useState("Software Engineer");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    if (r) setRole(r);
  }, []);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [personalizedIntro, setPersonalizedIntro] = useState<string | null>(null);

  useEffect(() => {
    // try load a roadmap from the most recent analysis
    const stored = localStorage.getItem('lastAnalysis');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const choice: Roadmap | undefined = data.selected_roadmaps?.[role];
        if (choice) {
          setRoadmap(choice);

          // Generate personalized introduction
          generatePersonalizedIntro(data, choice);
        }
      } catch {}
    }
    // no fallback
    setLoading(false);
  }, [role]);

  const generatePersonalizedIntro = async (analysisData: any, roadmapData: any) => {
    try {
      const response = await fetch(`${API_BASE}/generate-roadmap-intro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role_name: role,
          user_profile: analysisData.profile,
          skills_data: {
            total_hours: roadmapData.total_hours,
            estimated_weeks: roadmapData.estimated_weeks,
            item_count: roadmapData.recommended_items.length
          },
        }),
      });
      const result = await response.json();
      setPersonalizedIntro(result.introduction);
    } catch (error) {
      console.warn('Failed to generate personalized introduction:', error);
    }
  };

  if (roadmap === null) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h2 className="font-display font-700 text-xl text-ink mb-2">No Roadmap Yet</h2>
          <p className="text-muted text-sm mb-6">
            Upload your resume and run an analysis to get a personalized learning roadmap tailored to your skill gaps.
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

  if (!roadmap) return null;

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
            <span className="font-display font-700 text-lg tracking-tight text-ink">Learning Roadmap</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono">{roadmap.total_hours}h total</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-display font-700 text-3xl text-ink mb-2">
            Learning Roadmap: {role}
          </h1>
          <p className="text-muted text-lg">
            Your personalized learning path to become a {role}. Complete in ~{roadmap.estimated_weeks} weeks.
          </p>
          {personalizedIntro && (
            <div className="mt-4 p-4 bg-accent/5 border border-accent/20 rounded-xl">
              <p className="text-ink text-base leading-relaxed">{personalizedIntro}</p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-border rounded-xl p-6 text-center">
            <div className="text-3xl font-display font-800 text-accent mb-1">{roadmap.total_hours}h</div>
            <div className="text-sm text-muted font-mono uppercase tracking-wider">Total Time</div>
          </div>
          <div className="bg-white border border-border rounded-xl p-6 text-center">
            <div className="text-3xl font-display font-800 text-accent mb-1">{roadmap.estimated_weeks}</div>
            <div className="text-sm text-muted font-mono uppercase tracking-wider">Weeks</div>
          </div>
          <div className="bg-white border border-border rounded-xl p-6 text-center">
            <div className="text-3xl font-display font-800 text-accent mb-1">{roadmap.recommended_items.length}</div>
            <div className="text-sm text-muted font-mono uppercase tracking-wider">Resources</div>
          </div>
        </div>

        {/* Weekly Milestones */}
        <div className="space-y-6 mb-12">
          <h2 className="font-display font-700 text-2xl text-ink">Weekly Milestones</h2>
          {roadmap.weekly_milestones.map((milestone, idx) => (
            <div key={idx} className="bg-white border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-600 text-xl text-ink">{milestone.week_range}</h3>
                <span className="text-sm text-muted font-mono">{milestone.total_hours}h</span>
              </div>
              <div className="space-y-3">
                {milestone.items.map(itemId => {
                  const item = roadmap.recommended_items.find(i => i.id === itemId);
                  if (!item) return null;
                  return (
                    <div key={itemId} className="flex items-center gap-4 p-3 bg-cream rounded-lg">
                      <div className="flex-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display font-600 text-ink hover:text-accent transition-colors"
                        >
                          {item.title}
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted">{item.provider}</span>
                          <span className="text-xs text-muted">•</span>
                          <span className="text-xs text-muted">{item.hours_estimate}h</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            item.cost_tag === 'free' ? 'bg-teal/10 text-teal' : 'bg-accent/10 text-accent'
                          }`}>
                            {item.cost_tag}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedItem(selectedItem === itemId ? null : itemId)}
                        className="text-sm text-accent hover:text-accent-dim"
                      >
                        {selectedItem === itemId ? 'Hide' : 'Details'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Full Resource List */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="font-display font-700 text-2xl text-ink">All Resources</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream">
                <tr>
                  <th className="text-left py-3 px-6 font-mono text-xs text-muted uppercase tracking-wider">Resource</th>
                  <th className="text-left py-3 px-6 font-mono text-xs text-muted uppercase tracking-wider">Provider</th>
                  <th className="text-left py-3 px-6 font-mono text-xs text-muted uppercase tracking-wider">Hours</th>
                  <th className="text-left py-3 px-6 font-mono text-xs text-muted uppercase tracking-wider">Cost</th>
                  <th className="text-left py-3 px-6 font-mono text-xs text-muted uppercase tracking-wider">Priority</th>
                </tr>
              </thead>
              <tbody>
                {roadmap.recommended_items.map(item => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                    <td className="py-4 px-6">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-600 text-ink hover:text-accent transition-colors"
                      >
                        {item.title}
                      </a>
                    </td>
                    <td className="py-4 px-6 text-muted">{item.provider}</td>
                    <td className="py-4 px-6 font-mono text-ink">{item.hours_estimate}h</td>
                    <td className="py-4 px-6">
                      <span className={`text-xs px-2 py-1 rounded ${
                        item.cost_tag === 'free' ? 'bg-teal/10 text-teal' : 'bg-accent/10 text-accent'
                      }`}>
                        {item.cost_tag}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-xs px-2 py-1 rounded ${
                        item.priority === 'core' ? 'bg-accent/10 text-accent' : 'bg-muted/10 text-muted'
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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