import { eq, and, not } from "drizzle-orm";
import { db } from "../../config/db";
import { notifications } from "../../db/schema/notifications";
import { AppError } from "../../middleware/error.middleware";


// --CREATE NOTIFICATION --

export const createNotification = async (input: {
    userId: string,
    type: 'session' | 'group' | 'ai' | 'system',
    title: string,
    body: string,
    linTo?: string
}) => {
    const [notification] = await db.insert(notifications).values(input).returning()
    return notification
}

// --GET USER NOTIFICATION
export const getUserNotifications = async (userId: string) => {
    return db.select().from(notifications).where(eq(notifications.userId, userId))
        .orderBy(notifications.createdAt)
}


//  -- MARK AS READ --
export const markAsRead = async (notificationId: string, userId: string) => {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);

  if (!notification) throw new AppError("Notification not found", 404);
  if (notification.userId !== userId) throw new AppError("Access denied", 403);

  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, notificationId))
    .returning();

  return updated;
};

// -- MARK ALL AS READ --
export const markAllAsRead = async (userId: string) => {
    await db.update(notifications).set({ read: true }).where(
        and(
            eq(notifications.userId, userId), eq(notifications.read, false)
        )
    )

    return {message: 'All notifications marked as read'}
}

// --  DELETE NOTIFICATION --

export const deleteNotification = async (notificationId: string, userId: string) => {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1)

    if (!notification) throw new AppError('Notification not found', 404)
    if (notification.userId !== userId) throw new AppError('Access denied', 403)
    
    await db.delete(notifications).where(eq(notifications.id, notificationId))
    
    return {message: 'Notification deleted'}
}