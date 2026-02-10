// --- CONFIGURATION ---
const sectionsOrder = ["Breakfast", "Morning", "Lunch", "Afternoon", "Dinner", "Evening", "Night"];

// Initialisation Carte (Vue France par défaut)
const map = L.map('map').setView([46.603354, 1.888334], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Groupes de calques
let currentLayerGroup = L.layerGroup().addTo(map); // Points (Marqueurs)
let polylineGroup = L.layerGroup().addTo(map);     // Lignes (Trajets)

// Données globales
let appData = JSON.parse(localStorage.getItem('planningData')) || {};
let organizedData = {};
let itemsToFetch = [];

// --- 1. CHARGEMENT AUTOMATIQUE (GITHUB / SERVEUR) ---
async function loadDefaultJSON() {
    try {
        console.log("Tentative de récupération du fichier JSON sur le serveur...");
        const infoPanel = document.getElementById('trip-details');
        if(infoPanel) infoPanel.textContent = "Synchronisation...";

        // Ajout du timestamp (?t=...) pour éviter le cache du navigateur
        const response = await fetch('planning_sauvegarde.json?t=' + Date.now());

        if (response.ok) {
            const serverData = await response.json();

            // Mise à jour des données locales avec celles du serveur
            appData = serverData;
            localStorage.setItem('planningData', JSON.stringify(appData));
            console.log("Données chargées depuis GitHub/Serveur !");
        } else {
            console.warn("Fichier JSON non trouvé, utilisation du cache local.");
        }
    } catch (error) {
        console.warn("Erreur chargement distant (offline ?), utilisation du cache local.", error);
    } finally {
        // Quoi qu'il arrive (succès ou échec), on lance l'analyse
        scanData();
    }
}

// --- 2. SCAN DES DONNÉES ---
function scanData() {
    organizedData = {};
    itemsToFetch = [];

    // A. Planning (Dates)
    Object.keys(appData).forEach(key => {
        if (key.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (!organizedData[key]) organizedData[key] = [];

            sectionsOrder.forEach(section => {
                if (appData[key][section] && Array.isArray(appData[key][section])) {
                    appData[key][section].forEach(item => {
                        processItem(item, key, section);
                    });
                }
            });
        }
    });

    // B. Listes (Dossiers)
    if (appData.lists && Array.isArray(appData.lists)) {
        appData.lists.forEach(list => {
            list.items.forEach(item => processItem(item, "Listes", `Dossier: ${list.name}`));
        });
    }

    // C. Staging (Boîte à idées)
    if (appData.staging && Array.isArray(appData.staging)) {
        appData.staging.forEach(item => processItem(item, "Listes", "Boîte à idées"));
    }

    initTimeline();
    checkMissingCoords();
}

// Helper pour traiter un item
function processItem(item, groupKey, sourceName) {
    if (item.place && item.place.trim() !== "") {
        if (!organizedData[groupKey]) organizedData[groupKey] = [];

        organizedData[groupKey].push({
            ...item,
            source: sourceName,
            ref: item // Référence directe pour le géocodage
        });

        if (!item.lat || !item.lon) {
            itemsToFetch.push({ ref: item });
        }
    }
}

// --- 3. TIMELINE ---
function initTimeline() {
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';

    // Filtrer pour ne garder que les clés qui ont des items
    let validKeys = Object.keys(organizedData).filter(k => organizedData[k].length > 0);

    // Séparer Dates et Listes
    let dates = validKeys.filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).sort();
    let hasLists = validKeys.includes("Listes");

    if (validKeys.length === 0) {
        container.innerHTML = '<span style="color:white; padding:10px;">Aucun lieu trouvé.</span>';
        document.getElementById('trip-details').textContent = "Carte vide.";
        return;
    }

    // Bouton TOUT
    const allBtn = document.createElement('div');
    allBtn.className = 'timeline-item';
    allBtn.innerHTML = `<span class="date-num">🌍</span><span class="date-day">Tout</span>`;
    allBtn.onclick = () => showAllPoints(allBtn);
    container.appendChild(allBtn);

    // Boutons DATES
    dates.forEach(dateStr => {
        const dateObj = new Date(dateStr);
        const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
        const dayNum = dateObj.getDate();
        const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' });

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.innerHTML = `<span class="date-day">${dayName}</span><span class="date-num">${dayNum} ${month}</span>`;
        div.onclick = () => showGroup(dateStr, div);
        container.appendChild(div);
    });

    // Bouton LISTES
    if (hasLists) {
        const listBtn = document.createElement('div');
        listBtn.className = 'timeline-item';
        listBtn.style.borderLeft = "1px solid rgba(255,255,255,0.3)";
        listBtn.innerHTML = `<span class="date-day">Non daté</span><span class="date-num">📁 Listes</span>`;
        listBtn.onclick = () => showGroup("Listes", listBtn);
        container.appendChild(listBtn);
    }

    // Afficher TOUT par défaut
    showAllPoints(allBtn);
}

// --- 4. AFFICHAGE VUE GLOBALE (Points uniquement, pas de ligne) ---
function showAllPoints(btnElement) {
    updateBtnStyle(btnElement);
    currentLayerGroup.clearLayers();
    polylineGroup.clearLayers();

    const infoPanel = document.getElementById('trip-details');
    const bounds = [];
    let total = 0;

    // Parcourir toutes les données
    Object.keys(organizedData).forEach(key => {
        organizedData[key].forEach(item => {
            if (item.lat && item.lon) {
                const latLng = [item.lat, item.lon];
                bounds.push(latLng);
                total++;

                L.marker(latLng).addTo(currentLayerGroup)
                 .bindPopup(`
                    <strong>${item.title || 'Sans titre'}</strong><br>
                    <small>${key === "Listes" ? "📁 " + item.source : "📅 " + key}</small><br>
                    📍 ${item.place}
                 `);
            }
        });
    });

    infoPanel.innerHTML = `<strong>Vue Globale</strong><br>📍 ${total} lieux affichés`;

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

// --- 5. AFFICHAGE GROUPE (Jour ou Liste) ---
function showGroup(key, btnElement) {
    updateBtnStyle(btnElement);
    currentLayerGroup.clearLayers();
    polylineGroup.clearLayers();

    const items = organizedData[key];
    const validCoords = [];
    const bounds = [];

    items.forEach((item, index) => {
        if (item.lat && item.lon) {
            const latLng = [item.lat, item.lon];
            validCoords.push(latLng);
            bounds.push(latLng);

            const marker = L.marker(latLng).addTo(currentLayerGroup);
            marker.bindPopup(`
                <div style="text-align:center">
                    <strong>${index + 1}. ${item.title || 'Sans titre'}</strong><br>
                    <span style="color:#e67e22; font-size:0.9em">${item.source}</span><br>
                    <em>${item.place}</em>
                </div>
            `);
        }
    });

    // Tracer la ligne SEULEMENT si c'est une Date (pas les listes en vrac)
    if (key !== "Listes" && validCoords.length > 1) {
        L.polyline(validCoords, {
            color: '#e74c3c', // Rouge
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10', // Pointillés
            lineJoin: 'round'
        }).addTo(polylineGroup);
    }

    document.getElementById('trip-details').innerHTML = `<strong>${key}</strong><br>📍 ${validCoords.length} lieux`;

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

function updateBtnStyle(el) {
    document.querySelectorAll('.timeline-item').forEach(b => b.classList.remove('active'));
    if(el) el.classList.add('active');
}

// --- 6. GÉOCODAGE AUTO ---
async function checkMissingCoords() {
    if (itemsToFetch.length === 0) return;

    const panel = document.getElementById('processing-area');
    const action = document.getElementById('current-action');
    const bar = document.getElementById('p-bar');
    panel.style.display = 'block';

    let processed = 0;
    const total = itemsToFetch.length;

    for (const task of itemsToFetch) {
        action.textContent = `Recherche : ${task.ref.place}`;
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(task.ref.place)}&limit=1`;
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.length > 0) {
                task.ref.lat = data[0].lat;
                task.ref.lon = data[0].lon;
                localStorage.setItem('planningData', JSON.stringify(appData));
            }
        } catch (e) { console.error(e); }

        processed++;
        bar.style.width = (processed / total * 100) + "%";
        await new Promise(r => setTimeout(r, 1100));
    }

    action.textContent = "Terminé.";
    setTimeout(() => { panel.style.display = 'none'; scanData(); }, 1000);
}

// --- 7. IMPORT MANUEL ---
function triggerMapImport() { document.getElementById('map-file-input').click(); }

function loadMapFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            appData = JSON.parse(e.target.result);
            localStorage.setItem('planningData', JSON.stringify(appData));
            alert("Chargé !");
            scanData();
        } catch (err) { alert("Erreur fichier."); }
    };
    reader.readAsText(file);
    input.value = '';
}

// --- DÉMARRAGE ---
// Lance le chargement depuis le serveur/GitHub
loadDefaultJSON();
