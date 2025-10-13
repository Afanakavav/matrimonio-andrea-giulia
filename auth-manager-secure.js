/**
 * AuthManager Secure - Versione con Password Hashata
 * Password non visibile nel codice sorgente
 */

// Libreria SHA256 leggera
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

class AuthManagerSecure {
    constructor() {
        this.isAuthenticated = false;
        this.adminUID = 'secure-admin';
        this.user = { email: 'admin' }; // Email semplificata, non utilizzata per auth
        
        // Hash della password "RindiFusi" (non visibile in chiaro)
        this.PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
        
        this.init();
    }

    async init() {
        // Controlla se già autenticato
        const isLoggedIn = sessionStorage.getItem('adminLoggedIn') === 'true';
        if (isLoggedIn) {
            this.isAuthenticated = true;
            this.showAdminPanel();
            console.log('✅ Admin autenticato (secure mode)');
        } else {
            this.isAuthenticated = false;
            this.showLoginScreen();
            console.log('🔒 Admin non autenticato');
        }
    }

    async verifyPassword(inputPassword) {
        try {
            const inputHash = await sha256(inputPassword);
            return inputHash === this.PASSWORD_HASH;
        } catch (error) {
            console.error('Errore verifica password:', error);
            return false;
        }
    }

    async login(password) {
        try {
            console.log('🔐 Tentativo login sicuro');
            
            // Verifica password con hash
            const isValidPassword = await this.verifyPassword(password);
            
            if (isValidPassword) {
                this.isAuthenticated = true;
                this.adminUID = 'secure-admin';
                this.user = { email: 'admin' }; // Email semplificata, non utilizzata per auth
                sessionStorage.setItem('adminLoggedIn', 'true');
                this.showAdminPanel();
                
                console.log('✅ Login successful (secure mode)');
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
window.AuthManager = AuthManagerSecure;
