(async function () {
  const STORAGE_KEY = "prenotazioni-etoile-v1";
  const API_STATE_URL = "/api/state";
  let saveTimer = null;

  const initialState = {
    schemaVersion: 2,
    currentUserId: null,
    authMode: "login",
    activeView: "bookings",
    selectedEventId: null,
    editingTheaterId: null,
    editingEventId: null,
    showNewTheaterForm: false,
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
        sections: [
          {
            id: "platea",
            name: "Platea",
            rows: [
              { id: "p-a", label: "A", seats: 10 },
              { id: "p-b", label: "B", seats: 12 },
              { id: "p-c", label: "C", seats: 14 },
              { id: "p-d", label: "D", seats: 14 }
            ]
          },
          {
            id: "galleria",
            name: "Galleria",
            rows: [
              { id: "g-a", label: "A", seats: 8 },
              { id: "g-b", label: "B", seats: 10 }
            ]
          }
        ],
        floorPlanImage: ""
      }
    ],
    events: [],
    bookings: []
  };

  initialState.events.push({
    id: uid(),
    title: "Gala di danza contemporanea",
    description: "Evento dimostrativo per testare prenotazioni, approvazioni e stampa posti.",
    date: new Date().toISOString().slice(0, 10),
    theaterId: initialState.theaters[0].id,
    maxSeatsPerUser: 6,
    includedSeats: 2,
    includedPrice: 18,
    extraPrice: 28,
    approvalDays: 3,
    posterImage: ""
  });

  let state;
  const app = document.getElementById("app");

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  async function loadState() {
    const serverState = await loadServerState();
    if (serverState) return normalizeState(serverState);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return structuredClone(initialState);
    }
  }

  async function loadServerState() {
    try {
      const response = await fetch(API_STATE_URL);
      if (!response.ok || response.status === 204) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  function normalizeState(parsed) {
    return {
      ...structuredClone(initialState),
      ...parsed,
      theaters: (parsed.theaters || []).map(normalizeTheater),
      events: (parsed.events || []).map(normalizeEvent),
      bookings: Number(parsed.schemaVersion || 1) < 2 ? [] : parsed.bookings || [],
      schemaVersion: 2,
      selectedSeats: []
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveServerState, 250);
  }

  async function saveServerState() {
    try {
      await fetch(API_STATE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portableState())
      });
    } catch {
      // LocalStorage fallback remains available when the static file is opened without server APIs.
    }
  }

  function portableState() {
    return {
      ...state,
      selectedSeats: [],
      currentUserId: null,
      authMode: "login",
      activeView: "bookings",
      editingTheaterId: null,
      editingEventId: null,
      showNewTheaterForm: false,
      exportedAt: new Date().toISOString()
    };
  }

  function purgeExpiredBookings() {
    const before = state.bookings.length;
    state.bookings = state.bookings.filter((booking) => !isBookingExpired(booking));
    if (state.bookings.length !== before) saveState();
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

  function normalizeTheater(theater) {
    if (Array.isArray(theater.sections)) return theater;
    return {
      ...theater,
      sections: [
        {
          id: "platea",
          name: "Platea",
          rows: Array.from({ length: Number(theater.rows || 0) }, (_, index) => ({
            id: `p-${index + 1}`,
            label: String(index + 1),
            seats: Number(theater.seatsPerRow || 0)
          }))
        },
        {
          id: "galleria",
          name: "Galleria",
          rows: []
        }
      ]
    };
  }

  function normalizeEvent(eventItem) {
    return {
      description: "",
      posterImage: "",
      theaterId: "",
      approvalDays: 3,
      ...eventItem
    };
  }

  function userById(id) {
    return state.users.find((user) => user.id === id);
  }

  function approvalDaysForEvent(event) {
    return Math.max(1, Number(event?.approvalDays || 3));
  }

  function bookingStatus(booking) {
    return booking.status || "approved";
  }

  function bookingCreatedAt(booking) {
    return booking.createdAt || booking.paidAt || new Date().toISOString();
  }

  function bookingExpiresAt(booking) {
    const eventItem = eventById(booking.eventId);
    const expires = new Date(bookingCreatedAt(booking));
    expires.setDate(expires.getDate() + approvalDaysForEvent(eventItem));
    return expires;
  }

  function isBookingExpired(booking) {
    return bookingStatus(booking) === "pending" && bookingExpiresAt(booking).getTime() < Date.now();
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function seatsForTheater(theater) {
    return theater.sections.flatMap((section) =>
      section.rows.flatMap((row) =>
        Array.from({ length: Number(row.seats) }, (_, index) => seatCode(section.id, row.id, index + 1))
      )
    );
  }

  function seatCode(sectionId, rowId, seatNumber) {
    return `${sectionId}__${rowId}__${seatNumber}`;
  }

  function seatLabel(code, theater = null) {
    const [sectionId, rowId, seat] = code.split("__");
    if (!seat) {
      const [row, oldSeat] = code.split("-");
      return `Fila ${row}, posto ${oldSeat}`;
    }

    const section = theater?.sections?.find((item) => item.id === sectionId);
    const row = section?.rows?.find((item) => item.id === rowId);
    return `${section?.name || sectionId}, fila ${row?.label || rowId}, posto ${seat}`;
  }

  function theaterCapacity(theater) {
    return seatsForTheater(theater).length;
  }

  function sectionRowsToText(section) {
    return section?.rows.map((row) => `${row.label}:${row.seats}`).join("\n") || "";
  }

  function parseSectionRows(value, prefix) {
    return String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [labelPart, seatsPart] = line.includes(":") ? line.split(":") : [String(index + 1), line];
        const label = labelPart.trim() || String(index + 1);
        const seats = Math.max(0, Number(String(seatsPart).trim()));
        return {
          id: `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index + 1}`,
          label,
          seats
        };
      })
      .filter((row) => row.seats > 0);
  }

  function theaterSectionsFromForm(form) {
    return [
      {
        id: "platea",
        name: "Platea",
        rows: parseSectionRows(form.get("plateaRows"), "p")
      },
      {
        id: "galleria",
        name: "Galleria",
        rows: parseSectionRows(form.get("galleriaRows"), "g")
      }
    ];
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
    purgeExpiredBookings();

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
            ${user.role === "admin" ? navButton("approvals", "Approvazioni") : ""}
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
    if (state.activeView === "approvals" && currentUser()?.role === "admin") return renderApprovals();
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
    state.activeView = user.role === "admin" ? "events" : "bookings";
    saveState();
    render();
  }

  function renderTheaters() {
    const theaterOptions = state.theaters.map((theater) => theaterCard(theater)).join("");
    const editingTheater = state.theaters.find((theater) => theater.id === state.editingTheaterId) || null;
    const preview = editingTheater ? renderSeatMap(editingTheater, null, []) : `<div class="empty">Seleziona Modifica su un teatro per vedere l'anteprima posti.</div>`;
    return `
      <div class="topbar">
        <div>
          <h1>Teatri</h1>
          <p>Crea sale con matrice fila/posto e controlla la visualizzazione grafica.</p>
        </div>
        <button data-action="new-theater">Nuovo teatro</button>
      </div>
      <section class="list">${theaterOptions || `<div class="empty">Nessun teatro disponibile.</div>`}</section>
      <section class="grid">
        ${
          state.showNewTheaterForm
            ? `<form class="panel" data-form="theater">
          <h2>Nuovo teatro</h2>
          <div class="form-grid">
            <label class="full">Nome teatro<input name="name" required placeholder="Es. Teatro Civico" /></label>
            <label>Città<input name="city" required placeholder="Es. Roma" /></label>
            <label class="full">File Platea<textarea name="plateaRows" required rows="5">A:10
B:12
C:14</textarea></label>
            <label class="full">File Galleria<textarea name="galleriaRows" rows="4">A:8
B:10</textarea></label>
            <label class="full">Piantina teatro<input name="floorPlanImage" type="file" accept="image/*" /></label>
          </div>
          <div class="actions">
            <button type="submit">Crea teatro</button>
            <button type="button" class="secondary" data-action="cancel-new-theater">Annulla</button>
          </div>
        </form>`
            : ""
        }
        <div class="panel ${editingTheater ? "" : "hidden"}">
          <h2>Anteprima posti</h2>
          ${preview}
        </div>
        ${editingTheater ? renderTheaterEditPanel(editingTheater) : ""}
      </section>
    `;
  }

  function renderTheaterEditPanel(theater) {
    const usedByEvents = state.events.some((event) => event.theaterId === theater.id);
    const platea = theater.sections.find((section) => section.id === "platea");
    const galleria = theater.sections.find((section) => section.id === "galleria");
    return `
      <form class="panel theater-edit-panel" data-form="theater-edit" data-theater-id="${theater.id}">
        <h2>Modifica teatro</h2>
        <div class="form-grid">
          <label class="full">Nome teatro<input name="name" required value="${escapeHtml(theater.name)}" /></label>
          <label>Citta<input name="city" required value="${escapeHtml(theater.city)}" /></label>
          <label class="full">File Platea<textarea name="plateaRows" required rows="5" ${usedByEvents ? "readonly" : ""}>${escapeHtml(sectionRowsToText(platea))}</textarea></label>
          <label class="full">File Galleria<textarea name="galleriaRows" rows="4" ${usedByEvents ? "readonly" : ""}>${escapeHtml(sectionRowsToText(galleria))}</textarea></label>
          <label class="full">Carica nuova piantina<input name="floorPlanImage" type="file" accept="image/*" /></label>
        </div>
        ${usedByEvents ? `<div class="notice">La struttura dei posti non è modificabile per teatri già associati a eventi.</div>` : ""}
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
    const seats = theaterCapacity(theater);
    const sectionSummary = theater.sections
      .map((section) => `${section.name}: ${section.rows.length} file`)
      .join(" · ");
    const usedByEvents = state.events.some((event) => event.theaterId === theater.id);
    return `
      <article class="card">
        <h3>${escapeHtml(theater.name)}</h3>
        <div class="meta">
          <span>${escapeHtml(theater.city)}</span>
          <span>${sectionSummary}</span>
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
    const editingEvent = state.events.find((eventItem) => eventItem.id === state.editingEventId) || null;
    return `
      <div class="topbar">
        <div>
          <h1>Eventi</h1>
          <p>Associa ogni evento a un teatro e definisci limiti e prezzi dei posti.</p>
        </div>
      </div>
      <section class="grid">
        ${editingEvent ? renderEventForm(editingEvent) : renderEventForm()}
        <div class="panel">
          <h2>Eventi creati</h2>
          <div class="list">${state.events.map(eventCard).join("") || `<div class="empty">Nessun evento disponibile.</div>`}</div>
        </div>
      </section>
    `;
  }

  function renderEventForm(eventItem = null) {
    const isEditing = Boolean(eventItem);
    return `
      <form class="panel" data-form="${isEditing ? "event-edit" : "event"}" ${isEditing ? `data-event-id="${eventItem.id}"` : ""}>
        <h2>${isEditing ? "Modifica evento" : "Nuovo evento"}</h2>
        <div class="form-grid">
          <label class="full">Titolo<input name="title" required placeholder="Es. Saggio classico" value="${escapeHtml(eventItem?.title || "")}" /></label>
          <label>Data<input name="date" type="date" required value="${escapeHtml(eventItem?.date || "")}" /></label>
          <label>Teatro<select name="theaterId">${optionalTheaterSelectOptions(eventItem?.theaterId || "")}</select></label>
          <label>Massimo posti per utente<input name="maxSeatsPerUser" type="number" min="1" value="${escapeHtml(eventItem?.maxSeatsPerUser || 6)}" required /></label>
          <label>Giorni per approvazione<input name="approvalDays" type="number" min="1" value="${escapeHtml(eventItem?.approvalDays || 3)}" required /></label>
          <label>Posti a prezzo base<input name="includedSeats" type="number" min="0" value="${escapeHtml(eventItem?.includedSeats || 2)}" required /></label>
          <label>Prezzo base per posto<input name="includedPrice" type="number" min="0" step="0.01" value="${escapeHtml(eventItem?.includedPrice || 18)}" required /></label>
          <label>Prezzo aggiuntivo per posto<input name="extraPrice" type="number" min="0" step="0.01" value="${escapeHtml(eventItem?.extraPrice || 28)}" required /></label>
          <label class="full">Descrizione<textarea name="description" rows="4" placeholder="Descrizione dell'evento">${escapeHtml(eventItem?.description || "")}</textarea></label>
          <label class="full">Locandina evento<input name="posterImage" type="file" accept="image/*" /></label>
        </div>
        ${eventItem?.posterImage ? `<img class="event-poster-thumb" src="${eventItem.posterImage}" alt="Locandina ${escapeHtml(eventItem.title)}" />` : ""}
        <div class="actions">
          <button type="submit">${isEditing ? "Salva modifiche" : "Crea evento"}</button>
          ${isEditing ? `<button type="button" class="secondary" data-action="cancel-event-edit">Annulla</button>` : ""}
        </div>
      </form>
    `;
  }

  function eventCard(eventItem) {
    const theater = theaterById(eventItem.theaterId);
    const reserved = reservedSeats(eventItem.id).length;
    const capacity = theater ? theaterCapacity(theater) : 0;
    return `
      <article class="card">
        <h3>${escapeHtml(eventItem.title)}</h3>
        <div class="meta">
          <span>${escapeHtml(eventItem.date)}</span>
          <span>${theater ? escapeHtml(theater.name) : "Senza teatro"}</span>
          <span>${theater ? `${reserved}/${capacity} prenotati` : "Solo consultazione"}</span>
          <span>Max ${eventItem.maxSeatsPerUser} per utente</span>
          <span>Approvazione entro ${approvalDaysForEvent(eventItem)} giorni</span>
        </div>
        <div class="meta">
          <span>${eventItem.includedSeats} posti a ${money(eventItem.includedPrice)}</span>
          <span>extra ${money(eventItem.extraPrice)}</span>
        </div>
        ${eventItem.posterImage ? `<img class="event-poster-thumb" src="${eventItem.posterImage}" alt="Locandina ${escapeHtml(eventItem.title)}" />` : ""}
        ${eventItem.description ? `<p class="card-text">${escapeHtml(eventItem.description)}</p>` : ""}
        <div class="actions">
          <button class="secondary" data-open-event="${eventItem.id}">Apri prenotazioni</button>
          <button class="secondary" data-edit-event="${eventItem.id}">Modifica</button>
          <button class="danger" data-delete-event="${eventItem.id}">Elimina</button>
        </div>
      </article>
    `;
  }

  function theaterSelectOptions() {
    return state.theaters.map((theater) => `<option value="${theater.id}">${escapeHtml(theater.name)} · ${escapeHtml(theater.city)}</option>`).join("");
  }

  function optionalTheaterSelectOptions(selectedId = "") {
    const emptyOption = `<option value="" ${selectedId ? "" : "selected"}>Nessun teatro</option>`;
    return emptyOption + state.theaters.map((theater) => `<option value="${theater.id}" ${theater.id === selectedId ? "selected" : ""}>${escapeHtml(theater.name)} - ${escapeHtml(theater.city)}</option>`).join("");
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
        selectedEvent
          ? `
            <section class="grid">
              <div class="panel">
                <h2>Scelta evento</h2>
                <label>Evento<select data-event-picker>${eventSelect}</select></label>
                ${selectedEvent.posterImage ? `<img class="event-poster-thumb" src="${selectedEvent.posterImage}" alt="Locandina ${escapeHtml(selectedEvent.title)}" />` : ""}
                ${selectedEvent.description ? `<p class="card-text">${escapeHtml(selectedEvent.description)}</p>` : ""}
                <div class="summary">
                  <div class="summary-row"><span>Teatro</span><strong>${theater ? escapeHtml(theater.name) : "Non associato"}</strong></div>
                  <div class="summary-row"><span>Limite per utente</span><strong>${selectedEvent.maxSeatsPerUser}</strong></div>
                  <div class="summary-row"><span>Posti già tuoi</span><strong>${userSeats.length}</strong></div>
                  <div class="summary-row"><span>Nuova selezione</span><strong>${state.selectedSeats.length}</strong></div>
                  <div class="summary-row"><span>Totale da pagare</span><strong>${money(total)}</strong></div>
                  <div class="summary-row"><span>Approvazione entro</span><strong>${approvalDaysForEvent(selectedEvent)} giorni</strong></div>
                </div>
                ${theater ? "" : `<div class="notice">Questo evento non è associato a un teatro: puoi consultare i dati, ma non prenotare posti.</div>`}
                <div class="notice">Dopo il pagamento la prenotazione resta in attesa finché l'amministratore la approva.</div>
                <div class="notice ${nextCount <= Number(selectedEvent.maxSeatsPerUser) ? "hidden" : ""}">
                  Hai superato il massimo configurato per questo evento.
                </div>
                <div class="actions">
                  <button class="secondary" data-open-floorplan="${theater?.id || ""}" ${theater?.floorPlanImage ? "" : "disabled"}>Apri piantina</button>
                  <button data-action="confirm-booking" ${theater && state.selectedSeats.length && nextCount <= Number(selectedEvent.maxSeatsPerUser) ? "" : "disabled"}>Paga e prenota</button>
                  <button class="secondary" data-action="clear-selection">Annulla selezione</button>
                </div>
              </div>
              <div class="panel ${theater ? "" : "hidden"}">
                <h2>Mappa posti</h2>
                ${theater ? renderSeatMap(theater, selectedEvent, state.selectedSeats) : ""}
              </div>
            </section>
          `
          : `<div class="empty">Crea almeno un evento per iniziare.</div>`
      }
    `;
  }

  function renderSeatMap(theater, eventItem, selectedSeats) {
    const taken = eventItem ? reservedSeats(eventItem.id) : [];
    const mine = eventItem ? userSeatsForEvent(eventItem.id, state.currentUserId) : [];
    const sections = theater.sections
      .map((section) => {
        const maxSeats = Math.max(1, ...section.rows.map((row) => Number(row.seats)));
        const sectionWidth = maxSeats * 34 + (maxSeats - 1) * 7;
        const rows = section.rows
          .map((row) => {
            const seats = Array.from({ length: Number(row.seats) }, (_, index) => {
              const code = seatCode(section.id, row.id, index + 1);
              const isTaken = taken.includes(code);
              const isMine = mine.includes(code);
              const isSelected = selectedSeats.includes(code);
              const classes = ["seat", isTaken ? "taken" : "", isMine ? "mine" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
              return `<button class="${classes}" data-seat="${code}" ${isTaken || !eventItem ? "disabled" : ""} title="${seatLabel(code, theater)}">${index + 1}</button>`;
            }).join("");
            return `<div class="seat-row"><span class="row-label">${escapeHtml(row.label)}</span><div class="seat-row-seats" style="--cols:${row.seats}; --section-width:${sectionWidth}px">${seats}</div></div>`;
          })
          .join("");
        return `<section class="seat-section"><h3>${escapeHtml(section.name)}</h3>${rows || `<div class="empty">Nessuna fila configurata.</div>`}</section>`;
      })
      .join("");
    return `<div class="stage">Palco</div><div class="seat-map-wrap"><div class="seat-map">${sections}</div></div>`;
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
                const status = bookingStatus(booking);
                return `
                  <article class="card">
                    <h3>${eventItem ? escapeHtml(eventItem.title) : "Evento eliminato"}</h3>
                    <div class="meta">
                      <span>${eventItem ? escapeHtml(eventItem.date) : ""}</span>
                      <span>${theater ? escapeHtml(theater.name) : ""}</span>
                      <span>${booking.seats.length} posti</span>
                      <span>${money(booking.total)}</span>
                      <span>${status === "approved" ? "Approvata" : `In attesa fino al ${formatDateTime(bookingExpiresAt(booking))}`}</span>
                    </div>
                    <div>${booking.seats.map((seat) => `<span class="badge">${seatLabel(seat, theater)}</span>`).join(" ")}</div>
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
          <h2>Dati applicazione</h2>
          <div class="notice">I dati sono salvati nel browser. Esporta un file JSON per trasferirli e importalo su una nuova installazione.</div>
          ${
            user.role === "admin"
              ? `<div class="actions">
                  <button data-action="export-data" type="button">Esporta JSON</button>
                  <label class="upload-button">Importa JSON<input data-data-import type="file" accept="application/json,.json" /></label>
                </div>`
              : ""
          }
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

  function renderApprovals() {
    const rows = state.bookings
      .map((booking) => {
        const user = userById(booking.userId);
        const eventItem = eventById(booking.eventId);
        const theater = eventItem ? theaterById(eventItem.theaterId) : null;
        const status = bookingStatus(booking);
        return `
          <tr>
            <td>
              <strong>${user ? escapeHtml(user.name) : "Utente eliminato"}</strong>
              <span>${user ? escapeHtml(user.email) : ""}</span>
            </td>
            <td>
              <strong>${eventItem ? escapeHtml(eventItem.title) : "Evento eliminato"}</strong>
              <span>${eventItem ? escapeHtml(eventItem.date) : ""}${theater ? ` · ${escapeHtml(theater.name)}` : ""}</span>
            </td>
            <td>${booking.seats.map((seat) => `<span class="badge">${seatLabel(seat, theater)}</span>`).join(" ")}</td>
            <td>${money(booking.total)}</td>
            <td>
              <span class="badge ${status === "approved" ? "ok" : "warn"}">${status === "approved" ? "Approvata" : "In attesa"}</span>
              <span>${status === "approved" ? formatDateTime(booking.approvedAt || booking.paidAt || bookingCreatedAt(booking)) : `Scade ${formatDateTime(bookingExpiresAt(booking))}`}</span>
            </td>
            <td>
              <div class="actions compact-actions">
                <button data-approve-booking="${booking.id}" ${status === "approved" ? "disabled" : ""}>Approva</button>
                <button class="danger" data-delete-booking="${booking.id}">Elimina</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    const pendingCount = state.bookings.filter((booking) => bookingStatus(booking) === "pending").length;
    const approvedCount = state.bookings.filter((booking) => bookingStatus(booking) === "approved").length;

    return `
      <div class="topbar">
        <div>
          <h1>Approvazioni</h1>
          <p>Controlla le prenotazioni per utente e approva quelle in attesa.</p>
        </div>
      </div>
      <section class="panel">
        <div class="summary">
          <div class="summary-row"><span>In attesa</span><strong>${pendingCount}</strong></div>
          <div class="summary-row"><span>Approvate</span><strong>${approvedCount}</strong></div>
        </div>
        <div class="table-wrap">
          <table class="user-table">
            <thead>
              <tr>
                <th>Utente</th>
                <th>Evento</th>
                <th>Posti</th>
                <th>Totale</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6">Nessuna prenotazione presente.</td></tr>`}</tbody>
          </table>
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
    app.querySelector("[data-form='event-edit']")?.addEventListener("submit", updateEvent);
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
    app.querySelector("[data-action='export-data']")?.addEventListener("click", exportData);
    app.querySelector("[data-data-import]")?.addEventListener("change", (event) => importData(event.target.files?.[0]));

    app.querySelectorAll("[data-open-event]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedEventId = button.dataset.openEvent;
        state.selectedSeats = [];
        state.activeView = "bookings";
        saveState();
        render();
      });
    });

    app.querySelectorAll("[data-edit-event]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingEventId = button.dataset.editEvent;
        render();
      });
    });

    app.querySelector("[data-action='cancel-event-edit']")?.addEventListener("click", () => {
      state.editingEventId = null;
      render();
    });

    app.querySelectorAll("[data-delete-theater]").forEach((button) => {
      button.addEventListener("click", () => deleteTheater(button.dataset.deleteTheater));
    });

    app.querySelectorAll("[data-edit-theater]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingTheaterId = button.dataset.editTheater;
        state.showNewTheaterForm = false;
        render();
      });
    });

    app.querySelector("[data-action='new-theater']")?.addEventListener("click", () => {
      state.showNewTheaterForm = true;
      state.editingTheaterId = null;
      render();
    });

    app.querySelector("[data-action='cancel-new-theater']")?.addEventListener("click", () => {
      state.showNewTheaterForm = false;
      render();
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

    app.querySelectorAll("[data-approve-booking]").forEach((button) => {
      button.addEventListener("click", () => approveBooking(button.dataset.approveBooking));
    });

    app.querySelectorAll("[data-delete-booking]").forEach((button) => {
      button.addEventListener("click", () => deleteBooking(button.dataset.deleteBooking));
    });
  }

  async function createTheater(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const floorPlanFile = form.get("floorPlanImage");
    const sections = theaterSectionsFromForm(form);
    if (!sections.some((section) => section.rows.length)) {
      alert("Inserisci almeno una fila con posti in Platea o Galleria.");
      return;
    }
    state.theaters.push({
      id: existing.id || uid(),
      name: String(form.get("name")).trim(),
      city: String(form.get("city")).trim(),
      sections,
      floorPlanImage: floorPlanFile instanceof File && floorPlanFile.size ? await readImageFile(floorPlanFile) : ""
    });
    state.showNewTheaterForm = false;
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
      const sections = theaterSectionsFromForm(form);
      if (!sections.some((section) => section.rows.length)) {
        alert("Inserisci almeno una fila con posti in Platea o Galleria.");
        return;
      }
      theater.sections = sections;
    }
    if (floorPlanFile instanceof File && floorPlanFile.size) {
      theater.floorPlanImage = await readImageFile(floorPlanFile);
    }

    state.editingTheaterId = null;
    saveState();
    render();
  }

  async function createEvent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.events.push(await eventDataFromForm(form, { id: uid() }));
    saveState();
    render();
  }

  async function updateEvent(event) {
    event.preventDefault();
    const eventItem = eventById(event.currentTarget.dataset.eventId);
    if (!eventItem) return;

    Object.assign(eventItem, await eventDataFromForm(new FormData(event.currentTarget), eventItem));
    state.editingEventId = null;
    saveState();
    render();
  }

  async function eventDataFromForm(form, existing = {}) {
    const posterFile = form.get("posterImage");
    return {
      ...existing,
      id: existing.id || uid(),
      title: String(form.get("title")).trim(),
      description: String(form.get("description")).trim(),
      date: String(form.get("date")),
      theaterId: String(form.get("theaterId") || ""),
      maxSeatsPerUser: Number(form.get("maxSeatsPerUser")),
      approvalDays: Number(form.get("approvalDays")),
      includedSeats: Number(form.get("includedSeats")),
      includedPrice: Number(form.get("includedPrice")),
      extraPrice: Number(form.get("extraPrice")),
      posterImage: posterFile instanceof File && posterFile.size ? await readImageFile(posterFile) : existing.posterImage || ""
    };
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
    if (!theaterById(eventItem.theaterId)) return;
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
      status: "pending",
      createdAt: new Date().toISOString(),
      approvedAt: null,
      paidAt: new Date().toISOString()
    });
    state.selectedSeats = [];
    state.activeView = "my";
    saveState();
    render();
  }

  function approveBooking(bookingId) {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    booking.status = "approved";
    booking.approvedAt = new Date().toISOString();
    saveState();
    render();
  }

  function deleteBooking(bookingId) {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    const user = userById(booking.userId);
    const eventItem = eventById(booking.eventId);
    const label = `${user?.email || "utente"} - ${eventItem?.title || "evento"}`;
    if (!confirm(`Eliminare la prenotazione ${label}?`)) return;

    state.bookings = state.bookings.filter((item) => item.id !== bookingId);
    saveState();
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(portableState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prenotazioni-etoile-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    if (!file) return;
    try {
      const imported = JSON.parse(await readTextFile(file));
      if (!Array.isArray(imported.users) || !Array.isArray(imported.theaters) || !Array.isArray(imported.events)) {
        throw new Error("File dati non valido.");
      }

      state = {
        ...structuredClone(initialState),
        ...imported,
        theaters: imported.theaters.map(normalizeTheater),
        events: imported.events.map(normalizeEvent),
        bookings: Array.isArray(imported.bookings) ? imported.bookings : [],
        currentUserId: null,
        activeView: "bookings",
        selectedSeats: [],
        editingTheaterId: null,
        editingEventId: null,
        showNewTheaterForm: false,
        schemaVersion: 2
      };
      saveState();
      alert("Dati importati. Effettua nuovamente l'accesso.");
      render();
    } catch (error) {
      alert(error.message || "Impossibile importare il file JSON.");
    }
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

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file);
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

  state = await loadState();
  saveState();
  render();
})();
