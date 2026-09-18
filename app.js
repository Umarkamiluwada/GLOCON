// ===================== CONFIG =====================
const SUPABASE_URL = "https://ukoxzouwbzesqnfqebxw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb3h6b3V3Ynplc3FuZnFlYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MjAxMzYsImV4cCI6MjEwMzA5NjEzNn0.sWeeWNQ3csju8cQT-UvGu7Svl0ftZxfZd5zM8KgKh7I";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

// ===================== UTIL =====================
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function showLoading(msgKey) {
  $("#loading-msg").textContent = t(msgKey || "loading");
  $("#loading-overlay").classList.add("show");
}
function hideLoading() {
  $("#loading-overlay").classList.remove("show");
}
function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function showError(boxId, msg) {
  const box = $(boxId);
  box.textContent = msg;
  box.classList.add("show");
}
function hideError(boxId) {
  $(boxId).classList.remove("show");
}

function localeForLang(lang) {
  return { en: "en", fr: "fr", ha: "ha", ar: "ar" }[lang] || "en";
}

function formatDateTime(iso) {
  const lang = localStorage.getItem("glocon_lang") || "en";
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(localeForLang(lang), {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(d);
  } catch (e) {
    return d.toLocaleString();
  }
}

function initials(first, last) {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function screen(name) {
  $all(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
  $("#bottom-nav").style.display = ["feed", "create", "profile"].includes(name) ? "flex" : "none";
  $all("#bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-nav") === name);
  });
  if (name === "feed") loadFeed();
  if (name === "profile") loadProfile();
  if (name === "create") prepareCreateScreen();
  window.scrollTo(0, 0);
}

// ===================== NAV WIRING =====================
$all("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => screen(el.getAttribute("data-nav")));
});
$("#go-signup").addEventListener("click", () => { hideError("#login-error"); screen("signup"); });
$("#go-login").addEventListener("click", () => { hideError("#signup-error"); screen("login"); });

// ===================== AUTH =====================
async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    await loadCurrentProfile();
    screen("feed");
  } else {
    screen("login");
  }
}

async function loadCurrentProfile() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", currentUser.id).single();
  if (!error && data) {
    currentProfile = data;
    if (data.preferred_language) setLanguage(data.preferred_language);
  }
}

$("#login-btn").addEventListener("click", async () => {
  hideError("#login-error");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if (!email || !password) {
    showError("#login-error", t("fill_all_fields"));
    return;
  }
  showLoading("logging_in");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  hideLoading();
  if (error) {
    showError("#login-error", error.message);
    return;
  }
  currentUser = data.user;
  await loadCurrentProfile();
  screen("feed");
});

$("#signup-btn").addEventListener("click", async () => {
  hideError("#signup-error");
  const language = $("#su-language").value;
  const country = $("#su-country").value;
  const firstName = $("#su-first-name").value.trim();
  const lastName = $("#su-last-name").value.trim();
  const email = $("#su-email").value.trim();
  const phone = $("#su-phone").value.trim();
  const password = $("#su-password").value;
  const confirmPassword = $("#su-confirm-password").value;

  setLanguage(language);

  if (!country || !firstName || !lastName || !email || !phone || !password || !confirmPassword) {
    showError("#signup-error", t("fill_all_fields"));
    return;
  }
  if (password !== confirmPassword) {
    showError("#signup-error", t("passwords_no_match"));
    return;
  }

  showLoading("signing_up");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        country: country,
        phone: phone,
        preferred_language: language,
      },
    },
  });
  hideLoading();

  if (error) {
    showError("#signup-error", error.message);
    return;
  }

  if (data.session) {
    currentUser = data.user;
    await loadCurrentProfile();
    showToast(t("signup_success"));
    screen("feed");
  } else {
    showToast(t("signup_success"));
    screen("login");
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  screen("login");
});

// ===================== FEED =====================
async function loadFeed() {
  const list = $("#feed-list");
  list.innerHTML = "";
  const { data, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at, profiles ( first_name, last_name, avatar_url )")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📭</div>${t("no_posts_yet")}</div>`;
    return;
  }
  data.forEach((post) => list.appendChild(renderPostCard(post)));
}

function renderPostCard(post) {
  const prof = post.profiles || {};
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || "GLOCON User";
  const card = document.createElement("div");
  card.className = "post-card";

  const avatarHtml = prof.avatar_url
    ? `<img src="${prof.avatar_url}" alt="">`
    : initials(prof.first_name, prof.last_name);

  card.innerHTML = `
    <div class="post-head">
      <div class="avatar">${avatarHtml}</div>
      <div class="who">
        <div class="name">${escapeHtml(name)}</div>
        <div class="time">${formatDateTime(post.created_at)}</div>
      </div>
    </div>
    ${post.caption ? `<div class="post-caption">${escapeHtml(post.caption)}</div>` : ""}
    ${post.image_url ? `<img class="post-image" src="${post.image_url}" alt="">` : ""}
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===================== CREATE POST =====================
let selectedPhotoFile = null;

function prepareCreateScreen() {
  $("#post-caption").value = "";
  selectedPhotoFile = null;
  $("#photo-preview-wrap").style.display = "none";
  $("#photo-picker-btn").style.display = "block";
  const av = $("#create-avatar");
  av.innerHTML = currentProfile && currentProfile.avatar_url
    ? `<img src="${currentProfile.avatar_url}" alt="">`
    : initials(currentProfile && currentProfile.first_name, currentProfile && currentProfile.last_name);
}

$("#photo-picker-btn").addEventListener("click", () => $("#post-photo-input").click());
$("#post-photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedPhotoFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    $("#photo-preview").src = ev.target.result;
    $("#photo-preview-wrap").style.display = "block";
    $("#photo-picker-btn").style.display = "none";
  };
  reader.readAsDataURL(file);
});
$("#photo-remove").addEventListener("click", () => {
  selectedPhotoFile = null;
  $("#post-photo-input").value = "";
  $("#photo-preview-wrap").style.display = "none";
  $("#photo-picker-btn").style.display = "block";
});

$("#publish-btn").addEventListener("click", async () => {
  const caption = $("#post-caption").value.trim();
  if (!caption && !selectedPhotoFile) {
    showToast(t("fill_all_fields"));
    return;
  }
  showLoading("posting");
  try {
    let imageUrl = null;
    if (selectedPhotoFile) {
      $("#loading-msg").textContent = t("uploading_photo");
      const ext = (selectedPhotoFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("posts").upload(path, selectedPhotoFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from("posts").getPublicUrl(path);
      imageUrl = pub.publicUrl;
    }

    const { error: insErr } = await sb.from("posts").insert({
      user_id: currentUser.id,
      caption: caption || null,
      image_url: imageUrl,
    });
    if (insErr) throw insErr;

    hideLoading();
    showToast(t("posted_success"));
    screen("feed");
  } catch (err) {
    hideLoading();
    showToast(err.message || String(err));
  }
});

// ===================== PROFILE =====================
async function loadProfile() {
  await loadCurrentProfile();
  const p = currentProfile || {};
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
  $("#profile-name").textContent = name;
  $("#profile-meta").textContent = p.country ? `📍 ${p.country}` : "";

  const av = $("#profile-avatar");
  av.innerHTML = p.avatar_url ? `<img src="${p.avatar_url}" alt="">` : initials(p.first_name, p.last_name);

  const { data, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const list = $("#profile-posts");
  list.innerHTML = "";
  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`;
    $("#stat-posts").textContent = "0";
    return;
  }
  $("#stat-posts").textContent = String(data.length);
  if (data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📝</div>${t("no_own_posts")}</div>`;
    return;
  }
  data.forEach((post) => {
    list.appendChild(renderPostCard({ ...post, profiles: p }));
  });
}

$("#avatar-edit-btn").addEventListener("click", () => $("#avatar-input").click());
$("#avatar-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showLoading("uploading_photo");
  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${currentUser.id}/avatar_${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);

    const { error: updErr } = await sb
      .from("profiles")
      .update({ avatar_url: pub.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", currentUser.id);
    if (updErr) throw updErr;

    hideLoading();
    showToast(t("profile_updated"));
    loadProfile();
  } catch (err) {
    hideLoading();
    showToast(err.message || String(err));
  }
});

// ===================== BOOT =====================
applyTranslations();
checkSession();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
