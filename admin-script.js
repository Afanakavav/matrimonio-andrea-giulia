// Admin Panel Script
const ADMIN_PASSWORD = 'RindiFusi';

class AdminPanel {
    constructor() {
        // Password: RindiFusi
        this.isLoggedIn = sessionStorage.getItem('adminLoggedIn') === 'true';
        this.mediaItems = [];
        this.selectedItems = new Set();
        
        // DOM Elements
        this.loginScreen = document.getElementById('loginScreen');
        this.adminPanel = document.getElementById('adminPanel');
        this.loginForm = document.getElementById('loginForm');
        this.loginError = document.getElementById('loginError');
        this.logoutBtn = document.getElementById('logoutBtn');
        
        // Stats
        this.totalPhotosEl = document.getElementById('totalPhotos');
        this.totalVideosEl = document.getElementById('totalVideos');
        this.totalSizeEl = document.getElementById('totalSize');
        this.totalFavoritesEl = document.getElementById('totalFavorites');
        
        // Toolbar
        this.selectAllBtn = document.getElementById('selectAllBtn');
        this.deselectAllBtn = document.getElementById('deselectAllBtn');
        this.selectionCount = document.getElementById('selectionCount');
        this.deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        this.downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        
        // Filters
        this.filterType = document.getElementById('filterType');
        this.filterSort = document.getElementById('filterSort');
        
        // Gallery
        this.adminGallery = document.getElementById('adminGallery');
        this.adminLoading = document.getElementById('adminLoading');
        this.adminEmpty = document.getElementById('adminEmpty');
        
        // Preview Modal
        this.previewModal = document.getElementById('previewModal');
        this.previewClose = document.getElementById('previewClose');
        this.previewImage = document.getElementById('previewImage');
        this.previewVideo = document.getElementById('previewVideo');
        this.previewFileName = document.getElementById('previewFileName');
        this.previewFileSize = document.getElementById('previewFileSize');
        this.previewFileDate = document.getElementById('previewFileDate');
        
        this.init();
    }
    
    init() {
        if (this.isLoggedIn) {
            this.showAdminPanel();
        } else {
            this.showLoginScreen();
        }
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Login
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.logoutBtn.addEventListener('click', () => this.handleLogout());
        
        // Toolbar
        this.selectAllBtn.addEventListener('click', () => this.selectAll());
        this.deselectAllBtn.addEventListener('click', () => this.deselectAll());
        this.deleteSelectedBtn.addEventListener('click', () => this.deleteSelected());
        this.downloadSelectedBtn.addEventListener('click', () => this.downloadSelected());
        this.downloadAllBtn.addEventListener('click', () => this.downloadAll());
        
        // Filters
        this.filterType.addEventListener('change', () => this.applyFilters());
        this.filterSort.addEventListener('change', () => this.applyFilters());
        
        // Preview Modal
        this.previewClose.addEventListener('click', () => this.closePreview());
        this.previewModal.addEventListener('click', (e) => {
            if (e.target === this.previewModal) this.closePreview();
        });
    }
    
    handleLogin(e) {
        e.preventDefault();
        const password = document.getElementById('password').value;
        
        if (password === ADMIN_PASSWORD) {
            sessionStorage.setItem('adminLoggedIn', 'true');
            this.isLoggedIn = true;
            this.showAdminPanel();
        } else {
            this.loginError.textContent = '❌ Password errata. Riprova.';
            document.getElementById('password').value = '';
        }
    }
    
    handleLogout() {
        sessionStorage.removeItem('adminLoggedIn');
        this.isLoggedIn = false;
        this.showLoginScreen();
    }
    
    showLoginScreen() {
        this.loginScreen.style.display = 'flex';
        this.adminPanel.style.display = 'none';
    }
    
    showAdminPanel() {
        this.loginScreen.style.display = 'none';
        this.adminPanel.style.display = 'block';
        this.loadMedia();
    }
    
    async loadMedia() {
        try {
            this.adminLoading.style.display = 'block';
            this.adminEmpty.style.display = 'none';
            this.adminGallery.innerHTML = '';
            
            const snapshot = await db.collection('wedding-media').get();
            this.mediaItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.updateStats();
            this.applyFilters();
            
            this.adminLoading.style.display = 'none';
            
            if (this.mediaItems.length === 0) {
                this.adminEmpty.style.display = 'block';
            }
        } catch (error) {
            console.error('Errore nel caricamento:', error);
            alert('Errore nel caricamento dei media.');
            this.adminLoading.style.display = 'none';
        }
    }
    
    updateStats() {
        let photoCount = 0;
        let videoCount = 0;
        let totalSize = 0;
        let favoriteCount = 0;
        
        this.mediaItems.forEach(item => {
            if (item.fileType && item.fileType.startsWith('image/')) {
                photoCount++;
            } else if (item.fileType && item.fileType.startsWith('video/')) {
                videoCount++;
            }
            
            totalSize += item.fileSize || 0;
            
            if (item.favorite) {
                favoriteCount++;
            }
        });
        
        this.totalPhotosEl.textContent = photoCount;
        this.totalVideosEl.textContent = videoCount;
        this.totalSizeEl.textContent = this.formatFileSize(totalSize);
        this.totalFavoritesEl.textContent = favoriteCount;
    }
    
    applyFilters() {
        let filteredItems = [...this.mediaItems];
        
        // Filter by type
        const typeFilter = this.filterType.value;
        if (typeFilter === 'photo') {
            filteredItems = filteredItems.filter(item => 
                item.fileType && item.fileType.startsWith('image/')
            );
        } else if (typeFilter === 'video') {
            filteredItems = filteredItems.filter(item => 
                item.fileType && item.fileType.startsWith('video/')
            );
        } else if (typeFilter === 'favorites') {
            filteredItems = filteredItems.filter(item => item.favorite);
        }
        
        // Sort
        const sortFilter = this.filterSort.value;
        filteredItems.sort((a, b) => {
            const dateA = a.uploadDate?.toDate() || new Date(0);
            const dateB = b.uploadDate?.toDate() || new Date(0);
            
            if (sortFilter === 'newest') {
                return dateB - dateA;
            } else {
                return dateA - dateB;
            }
        });
        
        this.renderGallery(filteredItems);
    }
    
    renderGallery(items) {
        this.adminGallery.innerHTML = '';
        
        items.forEach(item => {
            const mediaItem = document.createElement('div');
            mediaItem.className = 'admin-media-item';
            mediaItem.dataset.id = item.id;
            
            const isImage = item.fileType && item.fileType.startsWith('image/');
            const isVideo = item.fileType && item.fileType.startsWith('video/');
            
            let thumbnailHTML = '';
            if (isImage) {
                thumbnailHTML = `<img src="${item.downloadURL}" alt="Media" class="media-thumbnail">`;
            } else if (isVideo) {
                thumbnailHTML = `<video src="${item.downloadURL}" class="media-thumbnail"></video>`;
            }
            
            mediaItem.innerHTML = `
                <input type="checkbox" class="media-checkbox" data-id="${item.id}">
                <button class="favorite-btn ${item.favorite ? 'active' : ''}" data-id="${item.id}">
                    <i class="fas fa-star"></i>
                </button>
                ${thumbnailHTML}
                <div class="media-actions">
                    <button class="action-btn preview-btn" data-id="${item.id}" title="Anteprima">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn whatsapp-btn" data-id="${item.id}" title="Condividi su WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                    <button class="action-btn telegram-btn" data-id="${item.id}" title="Condividi su Telegram">
                        <i class="fab fa-telegram"></i>
                    </button>
                    <button class="action-btn download-btn" data-id="${item.id}" title="Scarica">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn delete" data-id="${item.id}" title="Elimina">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="media-info">
                    <p><strong>${this.formatFileSize(item.fileSize || 0)}</strong></p>
                    <p>${this.formatDate(item.uploadDate)}</p>
                </div>
            `;
            
            // Event listeners
            const checkbox = mediaItem.querySelector('.media-checkbox');
            checkbox.addEventListener('change', (e) => this.handleCheckboxChange(e));
            
            const favoriteBtn = mediaItem.querySelector('.favorite-btn');
            favoriteBtn.addEventListener('click', () => this.toggleFavorite(item.id));
            
            const thumbnail = mediaItem.querySelector('.media-thumbnail');
            thumbnail.addEventListener('click', () => this.openPreview(item));
            
            const previewBtn = mediaItem.querySelector('.preview-btn');
            previewBtn.addEventListener('click', () => this.openPreview(item));
            
            const whatsappBtn = mediaItem.querySelector('.whatsapp-btn');
            whatsappBtn.addEventListener('click', () => this.shareWhatsApp(item));
            
            const telegramBtn = mediaItem.querySelector('.telegram-btn');
            telegramBtn.addEventListener('click', () => this.shareTelegram(item));
            
            const downloadBtn = mediaItem.querySelector('.download-btn');
            downloadBtn.addEventListener('click', () => this.downloadSingle(item));
            
            const deleteBtn = mediaItem.querySelector('.delete');
            deleteBtn.addEventListener('click', () => this.deleteSingle(item.id));
            
            this.adminGallery.appendChild(mediaItem);
        });
    }
    
    handleCheckboxChange(e) {
        const id = e.target.dataset.id;
        const item = document.querySelector(`.admin-media-item[data-id="${id}"]`);
        
        if (e.target.checked) {
            this.selectedItems.add(id);
            item.classList.add('selected');
        } else {
            this.selectedItems.delete(id);
            item.classList.remove('selected');
        }
        
        this.updateSelectionUI();
    }
    
    updateSelectionUI() {
        const count = this.selectedItems.size;
        this.selectionCount.textContent = `${count} selezionati`;
        
        this.deleteSelectedBtn.disabled = count === 0;
        this.downloadSelectedBtn.disabled = count === 0;
    }
    
    selectAll() {
        const checkboxes = document.querySelectorAll('.media-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            this.selectedItems.add(checkbox.dataset.id);
            const item = document.querySelector(`.admin-media-item[data-id="${checkbox.dataset.id}"]`);
            item.classList.add('selected');
        });
        this.updateSelectionUI();
    }
    
    deselectAll() {
        const checkboxes = document.querySelectorAll('.media-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            this.selectedItems.delete(checkbox.dataset.id);
            const item = document.querySelector(`.admin-media-item[data-id="${checkbox.dataset.id}"]`);
            item.classList.remove('selected');
        });
        this.selectedItems.clear();
        this.updateSelectionUI();
    }
    
    async toggleFavorite(id) {
        try {
            const item = this.mediaItems.find(i => i.id === id);
            const newFavoriteStatus = !item.favorite;
            
            await db.collection('wedding-media').doc(id).update({
                favorite: newFavoriteStatus
            });
            
            item.favorite = newFavoriteStatus;
            
            const favoriteBtn = document.querySelector(`.favorite-btn[data-id="${id}"]`);
            if (newFavoriteStatus) {
                favoriteBtn.classList.add('active');
            } else {
                favoriteBtn.classList.remove('active');
            }
            
            this.updateStats();
        } catch (error) {
            console.error('Errore nel toggle preferito:', error);
            alert('Errore nell\'aggiornare i preferiti.');
        }
    }
    
    async deleteSingle(id) {
        if (!confirm('Sei sicuro di voler eliminare questo file?')) return;
        
        try {
            const item = this.mediaItems.find(i => i.id === id);
            
            // Delete from Storage
            if (item.storagePath) {
                await storage.ref(item.storagePath).delete();
            }
            
            // Delete from Firestore
            await db.collection('wedding-media').doc(id).delete();
            
            // Update UI
            this.mediaItems = this.mediaItems.filter(i => i.id !== id);
            this.selectedItems.delete(id);
            this.updateStats();
            this.applyFilters();
            
            alert('File eliminato con successo!');
        } catch (error) {
            console.error('Errore nell\'eliminazione:', error);
            alert('Errore nell\'eliminazione del file.');
        }
    }
    
    async deleteSelected() {
        if (this.selectedItems.size === 0) return;
        
        if (!confirm(`Sei sicuro di voler eliminare ${this.selectedItems.size} file?`)) return;
        
        try {
            const deletePromises = [];
            
            for (const id of this.selectedItems) {
                const item = this.mediaItems.find(i => i.id === id);
                
                // Delete from Storage
                if (item.storagePath) {
                    deletePromises.push(storage.ref(item.storagePath).delete());
                }
                
                // Delete from Firestore
                deletePromises.push(db.collection('wedding-media').doc(id).delete());
            }
            
            await Promise.all(deletePromises);
            
            // Update UI
            this.mediaItems = this.mediaItems.filter(i => !this.selectedItems.has(i.id));
            this.selectedItems.clear();
            this.updateStats();
            this.applyFilters();
            this.updateSelectionUI();
            
            alert('File eliminati con successo!');
        } catch (error) {
            console.error('Errore nell\'eliminazione:', error);
            alert('Errore nell\'eliminazione dei file.');
        }
    }
    
    async downloadSingle(item) {
        try {
            const response = await fetch(item.downloadURL);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = item.fileName || 'media';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Errore nel download:', error);
            alert('Errore nel download del file.');
        }
    }
    
    async downloadSelected() {
        if (this.selectedItems.size === 0) return;
        
        alert(`Download di ${this.selectedItems.size} file in corso... Potrebbero volerci alcuni minuti.`);
        
        try {
            for (const id of this.selectedItems) {
                const item = this.mediaItems.find(i => i.id === id);
                if (item) {
                    await this.downloadSingle(item);
                    // Small delay to avoid overwhelming the browser
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            alert('Download completato!');
        } catch (error) {
            console.error('Errore nel download:', error);
            alert('Errore nel download dei file.');
        }
    }
    
    async downloadAll() {
        if (this.mediaItems.length === 0) return;
        
        if (!confirm(`Vuoi scaricare tutti i ${this.mediaItems.length} file? Potrebbero volerci diversi minuti.`)) return;
        
        alert('Download in corso... Attendi.');
        
        try {
            for (const item of this.mediaItems) {
                await this.downloadSingle(item);
                // Small delay to avoid overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            alert('Download completato!');
        } catch (error) {
            console.error('Errore nel download:', error);
            alert('Errore nel download dei file.');
        }
    }
    
    shareWhatsApp(item) {
        const text = 'Guarda questa foto/video del matrimonio!';
        const url = `https://wa.me/?text=${encodeURIComponent(text + ' ' + item.downloadURL)}`;
        window.open(url, '_blank');
    }
    
    shareTelegram(item) {
        const text = 'Guarda questa foto/video del matrimonio!';
        const url = `https://t.me/share/url?url=${encodeURIComponent(item.downloadURL)}&text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    }
    
    openPreview(item) {
        this.previewFileName.textContent = item.fileName || 'File';
        this.previewFileSize.textContent = this.formatFileSize(item.fileSize || 0);
        this.previewFileDate.textContent = this.formatDate(item.uploadDate);
        
        if (item.fileType && item.fileType.startsWith('image/')) {
            this.previewImage.src = item.downloadURL;
            this.previewImage.style.display = 'block';
            this.previewVideo.style.display = 'none';
        } else if (item.fileType && item.fileType.startsWith('video/')) {
            this.previewVideo.src = item.downloadURL;
            this.previewVideo.style.display = 'block';
            this.previewImage.style.display = 'none';
        }
        
        this.previewModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    closePreview() {
        this.previewModal.classList.remove('show');
        this.previewVideo.pause();
        document.body.style.overflow = 'auto';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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

// Initialize Admin Panel
document.addEventListener('DOMContentLoaded', () => {
    new AdminPanel();
});

