import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  timestamp,
  date,
  time,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const roleEnum = pgEnum("role", ["admin", "teacher", "student"]);
export const courseStatusEnum = pgEnum("course_status", ["draft", "published"]);
export const courseGroupEnum = pgEnum("course_group", ["takvimli", "esnek", "ucretsiz"]);
export const lessonTypeEnum = pgEnum("lesson_type", ["video", "quiz", "assign", "file"]);
export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "true_false",
  "open_ended",
]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "completed",
  "pending_review",
]);
export const submissionStatusEnum = pgEnum("submission_status", ["pending", "graded"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);
export const documentStatusEnum = pgEnum("document_status", ["pending", "coupon_issued", "rejected"]);

// ---------- Kullanıcılar & oturum ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("student"),
  // Süper eğitmen: tüm öğrencilere duyuru, belge/kupon ve anket sonuçlarına erişim
  isSuperTeacher: boolean("is_super_teacher").notNull().default(false),
  panelTheme: text("panel_theme").notNull().default(""),
  surveyVersion: integer("survey_version").notNull().default(0),
  surveySkipped: boolean("survey_skipped").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  // Cookie'deki ham token'ın sha256 hex hash'i
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(), // token hash
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------- Site ayarları / sayfalar / iletişim ----------

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Yasal metinler ve serbest sayfalar (kvkk, cerez-politikasi, ...)
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  html: text("html").notNull().default(""),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull().default(""),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Eğitmen profili ----------

export type SocialLinks = {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  website?: string;
};

export const instructors = pgTable("instructors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  bio: text("bio").notNull().default(""),
  photoUrl: text("photo_url").notNull().default(""),
  socialLinks: jsonb("social_links").$type<SocialLinks>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Kurslar ----------

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  shortDescription: text("short_description").notNull().default(""),
  description: text("description").notNull().default(""), // HTML
  imageUrl: text("image_url").notNull().default(""),
  status: courseStatusEnum("status").notNull().default("draft"),
  closed: boolean("closed").notNull().default(false),
  isFree: boolean("is_free").notNull().default(false),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
  saleTo: date("sale_to", { mode: "string" }),
  // takvimli (dönemli) / esnek / ucretsiz — kaydedilirken otomatik türetilir
  group: courseGroupEnum("group").notNull().default("esnek"),
  instructorId: integer("instructor_id").references(() => instructors.id, {
    onDelete: "set null",
  }),
  // Kursu oluşturan eğitmen (sahiplik)
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  outcomes: jsonb("outcomes").$type<string[]>().notNull().default([]),
  requirements: text("requirements").notNull().default(""),
  target: text("target").notNull().default(""),
  previewVideo: text("preview_video").notNull().default(""),
  durationText: text("duration_text").notNull().default(""),
  level: text("level").notNull().default("all"), // beginner|intermediate|advanced|all
  language: text("language").notNull().default("Türkçe"),
  hasCertificate: boolean("has_certificate").notNull().default(false),
  lifetime: boolean("lifetime").notNull().default(true),
  buttonType: text("button_type").notNull().default("cart"), // cart|whatsapp|both
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  whatsappMessage: text("whatsapp_message").notNull().default(""),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const modules = pgTable(
  "modules",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("modules_course_idx").on(t.courseId)]
);

// Ders: video / quiz / assign (görev) / file (korumalı dosya — ilerlemeye dahil değil)
export const lessons = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: integer("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    type: lessonTypeEnum("type").notNull().default("video"),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // video
    videoUrl: text("video_url").notNull().default(""),
    duration: text("duration").notNull().default(""), // "mm:ss" / "hh:mm:ss"
    preview: boolean("preview").notNull().default(false),
    description: text("description").notNull().default(""),
    // quiz / assign: göreli son teslim (gün). 0 = süresiz
    dueDays: integer("due_days").notNull().default(0),
    // file
    fileUrl: text("file_url").notNull().default(""),
    fileName: text("file_name").notNull().default(""),
    fileMime: text("file_mime").notNull().default(""),
  },
  (t) => [index("lessons_course_idx").on(t.courseId), index("lessons_module_idx").on(t.moduleId)]
);

// ---------- Dönemler ----------

export type ScheduleItem = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM veya ""
  title: string;
  link: string;
  notes?: string;
};

export const periods = pgTable(
  "periods",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    endDate: date("end_date", { mode: "string" }).notNull(),
    enrollmentDeadline: date("enrollment_deadline", { mode: "string" }),
    capacity: integer("capacity").notNull().default(20),
    description: text("description").notNull().default(""),
    schedule: jsonb("schedule").$type<ScheduleItem[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("periods_course_idx").on(t.courseId)]
);

// İlişkili kurslar: kaynak kurs tamamlanınca/satın alınınca hedef kurs önerilir (kişiye özel indirimle)
export const courseRelations = pgTable(
  "course_relations",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    relatedCourseId: integer("related_course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull().default("completed"), // completed | purchased
    discountPercent: integer("discount_percent").notNull().default(0), // 0 = indirimsiz öneri
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("course_relations_course_idx").on(t.courseId), uniqueIndex("course_relations_uq").on(t.courseId, t.relatedCourseId, t.trigger)]
);

// ---------- Kayıt & ilerleme ----------

export const enrollments = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    orderId: integer("order_id"),
    status: text("status").notNull().default("active"), // active|cancelled
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    // Öğrencinin player'ı ilk açtığı an — esnek kurslarda göreli sürelerin başlangıcı
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("enrollments_user_course_uq").on(t.userId, t.courseId)]
);

export const periodEnrollments = pgTable(
  "period_enrollments",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("period_enrollments_uq").on(t.periodId, t.userId)]
);

export const progress = pgTable(
  "progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("progress_uq").on(t.userId, t.lessonId),
    index("progress_user_course_idx").on(t.userId, t.courseId),
  ]
);

// ---------- Sınavlar ----------

export const quizzes = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    periodId: integer("period_id").references(() => periods.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    timeLimit: integer("time_limit").notNull().default(0), // dakika, 0 = sınırsız
    passScore: integer("pass_score").notNull().default(0), // 0 = geçme notu yok (otomatik geçer)
    maxAttempts: integer("max_attempts").notNull().default(1), // 0 = sınırsız
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    showCorrectAnswers: boolean("show_correct_answers").notNull().default(true),
    status: text("status").notNull().default("active"), // active|deleted
    extraDays: integer("extra_days"),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quizzes_course_idx").on(t.courseId)]
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull().default("multiple_choice"),
    text: text("text").notNull(),
    image: text("image").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    // multiple_choice: doğru şık indeksleri [2]; true_false: "true"|"false"; open_ended: null
    correct: jsonb("correct").$type<number[] | string | null>(),
    points: integer("points").notNull().default(1),
    explanation: text("explanation").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("quiz_questions_quiz_idx").on(t.quizId)]
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }), // yüzde
    totalPoints: integer("total_points").notNull().default(0),
    earnedPoints: numeric("earned_points", { precision: 7, scale: 2 }).notNull().default("0"),
    passed: boolean("passed"),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    // { [questionId]: number (şık indeksi) | "true"|"false" | string (açık uçlu) }
    answers: jsonb("answers").$type<Record<string, number | string>>().notNull().default({}),
    // Açık uçlu puanlama: { [questionId]: { points, feedback } }
    grades: jsonb("grades")
      .$type<Record<string, { points: number; feedback: string }>>()
      .notNull()
      .default({}),
    // Değerlendirme sonrası eğitmenin/adminin öğrenciye genel cevabı
    feedback: text("feedback").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    timeSpent: integer("time_spent").notNull().default(0),
  },
  (t) => [index("quiz_attempts_user_idx").on(t.userId), index("quiz_attempts_quiz_idx").on(t.quizId)]
);

// ---------- Görevler ----------

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    periodId: integer("period_id").references(() => periods.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueDate: timestamp("due_date", { withTimezone: true }),
    extraDays: integer("extra_days").notNull().default(0),
    isGraded: boolean("is_graded").notNull().default(false),
    maxScore: integer("max_score").notNull().default(100),
    allowFile: boolean("allow_file").notNull().default(true),
    allowVoice: boolean("allow_voice").notNull().default(true),
    allowText: boolean("allow_text").notNull().default(true),
    status: text("status").notNull().default("active"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assignments_course_idx").on(t.courseId)]
);

export type SubmissionFile = { url: string; name: string };
export type SubmissionVoice = { url: string; name?: string; duration?: number };

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    files: jsonb("files").$type<SubmissionFile[]>().notNull().default([]),
    voices: jsonb("voices").$type<SubmissionVoice[]>().notNull().default([]),
    voiceTranscript: jsonb("voice_transcript").$type<Record<string, string>>().notNull().default({}),
    score: integer("score"),
    feedback: text("feedback").notNull().default(""),
    gradedBy: integer("graded_by"),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    status: submissionStatusEnum("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("submissions_uq").on(t.assignmentId, t.userId)]
);

// ---------- Soru-cevap (öğrenci ↔ eğitmen) ----------

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    lessonTitle: text("lesson_title").notNull().default(""),
    text: text("text").notNull(),
    status: text("status").notNull().default("pending"), // pending|answered
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_user_course_idx").on(t.userId, t.courseId)]
);

export const questionAnswers = pgTable("question_answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  isInstructor: boolean("is_instructor").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Siparişler & kuponlar ----------

export type OrderItem = {
  courseId: number;
  title: string;
  price: number; // indirim öncesi birim fiyat
  periodId?: number | null;
  periodName?: string | null;
};

export type BillingInfo = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  identityNumber?: string;
};

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("pending"),
    items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    couponCode: text("coupon_code"),
    provider: text("provider").notNull().default("iyzico"), // iyzico|free|manual
    providerToken: text("provider_token"),
    providerPaymentId: text("provider_payment_id"),
    billing: jsonb("billing").$type<BillingInfo>(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("orders_user_idx").on(t.userId)]
);

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  percent: integer("percent").notNull(),
  // Sahibi (belge ile verilen kuponlar tek kullanıcıya kilitlidir); null = herkes
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  // null = tüm kurslar
  courseId: integer("course_id").references(() => courses.id, { onDelete: "cascade" }),
  usageLimit: integer("usage_limit").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Belge yükleme (öğrenci/mezun indirimi başvurusu)
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  note: text("note").notNull().default(""),
  status: documentStatusEnum("status").notNull().default("pending"),
  couponCode: text("coupon_code"),
  courseId: integer("course_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Sertifikalar ----------

export type CertField = {
  x: number; // yüzde
  y: number;
  size: number; // px
  color: string;
  align: "left" | "center" | "right";
  weight: "400" | "600" | "700";
  font: string;
  caps: boolean;
  spacing: number;
};
export type CertFields = {
  name: CertField;
  course: CertField;
  date: CertField & { enabled: boolean };
  qr: { enabled: boolean; x: number; y: number; size: number };
};
export type CertRule = {
  scope: "all" | "course";
  courseId: number;
  condition: "enrolled" | "started" | "completed";
  // true → koşul "completed" ise kurs %100 olduğu anda sertifika otomatik tanımlanır
  auto?: boolean;
};

export const certificateTemplates = pgTable("certificate_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  imageWidth: integer("image_width").notNull().default(1600),
  imageHeight: integer("image_height").notNull().default(1131),
  fields: jsonb("fields").$type<CertFields>().notNull(),
  rule: jsonb("rule").$type<CertRule>().notNull(),
  sampleName: text("sample_name").notNull().default("Ayşe Yılmaz"),
  sampleCourse: text("sample_course").notNull().default("Örnek Eğitim"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const issuedCertificates = pgTable(
  "issued_certificates",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => certificateTemplates.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // Verildiği anda dondurulur — profil değişse de belge değişmez
    holderName: text("holder_name").notNull(),
    courseName: text("course_name").notNull(),
    token: text("token").notNull().unique(),
    issuedBy: integer("issued_by"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("issued_cert_uq").on(t.templateId, t.userId, t.courseId)]
);

// ---------- Bildirimler ----------

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull().default(""),
    tag: text("tag").notNull().default(""),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read)]
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLog = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull().default("push"), // push|reminder|mail
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  target: text("target").notNull().default(""),
  sentCount: integer("sent_count").notNull().default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Zamanlanmış hatırlatmaların tekrar gönderilmemesi için
export const sentKeys = pgTable("sent_keys", {
  key: text("key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Anket ----------

export type SurveyCondition = { q: string; op: "in" | "not_in" | "filled" | "empty"; val?: string[] };
export type SurveyQuestion = {
  key: string;
  section: string;
  step: number;
  type: "radio" | "checkbox" | "text" | "textarea" | "date";
  required: boolean;
  label: string;
  help?: string;
  options?: { value: string; label: string }[];
  showIf?: SurveyCondition[];
};

/** Çoklu anket: tanım satır olarak tutulur; cevaplar surveyAnswers'ta surveyKey ile bağlanır. */
export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  intro: text("intro").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft|published
  sections: jsonb("sections").$type<Record<string, string>>().notNull().default({}),
  questions: jsonb("questions").$type<SurveyQuestion[]>().notNull().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Anketi tamamlayanlar (soru cevapsız bile olsa tamamlama işareti) */
export const surveyCompletions = pgTable(
  "survey_completions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyKey: text("survey_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("survey_completions_uq").on(t.userId, t.surveyKey)]
);

export const surveyAnswers = pgTable(
  "survey_answers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyKey: text("survey_key").notNull(),
    questionKey: text("question_key").notNull(),
    value: jsonb("value").$type<string | string[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("survey_answers_uq").on(t.userId, t.surveyKey, t.questionKey)]
);

// ---------- Eğitmen takvimi ----------

export const teacherEvents = pgTable("teacher_events", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  color: text("color").notNull().default("#0b2a5e"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointmentSlots = pgTable("appointment_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
  slotDate: date("slot_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  capacity: integer("capacity").notNull().default(1),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id")
    .notNull()
    .references(() => appointmentSlots.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull(),
  courseId: integer("course_id"),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  status: text("status").notNull().default("booked"), // booked|cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


// ---------- Öğrenci notları (ders+saniye bağlı ya da genel) ----------

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id").references(() => courses.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    lessonTitle: text("lesson_title").notNull().default(""),
    seconds: integer("seconds"), // null = genel not
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [index("notes_user_idx").on(t.userId, t.courseId)]
);

// ---------- Kurs önerileri (öğrenci → kurs; cevaplanmaz, kurs başına en çok 5) ----------

export const courseSuggestions = pgTable(
  "course_suggestions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("course_suggestions_user_idx").on(t.userId, t.courseId)]
);

// ---------- Tipler ----------

export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Period = typeof periods.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Instructor = typeof instructors.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CertificateTemplate = typeof certificateTemplates.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type IssuedCertificate = typeof issuedCertificates.$inferSelect;
