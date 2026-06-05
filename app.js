(function () {
  const STORAGE_KEY = "prenotazioni-etoile-v1";

  const initialState = {
    currentUserId: null,
    authMode: "login",
    activeView: "bookings",
    selectedEventId: null,
    editingTheaterId: null,
    selectedSeats: [],
    users: [
      {
        id: "admin",
        name: "Amministratore",
        email: "admin@etoile.local",
        password: "admin123",
        role: "admin"
      }
    ],
    theaters: [
      {
        id: uid(),
        name: "Teatro Etoile",
        city: "Milano",
        rows: 8,
        seatsPerRow: 12,
        floorPlanImage: ""
      }
    ],
    events: [],
    bookings: []
  };

  initialState.events.push({
    id: uid(),
    title: "Gala di danza contemporanea",
    date: new Date().toISOString().slice(0, 10),
    theaterId: initialState.theaters[0].id,
    maxSeatsPerUser: 6,
    includedSeats: 2,
    includedPrice: 18,
    extraPrice: 28
  });

  let state = loadState();
  const app = document.getElementById("app");

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    try {
      const parsed = JSON.parse(saved);
      return {
        ...structuredClone(initialState),
        ...parsed,
        selectedSeats: []
      };
    } catch {
      return structuredClone(initialState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function money(value) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function currentUser() {
    return state.users.find((user) => user.id === state.currentUserId) || null;
  }

  function theaterById(id) {
    return state.theaters.find((theater) => theater.id === id);
  }

  function eventById(id) {
    return state.events.find((event) => event.id === id);
  }

  function seatsForTheater(theater) {
    const seats = [];
    for (let row = 1; row <= Number(theater.rows); row += 1) {
      for (let seat = 1; seat <= Number(theater.seatsPerRow); seat += 1) {
        seats.push(`${row}-${seat}`);
      }
    }
    return seats;
  }

  function seatLabel(code) {
    const [row, seat] = code.split("-");
    return `Fila ${row}, posto ${seat}`;
  }

  function reservedSeats(eventId) {
    return state.bookings
      .filter((booking) => booking.eventId === eventId)
      .flatMap((booking) => booking.seats);
  }

  function userSeatsForEvent(eventId, userId) {
    return state.bookings
      .filter((booking) => booking.eventId === eventId && booking.userId === userId)
      .flatMap((booking) => booking.seats);
  }

  function bookingTotalForAdditional(event, alreadyBookedCount, newCount) {
    const baseRemaining = Math.max(0, Number(event.includedSeats) - alreadyBookedCount);
    const included = Math.min(newCount, baseRemaining);
    const extra = Math.max(0, newCount - included);
    return included * Number(event.includedPrice) + extra * Number(event.extraPrice);
  }

  function render() {
    if (!currentUser()) {
      renderAuth();
      return;
    }

    const user = currentUser();
    app.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            <strong>Prenotazioni Etoile</strong>
            <span>Posti teatro per danza</span>
          </div>
          <nav class="nav">
            ${navButton("bookings", "Prenotazioni")}
            ${navButton("my", "I miei posti")}
            ${navButton("account", "Account")}
            ${user.role === "admin" ? navButton("theaters", "Teatri") : ""}
            ${user.role === "admin" ? navButton("events", "Eventi") : ""}
            ${user.role === "admin" ? navButton("users", "Utenti") : ""}
          </nav>
          <div></div>
          <div class="user-panel">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.email)} · ${user.role === "admin" ? "admin" : "utente"}</span>
            <button class="secondary" data-action="logout">Esci</button>
          </div>
        </aside>
        <main class="main">
          ${renderView()}
        </main>
      </div>
    `;
    bindCommon();
  }

  function navButton(view, label) {
    return `<button class="${state.activeView === view ? "active" : ""}" data-view="${view}">${label}</button>`;
  }

  function renderView() {
    if (state.activeView === "theaters") return renderTheaters();
    if (state.activeView === "events") return renderEvents();
    if (state.activeView === "my") return renderMyBookings();
    if (state.activeView === "account") return renderAccount();
    if (state.activeView === "users" && currentUser()?.role === "admin") return renderUsers();
    return renderBookings();
  }

  function renderAuth() {
    const isRegister = state.authMode === "register";
    app.innerHTML = `
      <section class="auth-page">
        <div class="auth-card">
          <div class="auth-intro">
            <h1>Prenotazioni Etoile</h1>
            <p>Gestione dei teatri, eventi di danza, mappe posti, prenotazioni e stampa dei biglietti senza database server.</p>
          </div>
          <form class="auth-form" data-form="${isRegister ? "register" : "login"}">
            <div class="tabs">
              <button type="button" class="${!isRegister ? "active" : ""}" data-auth-mode="login">Accedi</button>
              <button type="button" class="${isRegister ? "active" : ""}" data-auth-mode="register">Registrati</button>
            </div>
            ${isRegister ? `<label>Nome<input name="name" required autocomplete="name" /></label>` : ""}
            <label>Email<input name="email" type="email" required autocomplete="email" /></label>
            <label>Password<input name="password" type="password" required autocomplete="${isRegister ? "new-password" : "current-password"}" /></label>
            <button type="submit">${isRegister ? "Crea account" : "Accedi"}</button>
            <div class="notice">Account demo amministratore: admin@etoile.local / admin123</div>
          </form>
        </div>
      </section>
    `;

    app.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.authMode = button.dataset.authMode;
        render();
      });
    });

    app.querySelector("form").addEventListener("submit", handleAuth);
  }

  function handleAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));

    if (event.currentTarget.dataset.form === "register") {
      if (state.users.some((user) => user.email === email)) {
        alert("Esiste già un account con questa email.");
        return;
      }
      const user = {
        id: uid(),
        name: String(form.get("name")).trim() || email,
        email,
        password,
        role: "user"
      };
      state.users.push(user);
      state.currentUserId = user.id;
      state.activeView = "bookings";
      saveState();
      render();
      return;
    }

    const user = state.users.find((item) => item.email === email && item.password === password);
    if (!user) {
      alert("Email o password non valide.");
      return;
    }
    state.currentUserId = user.id;
    saveState();
    render();
  }

  function renderTheaters() {
    const theaterOptions = state.theaters.map((theater) => theaterCard(theater)).join("");
    const preview = state.theaters[0] ? renderSeatMap(state.theaters[0], null, []) : `<div class="empty">Crea il primo teatro.</div>`;
    const editingTheater = state.theaters.find((theater) => theater.id === state.editingTheaterId) || null;
    return `
      <div class="topbar">
        <div>
          <h1>Teatri</h1>
          <p>Crea sale con matrice fila/posto e controlla la visualizzazione grafica.</p>
        </div>
      </div>
      <section class="grid">
        <form class="panel" data-form="theater">
          <h2>Nuovo teatro</h2>
          <div class="form-grid">
            <label class="full">Nome teatro<input name="name" required placeholder="Es. Teatro Civico" /></label>
            <label>Città<input name="city" required placeholder="Es. Roma" /></label>
            <label>File<input name="rows" type="number" min="1" max="40" value="10" required /></label>
            <label>Posti per fila<input name="seatsPerRow" type="number" min="1" max="60" value="14" required /></label>
            <label class="full">Piantina teatro<input name="floorPlanImage" type="file" accept="image/*" /></label>
          </div>
          <button type="submit">Crea teatro</button>
        </form>
        <div class="panel">
          <h2>Anteprima posti</h2>
          ${preview}
        </div>
        ${editingTheater ? renderTheaterEditPanel(editingTheater) : ""}
      </section>
      <section class="list">${theaterOptions || `<div class="empty">Nessun teatro disponibile.</div>`}</section>
    `;
  }

  function renderTheaterEditPanel(theater) {
    const usedByEvents = state.events.some((event) => event.theaterId === theater.id);
    return `
      <form class="panel theater-edit-panel" data-form="theater-edit" data-theater-id="${theater.id}">
        <h2>Modifica teatro</h2>
        <div class="form-grid">
          <label class="full">Nome teatro<input name="name" required value="${escapeHtml(theater.name)}" /></label>
          <label>Citta<input name="city" required value="${escapeHtml(theater.city)}" /></label>
          <label>File<input name="rows" type="number" min="1" max="40" value="${escapeHtml(theater.rows)}" required ${usedByEvents ? "readonly" : ""} /></label>
          <label>Posti per fila<input name="seatsPerRow" type="number" min="1" max="60" value="${escapeHtml(theater.seatsPerRow)}" required ${usedByEvents ? "readonly" : ""} /></label>
          <label class="full">Carica nuova piantina<input name="floorPlanImage" type="file" accept="image/*" /></label>
        </div>
        ${usedByEvents ? `<div class="notice">File e posti per fila non sono modificabili per teatri già associati a eventi.</div>` : ""}
        ${theater.floorPlanImage ? `<img class="floorplan-thumb" src="${theater.floorPlanImage}" alt="Piantina ${escapeHtml(theater.name)}" />` : ""}
        <div class="actions">
          <button type="submit">Salva modifiche</button>
          <button type="button" class="secondary" data-action="cancel-theater-edit">Annulla</button>
          ${theater.floorPlanImage ? `<button type="button" class="danger" data-remove-floorplan="${theater.id}">Rimuovi piantina</button>` : ""}
        </div>
      </form>
    `;
  }

  function theaterCard(theater) {
    const seats = Number(theater.rows) * Number(theater.seatsPerRow);
    const usedByEvents = state.events.some((event) => event.theaterId === theater.id);
    return `
      <article class="card">
        <h3>${escapeHtml(theater.name)}</h3>
        <div class="meta">
          <span>${escapeHtml(theater.city)}</span>
          <span>${theater.rows} file</span>
          <span>${theater.seatsPerRow} posti/fila</span>
          <span>${seats} posti totali</span>
          <span>${theater.floorPlanImage ? "Piantina caricata" : "Senza piantina"}</span>
        </div>
        ${
          theater.floorPlanImage
            ? `<img class="floorplan-thumb" src="${theater.floorPlanImage}" alt="Piantina ${escapeHtml(theater.name)}" />`
            : ""
        }
        <div class="actions">
          <button class="secondary" data-edit-theater="${theater.id}">Modifica</button>
          <label class="upload-button">
            Carica piantina
            <input data-floorplan-upload="${theater.id}" type="file" accept="image/*" />
          </label>
          ${
            theater.floorPlanImage
              ? `<button class="secondary" data-open-floorplan="${theater.id}">Visualizza</button>
                 <button class="danger" data-remove-floorplan="${theater.id}">Rimuovi piantina</button>`
              : ""
          }
          <button class="danger" data-delete-theater="${theater.id}" ${usedByEvents ? "disabled" : ""}>Elimina</button>
          ${usedByEvents ? `<span class="badge">Associato a eventi</span>` : ""}
        </div>
      </article>
    `;
  }

  function renderEvents() {
    return `
      <div class="topbar">
        <div>
          <h1>Eventi</h1>
          <p>Associa ogni evento a un teatro e definisci limiti e prezzi dei posti.</p>
        </div>
      </div>
      <section class="grid">
        <form class="panel" data-form="event">
          <h2>Nuovo evento</h2>
          <div class="form-grid">
            <label class="full">Titolo<input name="title" required placeholder="Es. Saggio classico" /></label>
            <label>Data<input name="date" type="date" required /></label>
            <label>Teatro<select name="theaterId" required>${theaterSelectOptions()}</select></label>
            <label>Massimo posti per utente<input name="maxSeatsPerUser" type="number" min="1" value="6" required /></label>
            <label>Posti a prezzo base<input name="includedSeats" type="number" min="0" value="2" required /></label>
            <label>Prezzo base per posto<input name="includedPrice" type="number" min="0" step="0.01" value="18" required /></label>
            <label>Prezzo aggiuntivo per posto<input name="extraPrice" type="number" min="0" step="0.01" value="28" required /></label>
          </div>
          <button type="submit" ${state.theaters.length ? "" : "disabled"}>Crea evento</button>
        </form>
        <div class="panel">
          <h2>Eventi creati</h2>
          <div class="list">${state.events.map(eventCard).join("") || `<div class="empty">Nessun evento disponibile.</div>`}</div>
        </div>
      </section>
    `;
  }

  function eventCard(eventItem) {
    const theater = theaterById(eventItem.theaterId);
    const reserved = reservedSeats(eventItem.id).length;
    const capacity = theater ? Number(theater.rows) * Number(theater.seatsPerRow) : 0;
    return `
      <article class="card">
        <h3>${escapeHtml(eventItem.title)}</h3>
        <div class="meta">
          <span>${escapeHtml(eventItem.date)}</span>
          <span>${theater ? escapeHtml(theater.name) : "Teatro mancante"}</span>
          <span>${reserved}/${capacity} prenotati</span>
          <span>Max ${eventItem.maxSeatsPerUser} per utente</span>
        </div>
        <div class="meta">
          <span>${eventItem.includedSeats} posti a ${money(eventItem.includedPrice)}</span>
          <span>extra ${money(eventItem.extraPrice)}</span>
        </div>
        <div class="actions">
          <button class="secondary" data-open-event="${eventItem.id}">Apri prenotazioni</button>
          <button class="danger" data-delete-event="${eventItem.id}">Elimina</button>
        </div>
      </article>
    `;
  }

  function theaterSelectOptions() {
    return state.theaters.map((theater) => `<option value="${theater.id}">${escapeHtml(theater.name)} · ${escapeHtml(theater.city)}</option>`).join("");
  }

  function renderBookings() {
    const selectedEvent = eventById(state.selectedEventId) || state.events[0];
    if (selectedEvent && state.selectedEventId !== selectedEvent.id) state.selectedEventId = selectedEvent.id;
    const theater = selectedEvent ? theaterById(selectedEvent.theaterId) : null;
    const userSeats = selectedEvent ? userSeatsForEvent(selectedEvent.id, state.currentUserId) : [];
    const nextCount = userSeats.length + state.selectedSeats.length;
    const total = selectedEvent ? bookingTotalForAdditional(selectedEvent, userSeats.length, state.selectedSeats.length) : 0;
    const eventSelect = state.events
      .map((eventItem) => `<option value="${eventItem.id}" ${selectedEvent?.id === eventItem.id ? "selected" : ""}>${escapeHtml(eventItem.title)} · ${escapeHtml(eventItem.date)}</option>`)
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Prenotazioni</h1>
          <p>Scegli un evento, seleziona i posti disponibili e conferma il pagamento.</p>
        </div>
      </div>
      ${
        selectedEvent && theater
          ? `
            <section class="grid">
              <div class="panel">
                <h2>Scelta evento</h2>
                <label>Evento<select data-event-picker>${eventSelect}</select></label>
                <div class="summary">
                  <div class="summary-row"><span>Teatro</span><strong>${escapeHtml(theater.name)}</strong></div>
                  <div class="summary-row"><span>Limite per utente</span><strong>${selectedEvent.maxSeatsPerUser}</strong></div>
                  <div class="summary-row"><span>Posti già tuoi</span><strong>${userSeats.length}</strong></div>
                  <div class="summary-row"><span>Nuova selezione</span><strong>${state.selectedSeats.length}</strong></div>
                  <div class="summary-row"><span>Totale da pagare</span><strong>${money(total)}</strong></div>
                </div>
                <div class="notice ${nextCount <= Number(selectedEvent.maxSeatsPerUser) ? "hidden" : ""}">
                  Hai superato il massimo configurato per questo evento.
                </div>
                <div class="actions">
                  <button class="secondary" data-open-floorplan="${theater.id}" ${theater.floorPlanImage ? "" : "disabled"}>Apri piantina</button>
                  <button data-action="confirm-booking" ${state.selectedSeats.length && nextCount <= Number(selectedEvent.maxSeatsPerUser) ? "" : "disabled"}>Paga e prenota</button>
                  <button class="secondary" data-action="clear-selection">Annulla selezione</button>
                </div>
              </div>
              <div class="panel">
                <h2>Mappa posti</h2>
                ${renderSeatMap(theater, selectedEvent, state.selectedSeats)}
              </div>
            </section>
          `
          : `<div class="empty">Crea almeno un teatro e un evento per iniziare le prenotazioni.</div>`
      }
    `;
  }

  function renderSeatMap(theater, eventItem, selectedSeats) {
    const taken = eventItem ? reservedSeats(eventItem.id) : [];
    const mine = eventItem ? userSeatsForEvent(eventItem.id, state.currentUserId) : [];
    let rows = "";
    for (let row = 1; row <= Number(theater.rows); row += 1) {
      let seats = "";
      for (let seat = 1; seat <= Number(theater.seatsPerRow); seat += 1) {
        const code = `${row}-${seat}`;
        const isTaken = taken.includes(code);
        const isMine = mine.includes(code);
        const isSelected = selectedSeats.includes(code);
        const classes = ["seat", isTaken ? "taken" : "", isMine ? "mine" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
        seats += `<button class="${classes}" data-seat="${code}" ${isTaken || !eventItem ? "disabled" : ""} title="${seatLabel(code)}">${seat}</button>`;
      }
      rows += `<div class="seat-row" style="--cols:${theater.seatsPerRow}"><span class="row-label">F${row}</span>${seats}</div>`;
    }
    return `<div class="stage">Palco</div><div class="seat-map-wrap"><div class="seat-map">${rows}</div></div>`;
  }

  function renderMyBookings() {
    const bookings = state.bookings.filter((booking) => booking.userId === state.currentUserId);
    const user = currentUser();
    return `
      <div class="topbar">
        <div>
          <h1>I miei posti</h1>
          <p>Riepilogo stampabile dei posti prenotati e pagati.</p>
        </div>
        <button data-action="print-bookings" ${bookings.length ? "" : "disabled"}>Stampa</button>
      </div>
      <section class="panel printable">
        <h2>Prenotazioni confermate</h2>
        <div class="summary">
          <div class="summary-row"><span>Utente</span><strong>${escapeHtml(user.name)}</strong></div>
          <div class="summary-row"><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
        </div>
        <div class="list">
          ${
            bookings
              .map((booking) => {
                const eventItem = eventById(booking.eventId);
                const theater = eventItem ? theaterById(eventItem.theaterId) : null;
                return `
                  <article class="card">
                    <h3>${eventItem ? escapeHtml(eventItem.title) : "Evento eliminato"}</h3>
                    <div class="meta">
                      <span>${eventItem ? escapeHtml(eventItem.date) : ""}</span>
                      <span>${theater ? escapeHtml(theater.name) : ""}</span>
                      <span>${booking.seats.length} posti</span>
                      <span>${money(booking.total)}</span>
                    </div>
                    <div>${booking.seats.map((seat) => `<span class="badge">${seatLabel(seat)}</span>`).join(" ")}</div>
                  </article>
                `;
              })
              .join("") || `<div class="empty">Non hai ancora prenotazioni.</div>`
          }
        </div>
      </section>
    `;
  }

  function renderAccount() {
    const user = currentUser();
    return `
      <div class="topbar">
        <div>
          <h1>Account</h1>
          <p>Gestisci la password del tuo profilo.</p>
        </div>
      </div>
      <section class="grid">
        <form class="panel" data-form="password">
          <h2>Cambia password</h2>
          <div class="summary">
            <div class="summary-row"><span>Nome</span><strong>${escapeHtml(user.name)}</strong></div>
            <div class="summary-row"><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
            <div class="summary-row"><span>Ruolo</span><strong>${user.role === "admin" ? "Amministratore" : "Utente"}</strong></div>
          </div>
          <label>Password attuale<input name="currentPassword" type="password" required autocomplete="current-password" /></label>
          <label>Nuova password<input name="newPassword" type="password" minlength="6" required autocomplete="new-password" /></label>
          <label>Conferma nuova password<input name="confirmPassword" type="password" minlength="6" required autocomplete="new-password" /></label>
          <button type="submit">Aggiorna password</button>
        </form>
        <div class="panel">
          <h2>Sicurezza</h2>
          <div class="notice">Le credenziali sono salvate nel browser, coerentemente con la scelta senza database server.</div>
        </div>
      </section>
    `;
  }

  function renderUsers() {
    const rows = state.users
      .map((user) => {
        const bookingCount = state.bookings.filter((booking) => booking.userId === user.id).length;
        const isCurrent = user.id === state.currentUserId;
        return `
          <tr>
            <td>
              <strong>${escapeHtml(user.name)}</strong>
              <span>${escapeHtml(user.email)}</span>
            </td>
            <td>
              <select data-user-role="${user.id}" ${isCurrent ? "disabled" : ""}>
                <option value="user" ${user.role === "user" ? "selected" : ""}>Utente</option>
                <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
              </select>
            </td>
            <td>${bookingCount}</td>
            <td>
              <form class="inline-form" data-form="admin-password" data-user-id="${user.id}">
                <input name="password" type="password" minlength="6" required placeholder="Nuova password" autocomplete="new-password" />
                <button type="submit" class="secondary">Reset</button>
              </form>
            </td>
            <td>
              <button class="danger" data-delete-user="${user.id}" ${isCurrent ? "disabled" : ""}>Elimina</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="topbar">
        <div>
          <h1>Utenti</h1>
          <p>Crea account, assegna ruoli e resetta le password.</p>
        </div>
      </div>
      <section class="grid">
        <form class="panel" data-form="admin-user">
          <h2>Nuovo utente</h2>
          <div class="form-grid">
            <label class="full">Nome<input name="name" required autocomplete="name" /></label>
            <label class="full">Email<input name="email" type="email" required autocomplete="email" /></label>
            <label>Password<input name="password" type="password" minlength="6" required autocomplete="new-password" /></label>
            <label>Ruolo
              <select name="role" required>
                <option value="user">Utente</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <button type="submit">Crea utente</button>
        </form>
        <div class="panel">
          <h2>Account registrati</h2>
          <div class="table-wrap">
            <table class="user-table">
              <thead>
                <tr>
                  <th>Utente</th>
                  <th>Ruolo</th>
                  <th>Prenotazioni</th>
                  <th>Password</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function bindCommon() {
    app.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeView = button.dataset.view;
        state.selectedSeats = [];
        saveState();
        render();
      });
    });

    app.querySelector("[data-action='logout']")?.addEventListener("click", () => {
      state.currentUserId = null;
      state.selectedSeats = [];
      saveState();
      render();
    });

    app.querySelector("[data-form='theater']")?.addEventListener("submit", createTheater);
    app.querySelector("[data-form='theater-edit']")?.addEventListener("submit", updateTheater);
    app.querySelector("[data-form='event']")?.addEventListener("submit", createEvent);
    app.querySelector("[data-form='password']")?.addEventListener("submit", changePassword);
    app.querySelector("[data-form='admin-user']")?.addEventListener("submit", createUserByAdmin);
    app.querySelectorAll("[data-form='admin-password']").forEach((form) => {
      form.addEventListener("submit", resetUserPassword);
    });
    app.querySelectorAll("[data-user-role]").forEach((select) => {
      select.addEventListener("change", () => updateUserRole(select.dataset.userRole, select.value));
    });
    app.querySelector("[data-event-picker]")?.addEventListener("change", (event) => {
      state.selectedEventId = event.target.value;
      state.selectedSeats = [];
      saveState();
      render();
    });

    app.querySelectorAll("[data-seat]").forEach((seatButton) => {
      seatButton.addEventListener("click", () => toggleSeat(seatButton.dataset.seat));
    });

    app.querySelector("[data-action='clear-selection']")?.addEventListener("click", () => {
      state.selectedSeats = [];
      render();
    });

    app.querySelector("[data-action='confirm-booking']")?.addEventListener("click", confirmBooking);
    app.querySelector("[data-action='print-bookings']")?.addEventListener("click", () => window.print());

    app.querySelectorAll("[data-open-event]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedEventId = button.dataset.openEvent;
        state.selectedSeats = [];
        state.activeView = "bookings";
        saveState();
        render();
      });
    });

    app.querySelectorAll("[data-delete-theater]").forEach((button) => {
      button.addEventListener("click", () => deleteTheater(button.dataset.deleteTheater));
    });

    app.querySelectorAll("[data-edit-theater]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingTheaterId = button.dataset.editTheater;
        render();
      });
    });

    app.querySelector("[data-action='cancel-theater-edit']")?.addEventListener("click", () => {
      state.editingTheaterId = null;
      render();
    });

    app.querySelectorAll("[data-delete-event]").forEach((button) => {
      button.addEventListener("click", () => deleteEvent(button.dataset.deleteEvent));
    });

    app.querySelectorAll("[data-floorplan-upload]").forEach((input) => {
      input.addEventListener("change", () => updateFloorPlan(input.dataset.floorplanUpload, input.files?.[0]));
    });

    app.querySelectorAll("[data-open-floorplan]").forEach((button) => {
      button.addEventListener("click", () => openFloorPlan(button.dataset.openFloorplan));
    });

    app.querySelectorAll("[data-remove-floorplan]").forEach((button) => {
      button.addEventListener("click", () => removeFloorPlan(button.dataset.removeFloorplan));
    });

    app.querySelectorAll("[data-delete-user]").forEach((button) => {
      button.addEventListener("click", () => deleteUser(button.dataset.deleteUser));
    });
  }

  async function createTheater(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const floorPlanFile = form.get("floorPlanImage");
    state.theaters.push({
      id: uid(),
      name: String(form.get("name")).trim(),
      city: String(form.get("city")).trim(),
      rows: Number(form.get("rows")),
      seatsPerRow: Number(form.get("seatsPerRow")),
      floorPlanImage: floorPlanFile instanceof File && floorPlanFile.size ? await readImageFile(floorPlanFile) : ""
    });
    saveState();
    render();
  }

  async function updateTheater(event) {
    event.preventDefault();
    const theater = theaterById(event.currentTarget.dataset.theaterId);
    if (!theater) return;

    const form = new FormData(event.currentTarget);
    const usedByEvents = state.events.some((item) => item.theaterId === theater.id);
    const floorPlanFile = form.get("floorPlanImage");

    theater.name = String(form.get("name")).trim();
    theater.city = String(form.get("city")).trim();
    if (!usedByEvents) {
      theater.rows = Number(form.get("rows"));
      theater.seatsPerRow = Number(form.get("seatsPerRow"));
    }
    if (floorPlanFile instanceof File && floorPlanFile.size) {
      theater.floorPlanImage = await readImageFile(floorPlanFile);
    }

    state.editingTheaterId = null;
    saveState();
    render();
  }

  function createEvent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.events.push({
      id: uid(),
      title: String(form.get("title")).trim(),
      date: String(form.get("date")),
      theaterId: String(form.get("theaterId")),
      maxSeatsPerUser: Number(form.get("maxSeatsPerUser")),
      includedSeats: Number(form.get("includedSeats")),
      includedPrice: Number(form.get("includedPrice")),
      extraPrice: Number(form.get("extraPrice"))
    });
    saveState();
    render();
  }

  function changePassword(event) {
    event.preventDefault();
    const user = currentUser();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    const confirmPassword = String(form.get("confirmPassword"));

    if (user.password !== currentPassword) {
      alert("La password attuale non e valida.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("La nuova password e la conferma non coincidono.");
      return;
    }

    user.password = newPassword;
    saveState();
    event.currentTarget.reset();
    alert("Password aggiornata.");
  }

  function createUserByAdmin(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();

    if (state.users.some((user) => user.email === email)) {
      alert("Esiste gia un account con questa email.");
      return;
    }

    state.users.push({
      id: uid(),
      name: String(form.get("name")).trim(),
      email,
      password: String(form.get("password")),
      role: String(form.get("role")) === "admin" ? "admin" : "user"
    });
    saveState();
    render();
  }

  function resetUserPassword(event) {
    event.preventDefault();
    const user = state.users.find((item) => item.id === event.currentTarget.dataset.userId);
    if (!user) return;

    const form = new FormData(event.currentTarget);
    user.password = String(form.get("password"));
    saveState();
    event.currentTarget.reset();
    alert(`Password aggiornata per ${user.email}.`);
  }

  function updateUserRole(userId, role) {
    const user = state.users.find((item) => item.id === userId);
    if (!user || user.id === state.currentUserId) return;
    user.role = role === "admin" ? "admin" : "user";
    saveState();
    render();
  }

  function deleteUser(userId) {
    if (userId === state.currentUserId) return;
    const user = state.users.find((item) => item.id === userId);
    if (!user) return;

    const bookingCount = state.bookings.filter((booking) => booking.userId === userId).length;
    const message = bookingCount
      ? `Eliminare ${user.email} e le sue ${bookingCount} prenotazioni?`
      : `Eliminare ${user.email}?`;
    if (!confirm(message)) return;

    state.users = state.users.filter((item) => item.id !== userId);
    state.bookings = state.bookings.filter((booking) => booking.userId !== userId);
    saveState();
    render();
  }

  function toggleSeat(code) {
    const selected = new Set(state.selectedSeats);
    if (selected.has(code)) {
      selected.delete(code);
    } else {
      selected.add(code);
    }
    state.selectedSeats = [...selected].sort(sortSeats);
    render();
  }

  function confirmBooking() {
    const eventItem = eventById(state.selectedEventId);
    if (!eventItem || !state.selectedSeats.length) return;
    const userSeats = userSeatsForEvent(eventItem.id, state.currentUserId);
    if (userSeats.length + state.selectedSeats.length > Number(eventItem.maxSeatsPerUser)) {
      alert("La selezione supera il massimo posti per utente.");
      return;
    }
    state.bookings.push({
      id: uid(),
      userId: state.currentUserId,
      eventId: eventItem.id,
      seats: [...state.selectedSeats],
      total: bookingTotalForAdditional(eventItem, userSeats.length, state.selectedSeats.length),
      paidAt: new Date().toISOString()
    });
    state.selectedSeats = [];
    state.activeView = "my";
    saveState();
    render();
  }

  function deleteTheater(id) {
    if (state.events.some((event) => event.theaterId === id)) return;
    state.theaters = state.theaters.filter((theater) => theater.id !== id);
    if (state.editingTheaterId === id) state.editingTheaterId = null;
    saveState();
    render();
  }

  async function updateFloorPlan(theaterId, file) {
    const theater = theaterById(theaterId);
    if (!theater || !file) return;
    theater.floorPlanImage = await readImageFile(file);
    saveState();
    render();
  }

  function removeFloorPlan(theaterId) {
    const theater = theaterById(theaterId);
    if (!theater) return;
    theater.floorPlanImage = "";
    saveState();
    render();
  }

  function openFloorPlan(theaterId) {
    const theater = theaterById(theaterId);
    if (!theater?.floorPlanImage) return;

    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Piantina teatro">
        <div class="modal-head">
          <h2>Piantina ${escapeHtml(theater.name)}</h2>
          <button class="secondary" data-close-modal>Chiudi</button>
        </div>
        <img class="floorplan-full" src="${theater.floorPlanImage}" alt="Piantina ${escapeHtml(theater.name)}" />
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector("[data-close-modal]").addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
  }

  function deleteEvent(id) {
    state.events = state.events.filter((event) => event.id !== id);
    state.bookings = state.bookings.filter((booking) => booking.eventId !== id);
    if (state.selectedEventId === id) state.selectedEventId = state.events[0]?.id || null;
    state.selectedSeats = [];
    saveState();
    render();
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Il file selezionato non e un'immagine."));
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    }).catch((error) => {
      alert(error.message || "Impossibile caricare l'immagine.");
      return "";
    });
  }

  function sortSeats(a, b) {
    const [aRow, aSeat] = a.split("-").map(Number);
    const [bRow, bSeat] = b.split("-").map(Number);
    return aRow - bRow || aSeat - bSeat;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  render();
})();
