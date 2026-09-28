import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../../db/index.js";
import { applications, portalSessions, portalSettings, students } from "../../db/schema.js";

const scrypt = promisify(scryptCallback);
const DEFAULT_COLLEGE_NAME = "Government Polytechnic College, Hanumangarh";
const DEFAULT_AFFILIATION = "Approved by AICTE, New Delhi & Affiliated to BTER, Jodhpur";
const VALID_STATUSES = new Set(["pending", "under_review", "approved", "rejected"]);

type Session = { role: string; studentId: number | null };

function photoStore() {
  return getStore("student-application-photos");
}

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function passwordHash(password: string, salt: string) {
  return (await scrypt(password, salt, 64) as Buffer).toString("hex");
}

async function createSession(role: "student" | "admin", studentId: number | null = null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(portalSessions).values({ tokenHash: tokenHash(token), role, studentId, expiresAt });
  return { token, role, expiresAt: expiresAt.toISOString() };
}

async function authenticate(req: Request): Promise<Session | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const [session] = await db.select().from(portalSessions).where(and(
    eq(portalSessions.tokenHash, tokenHash(token)),
    gt(portalSessions.expiresAt, new Date()),
  )).limit(1);
  return session ? { role: session.role, studentId: session.studentId } : null;
}

async function settingsRecord() {
  const [record] = await db.select().from(portalSettings).where(eq(portalSettings.id, 1)).limit(1);
  return record || { collegeName: DEFAULT_COLLEGE_NAME, affiliation: DEFAULT_AFFILIATION };
}

async function photoData(photoKey: string) {
  if (!photoKey) return "";
  return (await photoStore().get(photoKey, { type: "text" }) as string | null) || "";
}

function studentView(row: typeof students.$inferSelect, photo = "") {
  return {
    username: row.username,
    admissionNumber: row.admissionNumber,
    name: row.name,
    fatherName: row.fatherName,
    dob: row.dob,
    branch: row.branch,
    session: row.academicSession,
    address: row.address,
    photo,
    createdAt: row.createdAt.toISOString(),
  };
}

function applicationView(row: typeof applications.$inferSelect, username: string, photo = "") {
  return {
    applicationNumber: row.applicationNumber,
    username,
    name: row.name,
    fatherName: row.fatherName,
    admissionNumber: row.admissionNumber,
    dob: row.dob,
    branch: row.branch,
    session: row.academicSession,
    address: row.address,
    photo,
    status: row.status,
    rejectionReason: row.rejectionReason,
    adminNotes: row.adminNotes,
    serialNumber: row.serialNumber,
    dateOfIssue: row.dateOfIssue,
    validUpto: row.validUpto,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() || "",
    approvedAt: row.approvedAt?.toISOString() || "",
  };
}

async function stateFor(session: Session | null) {
  const config = await settingsRecord();
  if (!session) return { config, students: {}, applications: {} };

  if (session.role === "student" && session.studentId) {
    const [student] = await db.select().from(students).where(eq(students.id, session.studentId)).limit(1);
    if (!student) return { config, students: {}, applications: {} };
    const [application] = await db.select().from(applications).where(eq(applications.studentId, student.id)).limit(1);
    const photo = await photoData(application?.photoKey || student.photoKey);
    return {
      config,
      students: { [student.username]: studentView(student, photo) },
      applications: application ? { [student.username]: applicationView(application, student.username, photo) } : {},
    };
  }

  if (session.role === "admin") {
    const studentRows = await db.select().from(students);
    const applicationRows = await db.select().from(applications);
    const usernames = new Map(studentRows.map((s) => [s.id, s.username]));
    const photoPairs = await Promise.all(applicationRows.map(async (a) => [a.id, await photoData(a.photoKey)] as const));
    const photoMap = new Map(photoPairs);
    return {
      config,
      students: Object.fromEntries(studentRows.map((s) => [s.username, studentView(s)])),
      applications: Object.fromEntries(applicationRows.map((a) => {
        const username = usernames.get(a.studentId) || "";
        return [username, applicationView(a, username, photoMap.get(a.id) || "")];
      })),
    };
  }

  return { config, students: {}, applications: {} };
}

async function savePhoto(studentId: number, dataUrl: string, previousKey = "") {
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl) || dataUrl.length > 2_800_000) {
    throw new Error("Photo must be a JPG, PNG or WebP image under 2 MB.");
  }
  const key = `students/${studentId}/${randomBytes(12).toString("hex")}`;
  await photoStore().set(key, dataUrl);
  if (previousKey) await photoStore().delete(previousKey);
  return key;
}

export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/portal\/?/, "");

    if (req.method === "GET" && route === "state") {
      const session = await authenticate(req);
      if (req.headers.has("authorization") && !session) return json({ error: "Please log in again." }, 401);
      return json(await stateFor(session));
    }

    if (req.method === "POST" && route === "register") {
      const body = await req.json();
      const username = clean(body.username, 40).toLowerCase();
      const admissionNumber = clean(body.admissionNumber, 60);
      const password = String(body.password || "");
      if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 6 || !admissionNumber) {
        return json({ error: "Use a 3–40 character username and a password of at least 6 characters." }, 400);
      }
      const [existing] = await db.select({ id: students.id }).from(students).where(eq(students.username, username)).limit(1);
      if (existing) return json({ error: "That username is already taken." }, 409);
      const salt = randomBytes(16).toString("hex");
      const [student] = await db.insert(students).values({
        username,
        admissionNumber,
        passwordSalt: salt,
        passwordHash: await passwordHash(password, salt),
      }).returning();
      return json(await createSession("student", student.id), 201);
    }

    if (req.method === "POST" && route === "login") {
      const body = await req.json();
      const username = clean(body.username, 40).toLowerCase();
      const [student] = await db.select().from(students).where(eq(students.username, username)).limit(1);
      if (!student) return json({ error: "Incorrect username or password." }, 401);
      const supplied = Buffer.from(await passwordHash(String(body.password || ""), student.passwordSalt), "hex");
      const expected = Buffer.from(student.passwordHash, "hex");
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return json({ error: "Incorrect username or password." }, 401);
      }
      return json(await createSession("student", student.id));
    }

    if (req.method === "POST" && route === "admin-login") {
      const body = await req.json();
      const expectedUser = process.env.ADMIN_USERNAME || "admin";
      const expectedPass = process.env.ADMIN_PASSWORD || "admin123";
      const userOk = timingSafeEqual(
        createHash("sha256").update(clean(body.username, 100)).digest(),
        createHash("sha256").update(expectedUser).digest(),
      );
      const passOk = timingSafeEqual(
        createHash("sha256").update(String(body.password || "")).digest(),
        createHash("sha256").update(expectedPass).digest(),
      );
      if (!userOk || !passOk) return json({ error: "Incorrect admin credentials." }, 401);
      return json(await createSession("admin"));
    }

    const session = await authenticate(req);
    if (!session) return json({ error: "Please log in again." }, 401);

    if (req.method === "POST" && route === "logout") {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      await db.delete(portalSessions).where(eq(portalSessions.tokenHash, tokenHash(token)));
      return new Response(null, { status: 204 });
    }

    if (req.method === "PUT" && route === "application" && session.role === "student" && session.studentId) {
      const body = await req.json();
      const [student] = await db.select().from(students).where(eq(students.id, session.studentId)).limit(1);
      const [current] = await db.select().from(applications).where(eq(applications.studentId, session.studentId)).limit(1);
      if (current && current.status !== "rejected") return json({ error: "Only rejected applications can be resubmitted." }, 409);
      const required = ["name", "fatherName", "admissionNumber", "dob", "branch", "session", "address"];
      if (required.some((field) => !clean(body[field], 1000))) return json({ error: "Complete every required field." }, 400);
      let photoKey = current?.photoKey || student.photoKey;
      if (body.photo && body.photo !== "unchanged") photoKey = await savePhoto(student.id, String(body.photo), photoKey);
      if (!photoKey) return json({ error: "Please upload a student photo." }, 400);
      const values = {
        name: clean(body.name, 160), fatherName: clean(body.fatherName, 160),
        admissionNumber: clean(body.admissionNumber, 60), dob: clean(body.dob, 20),
        branch: clean(body.branch, 160), academicSession: clean(body.session, 60),
        address: clean(body.address, 1000), photoKey, status: "pending", rejectionReason: "",
        approvedAt: null, submittedAt: new Date(),
      };
      if (current) {
        await db.update(applications).set(values).where(eq(applications.id, current.id));
      } else {
        await db.insert(applications).values({
          ...values, studentId: student.id,
          applicationNumber: `GPC-${randomBytes(4).toString("hex").toUpperCase()}`,
        });
      }
      await db.update(students).set({
        name: values.name, fatherName: values.fatherName, admissionNumber: values.admissionNumber,
        dob: values.dob, branch: values.branch, academicSession: values.academicSession,
        address: values.address, photoKey,
      }).where(eq(students.id, student.id));
      return json({ ok: true });
    }

    if (req.method === "PUT" && route === "admin/application" && session.role === "admin") {
      const body = await req.json();
      const [current] = await db.select().from(applications).where(eq(applications.applicationNumber, clean(body.applicationNumber, 40))).limit(1);
      if (!current) return json({ error: "Application not found." }, 404);
      const status = clean(body.status, 30) || current.status;
      if (!VALID_STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
      const serialNumber = clean(body.serialNumber, 80);
      const dateOfIssue = clean(body.dateOfIssue, 20);
      const validUpto = clean(body.validUpto, 20);
      const rejectionReason = status === "approved" ? "" : clean(body.rejectionReason, 1000);
      if (status === "approved" && (!serialNumber || !dateOfIssue || !validUpto)) return json({ error: "Certification details are required before approval." }, 400);
      if (status === "rejected" && !rejectionReason) return json({ error: "A rejection reason is required." }, 400);
      const update = {
        name: clean(body.name, 160), fatherName: clean(body.fatherName, 160),
        admissionNumber: clean(body.admissionNumber, 60), dob: clean(body.dob, 20),
        branch: clean(body.branch, 160), academicSession: clean(body.session, 60), address: clean(body.address, 1000),
        serialNumber, dateOfIssue, validUpto, adminNotes: clean(body.adminNotes, 2000), rejectionReason, status,
        reviewedAt: status === "pending" ? current.reviewedAt : new Date(),
        approvedAt: status === "approved" ? new Date() : current.approvedAt,
      };
      await db.update(applications).set(update).where(eq(applications.id, current.id));
      if (status === "approved") {
        await db.update(students).set({
          name: update.name, fatherName: update.fatherName, admissionNumber: update.admissionNumber,
          dob: update.dob, branch: update.branch, academicSession: update.academicSession, address: update.address,
          photoKey: current.photoKey,
        }).where(eq(students.id, current.studentId));
      }
      return json({ ok: true });
    }

    if (req.method === "PUT" && route === "settings" && session.role === "admin") {
      const body = await req.json();
      const values = { id: 1, collegeName: clean(body.collegeName, 200), affiliation: clean(body.affiliation, 300) };
      if (!values.collegeName || !values.affiliation) return json({ error: "Both settings are required." }, 400);
      await db.insert(portalSettings).values(values).onConflictDoUpdate({ target: portalSettings.id, set: values });
      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return json({ error: message.includes("duplicate key") ? "That record already exists." : message }, 500);
  }
};

export const config: Config = { path: "/api/portal/*" };
