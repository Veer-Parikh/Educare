import { Link } from "react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-subtle text-muted">
          <Compass className="size-6" />
        </span>
        <p className="mt-6 font-display text-5xl font-semibold">404</p>
        <h1 className="mt-2 text-lg font-semibold">This page wandered off</h1>
        <p className="mt-1 text-sm text-muted">The link may be broken, or you might not have access to it.</p>
        <Button asChild className="mt-6">
          <Link to="/app">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
