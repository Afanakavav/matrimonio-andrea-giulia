// REGOLE FIRESTORE CORRETTE - FASE 1
// Sostituisci TUTTO il contenuto delle regole con questo:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // RSVP: Creazione pubblica, lettura/cancellazione temporaneamente aperte per admin
    match /rsvp-confirmations/{document=**} {
      // Chiunque può creare RSVP (entro deadline)
      allow create: if request.time < timestamp.date(2026, 4, 6)
                    && request.resource.data.keys().hasAll(['name', 'email', 'attendance'])
                    && request.resource.data.name is string
                    && request.resource.data.email is string
                    && request.resource.data.attendance is string
                    && request.resource.data.email.matches('.*@.*\\..*');
      
      // TEMPORANEAMENTE: Admin può leggere/cancellare (FASE 2 risolverà con auth)
      allow read, update, delete: if true;
    }
    
    // Media: Creazione/lettura pubblica, cancellazione temporaneamente aperta
    match /wedding-media/{document=**} {
      // Chiunque può creare/leggere media (entro deadline)
      allow read, create: if request.time < timestamp.date(2026, 8, 12);
      
      // TEMPORANEAMENTE: Admin può cancellare (FASE 2 risolverà con auth)
      allow delete: if true;
    }
  }
}

// NOTA: In FASE 2 sostituiremo "if true" con controlli di autenticazione reali
