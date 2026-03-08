"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "Software Engineer";
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  useEffect(() => {
    // For demo purposes, generate a sample roadmap
    // In a real app, this would come from the analysis results
    const sampleRoadmap: Roadmap = {
      recommended_items: [
        {
          id: "1",
          title: "AWS Certified Solutions Architect",
          url: "https://aws.amazon.com/certification/",
          provider: "Amazon Web Services",
          skills_covered: ["Cloud Architecture", "AWS Services", "Security"],
          hours_estimate: 80,
          cost_tag: "paid",
          covers_missing: ["Cloud Architecture", "AWS"],
          priority: "core"
        },
        {
          id: "2",
          title: "Docker & Kubernetes Fundamentals",
          url: "https://www.udemy.com/course/docker-kubernetes/",
          provider: "Udemy",
          skills_covered: ["Containerization", "Orchestration", "DevOps"],
          hours_estimate: 12,
          cost_tag: "paid",
          covers_missing: ["Docker", "Kubernetes"],
          priority: "core"
        },
        {
          id: "3",
          title: "Python for Data Science",
          url: "https://www.coursera.org/learn/python-for-data-science",
          provider: "Coursera",
          skills_covered: ["Python", "Data Analysis", "Pandas"],
          hours_estimate: 20,
          cost_tag: "free",
          covers_missing: ["Python", "Data Science"],
          priority: "optional"
        }
      ],
      weekly_milestones: [
        {
          week_range: "Weeks 1-2",
          items: ["1"],
          total_hours: 80
        },
        {
          week_range: "Weeks 3-4",
          items: ["2"],
          total_hours: 12
        },
        {
          week_range: "Weeks 5-8",
          items: ["3"],
          total_hours: 20
        }
      ],
      total_hours: 112,
      estimated_weeks: 8
    };

    setRoadmap(sampleRoadmap);
    setLoading(false);
  }, [role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted">Loading roadmap...</p>
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