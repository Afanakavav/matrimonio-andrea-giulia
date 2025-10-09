// Video Handler per garantire autoplay su tutti i dispositivi
document.addEventListener('DOMContentLoaded', function() {
    const heroVideo = document.querySelector('.hero-video');
    
    if (heroVideo) {
        // Tentativo di play automatico
        const playPromise = heroVideo.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    // Autoplay avviato con successo
                    console.log('Video autoplay avviato');
                })
                .catch((error) => {
                    // Autoplay fallito (probabilmente su iOS)
                    console.log('Autoplay non supportato, tentativo di avvio manuale');
                    
                    // Avvia il video al primo tocco/click dell'utente
                    const startVideo = () => {
                        heroVideo.play();
                        document.removeEventListener('click', startVideo);
                        document.removeEventListener('touchstart', startVideo);
                    };
                    
                    document.addEventListener('click', startVideo);
                    document.addEventListener('touchstart', startVideo);
                });
        }
        
        // Assicura che il video sia sempre in loop
        heroVideo.addEventListener('ended', function() {
            this.currentTime = 0;
            this.play();
        });
        
        // Pausa il video quando non è visibile (ottimizzazione batteria mobile)
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        heroVideo.play();
                    } else {
                        heroVideo.pause();
                    }
                });
            }, { threshold: 0.25 });
            
            observer.observe(heroVideo);
        }
    }
});

