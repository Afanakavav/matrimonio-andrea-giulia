/**
 * AuthManager Fallback - Versione Temporanea
 * Usa password hardcoded fino a quando Firebase Auth non è configurato
 */
class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.adminUID = 'fallback-admin';
        this.user = { email: 'admin@matrimonio-andrea-giulia.com' };
        this.init();
    }

    async init() {
        // Controlla se già autenticato
        const isLoggedIn = sessionStorage.getItem('adminLoggedIn') === 'true';
        if (isLoggedIn) {
            this.isAuthenticated = true;
            this.showAdminPanel();
            console.log('✅ Admin autenticato (fallback mode)');
        } else {
            this.isAuthenticated = false;
            this.showLoginScreen();
            console.log('🔒 Admin non autenticato');
        }
    }

    async login(email, password) {
        try {
            console.log('🔐 Tentativo login fallback per:', email);
            
            // Password temporanea per fallback
            const FALLBACK_PASSWORD = 'RindiFusi';
            
            if (password === FALLBACK_PASSWORD) {
                this.isAuthenticated = true;
                this.adminUID = 'fallback-admin';
                this.user = { email: email };
                sessionStorage.setItem('adminLoggedIn', 'true');
                this.showAdminPanel();
                
                console.log('✅ Login successful (fallback mode):', email);
                return { success: true };
            } else {
                return { 
                    success: false, 
                    message: 'Password errata' 
                };
            }
            
        } catch (error) {
            console.error('❌ Login error:', error);
            return { 
                success: false, 
                message: 'Errore di autenticazione' 
            };
        }
    }

    async logout() {
        try {
            console.log('🚪 Logout in corso...');
            sessionStorage.removeItem('adminLoggedIn');
            this.isAuthenticated = false;
            this.adminUID = null;
            this.user = null;
            this.showLoginScreen();
            console.log('✅ Logout successful');
        } catch (error) {
            console.error('❌ Logout error:', error);
        }
    }

    getErrorMessage(errorCode) {
        return 'Errore di autenticazione';
    }

    showLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');
        
        if (loginScreen) loginScreen.style.display = 'block';
        if (adminPanel) adminPanel.style.display = 'none';
    }

    showAdminPanel() {
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'block';
    }

    isAdmin() {
        return this.isAuthenticated && this.adminUID;
    }

    getCurrentUser() {
        return this.user;
    }

    getCurrentUID() {
        return this.adminUID;
    }
}

// Export global per uso in altri file
window.AuthManager = AuthManager;
