CREATE TYPE "public"."file_type" AS ENUM('pdf', 'docx', 'txt', 'image', 'other');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"type" "file_type" DEFAULT 'other' NOT NULL,
	"has_ai_summary" boolean DEFAULT false NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_answers" ALTER COLUMN "answer" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "quiz_questions" ALTER COLUMN "correct_answer" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_ai_chat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_ai_response" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "goals" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "availability" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;