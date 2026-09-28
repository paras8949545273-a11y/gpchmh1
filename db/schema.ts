import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const students = pgTable("students", {
  id: serial().primaryKey(),
  username: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  admissionNumber: text("admission_number").notNull(),
  name: text().notNull().default(""),
  fatherName: text("father_name").notNull().default(""),
  dob: text().notNull().default(""),
  branch: text().notNull().default(""),
  academicSession: text("academic_session").notNull().default(""),
  address: text().notNull().default(""),
  photoKey: text("photo_key").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: serial().primaryKey(),
  studentId: integer("student_id").notNull().unique().references(() => students.id, { onDelete: "cascade" }),
  applicationNumber: text("application_number").notNull().unique(),
  name: text().notNull(),
  fatherName: text("father_name").notNull(),
  admissionNumber: text("admission_number").notNull(),
  dob: text().notNull(),
  branch: text().notNull(),
  academicSession: text("academic_session").notNull(),
  address: text().notNull(),
  photoKey: text("photo_key").notNull(),
  status: text().notNull().default("pending"),
  rejectionReason: text("rejection_reason").notNull().default(""),
  adminNotes: text("admin_notes").notNull().default(""),
  serialNumber: text("serial_number").notNull().default(""),
  dateOfIssue: text("date_of_issue").notNull().default(""),
  validUpto: text("valid_upto").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const portalSessions = pgTable("portal_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  role: text().notNull(),
  studentId: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portalSettings = pgTable("portal_settings", {
  id: integer().primaryKey(),
  collegeName: text("college_name").notNull(),
  affiliation: text().notNull(),
});
