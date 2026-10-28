/**
 * @file routes.tsx
 * @description Route definitions for Auth feature supporting both /login and /signup entrypoints.
 * @owner Platform Core Team
 */

import type { RouteObject } from "react-router-dom";
import LoginPage from "./LoginPage";

export const authRoutes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage initialMode="signin" />,
  },
  {
    path: "/signup",
    element: <LoginPage initialMode="signup" />,
  },
];

// Single route export fallback
export const authRoute: RouteObject = authRoutes[0];
