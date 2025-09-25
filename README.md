# Feuerwehr Melder - Features

This is a feature list for the Feuerwehr Melder application.

## Feature Checklist

- [ ] **Dashboard:** Overview of active, draft, and closed incidents.
- [ ] **Incident Management:**
  - [ ] Create new incidents.
  - [ ] View incident details.
  - [ ] Update incident status (e.g., end incident).
  - [ ] Delete incidents.
- [ ] **Vehicle Management:**
  - [ ] Add new vehicles.
  - [ ] Edit existing vehicles.
  - [ ] Delete vehicles.
- [ ] **Alarming System:**
  - [ ] Trigger alarms with sound and speech.
  - [ ] Pre-alert functionality.
  - [ ] Re-alert functionality.
- [ ] **Monitor View:**
  - [ ] Dedicated display for active incidents.
  - [ ] Show weather information.
  - [ ] Display a clock.
- [ ] **Notifications:** Send and display custom messages.
- [ ] **Audio Control:**
  - [ ] Enable/disable audio.
  - [ ] Select and test different alarm sounds.
- [ ] **Real-time Data Sync:** Keep data synchronized across pcs.
- [ ] **Settings Page:** Configure vehicles and other options.
- [ ] **Demo Data:** Initialize the application with sample data.


.
├── app
│   ├── api
│   │   ├── __init__.py
│   │   ├── router.py
│   │   └── routes
│   │       └── user
│   │           ├── endpoints.py
│   │           ├── __init__.py
│   │           └── schemas.py
│   ├── core
│   │   ├── api_rate_limmiter.py
│   │   ├── config.py
│   │   ├── __init__.py
│   ├── db
│   │   ├── __init__.py
│   │   ├── sql
│   │   │   ├── connect.py
│   │   │   ├── __init__.py
│   │   │   ├── role.py
│   │   │   └── user.py
│   └── web
│       └── index.html
├── docker-compose.yml
├── main.py
├── pyproject.toml
└── README.md