class MpChat {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentChat = null;
        this.users = [];
        this.chats = [];
        this.isConnected = false;
        
        this.typingTimeout = null;
        this.notificationTimeout = null;
    }

    async init() {
        await this.initializeApp();
        this.setupEventListeners();
        this.connectSocket();
    }

    async initializeApp() {
        // Get current user from localStorage
        this.currentUser = Auth.getCurrentUser();
        
        if (!this.currentUser) {
            window.location.href = '/login';
            return;
        }

        // Update UI with user info
        this.updateUserInterface();
        
        // Load users list
        await this.loadUsers();
        
        // Show appropriate view
        this.showChatList();
    }

    updateUserInterface() {
        if (this.currentUser) {
            // Update user info in sidebar
            const userAvatar = document.getElementById('userAvatar');
            const userName = document.getElementById('userName');
            const chatUserAvatar = document.getElementById('chatUserAvatar');
            const chatUserName = document.getElementById('chatUserName');
            
            if (userAvatar) userAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
            if (userName) userName.textContent = this.currentUser.display_name || this.currentUser.username;
            if (chatUserAvatar) chatUserAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
            if (chatUserName) chatUserName.textContent = this.currentUser.display_name || this.currentUser.username;

            // Show admin button if user is admin
            if (this.currentUser.is_admin) {
                const adminBtn = document.getElementById('adminPanelBtn');
                if (adminBtn) adminBtn.style.display = 'block';
            }
        }
    }

    async loadUsers() {
        try {
            const response = await fetch('/auth/users');
            const data = await response.json();

            if (data.success) {
                this.users = data.users;
                this.renderUserList();
            } else {
                console.error('Failed to load users:', data.message);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUserList() {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;

        chatList.innerHTML = '';

        this.users.forEach(user => {
            const chatItem = this.createUserChatItem(user);
            chatList.appendChild(chatItem);
        });

        // Add "no users" message if empty
        if (this.users.length === 0) {
            const noUsersItem = document.createElement('div');
            noUsersItem.className = 'no-users-message';
            noUsersItem.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--gray);">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px; opacity: 0.3;"></i>
                    <p>No other users found</p>
                </div>
            `;
            chatList.appendChild(noUsersItem);
        }
    }

    createUserChatItem(user) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.userId = user.id;
        
        const lastSeen = user.last_seen ? this.formatLastSeen(user.last_seen) : 'Never';
        const statusText = user.is_online ? 'Online' : `Last seen ${lastSeen}`;

        chatItem.innerHTML = `
            <div class="chat-avatar">
                <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                ${user.is_online ? '<div class="online-indicator"></div>' : ''}
            </div>
            <div class="chat-info">
                <div class="chat-header">
                    <div class="chat-name">${user.display_name || user.username}</div>
                    <div class="chat-time">${user.is_online ? 'Online' : ''}</div>
                </div>
                <div class="chat-preview">
                    <div class="chat-message">${statusText}</div>
                    ${user.is_admin ? '<span style="color: var(--primary-color); font-size: 12px;">Admin</span>' : ''}
                </div>
            </div>
        `;

        chatItem.addEventListener('click', () => this.startChat(user));
        return chatItem;
    }

    formatLastSeen(timestamp) {
        const now = new Date();
        const lastSeen = new Date(timestamp);
        const diffMs = now - lastSeen;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return lastSeen.toLocaleDateString();
    }

    connectSocket() {
        if (!this.currentUser) return;

        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.socket.emit('authenticate', { user_id: this.currentUser.id });
        });

        this.socket.on('authentication_success', (data) => {
            console.log('Authentication successful:', data);
            this.showNotification('Connected to chat server', 'success');
        });

        this.socket.on('authentication_failed', (data) => {
            console.error('Authentication failed:', data);
            this.showNotification('Authentication failed', 'error');
        });

        this.socket.on('user_status_changed', (data) => {
            this.updateUserStatus(data);
        });

        this.socket.on('chat_started', (data) => {
            this.handleChatStarted(data);
        });

        this.socket.on('new_message', (message) => {
            this.handleNewMessage(message);
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data);
        });

        this.socket.on('message_notification', (data) => {
            this.showMessageNotification(data);
        });

        this.socket.on('incoming_call', (data) => {
            this.handleIncomingCall(data);
        });

        this.socket.on('call_accepted', (data) => {
            this.handleCallAccepted(data);
        });

        this.socket.on('call_rejected', (data) => {
            this.handleCallRejected(data);
        });

        this.socket.on('call_ended', (data) => {
            this.handleCallEnded(data);
        });

        this.socket.on('call_initiated', (data) => {
            this.handleCallInitiated(data);
        });

        this.socket.on('error', (data) => {
            this.showNotification(data.message, 'error');
        });

        this.socket.on('account_deleted', (data) => {
            this.handleAccountDeleted(data);
        });

        this.socket.on('chat_deleted', (data) => {
            this.handleChatDeleted(data);
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.showNotification('Disconnected from server', 'error');
        });
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('backButton')?.addEventListener('click', () => this.showChatList());
        document.getElementById('adminBackBtn')?.addEventListener('click', () => this.hideAdminPanel());
        document.getElementById('adminPanelBtn')?.addEventListener('click', () => this.showAdminPanel());

        // Messaging
        document.getElementById('sendMessageBtn')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Calls
        document.getElementById('videoCallBtn')?.addEventListener('click', () => this.startVideoCall());
        document.getElementById('voiceCallBtn')?.addEventListener('click', () => this.startVoiceCall());
        document.getElementById('declineCallBtn')?.addEventListener('click', () => this.endCall());
        document.getElementById('acceptCallBtn')?.addEventListener('click', () => this.acceptCall());

        // Typing indicator
        document.getElementById('messageInput')?.addEventListener('input', () => this.handleTyping());

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());

        // Search
        document.getElementById('searchInput')?.addEventListener('input', (e) => this.handleSearch(e.target.value));

        // Notification click
        document.getElementById('notification')?.addEventListener('click', () => this.hideNotification());

        // Window focus/blur for notifications
        window.addEventListener('focus', () => {
            document.title = 'MpChat';
        });

        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            if (this.socket) {
                this.socket.disconnect();
            }
        });
    }

    startChat(user) {
        if (!this.socket || !this.isConnected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        this.socket.emit('start_chat', {
            current_user_id: this.currentUser.id,
            target_user_id: user.id
        });
    }

    handleChatStarted(data) {
        this.currentChat = {
            id: data.chat_id,
            other_user: data.other_user
        };

        // Update chat header
        this.updateChatHeader(data.other_user);
        
        // Show chat area
        this.showChatArea();
        
        // Join chat room
        this.socket.emit('join_chat', {
            chat_id: data.chat_id,
            user_id: this.currentUser.id
        });

        // Load chat history (in a real app, this would fetch from server)
        this.clearMessages();
        this.addWelcomeMessage(data.other_user);
    }

    updateChatHeader(user) {
        const chatUserAvatar = document.getElementById('chatUserAvatar');
        const chatUserName = document.getElementById('chatUserName');
        const chatUserStatus = document.getElementById('chatUserStatus');

        if (chatUserAvatar) chatUserAvatar.textContent = user.username.charAt(0).toUpperCase();
        if (chatUserName) chatUserName.textContent = user.display_name || user.username;
        if (chatUserStatus) {
            chatUserStatus.textContent = user.is_online ? 'Online' : 'Offline';
            chatUserStatus.style.color = user.is_online ? 'var(--secondary-color)' : 'var(--gray)';
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput?.value.trim();

        if (!content || !this.currentChat || !this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('send_message', {
            chat_id: this.currentChat.id,
            sender_id: this.currentUser.id,
            content: content,
            type: 'text'
        });

        // Clear input
        if (messageInput) {
            messageInput.value = '';
        }

        // Stop typing indicator
        this.stopTyping();
    }

    handleNewMessage(message) {
        if (this.currentChat && message.chat_id === this.currentChat.id) {
            this.addMessageToChat(message);
        }
    }

    addMessageToChat(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        const isOwnMessage = message.sender_id === this.currentUser.id;
        
        messageElement.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
        messageElement.innerHTML = `
            <div class="message-text">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${this.formatTime(message.timestamp)}</div>
        `;

        // Insert before typing indicator
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            messagesContainer.insertBefore(messageElement, typingIndicator);
        } else {
            messagesContainer.appendChild(messageElement);
        }

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addWelcomeMessage(user) {
        const welcomeMessage = {
            id: 'welcome',
            sender_id: 'system',
            content: `You started a conversation with ${user.display_name || user.username}. Say hello! 👋`,
            type: 'system',
            timestamp: new Date().toISOString()
        };
        
        this.addMessageToChat(welcomeMessage);
    }

    clearMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            // Keep only the typing indicator
            const typingIndicator = document.getElementById('typingIndicator');
            messagesContainer.innerHTML = '';
            if (typingIndicator) {
                messagesContainer.appendChild(typingIndicator);
            }
        }
    }

    handleTyping() {
        if (!this.currentChat || !this.socket || !this.isConnected) return;

        this.socket.emit('typing_start', {
            chat_id: this.currentChat.id,
            user_id: this.currentUser.id
        });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Set timeout to stop typing indicator
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 1000);
    }

    stopTyping() {
        if (!this.currentChat || !this.socket || !this.isConnected) return;

        this.socket.emit('typing_stop', {
            chat_id: this.currentChat.id,
            user_id: this.currentUser.id
        });
    }

    showTypingIndicator(data) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (!typingIndicator || !this.currentChat) return;

        if (data.typing) {
            const typingText = typingIndicator.querySelector('.typing-text');
            if (typingText) {
                typingText.textContent = `${data.username} is typing...`;
            }
            typingIndicator.style.display = 'flex';
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    // Call functionality
    startVideoCall() {
        if (!this.currentChat || !this.socket || !this.isConnected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        this.socket.emit('initiate_call', {
            caller_id: this.currentUser.id,
            receiver_id: this.currentChat.other_user.id,
            call_type: 'video'
        });

        this.showCallScreen('outgoing');
    }

    startVoiceCall() {
        if (!this.currentChat || !this.socket || !this.isConnected) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        this.socket.emit('initiate_call', {
            caller_id: this.currentUser.id,
            receiver_id: this.currentChat.other_user.id,
            call_type: 'voice'
        });

        this.showCallScreen('outgoing');
    }

    handleIncomingCall(data) {
        this.showCallScreen('incoming', data.caller);
    }

    showCallScreen(type, caller = null) {
        const callScreen = document.getElementById('callScreen');
        const callerName = document.getElementById('callerName');
        const callerAvatar = document.getElementById('callerAvatar');
        const callStatus = document.getElementById('callStatus');
        const acceptBtn = document.getElementById('acceptCallBtn');

        if (type === 'outgoing') {
            callerName.textContent = this.currentChat.other_user.display_name || this.currentChat.other_user.username;
            callerAvatar.textContent = this.currentChat.other_user.username.charAt(0).toUpperCase();
            callStatus.textContent = 'Calling...';
            if (acceptBtn) acceptBtn.style.display = 'none';
        } else {
            callerName.textContent = caller.display_name || caller.username;
            callerAvatar.textContent = caller.username.charAt(0).toUpperCase();
            callStatus.textContent = 'Incoming Call';
            if (acceptBtn) acceptBtn.style.display = 'flex';
        }

        if (callScreen) {
            callScreen.style.display = 'flex';
        }
    }

    acceptCall() {
        // In a real app, this would send acceptance to the server
        const callStatus = document.getElementById('callStatus');
        const acceptBtn = document.getElementById('acceptCallBtn');
        
        if (callStatus) callStatus.textContent = 'Connected';
        if (acceptBtn) acceptBtn.style.display = 'none';
        
        // For demo purposes, we'll just update the UI
        this.showNotification('Call connected', 'success');
    }

    endCall() {
        const callScreen = document.getElementById('callScreen');
        if (callScreen) {
            callScreen.style.display = 'none';
        }
        this.showNotification('Call ended', 'info');
    }

    handleCallAccepted(data) {
        const callStatus = document.getElementById('callStatus');
        const acceptBtn = document.getElementById('acceptCallBtn');
        
        if (callStatus) callStatus.textContent = 'Connected';
        if (acceptBtn) acceptBtn.style.display = 'none';
    }

    handleCallRejected(data) {
        this.endCall();
        this.showNotification('Call was rejected', 'error');
    }

    handleCallEnded(data) {
        this.endCall();
        this.showNotification('Call ended', 'info');
    }

    handleCallInitiated(data) {
        // Call initiation confirmed by server
        console.log('Call initiated:', data);
    }

    // Admin functionality
    async showAdminPanel() {
        if (!this.currentUser.is_admin) {
            this.showNotification('Access denied', 'error');
            return;
        }

        try {
            const response = await fetch('/admin/users');
            const data = await response.json();

            if (data.success) {
                this.renderAdminUserList(data.users);
                document.getElementById('adminPanel').style.display = 'flex';
            } else {
                this.showNotification('Failed to load admin data', 'error');
            }
        } catch (error) {
            console.error('Error loading admin panel:', error);
            this.showNotification('Error loading admin panel', 'error');
        }
    }

    hideAdminPanel() {
        document.getElementById('adminPanel').style.display = 'none';
    }

    renderAdminUserList(users) {
        const adminUserList = document.getElementById('adminUserList');
        if (!adminUserList) return;

        adminUserList.innerHTML = '';

        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            
            userItem.innerHTML = `
                <div class="user-item-info">
                    <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-name">${user.display_name || user.username}</div>
                        <div class="user-status-badge ${user.is_online ? 'online' : 'offline'}">
                            ${user.is_online ? 'Online' : 'Offline'}
                        </div>
                        <div style="font-size: 11px; color: var(--gray); margin-top: 2px;">
                            Joined: ${new Date(user.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-primary" onclick="mpChat.adminChatWith('${user.id}')">
                        Chat
                    </button>
                    <button class="btn btn-danger" onclick="mpChat.adminDeleteUser('${user.id}')">
                        Delete
                    </button>
                </div>
            `;

            adminUserList.appendChild(userItem);
        });
    }

    adminChatWith(userId) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            this.hideAdminPanel();
            this.startChat(user);
        }
    }

    async adminDeleteUser(userId) {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/admin/users/${userId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('User deleted successfully', 'success');
                // Reload admin panel
                this.showAdminPanel();
                // Reload users list
                await this.loadUsers();
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showNotification('Error deleting user', 'error');
        }
    }

    // Notification system
    showMessageNotification(data) {
        // Update browser tab title
        document.title = `(1) MpChat`;
        
        // Show notification
        this.showNotification(`New message from ${this.getUserName(data.sender_id)}: ${data.content}`, 'info');
        
        // Play notification sound (if enabled)
        this.playNotificationSound();
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const notificationSender = document.getElementById('notificationSender');
        const notificationMessage = document.getElementById('notificationMessage');

        if (!notification) return;

        // Update notification content
        if (notificationSender) notificationSender.textContent = 'MpChat';
        if (notificationMessage) notificationMessage.textContent = message;

        // Set notification type
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        // Auto hide after 5 seconds
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        this.notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    hideNotification() {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.style.display = 'none';
        }
        document.title = 'MpChat';
    }

    playNotificationSound() {
        // In a real app, play a notification sound
        console.log('Notification sound would play here');
    }

    // Utility methods
    getUserName(userId) {
        const user = this.users.find(u => u.id === userId);
        return user ? (user.display_name || user.username) : 'Unknown User';
    }

    updateUserStatus(data) {
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            if (item.dataset.userId === data.user_id) {
                const onlineIndicator = item.querySelector('.online-indicator');
                const chatTime = item.querySelector('.chat-time');
                const chatMessage = item.querySelector('.chat-message');
                
                if (data.is_online) {
                    if (!onlineIndicator) {
                        item.querySelector('.chat-avatar').innerHTML += '<div class="online-indicator"></div>';
                    }
                    if (chatTime) chatTime.textContent = 'Online';
                    if (chatMessage) chatMessage.textContent = 'Online';
                } else {
                    if (onlineIndicator) onlineIndicator.remove();
                    if (chatTime) chatTime.textContent = '';
                    if (chatMessage) chatMessage.textContent = `Last seen ${this.formatLastSeen(new Date().toISOString())}`;
                }
            }
        });

        // Update current chat status if applicable
        if (this.currentChat && this.currentChat.other_user.id === data.user_id) {
            const chatUserStatus = document.getElementById('chatUserStatus');
            if (chatUserStatus) {
                chatUserStatus.textContent = data.is_online ? 'Online' : 'Offline';
                chatUserStatus.style.color = data.is_online ? 'var(--secondary-color)' : 'var(--gray)';
            }
        }
    }

    handleSearch(query) {
        const chatItems = document.querySelectorAll('.chat-item');
        const searchTerm = query.toLowerCase();

        chatItems.forEach(item => {
            const userName = item.querySelector('.chat-name').textContent.toLowerCase();
            if (userName.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    handleAccountDeleted(data) {
        this.showNotification('Your account has been deleted by admin', 'error');
        this.logout();
    }

    handleChatDeleted(data) {
        if (this.currentChat && this.currentChat.id === data.chat_id) {
            this.showNotification('This chat has been deleted by admin', 'error');
            this.showChatList();
        }
    }

    // View management
    showChatList() {
        document.getElementById('chatArea').classList.remove('active');
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('noChatSelected').classList.add('active');
        this.currentChat = null;
    }

    showChatArea() {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('chatArea').classList.add('active');
        document.getElementById('noChatSelected').classList.remove('active');
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async logout() {
        const auth = new Auth();
        await auth.logout();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.mpChat = new MpChat();
    mpChat.init();
});