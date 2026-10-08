import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import StudentView from "./StudentView";
import TeacherView from "./TeacherView";

export default function AssignmentPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["assignment", id], queryFn: () => api.get(`/assignments/${id}`) });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (error) return <EmptyState icon={ClipboardList} title="Assignment not found" description="It may have been deleted, or you're not in this class." />;
  return data.isTeacher ? <TeacherView data={data} /> : <StudentView data={data} />;
}
