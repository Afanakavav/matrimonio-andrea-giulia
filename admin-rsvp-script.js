// Admin RSVP Panel Script - FASE 2: Firebase Authentication
let authManager;

class AdminRSVPPanel {
    constructor() {
        // Firebase Auth gestisce l'autenticazione
        this.isLoggedIn = false; // Sarà gestito da AuthManager
        this.rsvpItems = [];
        
        // DOM Elements
        this.loginScreen = document.getElementById('loginScreen');
        this.adminPanel = document.getElementById('adminPanel');
        this.loginForm = document.getElementById('loginForm');
        this.loginError = document.getElementById('loginError');
        this.logoutBtn = document.getElementById('logoutBtn');
        
        // Stats
        this.totalConfirmedEl = document.getElementById('totalConfirmed');
        this.totalDeclinedEl = document.getElementById('totalDeclined');
        this.totalGuestsEl = document.getElementById('totalGuests');
        this.totalIntolerancesEl = document.getElementById('totalIntolerances');
        
        // Toolbar
        this.searchInput = document.getElementById('searchInput');
        this.exportCSVBtn = document.getElementById('exportCSVBtn');
        this.exportExcelBtn = document.getElementById('exportExcelBtn');
        
        // Filters
        this.filterStatus = document.getElementById('filterStatus');
        this.filterSort = document.getElementById('filterSort');
        
        // Table
        this.rsvpTableBody = document.getElementById('rsvpTableBody');
        this.adminLoading = document.getElementById('adminLoading');
        this.adminEmpty = document.getElementById('adminEmpty');
        
        // Details Modal
        this.detailsModal = document.getElementById('detailsModal');
        this.detailsClose = document.getElementById('detailsClose');
        
        this.init();
    }
    
    init() {
        this.initializeAuth();
        this.setupEventListeners();
        this.setupPasswordToggle();
    }

    initializeAuth() {
        // Inizializza AuthManagerSecure
        authManager = new AuthManagerSecure();
        
        // Setup event listeners per auth
        this.setupAuthEventListeners();
    }

    setupAuthEventListeners() {
        // Login form
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin(e);
            });
        }

        // Logout button
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', async () => {
                await this.handleLogout();
            });
        }
    }
    
    setupEventListeners() {
        // Login/Logout gestiti da setupAuthEventListeners()
        
        // Toolbar
        this.searchInput.addEventListener('input', () => this.applyFilters());
        this.exportCSVBtn.addEventListener('click', () => this.exportCSV());
        this.exportExcelBtn.addEventListener('click', () => this.exportExcel());
        
        // Filters
        this.filterStatus.addEventListener('change', () => this.applyFilters());
        this.filterSort.addEventListener('change', () => this.applyFilters());
        
        // Details Modal
        this.detailsClose.addEventListener('click', () => this.closeDetails());
        this.detailsModal.addEventListener('click', (e) => {
            if (e.target === this.detailsModal) this.closeDetails();
        });
    }

    setupPasswordToggle() {
        const passwordToggle = document.getElementById('passwordToggle');
        const passwordInput = document.getElementById('password');
        
        if (passwordToggle && passwordInput) {
            passwordToggle.addEventListener('click', () => {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    passwordToggle.classList.remove('fa-eye');
                    passwordToggle.classList.add('fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    passwordToggle.classList.remove('fa-eye-slash');
                    passwordToggle.classList.add('fa-eye');
                }
            });
        }
    }
    
    async handleLogin(e) {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        
        if (!password) {
            this.loginError.textContent = '❌ Inserisci la password.';
            return;
        }
        
        // Usa AuthManager per il login
        const result = await authManager.login(password);
        
        if (result.success) {
            // Login successful, AuthManager gestisce il resto
            this.loginError.textContent = '';
            document.getElementById('password').value = '';
        } else {
            this.loginError.textContent = `❌ ${result.message}`;
            document.getElementById('password').value = '';
        }
    }
    
    async handleLogout() {
        // Usa AuthManager per il logout
        await authManager.logout();
    }
    
    showLoginScreen() {
        this.loginScreen.style.display = 'flex';
        this.adminPanel.style.display = 'none';
        this.isLoggedIn = false;
    }
    
    showAdminPanel() {
        this.loginScreen.style.display = 'none';
        this.adminPanel.style.display = 'block';
        this.isLoggedIn = true;
        this.loadRSVP();
    }
    
    async loadRSVP() {
        try {
            this.adminLoading.style.display = 'block';
            this.adminEmpty.style.display = 'none';
            
            const snapshot = await db.collection('rsvp-confirmations').get();
            this.rsvpItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.updateStats();
            this.applyFilters();
            
            this.adminLoading.style.display = 'none';
            
            if (this.rsvpItems.length === 0) {
                this.adminEmpty.style.display = 'block';
            }
        } catch (error) {
            console.error('Errore nel caricamento:', error);
            alert('Errore nel caricamento delle prenotazioni.');
            this.adminLoading.style.display = 'none';
        }
    }
    
    updateStats() {
        let confirmed = 0;
        let declined = 0;
        let totalGuests = 0;
        let withIntolerances = 0;
        
        this.rsvpItems.forEach(item => {
            if (item.attendance === 'yes') {
                confirmed++;
                totalGuests += parseInt(item.guests) || 0;
                
                if (item.intolerances && item.intolerances !== 'Nessuna' && item.intolerances.trim() !== '') {
                    withIntolerances++;
                }
            } else {
                declined++;
            }
        });
        
        this.totalConfirmedEl.textContent = confirmed;
        this.totalDeclinedEl.textContent = declined;
        this.totalGuestsEl.textContent = totalGuests;
        this.totalIntolerancesEl.textContent = withIntolerances;
    }
    
    applyFilters() {
        let filteredItems = [...this.rsvpItems];
        
        // Search filter
        const searchTerm = this.searchInput.value.toLowerCase();
        if (searchTerm) {
            filteredItems = filteredItems.filter(item =>
                item.name.toLowerCase().includes(searchTerm) ||
                item.email.toLowerCase().includes(searchTerm)
            );
        }
        
        // Status filter
        const statusFilter = this.filterStatus.value;
        if (statusFilter === 'yes') {
            filteredItems = filteredItems.filter(item => item.attendance === 'yes');
        } else if (statusFilter === 'no') {
            filteredItems = filteredItems.filter(item => item.attendance === 'no');
        } else if (statusFilter === 'intolerances') {
            filteredItems = filteredItems.filter(item =>
                item.intolerances && item.intolerances !== 'Nessuna' && item.intolerances.trim() !== ''
            );
        }
        
        // Sort
        const sortFilter = this.filterSort.value;
        filteredItems.sort((a, b) => {
            if (sortFilter === 'newest') {
                const dateA = a.timestamp?.toDate() || new Date(0);
                const dateB = b.timestamp?.toDate() || new Date(0);
                return dateB - dateA;
            } else if (sortFilter === 'oldest') {
                const dateA = a.timestamp?.toDate() || new Date(0);
                const dateB = b.timestamp?.toDate() || new Date(0);
                return dateA - dateB;
            } else if (sortFilter === 'name') {
                return a.name.localeCompare(b.name);
            }
        });
        
        this.renderTable(filteredItems);
    }
    
    renderTable(items) {
        this.rsvpTableBody.innerHTML = '';
        
        if (items.length === 0) {
            this.rsvpTableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">Nessuna prenotazione trovata</td></tr>';
            return;
        }
        
        items.forEach(item => {
            const row = document.createElement('tr');
            
            const attendanceBadge = item.attendance === 'yes'
                ? '<span class="badge badge-success">✓ Sì</span>'
                : '<span class="badge badge-danger">✗ No</span>';
            
            const intolerances = item.intolerances && item.intolerances !== 'Nessuna' && item.intolerances.trim() !== ''
                ? item.intolerances.substring(0, 30) + (item.intolerances.length > 30 ? '...' : '')
                : '-';
            
            const message = item.message && item.message.trim() !== ''
                ? item.message.substring(0, 30) + (item.message.length > 30 ? '...' : '')
                : '-';
            
            row.innerHTML = `
                <td>${item.name}</td>
                <td><a href="mailto:${item.email}">${item.email}</a></td>
                <td>${item.phone || '-'}</td>
                <td>${attendanceBadge}</td>
                <td>${item.attendance === 'yes' ? item.guests : '-'}</td>
                <td>${intolerances}</td>
                <td>${message}</td>
                <td>${this.formatDate(item.timestamp)}</td>
                <td class="actions-cell">
                    <button class="action-btn view-btn" data-id="${item.id}" title="Visualizza">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${item.id}" title="Elimina">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            // Event listeners
            const viewBtn = row.querySelector('.view-btn');
            viewBtn.addEventListener('click', () => this.viewDetails(item));
            
            const deleteBtn = row.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => this.deleteRSVP(item.id));
            
            this.rsvpTableBody.appendChild(row);
        });
    }
    
    viewDetails(item) {
        document.getElementById('detailsName').textContent = item.name;
        document.getElementById('detailsEmail').textContent = item.email;
        document.getElementById('detailsPhone').textContent = item.phone || 'Non fornito';
        document.getElementById('detailsAttendance').textContent = item.attendance === 'yes' ? 'Parteciperà' : 'Non parteciperà';
        document.getElementById('detailsGuests').textContent = item.attendance === 'yes' ? item.guests : '-';
        document.getElementById('detailsIntolerances').textContent = item.intolerances || 'Nessuna';
        document.getElementById('detailsMessage').textContent = item.message || 'Nessun messaggio';
        document.getElementById('detailsDate').textContent = this.formatDate(item.timestamp);
        
        this.detailsModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    closeDetails() {
        this.detailsModal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
    
    async deleteRSVP(id) {
        if (!confirm('Sei sicuro di voler eliminare questa prenotazione?')) return;
        
        try {
            await db.collection('rsvp-confirmations').doc(id).delete();
            this.rsvpItems = this.rsvpItems.filter(item => item.id !== id);
            this.updateStats();
            this.applyFilters();
            alert('Prenotazione eliminata con successo!');
        } catch (error) {
            console.error('Errore nell\'eliminazione:', error);
            alert('Errore nell\'eliminazione della prenotazione.');
        }
    }
    
    exportCSV() {
        const headers = ['Nome', 'Email', 'Telefono', 'Partecipazione', 'N. Ospiti', 'Intolleranze', 'Messaggio', 'Data Conferma'];
        const rows = this.rsvpItems.map(item => [
            item.name,
            item.email,
            item.phone || '',
            item.attendance === 'yes' ? 'Sì' : 'No',
            item.attendance === 'yes' ? item.guests : '',
            item.intolerances || '',
            item.message || '',
            this.formatDate(item.timestamp)
        ]);
        
        let csvContent = headers.join(',') + '\n';
        rows.forEach(row => {
            csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
        });
        
        this.downloadFile(csvContent, 'rsvp-matrimonio.csv', 'text/csv');
    }
    
    exportExcel() {
        // Simple Excel-compatible HTML table export
        let html = '<html><head><meta charset="utf-8"></head><body><table border="1">';
        html += '<tr><th>Nome</th><th>Email</th><th>Telefono</th><th>Partecipazione</th><th>N. Ospiti</th><th>Intolleranze</th><th>Messaggio</th><th>Data Conferma</th></tr>';
        
        this.rsvpItems.forEach(item => {
            html += '<tr>';
            html += `<td>${item.name}</td>`;
            html += `<td>${item.email}</td>`;
            html += `<td>${item.phone || ''}</td>`;
            html += `<td>${item.attendance === 'yes' ? 'Sì' : 'No'}</td>`;
            html += `<td>${item.attendance === 'yes' ? item.guests : ''}</td>`;
            html += `<td>${item.intolerances || ''}</td>`;
            html += `<td>${item.message || ''}</td>`;
            html += `<td>${this.formatDate(item.timestamp)}</td>`;
            html += '</tr>';
        });
        
        html += '</table></body></html>';
        
        this.downloadFile(html, 'rsvp-matrimonio.xls', 'application/vnd.ms-excel');
    }
    
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
    
    formatDate(timestamp) {
        if (!timestamp) return 'Data sconosciuta';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Initialize Admin RSVP Panel
document.addEventListener('DOMContentLoaded', () => {
    new AdminRSVPPanel();
});

