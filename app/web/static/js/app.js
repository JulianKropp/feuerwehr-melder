document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const views = {
        dashboard: document.getElementById('dashboard-view'),
        incidents: document.getElementById('incidents-view'),
        vehicles: document.getElementById('vehicles-view'),
        options: document.getElementById('options-view'),
    };
    const buttons = {
        dashboard: document.getElementById('dashboard-btn'),
        incidents: document.getElementById('incidents-btn'),
        vehicles: document.getElementById('vehicles-btn'),
        options: document.getElementById('options-btn'),
        createIncident: document.getElementById('create-incident-btn'),
        createVehicle: document.getElementById('create-vehicle-btn'),
        testAlarm: document.getElementById('test-alarm-btn'),
        loginLogout: document.getElementById('login-logout-btn'),
    };
    const clockElement = document.getElementById('clock');
    const weatherElement = document.getElementById('weather');
    const incidentsList = document.getElementById('incidents-list');
    const vehiclesList = document.getElementById('vehicles-list');
    const dashboardEmpty = document.getElementById('dashboard-empty');
    const mapContainer = document.getElementById('map');
    const incidentModal = document.getElementById('incident-modal');
    const vehicleModal = document.getElementById('vehicle-modal');
    const loginModal = document.getElementById('login-modal');
    const incidentForm = document.getElementById('incident-form');
    const vehicleForm = document.getElementById('vehicle-form');
    const loginForm = document.getElementById('login-form');
    const options = {
        audioEnable: document.getElementById('audio-enable'),
        speechEnable: document.getElementById('speech-enable'),
        alarmSoundSelect: document.getElementById('alarm-sound-select'),
        speechLanguageSelect: document.getElementById('speech-language-select'),
        weatherLocationInput: document.getElementById('weather-location'),
    };
    const incidentVehiclesBox = document.getElementById('incident-vehicles');

    // --- State ---
    let state = {
        incidents: [],
        vehicles: [],
        settings: {
            audioEnabled: true,
            speechEnabled: true,
            alarmSound: 'gong1.mp3',
        },
        auth: {
            isAuthenticated: false,
            token: null,
        },
        // Track WebSocket connectivity for diagnostics/fallbacks
        wsConnected: false,
    };

    // --- Navigation & UI ---
    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.add('hidden'));
        if (views[viewName]) views[viewName].classList.remove('hidden');
    }

    // Listen to client-side route changes and switch views accordingly
    window.addEventListener('route-changed', (e) => {
        const { view } = e.detail || {};
        if (view) {
            showView(view);
        }
    });

    function updateAdminUI() {
        const adminElements = document.querySelectorAll('.item-actions, #create-incident-btn, #create-vehicle-btn');
        if (state.auth.isAuthenticated) {
            buttons.loginLogout.textContent = 'Logout';
            adminElements.forEach(el => el.style.display = 'flex');
        } else {
            buttons.loginLogout.textContent = 'Login';
            adminElements.forEach(el => el.style.display = 'none');
        }
    }

    // --- Clock ---
    function updateClock() {
        clockElement.textContent = new Date().toLocaleTimeString('de-DE');
    }
    setInterval(updateClock, 1000);

    // --- Weather (Options-configurable) ---
    function weatherCodeToTextDe(code) {
        const map = {
            0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bewölkt',
            45: 'Nebel', 48: 'Reifnebel', 51: 'Nieselregen leicht', 53: 'Nieselregen', 55: 'Nieselregen stark',
            56: 'Gefr. Nieselregen leicht', 57: 'Gefr. Nieselregen stark',
            61: 'Regen leicht', 63: 'Regen', 65: 'Regen stark',
            66: 'Gefr. Regen leicht', 67: 'Gefr. Regen stark',
            71: 'Schnee leicht', 73: 'Schnee', 75: 'Schnee stark', 77: 'Schneekörner',
            80: 'Regenschauer leicht', 81: 'Regenschauer', 82: 'Regenschauer stark',
            85: 'Schneeschauer leicht', 86: 'Schneeschauer stark',
            95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit starkem Hagel'
        };
        return map[code] || 'Wetter';
    }

    async function geocodeLocation(q) {
        if (!q || !q.trim()) return null;
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
        } catch (e) { console.warn('weather geocode failed', e); }
        return null;
    }

    async function fetchWeatherFor(locationStr) {
        if (!weatherElement) return;
        const loc = (locationStr || 'Frankfurt am Main').trim();
        // If nothing configured, still show Frankfurt by default
        if (!loc) { weatherElement.textContent = ''; return; }
        let lat = null, lon = null;
        try {
            const coords = await geocodeLocation(loc);
            if (!coords) { weatherElement.textContent = `Wetter ${loc}: —`; return; }
            lat = coords.lat; lon = coords.lon;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('weather http ' + resp.status);
            const data = await resp.json();
            const cur = data && data.current ? data.current : null;
            if (!cur) { weatherElement.textContent = `Wetter ${loc}: —`; return; }
            const temp = Math.round(cur.temperature_2m);
            const text = weatherCodeToTextDe(cur.weather_code);
            weatherElement.textContent = `Wetter ${loc}: ${temp}°C, ${text}`;
        } catch (e) {
            weatherElement.textContent = `Wetter ${loc}: —`;
            console.warn('Weather fetch failed:', e);
        }
    }

    // Start periodic weather refresh
    function startWeatherLoop() {
        fetchWeatherFor(state.settings.weather_location || 'Frankfurt am Main');
        setInterval(() => {
            fetchWeatherFor(state.settings.weather_location || 'Frankfurt am Main');
        }, 60000);
    }

    // --- Alarm & Speech ---
    // Web Speech API helpers
    let voices = [];
    let voicesLoaded = false;
    function loadVoices() {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) return resolve([]);
            const list = window.speechSynthesis.getVoices();
            if (list && list.length > 0) {
                voices = list;
                voicesLoaded = true;
                console.log('[TTS] Voices loaded immediately:', voices.map(v => `${v.name}(${v.lang})`));
                resolve(voices);
            } else {
                window.speechSynthesis.onvoiceschanged = () => {
                    voices = window.speechSynthesis.getVoices();
                    voicesLoaded = true;
                    console.log('[TTS] Voices loaded via onvoiceschanged:', voices.map(v => `${v.name}(${v.lang})`));
                    resolve(voices);
                };
            }
        });
    }
    function pickVoiceForLang(lang) {
        if (!voicesLoaded || !voices) return null;
        if (!lang) return null;
        const exact = voices.find(v => v.lang === lang);
        if (exact) return exact;
        const prefix = lang.split('-')[0];
        const partial = voices.find(v => (v.lang || '').toLowerCase().startsWith(prefix.toLowerCase()));
        return partial || null;
    }
    function speakText(text, lang) {
        if (!text) return;
        if (!('speechSynthesis' in window)) return;
        // Cancel any queued speech to avoid overlaps
        try { window.speechSynthesis.cancel(); } catch (e) { console.warn('[TTS] cancel error:', e); }
        try { window.speechSynthesis.resume(); } catch (e) { console.warn('[TTS] resume before speak error:', e); }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang || 'de-DE';
        const v = pickVoiceForLang(utterance.lang);
        if (v) utterance.voice = v;
        console.log('[TTS] Speaking with', { lang: utterance.lang, voice: v ? `${v.name}(${v.lang})` : 'default' });
        utterance.onstart = () => console.log('[TTS] onstart');
        utterance.onend = () => console.log('[TTS] onend');
        utterance.onerror = (e) => console.error('[TTS] onerror', e);
        // Tiny delay helps in some browsers after cancel/resume
        setTimeout(() => {
            try {
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.error('[TTS] speak threw:', e);
            }
        }, 0);
    }
    // Some browsers require a user gesture before media (TTS/audio) works reliably
    let speechUnlocked = false;
    let pendingSpeakText = null;
    function unlockSpeech() {
        try { window.speechSynthesis.resume(); } catch (e) { console.warn('[TTS] resume error:', e); }
        console.log('[TTS] Unlocked by user gesture');
        speechUnlocked = true;
        // Warm-up: queue and immediately cancel a short utterance to initialize voices
        try {
            const warm = new SpeechSynthesisUtterance('');
            window.speechSynthesis.speak(warm);
            window.speechSynthesis.cancel();
        } catch (e) { console.warn('[TTS] warm-up error:', e); }
        // Flush any pending speak request
        if (pendingSpeakText) {
            const text = pendingSpeakText;
            pendingSpeakText = null;
            console.log('[TTS] Flushing pending speak after unlock');
            loadVoices().then(() => speakText(text, state.settings.speechLanguage || 'de-DE'));
        }
        // Hide permission banner if present
        const banner = document.getElementById('media-permission');
        if (banner) banner.classList.add('hidden');
    }
    window.addEventListener('click', unlockSpeech, { once: true });
    window.addEventListener('keydown', unlockSpeech, { once: true });

    function playAlarmAndThenSpeak(textToSpeak) {
        const shouldPlay = !!state.settings.audioEnabled;
        const shouldSpeak = !!state.settings.speechEnabled && 'speechSynthesis' in window;
        let spoken = false;
        const speakNow = () => {
            if (spoken) return;
            spoken = true;
            if (!shouldSpeak) { console.log('[TTS] Speech disabled, skipping.'); return; }
            if (!textToSpeak) { console.log('[TTS] No text to speak.'); return; }
            console.log('[TTS] Preparing to speak after alarm. language=', state.settings.speechLanguage);
            // Ensure we have voices loaded before speaking and pick a suitable one
            if (!speechUnlocked) {
                console.log('[TTS] Not unlocked yet, queue speak after user gesture');
                pendingSpeakText = textToSpeak;
            } else {
                loadVoices().then(() => {
                    speakText(textToSpeak, state.settings.speechLanguage || 'de-DE');
                });
            }
        };
        if (shouldPlay) {
            const audio = new Audio(`/static/sound/${state.settings.alarmSound}`);
            audio.preload = 'auto';
            audio.currentTime = 0;
            console.log('[AUDIO] Start playing', state.settings.alarmSound);
            let fallbackTimer = null;
            const clearTimers = () => { if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; } };
            audio.addEventListener('ended', () => { console.log('[AUDIO] ended event'); clearTimers(); speakNow(); }, { once: true });
            // If metadata has duration, use it as a fallback timer in case 'ended' is not fired
            const tryStartFallback = () => {
                if (!isNaN(audio.duration) && audio.duration > 0) {
                    const ms = Math.ceil(audio.duration * 1000) + 100;
                    console.log('[AUDIO] duration available:', audio.duration, 's -> timeout', ms, 'ms');
                    fallbackTimer = setTimeout(() => { console.log('[AUDIO] duration fallback fired'); speakNow(); }, ms);
                }
            };
            audio.addEventListener('loadedmetadata', () => { console.log('[AUDIO] loadedmetadata', { duration: audio.duration }); tryStartFallback(); }, { once: true });
            // As a final fallback if metadata never loads, set a conservative timeout (3s)
            fallbackTimer = setTimeout(() => { console.log('[AUDIO] conservative 3s fallback fired'); speakNow(); }, 3000);
            audio.play().then(() => {
                // If play succeeded and metadata is already present, start duration fallback
                console.log('[AUDIO] play() promise resolved');
                tryStartFallback();
            }).catch(e => {
                console.error('[AUDIO] play() failed:', e);
                // If audio fails, still attempt speech
                clearTimers();
                speakNow();
            });
        } else {
            // No audio, speak immediately
            console.log('[AUDIO] Audio disabled, speaking immediately');
            speakNow();
        }
    }

    function triggerAlarm(message) {
        // Normalize input
        const trimmed = typeof message === 'string' ? message.trim() : '';
        const textToSpeak = trimmed; // will be '' if not provided or only whitespace
      
        console.log('[ALARM] Triggered with', {
          message: trimmed,
          hasDescription: trimmed.length > 0,
          lang: state.settings.speechLanguage
        });
      
        playAlarmAndThenSpeak(textToSpeak);
      }

    // --- Modal Management ---
    function openModal(modal, title, data = {}) {
        const form = modal.querySelector('form');
        if (form) form.reset();
        modal.querySelector('.modal-content h2').textContent = title;
        for (const key in data) {
            const input = form.querySelector(`#${modal.id.split('-')[0]}-${key}`);
            if (input) input.value = data[key];
        }
        // Special handling for incident scheduled_at -> separate date/time inputs
        if (modal.id === 'incident-modal' && form) {
            const dateInput = form.querySelector('#incident-date');
            const timeInput = form.querySelector('#incident-time');
            const sched = data.scheduled_at || data.scheduled;
            if (dateInput && timeInput) {
                if (sched) {
                    const d = new Date(sched);
                    if (!isNaN(d)) {
                        const local = toLocalISOString(d); // yyyy-MM-ddTHH:mm
                        const [ymd, hm] = local.split('T');
                        dateInput.value = ymd;
                        timeInput.value = hm;
                    } else {
                        const now = new Date();
                        const local = toLocalISOString(now);
                        const [ymd, hm] = local.split('T');
                        dateInput.value = ymd;
                        timeInput.value = hm;
                    }
                } else {
                    const now = new Date();
                    const local = toLocalISOString(now);
                    const [ymd, hm] = local.split('T');
                    dateInput.value = ymd;
                    timeInput.value = hm;
                }
            }
        }
        modal.classList.remove('hidden');
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
    }
    document.querySelectorAll('.modal .close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal')));
    });

    // --- Rendering ---
    function renderAll() {
        renderIncidents();
        renderVehicles();
        renderDashboardIncidents();
        renderDashboardVehicles();
        updateAdminUI();
        // Reflect current settings to options UI
        if (options.audioEnable) options.audioEnable.checked = !!state.settings.audioEnabled;
        if (options.speechEnable) options.speechEnable.checked = !!state.settings.speechEnabled;
        if (options.alarmSoundSelect) options.alarmSoundSelect.value = state.settings.alarmSound || 'gong1.mp3';
        if (options.speechLanguageSelect) options.speechLanguageSelect.value = state.settings.speechLanguage || 'de-DE';
    }

    function vehicleBadges(vehicles) {
        if (!vehicles || vehicles.length === 0) return '';
        return '<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">' + vehicles.map(v => `<span class="badge badge-lg" title="${v.status}">${v.name} (${v.status})</span>`).join('') + '</div>';
    }

    function createItemDiv(item, type) {
        const div = document.createElement('div');
        div.className = `${type}-item`;
        div.setAttribute('data-id', item.id);
        div.innerHTML = `
            <div>
                <strong>${item.title || item.name}</strong> - <span>Status: ${item.status}</span>
                ${type === 'incident' && item.vehicles ? vehicleBadges(item.vehicles) : ''}
            </div>
            <div class="item-actions">
                <button class="edit-btn" data-id="${item.id}">Bearbeiten</button>
                <button class="delete-btn" data-id="${item.id}">Löschen</button>
            </div>
        `;
        return div;
    }

    function renderIncidents() {
        incidentsList.innerHTML = '';
        state.incidents.forEach(incident => incidentsList.appendChild(createItemDiv(incident, 'incident')));
    }

    function renderVehicles() {
        vehiclesList.innerHTML = '';
        state.vehicles.forEach(vehicle => vehiclesList.appendChild(createItemDiv(vehicle, 'vehicle')));
    }

    // Map state
    let leafletMap = null;
    let leafletMarker = null;

    // Modal map preview (Leaflet instance and marker)
    let previewMap = null;
    let previewMarker = null;

    // Render/update the incident preview map inside the modal
    async function updateIncidentPreviewMap() {
        const mapEl = document.getElementById('incident-map');
        if (!mapEl || !incidentForm) return;

        const latInput = incidentForm.querySelector('#incident-lat');
        const lonInput = incidentForm.querySelector('#incident-lon');
        const addrInput = incidentForm.querySelector('#incident-address');

        let lat = latInput && latInput.value ? parseFloat(latInput.value) : null;
        let lon = lonInput && lonInput.value ? parseFloat(lonInput.value) : null;

        // If coords are missing but address is provided, try geocoding quickly
        if ((lat == null || lon == null) && addrInput && addrInput.value && addrInput.value.trim().length > 3) {
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addrInput.value)}`);
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    lat = parseFloat(data[0].lat);
                    lon = parseFloat(data[0].lon);
                    if (!isNaN(lat)) latInput.value = String(lat);
                    if (!isNaN(lon)) lonInput.value = String(lon);
                }
            } catch (e) {
                console.warn('Preview geocoding failed:', e);
            }
        }

        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
            mapEl.classList.add('hidden');
            return;
        }

        mapEl.classList.remove('hidden');
        if (!previewMap) {
            previewMap = L.map('incident-map');
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(previewMap);
        }
        previewMap.setView([lat, lon], 15);
        if (!previewMarker) {
            previewMarker = L.marker([lat, lon]).addTo(previewMap);
        } else {
            previewMarker.setLatLng([lat, lon]);
        }
    }

    function isTriggered(incident) {
        if (!incident.scheduled_at) return false;
        const t = new Date(incident.scheduled_at);
        return !isNaN(t) && t.getTime() <= Date.now();
    }

    async function ensureCoords(incident) {
        if (incident.latitude != null && incident.longitude != null) return incident;
        if (!incident.address) return incident;
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(incident.address)}`);
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) {
                const { lat, lon } = data[0];
                incident.latitude = parseFloat(lat);
                incident.longitude = parseFloat(lon);
            }
        } catch (e) {
            console.warn('Geocoding failed:', e);
        }
        return incident;
    }

    async function renderDashboardIncidents() {
        const listEl = document.getElementById('dashboard-list');
        listEl.innerHTML = '';
        // Show only incidents with status 'active'
        const active = state.incidents.filter(i => i.status === 'active');

        if (active.length === 0) {
            mapContainer.classList.add('hidden');
            dashboardEmpty.classList.remove('hidden');
            return;
        }

        dashboardEmpty.classList.add('hidden');
        // Render list of at most 3 active incidents
        active.slice(0, 3).forEach(inc => {
            const div = document.createElement('div');
            div.className = 'incident-item';
            const when = inc.scheduled_at ? new Date(inc.scheduled_at).toLocaleString('de-DE') : '';
            const vehiclesHtml = inc.vehicles && inc.vehicles.length ? vehicleBadges(inc.vehicles) : '';
            div.innerHTML = `<div><strong>${inc.title}</strong> - <span>Status: ${inc.status}</span><br>${inc.address ?? ''}${when ? ' • ' + when : ''}${vehiclesHtml ? '<br>' + vehiclesHtml : ''}</div>`;
            listEl.appendChild(div);
        });

        // Show map for the most recently scheduled active incident (by scheduled_at desc)
        const preferred = active
            .filter(i => i.scheduled_at)
            .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))[0] || active[0];
        const incident = await ensureCoords(preferred);
        if (incident.latitude == null || incident.longitude == null) {
            mapContainer.classList.add('hidden');
            return;
        }

        mapContainer.classList.remove('hidden');
        if (!leafletMap) {
            leafletMap = L.map('map');
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(leafletMap);
        }
        leafletMap.setView([incident.latitude, incident.longitude], 15);
        if (!leafletMarker) {
            leafletMarker = L.marker([incident.latitude, incident.longitude]).addTo(leafletMap);
        } else {
            leafletMarker.setLatLng([incident.latitude, incident.longitude]);
        }
        const when = incident.scheduled_at ? new Date(incident.scheduled_at).toLocaleString('de-DE') : '';
        leafletMarker.bindPopup(`<strong>${incident.title}</strong><br>${incident.address ?? ''}<br>${when}`).openPopup();
    }

    // Render vehicles panel on the dashboard
    function renderDashboardVehicles() {
        const container = document.getElementById('dashboard-vehicles-list');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(state.vehicles) || state.vehicles.length === 0) {
            container.innerHTML = '<div class="muted">Keine Fahrzeuge vorhanden.</div>';
            return;
        }
        const statusBadge = (status) => {
            // Display numeric status directly
            return `<span class="badge" title="${status}">${status}</span>`;
        };
        state.vehicles.forEach(v => {
            const row = document.createElement('div');
            row.className = 'vehicle-item';
            row.innerHTML = `
                <div>
                    <strong>${v.name}</strong> - ${statusBadge(v.status)}
                </div>
            `;
            container.appendChild(row);
        });
    }

    // --- Vehicles polling fallback (in case WS message is missed) ---
    function syncIncidentVehicleStatuses() {
        if (!Array.isArray(state.incidents) || !Array.isArray(state.vehicles)) return;
        const byId = new Map(state.vehicles.map(v => [v.id, v]));
        state.incidents.forEach(inc => {
            if (Array.isArray(inc.vehicles)) {
                inc.vehicles = inc.vehicles.map(v => {
                    const latest = byId.get(v.id);
                    return latest ? { ...v, status: latest.status, name: latest.name } : v;
                });
            }
        });
    }
    function vehiclesChanged(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return true;
        if (a.length !== b.length) return true;
        const byId = (arr) => arr.slice().sort((x, y) => x.id - y.id);
        const ax = byId(a), bx = byId(b);
        for (let i = 0; i < ax.length; i++) {
            const va = ax[i], vb = bx[i];
            if (va.id !== vb.id) return true;
            if ((va.name || '') !== (vb.name || '')) return true;
            if ((va.status || '') !== (vb.status || '')) return true;
        }
        return false;
    }

    let vehiclesPollTimer = null;
    function startVehiclesPolling() {
        if (vehiclesPollTimer) return;
        vehiclesPollTimer = setInterval(async () => {
            try {
                const latest = await apiCall('/api/vehicles/');
                if (Array.isArray(latest) && vehiclesChanged(state.vehicles, latest)) {
                    state.vehicles = latest;
                    syncIncidentVehicleStatuses();
                    renderAll();
        // Reflect weather location into options input
        if (options.weatherLocationInput) options.weatherLocationInput.value = state.settings.weather_location || '';
        // Start weather refresh loop
        startWeatherLoop();
                }
            } catch (e) {
                // ignore transient errors
            }
        }, 5000);
    }

    // --- Date/Time Helpers ---
    function toLocalISOString(date) {
        const pad = (num) => num.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    // --- Trigger poller for scheduled incidents ---
    let lastScheduleCheck = Date.now();
    function checkTriggeredIncidents() {
        const now = Date.now();
        // Find incidents that just became triggered since the last check
        const justTriggered = state.incidents.filter(i => {
            if (i.status === 'closed') return false;
            if (!i.scheduled_at) return false;
            const t = new Date(i.scheduled_at).getTime();
            if (isNaN(t)) return false;
            return t > lastScheduleCheck && t <= now;
        });
        if (justTriggered.length > 0) {
            // Play alarm for each newly triggered incident
            justTriggered.forEach(i => triggerAlarm(`Neuer Einsatz: ${i.title}: ${i.description || ''}. Fahrzeuge: ${i.vehicles?.map(v => v.name).join(', ') || ''} ausrücken zu ${i.address}`));
            // Re-render dashboard to move items into the triggered list/map
            renderDashboardIncidents();
        }
        lastScheduleCheck = now;
    }

    // --- API & Auth ---
    async function apiCall(endpoint, method = 'GET', body = null, isAuth = false) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.auth.token) {
            headers['Authorization'] = `Bearer ${state.auth.token}`;
        }
        const options = { method, headers };
        // Ensure Authelia (or other) auth/session cookies are sent with requests
        // This is required so protected backend endpoints do not redirect the XHR/fetch to login
        // when accessed from the same site via relative URLs like /api/...
        options.credentials = 'include';
        if (body) {
            options.body = isAuth ? new URLSearchParams(body) : JSON.stringify(body);
            if (isAuth) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const response = await fetch(endpoint, options);

        if (response.status === 204) {
            return null; // Handle No Content response
        }

        const responseText = await response.text();

        if (!response.ok) {
            let errorDetail = `API call failed: ${response.statusText}`;
            if (responseText) {
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.detail || errorDetail;
                } catch (e) {
                    // Not a JSON error response, use the text
                    errorDetail = responseText;
                }
            }
            throw new Error(errorDetail);
        }
        
        return responseText ? JSON.parse(responseText) : null;
    }

    async function login(username, password) {
        try {
            const data = await apiCall('/api/token', 'POST', { username, password }, true);
            state.auth.token = data.access_token;
            state.auth.isAuthenticated = true;
            localStorage.setItem('authToken', data.access_token);
            closeModal(loginModal);
            renderAll();
        } catch (error) {
            const loginError = document.getElementById('login-error');
            loginError.textContent = 'Login fehlgeschlagen: ' + error.message;
            loginError.style.display = 'block';
        }
    }

    function logout() {
        state.auth.token = null;
        state.auth.isAuthenticated = false;
        localStorage.removeItem('authToken');
        renderAll();
    }

    // --- Event Handlers ---
    // Top navigation -> client-side routes
    if (buttons.dashboard) buttons.dashboard.addEventListener('click', () => Router.navigate('/dashboard'));
    if (buttons.incidents) buttons.incidents.addEventListener('click', () => Router.navigate('/incidents'));
    if (buttons.vehicles) buttons.vehicles.addEventListener('click', () => Router.navigate('/vehicles'));
    if (buttons.options) buttons.options.addEventListener('click', () => Router.navigate('/options'));
    buttons.createIncident.addEventListener('click', () => {
        openModal(incidentModal, 'Neuer Einsatz');
        // Explicitly clear hidden id to force POST
        const idInput = incidentForm.querySelector('#incident-id');
        if (idInput) idInput.value = '';
        // Reset vehicle selections
        incidentVehiclesBox.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
        // Clear coordinates and hide preview map
        const latInput = incidentForm.querySelector('#incident-lat');
        const lonInput = incidentForm.querySelector('#incident-lon');
        if (latInput) latInput.value = '';
        if (lonInput) lonInput.value = '';
        // Set default status to 'new'
        const statusSel = incidentForm.querySelector('#incident-status');
        if (statusSel) statusSel.value = 'new';
        const mapEl = document.getElementById('incident-map');
        if (mapEl) mapEl.classList.add('hidden');
    });
    buttons.createVehicle.addEventListener('click', () => openModal(vehicleModal, 'Neues Fahrzeug'));
    buttons.testAlarm.addEventListener('click', () => triggerAlarm('Dies ist ein Testalarm.'));
    buttons.loginLogout.addEventListener('click', () => {
        if (state.auth.isAuthenticated) {
            logout();
        } else {
            openModal(loginModal, 'Login');
        }
    });

    async function saveOptions(partial) {
        try {
            const payload = {};
            if (partial.hasOwnProperty('audioEnabled')) payload.audio_enabled = partial.audioEnabled;
            if (partial.hasOwnProperty('speechEnabled')) payload.speech_enabled = partial.speechEnabled;
            if (partial.hasOwnProperty('alarmSound')) payload.alarm_sound = partial.alarmSound;
            if (partial.hasOwnProperty('speechLanguage')) payload.speech_language = partial.speechLanguage;
            if (partial.hasOwnProperty('weatherLocation')) payload.weather_location = partial.weatherLocation;
            const updated = await apiCall('/api/options/', 'PUT', payload);
            if (updated) {
                state.settings.audioEnabled = !!updated.audio_enabled;
                state.settings.speechEnabled = !!updated.speech_enabled;
                state.settings.alarmSound = updated.alarm_sound || 'gong1.mp3';
                state.settings.speechLanguage = updated.speech_language || 'de-DE';
                state.settings.weather_location = updated.weather_location || '';
                renderAll();
                // Update weather immediately when changed
                fetchWeatherFor(state.settings.weather_location || 'Frankfurt am Main');
            }
        } catch (e) {
            console.warn('Saving options failed:', e);
        }
    }

    if (options.audioEnable) options.audioEnable.addEventListener('change', (e) => {
        state.settings.audioEnabled = e.target.checked;
        saveOptions({ audioEnabled: state.settings.audioEnabled });
    });
    if (options.speechEnable) options.speechEnable.addEventListener('change', (e) => {
        state.settings.speechEnabled = e.target.checked;
        saveOptions({ speechEnabled: state.settings.speechEnabled });
    });
    if (options.alarmSoundSelect) options.alarmSoundSelect.addEventListener('change', (e) => {
        state.settings.alarmSound = e.target.value;
        saveOptions({ alarmSound: state.settings.alarmSound });
    });
    if (options.speechLanguageSelect) options.speechLanguageSelect.addEventListener('change', (e) => {
        state.settings.speechLanguage = e.target.value;
        saveOptions({ speechLanguage: state.settings.speechLanguage });
    });
    if (options.weatherLocationInput) options.weatherLocationInput.addEventListener('change', (e) => {
        state.settings.weather_location = e.target.value || '';
        saveOptions({ weatherLocation: state.settings.weather_location });
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = e.target.querySelector('#username').value;
        const password = e.target.querySelector('#password').value;
        login(username, password);
    });

    incidentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#incident-id').value;
        const selectedVehicleIds = Array.from(incidentVehiclesBox.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
        const data = {
            title: e.target.querySelector('#incident-title').value,
            description: e.target.querySelector('#incident-description').value,
            address: e.target.querySelector('#incident-address').value,
            latitude: e.target.querySelector('#incident-lat').value ? parseFloat(e.target.querySelector('#incident-lat').value) : null,
            longitude: e.target.querySelector('#incident-lon').value ? parseFloat(e.target.querySelector('#incident-lon').value) : null,
            scheduled_at: (() => {
                const dateV = e.target.querySelector('#incident-date')?.value;
                const timeV = e.target.querySelector('#incident-time')?.value;
                if (dateV && timeV) {
                    const localStr = `${dateV}T${timeV}`; // local time
                    const dt = new Date(localStr);
                    return isNaN(dt) ? null : dt.toISOString();
                }
                if (dateV && !timeV) {
                    const dt = new Date(`${dateV}T00:00`);
                    return isNaN(dt) ? null : dt.toISOString();
                }
                return null;
            })(),
            status: e.target.querySelector('#incident-status').value,
            vehicle_ids: selectedVehicleIds,
        };
        try {
            await apiCall(id ? `/api/incidents/${id}` : '/api/incidents/', id ? 'PUT' : 'POST', data);
            closeModal(incidentModal);
            // Re-fetch to ensure latest data even if WS message is missed
            const incidents = await apiCall('/api/incidents/');
            state.incidents = incidents || [];
            renderAll();
        } catch (error) {
            alert('Einsatz speichern fehlgeschlagen: ' + error.message);
            console.error('Incident save failed:', error);
        }
    });

    vehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = e.target.querySelector('#vehicle-id').value;
        const data = {
            name: e.target.querySelector('#vehicle-name').value,
            status: parseInt(e.target.querySelector('#vehicle-status').value, 10),
        };
        try {
            await apiCall(id ? `/api/vehicles/${id}` : '/api/vehicles/', id ? 'PUT' : 'POST', data);
            closeModal(vehicleModal);
            const vehicles = await apiCall('/api/vehicles/');
            state.vehicles = vehicles || [];
            renderAll();
        } catch (error) {
            alert('Fahrzeug speichern fehlgeschlagen: ' + error.message);
            console.error('Vehicle save failed:', error);
        }
    });

    function setupListEventListeners(listElement, type) {
        listElement.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            if (e.target.classList.contains('edit-btn')) {
                const item = state[type].find(i => i.id == id);
                openModal(document.getElementById(`${type.slice(0, -1)}-modal`), `Bearbeiten`, item);
                // Populate extended incident fields if editing incidents
                if (type === 'incidents' && item) {
                    const form = incidentForm;
                    form.querySelector('#incident-address').value = item.address || '';
                    form.querySelector('#incident-lat').value = item.latitude ?? '';
                    form.querySelector('#incident-lon').value = item.longitude ?? '';
                    // Prefill status select with current status
                    const statusSel = form.querySelector('#incident-status');
                    if (statusSel && item.status) statusSel.value = item.status;
                    // Convert UTC from API to local time for the input field
                    form.querySelector('#incident-scheduled').value = item.scheduled_at ? toLocalISOString(new Date(item.scheduled_at)) : '';
                    // Update preview map on open
                    updateIncidentPreviewMap();
                    // Preselect assigned vehicles
                    const assignedIds = (item.vehicles || []).map(v => v.id);
                    incidentVehiclesBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.checked = assignedIds.includes(parseInt(cb.value));
                    });
                }
            } else if (e.target.classList.contains('delete-btn')) {
                if (confirm('Wirklich löschen?')) {
                    try {
                        await apiCall(`/api/${type}/${id}`, 'DELETE');
                        // Refresh list after deletion
                        const updated = await apiCall(`/api/${type}/`);
                        state[type] = updated || [];
                        renderAll();
                    } catch (error) {
                        alert('Löschen fehlgeschlagen: ' + error.message);
                        console.error('Delete failed:', error);
                    }
                }
            }
        });
    }
    setupListEventListeners(incidentsList, 'incidents');
    setupListEventListeners(vehiclesList, 'vehicles');

    // --- WebSocket ---
    function connectWebSocket() {
        const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
        ws.onopen = () => {
            state.wsConnected = true;
            console.log('WebSocket connected');
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('WS message received:', data);

            if (data.type === 'alarm') {
                triggerAlarm(`Neuer Einsatz! ${itemData.title}: ${itemData.description || ''}. Fahrzeuge ${itemData.vehicles.map(v => v.name).join(', ')} ausrücken zu ${itemData.address}`);
                return;
            }

            const itemType = data.type.split('_')[0] + 's';
            const action = data.type.split('_')[1];
            const itemData = data[itemType.slice(0, -1)];

            if (action === 'created') {
                state[itemType].push(itemData);
                if (itemType === 'incidents') {
                    // Play alarm if the created incident is already active
                    if (itemData.status === 'active') {
                        triggerAlarm(`Neuer Einsatz! ${itemData.title}: ${itemData.description || ''}. Fahrzeuge ${itemData.vehicles.map(v => v.name).join(', ')} ausrücken zu ${itemData.address}`);
                    }
                }
            } else if (action === 'updated') {
                const index = state[itemType].findIndex(i => i.id === itemData.id);
                if (index > -1) {
                    if (itemType === 'incidents') {
                        const prev = state[itemType][index];
                        const wasActive = prev && prev.status === 'active';
                        const nowActive = itemData.status === 'active';
                        if (!wasActive && nowActive) {
                            triggerAlarm(`Neuer Einsatz! ${itemData.title}: ${itemData.description || ''}. Fahrzeuge ${itemData.vehicles.map(v => v.name).join(', ')} ausrücken zu ${itemData.address}`);
                        }
                    }
                    state[itemType][index] = itemData;
                } else {
                    // Item not known yet: add it and trigger alarm if active
                    state[itemType].push(itemData);
                    if (itemType === 'incidents' && itemData.status === 'active') {
                        triggerAlarm(`Neuer Einsatz! ${itemData.title}: ${itemData.description || ''}. Fahrzeuge ${itemData.vehicles.map(v => v.name).join(', ')} ausrücken zu ${itemData.address}`);
                    }
                }
            } else if (action === 'deleted') {
                state[itemType] = state[itemType].filter(i => i.id !== data.incident_id && i.id !== data.vehicle_id);
            }
            if (itemType === 'vehicles') {
                // Ensure embedded incident->vehicles reflect latest statuses/names
                syncIncidentVehicleStatuses();
            }
            renderAll();
            // Light consistency refresh for incidents to ensure latest server state
            if (itemType === 'incidents') {
                apiCall('/api/incidents/')
                    .then((incidents) => {
                        if (Array.isArray(incidents)) {
                            state.incidents = incidents;
                            renderAll();
                        }
                    })
                    .catch((e) => console.warn('Incidents refresh after WS failed:', e));
            }
        };

        ws.onclose = () => {
            state.wsConnected = false;
            console.log('WebSocket disconnected. Reconnecting...');
            setTimeout(connectWebSocket, 3000);
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        };
    }

    // --- Fallback polling for incidents (in case WS messages are missed) ---
    function incidentsChanged(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return true;
        if (a.length !== b.length) return true;
        // Compare by id + status + updated fields we care about
        const byId = (arr) => arr.slice().sort((x, y) => x.id - y.id);
        const ax = byId(a), bx = byId(b);
        for (let i = 0; i < ax.length; i++) {
            const ia = ax[i], ib = bx[i];
            if (ia.id !== ib.id) return true;
            if (ia.status !== ib.status) return true;
            if ((ia.title || '') !== (ib.title || '')) return true;
            if ((ia.address || '') !== (ib.address || '')) return true;
            if ((ia.scheduled_at || '') !== (ib.scheduled_at || '')) return true;
        }
        return false;
    }

    let incidentsPollTimer = null;
    function startIncidentsPolling() {
        if (incidentsPollTimer) return; // already started
        incidentsPollTimer = setInterval(async () => {
            try {
                const latest = await apiCall('/api/incidents/');
                if (Array.isArray(latest)) {
                    // Detect newly active incidents compared to previous state
                    const prevActiveIds = new Set((state.incidents || []).filter(i => i.status === 'active').map(i => i.id));
                    const newActive = latest.filter(i => i.status === 'active' && !prevActiveIds.has(i.id));
                    if (newActive.length > 0) {
                        newActive.forEach(i => triggerAlarm(`Neuer Einsatz: ${i.title}: ${i.description || ''}. Fahrzeuge: ${i.vehicles?.map(v => v.name).join(', ') || ''} ausrücken zu ${i.address}`));
                    }
                    if (incidentsChanged(state.incidents, latest)) {
                        state.incidents = latest;
                        renderAll();
                    }
                }
            } catch (e) {
                // Network issues: ignore for now
                // console.warn('Incidents polling failed:', e);
            }
        }, 3000);
    }

    // --- Initialization ---
    async function init() {
        // Initialize client-side routing; default is '/incidents'
        if (window.Router && typeof window.Router.applyInitialRoute === 'function') {
            window.Router.applyInitialRoute();
        } else {
            // Fallback
            showView('incidents');
        }
        updateClock();

        const token = localStorage.getItem('authToken');
        if (token) {
            state.auth.token = token;
            state.auth.isAuthenticated = true;
        }

        // Load options from backend
        try {
            const opts = await apiCall('/api/options/');
            if (opts) {
                state.settings.audioEnabled = !!opts.audio_enabled;
                state.settings.speechEnabled = !!opts.speech_enabled;
                state.settings.alarmSound = opts.alarm_sound || 'gong1.mp3';
                state.settings.speechLanguage = opts.speech_language || 'de-DE';
                state.settings.weather_location = opts.weather_location || '';
            }
        } catch (e) {
            console.warn('Loading options failed, using defaults:', e);
        }

        const [incidents, vehicles] = await Promise.all([
            apiCall('/api/incidents/'),
            apiCall('/api/vehicles/')
        ]);
        state.incidents = incidents || [];
        state.vehicles = vehicles || [];
        // Populate vehicle checkboxes in incident modal
        incidentVehiclesBox.innerHTML = state.vehicles.map(v => `
            <label style="display:inline-flex; align-items:center; gap:6px; margin-right:12px; margin-top:6px;">
                <input type="checkbox" value="${v.id}" />
                <span>${v.name}</span>
            </label>
        `).join('');
        renderAll();
        // Server-side activates incidents; client poller disabled to avoid duplicate alarms
        // lastScheduleCheck = Date.now();
        // setInterval(checkTriggeredIncidents, 1000);
        connectWebSocket();
        // Always enable a light polling fallback to keep dashboard fresh if WS misses updates
        startIncidentsPolling();
        startVehiclesPolling();
    }

    init();
});
