class Auth {
    constructor() {
        this.currentUser = null;
        this.socket = null;
    }

    async initLogin() {
        const loginForm = document.getElementById('loginForm');
        const messageBox = document.getElementById('authMessage');

        // Check if already logged in
        await this.checkExistingAuth();

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            if (!username) {
                this.showMessage('Please enter a username', 'error');
                return;
            }

            await this.login(username);
        });

        // Add enter key support
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    async initRegister() {
        const registerForm = document.getElementById('registerForm');
        const messageBox = document.getElementById('authMessage');

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            const displayName = document.getElementById('displayName').value.trim();

            if (!username || !displayName) {
                this.showMessage('Please fill in all fields', 'error');
                return;
            }

            if (username.length < 3) {
                this.showMessage('Username must be at least 3 characters long', 'error');
                return;
            }

            if (displayName.length < 2) {
                this.showMessage('Display name must be at least 2 characters long', 'error');
                return;
            }

            await this.register(username, displayName);
        });

        // Add enter key support
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('displayName').focus();
            }
        });

        document.getElementById('displayName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                registerForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    async login(username) {
        try {
            this.showMessage('Logging in...', 'info');
            this.setFormLoading(true);

            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage('Login successful! Redirecting...', 'success');
                this.currentUser = data.user;
                
                // Store user info
                localStorage.setItem('mpchat_user', JSON.stringify(data.user));
                
                // Redirect to chat
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                this.showMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showMessage('Login failed. Please try again.', 'error');
        } finally {
            this.setFormLoading(false);
        }
    }

    async register(username, displayName) {
        try {
            this.showMessage('Creating account...', 'info');
            this.setFormLoading(true);

            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    username: username,
                    display_name: displayName,
                    password: 'default' // For simplicity in this demo
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage('Registration successful! Please login.', 'success');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                this.showMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showMessage('Registration failed. Please try again.', 'error');
        } finally {
            this.setFormLoading(false);
        }
    }

    async logout() {
        try {
            this.showMessage('Logging out...', 'info');

            const response = await fetch('/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (data.success) {
                // Clear local storage
                localStorage.removeItem('mpchat_user');
                sessionStorage.clear();
                
                // Disconnect socket if exists
                if (this.socket) {
                    this.socket.disconnect();
                }
                
                // Redirect to login
                window.location.href = '/login';
            } else {
                this.showMessage('Logout failed', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect to login
            window.location.href = '/login';
        }
    }

    async checkExistingAuth() {
        try {
            const response = await fetch('/auth/check-auth');
            const data = await response.json();

            if (data.authenticated) {
                // User is authenticated, redirect to chat
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Auth check error:', error);
        }
    }

    showMessage(message, type) {
        const messageBox = document.getElementById('authMessage');
        if (!messageBox) return;

        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        messageBox.style.display = 'block';

        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                messageBox.style.display = 'none';
            }, 3000);
        }
    }

    setFormLoading(loading) {
        const forms = document.querySelectorAll('form');
        const buttons = document.querySelectorAll('.auth-btn');
        
        forms.forEach(form => {
            if (loading) {
                form.classList.add('loading');
            } else {
                form.classList.remove('loading');
            }
        });

        buttons.forEach(button => {
            const span = button.querySelector('span');
            const icon = button.querySelector('i');
            
            if (loading) {
                if (span) span.textContent = 'Please wait...';
                if (icon) icon.className = 'fas fa-spinner fa-spin';
                button.disabled = true;
            } else {
                if (span) span.textContent = button.getAttribute('data-original-text') || 'Login to MpChat';
                if (icon) icon.className = 'fas fa-arrow-right';
                button.disabled = false;
            }
        });
    }

    // Utility method to get current user from localStorage
    static getCurrentUser() {
        try {
            const userData = localStorage.getItem('mpchat_user');
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    // Utility method to check if user is admin
    static isAdmin() {
        const user = this.getCurrentUser();
        return user ? user.is_admin : false;
    }
}