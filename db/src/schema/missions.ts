import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("active"),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const missionSteps = pgTable("mission_steps", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").references(() => missions.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  completed: boolean("completed").notNull().default(false),
  order: integer("order").notNull().default(0),
  appKey: text("app_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMissionSchema = createInsertSchema(missions).omit({ id: true, createdAt: true, completedAt: true });
export const insertMissionStepSchema = createInsertSchema(missionSteps).omit({ id: true, createdAt: true });

export type Mission = typeof missions.$inferSelect;
export type MissionStep = typeof missionSteps.$inferSelect;
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type InsertMissionStep = z.infer<typeof insertMissionStepSchema>;
