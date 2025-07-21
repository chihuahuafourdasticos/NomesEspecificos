import trim from 'lodash-es/trim.js';

const APP_DATA_STORAGE_KEY = 'multiBankNameCpfGeneratorData_v3'; 
const INITIAL_NUM_BANKS = 5; 
const PASSWORD_CONFIRM = '100822';

let appData = {
    databases: {},
    generatedIndices: {}, 
    profileNames: {},
    lastActiveBankKey: null // Added to store the last active bank
};
let generatedIndicesSets = {};
let activeBankKey = null;

// --- DOM Elements ---
const outputElement = document.getElementById('outputText');
const dbStatusElement = document.getElementById('dbStatus');
const dbSection = document.getElementById('dbSection');
const dbSectionTitle = document.getElementById('dbSectionTitle');
const dbInputText = document.getElementById('dbInputText');
const dbMessageElement = document.getElementById('dbMessage');
const profileCirclesContainer = document.getElementById('profileCirclesContainer');
const bankSelectorContainer = document.getElementById('bankSelectorContainer');
const generateFromDbButton = document.getElementById('generateFromDbButton');

// --- UTILITY FUNCTIONS ---
function formatName(nameStr) {
    if (!nameStr) return "";
    const lowerCaseName = nameStr.toLowerCase();
    const words = lowerCaseName.split(' ');
    const articlesPrepositions = ['de', 'da', 'do', 'dos', 'das', 'e'];
    const formattedWords = words.map((word, index) => {
        if (word.length === 0) return "";
        if (index > 0 && articlesPrepositions.includes(word)) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    });
    return formattedWords.filter(Boolean).join(' ');
}

function copyToClipboard(text, buttonElement, successMessage = 'Copiado!', originalText) {
    if (!text) return;
    navigator.clipboard.writeText(text)
        .then(() => {
            const btnText = originalText || (buttonElement ? buttonElement.textContent : '');
            if (buttonElement && buttonElement.tagName === 'BUTTON') { 
                buttonElement.textContent = successMessage;
                buttonElement.disabled = true;
                setTimeout(() => {
                    buttonElement.textContent = btnText;
                    buttonElement.disabled = false;
                }, 2000);
            } else {
                 outputElement.textContent += `\n(${successMessage})`;
                 setTimeout(() => {
                    if (outputElement.textContent.endsWith(`\n(${successMessage})`)) {
                        outputElement.textContent = outputElement.textContent.slice(0, -`\n(${successMessage})`.length);
                    }
                 }, 2000);
            }
        })
        .catch(err => {
            console.error('Erro ao copiar texto: ', err);
            outputElement.textContent += '\n\n(Falha ao copiar para a área de transferência.)';
        });
}

function extractDataFromText(textBlock) {
    const lines = textBlock.split('\n');
    let name = null;
    let cpf = null;
    let yearOfBirth = null;

    // Regex patterns using 'i' flag for case-insensitivity.
    // They match the keyword at the start of the line, optionally preceded by 
    // non-alphanumeric characters (like '•', '*', '-') and/or whitespace.
    // The keyword must be followed by a colon.
    const namePattern = /^(?:[^a-z0-9\s]*\s*)?nome\s*:/i; 
    const cpfPattern = /^(?:[^a-z0-9\s]*\s*)?cpf\s*:/i;    
    const dobPattern = /^(?:[^a-z0-9\s]*\s*)?data\s*(?:de\s*)?nascimento\s*:/i;

    for (const rawLine of lines) {
        const currentLine = trim(rawLine);
        if (currentLine === "") continue;

        if (!name) {
            const nameMatch = currentLine.match(namePattern);
            if (nameMatch) {
                // nameMatch.index is the start of the match in currentLine.
                // nameMatch[0] is the matched string part (e.g., "Nome:", "• nome : ").
                const valuePart = trim(currentLine.substring(nameMatch.index + nameMatch[0].length));
                if (valuePart) name = valuePart;
            }
        }

        if (!cpf) {
            const cpfMatch = currentLine.match(cpfPattern);
            if (cpfMatch) {
                const valuePart = trim(currentLine.substring(cpfMatch.index + cpfMatch[0].length));
                const cpfValue = valuePart.replace(/\D/g, ''); // Remove non-digits
                if (cpfValue && cpfValue.length >= 11) cpf = cpfValue.slice(0, 11); // Take first 11 digits
            }
        }

        if (!yearOfBirth) {
            const dobMatch = currentLine.match(dobPattern);
            if (dobMatch) {
                const valuePart = trim(currentLine.substring(dobMatch.index + dobMatch[0].length));
                // Regex to match DD/MM/YYYY. Allows for other text after the date string.
                const dateParts = valuePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); 
                if (dateParts) {
                    yearOfBirth = parseInt(dateParts[3], 10);
                }
            }
        }
    }
    if (name && cpf && yearOfBirth) return { name, cpf, yearOfBirth };
    return null;
}

function promptForPassword(actionName) {
    const inputPassword = prompt(`Para ${actionName}, digite a senha de confirmação:`);
    if (inputPassword === null) return false; 
    if (inputPassword === PASSWORD_CONFIRM) {
        return true;
    }
    alert("Senha incorreta.");
    return false;
}

// --- MULTI-BANK DATA FUNCTIONS ---
function initializeAppData(numBanks = INITIAL_NUM_BANKS) {
    const defaultAppData = { 
        databases: {}, 
        generatedIndices: {}, 
        profileNames: {},
        lastActiveBankKey: null // Initialize lastActiveBankKey
    };
    for (let i = 1; i <= numBanks; i++) {
        const bankKey = `B-${i}`;
        const profileKey = `P-${i}`;
        defaultAppData.databases[bankKey] = [];
        defaultAppData.generatedIndices[bankKey] = []; 
        defaultAppData.profileNames[profileKey] = `Perfil ${i}`;
        generatedIndicesSets[bankKey] = new Set(); 
    }
    if (numBanks > 0 && defaultAppData.databases['B-1']) {
        defaultAppData.lastActiveBankKey = 'B-1'; // Default to B-1 if banks are created
    }
    return defaultAppData;
}

function loadAppData() {
    const storedData = localStorage.getItem(APP_DATA_STORAGE_KEY);
    let loadedData = storedData ? JSON.parse(storedData) : null;
    let determinedKeyForActivation = null;

    if (!loadedData || Object.keys(loadedData.databases || {}).length === 0) {
        appData = initializeAppData();
        // The lastActiveBankKey is set by initializeAppData
        determinedKeyForActivation = appData.lastActiveBankKey;
    } else {
        appData = loadedData;
        // Ensure appData structure is complete, especially for older stored data
        appData.databases = appData.databases || {};
        appData.generatedIndices = appData.generatedIndices || {};
        appData.profileNames = appData.profileNames || {};
        // appData.lastActiveBankKey will be loaded if it exists, otherwise it's undefined

        const bankKeys = Object.keys(appData.databases);
        
        // Initialize generatedIndicesSets from loaded appData.generatedIndices
        for (const bankKey of bankKeys) {
            const profileNum = bankKey.split('-')[1];
            const profileKey = `P-${profileNum}`;
            appData.databases[bankKey] = appData.databases[bankKey] || [];
            appData.generatedIndices[bankKey] = appData.generatedIndices[bankKey] || [];
            appData.profileNames[profileKey] = appData.profileNames[profileKey] || `Perfil ${profileNum}`;
            generatedIndicesSets[bankKey] = new Set(appData.generatedIndices[bankKey]);
        }

        if (appData.lastActiveBankKey && appData.databases[appData.lastActiveBankKey]) {
            determinedKeyForActivation = appData.lastActiveBankKey;
        } else if (bankKeys.length > 0) {
            const sortedBankKeys = bankKeys.sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));
            determinedKeyForActivation = sortedBankKeys[0]; // Fallback to the first bank
        } else {
            determinedKeyForActivation = null; // No banks, no active key
        }
    }
    
    // setActiveBank will handle setting global activeBankKey, appData.lastActiveBankKey, UI, and saving.
    setActiveBank(determinedKeyForActivation);
}

function updateUIForNoActiveBank() {
    dbStatusElement.textContent = "Nenhum banco de dados disponível ou selecionado.";
    generateFromDbButton.disabled = true;
    document.querySelectorAll('.bank-button.active').forEach(btn => btn.classList.remove('active'));
    dbSectionTitle.textContent = `Adicionar ao Banco de Dados`; 
    // If dbSection is open, its title should reflect no bank is selected for additions.
}

function saveAppData() {
    const dataToSave = JSON.parse(JSON.stringify(appData)); 
    for (const bankKey in generatedIndicesSets) {
        if (dataToSave.generatedIndices.hasOwnProperty(bankKey)) { 
             dataToSave.generatedIndices[bankKey] = Array.from(generatedIndicesSets[bankKey]);
        }
    }
    localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(dataToSave));
    
    // Status update is now part of setActiveBank or specific operations
}

function updateDbStatus(bankKey) {
    if (!bankKey || !appData.databases[bankKey]) {
        // This should ideally not be hit if bankKey is always valid when passed here.
        // updateUIForNoActiveBank handles the general "no active bank" state.
        dbStatusElement.textContent = "Banco inválido ou não encontrado.";
        generateFromDbButton.disabled = true;
        return;
    }
    const count = appData.databases[bankKey].length;
    dbStatusElement.textContent = `Banco ${bankKey}: ${count} pessoa(s) (1974-2004).`;
    dbSectionTitle.textContent = `Adicionar ao Banco de Dados (${bankKey})`;
    generateFromDbButton.disabled = count === 0;
}

function setActiveBank(newBankKey) {
    // newBankKey can be null. If not null, it should ideally be a valid, existing key.
    // Caller is responsible for choosing a sensible newBankKey.
    
    activeBankKey = newBankKey;
    appData.lastActiveBankKey = newBankKey; // Store this choice in appData

    if (activeBankKey && appData.databases[activeBankKey]) {
        updateDbStatus(activeBankKey); // Updates status line and db section title
        dbMessageElement.textContent = ''; // Clear messages when bank changes
        dbMessageElement.className = 'message-area';

        document.querySelectorAll('.bank-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.bankId === activeBankKey);
        });
        // generateFromDbButton status is handled by updateDbStatus
    } else {
        // If newBankKey is null, or it points to a non-existent bank (should be avoided by caller)
        activeBankKey = null; // Ensure global activeBankKey is null
        appData.lastActiveBankKey = null; // Ensure persisted key is null
        updateUIForNoActiveBank();
    }

    saveAppData(); // Persist the change, including the updated lastActiveBankKey
}

function updateUIForActiveBank() { 
    // The core logic is in setActiveBank. Callers should determine the key and call setActiveBank.
    // This was previously used in loadAppData, but loadAppData now calls setActiveBank directly.
    if (appData.lastActiveBankKey && appData.databases[appData.lastActiveBankKey]) {
        setActiveBank(appData.lastActiveBankKey); 
    } else if (Object.keys(appData.databases).length > 0) {
        const firstKey = Object.keys(appData.databases).sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]))[0];
        setActiveBank(firstKey);
    } else {
        setActiveBank(null);
    }
}

// --- UI ELEMENT CREATION ---
function updateProfileCircleDisplay(circleElement, bankId, profileName) {
    circleElement.innerHTML = `
        <span class="profile-bank-id-display">${bankId}</span>
        <span class="profile-name-display">${profileName}</span>
    `;
}

function createProfileCircles() {
    profileCirclesContainer.innerHTML = ''; 
    const bankKeys = Object.keys(appData.databases).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));

    bankKeys.forEach(bankKey => {
        const bankNum = bankKey.split('-')[1];
        const profileKey = `P-${bankNum}`;
        const circle = document.createElement('div');
        circle.className = 'profile-circle';
        circle.dataset.profileId = profileKey;
        circle.dataset.bankId = bankKey;
        
        const profileName = appData.profileNames[profileKey] || `Perfil ${bankNum}`;
        updateProfileCircleDisplay(circle, bankKey, profileName);
        
        circle.addEventListener('click', () => handleProfileClick(bankKey, circle));
        circle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleProfileRename(profileKey, circle);
        });
        profileCirclesContainer.appendChild(circle);
    });

    const addButton = document.createElement('div');
    addButton.id = 'addBankButton';
    addButton.className = 'profile-circle add-bank-button';
    addButton.textContent = '+';
    addButton.title = 'Adicionar novo banco de dados';
    addButton.addEventListener('click', handleAddBankClick);
    profileCirclesContainer.appendChild(addButton);
}

function createBankSelectorButtons() {
    const wrapper = bankSelectorContainer.querySelector('.bank-buttons-wrapper') || document.createElement('div');
    wrapper.className = 'bank-buttons-wrapper';
    wrapper.innerHTML = ''; 

    const bankKeys = Object.keys(appData.databases).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));

    bankKeys.forEach(bankKey => {
        const button = document.createElement('button');
        button.className = 'bank-button';
        button.dataset.bankId = bankKey;
        button.textContent = bankKey;
        button.addEventListener('click', () => setActiveBank(bankKey)); // Clicking a button sets it active
        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleBankContextMenu(e, bankKey);
        });
        wrapper.appendChild(button);
    });
    
    if (!bankSelectorContainer.querySelector('.bank-buttons-wrapper')) {
        bankSelectorContainer.appendChild(wrapper);
    }

    // After creating buttons, ensure the active one is highlighted.
    // setActiveBank called during loadAppData already handles this.
    // If called at other times, ensure UI consistency.
    // The global activeBankKey should be the source of truth for UI updates.
    if (activeBankKey && appData.databases[activeBankKey]) {
        const activeButton = wrapper.querySelector(`.bank-button[data-bank-id="${activeBankKey}"]`);
        if (activeButton) activeButton.classList.add('active');
    } else if (!activeBankKey && bankKeys.length === 0) {
        // If no active bank and no banks exist, updateUIForNoActiveBank has likely run.
        // This is mostly for ensuring button states are correct if this func is called standalone.
         updateUIForNoActiveBank(); // Or simply ensure no button is 'active'
    }
}

// --- EVENT HANDLERS ---

function handleAddBankClick() {
    if (confirm("Deseja criar mais um banco de dados?")) {
        const numExistingBanks = Object.keys(appData.databases).length;
        const newBankNum = numExistingBanks + 1;
        const newBankKey = `B-${newBankNum}`;
        const newProfileKey = `P-${newBankNum}`;

        appData.databases[newBankKey] = [];
        appData.generatedIndices[newBankKey] = [];
        generatedIndicesSets[newBankKey] = new Set();
        appData.profileNames[newProfileKey] = `Perfil ${newBankNum}`;
        // appData.lastActiveBankKey will be updated by setActiveBank
        
        // Save structural changes first
        saveAppData(); // This save won't include the new bank as active yet

        createProfileCircles(); 
        createBankSelectorButtons(); 
        setActiveBank(newBankKey); // This makes the new bank active and saves appData again with lastActiveBankKey updated
        alert(`Banco ${newBankKey} e Perfil ${newBankNum} criados.`);
    }
}

function handleBankContextMenu(event, bankKey) {
    const action = prompt(`Ações para ${bankKey}:\n1. Resetar Banco de Dados\n2. Excluir Banco de Dados\n\nDigite o número da opção (ou cancele):`);
    if (action === '1') { 
        if (promptForPassword(`resetar ${bankKey}`)) {
            if (confirm(`Tem certeza que quer resetar TODOS os dados do ${bankKey}?`)) {
                resetBank(bankKey);
            }
        }
    } else if (action === '2') { 
         if (Object.keys(appData.databases).length <= 1) {
            alert(`Não é possível excluir o último banco de dados.`);
            return;
        }
        if (promptForPassword(`excluir ${bankKey}`)) {
            if (confirm(`Tem certeza que quer EXCLUIR o ${bankKey} e seu perfil associado? Esta ação não pode ser desfeita.`)) {
                deleteBank(bankKey);
            }
        }
    }
}

function resetBank(bankKey) {
    appData.databases[bankKey] = [];
    appData.generatedIndices[bankKey] = [];
    generatedIndicesSets[bankKey].clear();
    saveAppData(); // Save the reset bank data
    if (activeBankKey === bankKey) {
        // Refresh status if the active bank was reset
        updateDbStatus(bankKey); 
        // generateFromDbButton will be disabled by updateDbStatus if bank is empty
    }
    alert(`Banco ${bankKey} foi resetado.`);
}

function deleteBank(bankKeyToDelete) {
    const bankNumToDelete = parseInt(bankKeyToDelete.split('-')[1]);
    const oldTotalBanks = Object.keys(appData.databases).length;

    // Store current active key to see if it's affected
    const previouslyActiveKey = activeBankKey;

    delete appData.databases[bankKeyToDelete];
    delete appData.generatedIndices[bankKeyToDelete];
    delete generatedIndicesSets[bankKeyToDelete];
    delete appData.profileNames[`P-${bankNumToDelete}`];

    // Re-index subsequent banks
    for (let i = bankNumToDelete + 1; i <= oldTotalBanks; i++) {
        const oldBkKey = `B-${i}`;
        const newBkKey = `B-${i - 1}`;
        const oldPrKey = `P-${i}`;
        const newPrKey = `P-${i - 1}`;

        if (appData.databases.hasOwnProperty(oldBkKey)) { 
            appData.databases[newBkKey] = appData.databases[oldBkKey];
            appData.generatedIndices[newBkKey] = appData.generatedIndices[oldBkKey];
            generatedIndicesSets[newBkKey] = generatedIndicesSets[oldBkKey] || new Set(); // ensure set exists
             if(generatedIndicesSets[oldBkKey]) delete generatedIndicesSets[oldBkKey];


            appData.profileNames[newPrKey] = appData.profileNames[oldPrKey];

            delete appData.databases[oldBkKey];
            delete appData.generatedIndices[oldBkKey];
            // delete generatedIndicesSets[oldBkKey]; // Already handled
            delete appData.profileNames[oldPrKey];
        }
    }
    
    let keyToMakeActive = null;
    if (previouslyActiveKey === bankKeyToDelete) {
        // If deleted bank was active, try to select previous or first available
        if (appData.databases[`B-${bankNumToDelete - 1}`]) {
            keyToMakeActive = `B-${bankNumToDelete - 1}`;
        } else if (Object.keys(appData.databases).length > 0) {
            keyToMakeActive = Object.keys(appData.databases).sort((a,b)=>parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]))[0];
        } else {
            keyToMakeActive = null; // No banks left
        }
    } else if (previouslyActiveKey) {
        const activeBankNum = parseInt(previouslyActiveKey.split('-')[1]);
        if (activeBankNum > bankNumToDelete) {
            // Active bank was shifted down
            keyToMakeActive = `B-${activeBankNum - 1}`;
        } else {
            // Active bank was before deleted, or not affected numerically
            keyToMakeActive = previouslyActiveKey;
        }
        // Verify this key still exists (it should if logic is correct)
        if (keyToMakeActive && !appData.databases[keyToMakeActive]) {
             keyToMakeActive = Object.keys(appData.databases).length > 0 ? Object.keys(appData.databases).sort((a,b)=>parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]))[0] : null;
        }
    }
    
    // Save structural changes. lastActiveBankKey in appData is not yet updated to keyToMakeActive.
    saveAppData(); 
    
    createProfileCircles();
    createBankSelectorButtons(); 
    
    setActiveBank(keyToMakeActive); // This will update appData.lastActiveBankKey and save again.
    alert(`Banco ${bankKeyToDelete} foi excluído.`);
}

// Profile Circle Click & Rename
function handleProfileClick(bankKey, circleElementOrButton) {
    if (!appData.databases[bankKey] || appData.databases[bankKey].length === 0) {
        outputElement.textContent = `Banco ${bankKey} está vazio. Adicione dados primeiro.`;
        return;
    }

    const currentBankData = appData.databases[bankKey];
    const currentGeneratedIndices = generatedIndicesSets[bankKey];

    let availableIndices = [];
    for (let i = 0; i < currentBankData.length; i++) {
        if (!currentGeneratedIndices.has(i)) {
            availableIndices.push(i);
        }
    }

    if (availableIndices.length === 0) {
        currentGeneratedIndices.clear(); 
        for (let i = 0; i < currentBankData.length; i++) availableIndices.push(i);
        if (availableIndices.length === 0) {
            outputElement.textContent = `Todos os nomes do banco ${bankKey} foram gerados. Lista reiniciada.\nNenhum nome disponível após reinício.`;
            return;
        }
        outputElement.textContent = `Todos os nomes do banco ${bankKey} foram gerados. Reiniciando a lista.\nTente gerar novamente.`;
        // No immediate generation after reset message, user should click again.
    }
    
    const randomIndexInAvailable = Math.floor(Math.random() * availableIndices.length);
    const originalDbIndex = availableIndices[randomIndexInAvailable];
    
    const person = currentBankData[originalDbIndex];
    currentGeneratedIndices.add(originalDbIndex);
    saveAppData(); 

    const resultText = `Nome: ${person.name}\nCPF: ${person.cpf}`;
    outputElement.textContent = resultText;
    copyToClipboard(resultText, circleElementOrButton.tagName === 'BUTTON' ? circleElementOrButton : null, `Copiado de ${bankKey}!`, 
        circleElementOrButton.tagName === 'BUTTON' ? 'Gerar Novo Nome do Banco Selecionado' : undefined);
}

function handleProfileRename(profileKey, circleElement) {
    const currentName = appData.profileNames[profileKey] || '';
    const bankId = circleElement.dataset.bankId;
    const newName = prompt(`Renomear "${currentName || profileKey}" (associado a ${bankId}) para:`, currentName);
    
    let finalName = currentName;
    if (newName !== null) { 
        finalName = trim(newName);
        if (finalName === "") { 
            const profileNum = profileKey.split('-')[1];
            finalName = `Perfil ${profileNum}`;
        }
    }
    
    appData.profileNames[profileKey] = finalName;
    updateProfileCircleDisplay(circleElement, bankId, finalName);
    saveAppData();
}

// Original "Gerar e Copiar" button
document.getElementById('generateButton').addEventListener('click', () => {
    const inputText = document.getElementById('inputText').value;
    const lines = inputText.split('\n');
    let processedNameLine = '';
    let processedCpfLine = '';

    for (const rawLine of lines) {
        const currentLine = trim(rawLine);
        if (currentLine === "") continue;
        const lowerLine = currentLine.toLowerCase();

        if (!processedNameLine) { 
            const nameKeywordIndex = lowerLine.indexOf('nome');
            if (nameKeywordIndex !== -1 && nameKeywordIndex < 10) {
                const colonIndex = currentLine.indexOf(':', nameKeywordIndex);
                if (colonIndex !== -1) {
                    const nameValue = trim(currentLine.substring(colonIndex + 1));
                    if (nameValue) processedNameLine = `Nome: ${formatName(nameValue)}`;
                }
            }
        }
        if (!processedCpfLine) { 
            const cpfKeywordIndex = lowerLine.indexOf('cpf');
            if (cpfKeywordIndex !== -1 && cpfKeywordIndex < 10) {
                const colonIndex = currentLine.indexOf(':', cpfKeywordIndex);
                if (colonIndex !== -1) {
                    const cpfValue = trim(currentLine.substring(colonIndex + 1)).replace(/\D/g, '');
                    if (cpfValue) processedCpfLine = `CPF: ${cpfValue}`;
                }
            }
        }
        if (processedNameLine && processedCpfLine) break; 
    }

    let resultText = '';
    if (processedNameLine) resultText += processedNameLine;
    if (processedCpfLine) resultText += (resultText ? '\n' : '') + processedCpfLine;
    
    outputElement.textContent = resultText;
    if (resultText) {
        copyToClipboard(resultText, document.getElementById('generateButton'), 'Copiado!', 'Gerar e Copiar Imediatamente');
    } else {
        outputElement.textContent = "Nenhuma informação de Nome ou CPF encontrada para extração rápida.\nCertifique-se que o texto contém linhas como 'Nome: SEU NOME' e 'CPF: SEU CPF'.";
    }
});

// "Adicionar/Ver Dados do Banco Selecionado" toggle button
document.getElementById('dbToggleButton').addEventListener('click', () => {
    if (!activeBankKey) {
        alert("Por favor, selecione um banco de dados primeiro.");
        return;
    }
    dbSection.classList.toggle('hidden');
    if (!dbSection.classList.contains('hidden')) {
        dbMessageElement.textContent = ''; 
        dbSectionTitle.textContent = `Adicionar ao Banco de Dados (${activeBankKey})`;
    }
});

// "Fechar" button for DB section
document.getElementById('closeDbSectionButton').addEventListener('click', () => {
    dbSection.classList.add('hidden');
});

// "Salvar no Banco de Dados Selecionado" button
document.getElementById('saveToDbButton').addEventListener('click', () => {
    if (!activeBankKey) {
        dbMessageElement.textContent = 'Nenhum banco selecionado. Por favor, selecione um banco.';
        dbMessageElement.className = 'message-area error';
        return;
    }

    const rawDbInput = dbInputText.value;
    const recordBlocks = rawDbInput.split(/(?=Nome:)/gi); 
    
    let savedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    let errorMessages = [];

    const currentBankDb = appData.databases[activeBankKey];

    recordBlocks.forEach(block => {
        const trimmedBlock = trim(block);
        if (!trimmedBlock) return;
        const data = extractDataFromText(trimmedBlock);

        if (data) {
            if (data.yearOfBirth >= 1974 && data.yearOfBirth <= 2004) {
                const formattedName = formatName(data.name);
                const existingEntry = currentBankDb.find(p => p.cpf === data.cpf);
                if (existingEntry) {
                    duplicateCount++;
                    errorMessages.push(`CPF ${data.cpf} (${formattedName}) já existe no ${activeBankKey}.`);
                } else {
                    currentBankDb.push({
                        name: formattedName,
                        cpf: data.cpf,
                        yearOfBirth: data.yearOfBirth,
                    });
                    savedCount++;
                }
            } else {
                skippedCount++;
                errorMessages.push(`Registro para "${data.name}" (ano ${data.yearOfBirth}) ignorado, fora do intervalo 1974-2004.`);
            }
        } else {
            const snippet = trimmedBlock.length > 60 ? trimmedBlock.substring(0, 60) + "..." : trimmedBlock;
            errorMessages.push(`Não foi possível extrair dados válidos do trecho: "${snippet}". Verifique o formato.`);
        }
    });

    if (savedCount > 0) {
        saveAppData(); // This save won't include the new bank as active yet
        dbInputText.value = ''; 
        generateFromDbButton.disabled = !activeBankKey || appData.databases[activeBankKey].length === 0;
    }

    let summaryMessage = `${savedCount} registro(s) salvo(s) em ${activeBankKey}.`;
    if (skippedCount > 0) summaryMessage += ` ${skippedCount} ignorado(s).`;
    if (duplicateCount > 0) summaryMessage += ` ${duplicateCount} duplicado(s).`;
    
    dbMessageElement.innerHTML = summaryMessage + (errorMessages.length > 0 ? '<br>Detalhes:<br>' + errorMessages.join('<br>') : '');
    dbMessageElement.className = (savedCount > 0 && errorMessages.length === 0) ? 'message-area success' : 'message-area error';
    if (activeBankKey) updateDbStatus(activeBankKey); 
});

// "Gerar Novo Nome do Banco Selecionado" button
generateFromDbButton.addEventListener('click', () => {
    if (!activeBankKey) {
        outputElement.textContent = "Nenhum banco selecionado. Clique em um dos botões B-N.";
        return;
    }
    handleProfileClick(activeBankKey, generateFromDbButton);
});

// Backup and Restore Buttons
document.getElementById('backupButton').addEventListener('click', () => {
    try {
        const dataStr = JSON.stringify(appData, null, 2);
        const dataBlob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        link.download = `backup-gerador-dados-${timestamp}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Erro ao criar backup:", error);
        alert("Ocorreu um erro ao tentar criar o backup.");
    }
});

document.getElementById('restoreButton').addEventListener('click', () => {
    document.getElementById('restoreInput').click();
});

document.getElementById('restoreInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("Tem certeza que deseja restaurar os dados deste arquivo? TODOS os dados atuais serão substituídos. Esta ação não pode ser desfeita.")) {
        event.target.value = null; // Reset file input
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            // Basic validation
            if (loadedData && typeof loadedData.databases === 'object' && typeof loadedData.profileNames === 'object') {
                appData = loadedData;
                saveAppData(); // Save the new data to localStorage
                fullAppRefresh(); // Redraw UI from the new data
                alert("Backup restaurado com sucesso!");
            } else {
                throw new Error("Formato de arquivo inválido.");
            }
        } catch (error) {
            console.error("Erro ao restaurar backup:", error);
            alert(`Falha ao restaurar o backup. O arquivo pode estar corrompido ou em um formato incorreto.\n\nDetalhes: ${error.message}`);
        } finally {
            event.target.value = null; // Reset file input
        }
    };
    reader.onerror = () => {
        alert("Erro ao ler o arquivo de backup.");
        event.target.value = null; // Reset file input
    };
    reader.readAsText(file);
});

// "Resetar TODOS os Bancos de Dados e Perfis" button
document.getElementById('resetAllDbsButton').addEventListener('click', () => {
    if (confirm("Tem certeza que deseja resetar TODOS os bancos de dados e nomes de perfis? Esta ação não pode ser desfeita.")) {
        if(promptForPassword("resetar TUDO")) {
            localStorage.removeItem(APP_DATA_STORAGE_KEY);
            // activeBankKey = null; // Will be set by setActiveBank
            appData = initializeAppData(INITIAL_NUM_BANKS); 
            // appData now has default lastActiveBankKey (e.g., 'B-1' or null)
            
            saveAppData(); // Save the freshly initialized state
            
            createProfileCircles();
            createBankSelectorButtons();
            
            // Set active bank based on the new initialized state's lastActiveBankKey
            setActiveBank(appData.lastActiveBankKey); 
            
            outputElement.textContent = "Todos os dados foram resetados.";
            dbMessageElement.textContent = '';
            dbSection.classList.add('hidden');
            alert("Todos os bancos de dados e perfis foram resetados.");
        }
    }
});

// --- HELP MODAL ---
const helpModal = document.getElementById('helpModal');
const helpButton = document.getElementById('helpButton');
const closeButton = document.querySelector('.modal-close-button');

helpButton.addEventListener('click', () => {
    helpModal.style.display = 'block';
});

closeButton.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target == helpModal) {
        helpModal.style.display = 'none';
    }
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadAppData(); // This will load data, determine active bank, and call setActiveBank.
                  // setActiveBank then updates UI and saves.
    createProfileCircles(); 
    createBankSelectorButtons();
    
    // The active bank (and its UI indication) is handled by loadAppData -> setActiveBank.
    // No need for explicit setActiveBank call here again unless loadAppData doesn't fully set UI.
    // The createBankSelectorButtons might need to ensure the .active class is correctly set based on global activeBankKey.
    // Let's ensure createBankSelectorButtons correctly reflects current activeBankKey. (Added logic in that function)
});