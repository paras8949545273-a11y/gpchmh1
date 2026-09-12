/* =========================================================================
   Student ID Card Portal — app logic
   Storage: browser localStorage (no backend). Data lives per-browser/device.
   See README.md for what this means and how it differs from a real
   server-backed deployment.
   ========================================================================= */

// ---- Fixed admin credentials. Change these before you deploy. ----------
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

const DEFAULT_COLLEGE_NAME = "Government Polytechnic College, Hanumangarh";
const DEFAULT_AFFILIATION = "Approved by AICTE, New Delhi & Affiliated to BTER, Jodhpur";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

const STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
};

// ---- Storage helpers -----------------------------------------------------
const DB = {
  students() { return JSON.parse(localStorage.getItem("sid_students") || "{}"); },
  saveStudents(v) { localStorage.setItem("sid_students", JSON.stringify(v)); },
  applications() { return JSON.parse(localStorage.getItem("sid_applications") || "{}"); },
  saveApplications(v) { localStorage.setItem("sid_applications", JSON.stringify(v)); },
  config() {
    return Object.assign(
      { collegeName: DEFAULT_COLLEGE_NAME, affiliation: DEFAULT_AFFILIATION },
      JSON.parse(localStorage.getItem("sid_config") || "{}")
    );
  },
  saveConfig(v) { localStorage.setItem("sid_config", JSON.stringify(v)); },
  nextCounter() {
    const n = parseInt(localStorage.getItem("sid_app_counter") || "0", 10) + 1;
    localStorage.setItem("sid_app_counter", String(n));
    return n;
  },
};

function getSession() { return JSON.parse(sessionStorage.getItem("sid_session") || "null"); }
function setSession(s) { sessionStorage.setItem("sid_session", JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem("sid_session"); }

// ---- Password hashing -----------------------------------------------------
// Note: this hashes passwords with SHA-256 in the browser so nothing is
// stored in plain text. It is NOT equivalent to real server-side auth
// (salting, rate limiting, secret-side verification) — see README.md.
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- Small utils -----------------------------------------------------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function todayISO() { return new Date().toISOString(); }
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function clone(tplId) { return document.getElementById(tplId).content.cloneNode(true); }
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function slug(s) { return (s || "student").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

// ---- Router -----------------------------------------------------
const app = document.getElementById("app");
const navArea = document.getElementById("navArea");
const sideNav = document.getElementById("sideNav");

function navigate(route) { location.hash = route; }
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

const STUDENT_NAV = [
  { route: "s/dashboard", label: "Dashboard" },
  { route: "s/profile", label: "My Profile" },
  { route: "s/apply", label: "ID Card Application" },
  { route: "s/status", label: "Application Status" },
];
const ADMIN_NAV = [
  { route: "a/dashboard", label: "Dashboard" },
  { route: "a/applications", label: "Applications" },
  { route: "a/students", label: "Students" },
  { route: "a/settings", label: "Settings" },
];

function render() {
  const raw = (location.hash || "#home").slice(1);
  const parts = raw.split("/");
  const route = parts[0] === "s" || parts[0] === "a" ? parts[0] + "/" + parts[1] : parts[0];
  const param = parts[2];
  const session = getSession();

  applyBranding();
  app.innerHTML = "";
  renderTopNav(session);
  renderSideNav(session, route);

  if (route.startsWith("s/") && (!session || session.type !== "student")) return navigate("student-auth");
  if (route.startsWith("a/") && (!session || session.type !== "admin")) return navigate("admin-auth");

  switch (route) {
    case "student-auth": return renderStudentAuth();
    case "admin-auth": return renderAdminAuth();
    case "s/dashboard": return renderStudentDashboard(session.username);
    case "s/profile": return renderStudentProfile(session.username);
    case "s/apply": return renderApplicationPage(session.username);
    case "s/status": return renderStatusPage(session.username);
    case "a/dashboard": return renderAdminDashboard();
    case "a/applications": return renderAdminApplications();
    case "a/application": return renderAdminApplicationDetail(param);
    case "a/students": return renderAdminStudents();
    case "a/settings": return renderAdminSettings();
    default: return renderHome();
  }
}

function applyBranding() {
  const cfg = DB.config();
  document.getElementById("letterheadCollegeName").textContent = cfg.collegeName;
  document.getElementById("letterheadAffiliation").textContent = cfg.affiliation;
}

function renderTopNav(session) {
  navArea.innerHTML = "";
  if (session) {
    const btn = el(`<button class="btn-secondary">Log out</button>`);
    btn.onclick = () => { clearSession(); navigate("home"); };
    navArea.appendChild(btn);
  }
}

function renderSideNav(session, currentRoute) {
  sideNav.innerHTML = "";
  const items = session && session.type === "student" ? STUDENT_NAV
    : session && session.type === "admin" ? ADMIN_NAV
    : null;
  if (!items) { sideNav.classList.add("hidden"); return; }
  sideNav.classList.remove("hidden");
  items.forEach(item => {
    const a = el(`<a href="#${item.route}">${item.label}</a>`);
    if (item.route === currentRoute) a.classList.add("active");
    sideNav.appendChild(a);
  });
}

// =============================================================
// Home
// =============================================================
function renderHome() {
  app.appendChild(clone("tpl-home"));
  app.querySelectorAll("[data-goto]").forEach(btn => { btn.onclick = () => navigate(btn.dataset.goto); });
}

// =============================================================
// Student auth
// =============================================================
function renderStudentAuth() {
  app.appendChild(clone("tpl-student-auth"));
  const tabs = app.querySelectorAll(".auth-tab");
  const loginForm = app.querySelector("#studentLoginForm");
  const registerForm = app.querySelector("#studentRegisterForm");

  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      loginForm.classList.toggle("hidden", !isLogin);
      registerForm.classList.toggle("hidden", isLogin);
    };
  });

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const username = fd.get("username").trim();
    const password = fd.get("password");
    const students = DB.students();
    const errorEl = app.querySelector("#loginError");
    const record = students[username];
    if (!record || record.passwordHash !== await hashPassword(password)) {
      errorEl.textContent = "Incorrect username or password.";
      return;
    }
    errorEl.textContent = "";
    setSession({ type: "student", username });
    navigate("s/dashboard");
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    const username = fd.get("username").trim();
    const password = fd.get("password");
    const admissionNumber = fd.get("admissionNumber").trim();
    const students = DB.students();
    const errorEl = app.querySelector("#registerError");
    if (!username || !password || !admissionNumber) return;
    if (students[username]) { errorEl.textContent = "That username is already taken."; return; }
    students[username] = {
      passwordHash: await hashPassword(password),
      admissionNumber,
      name: "", fatherName: "", dob: "", branch: "", session: "", address: "", photo: "",
      createdAt: todayISO(),
    };
    DB.saveStudents(students);
    errorEl.textContent = "";
    setSession({ type: "student", username });
    navigate("s/dashboard");
  };
}

// =============================================================
// Student dashboard
// =============================================================
function renderStudentDashboard(username) {
  app.appendChild(clone("tpl-student-dashboard"));
  const students = DB.students();
  const student = students[username];
  const applications = DB.applications();
  const application = applications[username];

  const statusRow = app.querySelector("#studentStatRow");
  const tiles = [
    { label: "Admission No.", value: student.admissionNumber || "—", cls: "" },
    { label: "Branch", value: student.branch || "—", cls: "" },
    { label: "Session", value: student.session || "—", cls: "" },
    { label: "ID Card Status", value: application ? STATUS_LABELS[application.status] : "Not applied", cls: application ? application.status : "" },
  ];
  tiles.forEach(t => {
    statusRow.appendChild(el(`
      <div class="stat-tile ${t.cls}">
        <span class="num" style="font-size:16px;">${escapeHtml(t.value)}</span>
        <span class="label">${t.label}</span>
      </div>
    `));
  });

  const actionCard = app.querySelector("#dashboardActionCard");
  if (!application) {
    actionCard.appendChild(el(`
      <div class="action-card">
        <p class="section-note" style="margin-bottom:16px;">You haven't submitted an ID card application yet.</p>
        <button class="btn-primary" id="goApplyBtn">Apply for ID Card</button>
      </div>
    `));
    actionCard.querySelector("#goApplyBtn").onclick = () => navigate("s/apply");
  } else {
    const card = el(`<div class="action-card"></div>`);
    card.appendChild(el(`<p class="status-label">Application ${escapeHtml(application.applicationNumber)}</p>`));
    card.appendChild(el(`<p class="status-value ${application.status}">${STATUS_LABELS[application.status]}</p>`));
    if (application.status === "rejected" && application.rejectionReason) {
      card.appendChild(el(`<div class="rejection-reason"><b>Reason:</b> ${escapeHtml(application.rejectionReason)}</div>`));
    }
    const row = el(`<div class="download-row"></div>`);
    const viewBtn = el(`<button class="btn-secondary">View Application</button>`);
    viewBtn.onclick = () => navigate("s/status");
    row.appendChild(viewBtn);
    if (application.status === "approved") {
      const dlBtn = el(`<button class="btn-primary">View / Download ID Card</button>`);
      dlBtn.onclick = () => navigate("s/status");
      row.appendChild(dlBtn);
    }
    if (application.status === "rejected") {
      const editBtn = el(`<button class="btn-primary">Correct &amp; Resubmit</button>`);
      editBtn.onclick = () => navigate("s/apply");
      row.appendChild(editBtn);
    }
    card.appendChild(row);
    actionCard.appendChild(card);
  }
}

// =============================================================
// Student profile (read-only — edits happen through the application flow)
// =============================================================
function renderStudentProfile(username) {
  app.appendChild(clone("tpl-student-profile"));
  const student = DB.students()[username];
  const body = app.querySelector("#profileCardBody");

  if (!student.name) {
    body.appendChild(el(`<p class="section-note">Your profile will be filled in once you submit your first ID card application.</p>`));
    const btn = el(`<button class="btn-primary">Go to application</button>`);
    btn.onclick = () => navigate("s/apply");
    body.appendChild(btn);
    return;
  }

  const dl = el(`<dl class="profile-grid"></dl>`);
  if (student.photo) {
    const photoWrap = el(`<div style="grid-column:1/-1; margin-bottom:8px;"></div>`);
    photoWrap.appendChild(el(`<img class="profile-photo" src="${student.photo}" alt="Profile photo">`));
    dl.appendChild(photoWrap);
  }
  const rows = [
    ["Name", student.name], ["Father's Name", student.fatherName], ["Date of Birth", fmtDate(student.dob)],
    ["Admission No.", student.admissionNumber], ["Branch", student.branch], ["Session", student.session],
    ["Address", student.address],
  ];
  rows.forEach(([label, value]) => {
    dl.appendChild(el(`<dt>${label}</dt>`));
    dl.appendChild(el(`<dd>${escapeHtml(value || "—")}</dd>`));
  });
  body.appendChild(dl);
  body.appendChild(el(`<p class="section-note" style="margin-top:20px;">To correct any of this information, submit a new application from the ID Card Application page.</p>`));
}

// =============================================================
// Application page (submit or correct-and-resubmit)
// =============================================================
function renderApplicationPage(username) {
  app.appendChild(clone("tpl-application-page"));
  const applications = DB.applications();
  const existing = applications[username];
  const body = app.querySelector("#applyPageBody");

  if (existing && (existing.status === "pending" || existing.status === "under_review" || existing.status === "approved")) {
    body.appendChild(el(`
      <div class="action-card">
        <p class="status-label">Application ${escapeHtml(existing.applicationNumber)}</p>
        <p class="status-value ${existing.status}">${STATUS_LABELS[existing.status]}</p>
        <p class="section-note" style="margin-top:12px;">Your application is already ${STATUS_LABELS[existing.status].toLowerCase()}. You can correct and resubmit only if it is rejected.</p>
      </div>
    `));
    return;
  }

  renderRequestForm(body, username, existing);
}

function renderRequestForm(container, username, existing) {
  container.appendChild(clone("tpl-request-form"));
  const form = container.querySelector("#idRequestForm");
  const photoInput = form.querySelector('input[name="photo"]');
  const photoPreview = container.querySelector("#photoPreview");
  const photoError = container.querySelector("#photoError");
  const toggleBtn = container.querySelector("#togglePreviewBtn");
  const previewHolder = container.querySelector("#livePreviewHolder");

  const student = DB.students()[username];
  const prefill = existing || student;
  if (prefill) {
    ["name", "fatherName", "admissionNumber", "dob", "branch", "session", "address"].forEach(f => {
      if (prefill[f]) form.querySelector(`[name="${f}"]`).value = prefill[f];
    });
  }
  let currentPhoto = prefill && prefill.photo ? prefill.photo : null;
  if (currentPhoto) { photoPreview.src = currentPhoto; photoPreview.classList.remove("hidden"); }

  photoInput.onchange = async () => {
    photoError.textContent = "";
    const file = photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { photoError.textContent = "Please upload an image file."; photoInput.value = ""; return; }
    if (file.size > MAX_PHOTO_BYTES) { photoError.textContent = "Photo must be under 2 MB."; photoInput.value = ""; return; }
    currentPhoto = await fileToDataUrl(file);
    photoPreview.src = currentPhoto;
    photoPreview.classList.remove("hidden");
    if (!previewHolder.classList.contains("hidden")) updateLivePreview();
  };

  function updateLivePreview() {
    previewHolder.innerHTML = "";
    const fd = new FormData(form);
    previewHolder.appendChild(buildIdCard({
      name: fd.get("name"), fatherName: fd.get("fatherName"), admissionNumber: fd.get("admissionNumber"),
      dob: fd.get("dob"), branch: fd.get("branch"), session: fd.get("session"), address: fd.get("address"),
      photo: currentPhoto, srNo: "(assigned on approval)", issueDate: "(assigned on approval)", validUpto: "(assigned on approval)",
    }));
  }

  toggleBtn.onclick = () => {
    const showing = !previewHolder.classList.contains("hidden");
    previewHolder.classList.toggle("hidden", showing);
    toggleBtn.textContent = showing ? "Show live preview" : "Hide live preview";
    if (!showing) updateLivePreview();
  };
  form.addEventListener("input", () => { if (!previewHolder.classList.contains("hidden")) updateLivePreview(); });

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!currentPhoto) { photoError.textContent = "Please upload a student photo."; return; }
    const fd = new FormData(form);

    const applications = DB.applications();
    const students = DB.students();
    const isResubmit = !!existing;
    const applicationNumber = isResubmit ? existing.applicationNumber : "GPC-" + String(DB.nextCounter()).padStart(6, "0");

    const record = {
      applicationNumber,
      username,
      name: fd.get("name").trim(),
      fatherName: fd.get("fatherName").trim(),
      admissionNumber: fd.get("admissionNumber").trim(),
      dob: fd.get("dob"),
      branch: fd.get("branch").trim(),
      session: fd.get("session").trim(),
      address: fd.get("address").trim(),
      photo: currentPhoto,
      status: "pending",
      rejectionReason: "",
      adminNotes: isResubmit ? (existing.adminNotes || "") : "",
      serialNumber: isResubmit ? (existing.serialNumber || "") : "",
      dateOfIssue: isResubmit ? (existing.dateOfIssue || "") : "",
      validUpto: isResubmit ? (existing.validUpto || "") : "",
      submittedAt: todayISO(),
      reviewedAt: isResubmit ? (existing.reviewedAt || "") : "",
      approvedAt: "",
    };
    applications[username] = record;
    DB.saveApplications(applications);

    // Keep the student's profile record in sync with their latest submission.
    students[username] = Object.assign({}, students[username], {
      name: record.name, fatherName: record.fatherName, admissionNumber: record.admissionNumber,
      dob: record.dob, branch: record.branch, session: record.session, address: record.address, photo: record.photo,
    });
    DB.saveStudents(students);

    navigate("s/status");
  };
}

// =============================================================
// Application status page
// =============================================================
function renderStatusPage(username) {
  app.appendChild(clone("tpl-application-status"));
  const body = app.querySelector("#statusPageBody");
  const application = DB.applications()[username];

  if (!application) {
    body.appendChild(el(`<p class="section-note">You haven't submitted an application yet.</p>`));
    const btn = el(`<button class="btn-primary">Apply for ID Card</button>`);
    btn.onclick = () => navigate("s/apply");
    body.appendChild(btn);
    return;
  }

  const block = el(`<div class="status-block"></div>`);
  block.appendChild(el(`<p class="status-label">Application ID</p>`));
  block.appendChild(el(`<p class="status-value">${escapeHtml(application.applicationNumber)}</p>`));
  block.appendChild(el(`<p class="status-label" style="margin-top:16px;">Status</p>`));
  block.appendChild(el(`<p class="status-value ${application.status}">${STATUS_LABELS[application.status]}</p>`));
  block.appendChild(el(`<p class="section-note" style="margin-top:10px;">Submitted ${fmtDateTime(application.submittedAt)}</p>`));

  if (application.status === "rejected" && application.rejectionReason) {
    block.appendChild(el(`<div class="rejection-reason"><b>Reason:</b> ${escapeHtml(application.rejectionReason)}</div>`));
    const editBtn = el(`<button class="btn-primary" style="margin-top:16px;">Correct &amp; Resubmit</button>`);
    editBtn.onclick = () => navigate("s/apply");
    block.appendChild(editBtn);
  }
  body.appendChild(block);

  if (application.status === "approved") {
    const cardNode = buildIdCard(application);
    body.appendChild(cardNode);
    const row = el(`
      <div class="download-row">
        <button class="btn-primary" id="downloadPng">Download as image</button>
        <button class="btn-secondary" id="downloadPdf">Download as PDF</button>
        <button class="btn-secondary" id="printCard">Print ID card</button>
      </div>
    `);
    body.appendChild(row);
    row.querySelector("#downloadPng").onclick = () => exportCardPng(cardNode, application.name);
    row.querySelector("#downloadPdf").onclick = () => exportCardPdf(cardNode, application.name);
    row.querySelector("#printCard").onclick = () => printCard(application);
    body.appendChild(el(`<p class="section-note" style="margin-top:14px;">Print this card and get the seal/signature boxes signed physically by the issuing authority, your proctor, and yourself.</p>`));
  }
}

// =============================================================
// Admin auth
// =============================================================
function renderAdminAuth() {
  app.appendChild(clone("tpl-admin-auth"));
  const form = app.querySelector("#adminLoginForm");
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const errorEl = app.querySelector("#adminLoginError");
    if (fd.get("username") !== ADMIN_USER || fd.get("password") !== ADMIN_PASS) {
      errorEl.textContent = "Incorrect admin credentials.";
      return;
    }
    errorEl.textContent = "";
    setSession({ type: "admin" });
    navigate("a/dashboard");
  };
}

// =============================================================
// Admin dashboard
// =============================================================
function statCounts() {
  const list = Object.values(DB.applications());
  return {
    total: list.length,
    pending: list.filter(r => r.status === "pending").length,
    under_review: list.filter(r => r.status === "under_review").length,
    approved: list.filter(r => r.status === "approved").length,
    rejected: list.filter(r => r.status === "rejected").length,
  };
}

function renderAdminDashboard() {
  app.appendChild(clone("tpl-admin-dashboard"));
  const counts = statCounts();
  const row = app.querySelector("#adminStatRow");
  row.appendChild(el(`<div class="stat-tile"><span class="num">${counts.total}</span><span class="label">Total</span></div>`));
  row.appendChild(el(`<div class="stat-tile pending"><span class="num">${counts.pending}</span><span class="label">Pending</span></div>`));
  row.appendChild(el(`<div class="stat-tile under_review"><span class="num">${counts.under_review}</span><span class="label">Under Review</span></div>`));
  row.appendChild(el(`<div class="stat-tile approved"><span class="num">${counts.approved}</span><span class="label">Approved</span></div>`));
  row.appendChild(el(`<div class="stat-tile rejected"><span class="num">${counts.rejected}</span><span class="label">Rejected</span></div>`));

  const list = Object.values(DB.applications()).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")).slice(0, 5);
  const wrap = app.querySelector("#recentAppsWrap");
  if (list.length === 0) { wrap.appendChild(el(`<div class="empty-state">No applications submitted yet.</div>`)); return; }
  wrap.appendChild(buildApplicationsTable(list, false));
}

// =============================================================
// Admin applications list
// =============================================================
let adminFilter = "pending";
let adminSearch = "";

function renderAdminApplications() {
  app.appendChild(clone("tpl-admin-applications"));
  const filterRow = app.querySelector("#adminFilterRow");
  ["pending", "under_review", "approved", "rejected", "all"].forEach(f => {
    const chip = el(`<button class="filter-chip ${f === adminFilter ? "active" : ""}">${f === "all" ? "All" : STATUS_LABELS[f]}</button>`);
    chip.onclick = () => { adminFilter = f; renderAdminApplicationsTable(); };
    filterRow.appendChild(chip);
  });
  const search = app.querySelector("#appSearchInput");
  search.value = adminSearch;
  search.oninput = () => { adminSearch = search.value.trim().toLowerCase(); renderAdminApplicationsTable(); };
  renderAdminApplicationsTable();
}

function renderAdminApplicationsTable() {
  const wrap = document.getElementById("adminTableWrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  document.querySelectorAll(".filter-chip").forEach(c => {
    c.classList.toggle("active", (c.textContent === "All" ? "all" : c.textContent.toLowerCase().replace(" ", "_")) === adminFilter);
  });

  let list = Object.values(DB.applications());
  if (adminFilter !== "all") list = list.filter(r => r.status === adminFilter);
  if (adminSearch) {
    list = list.filter(r =>
      (r.name || "").toLowerCase().includes(adminSearch) ||
      (r.admissionNumber || "").toLowerCase().includes(adminSearch) ||
      (r.applicationNumber || "").toLowerCase().includes(adminSearch)
    );
  }
  list.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

  if (list.length === 0) { wrap.appendChild(el(`<div class="empty-state">No matching applications.</div>`)); return; }
  wrap.appendChild(buildApplicationsTable(list, true));
}

function buildApplicationsTable(list, clickable) {
  const table = el(`
    <table class="admin-table">
      <thead><tr><th></th><th>Application ID</th><th>Name</th><th>Admission No.</th><th>Branch</th><th>Submitted</th><th>Status</th></tr></thead>
      <tbody></tbody>
    </table>
  `);
  const tbody = table.querySelector("tbody");
  list.forEach(req => {
    const row = el(`
      <tr class="${clickable ? "clickable" : ""}">
        <td><img class="admin-thumb" src="${req.photo || ""}" alt=""></td>
        <td>${escapeHtml(req.applicationNumber)}</td>
        <td>${escapeHtml(req.name)}</td>
        <td>${escapeHtml(req.admissionNumber)}</td>
        <td>${escapeHtml(req.branch)}</td>
        <td>${fmtDate(req.submittedAt)}</td>
        <td><span class="pill ${req.status}">${STATUS_LABELS[req.status]}</span></td>
      </tr>
    `);
    if (clickable) row.onclick = () => navigate("a/application/" + encodeURIComponent(req.username));
    tbody.appendChild(row);
  });
  return table;
}

// =============================================================
// Admin application detail — edit, manual serial/dates, approve/reject
// =============================================================
function renderAdminApplicationDetail(usernameParam) {
  const username = decodeURIComponent(usernameParam || "");
  const applications = DB.applications();
  const req = applications[username];
  if (!req) { navigate("a/applications"); return; }

  app.appendChild(clone("tpl-admin-application-detail"));
  app.querySelector("#detailAppNumber").textContent = req.applicationNumber;
  app.querySelector("#backToApplications").onclick = () => navigate("a/applications");

  const form = app.querySelector("#detailForm");
  const previewWrap = app.querySelector("#detailPreview");

  form.appendChild(el(`<h3>Student information</h3>`));
  const infoFields = [
    ["name", "Full name", req.name], ["fatherName", "Father's name", req.fatherName],
    ["admissionNumber", "Admission number", req.admissionNumber], ["dob", "Date of birth", req.dob, "date"],
    ["branch", "Branch", req.branch], ["session", "Session", req.session],
  ];
  const row2 = el(`<div class="detail-row2"></div>`);
  infoFields.forEach(([name, label, value, type]) => {
    row2.appendChild(el(`<label>${label}<input name="${name}" type="${type || "text"}" value="${escapeHtml(value || "")}"></label>`));
  });
  form.appendChild(row2);
  form.appendChild(el(`<label>Address<textarea name="address" rows="2">${escapeHtml(req.address || "")}</textarea></label>`));

  form.appendChild(el(`<h3>Certification (entered manually — never auto-generated)</h3>`));
  const row3 = el(`<div class="detail-row2"></div>`);
  row3.appendChild(el(`<label>Serial/Dis. No.<input name="serialNumber" type="text" value="${escapeHtml(req.serialNumber || "")}" placeholder="e.g. 1042/24"></label>`));
  row3.appendChild(el(`<label>Date of issue<input name="dateOfIssue" type="date" value="${req.dateOfIssue || ""}"></label>`));
  form.appendChild(row3);
  form.appendChild(el(`<label>Valid up to<input name="validUpto" type="date" value="${req.validUpto || ""}"></label>`));

  form.appendChild(el(`<h3>Decision</h3>`));
  form.appendChild(el(`<label>Admin notes (internal, optional)<textarea name="adminNotes" rows="2">${escapeHtml(req.adminNotes || "")}</textarea></label>`));
  form.appendChild(el(`<label>Rejection reason (shown to student if rejected)<textarea name="rejectionReason" rows="2">${escapeHtml(req.rejectionReason || "")}</textarea></label>`));

  const actions = el(`
    <div class="detail-actions">
      <button type="button" class="btn-secondary" id="saveBtn">Save changes</button>
      <button type="button" class="btn-secondary" id="underReviewBtn">Mark Under Review</button>
      <button type="button" class="btn-primary" id="approveBtn" style="background:var(--green);">Approve</button>
      <button type="button" class="btn-primary" id="rejectBtn" style="background:var(--red);">Reject</button>
    </div>
  `);
  form.appendChild(actions);
  const savedMsg = el(`<p class="form-success"></p>`);
  form.appendChild(savedMsg);

  function readFormValues() {
    const fd = new FormData(form);
    return {
      name: fd.get("name").trim(), fatherName: fd.get("fatherName").trim(),
      admissionNumber: fd.get("admissionNumber").trim(), dob: fd.get("dob"),
      branch: fd.get("branch").trim(), session: fd.get("session").trim(), address: fd.get("address").trim(),
      serialNumber: fd.get("serialNumber").trim(), dateOfIssue: fd.get("dateOfIssue"), validUpto: fd.get("validUpto"),
      adminNotes: fd.get("adminNotes").trim(), rejectionReason: fd.get("rejectionReason").trim(),
    };
  }

  function persist(extra) {
    const applications = DB.applications();
    const current = applications[username];
    Object.assign(current, readFormValues(), extra || {});
    applications[username] = current;
    DB.saveApplications(applications);
    return current;
  }

  function refreshPreview(current) {
    previewWrap.innerHTML = "";
    previewWrap.appendChild(buildIdCard(current));
  }

  actions.querySelector("#saveBtn").onclick = () => {
    const current = persist();
    savedMsg.textContent = "Changes saved.";
    refreshPreview(current);
  };
  actions.querySelector("#underReviewBtn").onclick = () => {
    const current = persist({ status: "under_review", reviewedAt: todayISO() });
    savedMsg.textContent = "Marked as Under Review.";
    renderAdminApplicationDetail(usernameParam);
  };
  actions.querySelector("#approveBtn").onclick = () => {
    const values = readFormValues();
    if (!values.serialNumber || !values.dateOfIssue || !values.validUpto) {
      savedMsg.textContent = "Enter Serial/Dis. No., Date of issue and Valid up to before approving.";
      savedMsg.style.color = "var(--red)";
      return;
    }
    const current = persist({ status: "approved", approvedAt: todayISO(), reviewedAt: todayISO(), rejectionReason: "" });
    // Keep the student's stored profile in sync with the admin-corrected, approved data.
    const students = DB.students();
    students[username] = Object.assign({}, students[username], {
      name: current.name, fatherName: current.fatherName, admissionNumber: current.admissionNumber,
      dob: current.dob, branch: current.branch, session: current.session, address: current.address,
    });
    DB.saveStudents(students);
    navigate("a/applications");
  };
  actions.querySelector("#rejectBtn").onclick = () => {
    const values = readFormValues();
    if (!values.rejectionReason) {
      savedMsg.textContent = "Enter a rejection reason before rejecting.";
      savedMsg.style.color = "var(--red)";
      return;
    }
    persist({ status: "rejected", reviewedAt: todayISO() });
    navigate("a/applications");
  };

  refreshPreview(req);
}

// =============================================================
// Admin students list
// =============================================================
function renderAdminStudents() {
  app.appendChild(clone("tpl-admin-students"));
  const students = DB.students();
  const applications = DB.applications();
  const wrap = app.querySelector("#studentsTableWrap");
  const usernames = Object.keys(students);

  if (usernames.length === 0) { wrap.appendChild(el(`<div class="empty-state">No student accounts registered yet.</div>`)); return; }

  const table = el(`
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Admission No.</th><th>Name</th><th>Branch</th><th>Application status</th></tr></thead>
      <tbody></tbody>
    </table>
  `);
  const tbody = table.querySelector("tbody");
  usernames.forEach(username => {
    const s = students[username];
    const application = applications[username];
    const row = el(`
      <tr class="${application ? "clickable" : ""}">
        <td>${escapeHtml(username)}</td>
        <td>${escapeHtml(s.admissionNumber || "—")}</td>
        <td>${escapeHtml(s.name || "—")}</td>
        <td>${escapeHtml(s.branch || "—")}</td>
        <td>${application ? `<span class="pill ${application.status}">${STATUS_LABELS[application.status]}</span>` : "No application"}</td>
      </tr>
    `);
    if (application) row.onclick = () => navigate("a/application/" + encodeURIComponent(username));
    tbody.appendChild(row);
  });
  wrap.appendChild(table);
}

// =============================================================
// Admin settings
// =============================================================
function renderAdminSettings() {
  app.appendChild(clone("tpl-admin-settings"));
  const cfg = DB.config();
  const form = app.querySelector("#settingsForm");
  form.querySelector('[name="collegeName"]').value = cfg.collegeName;
  form.querySelector('[name="affiliation"]').value = cfg.affiliation;

  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    DB.saveConfig({ collegeName: fd.get("collegeName").trim(), affiliation: fd.get("affiliation").trim() });
    applyBranding();
    app.querySelector("#settingsSaved").textContent = "Settings saved.";
  };
}

// =============================================================
// ID card builder + export + print
// =============================================================
function buildIdCard(req) {
  const cfg = DB.config();
  const frag = clone("tpl-id-card");
  const root = frag.querySelector("#idCardRoot");
  root.querySelector("#cardCollegeName").textContent = cfg.collegeName;
  root.querySelector("#cardAffiliation").textContent = cfg.affiliation;
  root.querySelector("#cardSrNo").textContent = req.serialNumber || "";
  root.querySelector("#cardIssueDate").textContent = req.dateOfIssue && req.dateOfIssue.includes("assigned") ? req.dateOfIssue : fmtDate(req.dateOfIssue);
  root.querySelector("#cardValidUpto").textContent = req.validUpto && String(req.validUpto).includes("assigned") ? req.validUpto : fmtDate(req.validUpto);
  root.querySelector("#cardPhoto").src = req.photo || "";
  root.querySelector("#cardName").textContent = req.name || "";
  root.querySelector("#cardFatherName").textContent = req.fatherName || "";
  root.querySelector("#cardDob").textContent = fmtDate(req.dob);
  root.querySelector("#cardAdmissionNumber").textContent = req.admissionNumber || "";
  root.querySelector("#cardBranch").textContent = req.branch || "";
  root.querySelector("#cardSession").textContent = req.session || "";
  root.querySelector("#cardAddress").textContent = req.address || "";
  return root;
}

function exportCardPng(cardNode, studentName) {
  html2canvas(cardNode, { scale: 3, backgroundColor: "#ffffff" }).then(canvas => {
    const link = document.createElement("a");
    link.download = `ID-Card-${slug(studentName)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

function exportCardPdf(cardNode, studentName) {
  html2canvas(cardNode, { scale: 3, backgroundColor: "#ffffff" }).then(canvas => {
    const { jsPDF } = window.jspdf;
    const imgData = canvas.toDataURL("image/png");
    const widthMm = 190;
    const heightMm = (canvas.height / canvas.width) * widthMm;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [widthMm + 20, heightMm + 20] });
    pdf.addImage(imgData, "PNG", 10, 10, widthMm, heightMm);
    pdf.save(`ID-Card-${slug(studentName)}.pdf`);
  });
}

function printCard(req) {
  const printArea = document.getElementById("printArea");
  printArea.innerHTML = "";
  printArea.appendChild(buildIdCard(req));
  const cleanup = () => { printArea.innerHTML = ""; window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
