import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { subjects } from "@/shared/subjects";
import { useAuth } from "@/lib/auth-context";
import { communitiesService } from "@/features/communities/services";
import type { Post } from "@/features/communities/services/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const today = new Date();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(today);
  const [calendarMonth, setCalendarMonth] = useState<Date>(today);
  const [hotPosts, setHotPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadHotPosts() {
      try {
        setLoadingPosts(true);
        const postPromises = subjects.map((subject) =>
          communitiesService.getPosts(subject.id, "hot")
        );
        const results = await Promise.all(postPromises);

        const allPosts: Post[] = [];
        for (const res of results) {
          if (res.data) {
            allPosts.push(...res.data);
          }
        }

        // Sort by net upvotes & activity
        allPosts.sort(
          (a, b) =>
            b.upvotes - b.downvotes + b.replyCount * 2 -
            (a.upvotes - a.downvotes + a.replyCount * 2)
        );

        if (isMounted) {
          setHotPosts(allPosts.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to load hot community posts:", err);
      } finally {
        if (isMounted) {
          setLoadingPosts(false);
        }
      }
    }

    void loadHotPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-full w-full min-w-0 bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Simple Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back{user?.fullName ? `, ${user.fullName}` : user?.handle ? `, @${user.handle}` : ""}.
          </p>
        </div>

        {/* Subjects & Calendar Grid */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          {/* My Subjects */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="text-base font-semibold">
                My Subjects
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {subjects.map((subject) => (
                  <Link
                    key={subject.id}
                    to={`/subjects/${subject.id}`}
                    className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs"
                  >
                    <div className="space-y-1">
                      <span className="font-mono text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                        {subject.code}
                      </span>
                      <h2 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {subject.name}
                      </h2>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="text-base font-semibold">
                Calendar
              </CardTitle>
            </CardHeader>

            <CardContent className="flex justify-center p-4">
              <Calendar
                mode="single"
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={selectedDate}
                onSelect={setSelectedDate}
                showOutsideDays
                className="p-0"
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent Hot Community Posts */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-4">
            <CardTitle className="text-base font-semibold">
              Recent Posts in Your Subjects
            </CardTitle>

            <Link
              to="/communities"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              All Communities
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {loadingPosts ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading posts...
              </div>
            ) : hotPosts.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No recent discussions in your followed subjects.
              </div>
            ) : (
              <div className="space-y-2">
                {hotPosts.map((post) => {
                  const subject = subjects.find((s) => s.id === post.subjectId);

                  return (
                    <Link
                      key={post.id}
                      to="/communities"
                      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[11px] font-medium"
                        >
                          {subject?.code || post.subjectId.toUpperCase()}
                        </Badge>

                        <h3 className="line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                          {post.title}
                        </h3>
                      </div>

                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
