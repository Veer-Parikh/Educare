import { prisma } from "./prisma.js";

/**
 * Fan out an in-app notification. Never throws: a failed notification must not
 * fail the action that triggered it.
 * @param {string[]} userIds
 * @param {{ type: string, title: string, body?: string, link?: string }} payload
 */
export async function notify(userIds, payload) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title.slice(0, 200),
        body: payload.body?.slice(0, 500),
        link: payload.link,
      })),
    });
  } catch (err) {
    console.warn("[notify] failed:", err.message);
  }
}
