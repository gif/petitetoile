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

I dati vengono salvati nel `localStorage` del browser.

## Funzioni

- Creazione teatri con matrice file/posti.
- Visualizzazione grafica della sala.
- Creazione eventi e associazione evento/teatro.
- Registrazione utenti con email e password.
- Prenotazione posti con limite configurabile per evento.
- Calcolo pagamento con prezzo base e prezzo aggiuntivo.
- Stampa delle prenotazioni confermate.
