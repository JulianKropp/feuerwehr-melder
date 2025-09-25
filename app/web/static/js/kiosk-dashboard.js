'use strict';
(function(){
  // Simple state for kiosk dashboard
  const state = {
    incidents: [],
    vehicles: [],
    settings: {
      audioEnabled: true,
      speechEnabled: true,
      alarmSound: 'gong1.mp3',
      speechLanguage: 'de-DE',
      weather_location: '',
    },
    wsConnected: false,
    weather: null,
    weatherCoords: null,
  };

  const dashboardEmpty = document.getElementById('dashboard-empty');
  const mapContainer = document.getElementById('map');
  const vehiclesList = document.getElementById('dashboard-vehicles-list');
  const clockEl = document.getElementById('kiosk-clock');
  const weatherEl = document.getElementById('kiosk-weather');

  // Track which incidents are active to detect newly triggered ones
  let lastActiveIncidentIds = new Set();

  // --- Alarm & Speech (TTS) ---
  let voices = [];
  let voicesLoaded = false;
  let speechUnlocked = false;
  let pendingSpeakText = null;

  function loadVoices() {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve([]);
      const list = window.speechSynthesis.getVoices();
      if (list && list.length > 0) {
        voices = list;
        voicesLoaded = true;
        resolve(voices);
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          voices = window.speechSynthesis.getVoices();
          voicesLoaded = true;
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
    const prefix = (lang || '').split('-')[0].toLowerCase();
    const partial = voices.find(v => (v.lang || '').toLowerCase().startsWith(prefix));
    return partial || null;
  }

  function speakText(text, lang) {
    if (!text) return;
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    try { window.speechSynthesis.resume(); } catch (_) {}
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang || 'de-DE';
    const v = pickVoiceForLang(utterance.lang);
    if (v) utterance.voice = v;
    setTimeout(() => {
      try { window.speechSynthesis.speak(utterance); } catch (e) { console.error('[kiosk][TTS] speak error:', e); }
    }, 0);
  }

  function unlockSpeech() {
    try { window.speechSynthesis.resume(); } catch (_) {}
    speechUnlocked = true;
    // Warm up voices
    try {
      const warm = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(warm);
      window.speechSynthesis.cancel();
    } catch (_) {}
    if (pendingSpeakText) {
      const text = pendingSpeakText;
      pendingSpeakText = null;
      loadVoices().then(() => speakText(text, state.settings.speechLanguage || 'de-DE'));
    }
    // Hide media permission banner if present
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
      if (!shouldSpeak) return;
      if (!textToSpeak) return;
      if (!speechUnlocked) {
        pendingSpeakText = textToSpeak;
      } else {
        loadVoices().then(() => speakText(textToSpeak, state.settings.speechLanguage || 'de-DE'));
      }
    };
    if (shouldPlay) {
      const audio = new Audio(`/static/sound/${state.settings.alarmSound}`);
      audio.preload = 'auto';
      audio.currentTime = 0;
      let fallbackTimer = setTimeout(() => speakNow(), 3000);
      audio.addEventListener('ended', () => { clearTimeout(fallbackTimer); speakNow(); }, { once: true });
      audio.addEventListener('loadedmetadata', () => {
        if (!isNaN(audio.duration) && audio.duration > 0) {
          clearTimeout(fallbackTimer);
          fallbackTimer = setTimeout(() => speakNow(), Math.ceil(audio.duration * 1000) + 100);
        }
      }, { once: true });
      audio.play().then(() => {}).catch(() => { clearTimeout(fallbackTimer); speakNow(); });
    } else {
      speakNow();
    }
  }

  function triggerAlarm(message, descriptionForTTS = '') {
    const textToSpeak = (descriptionForTTS && descriptionForTTS.trim()) ? descriptionForTTS : message;
    playAlarmAndThenSpeak(textToSpeak);
  }

  let leafletMap = null;
  let leafletMarker = null;

  function vehicleBadges(vehicles) {
    if (!vehicles || vehicles.length === 0) return '';
    return '<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">' + vehicles.map(v => `<span class="badge ${v.status === 'available' ? 'badge-new' : 'badge-closed'}" title="${v.status}">${v.name}</span>`).join('') + '</div>';
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
      console.warn('[kiosk] Geocoding failed:', e);
    }
    return incident;
  }

  function renderDashboardVehicles() {
    if (!vehiclesList) return;
    vehiclesList.innerHTML = '';
    if (!Array.isArray(state.vehicles) || state.vehicles.length === 0) {
      vehiclesList.innerHTML = '<div class="muted">Keine Fahrzeuge vorhanden.</div>';
      return;
    }
    const statusBadge = (status) => {
      const classMap = { available: 'badge-new', unavailable: 'badge-closed', in_maintenance: 'badge-closed' };
      const labelMap = { available: 'Verfügbar', unavailable: 'Nicht verfügbar', in_maintenance: 'In Wartung' };
      const cls = classMap[status] || 'badge';
      const label = labelMap[status] || String(status || '').toString();
      return `<span class="badge ${cls}" title="${label}">${label}</span>`;
    };
    state.vehicles.forEach(v => {
      const row = document.createElement('div');
      row.className = 'vehicle-item vehicle-item-large';
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <strong style="font-size:1.2rem;">${v.name}</strong>
          ${statusBadge(v.status)}
        </div>
      `;
      vehiclesList.appendChild(row);
    });
  }

  async function renderDashboardIncidents() {
    const listEl = document.getElementById('dashboard-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const active = (state.incidents || []).filter(i => i.status === 'active');
    if (active.length === 0) {
      if (mapContainer) mapContainer.classList.add('hidden');
      if (dashboardEmpty) dashboardEmpty.classList.remove('hidden');
      return;
    }

    if (dashboardEmpty) dashboardEmpty.classList.add('hidden');

    const incidentStatusDe = (s) => ({
      new: 'Neu',
      active: 'Aktiv',
      closed: 'Geschlossen',
    })[s] || String(s || '').toString();

    active.slice(0, 3).forEach(inc => {
      const div = document.createElement('div');
      div.className = 'incident-item incident-item-large';
      const when = inc.scheduled_at ? new Date(inc.scheduled_at).toLocaleString('de-DE') : '';
      const vehiclesHtml = inc.vehicles && inc.vehicles.length ? vehicleBadges(inc.vehicles) : '';
      const desc = (inc.description || '').trim();
      div.innerHTML = `<div style="font-size:1.5rem; line-height:1.55;">
        <strong style="font-size:1.9rem;">${inc.title}</strong>
        <span class=\"muted\"> – Status: ${incidentStatusDe(inc.status)}</span><br>
        ${inc.address ?? ''}${when ? ' • ' + when : ''}
        ${desc ? `<div style='margin-top:14px; white-space:pre-wrap;'>${desc}</div>` : ''}
        ${vehiclesHtml ? '<div>' + vehiclesHtml + '</div>' : ''}
      </div>`;
      listEl.appendChild(div);
    });

    // Map: show most recent active incident
    const preferred = active
      .filter(i => i.scheduled_at)
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))[0] || active[0];
    const incident = await ensureCoords(preferred);

    if (incident.latitude == null || incident.longitude == null) {
      if (mapContainer) mapContainer.classList.add('hidden');
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

  // --- Weather ---
  function weatherCodeToTextDe(code) {
    // Open-Meteo WMO weather interpretation codes
    const map = {
      0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bewölkt',
      45: 'Nebel', 48: 'Reifnebel', 51: 'Nieselregen leicht', 53: 'Nieselregen', 55: 'Nieselregen stark',
      56: 'Gefrierender Nieselregen leicht', 57: 'Gefrierender Nieselregen stark',
      61: 'Regen leicht', 63: 'Regen', 65: 'Regen stark',
      66: 'Gefrierender Regen leicht', 67: 'Gefrierender Regen stark',
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
    } catch (e) { console.warn('[kiosk] weather geocode failed', e); }
    return null;
  }

  async function fetchWeatherFor(locationStr) {
    if (!locationStr || !locationStr.trim()) { state.weather = null; updateWeatherUI(); return; }
    // Re-geocode only if location changed
    if (!state.weatherCoords || state.weatherCoords.q !== locationStr) {
      const coords = await geocodeLocation(locationStr);
      state.weatherCoords = coords ? { ...coords, q: locationStr } : null;
    }
    if (!state.weatherCoords) { state.weather = null; updateWeatherUI(); return; }
    const { lat, lon } = state.weatherCoords;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
      const resp = await fetch(url);
      const data = await resp.json();
      state.weather = data && data.current ? {
        temp: data.current.temperature_2m,
        code: data.current.weather_code,
        wind: data.current.wind_speed_10m
      } : null;
    } catch (e) {
      console.warn('[kiosk] weather fetch failed', e);
      state.weather = null;
    }
    updateWeatherUI();
  }

  function updateWeatherUI() {
    if (!weatherEl) return;
    const loc = (state.settings.weather_location || 'Frankfurt am Main').trim();
    if (!loc) { weatherEl.textContent = ''; return; }
    if (!state.weather) {
      weatherEl.textContent = `Wetter ${loc}: —`;
      return;
    }
    const text = weatherCodeToTextDe(state.weather.code);
    weatherEl.textContent = `Wetter ${loc}: ${Math.round(state.weather.temp)}°C, ${text}`;
  }

  function startWeatherLoop() {
    // Update weather periodically (e.g., every 60s)
    setInterval(() => {
      fetchWeatherFor(state.settings.weather_location || 'Frankfurt am Main');
    }, 60000);
  }

  // --- Clock ---
  function updateClock() {
    if (!clockEl) return;
    clockEl.textContent = new Date().toLocaleTimeString('de-DE', { hour12: false });
  }

  async function apiCall(endpoint) {
    const resp = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' },
      // Include same-site cookies (Authelia session) so protected endpoints don't redirect
      credentials: 'include'
    });
    if (!resp.ok) throw new Error(`${endpoint} -> ${resp.status}`);
    return resp.json();
  }

  async function refreshAll() {
    try {
      const [opts, incidents, vehicles] = await Promise.all([
        apiCall('/api/options/'),
        apiCall('/api/incidents/'),
        apiCall('/api/vehicles/')
      ]);
      if (opts) {
        state.settings.audioEnabled = !!opts.audio_enabled;
        state.settings.speechEnabled = !!opts.speech_enabled;
        state.settings.alarmSound = opts.alarm_sound || 'gong1.mp3';
        state.settings.speechLanguage = opts.speech_language || 'de-DE';
        state.settings.weather_location = opts.weather_location || '';
      }
      const prevActive = new Set(Array.from(lastActiveIncidentIds));
      state.incidents = Array.isArray(incidents) ? incidents : [];
      const nowActive = new Set((state.incidents || []).filter(i => i.status === 'active').map(i => i.id));
      // Detect newly active incidents and trigger alarm
      const newlyActive = [];
      nowActive.forEach(id => { if (!prevActive.has(id)) newlyActive.push(id); });
      if (newlyActive.length > 0) {
        (state.incidents || []).filter(i => newlyActive.includes(i.id)).forEach(i => {
          triggerAlarm(`Einsatz gestartet: ${i.title}`, i.description || '');
        });
      }
      lastActiveIncidentIds = nowActive;
      state.vehicles = Array.isArray(vehicles) ? vehicles : [];
      renderDashboardIncidents();
      renderDashboardVehicles();
      // Refresh weather when options change
      fetchWeatherFor(state.settings.weather_location || 'Frankfurt am Main');
    } catch (e) {
      console.error('[kiosk] refreshAll failed', e);
    }
  }

  function connectWebSocket() {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.addEventListener('open', () => { state.wsConnected = true; });
      ws.addEventListener('close', () => { state.wsConnected = false; });
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'incident_updated' || msg.type === 'incident_deleted' || msg.type === 'vehicle_updated')) {
            // refresh data on updates
            refreshAll();
          }
        } catch (_) {}
      });
    } catch (e) {
      console.warn('[kiosk] WS failed', e);
    }
  }

  function startPolling() {
    setInterval(() => refreshAll(), 3000);
  }

  function init() {
    // Ensure fullscreen styles are active
    document.body.classList.add('dashboard-fullscreen');
    // First load
    refreshAll();
    // Live updates
    connectWebSocket();
    startPolling();
    startWeatherLoop();
    // Resize after a tick for Leaflet sizing
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch(_) {} }, 80);
    // Clock
    updateClock();
    setInterval(updateClock, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
