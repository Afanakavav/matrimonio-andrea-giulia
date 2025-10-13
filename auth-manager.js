/**
 * AuthManager - Sistema di Autenticazione Sicuro
 * Gestisce login/logout con Firebase Authentication
 */
class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.adminUID = null;
        this.user = null;
        this.init();
    }

    async init() {
        // Controlla se già autenticato al caricamento pagina
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                this.isAuthenticated = true;
                this.adminUID = user.uid;
                this.user = user;
                this.showAdminPanel();
                console.log('✅ Admin autenticato:', user.email);
            } else {
                this.isAuthenticated = false;
                this.adminUID = null;
                this.user = null;
                this.showLoginScreen();
                console.log('🔒 Admin non autenticato');
            }
        });
    }

    async login(email, password) {
        try {
            console.log('🔐 Tentativo login per:', email);
            
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            this.isAuthenticated = true;
            this.adminUID = userCredential.user.uid;
            this.user = userCredential.user;
            
            console.log('✅ Login successful:', userCredential.user.email);
            return { success: true };
            
        } catch (error) {
            console.error('❌ Login error:', error);
            return { 
                success: false, 
                message: this.getErrorMessage(error.code) 
            };
        }
    }

    async logout() {
        try {
            console.log('🚪 Logout in corso...');
            await firebase.auth().signOut();
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
        const messages = {
            'auth/user-not-found': 'Utente non trovato',
            'auth/wrong-password': 'Password errata',
            'auth/invalid-email': 'Email non valida',
            'auth/user-disabled': 'Account disabilitato',
            'auth/too-many-requests': 'Troppi tentativi, riprova più tardi',
            'auth/network-request-failed': 'Errore di connessione',
            'auth/invalid-credential': 'Credenziali non valide',
            'auth/account-exists-with-different-credential': 'Account già esistente con credenziali diverse'
        };
        return messages[errorCode] || 'Errore di autenticazione';
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
