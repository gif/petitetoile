# Prenotazioni Etoile

Applicazione web statica per gestire teatri, eventi di danza e prenotazioni dei posti senza database server.

## Avvio

Apri `index.html` nel browser oppure avvia il server statico:

```powershell
node server.js
```

Poi apri `http://localhost:5173`.

Account demo amministratore:

- Email: `admin@etoile.local`
- Password: `admin123`

I dati vengono salvati in `data.json` quando l'app viene aperta tramite `node server.js`; il `localStorage` resta come fallback se si apre direttamente `index.html`.

Per spostare dati gia presenti in un browser: apri l'app con quel browser e ricarica la pagina, cosi i dati locali vengono copiati nel file `data.json`. Gli altri browser collegati allo stesso server leggeranno poi lo stesso file.

## Funzioni

- Creazione teatri con matrice file/posti.
- Configurazione file con posti variabili per Platea e Galleria usando righe nel formato `A:12`.
- Visualizzazione grafica della sala.
- Creazione eventi e associazione evento/teatro.
- Registrazione utenti con email e password.
- Prenotazione posti con limite configurabile per evento.
- Calcolo pagamento con prezzo base e prezzo aggiuntivo.
- Stampa delle prenotazioni confermate.
