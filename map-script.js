// --- CONFIGURATION ---
const sectionsOrder = ["Breakfast", "Morning", "Lunch", "Afternoon", "Dinner", "Evening", "Night"];

// Initialisation Carte
const map = L.map('map').setView([46.603354, 1.888334], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Groupes de calques
let currentLayerGroup = L.layerGroup().addTo(map);
let polylineGroup = L.layerGroup().addTo(map);

// Données
let appData = JSON.parse(localStorage.getItem('planningData')) || {};
let organizedData = {};
let itemsToFetch = [];

// --- 1. SCAN DES DONNÉES (PLANNING + LISTES) ---
function scanData() {
    organizedData = {};
    itemsToFetch = [];

    // A. SCAN DU PLANNING (Dates)
    Object.keys(appData).forEach(key => {
        if (key.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (!organizedData[key]) organizedData[key] = [];

            sectionsOrder.forEach(section => {
                if (appData[key][section] && Array.isArray(appData[key][section])) {
                    appData[key][section].forEach(item => {
                        processItem(item, key, section); // Date comme clé
                    });
                }
            });
        }
    });

    // B. SCAN DES LISTES (Dossiers)
    if (appData.lists && Array.isArray(appData.lists)) {
        appData.lists.forEach(list => {
            list.items.forEach(item => {
                // On les groupe sous la clé "Listes"
                processItem(item, "Listes", `Dossier: ${list.name}`);
            });
        });
    }

    // C. SCAN DE LA BOITE À IDÉES (Staging)
    if (appData.staging && Array.isArray(appData.staging)) {
        appData.staging.forEach(item => {
            processItem(item, "Listes", "Boîte à idées");
        });
    }

    initTimeline();
    checkMissingCoords();
}

// Fonction utilitaire pour traiter un item (qu'il vienne du planning ou d'une liste)
function processItem(item, groupKey, sourceName) {
    if (item.place && item.place.trim() !== "") {
        // Initialiser le groupe s'il n'existe pas
        if (!organizedData[groupKey]) organizedData[groupKey] = [];

        // Ajouter l'item à la liste affichable
        organizedData[groupKey].push({
            ...item,
            source: sourceName, // ex: "Morning" ou "Dossier: Paris"
            ref: item           // Référence pour le géocodage
        });

        // Ajouter à la file d'attente si pas de GPS
        if (!item.lat || !item.lon) {
            itemsToFetch.push({ ref: item });
        }
    }
}

// --- 2. TIMELINE ---
function initTimeline() {
  const container = document.getElementById('timeline-container');
  container.innerHTML = '';

  // Récupérer les clés
  let keys = Object.keys(organizedData);

  // FILTRE : On ne garde que les dates qui ont réellement des items géolocalisés
  // (organizedData ne contient déjà que les items avec lat/lon grâce à scanData,
  // mais on vérifie que le tableau n'est pas vide)
  let validKeys = keys.filter(k => organizedData[k] && organizedData[k].length > 0);

  // Séparer les dates du reste
  let dates = validKeys.filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).sort();
  let hasLists = validKeys.includes("Listes");

  if (validKeys.length === 0) {
      container.innerHTML = '<span style="color:white; padding:10px;">Aucun lieu géolocalisé trouvé.</span>';
      document.getElementById('trip-details').textContent = "Carte vide.";
      return;
  }

    // 1. Bouton TOUT
    const allBtn = document.createElement('div');
    allBtn.className = 'timeline-item';
    allBtn.innerHTML = `<span class="date-num">🌍</span><span class="date-day">Tout</span>`;
    allBtn.onclick = () => showAllPoints(allBtn);
    container.appendChild(allBtn);

    // 2. Boutons DATES
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

    // 3. Bouton LISTES (à la fin)
    if (hasLists) {
        const listBtn = document.createElement('div');
        listBtn.className = 'timeline-item';
        listBtn.style.borderLeft = "1px solid rgba(255,255,255,0.3)";
        listBtn.innerHTML = `<span class="date-day">Non daté</span><span class="date-num">📁 Listes</span>`;
        listBtn.onclick = () => showGroup("Listes", listBtn);
        container.appendChild(listBtn);
    }

    // Activer "Tout" par défaut
    showAllPoints(allBtn);
}

// --- 3. AFFICHAGE VUE GLOBALE (Tout mélangé) ---
function showAllPoints(btnElement) {
    updateBtnStyle(btnElement);
    currentLayerGroup.clearLayers();
    polylineGroup.clearLayers();

    const infoPanel = document.getElementById('trip-details');
    const bounds = [];
    let total = 0;

    // On parcourt TOUS les groupes (Dates + Listes)
    Object.keys(organizedData).forEach(key => {
        organizedData[key].forEach(item => {
            if (item.lat && item.lon) {
                const latLng = [item.lat, item.lon];
                bounds.push(latLng);
                total++;

                // Marqueur
                L.marker(latLng).addTo(currentLayerGroup)
                 .bindPopup(`
                    <strong>${item.title || 'Sans titre'}</strong><br>
                    <small>${key === "Listes" ? "📁 Dans une liste" : "📅 " + key}</small><br>
                    📍 ${item.place}
                 `);
            }
        });
    });

    // Pas de ligne tracée ici (c'est un nuage de points global)

    infoPanel.innerHTML = `<strong>Vue Globale</strong><br>📍 ${total} lieux au total`;

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

// --- 4. AFFICHAGE D'UN GROUPE (Jour ou Liste) ---
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

            L.marker(latLng).addTo(currentLayerGroup).bindPopup(`
                <strong>${item.title || 'Sans titre'}</strong><br>
                <span>${item.source}</span><br>
                <em>${item.place}</em>
            `);
        }
    });

    // TRACER LA LIGNE UNIQUEMENT SI C'EST UNE DATE (Pas pour les listes "En vrac")
    if (key !== "Listes" && validCoords.length > 1) {
        L.polyline(validCoords, {
            color: '#e74c3c',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10',
            lineJoin: 'round'
        }).addTo(polylineGroup);
    }

    document.getElementById('trip-details').innerHTML = `<strong>${key}</strong><br>📍 ${validCoords.length} lieux`;

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

// Helper Style Bouton
function updateBtnStyle(el) {
    document.querySelectorAll('.timeline-item').forEach(b => b.classList.remove('active'));
    if(el) el.classList.add('active');
}

// --- 5. GÉOCODAGE AUTO ---
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

// --- 6. IMPORT ---
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

// Start
scanData();
