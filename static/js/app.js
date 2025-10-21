// Main application initialization
class App {
    constructor() {
        this.currentPage = this.getCurrentPage();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path === '/login') return 'login';
        if (path === '/register') return 'register';
        return 'chat';
    }

    init() {
        switch (this.currentPage) {
            case 'login':
                this.initLoginPage();
                break;
            case 'register':
                this.initRegisterPage();
                break;
            case 'chat':
                this.initChatPage();
                break;
        }

        this.setupServiceWorker();
        this.setupPWA();
    }

    initLoginPage() {
        document.addEventListener('DOMContentLoaded', function() {
            const auth = new Auth();
            auth.initLogin();
        });
    }

    initRegisterPage() {
        document.addEventListener('DOMContentLoaded', function() {
            const auth = new Auth();
            auth.initRegister();
        });
    }

    initChatPage() {
        // Handled by chat.js
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                        console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                        console.log('SW registration failed: ', registrationError);
                    });
            });
        }
    }

    setupPWA() {
        // Prevent drag and drop default behavior
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());

        // Handle beforeinstallprompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install button if you have one
            this.showInstallPromotion();
        });

        // Handle app installed
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            deferredPrompt = null;
        });
    }

    showInstallPromotion() {
        // You can implement a custom install button here
        console.log('PWA installation available');
    }
}

// Initialize the app
const app = new App();
app.init();

// Utility functions
const Utils = {
    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Generate random ID
    generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    },

    // Check if mobile device
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    // Get time ago string
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return new Date(date).toLocaleDateString();
    }
};

// Export for global access
window.Utils = Utils;
window.App = App;