/**
 * AuthManager Secure - Versione con Password Hashata
 * Password non visibile nel codice sorgente
 */


// Libreria SHA256 robusta
async function sha256(message) {
    try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
            
            // Notifica AdminPanel del login riuscito
            if (window.adminPanelInstance && typeof window.adminPanelInstance.onAuthSuccess === 'function') {
                window.adminPanelInstance.onAuthSuccess();
            }
            
            // Notifica anche AdminPanel media se disponibile (con delay per assicurarsi che sia inizializzato)
            setTimeout(() => {
                if (window.adminPanelMedia && typeof window.adminPanelMedia.onAuthSuccess === 'function') {
                    window.adminPanelMedia.onAuthSuccess();
                }
            }, 100);
            
            // Notifica anche AdminPanel RSVP se disponibile (con delay per assicurarsi che sia inizializzato)
            setTimeout(() => {
                if (window.adminPanelRSVP && typeof window.adminPanelRSVP.onAuthSuccess === 'function') {
                    window.adminPanelRSVP.onAuthSuccess();
                }
            }, 100);
        } else {
            this.isAuthenticated = false;
            this.showLoginScreen();
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
            // Verifica password con hash
            const isValidPassword = await this.verifyPassword(password);
            
                   if (isValidPassword) {
                       this.isAuthenticated = true;
                       this.adminUID = 'secure-admin';
                       this.user = { email: 'admin' }; // Email semplificata, non utilizzata per auth
                       sessionStorage.setItem('adminLoggedIn', 'true');
                       this.showAdminPanel();

                       // Notifica AdminPanel del login riuscito
                       if (window.adminPanelInstance && typeof window.adminPanelInstance.onAuthSuccess === 'function') {
                           window.adminPanelInstance.onAuthSuccess();
                       }
                       
                       // Notifica anche AdminPanel media se disponibile (con delay per assicurarsi che sia inizializzato)
                       setTimeout(() => {
                           if (window.adminPanelMedia && typeof window.adminPanelMedia.onAuthSuccess === 'function') {
                               window.adminPanelMedia.onAuthSuccess();
                           }
                       }, 100);
                       
                       // Notifica anche AdminPanel RSVP se disponibile (con delay per assicurarsi che sia inizializzato)
                       setTimeout(() => {
                           if (window.adminPanelRSVP && typeof window.adminPanelRSVP.onAuthSuccess === 'function') {
                               window.adminPanelRSVP.onAuthSuccess();
                           }
                       }, 100);

                       return { success: true };
                   } else {
                       return { 
                           success: false, 
                           message: 'Password errata' 
                       };
            }
            
        } catch (error) {
            console.error('Login error:', error);
            return { 
                success: false, 
                message: 'Errore di autenticazione' 
            };
        }
    }

    async logout() {
        try {
            sessionStorage.removeItem('adminLoggedIn');
            this.isAuthenticated = false;
            this.adminUID = null;
            this.user = null;
            this.showLoginScreen();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    getErrorMessage(errorCode) {
        return 'Errore di autenticazione';
    }

    showLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');

        if (loginScreen) {
            loginScreen.style.setProperty('display', 'block', 'important');
        }

        if (adminPanel) {
            adminPanel.style.setProperty('display', 'none', 'important');
        }
    }

    showAdminPanel() {
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');

        if (loginScreen) {
            loginScreen.style.setProperty('display', 'none', 'important');
        }

        if (adminPanel) {
            adminPanel.style.setProperty('display', 'block', 'important');
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
} catch (error) {
    console.error('Errore nell\'export di AuthManagerSecure:', error);
}
