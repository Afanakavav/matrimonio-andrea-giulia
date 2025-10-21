// RSVP Handler con EmailJS e Firebase
// Inizializza EmailJS
(function() {
    emailjs.init("cVcAe6MvmwdmXfCXo"); // Sostituire con il tuo User ID di EmailJS
})();

// RSVP Form Handler
const rsvpHandler = {
    init() {
        this.form = document.getElementById('rsvpForm');
        this.attendanceSelect = document.getElementById('attendance');
        this.guestsGroup = document.getElementById('guestsGroup');
        this.intolerancesGroup = document.getElementById('intolerancesGroup');
        this.successMessage = document.getElementById('rsvpSuccessMessage');
        this.editLink = document.getElementById('editRsvpLink');
        
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        // Show/hide guests and intolerances fields based on attendance
        this.attendanceSelect.addEventListener('change', (e) => {
            if (e.target.value === 'yes') {
                this.guestsGroup.style.display = 'block';
                this.intolerancesGroup.style.display = 'block';
                document.getElementById('guests').required = true;
            } else {
                this.guestsGroup.style.display = 'none';
                this.intolerancesGroup.style.display = 'none';
                document.getElementById('guests').required = false;
            }
        });
        
        // Edit RSVP link
        this.editLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.successMessage.style.display = 'none';
            this.form.style.display = 'block';
        });
        
        // Form submit
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        });
    },
    
    async handleSubmit(e) {
        const submitBtn = document.getElementById('rsvpSubmitBtn');
        const originalHTML = submitBtn.innerHTML;
        
        // Disable button
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio in corso...';
        
        try {
            // Get reCAPTCHA token
            const recaptchaResponse = grecaptcha.getResponse();
            
            if (!recaptchaResponse) {
                throw new Error('Per favore completa la verifica reCAPTCHA');
            }
            
            // Get form data
            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value || 'Non fornito',
                attendance: document.getElementById('attendance').value,
                guests: document.getElementById('guests').value || '0',
                intolerances: document.getElementById('intolerances').value || 'Nessuna',
                message: document.getElementById('message').value || 'Nessun messaggio'
            };
            
            // Call Cloud Function to submit RSVP (includes reCAPTCHA verification)
            const submitRSVP = firebase.functions().httpsCallable('submitRSVP');
            const result = await submitRSVP({
                token: recaptchaResponse,
                rsvpData: formData
            });
            
            console.log('RSVP salvato con successo:', result.data.rsvpId);
            
            // Send confirmation email via EmailJS
            await this.sendConfirmationEmail(formData);
            
            // Show success message
            this.form.style.display = 'none';
            this.successMessage.style.display = 'block';
            
            // Reset form and reCAPTCHA
            this.form.reset();
            grecaptcha.reset();
            this.guestsGroup.style.display = 'none';
            this.intolerancesGroup.style.display = 'none';
            
            // Scroll to success message
            this.successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
        } catch (error) {
            console.error('Errore nell\'invio:', error);
            
            let errorMessage = 'Si è verificato un errore nell\'invio della conferma. Riprova per favore.';
            
            // Handle specific error messages
            if (error.message && error.message.includes('reCAPTCHA')) {
                errorMessage = error.message;
            } else if (error.code === 'permission-denied') {
                errorMessage = 'Verifica reCAPTCHA fallita. Riprova per favore.';
            } else if (error.code === 'invalid-argument') {
                errorMessage = 'Dati del modulo non validi. Controlla i campi e riprova.';
            }
            
            alert(errorMessage);
            
            // Reset reCAPTCHA on error
            grecaptcha.reset();
            
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHTML;
        }
    },
    
    async sendConfirmationEmail(formData) {
        const templateParams = {
            to_name: formData.name,
            to_email: formData.email,
            attendance: formData.attendance === 'yes' ? 'Parteciperà' : 'Non parteciperà',
            guests: formData.guests,
            intolerances: formData.intolerances,
            message: formData.message
        };
        
        try {
            // Sostituire con il tuo Service ID e Template ID di EmailJS
            await emailjs.send('service_yp2w08r', 'template_6sj1bah', templateParams);
            console.log('Email di conferma inviata con successo');
        } catch (error) {
            console.error('Errore nell\'invio dell\'email:', error);
            // Non bloccare il processo se l'email fallisce
        }
    },
    
    generateToken() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
};

// Countdown Timer
const countdownTimer = {
    targetDate: new Date('2026-07-05T15:30:00').getTime(),
    
    init() {
        this.daysEl = document.getElementById('days');
        this.hoursEl = document.getElementById('hours');
        this.minutesEl = document.getElementById('minutes');
        this.secondsEl = document.getElementById('seconds');
        
        this.updateCountdown();
        setInterval(() => this.updateCountdown(), 1000);
    },
    
    updateCountdown() {
        const now = new Date().getTime();
        const distance = this.targetDate - now;
        
        if (distance < 0) {
            // Wedding day has passed
            document.querySelector('.countdown-container').innerHTML = '<h3>🎉 Il grande giorno è arrivato! 🎉</h3>';
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        this.daysEl.textContent = days;
        this.hoursEl.textContent = hours;
        this.minutesEl.textContent = minutes;
        this.secondsEl.textContent = seconds;
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    rsvpHandler.init();
    countdownTimer.init();
});

