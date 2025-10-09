class Gallery {
    constructor() {
        this.galleryContainer = document.getElementById('galleryContainer');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.emptyState = document.getElementById('emptyState');
        this.totalMedia = document.getElementById('totalMedia');
        this.mediaModal = document.getElementById('mediaModal');
        this.modalClose = document.getElementById('modalClose');
        this.modalPrev = document.getElementById('modalPrev');
        this.modalNext = document.getElementById('modalNext');
        this.modalCounter = document.getElementById('modalCounter');
        
        this.mediaItems = [];
        this.loading = false;
        this.hasLoaded = false;
        this.currentIndex = 0;
        
        this.init();
    }
    
    init() {
        if (!isViewingEnabled()) {
            this.showMessage('La galleria e disponibile solo durante il matrimonio e per un mese successivo.');
            return;
        }
        
        this.loadMedia();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.modalClose.addEventListener('click', () => this.closeModal());
        this.modalPrev.addEventListener('click', () => this.showPrevious());
        this.modalNext.addEventListener('click', () => this.showNext());
        
        this.mediaModal.addEventListener('click', (e) => {
            if (e.target === this.mediaModal) this.closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (this.mediaModal.style.display === 'flex') {
                if (e.key === 'ArrowLeft') this.showPrevious();
                if (e.key === 'ArrowRight') this.showNext();
                if (e.key === 'Escape') this.closeModal();
            }
        });
    }
    
    async loadMedia() {
        if (this.loading || this.hasLoaded) return;
        
        this.loading = true;
        this.loadingIndicator.style.display = 'block';
        
        try {
            const snapshot = await db.collection('wedding-media')
                .orderBy('uploadDate', 'desc')
                .limit(100)
                .get();
            
            if (snapshot.empty) {
                this.showEmptyState();
                return;
            }
            
            this.totalMedia.textContent = snapshot.size;
            this.mediaItems = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                this.mediaItems.push({ id: doc.id, ...data });
            });
            
            this.renderGallery();
            this.hasLoaded = true;
            
        } catch (error) {
            console.error('Errore nel caricamento della galleria:', error);
            this.showError('Errore nel caricamento della galleria. Riprova piu tardi.');
        } finally {
            this.loading = false;
            this.loadingIndicator.style.display = 'none';
        }
    }
    
    renderGallery() {
        this.galleryContainer.innerHTML = '';
        this.emptyState.style.display = 'none';
        
        this.mediaItems.forEach((item) => {
            const mediaElement = this.createMediaElement(item);
            this.galleryContainer.appendChild(mediaElement);
        });
    }
    
    createMediaElement(item) {
        const mediaItem = document.createElement('div');
        mediaItem.className = 'gallery-item';
        
        if (item.fileType && item.fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = item.downloadURL;
            img.alt = item.fileName || 'Foto matrimonio';
            img.loading = 'lazy';
            mediaItem.appendChild(img);
        } else if (item.fileType && item.fileType.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = item.downloadURL;
            video.muted = true;
            video.loop = true;
            video.loading = 'lazy';
            mediaItem.appendChild(video);
            
            const playIcon = document.createElement('div');
            playIcon.className = 'play-icon';
            playIcon.innerHTML = '<i class="fas fa-play"></i>';
            mediaItem.appendChild(playIcon);
        }
        
        mediaItem.addEventListener('click', () => this.openModal(item));
        
        return mediaItem;
    }
    
    openModal(item, index) {
        this.currentIndex = index !== undefined ? index : this.mediaItems.findIndex(i => i.id === item.id);
        this.displayCurrentMedia();
        this.mediaModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    displayCurrentMedia() {
        const item = this.mediaItems[this.currentIndex];
        const modalImage = document.getElementById('modalImage');
        const modalVideo = document.getElementById('modalVideo');
        
        if (item.fileType && item.fileType.startsWith('image/')) {
            modalImage.src = item.downloadURL;
            modalImage.style.display = 'block';
            modalVideo.style.display = 'none';
            modalVideo.pause();
        } else if (item.fileType && item.fileType.startsWith('video/')) {
            modalVideo.src = item.downloadURL;
            modalVideo.style.display = 'block';
            modalImage.style.display = 'none';
        }
        
        this.modalCounter.textContent = (this.currentIndex + 1) + ' / ' + this.mediaItems.length;
    }
    
    showPrevious() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrentMedia();
        }
    }
    
    showNext() {
        if (this.currentIndex < this.mediaItems.length - 1) {
            this.currentIndex++;
            this.displayCurrentMedia();
        }
    }
    
    closeModal() {
        this.mediaModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        const modalVideo = document.getElementById('modalVideo');
        if (modalVideo) {
            modalVideo.pause();
            modalVideo.currentTime = 0;
        }
    }
    
    showEmptyState() {
        this.emptyState.style.display = 'block';
        this.galleryContainer.innerHTML = '';
        this.loadingIndicator.style.display = 'none';
        this.totalMedia.textContent = '0';
    }
    
    showMessage(message) {
        this.galleryContainer.innerHTML = '<div class="message-container"><i class="fas fa-info-circle"></i><p>' + message + '</p></div>';
        this.loadingIndicator.style.display = 'none';
    }
    
    showError(message) {
        this.galleryContainer.innerHTML = '<div class="error-container"><i class="fas fa-exclamation-triangle"></i><p>' + message + '</p></div>';
        this.loadingIndicator.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Gallery();
});
