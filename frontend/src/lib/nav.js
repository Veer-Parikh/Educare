import {
  BarChart3,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  FileQuestion,
  GalleryVerticalEnd,
  Home,
  Library,
  ListChecks,
  NotebookPen,
  Orbit,
  Route,
  School,
  Settings,
  Sparkles,
  Timer,
} from "lucide-react";

/** Sidebar / command palette navigation per role. */
export const NAV = {
  STUDENT: [
    {
      items: [
        { to: "/app", label: "Home", icon: Home, end: true },
        { to: "/app/classes", label: "Classes", icon: School },
      ],
    },
    {
      section: "Learn",
      items: [
        { to: "/app/tutor", label: "AI Tutor", icon: Bot, keywords: "chat help doubt ask" },
        { to: "/app/studio", label: "Study Studio", icon: Sparkles, keywords: "summary notes notebook" },
        { to: "/app/flashcards", label: "Flashcards", icon: GalleryVerticalEnd, badge: "due", keywords: "cards review spaced repetition" },
        { to: "/app/quizzes", label: "Quizzes", icon: ListChecks, keywords: "practice test" },
        { to: "/app/roadmaps", label: "Roadmaps", icon: Route, keywords: "plan path learning" },
      ],
    },
    {
      section: "Grow",
      items: [
        { to: "/app/progress", label: "Progress", icon: BarChart3, keywords: "mastery xp streak stats" },
        { to: "/app/focus", label: "Focus timer", icon: Timer, keywords: "pomodoro study" },
        { to: "/app/play/space", label: "Space Explorer", icon: Orbit, keywords: "game solar system planets" },
      ],
    },
  ],
  TEACHER: [
    {
      items: [
        { to: "/app", label: "Home", icon: Home, end: true },
        { to: "/app/classes", label: "Classes", icon: School },
      ],
    },
    {
      section: "Teach",
      items: [
        { to: "/app/tools/lesson", label: "Lesson planner", icon: NotebookPen, keywords: "plan lesson" },
        { to: "/app/tools/paper", label: "Question papers", icon: FileQuestion, keywords: "exam test paper generator" },
        { to: "/app/tools/answer-check", label: "Answer checker", icon: ClipboardCheck, keywords: "grade handwritten evaluate" },
        { to: "/app/quizzes", label: "Quizzes", icon: ListChecks, keywords: "assessment" },
        { to: "/app/library", label: "Library", icon: Library, keywords: "saved artifacts" },
      ],
    },
    {
      section: "Assistants",
      items: [
        { to: "/app/tutor", label: "AI Tutor", icon: Bot },
        { to: "/app/studio", label: "Study Studio", icon: Sparkles },
        { to: "/app/flashcards", label: "Flashcards", icon: GalleryVerticalEnd },
      ],
    },
  ],
};

export const SETTINGS_ITEM = { to: "/app/settings", label: "Settings", icon: Settings };
export const EXTRA_ITEMS = [{ to: "/app/review", label: "Review due cards", icon: BookOpenCheck, keywords: "flashcards review" }];
