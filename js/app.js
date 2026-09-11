/**
 * ConnectHub - Full Application Logic
 */

const app = (() => {
    let currentUser = null;
    let currentPage = 'feed';
    let selectedPostImage = null;
    let openChats = {};
    let notifCount = 0;
    let pendingOtpEmail = null;

    // ─── INIT ───────────────────────────────────────────────────────────────────
    async function init() {
        await loadDB();
        
        const savedUser = localStorage.getItem('ch_session');
        if (savedUser) {
            const user = db.users.find(u => u.id === savedUser || u._id === savedUser);
            if (user) { 
                currentUser = user; 
                if (currentUser.theme === 'light') document.body.classList.add('light-mode');
                else document.body.classList.remove('light-mode');
                showApp(); 
                return; 
            }
        }
        document.getElementById('authContainer').style.display = 'flex';
    }

    // ─── AUTH ────────────────────────────────────────────────────────────────────
    function toggleAuthForm() {
        const login = document.getElementById('loginForm');
        const reg = document.getElementById('registerForm');
        const otp = document.getElementById('otpForm');
        
        if (otp && otp.style.display === 'block') {
            otp.style.display = 'none';
            login.style.display = 'block';
            return;
        }

        login.style.display = login.style.display === 'none' ? 'block' : 'none';
        reg.style.display = reg.style.display === 'none' ? 'block' : 'none';
    }

    async function login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const user = await res.json();
            if (user.error) { showToast('Connection failed', 'error'); return; }
            
            showToast('Connection success', 'success');
            currentUser = user;
            currentUser.id = user._id;
            localStorage.setItem('ch_session', user._id);
            showApp();
        } catch (err) {
            showToast('Connection failed', 'error');
        }
    }

    async function register() {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const username = document.getElementById('regUsername').value.trim().toLowerCase();
        const password = document.getElementById('regPassword').value;
        if (!name || !email || !username || !password) { showToast('All fields required', 'error'); return; }
        
        try {
            const res = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, email, username, password,
                    avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2),
                    bio: 'New to the ConnectHub sphere 🌐'
                })
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            
            showToast(data.message || 'Please check your email for the OTP. ', 'success');
            
            pendingOtpEmail = email;
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('otpForm').style.display = 'block';
            
            document.getElementById('regName').value = '';
            document.getElementById('regEmail').value = '';
            document.getElementById('regUsername').value = '';
            document.getElementById('regPassword').value = '';
        } catch (err) {
            showToast('Registration failed', 'error');
        }
    }

    async function verifyOtp() {
        const otp = document.getElementById('otpInput').value.trim();
        if (!otp || otp.length !== 6) { showToast('Please enter a valid 6-digit OTP', 'error'); return; }

        try {
            const res = await fetch(`${API_BASE}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingOtpEmail, otp })
            });
            const user = await res.json();
            
            if (user.error) { 
                showToast(user.error, 'error');
                document.getElementById('otpInput').value = '';
                pendingOtpEmail = null;
                document.getElementById('otpForm').style.display = 'none';
                document.getElementById('registerForm').style.display = 'block';
                return; 
            }
            
            showToast('Email verified successfully!', 'success');
            
            await loadDB();
            currentUser = user;
            currentUser.id = user._id;
            localStorage.setItem('ch_session', user._id);
            
            document.getElementById('otpInput').value = '';
            pendingOtpEmail = null;
            
            showApp();
        } catch (err) {
            showToast('Verification failed', 'error');
        }
    }

    function cancelOtp() {
        document.getElementById('otpInput').value = '';
        pendingOtpEmail = null;
        document.getElementById('otpForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    }

    function logout() {
        currentUser = null;
        localStorage.removeItem('ch_session');
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
    }

    function showApp() {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        document.getElementById('navAvatar').textContent = currentUser.avatar;
        document.getElementById('createAvatar').textContent = currentUser.avatar;
        renderFeed();
        renderStories();
        renderSidebars();
        switchPage('feed');
    }

    // ─── PAGE ROUTING ────────────────────────────────────────────────────────────
    function switchPage(page) {
        currentPage = page;
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.nav-icon').forEach(i => i.classList.remove('active'));

        const feedContainer = document.querySelector('.feed-container');
        feedContainer.innerHTML = '';

        switch(page) {
            case 'feed':    renderFeedPage(feedContainer); break;
            case 'explore': renderExplorePage(feedContainer); break;
            case 'reels':   renderReelsPage(feedContainer); break;
            case 'messages': renderMessagesPage(feedContainer); break;
            case 'notifications': renderNotificationsPage(feedContainer); break;
            case 'profile': renderProfilePage(feedContainer, currentUser.id); break;
        }

        document.querySelectorAll('.menu-item').forEach(m => {
            if (m.textContent.trim().toLowerCase().startsWith(page)) m.classList.add('active');
        });

        document.querySelectorAll('.mobile-nav-item').forEach(m => {
            m.classList.remove('active');
            const txt = m.textContent.trim().toLowerCase();
            if ((page === 'feed' && txt.includes('feed')) ||
                (page === 'explore' && txt.includes('explore')) ||
                (page === 'reels' && txt.includes('reels')) ||
                (page === 'messages' && (txt.includes('chats') || txt.includes('message'))) ||
                (page === 'profile' && txt.includes('profile'))) {
                m.classList.add('active');
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── FEED PAGE ───────────────────────────────────────────────────────────────
    function renderFeedPage(container) {
        const stories = buildStoriesHTML();
        const createPost = buildCreatePostHTML();
        
        // Randomly load reels into the feed
        const postsList = db.posts.slice().reverse();
        const reelsList = db.reels.slice().sort(() => Math.random() - 0.5);
        
        const combinedFeed = [];
        let postIndex = 0;
        let reelIndex = 0;
        
        while (postIndex < postsList.length || reelIndex < reelsList.length) {
            if (postIndex < postsList.length) {
                combinedFeed.push({ type: 'post', data: postsList[postIndex++] });
            }
            if (reelIndex < reelsList.length && (Math.random() < 0.35 || postIndex % 3 === 0)) {
                combinedFeed.push({ type: 'reel', data: reelsList[reelIndex++] });
            }
        }
        
        const feedHTML = combinedFeed.map(item => {
            if (item.type === 'post') return buildPostHTML(item.data);
            else return buildReelFeedCardHTML(item.data);
        }).join('');

        container.innerHTML = stories + createPost + `<div id="postsList">${feedHTML}</div>`;
        attachPostHandlers();
    }

    function buildStoriesHTML() {
        const addStoryHTML = `
            <div class="story-card add-story" onclick="app.triggerStoryUpload()" style="background:var(--card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;border:1px dashed var(--border);">
                <div style="width:40px;height:40px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:1.2rem;">+</div>
                <div style="font-size:0.75rem;font-weight:600;">Add Story</div>
                <input type="file" id="storyUpload" style="display:none;" accept="image/*" onchange="app.handleStorySelect(event)">
            </div>`;

        const storiesHTML = db.stories.map(s => {
            const user = utils.getUserById(s.userId);
            return `
            <div class="story-card" onclick="app.viewStory('${s.id}')">
                <img src="${s.image}" alt="${user?.name || ''}">
                <div class="story-avatar">${user?.avatar || '?'}</div>
                <div class="story-user">${user?.name?.split(' ')[0] || ''}</div>
            </div>`;
        }).join('');
        return `<div class="stories-strip" id="storiesContainer">${addStoryHTML}${storiesHTML}</div>`;
    }

    function buildCreatePostHTML() {
        return `
        <div class="create-post">
            <div class="create-post-top">
                <div class="user-avatar">${currentUser.avatar}</div>
                <textarea id="postText" placeholder="Share something with the sphere..."></textarea>
            </div>
            <div id="postPreview" style="margin-bottom:1rem;display:none;position:relative;">
                <img src="" id="postPreviewImg" style="width:100%;border-radius:1rem;max-height:300px;object-fit:cover;">
                <button onclick="app.clearPostPreview()" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;">×</button>
            </div>
            <div class="create-post-bottom">
                <div class="post-options">
                    <div class="post-option" onclick="app.triggerImageUpload()"><i class="fa-solid fa-image" style="color:#10b981;"></i><span>Media</span></div>
                    <div class="post-option" onclick="app.triggerReelUpload()"><i class="fa-solid fa-video" style="color:#818cf8;"></i><span>Reel</span></div>
                </div>
                <button class="btn-post" onclick="app.createPost()"><i class="fa-solid fa-paper-plane"></i> Post</button>
            </div>
            <input type="file" id="imageUpload" style="display:none;" accept="image/*" onchange="app.handleImageSelect(event)">
        </div>`;
    }

    function buildPostHTML(post) {
        const user = utils.getUserById(post.userId);
        if (!user) return '';
        const liked = post.likes.includes(currentUser.id);
        const likeCount = post.likes.length;
        const commentCount = post.comments.length;
        const mediaHTML = post.image ? `<img class="post-media" src="${post.image}" alt="Post media" onclick="app.openPostModal('${post.id}')">` : '';
        const commentsPreview = post.comments.slice(-2).map(c => {
            const cu = utils.getUserById(c.userId);
            return `<div style="padding:4px 0;font-size:0.85rem;"><strong>${cu?.name || 'User'}</strong> ${c.text}</div>`;
        }).join('');

        return `
        <div class="post" id="post-${post.id}">
            <div class="post-header">
                <div class="post-user">
                    <div class="user-avatar" style="cursor:pointer;" onclick="app.viewProfile('${post.userId}')">${user.avatar}</div>
                    <div class="post-user-names">
                        <span class="post-user-name" onclick="app.viewProfile('${post.userId}')" style="cursor:pointer;">${user.name}</span>
                        <span class="post-time">${utils.getTimeAgo(post.timestamp)}</span>
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <i class="fa-solid fa-ellipsis" style="cursor:pointer;color:var(--secondary-text);padding:0.5rem;" onclick="app.showPostOptions('${post.id}')"></i>
                </div>
            </div>
            <div class="post-content">${escapeHTML(post.content)}</div>
            ${mediaHTML}
            <div class="post-stats">
                <span>${likeCount} ${likeCount === 1 ? 'like' : 'likes'}</span>
                <span onclick="app.openPostModal('${post.id}')" style="cursor:pointer;">${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}</span>
            </div>
            <div class="post-actions">
                <div class="post-action ${liked ? 'active' : ''}" onclick="app.toggleLike('${post.id}')">
                    <i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i> Like
                </div>
                <div class="post-action" onclick="app.openPostModal('${post.id}')">
                    <i class="fa-regular fa-comment"></i> Comment
                </div>
                <div class="post-action" onclick="app.sharePost('${post.id}')">
                    <i class="fa-solid fa-share-nodes"></i> Share
                </div>
                <div class="post-action" onclick="app.savePost('${post.id}')">
                    <i class="fa-${(currentUser.savedPosts||[]).includes(post.id) ? 'solid' : 'regular'} fa-bookmark"></i> Save
                </div>
            </div>
            ${commentsPreview ? `<div style="padding:0 1.5rem 1rem;border-top:1px solid var(--border);font-size:0.9rem;">${commentsPreview}</div>` : ''}
        </div>`;
    }

    function buildReelFeedCardHTML(reel) {
        const user = utils.getUserById(reel.userId);
        if (!user) return '';
        const liked = reel.likes.includes(currentUser.id);
        const likeCount = reel.likes.length;
        const commentCount = reel.comments.length;
        
        return `
        <div class="post reel-feed-card" id="reel-${reel.id}" style="border: 2px solid var(--accent); position: relative; overflow: hidden; border-radius: 1.5rem; background: var(--card);">
            <div style="position: absolute; top: 12px; right: 12px; background: var(--accent); color: white; padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; z-index: 10; display: flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-clapperboard"></i> REEL
            </div>
            <div class="post-header">
                <div class="post-user">
                    <div class="user-avatar" style="cursor:pointer;" onclick="app.viewProfile('${reel.userId}')">${user.avatar}</div>
                    <div class="post-user-names">
                        <span class="post-user-name" onclick="app.viewProfile('${reel.userId}')" style="cursor:pointer;">${user.name}</span>
                        <span class="post-time">${utils.getTimeAgo(reel.timestamp)}</span>
                    </div>
                </div>
            </div>
            <div class="post-content" style="margin-bottom: 0.8rem; font-weight: 500; padding: 0 1.5rem;">${escapeHTML(reel.caption)}</div>
            <div class="reel-video-container" style="position: relative; max-height: 600px; background: black; border-radius: 1rem; overflow: hidden; display: flex; justify-content: center; align-items: center; margin: 0 1rem 1rem;">
                <video src="${reel.video}" loop autoplay muted playsinline style="width: 100%; max-height: 600px; object-fit: contain; cursor: pointer;" onclick="if(this.muted) { this.muted = false; } else { if(this.paused) this.play(); else this.pause(); }"></video>
            </div>
            <div class="post-stats" style="padding: 0 1.5rem 0.8rem;">
                <span class="reel-likes-count-${reel.id}">${likeCount} likes</span>
                <span style="cursor:pointer;" onclick="app.openReelModal('${reel.id}')">${commentCount} comments</span>
            </div>
            <div class="post-actions" style="border-top: 1px solid var(--border); padding: 0.5rem 0;">
                <div class="post-action ${liked ? 'active' : ''} reel-like-action-${reel.id}" onclick="app.toggleReelLike('${reel.id}')">
                    <i class="fa-${liked ? 'solid' : 'regular'} fa-heart" style="${liked ? 'color:#ef4444;' : ''}"></i> Like
                </div>
                <div class="post-action" onclick="app.openReelModal('${reel.id}')">
                    <i class="fa-regular fa-comment"></i> Comment
                </div>
            </div>
        </div>`;
    }

    function attachPostHandlers() {}

    // ─── ACTIONS ─────────────────────────────────────────────────────────────────
    async function createPost() {
        const text = document.getElementById('postText')?.value?.trim();
        if (!text && !selectedPostImage) { showToast('Write something first!', 'error'); return; }
        
        const postData = {
            userId: currentUser.id,
            content: text || '',
            image: selectedPostImage || null,
            likes: [],
            comments: [],
            timestamp: Date.now()
        };

        try {
            const res = await fetch(`${API_BASE}/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });
            const post = await res.json();
            post.id = post._id;

            db.posts.unshift(post);
            clearPostPreview();
            if (document.getElementById('postText')) document.getElementById('postText').value = '';
            const postsList = document.getElementById('postsList');
            if (postsList) {
                postsList.insertAdjacentHTML('afterbegin', buildPostHTML(post));
            }
            showToast('Posted! 🎉');
        } catch (err) {
            showToast('Failed to post', 'error');
        }
    }

    function triggerImageUpload() {
        const el = document.getElementById('imageUpload');
        if (el) el.click();
    }

    function handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            selectedPostImage = e.target.result;
            const preview = document.getElementById('postPreview');
            const img = document.getElementById('postPreviewImg');
            if (preview && img) { img.src = e.target.result; preview.style.display = 'block'; }
        };
        reader.readAsDataURL(file);
    }

    function clearPostPreview() {
        selectedPostImage = null;
        const preview = document.getElementById('postPreview');
        if (preview) preview.style.display = 'none';
    }

    async function toggleLike(postId) {
        try {
            const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id })
            });
            const updatedPost = await res.json();
            updatedPost.id = updatedPost._id;
            
            const idx = db.posts.findIndex(p => p.id === postId);
            if (idx !== -1) db.posts[idx] = updatedPost;

            if (updatedPost.likes.includes(currentUser.id) && updatedPost.userId !== currentUser.id) {
                addNotification(updatedPost.userId, 'like', postId);
            }

            const postEl = document.getElementById(`post-${postId}`);
            if (postEl) {
                postEl.outerHTML = buildPostHTML(updatedPost);
            }
        } catch (err) {
            showToast('Action failed', 'error');
        }
    }

    function savePost(postId) {
        currentUser.savedPosts = currentUser.savedPosts || [];
        const idx = currentUser.savedPosts.indexOf(postId);
        if (idx === -1) { currentUser.savedPosts.push(postId); showToast('Post saved! 🔖'); }
        else { currentUser.savedPosts.splice(idx, 1); showToast('Post unsaved'); }
        saveDB();
        const post = db.posts.find(p => p.id === postId);
        if (post) document.getElementById(`post-${postId}`).outerHTML = buildPostHTML(post);
    }

    function sharePost(postId) {
        navigator.clipboard?.writeText(window.location.href + '#post-' + postId);
        showToast('Link copied to clipboard! 📋');
    }

    function showPostOptions(postId) {
        const post = db.posts.find(p => p.id === postId);
        if (!post) return;
        let options = `<div style="position:fixed;inset:0;z-index:5000;" onclick="this.remove()"></div>
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:1rem;z-index:5001;min-width:200px;box-shadow:0 20px 40px rgba(0,0,0,0.4);">
            ${post.userId === currentUser.id ? `<div style="padding:0.8rem;cursor:pointer;border-radius:0.5rem;" onmouseenter="this.style.background='var(--card)'" onmouseleave="this.style.background=''" onclick="app.deletePost('${postId}')">🗑️ Delete Post</div>` : ''}
            <div style="padding:0.8rem;cursor:pointer;border-radius:0.5rem;" onmouseenter="this.style.background='var(--card)'" onmouseleave="this.style.background=''" onclick="app.sharePost('${postId}')">🔗 Copy Link</div>
            <div style="padding:0.8rem;cursor:pointer;border-radius:0.5rem;" onmouseenter="this.style.background='var(--card)'" onmouseleave="this.style.background=''" onclick="app.savePost('${postId}')">🔖 Save Post</div>
        </div>`;
        const div = document.createElement('div');
        div.innerHTML = options;
        document.body.appendChild(div);
    }

    async function deletePost(postId) {
        document.querySelectorAll('div').forEach(d => { if (d.style.zIndex >= 5000) d.remove(); });
        const post = db.posts.find(p => p.id === postId);
        if (!post || post.userId !== currentUser.id) return;

        try {
            await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE' });
            const idx = db.posts.findIndex(p => p.id === postId);
            db.posts.splice(idx, 1);
            
            const el = document.getElementById(`post-${postId}`);
            if (el) { el.style.animation = 'none'; el.style.opacity = '0'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }
            showToast('Post deleted');
        } catch (err) {
            showToast('Failed to delete', 'error');
        }
    }

    // ─── POST MODAL ──────────────────────────────────────────────────────────────
    function openPostModal(postId) {
        const post = db.posts.find(p => p.id === postId);
        if (!post) return;
        const user = utils.getUserById(post.userId);
        const liked = post.likes.includes(currentUser.id);
        const commentsHTML = post.comments.map(c => {
            const cu = utils.getUserById(c.userId);
            return `<div style="display:flex;gap:0.8rem;margin-bottom:1rem;">
                <div class="user-avatar" style="width:36px;height:36px;font-size:0.75rem;flex-shrink:0;">${cu?.avatar||'?'}</div>
                <div>
                    <strong style="font-size:0.9rem;">${cu?.name||'User'}</strong>
                    <span style="color:var(--secondary-text);font-size:0.8rem;margin-left:0.5rem;">${utils.getTimeAgo(c.timestamp)}</span>
                    <div style="font-size:0.9rem;margin-top:0.3rem;">${escapeHTML(c.text)}</div>
                </div>
            </div>`;
        }).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.id = 'postModalOverlay';
        modal.innerHTML = `
        <div class="modal-content" style="animation:scaleIn 0.3s cubic-bezier(0.16,1,0.3,1);">
            <div style="flex:1;background:#000;display:flex;align-items:center;justify-content:center;${!post.image?'display:none':''}" >
                ${post.image ? `<img src="${post.image}" style="max-height:100%;max-width:100%;object-fit:contain;">` : ''}
            </div>
            <div style="width:400px;display:flex;flex-direction:column;border-left:1px solid var(--border);">
                <div style="padding:1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.8rem;">
                    <div class="user-avatar" style="width:40px;height:40px;font-size:0.85rem;">${user?.avatar||'?'}</div>
                    <div>
                        <div style="font-weight:600;">${user?.name||'User'}</div>
                        <div style="font-size:0.8rem;color:var(--secondary-text);">${utils.getTimeAgo(post.timestamp)}</div>
                    </div>
                    <div style="margin-left:auto;cursor:pointer;font-size:1.5rem;color:var(--secondary-text);" onclick="document.getElementById('postModalOverlay').remove()">×</div>
                </div>
                <div style="padding:1rem;border-bottom:1px solid var(--border);">${escapeHTML(post.content)}</div>
                <div style="flex:1;overflow-y:auto;padding:1rem;">${commentsHTML || '<div style="color:var(--secondary-text);text-align:center;margin-top:2rem;">No comments yet. Be first!</div>'}</div>
                <div style="padding:1rem;border-top:1px solid var(--border);">
                    <div style="display:flex;gap:1rem;font-size:1.4rem;margin-bottom:0.8rem;">
                        <i class="fa-${liked?'solid':'regular'} fa-heart" id="modalLikeIcon" style="cursor:pointer;${liked?'color:var(--accent)':''}" onclick="app.modalLike('${postId}')"></i>
                        <i class="fa-regular fa-comment" style="cursor:pointer;color:var(--secondary-text);"></i>
                        <i class="fa-solid fa-share-nodes" style="cursor:pointer;color:var(--secondary-text);" onclick="app.sharePost('${postId}')"></i>
                    </div>
                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.8rem;" id="modalLikeCount">${post.likes.length} likes</div>
                    <div style="display:flex;gap:0.5rem;">
                        <input id="modalCommentInput" placeholder="Add a comment..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:0.5rem 1rem;color:var(--text);font-size:0.9rem;">
                        <button onclick="app.addComment('${postId}')" class="btn-post" style="border-radius:0.8rem;padding:0.5rem 1.2rem;">Post</button>
                    </div>
                </div>
            </div>
        </div>`;
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    function modalLike(postId) {
        toggleLike(postId);
        const post = db.posts.find(p => p.id === postId);
        const icon = document.getElementById('modalLikeIcon');
        const count = document.getElementById('modalLikeCount');
        if (icon && post) {
            const liked = post.likes.includes(currentUser.id);
            icon.className = `fa-${liked?'solid':'regular'} fa-heart`;
            icon.style.color = liked ? 'var(--accent)' : '';
            if (count) count.textContent = `${post.likes.length} likes`;
        }
    }

    async function addComment(postId) {
        const input = document.getElementById('modalCommentInput');
        if (!input || !input.value.trim()) return;
        
        const commentData = {
            userId: currentUser.id,
            text: input.value.trim(),
            timestamp: Date.now()
        };

        try {
            const res = await fetch(`${API_BASE}/posts/${postId}/comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(commentData)
            });
            const updatedPost = await res.json();
            updatedPost.id = updatedPost._id;
            
            const idx = db.posts.findIndex(p => p.id === postId);
            if (idx !== -1) db.posts[idx] = updatedPost;

            if (updatedPost.userId !== currentUser.id) {
                addNotification(updatedPost.userId, 'comment', postId);
            }

            const modalDoc = document.querySelector('[style*="overflow-y:auto"]');
            if (modalDoc) {
                const cu = currentUser;
                modalDoc.insertAdjacentHTML('beforeend', `<div style="display:flex;gap:0.8rem;margin-bottom:1rem;">
                    <div class="user-avatar" style="width:36px;height:36px;font-size:0.75rem;flex-shrink:0;">${cu.avatar}</div>
                    <div><strong style="font-size:0.9rem;">${cu.name}</strong>
                    <div style="font-size:0.9rem;margin-top:0.3rem;">${escapeHTML(commentData.text)}</div></div></div>`);
                modalDoc.scrollTop = modalDoc.scrollHeight;
            }
            input.value = '';
            const postEl = document.getElementById(`post-${postId}`);
            if (postEl) postEl.outerHTML = buildPostHTML(updatedPost);
        } catch (err) {
            showToast('Failed to comment', 'error');
        }
    }

    // ─── EXPLORE PAGE ────────────────────────────────────────────────────────────
    function renderExplorePage(container) {
        const images = db.posts.filter(p => p.image).map(p => `
            <div style="position:relative;aspect-ratio:1;overflow:hidden;border-radius:0.8rem;cursor:pointer;background:var(--card);" onclick="app.openPostModal('${p.id}')">
                <img src="${p.image}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            </div>`).join('');

        const trendingPeople = db.users.filter(u => u.id !== currentUser.id).map(u => {
            const isFollowing = (currentUser.followingList || []).includes(u.id);
            return `
            <div class="contact-item">
                <div class="contact-avatar">${u.avatar}</div>
                <div style="flex:1">
                    <div style="font-weight:600;">${u.name}</div>
                    <div style="font-size:0.8rem;color:var(--secondary-text);">@${u.username}</div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button class="btn-post" style="width:auto;padding:0.4rem 1rem;font-size:0.85rem;background:${isFollowing ? 'var(--card)' : 'var(--accent)'};color:${isFollowing ? 'var(--text)' : 'white'}" onclick="app.toggleFollow('${u.id}')">
                        ${isFollowing ? 'Unfollow' : 'Follow'}
                    </button>
                    <button class="btn-post" style="width:auto;padding:0.4rem 1rem;font-size:0.85rem;" onclick="app.viewProfile('${u.id}')">View</button>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <h2 style="margin-bottom:1.5rem;font-size:1.5rem;">Explore</h2>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:2rem;">
                ${images || '<div style="grid-column:1/-1;text-align:center;color:var(--secondary-text);padding:2rem;">No media posts yet</div>'}
            </div>
            <h2 style="margin-bottom:1rem;font-size:1.2rem;">People You May Know</h2>
            ${trendingPeople}`;
    }

    // ─── REELS PAGE ──────────────────────────────────────────────────────────────
    function renderReelsPage(container) {
        container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;max-width:420px;margin-bottom:1rem;padding:0 0.5rem;">
                <h2 style="font-size:1.5rem;font-weight:700;margin:0;">Reels</h2>
                <button class="btn-post" style="width:auto;border-radius:999px;padding:0.5rem 1rem;" onclick="app.triggerReelUpload()">
                    <i class="fa-solid fa-plus"></i> Create Reel
                </button>
            </div>
            
            <div id="reelsContainer" style="width:100%;max-width:420px;height:calc(100vh - 180px);overflow-y:scroll;scroll-snap-type:y mandatory;border-radius:1.5rem;box-shadow:0 15px 35px rgba(0,0,0,0.5);background:#000;position:relative;" onscroll="app.handleReelsScroll(this)">
                <!-- Reels go here -->
            </div>
        </div>`;
        
        const reelsContainer = document.getElementById('reelsContainer');
        if (db.reels.length === 0) {
            reelsContainer.innerHTML = `<div style="color:white;text-align:center;padding-top:10rem;">No reels yet. Be the first to publish! 🎬</div>`;
            return;
        }

        // Shuffle reels array slightly on each load to bring reels in a random way
        app.shuffledReels = db.reels.slice().sort(() => Math.random() - 0.5);
        app.shuffledIndex = 0;

        // Append initial 3 reels
        for (let i = 0; i < 3; i++) {
            appendRandomReelElement(reelsContainer);
        }
    }

    function getRandomReel() {
        if (!app.shuffledReels || app.shuffledReels.length === 0) return null;
        if (app.shuffledIndex >= app.shuffledReels.length) {
            // Re-shuffle to guarantee endless scrolling without running out
            app.shuffledReels = db.reels.slice().sort(() => Math.random() - 0.5);
            app.shuffledIndex = 0;
        }
        return app.shuffledReels[app.shuffledIndex++];
    }

    function appendRandomReelElement(container) {
        const reel = getRandomReel();
        if (!reel) return;
        const instanceId = utils.generateId();
        const html = buildSingleReelCardHTML(reel, instanceId);
        container.insertAdjacentHTML('beforeend', html);
    }

    function handleReelsScroll(container) {
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 200) {
            appendRandomReelElement(container);
        }

        clearTimeout(container.scrollTimeout);
        container.scrollTimeout = setTimeout(() => {
            const cards = container.querySelectorAll('.single-reel-card');
            let closestCard = null;
            let minDistance = Infinity;
            const containerCenter = container.scrollTop + (container.clientHeight / 2);
            
            cards.forEach(card => {
                const cardCenter = card.offsetTop + (card.offsetHeight / 2);
                const distance = Math.abs(containerCenter - cardCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCard = card;
                }
            });
            
            cards.forEach(card => {
                const video = card.querySelector('video');
                if (video) {
                    if (card === closestCard) {
                        video.play().catch(e=>{});
                    } else {
                        video.pause();
                    }
                }
            });
        }, 100);
    }

    function buildSingleReelCardHTML(reel, instanceId) {
        const user = utils.getUserById(reel.userId);
        if (!user) return '';
        const liked = reel.likes.includes(currentUser.id);
        const likeCount = reel.likes.length;
        const commentCount = reel.comments.length;
        
        return `
        <div class="single-reel-card" id="reel-card-${instanceId}" data-reel-id="${reel.id}" style="width:100%;height:100%;scroll-snap-align:start;position:relative;background:#000;display:flex;justify-content:center;align-items:center;flex-shrink:0;">
            <video src="${reel.video}" loop autoplay muted playsinline style="width:100%;height:100%;object-fit:contain;display:block;" onclick="if(this.muted) { this.muted = false; } else { if(this.paused) this.play(); else this.pause(); }"></video>
            
            <!-- Left bottom overlay info -->
            <div style="position:absolute;bottom:0;left:0;right:60px;padding:1.5rem;background:linear-gradient(to top, rgba(0,0,0,0.8), transparent);color:white;pointer-events:none;z-index:20;text-align:left;">
                <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:0.8rem;pointer-events:auto;">
                    <div class="user-avatar" style="width:36px;height:36px;font-size:0.75rem;border:2px solid white;cursor:pointer;" onclick="app.viewProfile('${reel.userId}')">${user.avatar}</div>
                    <div>
                        <div style="font-weight:600;font-size:0.95rem;cursor:pointer;" onclick="app.viewProfile('${reel.userId}')">${user.name}</div>
                        <div style="font-size:0.8rem;color:#ccc;">@${user.username}</div>
                    </div>
                </div>
                <div style="font-size:0.9rem;line-height:1.4;max-height:60px;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(reel.caption)}</div>
            </div>

            <!-- Right side action buttons overlay -->
            <div style="position:absolute;bottom:2rem;right:0.8rem;display:flex;flex-direction:column;align-items:center;gap:1.5rem;z-index:30;color:white;">
                <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" onclick="app.toggleReelLike('${reel.id}', '${instanceId}')">
                    <div style="width:45px;height:45px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;margin-bottom:0.3rem;" class="reel-like-btn-${reel.id}">
                        <i class="fa-${liked?'solid':'regular'} fa-heart" style="${liked?'color:#ef4444;':''}"></i>
                    </div>
                    <span style="font-size:0.75rem;font-weight:600;" class="reel-likes-count-${reel.id}">${likeCount}</span>
                </div>
                
                <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" onclick="app.openReelModal('${reel.id}')">
                    <div style="width:45px;height:45px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;margin-bottom:0.3rem;">
                        <i class="fa-regular fa-comment"></i>
                    </div>
                    <span style="font-size:0.75rem;font-weight:600;">${commentCount}</span>
                </div>
                
                <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" onclick="app.shareReel('${reel.id}')">
                    <div style="width:45px;height:45px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;">
                        <i class="fa-solid fa-share-nodes"></i>
                    </div>
                    <span style="font-size:0.75rem;font-weight:600;margin-top:0.3rem;">Share</span>
                </div>
            </div>
        </div>`;
    }

    // ─── MESSAGES PAGE ───────────────────────────────────────────────────────────
    function renderMessagesPage(container) {
        const contacts = db.users.filter(u => u.id !== currentUser.id);
        const contactsHTML = contacts.map(u => `
            <div class="contact-item" onclick="app.openChat('${u.id}')" style="padding:1rem;border-radius:1rem;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='var(--card)'" onmouseout="this.style.background=''">
                <div class="contact-avatar" style="position:relative;">
                    ${u.avatar}
                    <div class="online-status"></div>
                </div>
                <div style="flex:1">
                    <div style="font-weight:600;">${u.name}</div>
                    <div style="font-size:0.8rem;color:var(--secondary-text);">@${u.username}</div>
                </div>
            </div>`).join('');

        container.innerHTML = `
            <h2 style="margin-bottom:1.5rem;font-size:1.5rem;">Messages</h2>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:1.5rem;overflow:hidden;">
                ${contactsHTML || '<div style="padding:2rem;text-align:center;color:var(--secondary-text);">No contacts yet</div>'}
            </div>`;
    }

    async function openChat(userId) {
        if (openChats[userId]) { openChats[userId].style.display = 'flex'; return; }
        const user = utils.getUserById(userId);
        if (!user) return;
        const chatId = utils.getChatId(currentUser.id, userId);
        
        let messages = [];
        try {
            const res = await fetch(`${API_BASE}/messages/${chatId}`);
            messages = await res.json();
        } catch (err) {}

        const messagesHTML = messages.map(m => `
            <div class="message ${m.from === currentUser.id ? 'sent' : 'received'}">${escapeHTML(m.text)}
                <div style="font-size:0.7rem;opacity:0.7;margin-top:0.3rem;">${utils.getTimeAgo(m.timestamp)}</div>
            </div>`).join('');

        const box = document.createElement('div');
        box.className = 'chat-box';
        box.innerHTML = `
            <div class="chat-header">
                <div style="display:flex;align-items:center;gap:0.8rem;">
                    <div class="contact-avatar" style="width:32px;height:32px;font-size:0.75rem;">${user.avatar}</div>
                    <div><div style="font-weight:600;font-size:0.9rem;">${user.name}</div><div style="font-size:0.75rem;color:var(--success);">● Online</div></div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor:pointer;color:var(--secondary-text);" onclick="app.closeChat('${userId}')"></i>
            </div>
            <div class="chat-messages" id="chatMessages-${userId}">${messagesHTML}</div>
            <div class="chat-input">
                <input type="text" id="chatInput-${userId}" placeholder="Message ${user.name}..." onkeypress="if(event.key==='Enter')app.sendMessage('${userId}')">
                <button class="btn-post" style="width:auto;padding:0.5rem 1rem;border-radius:999px;" onclick="app.sendMessage('${userId}')"><i class="fa-solid fa-paper-plane"></i></button>
            </div>`;
        document.getElementById('chatDock').appendChild(box);
        openChats[userId] = box;
        const msgContainer = document.getElementById(`chatMessages-${userId}`);
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    async function sendMessage(userId) {
        const input = document.getElementById(`chatInput-${userId}`);
        if (!input || !input.value.trim()) return;
        const chatId = utils.getChatId(currentUser.id, userId);
        
        const msgData = { 
            chatId, 
            from: currentUser.id, 
            text: input.value.trim(), 
            timestamp: Date.now() 
        };

        try {
            await fetch(`${API_BASE}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msgData)
            });

            const container = document.getElementById(`chatMessages-${userId}`);
            if (container) {
                container.insertAdjacentHTML('beforeend', `<div class="message sent">${escapeHTML(msgData.text)}<div style="font-size:0.7rem;opacity:0.7;margin-top:0.3rem;">Just now</div></div>`);
                container.scrollTop = container.scrollHeight;
            }
            input.value = '';
        } catch (err) {
            showToast('Failed to send message', 'error');
        }
    }

    function closeChat(userId) {
        if (openChats[userId]) { openChats[userId].remove(); delete openChats[userId]; }
    }

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
    async function addNotification(toUserId, type, postId) {
        try {
            await fetch(`${API_BASE}/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: toUserId, from: currentUser.id, type, postId, timestamp: Date.now(), read: false })
            });
        } catch (err) {}
    }

    async function renderNotificationsPage(container) {
        let myNotifs = [];
        try {
            const res = await fetch(`${API_BASE}/notifications/${currentUser.id}`);
            myNotifs = await res.json();
            await fetch(`${API_BASE}/notifications/read/${currentUser.id}`, { method: 'PUT' });
        } catch (err) {}

        const notifHTML = myNotifs.length ? myNotifs.map(n => {
            const from = utils.getUserById(n.from);
            const icon = n.type === 'like' ? '❤️' : n.type === 'comment' ? '💬' : '👤';
            const action = n.type === 'like' ? 'liked your post' : n.type === 'comment' ? 'commented on your post' : 'followed you';
            return `<div style="display:flex;align-items:center;gap:1rem;padding:1rem;border-bottom:1px solid var(--border);">
                <div class="user-avatar">${from?.avatar||'?'}</div>
                <div style="flex:1"><strong>${from?.name||'Someone'}</strong> ${action}<div style="font-size:0.8rem;color:var(--secondary-text);">${utils.getTimeAgo(n.timestamp)}</div></div>
                <div style="font-size:1.5rem;">${icon}</div>
            </div>`;
        }).join('') : '<div style="text-align:center;padding:4rem;color:var(--secondary-text);">🔔 No notifications yet</div>';

        container.innerHTML = `<h2 style="margin-bottom:1.5rem;">Notifications</h2>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:1.5rem;overflow:hidden;">${notifHTML}</div>`;
    }

    // ─── PROFILE PAGE ────────────────────────────────────────────────────────────
    function viewProfile(userId) {
        const container = document.querySelector('.feed-container');
        renderProfilePage(container, userId);
        currentPage = 'profile';
    }

    function renderProfilePage(container, userId) {
        const user = utils.getUserById(userId);
        if (!user) return;
        const isOwn = userId === currentUser.id;
        const userPosts = db.posts.filter(p => p.userId === userId);
        const postsGrid = userPosts.length
            ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;">${userPosts.map(p => p.image
                ? `<div style="aspect-ratio:1;overflow:hidden;border-radius:0.5rem;cursor:pointer;" onclick="app.openPostModal('${p.id}')"><img src="${p.image}" style="width:100%;height:100%;object-fit:cover;"></div>`
                : `<div style="aspect-ratio:1;background:var(--card);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.9rem;padding:1rem;text-align:center;border:1px solid var(--border);" onclick="app.openPostModal('${p.id}')">${p.content.slice(0,80)}</div>`
            ).join('')}</div>`
            : '<div style="text-align:center;padding:3rem;color:var(--secondary-text);">No posts yet</div>';

        container.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:1.5rem;overflow:hidden;margin-bottom:2rem;">
            <div style="height:180px;background:linear-gradient(135deg, #38bdf8, #818cf8);"></div>
            <div style="padding:0 2rem 2rem;margin-top:-60px;">
                <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                    <div class="user-avatar" style="width:100px;height:100px;font-size:2rem;border:4px solid var(--bg);">${user.avatar}</div>
                    <div style="display:flex;gap:0.8rem;padding-bottom:0.5rem;">
                        ${isOwn
                            ? `<button class="btn-post" onclick="app.editProfile()" style="width:auto;padding:0.6rem 1.5rem;border-radius:999px;">Edit Profile</button>`
                            : `
                            <button class="btn-post" onclick="app.toggleFollow('${userId}')" style="width:auto;padding:0.6rem 1.5rem;border-radius:999px;background:${(currentUser.followingList || []).includes(userId) ? 'var(--card)' : 'var(--accent)'};color:${(currentUser.followingList || []).includes(userId) ? 'var(--text)' : 'white'}">
                                ${(currentUser.followingList || []).includes(userId) ? 'Unfollow' : 'Follow'}
                            </button>
                            <button class="btn-post" onclick="app.openChat('${userId}')" style="width:auto;padding:0.6rem 1.5rem;border-radius:999px;"><i class="fa-solid fa-message"></i> Message</button>
                            `}
                    </div>
                </div>
                <div style="margin-top:1rem;">
                    <h2 style="font-size:1.4rem;font-weight:700;">${user.name}</h2>
                    <div style="color:var(--secondary-text);">@${user.username}</div>
                    <div style="margin-top:0.8rem;">${user.bio || ''}</div>
                    <div style="display:flex;gap:2rem;margin-top:1.2rem;">
                        <div><strong>${userPosts.length}</strong> <span style="color:var(--secondary-text);">Posts</span></div>
                        <div><strong>${user.followers}</strong> <span style="color:var(--secondary-text);">Followers</span></div>
                        <div><strong>${user.following}</strong> <span style="color:var(--secondary-text);">Following</span></div>
                    </div>
                </div>
            </div>
        </div>
        <h3 style="margin-bottom:1rem;">Posts</h3>
        ${postsGrid}`;
    }

    function editProfile() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:2rem;width:90%;max-width:480px;padding:2rem;animation:scaleIn 0.3s cubic-bezier(0.16,1,0.3,1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.3rem;">Edit Profile</h3>
                <i class="fa-solid fa-xmark" style="cursor:pointer;font-size:1.2rem;" onclick="this.closest('.modal-overlay').remove()"></i>
            </div>
            <input type="text" id="editName" value="${currentUser.name}" placeholder="Full Name" style="margin-bottom:1rem;background:var(--bg);border:1px solid var(--border);border-radius:1rem;padding:0.8rem 1rem;width:100%;color:var(--text);">
            <input type="text" id="editBio" value="${currentUser.bio || ''}" placeholder="Bio" style="margin-bottom:1rem;background:var(--bg);border:1px solid var(--border);border-radius:1rem;padding:0.8rem 1rem;width:100%;color:var(--text);">
            <button class="btn-primary" onclick="app.saveProfile(this)">Save Changes</button>
        </div>`;
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    async function saveProfile(btn) {
        const name = document.getElementById('editName')?.value?.trim();
        const bio = document.getElementById('editBio')?.value?.trim();
        if (!name) { showToast('Name required', 'error'); return; }
        
        try {
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
            const res = await fetch(`${API_BASE}/users/${currentUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, bio, avatar })
            });
            const updatedUser = await res.json();
            currentUser = updatedUser;
            currentUser.id = updatedUser._id;
            
            await loadDB(); // Refresh local DB users
            btn.closest('.modal-overlay').remove();
            document.getElementById('navAvatar').textContent = currentUser.avatar;
            document.getElementById('createAvatar').textContent = currentUser.avatar;
            showToast('Profile updated! ✨');
            renderProfilePage(document.querySelector('.feed-container'), currentUser.id);
        } catch (err) {
            showToast('Failed to update profile', 'error');
        }
    }

    async function toggleFollow(userId) {
        try {
            const res = await fetch(`${API_BASE}/users/${userId}/follow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentUserId: currentUser.id })
            });
            const result = await res.json();
            if (result.error) { showToast(result.error, 'error'); return; }

            // Update in-memory db.users
            const idx1 = db.users.findIndex(u => u.id === currentUser.id);
            if (idx1 !== -1) {
                db.users[idx1] = result.currentUser;
                db.users[idx1].id = result.currentUser._id;
            }
            const idx2 = db.users.findIndex(u => u.id === userId);
            if (idx2 !== -1) {
                db.users[idx2] = result.userToFollow;
                db.users[idx2].id = result.userToFollow._id;
            }

            // Update currentUser state
            currentUser = db.users[idx1];

            if (result.followed) {
                showToast('Followed! 👤');
                addNotification(userId, 'follow');
            } else {
                showToast('Unfollowed');
            }

            // If we are currently on the profile page of that user, re-render it
            const feedContainer = document.querySelector('.feed-container');
            if (currentPage === 'profile') {
                renderProfilePage(feedContainer, userId);
            } else if (currentPage === 'explore') {
                renderExplorePage(feedContainer);
            }
            renderSidebars(); // Update contacts/recs if they changed
        } catch (err) {
            showToast('Action failed', 'error');
        }
    }

    function triggerReelUpload() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.id = 'createReelModal';
        
        modal.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:2rem;width:90%;max-width:480px;padding:2rem;animation:scaleIn 0.3s cubic-bezier(0.16,1,0.3,1);box-shadow:0 20px 50px rgba(0,0,0,0.5);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.3rem;font-weight:700;margin:0;"><i class="fa-solid fa-clapperboard" style="color:var(--accent);margin-right:0.5rem;"></i> Create a Reel</h3>
                <i class="fa-solid fa-xmark" style="cursor:pointer;font-size:1.2rem;color:var(--secondary-text);" onclick="this.closest('.modal-overlay').remove()"></i>
            </div>
            
            <div style="margin-bottom:1.2rem;text-align:left;">
                <label style="font-weight:600;font-size:0.9rem;display:block;margin-bottom:0.5rem;">Reel Caption</label>
                <textarea id="reelCaptionInput" placeholder="Write a catchy caption for your Reel... #viral" style="background:var(--bg);border:1px solid var(--border);border-radius:1rem;padding:0.8rem 1rem;width:100%;color:var(--text);font-family:inherit;min-height:80px;resize:none;box-sizing:border-box;"></textarea>
            </div>

            <div id="videoUploadContainer" style="margin-bottom:1.5rem;text-align:left;">
                <label style="font-weight:600;font-size:0.9rem;display:block;margin-bottom:0.5rem;">Upload Video File</label>
                <input type="file" id="reelFileUpload" accept="video/mp4,video/webm" style="color:var(--text);box-sizing:border-box;">
                <div style="font-size:0.75rem;color:var(--secondary-text);margin-top:0.4rem;">Max size: 10MB</div>
            </div>
            
            <button class="btn-primary" onclick="app.publishReel(this)" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;font-weight:600;">
                <i class="fa-solid fa-paper-plane"></i> Publish Reel
            </button>
        </div>`;
        
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }


    async function publishReel(btn) {
        const caption = document.getElementById('reelCaptionInput')?.value?.trim();
        
        const fileInput = document.getElementById('reelFileUpload');
        const file = fileInput?.files[0];
        if (!file) { showToast('Please select a video file', 'error'); return; }
        
        const reader = new FileReader();
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Video...`;
        
        reader.onload = async (e) => {
            await createReelOnBackend(caption, e.target.result, btn);
        };
        reader.readAsDataURL(file);
    }

    async function createReelOnBackend(caption, videoUrl, btn) {
        try {
            const res = await fetch(`${API_BASE}/reels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    caption: caption || '',
                    video: videoUrl,
                    likes: [],
                    comments: []
                })
            });
            const newReel = await res.json();
            newReel.id = newReel._id;
            
            db.reels.unshift(newReel);
            btn.closest('.modal-overlay').remove();
            showToast('Reel published! 🎬✨');
            
            const feedContainer = document.querySelector('.feed-container');
            if (currentPage === 'feed') {
                renderFeedPage(feedContainer);
            } else if (currentPage === 'reels') {
                renderReelsPage(feedContainer);
            }
        } catch (err) {
            showToast('Failed to publish Reel', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Publish Reel`;
            }
        }
    }

    async function toggleReelLike(reelId, instanceId) {
        try {
            const res = await fetch(`${API_BASE}/reels/${reelId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id })
            });
            const updatedReel = await res.json();
            updatedReel.id = updatedReel._id;
            
            const idx = db.reels.findIndex(r => r.id === reelId);
            if (idx !== -1) db.reels[idx] = updatedReel;

            if (updatedReel.likes.includes(currentUser.id) && updatedReel.userId !== currentUser.id) {
                addNotification(updatedReel.userId, 'like', reelId);
            }

            const isLiked = updatedReel.likes.includes(currentUser.id);
            
            document.querySelectorAll(`.reel-like-btn-${reelId}`).forEach(el => {
                el.innerHTML = `<i class="fa-${isLiked?'solid':'regular'} fa-heart" style="${isLiked?'color:#ef4444;':''}"></i>`;
            });
            document.querySelectorAll(`.reel-likes-count-${reelId}`).forEach(el => {
                el.textContent = updatedReel.likes.length;
            });
            
            document.querySelectorAll(`.reel-like-action-${reelId}`).forEach(el => {
                if (isLiked) el.classList.add('active');
                else el.classList.remove('active');
                el.innerHTML = `<i class="fa-${isLiked?'solid':'regular'} fa-heart" style="${isLiked?'color:#ef4444;':''}"></i> Like`;
            });
            
            const modalIcon = document.getElementById('reelModalLikeIcon');
            const modalCount = document.getElementById('reelModalLikeCount');
            if (modalIcon) {
                modalIcon.className = `fa-${isLiked?'solid':'regular'} fa-heart`;
                modalIcon.style.color = isLiked ? '#ef4444' : '';
            }
            if (modalCount) {
                modalCount.textContent = `${updatedReel.likes.length} likes`;
            }
        } catch (err) {
            showToast('Action failed', 'error');
        }
    }

    function openReelModal(reelId) {
        const reel = db.reels.find(r => r.id === reelId);
        if (!reel) return;
        const user = utils.getUserById(reel.userId);
        const liked = reel.likes.includes(currentUser.id);
        const commentsHTML = reel.comments.map(c => {
            const cu = utils.getUserById(c.userId);
            return `<div style="display:flex;gap:0.8rem;margin-bottom:1rem;">
                <div class="user-avatar" style="width:36px;height:36px;font-size:0.75rem;flex-shrink:0;">${cu?.avatar||'?'}</div>
                <div style="text-align:left;">
                    <strong style="font-size:0.9rem;">${cu?.name||'User'}</strong>
                    <span style="color:var(--secondary-text);font-size:0.8rem;margin-left:0.5rem;">${utils.getTimeAgo(c.timestamp)}</span>
                    <div style="font-size:0.9rem;margin-top:0.3rem;">${escapeHTML(c.text)}</div>
                </div>
            </div>`;
        }).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.id = 'reelModalOverlay';
        modal.innerHTML = `
        <div class="modal-content" style="animation:scaleIn 0.3s cubic-bezier(0.16,1,0.3,1); max-width:800px; width:90%; height:80vh; max-height:600px;">
            <div style="flex:1;background:#000;display:flex;align-items:center;justify-content:center;position:relative;">
                <video src="${reel.video}" loop autoplay muted playsinline style="max-height:100%;max-width:100%;object-fit:contain;"></video>
            </div>
            <div style="width:360px;display:flex;flex-direction:column;border-left:1px solid var(--border);background:var(--surface);">
                <div style="padding:1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.8rem;">
                    <div class="user-avatar" style="width:40px;height:40px;font-size:0.85rem;">${user?.avatar||'?'}</div>
                    <div style="text-align:left;">
                        <div style="font-weight:600;">${user?.name||'User'}</div>
                        <div style="font-size:0.8rem;color:var(--secondary-text);">${utils.getTimeAgo(reel.timestamp)}</div>
                    </div>
                    <div style="margin-left:auto;cursor:pointer;font-size:1.5rem;color:var(--secondary-text);" onclick="document.getElementById('reelModalOverlay').remove()">×</div>
                </div>
                <div style="padding:1rem;border-bottom:1px solid var(--border);font-weight:500;text-align:left;">${escapeHTML(reel.caption)}</div>
                <div style="flex:1;overflow-y:auto;padding:1rem;" id="reelCommentsContainer">${commentsHTML || '<div style="color:var(--secondary-text);text-align:center;margin-top:2rem;">No comments yet. Be first!</div>'}</div>
                <div style="padding:1rem;border-top:1px solid var(--border);">
                    <div style="display:flex;gap:1rem;font-size:1.4rem;margin-bottom:0.8rem;">
                        <i class="fa-${liked?'solid':'regular'} fa-heart" id="reelModalLikeIcon" style="cursor:pointer;${liked?'color:#ef4444':''}" onclick="app.toggleReelLike('${reelId}')"></i>
                    </div>
                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.8rem;text-align:left;" id="reelModalLikeCount">${reel.likes.length} likes</div>
                    <div style="display:flex;gap:0.5rem;">
                        <input id="reelModalCommentInput" placeholder="Add a comment..." style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:0.5rem 1rem;color:var(--text);font-size:0.9rem;">
                        <button onclick="app.addReelComment('${reelId}')" class="btn-post" style="border-radius:0.8rem;padding:0.5rem 1.2rem;">Post</button>
                    </div>
                </div>
            </div>
        </div>`;
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    async function addReelComment(reelId) {
        const input = document.getElementById('reelModalCommentInput');
        if (!input || !input.value.trim()) return;
        
        const commentData = {
            userId: currentUser.id,
            text: input.value.trim(),
            timestamp: Date.now()
        };

        try {
            const res = await fetch(`${API_BASE}/reels/${reelId}/comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(commentData)
            });
            const updatedReel = await res.json();
            updatedReel.id = updatedReel._id;
            
            const idx = db.reels.findIndex(r => r.id === reelId);
            if (idx !== -1) db.reels[idx] = updatedReel;

            if (updatedReel.userId !== currentUser.id) {
                addNotification(updatedReel.userId, 'comment', reelId);
            }

            const commentsContainer = document.getElementById('reelCommentsContainer');
            if (commentsContainer) {
                if (commentsContainer.innerHTML.includes('No comments yet')) {
                    commentsContainer.innerHTML = '';
                }
                const cu = currentUser;
                commentsContainer.insertAdjacentHTML('beforeend', `<div style="display:flex;gap:0.8rem;margin-bottom:1rem;">
                    <div class="user-avatar" style="width:36px;height:36px;font-size:0.75rem;flex-shrink:0;">${cu.avatar}</div>
                    <div style="text-align:left;"><strong style="font-size:0.9rem;">${cu.name}</strong>
                    <div style="font-size:0.9rem;margin-top:0.3rem;">${escapeHTML(commentData.text)}</div></div></div>`);
                commentsContainer.scrollTop = commentsContainer.scrollHeight;
            }
            input.value = '';
            showToast('Comment added!');
        } catch (err) {
            showToast('Failed to comment', 'error');
        }
    }

    function shareReel(reelId) {
        navigator.clipboard?.writeText(window.location.href + '#reel-' + reelId);
        showToast('Reel link copied to clipboard! 📋');
    }

    // ─── STORIES ─────────────────────────────────────────────────────────────────
    // ─── STORIES ACTIONS ────────────────────────────────────────────────────────
    function triggerStoryUpload() {
        document.getElementById('storyUpload')?.click();
    }

    async function handleStorySelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async e => {
            const imageData = e.target.result;
            try {
                const res = await fetch(`${API_BASE}/stories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, image: imageData })
                });
                const newStory = await res.json();
                newStory.id = newStory._id;
                db.stories.unshift(newStory);
                renderFeedPage(document.querySelector('.feed-container'));
                showToast('Story added! 📸');
            } catch (err) {
                showToast('Failed to add story', 'error');
            }
        };
        reader.readAsDataURL(file);
    }

    // ─── SIDEBARS ────────────────────────────────────────────────────────────────
    function renderStories() {}
    function renderFeed() {}

    function renderSidebars() {
        const recs = db.users.filter(u => u.id !== currentUser.id);
        const recsHTML = recs.map(u => `
            <div class="contact-item">
                <div class="contact-avatar">${u.avatar}</div>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:0.9rem;">${u.name}</div>
                    <div style="font-size:0.75rem;color:var(--secondary-text);">@${u.username}</div>
                </div>
                <button class="btn-post" style="width:auto;padding:0.3rem 0.8rem;font-size:0.8rem;" onclick="app.viewProfile('${u.id}')">View</button>
            </div>`).join('');

        const recsEl = document.getElementById('recommendationsList');
        if (recsEl) recsEl.innerHTML = recsHTML;

        const contacts = db.users.filter(u => u.id !== currentUser.id);
        const contactsHTML = contacts.map(u => `
            <div class="contact-item" onclick="app.openChat('${u.id}')" style="cursor:pointer;border-radius:0.8rem;padding:0.4rem;" onmouseover="this.style.background='var(--card-hover)'" onmouseleave="this.style.background=''">
                <div class="contact-avatar" style="position:relative;">${u.avatar}<div class="online-status"></div></div>
                <div style="flex:1"><div style="font-weight:500;font-size:0.9rem;">${u.name}</div></div>
            </div>`).join('');
        const contactsEl = document.getElementById('contactsList');
        if (contactsEl) contactsEl.innerHTML = contactsHTML;
    }

    // ─── THEME ───────────────────────────────────────────────────────────────────
    async function toggleTheme() {
        const newTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
        if (newTheme === 'light') document.body.classList.add('light-mode');
        else document.body.classList.remove('light-mode');
        
        if (currentUser) {
            currentUser.theme = newTheme;
            try {
                await fetch(`${API_BASE}/users/${currentUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ theme: newTheme })
                });
            } catch (err) {}
        }
    }

    // ─── TOAST ───────────────────────────────────────────────────────────────────
    function showToast(msg, type = 'success') {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:${type==='error'?'#ef4444':'#10b981'};color:white;padding:0.8rem 1.5rem;border-radius:999px;font-weight:600;z-index:99999;box-shadow:0 10px 25px rgba(0,0,0,0.3);animation:fadeIn 0.3s ease;`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
    }

    // ─── UTILS ───────────────────────────────────────────────────────────────────
    function escapeHTML(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function downloadDB() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "connecthub_data.json");
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        dlAnchorElem.remove();
        showToast('Data saved to hard drive! 💾');
    }

    // Public API
    return {
        init, login, register, verifyOtp, cancelOtp, logout, toggleAuthForm, switchPage,
        createPost, triggerImageUpload, handleImageSelect, clearPostPreview,
        toggleLike, savePost, sharePost, showPostOptions, deletePost,
        openPostModal, modalLike, addComment,
        openChat, sendMessage, closeChat, viewStory: (id) => {
            const story = db.stories.find(s => s.id === id);
            if (!story) return;
            const user = utils.getUserById(story.userId);
            const overlay = document.createElement('div');
            overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="max-width:400px;width:90%;animation:scaleIn 0.3s ease;">
                    <div style="display:flex;align-items:center;gap:0.8rem;padding:1rem;">
                        <div class="user-avatar" style="width:40px;height:40px;font-size:0.85rem;">${user?.avatar||'?'}</div>
                        <div><div style="font-weight:600;color:white;">${user?.name||'User'}</div><div style="font-size:0.8rem;color:#aaa;">Story</div></div>
                        <div style="margin-left:auto;color:white;font-size:1.5rem;cursor:pointer;" onclick="this.closest('div[style]').remove()">×</div>
                    </div>
                    <img src="${story.image}" style="width:100%;border-radius:1rem;">
                </div>`;
            overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
            document.body.appendChild(overlay);
        },
        triggerStoryUpload, handleStorySelect,
        viewProfile, editProfile, saveProfile, toggleFollow,
        triggerReelUpload, publishReel, toggleReelLike,
        openReelModal, addReelComment, shareReel, handleReelsScroll,
        toggleTheme, showToast, downloadDB
    };
})();

document.addEventListener('DOMContentLoaded', () => app.init());
