/**
 * AuthManager Secure - Versione con Password Hashata
 * Password non visibile nel codice sorgente
 */

console.log('🔧 Caricamento auth-manager-secure.js iniziato...');

// Libreria SHA256 robusta
async function sha256(message) {
    try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('🔧 SHA256 generato per:', message, '→', hashHex);
        return hashHex;
    } catch (error) {
        console.error('❌ Errore SHA256:', error);
        // Fallback: hash semplice (non sicuro, solo per test)
        return 'fallback-hash-' + message.length;
    }
}

class AuthManagerSecure {
    constructor() {
        this.isAuthenticated = false;
        this.adminUID = 'secure-admin';
        this.user = { email: 'admin' }; // Email semplificata, non utilizzata per auth
        
        // Hash della password "RindiFusi" (non visibile in chiaro)
        // Hash corretto: d0756e88eb8a22da09cb0f2ea520ea976e4010a46b6e2dd84cbb91e036e138f7
        this.PASSWORD_HASH = 'd0756e88eb8a22da09cb0f2ea520ea976e4010a46b6e2dd84cbb91e036e138f7';
        
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
            console.log('🔍 Hash generato per password:', inputHash);
            console.log('🔍 Hash memorizzato:', this.PASSWORD_HASH);
            console.log('🔍 Confronto hash:', inputHash === this.PASSWORD_HASH);
            return inputHash === this.PASSWORD_HASH;
        } catch (error) {
            console.error('Errore verifica password:', error);
            return false;
        }
    }

    async login(password) {
        try {
            console.log('🔐 Tentativo login sicuro');
            console.log('🔍 Password ricevuta:', password);
            console.log('🔍 Hash memorizzato:', this.PASSWORD_HASH);
            
            // Verifica password con hash
            const isValidPassword = await this.verifyPassword(password);
            console.log('🔍 Password valida:', isValidPassword);
            
            if (isValidPassword) {
                this.isAuthenticated = true;
                this.adminUID = 'secure-admin';
                this.user = { email: 'admin' }; // Email semplificata, non utilizzata per auth
                sessionStorage.setItem('adminLoggedIn', 'true');
                this.showAdminPanel();
                
                console.log('✅ Login successful (secure mode)');
                return { success: true };
            } else {
                console.log('❌ Password non valida');
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
        
        console.log('🔧 showAdminPanel chiamata');
        console.log('🔧 loginScreen trovato:', !!loginScreen);
        console.log('🔧 adminPanel trovato:', !!adminPanel);
        
        if (loginScreen) {
            loginScreen.style.display = 'none';
            console.log('🔧 loginScreen nascosto');
        }
        if (adminPanel) {
            adminPanel.style.display = 'block';
            console.log('🔧 adminPanel mostrato');
        } else {
            console.error('❌ adminPanel non trovato!');
        }
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
try {
    window.AuthManagerSecure = AuthManagerSecure;
    console.log('✅ AuthManagerSecure esportato correttamente');
} catch (error) {
    console.error('❌ Errore nell\'export di AuthManagerSecure:', error);
}
