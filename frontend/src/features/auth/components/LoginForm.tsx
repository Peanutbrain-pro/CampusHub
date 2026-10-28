/**
 * @file LoginForm.tsx
 * @description Modern shadcn/ui login & registration form block supporting custom unique handles,
 *              tabbed switching, real-time availability checks, and offline mock fallback.
 * @owner Platform Core Team
 */

import React, { useState, useEffect } from "react";
import { Loader2, Check, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authService } from "../services/authService";
import { useDebounce } from "@/lib/use-debounce";
import type { UserProfile } from "@/shared/user";
import { toast } from "sonner";

interface LoginFormProps {
  mode?: "signin" | "signup";
  onModeChange?: (mode: "signin" | "signup") => void;
  isMock: boolean;
  onSuccess: (profile: UserProfile) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  mode: controlledMode,
  onModeChange,
  isMock,
  onSuccess,
}) => {
  const [internalMode, setInternalMode] = useState<"signin" | "signup">(controlledMode || "signin");

  // Keep internal state aligned if parent passes down a new mode
  useEffect(() => {
    if (controlledMode) {
      setInternalMode(controlledMode);
    }
  }, [controlledMode]);

  const currentMode = controlledMode || internalMode;

  const handleSetMode = (nextMode: "signin" | "signup") => {
    setInternalMode(nextMode);
    onModeChange?.(nextMode);
    setHandleStatus({ available: null });
  };

  // Sign-in identifier (accepts either username or email)
  const [identifier, setIdentifier] = useState("");

  // Sign-up specific fields
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleStatus, setHandleStatus] = useState<{
    available: boolean | null;
    error?: string;
  }>({ available: null });

  // Debounced handle for real-time validation & availability check
  const debouncedHandle = useDebounce(handle.trim(), 300);

  useEffect(() => {
    let isCancelled = false;

    async function evaluateHandle() {
      if (currentMode !== "signup" || !debouncedHandle) {
        setHandleStatus({ available: null });
        setIsCheckingHandle(false);
        return;
      }

      const validation = authService.validateHandle(debouncedHandle);
      if (!validation.valid) {
        setHandleStatus({ available: false, error: validation.error });
        setIsCheckingHandle(false);
        return;
      }

      setIsCheckingHandle(true);
      const res = await authService.checkHandleAvailability(debouncedHandle, isMock);

      if (!isCancelled) {
        setIsCheckingHandle(false);
        setHandleStatus({
          available: res.available,
          error: res.error,
        });
      }
    }

    evaluateHandle();

    return () => {
      isCancelled = true;
    };
  }, [debouncedHandle, currentMode, isMock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentMode === "signin") {
      if (!identifier.trim() || !password) {
        toast.error("Please enter your username (or email) and password.");
        return;
      }

      setIsLoading(true);
      const res = await authService.login(identifier, password, isMock);
      setIsLoading(false);

      if (res.error) {
        toast.error(res.error.message);
        return;
      }

      if (res.data) {
        toast.success(`Welcome back, ${res.data.fullName || res.data.handle}!`);
        onSuccess(res.data);
      }
    } else {
      // Sign-up validation
      const cleanHandle = handle.trim().toLowerCase();
      if (!cleanHandle) {
        toast.error("Please choose a username.");
        return;
      }
      if (!fullName.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
      if (!email.trim()) {
        toast.error("Please enter your email.");
        return;
      }
      if (!password || password.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }

      // Check handle status
      if (handleStatus.available === false) {
        toast.error(handleStatus.error || "Please choose a valid and available username.");
        return;
      }

      // If check is still pending or wasn't triggered yet
      if (handleStatus.available === null) {
        const val = authService.validateHandle(cleanHandle);
        if (!val.valid) {
          toast.error(val.error || "Invalid username format.");
          return;
        }
        setIsLoading(true);
        const check = await authService.checkHandleAvailability(val.cleanHandle, isMock);
        if (!check.available) {
          setIsLoading(false);
          toast.error(check.error || "This username is already taken.");
          return;
        }
      }

      setIsLoading(true);
      const res = await authService.signUp(email, password, fullName, cleanHandle, isMock);
      setIsLoading(false);

      if (res.error) {
        toast.error(res.error.message);
        return;
      }

      if (res.data) {
        if (res.data.requiresVerification) {
          toast.info("Account created! Please check your email inbox to verify your account, then sign in.", {
            duration: 6000,
          });
          handleSetMode("signin");
          setIdentifier(cleanHandle);
        } else {
          toast.success(`Account @${res.data.handle} created successfully!`);
          onSuccess(res.data);
        }
      }
    }
  };

  const handleQuickFill = (presetEmail: string, presetPass: string) => {
    setIdentifier(presetEmail);
    setPassword(presetPass);
    toast.info(`Filled test credentials for ${presetEmail}`);
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="space-y-3 text-center pb-3">
        {/* Sign In / Sign Up Tabs */}
        <Tabs
          value={currentMode}
          onValueChange={(val) => handleSetMode(val as "signin" | "signup")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-1">
          <CardTitle className="text-xl font-bold tracking-tight">
            {currentMode === "signin" ? "Login to your account" : "Create an account"}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {currentMode === "signin"
              ? "Enter your username or email and password below"
              : "Choose a unique username and register for CampusHub"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {currentMode === "signup" ? (
            <>
              {/* Unique Username / Handle Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="handle">Username</Label>
                  {isCheckingHandle && (
                    <span className="flex items-center text-[11px] text-muted-foreground">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Checking...
                    </span>
                  )}
                  {!isCheckingHandle && handleStatus.available === true && debouncedHandle && (
                    <span className="flex items-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Available
                    </span>
                  )}
                  {!isCheckingHandle && handleStatus.available === false && (
                    <span className="flex items-center text-[11px] font-medium text-destructive">
                      <AlertCircle className="mr-1 h-3.5 w-3.5" />
                      {handleStatus.error || "Unavailable"}
                    </span>
                  )}
                </div>

                <Input
                  id="handle"
                  type="text"
                  placeholder="unique_username"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  required
                  disabled={isLoading}
                  autoComplete="username"
                />
                <p className="text-[11px] text-muted-foreground">
                  4–20 characters. Lowercase letters, numbers, and underscores only.
                </p>
              </div>

              {/* Full Name Field */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email">University Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@university.edu"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            /* Sign In: Identifier Field (Username or Email) */
            <div className="space-y-2">
              <Label htmlFor="identifier">Username or Email</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="username or email"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          )}

          {/* Password Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {currentMode === "signin" && (
                <a
                  href="#forgot"
                  onClick={(e) => {
                    e.preventDefault();
                    toast.info("Password reset instructions will be sent to your account's email.");
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                >
                  Forgot password?
                </a>
              )}
            </div>
            <Input
              id="password"
              type="password"
              placeholder={currentMode === "signup" ? "At least 6 characters" : undefined}
              autoComplete={currentMode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full font-medium cursor-pointer"
            disabled={isLoading || (currentMode === "signup" && isCheckingHandle)}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading
              ? currentMode === "signin"
                ? "Signing in..."
                : "Creating account..."
              : currentMode === "signin"
                ? "Sign In"
                : "Create Account"}
          </Button>
        </form>

        {/* Quick Mock Role Fill Helper when running offline */}
        {isMock && currentMode === "signin" && (
          <div className="mt-4 pt-3 border-t text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground mb-2">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Quick Test Logins (Mock Mode):</span>
            </div>
            <div className="flex justify-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleQuickFill("student@campushub.edu", "password123")}
              >
                Student
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleQuickFill("moderator@campushub.edu", "password123")}
              >
                Moderator
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleQuickFill("admin@campushub.edu", "password123")}
              >
                Admin
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 text-center text-xs">
          <span className="text-muted-foreground">
            {currentMode === "signin" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button
            type="button"
            onClick={() => handleSetMode(currentMode === "signin" ? "signup" : "signin")}
            className="font-medium text-primary hover:underline underline-offset-4 cursor-pointer"
          >
            {currentMode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
