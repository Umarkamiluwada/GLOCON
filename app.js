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
  $("#bottom-nav").style.display = ["feed", "chat", "create", "profile"].includes(name) ? "flex" : "none";
  $all("#bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-nav") === name);
  });
  if (name === "feed") loadFeed();
  if (name === "profile") loadProfile();
  if (name === "create") prepareCreateScreen();
  if (name === "chat") { $("#chat-badge").classList.add("hidden"); loadChatList(); }
  if (name === "notifications") { unreadNotifCount = 0; updateNotifBadge(); loadNotifications(); }
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
  list.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("posts")
    .select("id, caption, image_url, created_at, user_id, profiles ( first_name, last_name, avatar_url )")
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
    <div class="post-actions">
      <button class="action-btn like-btn ${meta.liked ? "liked" : ""}" data-action="like">
        <span class="ic">${meta.liked ? "❤️" : "🤍"}</span> <span class="count like-count">${meta.likeCount}</span>
      </button>
      <button class="action-btn" data-action="comment">
        <span class="ic">💬</span> <span class="count comment-count">${meta.commentCount}</span>
      </button>
      <button class="action-btn" data-action="share">
        <span class="ic">🔄</span> ${t("share")}
      </button>
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
  return card;
}

function wirePostCard(card, post) {
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
    likeBtn.querySelector(".ic").textContent = isLiked ? "🤍" : "❤️";
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
  container.innerHTML = `<div class="comment-loading">${t("loading")}</div>`;
  const { data, error } = await sb
    .from("comments")
    .select("id, content, created_at, profiles ( first_name, last_name )")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) {
    container.innerHTML = `<div class="comment-loading">${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="comment-loading">${t("no_comments_yet")}</div>`;
    return;
  }
  container.innerHTML = data
    .map((c) => {
      const p = c.profiles || {};
      const cname = [p.first_name, p.last_name].filter(Boolean).join(" ") || "GLOCON User";
      return `<div class="comment-row"><span class="comment-author">${escapeHtml(cname)}</span> <span class="comment-text">${escapeHtml(c.content)}</span></div>`;
    })
    .join("");
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
    list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`;
    $("#stat-posts").textContent = "0";
    return;
  }
  $("#stat-posts").textContent = String(data.length);
  if (data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📝</div>${t("no_own_posts")}</div>`;
    return;
  }
  for (const post of data) {
    const meta = await getPostMeta(post.id);
    list.appendChild(renderPostCard({ ...post, profiles: p }, meta));
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
  list.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("notifications")
    .select("id, type, preview, created_at, is_read, actor:profiles!notifications_actor_id_fkey(first_name,last_name,avatar_url)")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`; return; }
  if (!data || data.length === 0) { list.innerHTML = `<div class="empty-state"><div class="icon">🔔</div>${t("no_notifications_yet")}</div>`; return; }
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
  const icons = { follow: "➕", like: "❤️", comment: "💬", share: "🔄" };
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
      <div class="conv-name">${icons[n.type] || "🔔"} ${escapeHtml(name)} ${verbs[n.type] || ""}</div>
      ${n.preview ? `<div class="conv-last">"${escapeHtml(n.preview)}"</div>` : ""}
      <div class="conv-last">${formatDateTime(n.created_at)}</div>
    </div>
  `;
  return row;
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
      if (!$("#screen-notifications").classList.contains("active")) {
        unreadNotifCount += 1;
        updateNotifBadge();
      }
    })
    .subscribe();
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
  list.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t("loading")}</div>`;

  const { data, error } = await sb
    .from("conversations")
    .select("id, user1, user2, last_message, last_message_at, user1_profile:profiles!conversations_user1_fkey(first_name,last_name,avatar_url), user2_profile:profiles!conversations_user2_fkey(first_name,last_name,avatar_url)")
    .or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">💬</div>${t("no_chats_yet")}</div>`;
    return;
  }
  list.innerHTML = "";
  data.forEach((conv) => {
    const isUser1 = conv.user1 === currentUser.id;
    const other = isUser1 ? conv.user2_profile : conv.user1_profile;
    const otherId = isUser1 ? conv.user2 : conv.user1;
    const name = [other && other.first_name, other && other.last_name].filter(Boolean).join(" ") || "GLOCON User";
    const online = onlineUserIds.has(otherId);
    const row = document.createElement("div");
    row.className = "conversation-row";
    row.innerHTML = `
      <div class="avatar">${other && other.avatar_url ? `<img src="${other.avatar_url}" alt="">` : initials(other && other.first_name, other && other.last_name)}</div>
      <div class="conv-info">
        <div class="conv-name">${online ? '<span class="dot-online"></span>' : ""}${escapeHtml(name)}</div>
        <div class="conv-last">${escapeHtml(conv.last_message || t("say_hello"))}</div>
      </div>
    `;
    row.addEventListener("click", () => openConversation(conv.id, name, otherId));
    list.appendChild(row);
  });
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

async function openConversation(convId, name, otherUserId) {
  currentConversationId = convId;
  currentConversationOtherName = name;
  currentConversationOtherId = otherUserId;
  $("#conversation-name").textContent = name;
  updateConversationOnlineStatus();
  screen("conversation");
  await loadMessages(convId);
  subscribeToConversation(convId);
}

async function loadMessages(convId) {
  const list = $("#messages-list");
  list.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t("loading")}</div>`;
  const { data, error } = await sb
    .from("messages")
    .select("id, content, sender_id, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { list.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${error.message}</div>`; return; }
  list.innerHTML = "";
  (data || []).forEach((m) => list.appendChild(renderMessageBubble(m)));
  list.scrollTop = list.scrollHeight;
}

function renderMessageBubble(m) {
  const bubble = document.createElement("div");
  const mine = m.sender_id === currentUser.id;
  bubble.className = "msg-bubble " + (mine ? "mine" : "theirs");
  bubble.innerHTML = `<div class="msg-text">${escapeHtml(m.content)}</div><div class="msg-time">${formatDateTime(m.created_at)}</div>`;
  return bubble;
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
        $("#chat-badge").classList.remove("hidden");
      }
    })
    .subscribe();
}

// ===================== BOOT =====================
applyTranslations();
checkSession();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
