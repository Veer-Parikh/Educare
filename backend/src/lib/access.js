import { prisma } from "./prisma.js";
import { forbidden, notFound } from "./errors.js";
import { isObjectId } from "./ids.js";

/**
 * Resolve a classroom and the caller's relationship to it.
 * Non-members get a 404 so class ids can't be probed.
 */
export async function classAccess(classroomId, user, { teacher = false } = {}) {
  if (!isObjectId(classroomId)) throw notFound("Class");
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) throw notFound("Class");

  const isTeacher = classroom.teacherId === user.id;
  let isMember = isTeacher;
  if (!isTeacher) {
    const m = await prisma.membership.findUnique({
      where: { classroomId_userId: { classroomId, userId: user.id } },
      select: { id: true },
    });
    isMember = Boolean(m);
  }
  if (!isMember) throw notFound("Class");
  if (teacher && !isTeacher) throw forbidden("Only this class's teacher can do that.");
  return { classroom, isTeacher };
}

/** Ids of every class the user teaches or has joined. */
export async function myClassIds(user) {
  if (user.role === "TEACHER") {
    const rows = await prisma.classroom.findMany({ where: { teacherId: user.id }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.membership.findMany({ where: { userId: user.id }, select: { classroomId: true } });
  return rows.map((r) => r.classroomId);
}

/** Student user ids enrolled in a class. */
export async function classStudentIds(classroomId) {
  const rows = await prisma.membership.findMany({ where: { classroomId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** Load an entity by id or throw 404 (also rejects malformed ids). */
export async function findOr404(delegate, id, what, args = {}) {
  if (!isObjectId(id)) throw notFound(what);
  const row = await delegate.findUnique({ where: { id }, ...args });
  if (!row) throw notFound(what);
  return row;
}
