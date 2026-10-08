import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ClassesPage = lazy(() => import("@/pages/classes/ClassesPage"));
const ClassPage = lazy(() => import("@/pages/classes/ClassPage"));
const AssignmentPage = lazy(() => import("@/pages/assignments/AssignmentPage"));
const TutorPage = lazy(() => import("@/pages/tutor/TutorPage"));
const StudioPage = lazy(() => import("@/pages/studio/StudioPage"));
const StudySetPage = lazy(() => import("@/pages/studio/StudySetPage"));
const DecksPage = lazy(() => import("@/pages/flashcards/DecksPage"));
const DeckPage = lazy(() => import("@/pages/flashcards/DeckPage"));
const ReviewPage = lazy(() => import("@/pages/flashcards/ReviewPage"));
const QuizzesPage = lazy(() => import("@/pages/quizzes/QuizzesPage"));
const QuizPage = lazy(() => import("@/pages/quizzes/QuizPage"));
const QuizResultsPage = lazy(() => import("@/pages/quizzes/QuizResultsPage"));
const QuizEditorPage = lazy(() => import("@/pages/quizzes/QuizEditorPage"));
const RoadmapsPage = lazy(() => import("@/pages/roadmaps/RoadmapsPage"));
const RoadmapPage = lazy(() => import("@/pages/roadmaps/RoadmapPage"));
const ProgressPage = lazy(() => import("@/pages/progress/ProgressPage"));
const FocusPage = lazy(() => import("@/pages/focus/FocusPage"));
const SpacePage = lazy(() => import("@/pages/play/SpacePage"));
const LessonPlannerPage = lazy(() => import("@/pages/tools/LessonPlannerPage"));
const PaperGeneratorPage = lazy(() => import("@/pages/tools/PaperGeneratorPage"));
const AnswerCheckerPage = lazy(() => import("@/pages/tools/AnswerCheckerPage"));
const LibraryPage = lazy(() => import("@/pages/tools/LibraryPage"));
const ArtifactPage = lazy(() => import("@/pages/tools/ArtifactPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark className="size-12 animate-pulse" />
    </div>
  );
}

function ServerDown() {
  const { refresh } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto size-12" />
        <h1 className="mt-6 text-xl font-semibold">Can't reach EduCare</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">The server isn't responding. Check your connection — if you're running locally, make sure the API is started.</p>
        <Button className="mt-6" onClick={refresh}>
          <RefreshCw /> Try again
        </Button>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "error") return <ServerDown />;
  if (status !== "authenticated") return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <AppShell />;
}

function PublicOnly() {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authenticated") return <Navigate to="/app" replace />;
  return (
    <Suspense fallback={<Splash />}>
      <Outlet />
    </Suspense>
  );
}

function RootFallback() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NotFound />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<Splash />}>
        <Landing />
      </Suspense>
    ),
  },
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },
    ],
  },
  {
    path: "/app",
    element: <RequireAuth />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "classes", element: <ClassesPage /> },
      { path: "classes/:classId/:tab?", element: <ClassPage /> },
      { path: "assignments/:id", element: <AssignmentPage /> },
      { path: "tutor/:id?", element: <TutorPage /> },
      { path: "studio", element: <StudioPage /> },
      { path: "studio/:id", element: <StudySetPage /> },
      { path: "flashcards", element: <DecksPage /> },
      { path: "flashcards/:deckId", element: <DeckPage /> },
      { path: "review", element: <ReviewPage /> },
      { path: "quizzes", element: <QuizzesPage /> },
      { path: "quizzes/:id", element: <QuizPage /> },
      { path: "quizzes/:id/results", element: <QuizResultsPage /> },
      { path: "quizzes/:id/edit", element: <QuizEditorPage /> },
      { path: "roadmaps", element: <RoadmapsPage /> },
      { path: "roadmaps/:id", element: <RoadmapPage /> },
      { path: "progress", element: <ProgressPage /> },
      { path: "focus", element: <FocusPage /> },
      { path: "play/space", element: <SpacePage /> },
      { path: "tools/lesson", element: <LessonPlannerPage /> },
      { path: "tools/paper", element: <PaperGeneratorPage /> },
      { path: "tools/answer-check", element: <AnswerCheckerPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "library/:id", element: <ArtifactPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "*", element: <RootFallback /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
