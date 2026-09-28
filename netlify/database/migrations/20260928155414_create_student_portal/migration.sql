CREATE TABLE "applications" (
	"id" serial PRIMARY KEY,
	"student_id" integer NOT NULL UNIQUE,
	"application_number" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"father_name" text NOT NULL,
	"admission_number" text NOT NULL,
	"dob" text NOT NULL,
	"branch" text NOT NULL,
	"academic_session" text NOT NULL,
	"address" text NOT NULL,
	"photo_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"serial_number" text DEFAULT '' NOT NULL,
	"date_of_issue" text DEFAULT '' NOT NULL,
	"valid_upto" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"token_hash" text PRIMARY KEY,
	"role" text NOT NULL,
	"student_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_settings" (
	"id" integer PRIMARY KEY,
	"college_name" text NOT NULL,
	"affiliation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"admission_number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"father_name" text DEFAULT '' NOT NULL,
	"dob" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"academic_session" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"photo_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;