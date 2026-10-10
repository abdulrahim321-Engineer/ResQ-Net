# ResQ Net - National Smart Ambulance & Emergency Response

ResQ Net is a high-tech tactical control center and coordination system for emergency services. It connects citizens requesting emergency ambulances to real-time traffic-aware routing, patient history verification, and hospital load balancing.

## Hackathon Pitch & Technology Stack

We architected ResQ Net to be secure, fast, and entirely sovereign. For this prototype, we carefully selected free, open-source APIs that allow the platform to be hosted on in-house national servers without relying on third-party commercial mapping engines (like Google Maps) which can compromise citizen privacy and require heavy billing.

### 🌐 Map & Routing Stack (Privacy-First)
- **Leaflet & OpenStreetMap (OSM):** Interactive tracking map that can run entirely offline on localized servers without commercial API limits.
- **CartoDB Dark Tiles:** Used to provide a premium, low-light "tactical" UI for emergency dispatchers.
- **OSRM (Open Source Routing Machine):** Used to calculate road routes, ETAs, and traffic paths without paid quotas.

### ☁️ Environmental Context
- **Open-Meteo API:** A completely free, unmetered API providing live weather conditions (temperature, wind speed) to dispatchers directly on the dashboard, helping assess environmental hazards for the ambulance.

### 📱 Patient Identity & Data (Mobile Simulator)
- **Regex CNIC Parsing & OCR Simulation:** Simulates extracting Pakistani CNIC data (using an OCR-like camera interface) and retrieving high-priority medical alerts (like allergies and blood type) so paramedics are prepared before they arrive.
- **Simulated Hardware APIs:** Haptic feedback and visual cues for the SOS panic button.

## Getting Started

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000` to view the Dispatch Dashboard.
4. Open `http://localhost:3000/mobile` to view the Citizen App & Scanner.
