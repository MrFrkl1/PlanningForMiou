// --- Configuration ---
const sections = ["Breakfast", "Morning", "Lunch", "Afternoon", "Dinner", "Evening", "Night"];

// --- État ---
const today = new Date();
let displayDate = new Date();
let selectedDateKey = null;

// Initialisation des données
let appData = JSON.parse(localStorage.getItem('planningData')) || {};
// Nouvelle structure pour les listes si elle n'existe pas
if (!appData.lists) {
    appData.lists = [
        { name: "À faire", collapsed: false, items: [] } // Liste par défaut
    ];
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    selectedDateKey = `${y}-${m}-${d}`;

    initCalendar();
    renderPlanner();
    if (typeof renderLists === "function") renderLists();

    // --- AJOUTEZ CETTE LIGNE ICI ---
    loadDefaultJSON();
});

// --- Calendrier (inchangé ou presque) ---
function changeMonth(offset) {
    displayDate.setDate(1);
    displayDate.setMonth(displayDate.getMonth() + offset);
    initCalendar();
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const monthYearEl = document.getElementById('month-year');
    calendarEl.innerHTML = '';

    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    monthYearEl.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) calendarEl.appendChild(document.createElement('div'));

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('day');
        dayEl.textContent = day;
        const dateKey = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (appData[dateKey]) dayEl.classList.add('has-data');
        if (selectedDateKey === dateKey) dayEl.classList.add('selected');

        dayEl.onclick = () => selectDate(dateKey, dayEl);
        calendarEl.appendChild(dayEl);
    }
}

function selectDate(dateKey, element) {
    selectedDateKey = dateKey;
    document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
    if(element) element.classList.add('selected');

    const [y, m, d] = dateKey.split('-');
    const dateObj = new Date(y, m - 1, d);
    const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
    document.getElementById('current-date-display').textContent = `Planning du ${dayName} ${d}-${m}-${y}`;

    renderPlanner();

    // NOUVEAU : Ferme le menu automatiquement sur mobile après avoir choisi une date
    if (window.innerWidth <= 800) {
        closeSidebar();
    }
}

// --- LISTES SIDEBAR (Nouveau système) ---

function createNewList() {
    const name = prompt("Nom de la nouvelle liste ?", "Nouvelle Liste");
    if (name) {
        appData.lists.push({ name: name, collapsed: false, items: [] });
        saveAndRefresh();
    }
}

function renderLists() {
    const container = document.getElementById('lists-container');
    container.innerHTML = '';

    appData.lists.forEach((list, listIndex) => {
        const listWrapper = document.createElement('div');
        listWrapper.className = 'list-wrapper';

        // HEADER DE LA LISTE
        listWrapper.innerHTML = `
            <div class="list-title-bar">
                <span class="list-name" onclick="toggleList(${listIndex})">
                    ${list.collapsed ? '&#9654;' : '&#9660;'} ${list.name}
                </span>
                <div class="list-actions">
                    <button class="icon-btn" onclick="addBlockToList(${listIndex})" title="Ajouter">+Item</button>
                    <button class="icon-btn" onclick="deleteList(${listIndex})" title="Supprimer">&times;</button>
                </div>
            </div>
            <div class="list-body ${list.collapsed ? 'hidden' : ''}"
                 ondragover="allowDrop(event, this)"
                 ondrop="handleDropOnList(event, ${listIndex})">
                </div>
        `;

        // ITEMS DE LA LISTE
        const listBody = listWrapper.querySelector('.list-body');
        list.items.forEach((item, itemIndex) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'sidebar-card';
            itemEl.draggable = true;

            // Drag Start
            itemEl.ondragstart = (e) => {
                e.dataTransfer.setData("type", "list");
                e.dataTransfer.setData("listIndex", listIndex);
                e.dataTransfer.setData("itemIndex", itemIndex);
                e.dataTransfer.setData("data", JSON.stringify(item));
            };

            const isExpanded = item.expanded === true;

            itemEl.innerHTML = `
                <div class="card-header" onclick="toggleListItem(${listIndex}, ${itemIndex})">
                    <div class="card-preview">
                        <span class="card-preview-title">${item.title || '(Sans titre)'}</span>
                        <span class="card-preview-place">${item.place || ''}</span>
                    </div>
                    <span class="card-toggle-icon">${isExpanded ? '&#9650;' : '&#9660;'}</span>
                </div>
                <div class="card-details ${isExpanded ? '' : 'hidden'}">
                    <input class="sidebar-input" placeholder="Titre" value="${item.title || ''}"
                           oninput="updateListItem(${listIndex}, ${itemIndex}, 'title', this.value)">
                    <input class="sidebar-input" placeholder="Lieu" value="${item.place || ''}"
                           oninput="updateListItem(${listIndex}, ${itemIndex}, 'place', this.value)">
                    <textarea class="sidebar-input" placeholder="Note" rows="2"
                           oninput="updateListItem(${listIndex}, ${itemIndex}, 'desc', this.value)">${item.desc || ''}</textarea>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                        <button class="icon-btn" onclick="deleteListItem(${listIndex}, ${itemIndex})" style="color:#e74c3c">Supprimer</button>
                    </div>
                </div>
            `;
            listBody.appendChild(itemEl);
        });

        container.appendChild(listWrapper);
    });
}

// Actions Listes
function toggleList(index) {
    appData.lists[index].collapsed = !appData.lists[index].collapsed;
    renderLists();
}

function deleteList(index) {
    if(confirm('Supprimer cette liste et tout son contenu ?')) {
        appData.lists.splice(index, 1);
        saveAndRefresh();
    }
}

function addBlockToList(listIndex) {
    appData.lists[listIndex].items.push({title: '', place: '', desc: '', img: '', expanded: true});
    appData.lists[listIndex].collapsed = false; // Ouvrir la liste si fermée
    saveAndRefresh();
}

// Actions Items Liste
function toggleListItem(listIndex, itemIndex) {
    const item = appData.lists[listIndex].items[itemIndex];
    item.expanded = !item.expanded;
    // On ne fait qu'un saveToLocal + renderLists pour éviter de reset le calendrier
    saveToLocal();
    renderLists();
}

function updateListItem(listIndex, itemIndex, field, value) {
    appData.lists[listIndex].items[itemIndex][field] = value;
    saveToLocal(); // Pas de refresh complet pour garder le focus
}

function deleteListItem(listIndex, itemIndex) {
    appData.lists[listIndex].items.splice(itemIndex, 1);
    saveAndRefresh();
}


// --- PLANNING (Zone Principale) ---

function renderPlanner() {
    const container = document.getElementById('planner-container');
    container.innerHTML = '';
    if (!selectedDateKey) return;
    if (!appData[selectedDateKey]) appData[selectedDateKey] = {};

    sections.forEach(section => {
        const sectionData = appData[selectedDateKey][section] || [];
        const sectionEl = document.createElement('div');
        sectionEl.className = 'section';

        sectionEl.ondragover = (e) => allowDrop(e, sectionEl);
        sectionEl.ondragleave = (e) => sectionEl.classList.remove('drag-over');
        sectionEl.ondrop = (e) => handleDropOnPlanner(e, section);

        sectionEl.innerHTML = `
            <div class="section-header">
                <span class="section-title">${section}</span>
                <button class="add-btn" onclick="addBlock('${section}')">+ Ajouter</button>
            </div>
            <div class="blocks-container" id="blocks-${section}"></div>
        `;
        container.appendChild(sectionEl);

        const blocksContainer = sectionEl.querySelector(`#blocks-${section}`);
        sectionData.forEach((block, index) => {
            const blockEl = createBlockElement(section, index, block);
            // Configurer le drag depuis le planning
            blockEl.draggable = true;
            blockEl.ondragstart = (e) => {
                e.dataTransfer.setData("type", "planner");
                e.dataTransfer.setData("dateKey", selectedDateKey);
                e.dataTransfer.setData("section", section);
                e.dataTransfer.setData("index", index);
                e.dataTransfer.setData("data", JSON.stringify(block));
            };
            blocksContainer.appendChild(blockEl);
        });
    });
}

function createBlockElement(section, index, data) {
    const div = document.createElement('div');
    div.className = 'block-card';
    div.innerHTML = `
        <div class="block-img-container" onclick="triggerImgUpload(this, '${section}', ${index})">
            ${data.img ? `<img src="${data.img}">` : '<span>Photo</span>'}
            <input type="file" onchange="handleImgUpload(this, '${section}', ${index})">
        </div>
        <div class="block-inputs">
            <input class="block-input" placeholder="Titre" value="${data.title}" oninput="updatePlannerData('${section}', ${index}, 'title', this.value)">
            <input class="block-input" placeholder="Lieu" value="${data.place}" oninput="updatePlannerData('${section}', ${index}, 'place', this.value)">
            <textarea class="block-input" placeholder="Desc" rows="2" oninput="updatePlannerData('${section}', ${index}, 'desc', this.value)">${data.desc}</textarea>
        </div>
        <button class="delete-btn" onclick="deleteBlock('${section}', ${index})">×</button>
    `;
    return div;
}

// --- LOGIQUE DRAG & DROP BIDIRECTIONNELLE ---

function allowDrop(e, el) {
    e.preventDefault();
    el.classList.add('drag-over');
}

// Drop vers le Planning
function handleDropOnPlanner(e, targetSection) {
    e.preventDefault();
    document.querySelectorAll('.section').forEach(s => s.classList.remove('drag-over'));

    const type = e.dataTransfer.getData("type");
    const dataString = e.dataTransfer.getData("data");
    if (!dataString) return;
    const itemData = JSON.parse(dataString);

    // 1. Ajouter au planning
    if (!appData[selectedDateKey][targetSection]) appData[selectedDateKey][targetSection] = [];
    appData[selectedDateKey][targetSection].push(itemData);

    // 2. Supprimer de la source
    if (type === "list") {
        const lIdx = e.dataTransfer.getData("listIndex");
        const iIdx = e.dataTransfer.getData("itemIndex");
        appData.lists[lIdx].items.splice(iIdx, 1);
    } else if (type === "planner") {
        const srcDate = e.dataTransfer.getData("dateKey");
        const srcSec = e.dataTransfer.getData("section");
        const srcIdx = e.dataTransfer.getData("index");
        // Si on déplace dans le MEME jour et la MEME section, on ne supprime pas (duplication) ou logique de tri
        // Ici on supprime de l'ancienne position :
        appData[srcDate][srcSec].splice(srcIdx, 1);
    }

    saveAndRefresh();
}

// Drop vers une Liste
function handleDropOnList(e, listIndex) {
    e.preventDefault();
    document.querySelectorAll('.list-body').forEach(l => l.classList.remove('drag-over'));

    const type = e.dataTransfer.getData("type");
    const dataString = e.dataTransfer.getData("data");
    if (!dataString) return;
    const itemData = JSON.parse(dataString);

    // S'assurer que le bloc est replié quand il arrive dans la liste
    itemData.expanded = false;

    // 1. Ajouter à la liste
    appData.lists[listIndex].items.push(itemData);
    appData.lists[listIndex].collapsed = false; // Ouvrir la liste

    // 2. Supprimer de la source
    if (type === "planner") {
        const srcDate = e.dataTransfer.getData("dateKey");
        const srcSec = e.dataTransfer.getData("section");
        const srcIdx = e.dataTransfer.getData("index");
        appData[srcDate][srcSec].splice(srcIdx, 1);
    } else if (type === "list") {
        // Déplacement d'une liste à l'autre
        const lIdx = e.dataTransfer.getData("listIndex");
        const iIdx = e.dataTransfer.getData("itemIndex");
        // Si c'est la même liste, on pourrait gérer le réordonnancement, mais ici on gère le déplacement inter-liste
        // Attention : si même liste, push puis splice risque de décaler.
        // Simple fix : on supprime d'abord si source != destination ou logique plus complexe
        // Pour faire simple : on supprime de la source.
        appData.lists[lIdx].items.splice(iIdx, 1);
    }

    saveAndRefresh();
}


// --- Helpers CRUD Planning ---
function addBlock(section) {
    if (!appData[selectedDateKey][section]) appData[selectedDateKey][section] = [];
    appData[selectedDateKey][section].push({title: '', place: '', desc: '', img: ''});
    saveAndRefresh();
}
function updatePlannerData(section, index, field, value) {
    appData[selectedDateKey][section][index][field] = value;
    saveToLocal();
}
function deleteBlock(section, index) {
    if (confirm('Supprimer ?')) {
        appData[selectedDateKey][section].splice(index, 1);
        saveAndRefresh();
    }
}

// --- Images ---
window.triggerImgUpload = (div) => div.querySelector('input').click();
window.handleImgUpload = (input, section, index) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            appData[selectedDateKey][section][index].img = e.target.result;
            saveAndRefresh();
        };
        reader.readAsDataURL(file);
    }
}

// --- Sauvegarde ---
// --- Persistance (Nettoyage & Sauvegarde) ---

function saveToLocal() {
    // 1. NETTOYAGE : On supprime les jours vides avant de sauvegarder
    Object.keys(appData).forEach(key => {
        // On ne touche pas aux listes ou au staging, juste aux dates (YYYY-MM-DD)
        if (key.match(/^\d{4}-\d{2}-\d{2}$/)) {
            let isEmptyDay = true;

            // On vérifie chaque section de la journée
            sections.forEach(section => {
                const sectionBlocks = appData[key][section];
                if (sectionBlocks && sectionBlocks.length > 0) {
                    // On vérifie s'il y a au moins UN bloc qui n'est pas vide
                    const hasContent = sectionBlocks.some(block =>
                        (block.title && block.title.trim() !== "") ||
                        (block.place && block.place.trim() !== "") ||
                        (block.desc && block.desc.trim() !== "") ||
                        block.img
                    );

                    if (hasContent) {
                        isEmptyDay = false;
                    }
                }
            });

            // Si la journée est vide, on supprime la clé
            if (isEmptyDay) {
                delete appData[key];
            }
        }
    });

    // 2. SAUVEGARDE
    localStorage.setItem('planningData', JSON.stringify(appData));
}
//function saveToLocal() { localStorage.setItem('planningData', JSON.stringify(appData)); }
function saveAndRefresh() {
    saveToLocal();
    renderPlanner();
    renderLists();
    initCalendar();
}

// --- IMPORT / EXPORT (Fichiers) ---

function exportData() {
    // 1. Convertir les données en texte JSON
    const dataStr = JSON.stringify(appData);

    // 2. Créer un "Blob" (un fichier virtuel en mémoire)
    const blob = new Blob([dataStr], { type: "application/json" });

    // 3. Créer une URL pour ce blob
    const url = URL.createObjectURL(blob);

    // 4. Créer un lien invisible et cliquer dessus pour lancer le téléchargement
    const link = document.createElement('a');
    link.href = url;
    link.download = `planning_sauvegarde.json`;
    document.body.appendChild(link);
    link.click();

    // 5. Nettoyage
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function triggerImport() {
    // Simule le clic sur l'input file caché
    document.getElementById('import-file').click();
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;

    // Avertissement de sécurité pour l'utilisateur
    if (!confirm("Attention : Charger un fichier va REMPLACER toutes les données actuelles de ce navigateur. Voulez-vous continuer ?")) {
        input.value = ''; // Reset l'input
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // 1. Lire et analyser le JSON
            const importedData = JSON.parse(e.target.result);

            // 2. Vérification basique (est-ce bien notre format ?)
            if (!importedData.lists && !importedData.staging && Object.keys(importedData).length === 0) {
                 alert("Ce fichier ne semble pas être un planning valide.");
                 return;
            }

            // 3. Mettre à jour l'application
            appData = importedData;

            // 4. Sauvegarder dans le navigateur
            saveToLocal();

            // 5. Tout rafraichir
            initCalendar();
            renderLists();
            renderPlanner();

            alert("Planning chargé avec succès !");

        } catch (err) {
            console.error(err);
            alert("Erreur lors de la lecture du fichier. Le format est peut-être corrompu.");
        }
    };
    reader.readAsText(file);

    // Reset pour pouvoir réimporter le même fichier si besoin
    input.value = '';
}

// --- CHARGEMENT AUTOMATIQUE DEPUIS LE SERVEUR (GITHUB) ---

async function loadDefaultJSON() {
    try {
        console.log("Tentative de chargement du fichier JSON...");

        // 1. On va chercher le fichier.
        // L'ajout de "?t=" + Date.now() est une astuce pour empêcher le navigateur
        // de garder une vieille version en cache (force le rechargement).
        const response = await fetch('planning_sauvegarde.json?t=' + Date.now());

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        // 2. On récupère les données
        const serverData = await response.json();

        // 3. LOGIQUE DE SÉCURITÉ :
        // On vérifie si les données du serveur sont différentes de celles locales.
        // Pour faire simple ici : ON ÉCRASE TOUT avec le fichier du serveur.
        // C'est ce que vous avez demandé (le fichier fait foi).

        appData = serverData;

        // 4. On met à jour l'interface
        saveToLocal(); // On synchronise aussi le LocalStorage
        initCalendar();
        renderPlanner();
        if (typeof renderLists === "function") renderLists(); // Si vous avez la version avec les listes

        // Petit message discret pour dire que c'est chargé
        const indicator = document.querySelector('.save-indicator');
        if (indicator) {
            indicator.textContent = "Données chargées depuis le fichier JSON ✅";
            indicator.style.color = "#2ecc71";
        }

    } catch (error) {
        console.warn("Aucun fichier 'planning_sauvegarde.json' trouvé ou erreur de lecture.", error);
        // Ce n'est pas grave, on garde les données du LocalStorage s'il y en a.
    }
}

// --- GESTION DU MENU MOBILE ---

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    // Sécurité : si l'ID n'existe pas, on affiche une alerte pour vous prévenir !
    if (!sidebar) {
        alert("Erreur : Il manque l'attribut id='sidebar' dans votre fichier HTML !");
        return;
    }

    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}
