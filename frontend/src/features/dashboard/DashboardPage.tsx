import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Code2,
  Database,
  FileText,
  GitBranch,
  GraduationCap,
  MessageCircle,
  Monitor,
  Network,
  Sparkles,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { subjects } from "@/shared/subjects";

const subjectMeta: Record<string, { icon: React.ElementType; description: string }> = {
  cs301: { icon: Database, description: "Explore databases, relational schemas, and SQL queries." },
  cs302: { icon: Network, description: "Learn networking protocols, routing, and transport fundamentals." },
  cs303: { icon: Monitor, description: "Understand processes, scheduling, virtual memory, and concurrency." },
  cs304: { icon: Code2, description: "Practice algorithmic design patterns and computational complexity." },
};

const learningTools = [
  {
    title: "Resume Reviewer",
    description: "Improve your resume for placements with automated feedback.",
    icon: FileText,
    href: "/resume-reviewer",
    label: "Review",
  },
  {
    title: "Daily Quiz",
    description: "Test your knowledge daily and maintain your streak.",
    icon: Brain,
    href: "/daily-quiz",
    label: "Practice",
  },
  {
    title: "Project Analysis",
    description: "Analyze code repositories, complexity, and dependencies.",
    icon: GitBranch,
    href: "/project-analysis",
    label: "Explore",
  },
];

const sampleDiscussions = [
  {
    title: "Difference between BCNF and 3NF decomposition",
    subject: "DBMS",
    subjectId: "cs301",
    preview: "Review normalization rules and lossless join dependencies.",
    replies: 5,
  },
  {
    title: "How does Go-Back-N handle lost ACKs?",
    subject: "CN",
    subjectId: "cs302",
    preview: "Discuss timer mechanics, cumulative acknowledgments, and window sizes.",
    replies: 13,
  },
  {
    title: "Extra questions on end-semester preparation",
    subject: "DBMS",
    subjectId: "cs301",
    preview: "Share useful questions and past examination resources.",
    replies: 45,
  },
  {
    title: "PYQ question has a mistake in subnet mask",
    subject: "CN",
    subjectId: "cs302",
    preview: "Discuss the question breakdown and official answer key correction.",
    replies: 11,
  },
];

export default function DashboardPage() {
  const today = new Date();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    today
  );

  const [calendarMonth, setCalendarMonth] = useState<Date>(today);

  return (
    <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1600px] space-y-2 p-3 sm:p-4 lg:p-5">
        {/* Welcome section */}
        <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <GraduationCap className="size-4" />
              <span>Your learning space</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome to CampusHub!
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Manage your subjects and track your academic progress.
            </p>
          </div>

          <div className="flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
            <Sparkles className="size-4 text-primary" />
            Your daily learning space
          </div>
        </section>

        {/* Subjects and calendar */}
        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
          {/* My Subjects */}
          <Card className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div>
                <CardTitle className="text-base font-semibold">
                  My Subjects
                </CardTitle>

                <p className="mt-1 text-xs text-muted-foreground">
                  Your current learning subjects
                </p>
              </div>

              <BookOpen className="size-5 text-muted-foreground" />
            </CardHeader>

            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {subjects.map((subject) => {
                  const meta = subjectMeta[subject.id] || {
                    icon: BookOpen,
                    description: "Access course materials and notes.",
                  };
                  const Icon = meta.icon;

                  return (
                    <Link
                      key={subject.id}
                      to={`/subjects/${subject.id}`}
                      className="group block min-h-[105px] rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                          <Icon className="size-4" />
                        </div>

                        <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          {subject.code}
                        </span>
                      </div>

                      <h3 className="mt-3 text-sm font-semibold leading-5">
                        {subject.name}
                      </h3>

                      <p className="mt-1 text-xs leading-4 text-muted-foreground">
                        {meta.description}
                      </p>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <CheckCircle2 className="size-4" />
                <span>{subjects.length} subjects available in your workspace</span>
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <CardHeader className="border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-5 text-muted-foreground" />

                <div>
                  <CardTitle className="text-base font-semibold">
                    Calendar
                  </CardTitle>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Keep track of your days
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4 flex flex-col items-center">
              <Calendar
                mode="single"
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={selectedDate}
                onSelect={setSelectedDate}
                showOutsideDays
                className="w-full flex justify-center p-0"
              />

              <div className="mt-3 w-full rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-xs font-semibold">
                      {selectedDate
                        ? selectedDate.toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "No date selected"}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Select a date to view it here.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Learning tools and discussions */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Learning & Placement Tools */}
          <Card className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <CardHeader className="border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <GraduationCap className="size-5 text-muted-foreground" />

                <div>
                  <CardTitle className="text-base font-semibold">
                    Learning & Placement Tools
                  </CardTitle>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Tools for learning and career preparation
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-wrap gap-3 p-3 sm:p-4">
              {learningTools.map((tool) => {
                const Icon = tool.icon;

                return (
                  <Link
                    key={tool.title}
                    to={tool.href}
                   className="group inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {tool.title}
                      </h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {tool.description}
                      </p>
                    </div>

                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                      {tool.label}
                      <ArrowUpRight className="size-3.5" />
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {/* Recent Community Discussions */}
          <Card className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <MessageCircle className="size-5 text-muted-foreground" />

                <div>
                  <CardTitle className="text-base font-semibold">
                    Recent Community Discussions
                  </CardTitle>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Active forum topics across your subjects
                  </p>
                </div>
              </div>

              <Link
                to="/communities"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Browse All
                <ArrowUpRight className="size-3.5" />
              </Link>
            </CardHeader>

            <CardContent className="space-y-2 p-3 sm:p-4">
              {sampleDiscussions.map((discussion) => (
                <Link
                  key={discussion.title}
                  to={`/communities?subject=${discussion.subjectId}`}
                  className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="shrink-0 rounded border border-border bg-muted px-2 py-1 text-[10px] font-semibold">
                        #{discussion.subject}
                      </span>

                      <h3 className="text-xs font-semibold leading-5 sm:text-sm">
                        {discussion.title}
                      </h3>
                    </div>

                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageCircle className="size-3" />
                      {discussion.replies}
                    </span>
                  </div>

                  <p className="mt-2 pl-1 text-xs leading-4 text-muted-foreground">
                    {discussion.preview}
                  </p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>CampusHub — Your campus, your community, your growth.</p>
          <p>Built to support your learning journey.</p>
        </footer>
      </div>
    </div>
  );
}
