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

function formatShortTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t("now_label");
  if (diffMin < 60) return diffMin + "m";
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + "h";
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return t("yesterday_label");
  if (diffDay < 7) return diffDay + "d";
  try {
    return new Intl.DateTimeFormat(localeForLang(localStorage.getItem("glocon_lang") || "en"), { day: "numeric", month: "short" }).format(d);
  } catch (e) {
    return d.toLocaleDateString();
  }
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const now = new Date();
  const d = new Date(iso);
  const seconds = Math.floor((now - d) / 1000);
  if (seconds < 60) return t("just_now");

  const lang = localStorage.getItem("glocon_lang") || "en";
  let rtf;
  try {
    rtf = new Intl.RelativeTimeFormat(localeForLang(lang), { numeric: "auto" });
  } catch (e) {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (days < 30) return rtf.format(-weeks, "week");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  const years = Math.floor(days / 365);
  return rtf.format(-years, "year");
}

function initials(first, last) {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function screen(name) {
  $all(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
  $("#bottom-nav").style.display = ["feed", "reels", "chat", "create", "profile"].includes(name) ? "flex" : "none";
  $all("#bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-nav") === name);
  });
  if (name === "feed") loadFeed();
  if (name === "feed") loadStoriesRow();
  if (name === "profile") loadProfile();
  if (name === "create") prepareCreateScreen();
  if (name === "chat") { loadChatList(); }
  if (name === "notifications") { unreadNotifCount = 0; updateNotifBadge(); loadNotifications(); }
  if (name === "search") { $("#global-search-input").value = ""; $("#global-search-results").innerHTML = ""; $("#global-search-input").focus(); }
  if (name === "reels") loadReels(currentReelTab);
  if (name === "settings") prepareSettingsScreen();
  if (name === "edit-profile") prepareEditProfileScreen();
  if (name === "wallet") loadWallet();
  if (name === "buy-coins") prepareBuyCoinsScreen();
  if (name === "cashout-coins") prepareCashoutScreen();
  if (name === "admin-dashboard") guardAdminDashboard();
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
    subscribeGlobalInbox();
    subscribeGlobalNotifications();
    subscribeOnlinePresence();
    recomputeTotalUnread();
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
  subscribeGlobalInbox();
  subscribeGlobalNotifications();
  subscribeOnlinePresence();
  recomputeTotalUnread();
  screen("feed");
});

$("#signup-btn").addEventListener("click", async () => {
  hideError("#signup-error");
  const language = $("#su-language").value;
  const country = $("#su-country").value;
  const firstName = $("#su-first-name").value.trim();
  const lastName = $("#su-last-name").value.trim();
  const username = $("#su-username").value.trim().toLowerCase();
  const email = $("#su-email").value.trim();
  const phone = $("#su-phone").value.trim();
  const password = $("#su-password").value;
  const confirmPassword = $("#su-confirm-password").value;

  setLanguage(language);

  if (!country || !firstName || !lastName || !username || !email || !phone || !password || !confirmPassword) {
    showError("#signup-error", t("fill_all_fields"));
    return;
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showError("#signup-error", t("username_invalid"));
    return;
  }
  if (password !== confirmPassword) {
    showError("#signup-error", t("passwords_no_match"));
    return;
  }

  showLoading("signing_up");
  const { data: taken } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) {
    hideLoading();
    showError("#signup-error", t("username_taken"));
    return;
  }

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
        username: username,
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
    subscribeGlobalInbox();
    subscribeGlobalNotifications();
    subscribeOnlinePresence();
    recomputeTotalUnread();
    showToast(t("signup_success"));
    screen("feed");
  } else {
    showToast(t("signup_success"));
    screen("login");
  }
});

// ===================== FEED =====================
async function loadFeed() {
  const list = $("#feed-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at, user_id, boosted_until, profiles!posts_user_id_fkey ( first_name, last_name, avatar_url, is_verified )")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-inbox"></i></div>${t("no_posts_yet")}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const post of data) {
    const meta = await getPostMeta(post.id);
    list.appendChild(renderPostCard(post, meta));
  }
}

async function getPostMeta(postId) {
  const [likeCountRes, commentCountRes, likedRes] = await Promise.all([
    sb.from("likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
    sb.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
    sb.from("likes").select("id").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle(),
  ]);
  return {
    likeCount: likeCountRes.count || 0,
    commentCount: commentCountRes.count || 0,
    liked: !!likedRes.data,
  };
}

function renderPostCard(post, meta) {
  const prof = post.profiles || {};
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || "GLOCON User";
  const card = document.createElement("div");
  card.className = "post-card";
  card.dataset.postId = post.id;

  const avatarHtml = prof.avatar_url
    ? `<img src="${prof.avatar_url}" alt="">`
    : initials(prof.first_name, prof.last_name);

  const isMine = post.user_id === currentUser.id;
  const isBoosted = post.boosted_until && new Date(post.boosted_until) > new Date();

  card.innerHTML = `
    <div class="post-head">
      <div class="avatar">${avatarHtml}</div>
      <div class="who">
        <div class="name">${escapeHtml(name)}${verifiedBadge(prof)}${isBoosted ? ' <span class="boosted-tag"><i class="fa-solid fa-rocket"></i> ' + t("boosted") + '</span>' : ""}</div>
        <div class="time">${formatRelativeTime(post.created_at)}</div>
      </div>
      <button class="post-menu-btn" data-action="menu"><i class="fa-solid fa-ellipsis"></i></button>
    </div>
    ${post.caption ? `<div class="post-caption">${escapeHtml(post.caption)}</div>` : ""}
    ${post.image_url ? `<img class="post-image" src="${post.image_url}" alt="">` : ""}
    <div class="post-actions">
      <button class="action-btn like-btn ${meta.liked ? "liked" : ""}" data-action="like">
        <span class="ic"><i class="fa-solid fa-heart"></i></span> <span class="count like-count">${meta.likeCount}</span>
      </button>
      <button class="action-btn" data-action="comment">
        <span class="ic"><i class="fa-solid fa-comment-dots"></i></span> <span class="count comment-count">${meta.commentCount}</span>
      </button>
      <button class="action-btn" data-action="share">
        <span class="ic"><i class="fa-solid fa-share"></i></span> ${t("share")}
      </button>
      ${isMine && !isBoosted ? `<button class="action-btn" data-action="boost"><span class="ic"><i class="fa-solid fa-rocket"></i></span></button>` : ""}
    </div>
    <div class="comments-panel hidden">
      <div class="comments-list"></div>
      <div class="comment-compose">
        <input type="text" class="comment-input" placeholder="${t("write_comment")}">
        <button class="comment-send">${t("send")}</button>
      </div>
    </div>
  `;

  wirePostCard(card, post);
  if (!card.dataset.viewed) {
    card.dataset.viewed = "1";
    sb.rpc("record_post_view", { p_post_id: post.id }).then(() => {});
  }
  return card;
}

function verifiedBadge(prof) {
  if (!prof || !prof.is_verified) return "";
  return ' <svg class="verified-badge" viewBox="0 0 20 20" width="15" height="15" title="Verified"><circle cx="10" cy="10" r="10" fill="#1877F2"/><path fill="#fff" d="M8.6 13.6 5.4 10.4l1.2-1.2 2 2 4.8-4.8 1.2 1.2z"/></svg>';
}

function wirePostCard(card, post) {
  const head = card.querySelector(".post-head");
  if (head && post.user_id) {
    head.style.cursor = "pointer";
    head.addEventListener("click", (e) => {
      if (e.target.closest(".post-menu-btn")) return;
      if (post.user_id === currentUser.id) screen("profile");
      else openUserProfile(post.user_id);
    });
  }
  const menuBtn = card.querySelector('[data-action="menu"]');
  if (menuBtn) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openReportPrompt("post", post.id);
    });
  }
  const boostBtn = card.querySelector('[data-action="boost"]');
  if (boostBtn) {
    boostBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      showLoading("posting");
      const { error } = await sb.rpc("boost_post", { p_post_id: post.id });
      hideLoading();
      if (error) { showToast(error.message); return; }
      showToast(t("posted_success"));
      screen("feed");
    });
  }
  const likeBtn = card.querySelector('[data-action="like"]');
  const commentBtn = card.querySelector('[data-action="comment"]');
  const shareBtn = card.querySelector('[data-action="share"]');
  const panel = card.querySelector(".comments-panel");
  const commentsList = card.querySelector(".comments-list");
  const commentInput = card.querySelector(".comment-input");
  const commentSend = card.querySelector(".comment-send");
  let commentsLoaded = false;

  likeBtn.addEventListener("click", async () => {
    const isLiked = likeBtn.classList.contains("liked");
    const countEl = likeBtn.querySelector(".like-count");
    let count = parseInt(countEl.textContent, 10) || 0;
    likeBtn.classList.toggle("liked");
    countEl.textContent = isLiked ? count - 1 : count + 1;
    if (isLiked) {
      await sb.from("likes").delete().eq("post_id", post.id).eq("user_id", currentUser.id);
    } else {
      const { error } = await sb.from("likes").insert({ post_id: post.id, user_id: currentUser.id });
      if (error && error.code !== "23505") showToast(error.message);
    }
  });

  commentBtn.addEventListener("click", async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden") && !commentsLoaded) {
      commentsLoaded = true;
      await loadComments(post.id, commentsList);
    }
  });

  async function submitComment() {
    const content = commentInput.value.trim();
    if (!content) return;
    commentInput.value = "";
    const { error } = await sb.from("comments").insert({ post_id: post.id, user_id: currentUser.id, content });
    if (error) {
      showToast(error.message);
      return;
    }
    const countEl = commentBtn.querySelector(".comment-count");
    countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;
    await loadComments(post.id, commentsList);
  }
  commentSend.addEventListener("click", submitComment);
  commentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitComment();
  });

  shareBtn.addEventListener("click", async () => {
    const shareText = (post.caption || "GLOCON post") + " — via GLOCON (Global Connect)";
    const shareUrl = location.href.split("#")[0];
    if (post.user_id && post.user_id !== currentUser.id) {
      sb.from("notifications").insert({ recipient_id: post.user_id, actor_id: currentUser.id, type: "share", post_id: post.id }).then(() => {});
    }
    if (navigator.share) {
      try { await navigator.share({ title: "GLOCON", text: shareText, url: shareUrl }); }
      catch (e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText + " " + shareUrl);
        showToast(t("link_copied"));
      } catch (e) {
        showToast(shareUrl);
      }
    }
  });
}

async function loadComments(postId, container) {
  return loadCommentsGeneric({
    table: "comments",
    likesTable: "comment_likes",
    idField: "post_id",
    targetId: postId,
    container,
    onReply: (parentId, content) => sb.from("comments").insert({ post_id: postId, user_id: currentUser.id, content, parent_comment_id: parentId }),
  });
}

async function loadCommentsGeneric({ table, likesTable, idField, targetId, container, onReply }) {
  container.innerHTML = `<div class="comment-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
  const fkey = table === "comments" ? "profiles!comments_user_id_fkey" : "profiles!reel_comments_user_id_fkey";
  const { data, error } = await sb
    .from(table)
    .select(`id, content, created_at, parent_comment_id, user_id, ${fkey} ( first_name, last_name, avatar_url )`)
    .eq(idField, targetId)
    .order("created_at", { ascending: true });
  if (error) { container.innerHTML = `<div class="comment-loading">${error.message}</div>`; return; }
  if (!data || data.length === 0) { container.innerHTML = `<div class="comment-loading">${t("no_comments_yet")}</div>`; return; }

  const ids = data.map((c) => c.id);
  const [likeCountsRes, myLikesRes] = await Promise.all([
    sb.from(likesTable).select("comment_id").in("comment_id", ids),
    sb.from(likesTable).select("comment_id").in("comment_id", ids).eq("user_id", currentUser.id),
  ]);
  const likeCounts = {};
  (likeCountsRes.data || []).forEach((r) => { likeCounts[r.comment_id] = (likeCounts[r.comment_id] || 0) + 1; });
  const myLikedSet = new Set((myLikesRes.data || []).map((r) => r.comment_id));

  const topLevel = data.filter((c) => !c.parent_comment_id);
  const repliesByParent = {};
  data.filter((c) => c.parent_comment_id).forEach((c) => {
    (repliesByParent[c.parent_comment_id] = repliesByParent[c.parent_comment_id] || []).push(c);
  });

  function commentRow(c, isReply) {
    const p = c.profiles || {};
    const cname = [p.first_name, p.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const liked = myLikedSet.has(c.id);
    const count = likeCounts[c.id] || 0;
    return `
      <div class="fb-comment ${isReply ? "fb-comment-reply" : ""}" data-comment-id="${c.id}">
        <div class="avatar fb-comment-avatar">${p.avatar_url ? `<img src="${p.avatar_url}" alt="">` : initials(p.first_name, p.last_name)}</div>
        <div class="fb-comment-body">
          <div class="fb-comment-bubble">
            <span class="fb-comment-author">${escapeHtml(cname)}${verifiedBadge(p)}</span>
            <span class="fb-comment-text">${escapeHtml(c.content)}</span>
          </div>
          <div class="fb-comment-meta">
            <span class="fb-comment-time">${formatRelativeTime(c.created_at)}</span>
            <button class="fb-comment-action fb-like-btn ${liked ? "liked" : ""}" data-like-comment="${c.id}">${t("like_word")}${count > 0 ? ` · ${count}` : ""}</button>
            <button class="fb-comment-action fb-reply-btn" data-reply-comment="${c.id}">${t("reply_word")}</button>
          </div>
          <div class="fb-reply-input-row hidden" id="reply-row-${c.id}">
            <input type="text" class="comment-input fb-reply-input" placeholder="${t("write_reply")}">
            <button class="comment-send fb-reply-send">${t("send")}</button>
          </div>
          <div class="fb-replies">${(repliesByParent[c.id] || []).map((r) => commentRow(r, true)).join("")}</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = topLevel.map((c) => commentRow(c, false)).join("");

  container.querySelectorAll("[data-like-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = btn.dataset.likeComment;
      const isLiked = btn.classList.contains("liked");
      btn.classList.toggle("liked");
      if (isLiked) {
        await sb.from(likesTable).delete().eq("comment_id", cid).eq("user_id", currentUser.id);
      } else {
        const { error: likeErr } = await sb.from(likesTable).insert({ comment_id: cid, user_id: currentUser.id });
        if (likeErr && likeErr.code !== "23505") { showToast(likeErr.message); return; }
      }
      loadCommentsGeneric({ table, likesTable, idField, targetId, container, onReply });
    });
  });
  container.querySelectorAll("[data-reply-comment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = document.getElementById("reply-row-" + btn.dataset.replyComment);
      row.classList.toggle("hidden");
      if (!row.classList.contains("hidden")) row.querySelector("input").focus();
    });
  });
  container.querySelectorAll(".fb-reply-send").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".fb-reply-input-row");
      const input = row.querySelector("input");
      const content = input.value.trim();
      if (!content) return;
      const parentId = row.id.replace("reply-row-", "");
      const { error: replyErr } = await onReply(parentId, content);
      if (replyErr) { showToast(replyErr.message); return; }
      loadCommentsGeneric({ table, likesTable, idField, targetId, container, onReply });
    });
  });
  container.querySelectorAll(".fb-reply-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.closest(".fb-reply-input-row").querySelector(".fb-reply-send").click();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===================== CREATE POST =====================
let selectedPhotoFile = null;
let selectedVideoFile = null;

function prepareCreateScreen() {
  $("#post-caption").value = "";
  selectedPhotoFile = null;
  selectedVideoFile = null;
  $("#photo-preview-wrap").style.display = "none";
  $("#video-preview-wrap").style.display = "none";
  $("#photo-picker-btn").style.display = "block";
  $("#video-picker-btn").style.display = "block";
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
    $("#video-picker-btn").style.display = "none";
  };
  reader.readAsDataURL(file);
});
$("#photo-remove").addEventListener("click", () => {
  selectedPhotoFile = null;
  $("#post-photo-input").value = "";
  $("#photo-preview-wrap").style.display = "none";
  $("#photo-picker-btn").style.display = "block";
  $("#video-picker-btn").style.display = "block";
});

$("#video-picker-btn").addEventListener("click", () => $("#post-video-input").click());
$("#post-video-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedVideoFile = file;
  $("#video-preview").src = URL.createObjectURL(file);
  $("#video-preview-wrap").style.display = "block";
  $("#photo-picker-btn").style.display = "none";
  $("#video-picker-btn").style.display = "none";
});
$("#video-remove").addEventListener("click", () => {
  selectedVideoFile = null;
  $("#post-video-input").value = "";
  $("#video-preview-wrap").style.display = "none";
  $("#photo-picker-btn").style.display = "block";
  $("#video-picker-btn").style.display = "block";
});

$("#publish-btn").addEventListener("click", async () => {
  const caption = $("#post-caption").value.trim();
  if (!caption && !selectedPhotoFile && !selectedVideoFile) {
    showToast(t("fill_all_fields"));
    return;
  }
  showLoading("posting");
  try {
    if (selectedVideoFile) {
      $("#loading-msg").textContent = t("uploading_video");
      const ext = (selectedVideoFile.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("reels").upload(path, selectedVideoFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from("reels").getPublicUrl(path);
      const { error: insErr } = await sb.from("reels").insert({
        user_id: currentUser.id,
        caption: caption || null,
        video_url: pub.publicUrl,
      });
      if (insErr) throw insErr;
      hideLoading();
      showToast(t("posted_success"));
      screen("reels");
      return;
    }

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
  $("#profile-name").innerHTML = escapeHtml(name) + verifiedBadge(p);
  $("#profile-username").textContent = "@" + (p.username || "—");
  $("#profile-meta").textContent = p.country ? `📍 ${p.country}` : "";

  const av = $("#profile-avatar");
  av.innerHTML = p.avatar_url ? `<img src="${p.avatar_url}" alt="">` : initials(p.first_name, p.last_name);

  loadFollowStats();

  const { data, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const list = $("#profile-posts");
  list.innerHTML = "";
  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`;
    $("#stat-posts").textContent = "0";
    return;
  }
  $("#stat-posts").textContent = String(data.length);
  if (data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-note-sticky"></i></div>${t("no_own_posts")}</div>`;
    return;
  }
  for (const post of data) {
    const meta = await getPostMeta(post.id);
    list.appendChild(renderPostCard({ ...post, user_id: currentUser.id, profiles: p }, meta));
  }
}

async function loadFollowStats() {
  const [followersRes, followingRes] = await Promise.all([
    sb.from("follows").select("follower_id").eq("following_id", currentUser.id),
    sb.from("follows").select("following_id").eq("follower_id", currentUser.id),
  ]);
  const followers = (followersRes.data || []).map((r) => r.follower_id);
  const following = (followingRes.data || []).map((r) => r.following_id);
  const friends = following.filter((id) => followers.includes(id));
  $("#stat-followers").textContent = String(followers.length);
  $("#stat-following").textContent = String(following.length);
  $("#stat-friends").textContent = String(friends.length);
}

async function isFollowing(otherId) {
  const { data } = await sb.from("follows").select("follower_id").eq("follower_id", currentUser.id).eq("following_id", otherId).maybeSingle();
  return !!data;
}

async function toggleFollow(otherId, btn) {
  const following = btn.classList.contains("following");
  if (following) {
    await sb.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", otherId);
    btn.classList.remove("following");
    btn.textContent = t("follow");
  } else {
    const { error } = await sb.from("follows").insert({ follower_id: currentUser.id, following_id: otherId });
    if (error && error.code !== "23505") { showToast(error.message); return; }
    btn.classList.add("following");
    btn.textContent = t("following_btn");
  }
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

// ===================== NOTIFICATIONS =====================
async function loadNotifications() {
  const list = $("#notifications-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("notifications")
    .select("id, type, preview, created_at, is_read, post_id, actor_id, actor:profiles!notifications_actor_id_fkey(first_name,last_name,avatar_url)")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  if (!data || data.length === 0) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-bell"></i></div>${t("no_notifications_yet")}</div>`; return; }
  list.innerHTML = "";
  data.forEach((n) => list.appendChild(renderNotificationRow(n)));

  const unreadIds = data.filter((n) => !n.is_read).map((n) => n.id);
  if (unreadIds.length) {
    sb.from("notifications").update({ is_read: true }).in("id", unreadIds).then(() => {});
  }
}

function renderNotificationRow(n) {
  const a = n.actor || {};
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "GLOCON User";
  const icons = { follow: "fa-user-plus", like: "fa-heart", comment: "fa-comment", share: "fa-share-nodes" };
  const verbs = {
    follow: t("notif_followed"),
    like: t("notif_liked"),
    comment: t("notif_commented"),
    share: t("notif_shared"),
  };
  const row = document.createElement("div");
  row.className = "conversation-row";
  row.innerHTML = `
    <div class="avatar">${a.avatar_url ? `<img src="${a.avatar_url}" alt="">` : initials(a.first_name, a.last_name)}</div>
    <div class="conv-info">
      <div class="conv-name"><i class="fa-solid ${icons[n.type] || "fa-bell"} notif-type-ic"></i> ${escapeHtml(name)} ${verbs[n.type] || ""}</div>
      ${n.preview ? `<div class="conv-last">"${escapeHtml(n.preview)}"</div>` : ""}
      <div class="conv-last">${formatRelativeTime(n.created_at)}</div>
    </div>
  `;
  if (n.post_id) {
    row.addEventListener("click", () => openPostDetail(n.post_id));
  } else if (n.type === "follow" && n.actor_id) {
    row.addEventListener("click", () => openUserProfile(n.actor_id));
  }
  return row;
}

async function openPostDetail(postId) {
  screen("post-detail");
  const container = $("#post-detail-container");
  container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data: post, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at, user_id, boosted_until, profiles!posts_user_id_fkey ( first_name, last_name, avatar_url, is_verified )")
    .eq("id", postId)
    .single();
  if (error || !post) { container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${t("post_not_found")}</div>`; return; }
  const meta = await getPostMeta(post.id);
  container.innerHTML = "";
  container.appendChild(renderPostCard(post, meta));
}

let notifChannel = null;
let unreadNotifCount = 0;

function updateNotifBadge() {
  const el = $("#notif-badge");
  if (unreadNotifCount > 0) {
    el.textContent = unreadNotifCount > 99 ? "99+" : String(unreadNotifCount);
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

async function subscribeGlobalNotifications() {
  const { count } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", currentUser.id)
    .eq("is_read", false);
  unreadNotifCount = count || 0;
  updateNotifBadge();

  if (notifChannel) return;
  notifChannel = sb
    .channel("notif-" + currentUser.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}` }, () => {
      if (currentProfile && currentProfile.notifications_enabled === false) return;
      if (!$("#screen-notifications").classList.contains("active")) {
        unreadNotifCount += 1;
        updateNotifBadge();
      }
    })
    .subscribe();
}

// ===================== STORIES =====================
let storyGroups = [];
let currentStoryGroupIndex = 0;
let currentStoryIndex = 0;
let storyTimer = null;

async function loadStoriesRow() {
  const row = $("#stories-row");
  row.innerHTML = "";

  const { data, error } = await sb
    .from("stories")
    .select("id, user_id, media_url, media_type, created_at, profiles!stories_user_id_fkey ( first_name, last_name, avatar_url )")
    .order("created_at", { ascending: true });

  const groupsMap = new Map();
  if (!error && data) {
    data.forEach((s) => {
      if (!groupsMap.has(s.user_id)) {
        groupsMap.set(s.user_id, { userId: s.user_id, profile: s.profiles, stories: [] });
      }
      groupsMap.get(s.user_id).stories.push(s);
    });
  }

  const myGroup = groupsMap.get(currentUser.id) || null;
  const otherGroups = [...groupsMap.values()]
    .filter((g) => g.userId !== currentUser.id)
    .sort((a, b) => new Date(b.stories[b.stories.length - 1].created_at) - new Date(a.stories[a.stories.length - 1].created_at));

  storyGroups = myGroup ? [myGroup, ...otherGroups] : [...otherGroups];

  // "Add Story" circle — always first. If you already have an active story,
  // tapping it opens your own story viewer; the small ➕ badge always adds a new one.
  const addCircle = document.createElement("div");
  addCircle.className = "story-circle";
  const myAvatarHtml = currentProfile && currentProfile.avatar_url
    ? `<img src="${currentProfile.avatar_url}" alt="">`
    : initials(currentProfile && currentProfile.first_name, currentProfile && currentProfile.last_name);
  addCircle.innerHTML = `
    <div class="story-add-badge" style="position:relative;">
      ${myGroup ? myAvatarHtml : '<i class="fa-solid fa-plus"></i>'}
      ${myGroup ? '<span class="story-plus-mini"><i class="fa-solid fa-plus"></i></span>' : ""}
    </div>
    <div class="story-name">${t("your_story")}</div>
  `;
  addCircle.addEventListener("click", () => {
    if (myGroup) openStoryViewer(0);
    else $("#story-upload-input").click();
  });
  if (myGroup) {
    addCircle.querySelector(".story-plus-mini").addEventListener("click", (e) => {
      e.stopPropagation();
      $("#story-upload-input").click();
    });
  }
  row.appendChild(addCircle);

  otherGroups.forEach((g) => {
    const idx = storyGroups.indexOf(g);
    const name = [g.profile && g.profile.first_name, g.profile && g.profile.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const circle = document.createElement("div");
    circle.className = "story-circle";
    circle.innerHTML = `
      <div class="story-ring"><div class="avatar">${g.profile && g.profile.avatar_url ? `<img src="${g.profile.avatar_url}" alt="">` : initials(g.profile && g.profile.first_name, g.profile && g.profile.last_name)}</div></div>
      <div class="story-name">${escapeHtml(name)}</div>
    `;
    circle.addEventListener("click", () => openStoryViewer(idx));
    row.appendChild(circle);
  });
}

$("#story-upload-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const isVideo = file.type.startsWith("video");
  showLoading("posting");
  $("#loading-msg").textContent = isVideo ? t("uploading_video") : t("uploading_photo");
  try {
    const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("stories").upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from("stories").getPublicUrl(path);
    const { error: insErr } = await sb.from("stories").insert({
      user_id: currentUser.id,
      media_url: pub.publicUrl,
      media_type: isVideo ? "video" : "image",
    });
    if (insErr) throw insErr;
    hideLoading();
    showToast(t("posted_success"));
    e.target.value = "";
    loadStoriesRow();
  } catch (err) {
    hideLoading();
    showToast(err.message || String(err));
  }
});

function openStoryViewer(groupIndex) {
  currentStoryGroupIndex = groupIndex;
  currentStoryIndex = 0;
  screen("story-viewer");
  renderStoryProgressBars();
  renderCurrentStory();
}

function renderStoryProgressBars() {
  const group = storyGroups[currentStoryGroupIndex];
  const bar = $("#story-progress");
  bar.innerHTML = group.stories.map(() => `<div class="bar"><div class="fill"></div></div>`).join("");
}

function renderCurrentStory() {
  clearTimeout(storyTimer);
  const group = storyGroups[currentStoryGroupIndex];
  const story = group.stories[currentStoryIndex];
  const name = [group.profile && group.profile.first_name, group.profile && group.profile.last_name].filter(Boolean).join(" ") || "GLOCON User";

  $("#story-viewer-avatar").innerHTML = group.profile && group.profile.avatar_url
    ? `<img src="${group.profile.avatar_url}" alt="">`
    : initials(group.profile && group.profile.first_name, group.profile && group.profile.last_name);
  $("#story-viewer-name").textContent = name;
  $("#story-viewer-time").textContent = formatDateTime(story.created_at);

  const bars = $all("#story-progress .bar");
  bars.forEach((b, i) => {
    b.classList.toggle("done", i < currentStoryIndex);
    b.querySelector(".fill").style.width = i < currentStoryIndex ? "100%" : i === currentStoryIndex ? "0%" : "0%";
  });

  const wrap = $("#story-media-wrap");
  wrap.innerHTML = story.media_type === "video"
    ? `<video src="${story.media_url}" autoplay playsinline></video>`
    : `<img src="${story.media_url}" alt="">`;

  const activeFill = bars[currentStoryIndex] && bars[currentStoryIndex].querySelector(".fill");
  if (story.media_type === "video") {
    const video = wrap.querySelector("video");
    video.addEventListener("ended", goToNextStory, { once: true });
    if (activeFill) { activeFill.style.transition = "none"; activeFill.style.width = "0%"; }
    video.addEventListener("timeupdate", () => {
      if (activeFill && video.duration) activeFill.style.width = ((video.currentTime / video.duration) * 100) + "%";
    });
  } else {
    if (activeFill) {
      activeFill.style.transition = "none";
      activeFill.style.width = "0%";
      requestAnimationFrame(() => {
        activeFill.style.transition = "width 5s linear";
        activeFill.style.width = "100%";
      });
    }
    storyTimer = setTimeout(goToNextStory, 5000);
  }
}

function goToNextStory() {
  const group = storyGroups[currentStoryGroupIndex];
  if (currentStoryIndex < group.stories.length - 1) {
    currentStoryIndex += 1;
    renderCurrentStory();
  } else if (currentStoryGroupIndex < storyGroups.length - 1) {
    currentStoryGroupIndex += 1;
    currentStoryIndex = 0;
    renderStoryProgressBars();
    renderCurrentStory();
  } else {
    closeStoryViewer();
  }
}

function goToPrevStory() {
  if (currentStoryIndex > 0) {
    currentStoryIndex -= 1;
    renderCurrentStory();
  } else if (currentStoryGroupIndex > 0) {
    currentStoryGroupIndex -= 1;
    currentStoryIndex = storyGroups[currentStoryGroupIndex].stories.length - 1;
    renderStoryProgressBars();
    renderCurrentStory();
  }
}

function closeStoryViewer() {
  clearTimeout(storyTimer);
  screen("feed");
}

$("#story-nav-right").addEventListener("click", goToNextStory);
$("#story-nav-left").addEventListener("click", goToPrevStory);
$("#story-close-btn").addEventListener("click", closeStoryViewer);

// ===================== REPORT =====================
let reportTarget = { type: null, id: null };
function openReportPrompt(type, id) {
  reportTarget = { type, id };
  $("#report-modal").classList.remove("hidden");
}
$all(".report-reason-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const reason = btn.dataset.reason;
    $("#report-modal").classList.add("hidden");
    if (!reportTarget.id) return;
    const payload = { reporter_id: currentUser.id, reason };
    if (reportTarget.type === "post") payload.reported_post_id = reportTarget.id;
    else if (reportTarget.type === "reel") payload.reported_reel_id = reportTarget.id;
    else if (reportTarget.type === "user") payload.reported_user_id = reportTarget.id;
    const { error } = await sb.from("reports").insert(payload);
    showToast(error ? error.message : t("report_submitted"));
  });
});
$("#report-cancel-btn").addEventListener("click", () => $("#report-modal").classList.add("hidden"));

// ===================== SETTINGS =====================
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("glocon_theme", theme);
  $("#settings-dark-toggle").checked = theme === "dark";
}

function prepareSettingsScreen() {
  $("#settings-language-select").value = (currentProfile && currentProfile.preferred_language) || "en";
  $("#settings-dark-toggle").checked = (localStorage.getItem("glocon_theme") || "dark") === "dark";
  $("#settings-notif-toggle").checked = !currentProfile || currentProfile.notifications_enabled !== false;
  $("#admin-dashboard-link").classList.toggle("hidden", !(currentProfile && currentProfile.is_admin));
}

$("#settings-language-select").addEventListener("change", async (e) => {
  const lang = e.target.value;
  setLanguage(lang);
  await sb.from("profiles").update({ preferred_language: lang }).eq("id", currentUser.id);
  if (currentProfile) currentProfile.preferred_language = lang;
});

$("#settings-dark-toggle").addEventListener("change", (e) => {
  applyTheme(e.target.checked ? "dark" : "light");
});

$("#settings-notif-toggle").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  await sb.from("profiles").update({ notifications_enabled: enabled }).eq("id", currentUser.id);
  if (currentProfile) currentProfile.notifications_enabled = enabled;
});

$("#settings-logout-btn").addEventListener("click", async () => {
  clearTimeout(storyTimer);
  if (messageChannel) sb.removeChannel(messageChannel);
  if (notifChannel) sb.removeChannel(notifChannel);
  if (presenceChannel) sb.removeChannel(presenceChannel);
  if (globalMessageChannel) sb.removeChannel(globalMessageChannel);
  if (conversationRowChannel) sb.removeChannel(conversationRowChannel);
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  screen("login");
});

// ---- Edit Profile ----
function prepareEditProfileScreen() {
  if (!$("#edit-country").children.length) {
    $("#edit-country").innerHTML = $("#su-country").innerHTML;
  }
  const p = currentProfile || {};
  $("#edit-first-name").value = p.first_name || "";
  $("#edit-last-name").value = p.last_name || "";
  $("#edit-phone").value = p.phone || "";
  $("#edit-country").value = p.country || "";
  $("#edit-bio").value = p.bio || "";
}

$("#save-profile-btn").addEventListener("click", async () => {
  const updates = {
    first_name: $("#edit-first-name").value.trim(),
    last_name: $("#edit-last-name").value.trim(),
    phone: $("#edit-phone").value.trim(),
    country: $("#edit-country").value,
    bio: $("#edit-bio").value.trim(),
  };
  showLoading("posting");
  const { error } = await sb.from("profiles").update(updates).eq("id", currentUser.id);
  hideLoading();
  if (error) { showToast(error.message); return; }
  currentProfile = { ...currentProfile, ...updates };
  showToast(t("posted_success"));
  screen("settings");
});

// ---- Change Password ----
$("#update-password-btn").addEventListener("click", async () => {
  const pw = $("#new-password-input").value;
  const confirmPw = $("#confirm-new-password-input").value;
  if (!pw || pw.length < 6) { showToast(t("password_too_short")); return; }
  if (pw !== confirmPw) { showToast(t("passwords_mismatch")); return; }
  showLoading("posting");
  const { error } = await sb.auth.updateUser({ password: pw });
  hideLoading();
  if (error) { showToast(error.message); return; }
  $("#new-password-input").value = "";
  $("#confirm-new-password-input").value = "";
  showToast(t("posted_success"));
  screen("settings");
});

// ===================== REELS =====================
let currentReelTab = "foryou";
let reelObserver = null;

$all(".reel-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $all(".reel-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentReelTab = btn.dataset.reelTab;
    loadReels(currentReelTab);
  });
});

async function loadReels(tab) {
  const feed = $("#reels-feed");
  feed.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;

  let userIds = null;
  if (tab === "following" || tab === "friends") {
    const { data: followingRows } = await sb.from("follows").select("following_id").eq("follower_id", currentUser.id);
    const following = (followingRows || []).map((r) => r.following_id);
    if (tab === "following") {
      userIds = following;
    } else {
      const { data: followerRows } = await sb.from("follows").select("follower_id").eq("following_id", currentUser.id);
      const followers = (followerRows || []).map((r) => r.follower_id);
      userIds = following.filter((id) => followers.includes(id));
    }
    if (userIds.length === 0) {
      feed.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-clapperboard"></i></div>${t("no_reels_yet")}</div>`;
      return;
    }
  }

  let query = sb
    .from("reels")
    .select("id, caption, video_url, created_at, user_id, profiles!reels_user_id_fkey ( first_name, last_name, avatar_url )")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userIds) query = query.in("user_id", userIds);

  const { data, error } = await query;
  if (error) { feed.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  if (!data || data.length === 0) { feed.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-clapperboard"></i></div>${t("no_reels_yet")}</div>`; return; }

  feed.innerHTML = "";
  for (const reel of data) {
    const meta = await getReelMeta(reel.id);
    feed.appendChild(renderReelItem(reel, meta));
  }
  setupReelObserver();
}

async function getReelMeta(reelId) {
  const [likeCountRes, commentCountRes, likedRes] = await Promise.all([
    sb.from("reel_likes").select("id", { count: "exact", head: true }).eq("reel_id", reelId),
    sb.from("reel_comments").select("id", { count: "exact", head: true }).eq("reel_id", reelId),
    sb.from("reel_likes").select("id").eq("reel_id", reelId).eq("user_id", currentUser.id).maybeSingle(),
  ]);
  return {
    likeCount: likeCountRes.count || 0,
    commentCount: commentCountRes.count || 0,
    liked: !!likedRes.data,
  };
}

function renderReelItem(reel, meta) {
  const prof = reel.profiles || {};
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || "GLOCON User";
  const item = document.createElement("div");
  item.className = "reel-item";
  item.dataset.reelId = reel.id;
  item.innerHTML = `
    <video class="reel-video" src="${reel.video_url}" loop muted playsinline></video>
    <div class="reel-overlay">
      <div class="reel-info" data-user-id="${reel.user_id}">
        <div class="avatar">${prof.avatar_url ? `<img src="${prof.avatar_url}" alt="">` : initials(prof.first_name, prof.last_name)}</div>
        <div class="reel-name">${escapeHtml(name)}</div>
      </div>
      ${reel.caption ? `<div class="reel-caption">${escapeHtml(reel.caption)}</div>` : ""}
    </div>
    <div class="reel-actions">
      <button class="reel-action-btn like-btn ${meta.liked ? "liked" : ""}" data-action="like">
        <span class="ic"><i class="fa-solid fa-heart"></i></span><span class="count like-count">${meta.likeCount}</span>
      </button>
      <button class="reel-action-btn" data-action="comment">
        <span class="ic"><i class="fa-solid fa-comment-dots"></i></span><span class="count comment-count">${meta.commentCount}</span>
      </button>
      <button class="reel-action-btn" data-action="share">
        <span class="ic"><i class="fa-solid fa-share"></i></span>
      </button>
      <button class="reel-action-btn" data-action="mute">
        <span class="ic mute-ic"><i class="fa-solid fa-volume-xmark"></i></span>
      </button>
      <button class="reel-action-btn" data-action="report">
        <span class="ic"><i class="fa-solid fa-flag"></i></span>
      </button>
    </div>
    <div class="comments-panel hidden reel-comments-panel">
      <div class="comments-list"></div>
      <div class="comment-compose">
        <input type="text" class="comment-input" placeholder="${t("write_comment")}">
        <button class="comment-send">${t("send")}</button>
      </div>
    </div>
  `;
  wireReelItem(item, reel);
  return item;
}

function wireReelItem(item, reel) {
  const video = item.querySelector(".reel-video");
  const likeBtn = item.querySelector('[data-action="like"]');
  const commentBtn = item.querySelector('[data-action="comment"]');
  const shareBtn = item.querySelector('[data-action="share"]');
  const muteBtn = item.querySelector('[data-action="mute"]');
  const reportBtn = item.querySelector('[data-action="report"]');
  const panel = item.querySelector(".comments-panel");
  const commentsList = item.querySelector(".comments-list");
  const commentInput = item.querySelector(".comment-input");
  const commentSend = item.querySelector(".comment-send");
  const userInfo = item.querySelector(".reel-info");
  let commentsLoaded = false;

  video.addEventListener("click", () => { video.paused ? video.play() : video.pause(); });
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    const icon = muteBtn.querySelector(".mute-ic i");
    icon.className = video.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
  });
  reportBtn.addEventListener("click", () => openReportPrompt("reel", reel.id));

  userInfo.addEventListener("click", () => {
    if (reel.user_id === currentUser.id) screen("profile");
    else openUserProfile(reel.user_id);
  });

  likeBtn.addEventListener("click", async () => {
    const isLiked = likeBtn.classList.contains("liked");
    const countEl = likeBtn.querySelector(".like-count");
    let count = parseInt(countEl.textContent, 10) || 0;
    likeBtn.classList.toggle("liked");
    countEl.textContent = isLiked ? count - 1 : count + 1;
    if (isLiked) {
      await sb.from("reel_likes").delete().eq("reel_id", reel.id).eq("user_id", currentUser.id);
    } else {
      const { error } = await sb.from("reel_likes").insert({ reel_id: reel.id, user_id: currentUser.id });
      if (error && error.code !== "23505") showToast(error.message);
    }
  });

  commentBtn.addEventListener("click", async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden") && !commentsLoaded) {
      commentsLoaded = true;
      await loadReelComments(reel.id, commentsList);
    }
  });

  async function submitComment() {
    const content = commentInput.value.trim();
    if (!content) return;
    commentInput.value = "";
    const { error } = await sb.from("reel_comments").insert({ reel_id: reel.id, user_id: currentUser.id, content });
    if (error) { showToast(error.message); return; }
    const countEl = commentBtn.querySelector(".comment-count");
    countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;
    await loadReelComments(reel.id, commentsList);
  }
  commentSend.addEventListener("click", submitComment);
  commentInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitComment(); });

  shareBtn.addEventListener("click", async () => {
    const shareText = (reel.caption || "GLOCON reel") + " — via GLOCON (Global Connect)";
    const shareUrl = location.href.split("#")[0];
    if (reel.user_id !== currentUser.id) {
      sb.from("notifications").insert({ recipient_id: reel.user_id, actor_id: currentUser.id, type: "share" }).then(() => {});
    }
    if (navigator.share) {
      try { await navigator.share({ title: "GLOCON", text: shareText, url: shareUrl }); } catch (e) {}
    } else {
      try { await navigator.clipboard.writeText(shareText + " " + shareUrl); showToast(t("link_copied")); }
      catch (e) { showToast(shareUrl); }
    }
  });
}

async function loadReelComments(reelId, container) {
  return loadCommentsGeneric({
    table: "reel_comments",
    likesTable: "reel_comment_likes",
    idField: "reel_id",
    targetId: reelId,
    container,
    onReply: (parentId, content) => sb.from("reel_comments").insert({ reel_id: reelId, user_id: currentUser.id, content, parent_comment_id: parentId }),
  });
}

function setupReelObserver() {
  if (reelObserver) reelObserver.disconnect();
  reelObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector(".reel-video");
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
  );
  $all(".reel-item").forEach((el) => reelObserver.observe(el));
}

// ===================== GLOBAL PEOPLE SEARCH (dashboard) =====================
let globalSearchDebounce = null;
$("#global-search-input").addEventListener("input", (e) => {
  clearTimeout(globalSearchDebounce);
  const q = e.target.value.trim();
  const resultsEl = $("#global-search-results");
  if (!q) { resultsEl.innerHTML = ""; return; }
  globalSearchDebounce = setTimeout(() => runGlobalSearch(q), 350);
});

async function runGlobalSearch(q) {
  const resultsEl = $("#global-search-results");
  resultsEl.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, username")
    .neq("id", currentUser.id)
    .ilike("username", `%${q}%`)
    .limit(20);
  if (error) { resultsEl.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  if (!data || data.length === 0) { resultsEl.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-magnifying-glass"></i></div>${t("no_users_found")}</div>`; return; }
  resultsEl.innerHTML = "";
  data.forEach((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const row = document.createElement("div");
    row.className = "conversation-row";
    row.innerHTML = `
      <div class="avatar">${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : initials(u.first_name, u.last_name)}</div>
      <div class="conv-info"><div class="conv-name">${escapeHtml(name)}</div><div class="conv-last">@${escapeHtml(u.username || "")}</div></div>
      <button class="follow-btn">${t("follow")}</button>
    `;
    const followBtn = row.querySelector(".follow-btn");
    isFollowing(u.id).then((yes) => {
      if (yes) { followBtn.classList.add("following"); followBtn.textContent = t("following_btn"); }
    });
    followBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFollow(u.id, followBtn); });
    row.addEventListener("click", () => openUserProfile(u.id));
    resultsEl.appendChild(row);
  });
}

// ===================== USER LIST (followers/following/friends) =====================
let currentViewedUserId = null;
let userListReturnScreen = "profile";

async function openUserList(targetUserId, type, returnScreen) {
  userListReturnScreen = returnScreen;
  screen("user-list");
  $("#user-list-title").textContent = t(type);
  const container = $("#user-list-container");
  container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;

  let ids = [];
  if (type === "followers") {
    const { data } = await sb.from("follows").select("follower_id").eq("following_id", targetUserId);
    ids = (data || []).map((r) => r.follower_id);
  } else if (type === "following") {
    const { data } = await sb.from("follows").select("following_id").eq("follower_id", targetUserId);
    ids = (data || []).map((r) => r.following_id);
  } else {
    const [followingRes, followersRes] = await Promise.all([
      sb.from("follows").select("following_id").eq("follower_id", targetUserId),
      sb.from("follows").select("follower_id").eq("following_id", targetUserId),
    ]);
    const following = (followingRes.data || []).map((r) => r.following_id);
    const followers = (followersRes.data || []).map((r) => r.follower_id);
    ids = following.filter((id) => followers.includes(id));
  }

  if (ids.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-users"></i></div>${t("no_users_found")}</div>`;
    return;
  }

  const { data: profs, error } = await sb.from("profiles").select("id, first_name, last_name, avatar_url, username").in("id", ids);
  if (error) { container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }

  container.innerHTML = "";
  for (const u of profs || []) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const row = document.createElement("div");
    row.className = "conversation-row";
    row.innerHTML = `
      <div class="avatar">${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : initials(u.first_name, u.last_name)}</div>
      <div class="conv-info"><div class="conv-name">${escapeHtml(name)}</div><div class="conv-last">@${escapeHtml(u.username || "")}</div></div>
      ${u.id !== currentUser.id ? `<button class="follow-btn">${t("follow")}</button>` : ""}
    `;
    const followBtn = row.querySelector(".follow-btn");
    if (followBtn) {
      isFollowing(u.id).then((yes) => {
        if (yes) { followBtn.classList.add("following"); followBtn.textContent = t("following_btn"); }
      });
      followBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFollow(u.id, followBtn); });
    }
    row.addEventListener("click", () => openUserProfile(u.id));
    container.appendChild(row);
  }
}

$("#user-list-back").addEventListener("click", () => screen(userListReturnScreen));
$("#stat-followers-box").addEventListener("click", () => openUserList(currentUser.id, "followers", "profile"));
$("#stat-following-box").addEventListener("click", () => openUserList(currentUser.id, "following", "profile"));
$("#stat-friends-box").addEventListener("click", () => openUserList(currentUser.id, "friends", "profile"));
$("#user-stat-followers-box").addEventListener("click", () => openUserList(currentViewedUserId, "followers", "user-profile"));
$("#user-stat-following-box").addEventListener("click", () => openUserList(currentViewedUserId, "following", "user-profile"));
$("#user-stat-friends-box").addEventListener("click", () => openUserList(currentViewedUserId, "friends", "user-profile"));

// ===================== USER PROFILE (other users) =====================
async function openUserProfile(userId) {
  currentViewedUserId = userId;
  screen("user-profile");
  const { data: p, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) { showToast(error.message); return; }
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "GLOCON User";
  $("#user-profile-name").innerHTML = escapeHtml(name) + verifiedBadge(p);
  $("#user-profile-username").textContent = "@" + (p.username || "—");
  $("#user-profile-meta").textContent = p.country ? `📍 ${p.country}` : "";
  $("#user-profile-avatar").innerHTML = p.avatar_url ? `<img src="${p.avatar_url}" alt="">` : initials(p.first_name, p.last_name);
  $("#user-profile-report-btn").onclick = () => openReportPrompt("user", userId);

  const [postsCountRes, followersRes, followingRes] = await Promise.all([
    sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("follows").select("follower_id").eq("following_id", userId),
    sb.from("follows").select("following_id").eq("follower_id", userId),
  ]);
  const followers = (followersRes.data || []).map((r) => r.follower_id);
  const following = (followingRes.data || []).map((r) => r.following_id);
  const friends = following.filter((id) => followers.includes(id));
  $("#user-stat-posts").textContent = String(postsCountRes.count || 0);
  $("#user-stat-followers").textContent = String(followers.length);
  $("#user-stat-following").textContent = String(following.length);
  $("#user-stat-friends").textContent = String(friends.length);

  const followBtn = $("#user-profile-follow-btn");
  const yesFollowing = await isFollowing(userId);
  followBtn.classList.toggle("following", yesFollowing);
  followBtn.textContent = yesFollowing ? t("following_btn") : t("follow");
  followBtn.onclick = () => toggleFollow(userId, followBtn);

  $("#user-profile-message-btn").onclick = async () => {
    showLoading("loading");
    const { data: convId, error: rpcErr } = await sb.rpc("get_or_create_conversation", { other_user: userId });
    hideLoading();
    if (rpcErr) { showToast(rpcErr.message); return; }
    openConversation(convId, name, userId);
  };

  const list = $("#user-profile-post-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data: posts, error: postsErr } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (postsErr) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${postsErr.message}</div>`; return; }
  if (!posts || posts.length === 0) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-note-sticky"></i></div>${t("no_own_posts")}</div>`; return; }
  list.innerHTML = "";
  for (const post of posts) {
    const meta = await getPostMeta(post.id);
    list.appendChild(renderPostCard({ ...post, user_id: userId, profiles: p }, meta));
  }
}

// ===================== ONLINE PRESENCE =====================
let onlineUserIds = new Set();
let presenceChannel = null;

function subscribeOnlinePresence() {
  if (presenceChannel) return;
  presenceChannel = sb.channel("presence-online", { config: { presence: { key: currentUser.id } } });
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      onlineUserIds = new Set(Object.keys(presenceChannel.presenceState()));
      refreshOnlineUI();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });
}

function refreshOnlineUI() {
  if ($("#screen-chat").classList.contains("active")) loadChatList();
  if ($("#screen-conversation").classList.contains("active")) updateConversationOnlineStatus();
}

function updateConversationOnlineStatus() {
  const el = $("#conversation-status");
  if (currentConversationOtherId && onlineUserIds.has(currentConversationOtherId)) {
    el.textContent = t("active_now");
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

let totalUnreadMessages = 0;
function updateChatBadge() {
  const el = $("#chat-badge");
  if (totalUnreadMessages > 0) {
    el.textContent = totalUnreadMessages > 99 ? "99+" : String(totalUnreadMessages);
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

async function recomputeTotalUnread() {
  const { data } = await sb
    .from("conversations")
    .select("id, user1, user1_last_read_at, user2_last_read_at")
    .or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`);
  if (!data || data.length === 0) { totalUnreadMessages = 0; updateChatBadge(); return; }
  let total = 0;
  for (const conv of data) {
    const isUser1 = conv.user1 === currentUser.id;
    const myLastReadAt = isUser1 ? conv.user1_last_read_at : conv.user2_last_read_at;
    let q = sb.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).neq("sender_id", currentUser.id);
    if (myLastReadAt) q = q.gt("created_at", myLastReadAt);
    const { count } = await q;
    total += count || 0;
  }
  totalUnreadMessages = total;
  updateChatBadge();
}

// ===================== CHAT =====================
let currentConversationId = null;
let currentConversationOtherName = "";
let currentConversationOtherId = null;
let messageChannel = null;

async function loadChatList() {
  $("#new-chat-box").classList.add("hidden");
  $("#new-chat-search").value = "";
  $("#new-chat-results").innerHTML = "";
  const list = $("#conversation-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;

  const { data, error } = await sb
    .from("conversations")
    .select("id, user1, user2, last_message, last_message_at, user1_last_read_at, user2_last_read_at, user1_profile:profiles!conversations_user1_fkey(first_name,last_name,avatar_url), user2_profile:profiles!conversations_user2_fkey(first_name,last_name,avatar_url)")
    .or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-comment-dots"></i></div>${t("no_chats_yet")}</div>`;
    return;
  }
  list.innerHTML = "";
  let runningTotal = 0;
  for (const conv of data) {
    const isUser1 = conv.user1 === currentUser.id;
    const other = isUser1 ? conv.user2_profile : conv.user1_profile;
    const otherId = isUser1 ? conv.user2 : conv.user1;
    const myLastReadAt = isUser1 ? conv.user1_last_read_at : conv.user2_last_read_at;
    const name = [other && other.first_name, other && other.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const online = onlineUserIds.has(otherId);

    let unreadQuery = sb.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).neq("sender_id", currentUser.id);
    if (myLastReadAt) unreadQuery = unreadQuery.gt("created_at", myLastReadAt);
    const { count: unread } = await unreadQuery;
    runningTotal += unread || 0;

    const row = document.createElement("div");
    row.className = "conversation-row";
    const hasUnread = unread > 0;
    row.innerHTML = `
      <div class="avatar chat-avatar">${other && other.avatar_url ? `<img src="${other.avatar_url}" alt="">` : initials(other && other.first_name, other && other.last_name)}${online ? '<span class="online-dot"></span>' : ""}</div>
      <div class="conv-info">
        <div class="conv-name ${hasUnread ? "unread" : ""}">${escapeHtml(name)}</div>
        <div class="conv-last ${hasUnread ? "unread" : ""}">${escapeHtml(conv.last_message || t("say_hello"))}</div>
      </div>
      <div class="conv-right">
        <div class="conv-time">${formatShortTime(conv.last_message_at)}</div>
        ${hasUnread ? `<span class="unread-pill">${unread > 99 ? "99+" : unread}</span>` : ""}
      </div>
    `;
    row.addEventListener("click", () => openConversation(conv.id, name, otherId));
    list.appendChild(row);
  }
  totalUnreadMessages = runningTotal;
  updateChatBadge();
}

$("#new-chat-btn").addEventListener("click", () => {
  $("#new-chat-box").classList.toggle("hidden");
  $("#new-chat-search").focus();
});

let searchDebounce = null;
$("#new-chat-search").addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (!q) { $("#new-chat-results").innerHTML = ""; return; }
  searchDebounce = setTimeout(() => searchUsers(q), 350);
});

async function searchUsers(q) {
  const resultsEl = $("#new-chat-results");
  resultsEl.innerHTML = `<div class="comment-loading">${t("loading")}</div>`;
  const { data, error } = await sb
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, username")
    .neq("id", currentUser.id)
    .ilike("username", `%${q}%`)
    .limit(15);
  if (error) { resultsEl.innerHTML = `<div class="comment-loading">${error.message}</div>`; return; }
  if (!data || data.length === 0) { resultsEl.innerHTML = `<div class="comment-loading">${t("no_users_found")}</div>`; return; }
  resultsEl.innerHTML = "";
  data.forEach((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const row = document.createElement("div");
    row.className = "conversation-row";
    row.innerHTML = `
      <div class="avatar">${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : initials(u.first_name, u.last_name)}</div>
      <div class="conv-info"><div class="conv-name">${escapeHtml(name)}</div><div class="conv-last">@${escapeHtml(u.username || "")}</div></div>
      <button class="follow-btn">${t("follow")}</button>
    `;
    const followBtn = row.querySelector(".follow-btn");
    isFollowing(u.id).then((yes) => {
      if (yes) { followBtn.classList.add("following"); followBtn.textContent = t("following_btn"); }
    });
    followBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFollow(u.id, followBtn); });
    row.addEventListener("click", async () => {
      showLoading("loading");
      const { data: convId, error: rpcErr } = await sb.rpc("get_or_create_conversation", { other_user: u.id });
      hideLoading();
      if (rpcErr) { showToast(rpcErr.message); return; }
      openConversation(convId, name, u.id);
    });
    resultsEl.appendChild(row);
  });
}

let currentConversationOtherLastReadAt = null;
let conversationRowChannel = null;

async function openConversation(convId, name, otherUserId) {
  currentConversationId = convId;
  currentConversationOtherName = name;
  currentConversationOtherId = otherUserId;
  $("#conversation-name").textContent = name;
  updateConversationOnlineStatus();
  screen("conversation");

  const { data: conv } = await sb.from("conversations").select("user1, user2, user1_last_read_at, user2_last_read_at").eq("id", convId).single();
  if (conv) {
    const isUser1 = conv.user1 === currentUser.id;
    currentConversationOtherLastReadAt = isUser1 ? conv.user2_last_read_at : conv.user1_last_read_at;
    const myField = isUser1 ? "user1_last_read_at" : "user2_last_read_at";
    await sb.from("conversations").update({ [myField]: new Date().toISOString() }).eq("id", convId);
    recomputeTotalUnread();
  }

  await loadMessages(convId);
  subscribeToConversation(convId);
  subscribeToConversationRow(convId);
}

async function loadMessages(convId) {
  const list = $("#messages-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("messages")
    .select("id, content, sender_id, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  list.innerHTML = "";
  (data || []).forEach((m) => list.appendChild(renderMessageBubble(m)));
  list.scrollTop = list.scrollHeight;
  refreshSeenLabel();
}

function renderMessageBubble(m) {
  const bubble = document.createElement("div");
  const mine = m.sender_id === currentUser.id;
  bubble.className = "msg-bubble " + (mine ? "mine" : "theirs");
  bubble.dataset.messageId = m.id;
  bubble.dataset.createdAt = m.created_at;
  bubble.innerHTML = `<div class="msg-text">${escapeHtml(m.content)}</div><div class="msg-time">${formatDateTime(m.created_at)}</div><div class="msg-seen hidden">${t("seen")}</div>`;
  return bubble;
}

// Show "Seen" only under the most recent message I sent, if the other person
// has read up to (or past) that message's timestamp.
function refreshSeenLabel() {
  const list = $("#messages-list");
  $all(".msg-bubble.mine .msg-seen").forEach((el) => el.classList.add("hidden"));
  const mine = $all(".msg-bubble.mine");
  if (mine.length === 0) return;
  const last = mine[mine.length - 1];
  if (currentConversationOtherLastReadAt && new Date(last.dataset.createdAt) <= new Date(currentConversationOtherLastReadAt)) {
    last.querySelector(".msg-seen").classList.remove("hidden");
  }
}

function subscribeToConversation(convId) {
  if (messageChannel) { sb.removeChannel(messageChannel); messageChannel = null; }
  messageChannel = sb
    .channel("messages-" + convId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
      if (currentConversationId !== convId) return;
      if (payload.new.sender_id === currentUser.id) return; // already rendered optimistically when we sent it
      const list = $("#messages-list");
      list.appendChild(renderMessageBubble(payload.new));
      list.scrollTop = list.scrollHeight;
      // The other person just sent something while we're viewing — mark it read immediately.
      sb.from("conversations").select("user1").eq("id", convId).single().then(({ data }) => {
        if (!data) return;
        const myField = data.user1 === currentUser.id ? "user1_last_read_at" : "user2_last_read_at";
        sb.from("conversations").update({ [myField]: new Date().toISOString() }).eq("id", convId);
      });
    })
    .subscribe();
}

// Live-updates the "Seen" tick when the other participant's last_read_at changes.
function subscribeToConversationRow(convId) {
  if (conversationRowChannel) { sb.removeChannel(conversationRowChannel); conversationRowChannel = null; }
  conversationRowChannel = sb
    .channel("conv-row-" + convId)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${convId}` }, (payload) => {
      if (currentConversationId !== convId) return;
      const isUser1 = payload.new.user1 === currentUser.id;
      currentConversationOtherLastReadAt = isUser1 ? payload.new.user2_last_read_at : payload.new.user1_last_read_at;
      refreshSeenLabel();
    })
    .subscribe();
}

async function sendMessage() {
  const input = $("#message-input");
  const content = input.value.trim();
  if (!content || !currentConversationId) return;
  input.value = "";
  const { data, error } = await sb
    .from("messages")
    .insert({ conversation_id: currentConversationId, sender_id: currentUser.id, content })
    .select()
    .single();
  if (error) { showToast(error.message); return; }
  const list = $("#messages-list");
  list.appendChild(renderMessageBubble(data));
  list.scrollTop = list.scrollHeight;
  refreshSeenLabel();
}
$("#message-send").addEventListener("click", sendMessage);
$("#message-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// Global inbox subscription — shows a badge dot on the Chat tab whenever a
// message arrives for a conversation the user isn't currently viewing.
let globalMessageChannel = null;
function subscribeGlobalInbox() {
  if (globalMessageChannel) return;
  globalMessageChannel = sb
    .channel("global-inbox-" + currentUser.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      if (payload.new.sender_id === currentUser.id) return;
      const onThatConversation = currentConversationId === payload.new.conversation_id
        && $("#screen-conversation").classList.contains("active");
      if (!onThatConversation) {
        totalUnreadMessages += 1;
        updateChatBadge();
      }
    })
    .subscribe();
}

// ===================== WALLET =====================
let coinSettingsCache = null;
async function getCoinSettings() {
  if (coinSettingsCache) return coinSettingsCache;
  const { data } = await sb.from("coin_settings").select("*").eq("id", true).single();
  coinSettingsCache = data;
  return data;
}

async function loadWallet() {
  const { data: p } = await sb.from("profiles").select("glocoin_balance, is_verified").eq("id", currentUser.id).single();
  if (p) {
    $("#wallet-balance").textContent = p.glocoin_balance || 0;
    if (currentProfile) currentProfile.glocoin_balance = p.glocoin_balance;
  }
  const settings = await getCoinSettings();
  const verifyBtn = $("#wallet-verify-btn");
  if (p && p.is_verified) {
    verifyBtn.classList.add("hidden");
  } else {
    verifyBtn.classList.remove("hidden");
    const { data: pending } = await sb.from("verification_requests").select("id").eq("user_id", currentUser.id).eq("status", "pending").maybeSingle();
    if (pending) {
      verifyBtn.disabled = true;
      $("#wallet-verify-cost").textContent = t("verification_pending");
    } else {
      verifyBtn.disabled = false;
      $("#wallet-verify-cost").textContent = `${settings.verify_badge_cost} GLOCOIN`;
    }
  }

  const list = $("#wallet-tx-list");
  list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  const { data: txs, error } = await sb
    .from("glocoin_transactions")
    .select("id, type, amount, note, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  if (!txs || txs.length === 0) { list.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-coins"></i></div>${t("no_transactions_yet")}</div>`; return; }
  list.innerHTML = txs.map((tx) => `
    <div class="admin-row">
      <div class="admin-row-title">${tx.amount > 0 ? "+" : ""}${tx.amount} GLOCOIN</div>
      <div class="admin-row-meta">${escapeHtml(tx.note || tx.type)} · ${formatDateTime(tx.created_at)}</div>
    </div>
  `).join("");
}

$("#wallet-verify-btn").addEventListener("click", async () => {
  showLoading("posting");
  const { error } = await sb.rpc("request_verification");
  hideLoading();
  if (error) { showToast(error.message); return; }
  showToast(t("verification_submitted"));
  loadWallet();
});

async function prepareBuyCoinsScreen() {
  $("#buy-naira-input").value = "";
  $("#buy-coins-preview").textContent = "";
  $("#buy-proof-preview").classList.add("hidden");
  $("#buy-proof-picker-btn").classList.remove("hidden");
  selectedProofFile = null;
  const settings = await getCoinSettings();
  $("#buy-rate-hint").textContent = `₦${settings.buy_naira_per_coin} = 1 GLOCOIN`;
}
$("#buy-naira-input").addEventListener("input", async (e) => {
  const settings = await getCoinSettings();
  const naira = parseFloat(e.target.value) || 0;
  const coins = Math.floor(naira / (settings.buy_naira_per_coin || 5));
  $("#buy-coins-preview").textContent = coins > 0 ? `= ${coins} GLOCOIN` : "";
});

let selectedProofFile = null;
$("#buy-proof-picker-btn").addEventListener("click", () => $("#buy-proof-input").click());
$("#buy-proof-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedProofFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    $("#buy-proof-preview").src = ev.target.result;
    $("#buy-proof-preview").classList.remove("hidden");
    $("#buy-proof-picker-btn").classList.add("hidden");
  };
  reader.readAsDataURL(file);
});

$("#submit-buy-btn").addEventListener("click", async () => {
  const settings = await getCoinSettings();
  const naira = parseFloat($("#buy-naira-input").value) || 0;
  const coins = Math.floor(naira / (settings.buy_naira_per_coin || 5));
  if (coins <= 0) { showToast(t("fill_all_fields")); return; }
  showLoading("posting");
  try {
    let proofUrl = null;
    if (selectedProofFile) {
      const ext = (selectedProofFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("payment-proofs").upload(path, selectedProofFile);
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from("payment-proofs").getPublicUrl(path);
      proofUrl = pub.publicUrl;
    }
    const { error } = await sb.rpc("request_coin_purchase", { p_coins: coins, p_naira: naira, p_proof_url: proofUrl });
    if (error) throw error;
    hideLoading();
    showToast(t("request_submitted"));
    screen("wallet");
  } catch (err) {
    hideLoading();
    showToast(err.message || String(err));
  }
});

async function prepareCashoutScreen() {
  $("#cashout-coins-input").value = "";
  $("#cashout-naira-preview").textContent = "";
  $("#cashout-bank-input").value = "";
  $("#cashout-account-number-input").value = "";
  $("#cashout-account-name-input").value = "";
  const settings = await getCoinSettings();
  $("#cashout-rate-hint").textContent = `1 GLOCOIN = ₦${settings.cashout_naira_per_coin}`;
}
$("#cashout-coins-input").addEventListener("input", async (e) => {
  const settings = await getCoinSettings();
  const coins = parseInt(e.target.value, 10) || 0;
  const naira = coins * (settings.cashout_naira_per_coin || 4);
  $("#cashout-naira-preview").textContent = coins > 0 ? `= ₦${naira}` : "";
});
$("#submit-cashout-btn").addEventListener("click", async () => {
  const settings = await getCoinSettings();
  const coins = parseInt($("#cashout-coins-input").value, 10) || 0;
  const naira = coins * (settings.cashout_naira_per_coin || 4);
  const bank = $("#cashout-bank-input").value.trim();
  const accNum = $("#cashout-account-number-input").value.trim();
  const accName = $("#cashout-account-name-input").value.trim();
  if (coins <= 0 || !bank || !accNum || !accName) { showToast(t("fill_all_fields")); return; }
  showLoading("posting");
  const { error } = await sb.rpc("request_coin_cashout", { p_coins: coins, p_naira: naira, p_bank: bank, p_account_number: accNum, p_account_name: accName });
  hideLoading();
  if (error) { showToast(error.message); return; }
  showToast(t("request_submitted"));
  screen("wallet");
});

// ===================== ADMIN DASHBOARD =====================
let currentAdminTab = "overview";
$all(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $all(".admin-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentAdminTab = btn.dataset.adminTab;
    loadAdminTab(currentAdminTab);
  });
});

async function guardAdminDashboard() {
  const { data, error } = await sb.from("profiles").select("is_admin").eq("id", currentUser.id).single();
  if (error || !data || !data.is_admin) {
    showToast(t("not_authorized"));
    screen("settings");
    return;
  }
  loadAdminTab(currentAdminTab);
}

async function loadAdminTab(tab) {
  const content = $("#admin-content");
  content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-spinner fa-spin"></i></div>${t("loading")}</div>`;
  if (tab === "overview") return renderAdminOverview();
  if (tab === "users") return renderAdminUsers();
  if (tab === "purchases") return renderAdminPurchases();
  if (tab === "cashouts") return renderAdminCashouts();
  if (tab === "reports") return renderAdminReports();
  if (tab === "posts") return renderAdminPosts();
  if (tab === "verification") return renderAdminVerification();
  if (tab === "coinsettings") return renderAdminCoinSettings();
}

async function renderAdminOverview() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_coin_stats").single();
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  content.innerHTML = `
    <div class="admin-stat-grid">
      <div class="admin-stat-box"><div class="num">${data.coins_in_circulation}</div><div class="label">Coins in circulation</div></div>
      <div class="admin-stat-box"><div class="num">${data.total_purchased}</div><div class="label">Total purchased</div></div>
      <div class="admin-stat-box"><div class="num">${data.total_spent}</div><div class="label">Total spent</div></div>
      <div class="admin-stat-box"><div class="num">${data.total_cashed_out}</div><div class="label">Total cashed out</div></div>
      <div class="admin-stat-box"><div class="num">${data.pending_purchase_requests}</div><div class="label">Pending buy requests</div></div>
      <div class="admin-stat-box"><div class="num">${data.pending_cashout_requests}</div><div class="label">Pending cash-outs</div></div>
      <div class="admin-stat-box"><div class="num">${data.open_reports}</div><div class="label">Open reports</div></div>
    </div>
  `;
}

async function renderAdminUsers(search) {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_users", { p_search: search || "" });
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  content.innerHTML = `<input type="text" class="admin-search" id="admin-user-search" placeholder="Search by name, username, email…" value="${search ? escapeHtml(search) : ""}"><div id="admin-user-rows"></div>`;
  $("#admin-user-search").addEventListener("keydown", (e) => { if (e.key === "Enter") renderAdminUsers(e.target.value.trim()); });
  const rows = $("#admin-user-rows");
  rows.innerHTML = (data || []).map((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
    return `
      <div class="admin-row">
        <div class="admin-row-title">${escapeHtml(name)} @${escapeHtml(u.username || "")} ${u.is_verified ? '<i class="fa-solid fa-circle-check" style="color:#1d9bf0"></i>' : ""} ${u.is_suspended ? '<i class="fa-solid fa-ban" style="color:var(--danger)"></i>' : ""}</div>
        <div class="admin-row-meta">${escapeHtml(u.email || "")} · ${u.glocoin_balance || 0} GLOCOIN</div>
        <div class="admin-row-actions">
          <button class="${u.is_suspended ? "btn-approve" : "btn-reject"}" data-suspend-id="${u.id}" data-suspend-val="${!u.is_suspended}">${u.is_suspended ? "Unsuspend" : "Suspend"}</button>
        </div>
        <div class="admin-grant-row">
          <input type="number" class="admin-grant-input" placeholder="±GLOCOIN" data-grant-for="${u.id}">
          <button class="btn-approve admin-grant-btn" data-grant-btn="${u.id}">Apply</button>
        </div>
      </div>
    `;
  }).join("") || `<div class="empty-state"><div class="icon"><i class="fa-solid fa-users"></i></div>${t("no_users_found")}</div>`;
  $all("[data-suspend-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error } = await sb.rpc("admin_set_suspended", { p_user_id: btn.dataset.suspendId, p_suspended: btn.dataset.suspendVal === "true" });
      if (error) { showToast(error.message); return; }
      renderAdminUsers(search);
    });
  });
  $all("[data-grant-btn]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.grantBtn;
      const input = document.querySelector(`[data-grant-for="${userId}"]`);
      const amount = parseInt(input.value, 10);
      if (!amount) { showToast(t("fill_all_fields")); return; }
      showLoading("posting");
      const { error } = await sb.rpc("admin_adjust_coins", { p_user_id: userId, p_amount: amount, p_note: t("admin_manual_grant") });
      hideLoading();
      if (error) { showToast(error.message); return; }
      showToast(t("posted_success"));
      renderAdminUsers(search);
    });
  });
}

async function renderAdminPurchases() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_purchase_requests");
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  const pending = (data || []).filter((r) => r.status === "pending");
  if (pending.length === 0) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-check"></i></div>No pending buy requests.</div>`; return; }
  content.innerHTML = pending.map((r) => `
    <div class="admin-row">
      <div class="admin-row-title">${r.coins} GLOCOIN — ₦${r.naira_amount}</div>
      <div class="admin-row-meta">${formatDateTime(r.created_at)}${r.payment_proof_url ? ` · <a href="${r.payment_proof_url}" target="_blank" style="color:var(--blue)">View proof</a>` : ""}</div>
      <div class="admin-row-actions">
        <button class="btn-approve" data-approve-purchase="${r.id}">Approve</button>
        <button class="btn-reject" data-reject-purchase="${r.id}">Reject</button>
      </div>
    </div>
  `).join("");
  $all("[data-approve-purchase]").forEach((btn) => btn.addEventListener("click", () => reviewPurchase(btn.dataset.approvePurchase, true)));
  $all("[data-reject-purchase]").forEach((btn) => btn.addEventListener("click", () => reviewPurchase(btn.dataset.rejectPurchase, false)));
}
async function reviewPurchase(id, approve) {
  const { error } = await sb.rpc("admin_review_purchase", { p_request_id: id, p_approve: approve, p_note: null });
  if (error) { showToast(error.message); return; }
  renderAdminPurchases();
}

async function renderAdminCashouts() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_cashout_requests");
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  const pending = (data || []).filter((r) => r.status === "pending");
  if (pending.length === 0) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-check"></i></div>No pending cash-out requests.</div>`; return; }
  content.innerHTML = pending.map((r) => `
    <div class="admin-row">
      <div class="admin-row-title">${r.coins} GLOCOIN → ₦${r.naira_amount}</div>
      <div class="admin-row-meta">${escapeHtml(r.bank_name || "")} · ${escapeHtml(r.account_number || "")} · ${escapeHtml(r.account_name || "")}<br>${formatDateTime(r.created_at)}</div>
      <div class="admin-row-actions">
        <button class="btn-approve" data-approve-cashout="${r.id}">Mark Paid</button>
        <button class="btn-reject" data-reject-cashout="${r.id}">Reject (refund)</button>
      </div>
    </div>
  `).join("");
  $all("[data-approve-cashout]").forEach((btn) => btn.addEventListener("click", () => reviewCashout(btn.dataset.approveCashout, true)));
  $all("[data-reject-cashout]").forEach((btn) => btn.addEventListener("click", () => reviewCashout(btn.dataset.rejectCashout, false)));
}
async function reviewCashout(id, approve) {
  const { error } = await sb.rpc("admin_review_cashout", { p_request_id: id, p_approve: approve, p_note: null });
  if (error) { showToast(error.message); return; }
  renderAdminCashouts();
}

async function renderAdminReports() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_reports");
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  const open = (data || []).filter((r) => r.status === "open" || r.status === "pending");
  if (open.length === 0) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-check"></i></div>No open reports.</div>`; return; }
  content.innerHTML = open.map((r) => `
    <div class="admin-row">
      <div class="admin-row-title">${escapeHtml(r.reason)}</div>
      <div class="admin-row-meta">By ${escapeHtml(r.reporter_name || "—")} ${r.reported_user_name ? "against " + escapeHtml(r.reported_user_name) : ""}${r.reported_post_id ? " · post" : ""}${r.reported_reel_id ? " · reel" : ""}<br>${formatDateTime(r.created_at)}</div>
      <div class="admin-row-actions">
        <button class="btn-approve" data-resolve-report="${r.id}">Dismiss</button>
        <button class="btn-reject" data-review-report="${r.id}">Mark Reviewed</button>
      </div>
    </div>
  `).join("");
  $all("[data-resolve-report]").forEach((btn) => btn.addEventListener("click", () => reviewReport(btn.dataset.resolveReport, "dismissed")));
  $all("[data-review-report]").forEach((btn) => btn.addEventListener("click", () => reviewReport(btn.dataset.reviewReport, "reviewed")));
}
async function reviewReport(id, status) {
  const { error } = await sb.rpc("admin_review_report", { p_report_id: id, p_status: status });
  if (error) { showToast(error.message); return; }
  renderAdminReports();
}

async function renderAdminPosts() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_posts", { p_limit: 50 });
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  content.innerHTML = (data || []).map((p) => `
    <div class="admin-row">
      <div class="admin-row-title">${escapeHtml([p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "—")}</div>
      <div class="admin-row-meta">${escapeHtml((p.caption || "").slice(0, 80))} · ${formatDateTime(p.created_at)}</div>
      <div class="admin-row-actions">
        <button class="btn-reject" data-delete-post="${p.id}">Delete</button>
      </div>
    </div>
  `).join("") || `<div class="empty-state"><div class="icon"><i class="fa-solid fa-note-sticky"></i></div>No posts.</div>`;
  $all("[data-delete-post]").forEach((btn) => btn.addEventListener("click", async () => {
    const { error } = await sb.rpc("admin_delete_post", { p_post_id: btn.dataset.deletePost });
    if (error) { showToast(error.message); return; }
    renderAdminPosts();
  }));
}

async function renderAdminVerification() {
  const content = $("#admin-content");
  const { data, error } = await sb.rpc("admin_list_verification_requests");
  if (error) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-exclamation"></i></div>${error.message}</div>`; return; }
  const pending = (data || []).filter((r) => r.status === "pending");
  if (pending.length === 0) { content.innerHTML = `<div class="empty-state"><div class="icon"><i class="fa-solid fa-circle-check"></i></div>No pending verification applications.</div>`; return; }
  content.innerHTML = pending.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
    return `
      <div class="admin-row">
        <div class="admin-row-title">${escapeHtml(name)} @${escapeHtml(r.username || "")}</div>
        <div class="admin-row-meta">${r.glocoin_balance || 0} GLOCOIN · ${formatDateTime(r.created_at)}</div>
        <div class="admin-row-actions">
          <button class="btn-approve" data-approve-verify="${r.id}">Approve</button>
          <button class="btn-reject" data-reject-verify="${r.id}">Reject</button>
        </div>
      </div>
    `;
  }).join("");
  $all("[data-approve-verify]").forEach((btn) => btn.addEventListener("click", () => reviewVerification(btn.dataset.approveVerify, true)));
  $all("[data-reject-verify]").forEach((btn) => btn.addEventListener("click", () => reviewVerification(btn.dataset.rejectVerify, false)));
}
async function reviewVerification(id, approve) {
  const { error } = await sb.rpc("admin_review_verification", { p_request_id: id, p_approve: approve, p_note: null });
  if (error) { showToast(error.message); return; }
  renderAdminVerification();
}

async function renderAdminCoinSettings() {
  const content = $("#admin-content");
  const settings = await getCoinSettings();
  const fields = [
    ["buy_naira_per_coin", "Buy rate (₦ per coin)"],
    ["cashout_naira_per_coin", "Cash-out rate (₦ per coin)"],
    ["verify_badge_cost", "Verify badge cost (GLOCOIN)"],
    ["boost_cost", "Boost cost (GLOCOIN)"],
    ["boost_hours", "Boost duration (hours)"],
    ["view_reward_coins", "Reward coins per qualifying post"],
    ["view_reward_threshold", "Views needed to qualify"],
    ["min_followers_for_reward", "Followers needed to qualify"],
  ];
  content.innerHTML = fields.map(([key, label]) => `
    <div class="admin-setting-field">
      <label>${label}</label>
      <input type="number" id="setting-${key}" value="${settings[key]}">
    </div>
  `).join("") + `<button class="btn btn-primary" id="save-coin-settings-btn">Save Settings</button>`;
  $("#save-coin-settings-btn").addEventListener("click", async () => {
    const updates = {};
    fields.forEach(([key]) => { updates[key] = parseFloat($("#setting-" + key).value) || 0; });
    showLoading("posting");
    const { error } = await sb.from("coin_settings").update(updates).eq("id", true);
    hideLoading();
    if (error) { showToast(error.message); return; }
    coinSettingsCache = null;
    showToast(t("posted_success"));
  });
}

// ===================== BOOT =====================
document.documentElement.setAttribute("data-theme", localStorage.getItem("glocon_theme") || "dark");
applyTranslations();
checkSession();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
