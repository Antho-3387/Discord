/**
 * Discord Clone - Frontend (Client)
 * Gestion des événements, WebSocket et Interface utilisateur
 */

// ===========================
// 🔌 CONNEXION SOCKET.IO
// ===========================

const socket = io();
let currentUser = null;
let currentChannelId = null;

// ===========================
// 🌐 VARIABLES GLOBALES
// ===========================

const loginModal = document.getElementById('loginModal');
const mainInterface = document.getElementById('mainInterface');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const addChannelBtn = document.getElementById('addChannelBtn');
const createChannelModal = document.getElementById('createChannelModal');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const channelsList = document.getElementById('channelsList');
const currentUsername = document.getElementById('currentUsername');
const userAvatarDisplay = document.getElementById('userAvatarDisplay');
const profileModal = document.getElementById('profileModal');

let channels = [];
const messageCache = {};
let usersInChannel = {}; // Stocker les utilisateurs dans chaque canal
let managingChannelId = null; // Salon en cours de gestion
let userProfiles = {}; // Cache les images de profil
let currentLoadingChannelId = null; // Tracker le canal en cours de chargement pour éviter les race conditions

// ===========================
// 🔐 GESTION DE LA CONNEXION
// ===========================

let isRegisterMode = false;
let authToken = localStorage.getItem('discord_token');

/**
 * Basculer entre mode connexion et inscription
 */
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const loginBtn = document.getElementById('loginBtn');
  const subtitle = document.getElementById('loginSubtitle');
  const switchText = document.getElementById('authSwitchText');
  const switchBtn = document.getElementById('authSwitchBtn');

  if (isRegisterMode) {
    loginBtn.textContent = 'Créer un compte';
    subtitle.textContent = 'Créez votre compte pour commencer';
    switchText.textContent = 'Déjà un compte ?';
    switchBtn.textContent = 'Se connecter';
  } else {
    loginBtn.textContent = 'Se connecter';
    subtitle.textContent = 'Connectez-vous pour continuer';
    switchText.textContent = 'Pas encore de compte ?';
    switchBtn.textContent = 'Créer un compte';
  }

  // Reset erreur
  const errorEl = document.getElementById('loginError');
  errorEl.classList.remove('show');
}

/**
 * Fonction de connexion / inscription
 */
function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) {
    showLoginError('Veuillez entrer un pseudo!');
    return;
  }

  if (username.length < 3) {
    showLoginError('Le pseudo doit contenir au moins 3 caractères!');
    return;
  }

  if (!password) {
    showLoginError('Veuillez entrer un mot de passe!');
    return;
  }

  if (isRegisterMode && password.length < 4) {
    showLoginError('Le mot de passe doit contenir au moins 4 caractères!');
    return;
  }

  const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';

  // Désactiver le bouton pendant la requête
  const loginBtnEl = document.getElementById('loginBtn');
  loginBtnEl.disabled = true;
  loginBtnEl.textContent = isRegisterMode ? 'Inscription...' : 'Connexion...';

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        currentUser = data.username;
        authToken = data.token;
        localStorage.setItem('discord_token', data.token);
        localStorage.setItem('discord_username', data.username);
        currentUsername.textContent = currentUser;
        loadChannels();
        showMainInterface();
      } else {
        showLoginError(data.error || 'Erreur lors de la connexion');
      }
    })
    .catch(error => {
      console.error('Erreur:', error);
      showLoginError('Erreur de connexion au serveur!');
    })
    .finally(() => {
      loginBtnEl.disabled = false;
      loginBtnEl.textContent = isRegisterMode ? 'Créer un compte' : 'Se connecter';
    });
}

/**
 * Auto-login avec le token sauvegardé
 */
function tryAutoLogin() {
  const savedToken = localStorage.getItem('discord_token');
  const savedUsername = localStorage.getItem('discord_username');

  if (!savedToken || !savedUsername) return;

  fetch('/api/auth/verify', {
    headers: { 'Authorization': `Bearer ${savedToken}` }
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        currentUser = data.username;
        authToken = savedToken;
        currentUsername.textContent = currentUser;
        loadChannels();
        showMainInterface();
        console.log('🔄 Auto-login réussi:', currentUser);
      } else {
        // Token expiré, nettoyer
        localStorage.removeItem('discord_token');
        localStorage.removeItem('discord_username');
      }
    })
    .catch(() => {
      // Erreur réseau, garder le token pour réessayer plus tard
      console.log('⚠️ Auto-login échoué, affichage login');
    });
}

/**
 * Afficher un message d'erreur de connexion
 */
function showLoginError(message) {
  const errorElement = document.getElementById('loginError');
  errorElement.textContent = message;
  errorElement.classList.add('show');
  setTimeout(() => {
    errorElement.classList.remove('show');
  }, 3000);
}

/**
 * Afficher l'interface principale
 */
function showMainInterface() {
  loginModal.classList.remove('active');
  mainInterface.classList.remove('hidden');

  // Charger le profil de l'utilisateur
  loadUserProfile(currentUser);

  // Notifier le serveur de la connexion - obtenir le premier canal de la première catégorie
  if (channels.length > 0) {
    const firstCategory = channels[0];
    if (firstCategory.channels && firstCategory.channels.length > 0) {
      const firstChannel = firstCategory.channels[0];
      socket.emit('user_joined', {
        username: currentUser,
        channelId: firstChannel.id
      });
      selectChannel(firstChannel.id);
    }
  }
}

/**
 * Déconnexion
 */
logoutBtn.addEventListener('click', () => {
  currentUser = null;
  currentChannelId = null;
  authToken = null;
  localStorage.removeItem('discord_token');
  localStorage.removeItem('discord_username');
  mainInterface.classList.add('hidden');
  loginModal.classList.add('active');
  usernameInput.value = '';
  passwordInput.value = '';
  messageCache = {};
  socket.emit('disconnect');
});

// ===========================
// 📡 CHARGEMENT DES SALONS
// ===========================

/**
 * Charger toutes les catégories avec leurs salons
 */
function loadChannels() {
  fetch('/api/categories')
    .then(response => response.json())
    .then(data => {
      channels = data;
      renderChannels();
    })
    .catch(error => {
      console.error('Erreur chargement catégories:', error);
    });
}

/**
 * Afficher les catégories et salons dans la sidebar
 */
function renderChannels() {
  const categoriesList = document.getElementById('categoriesList');
  const channelsList = document.getElementById('channelsList');
  
  categoriesList.innerHTML = '';
  channelsList.innerHTML = '';

  if (channels.length === 0) {
    categoriesList.innerHTML = '<p style="padding: 15px; color: var(--text-secondary); font-size: 0.85rem;">Aucune catégorie</p>';
    return;
  }

  // Afficher les catégories dans la section CATÉGORIES
  channels.forEach((category, index) => {
    // Créer le conteneur de la catégorie
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-item';
    categoryDiv.dataset.categoryId = category.id;
    
    // Header de la catégorie avec boutons
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.innerHTML = `
      <div class="category-header-content">
        <span class="category-toggle" onclick="toggleCategory(${category.id})">▼</span>
        <span class="category-name">${category.name}</span>
      </div>
      <div class="category-actions">
        <button class="category-btn" onclick="openCreateChannelInCategory(${category.id})" title="Ajouter canal">+</button>
        <button class="category-btn" onclick="openCategoryManager(${category.id}, event)" title="Gérer">⚙️</button>
      </div>
    `;
    categoryDiv.appendChild(categoryHeader);

    // Liste des salons dans la catégorie
    const channelsContainer = document.createElement('ul');
    channelsContainer.className = 'category-channels';
    channelsContainer.id = `category-${category.id}-channels`;

    if (category.channels && category.channels.length > 0) {
      category.channels.forEach(channel => {
        const li = document.createElement('li');
        li.className = 'channel-item';
        li.draggable = true;
        li.dataset.channelId = channel.id;
        li.dataset.categoryId = category.id;
        
        li.innerHTML = `
          <div class="channel-item-container">
            <span class="channel-item-name" onclick="selectChannel(${channel.id})">
              # ${channel.name}
            </span>
            <div class="channel-item-actions">
              <button class="channel-btn" onclick="openChannelManager(${channel.id}, event)" title="Gérer">⚙️</button>
            </div>
          </div>
        `;

        if (channel.id === currentChannelId) {
          li.classList.add('active');
        }

        channelsContainer.appendChild(li);
      });
    }

    categoryDiv.appendChild(channelsContainer);
    categoriesList.appendChild(categoryDiv);
  });

  // Récupérer les salons sans catégorie
  fetch('/api/channels')
    .then(response => response.json())
    .then(allChannels => {
      const orphanChannels = allChannels.filter(ch => !ch.categoryId);
      
      orphanChannels.forEach(channel => {
        const li = document.createElement('li');
        li.className = 'channel-item';
        li.draggable = true;
        li.dataset.channelId = channel.id;
        
        li.innerHTML = `
          <div class="channel-item-container">
            <span class="channel-item-name" onclick="selectChannel(${channel.id})">
              # ${channel.name}
            </span>
            <div class="channel-item-actions">
              <button class="channel-btn" onclick="openChannelManager(${channel.id}, event)" title="Gérer">⚙️</button>
            </div>
          </div>
        `;

        if (channel.id === currentChannelId) {
          li.classList.add('active');
        }

        channelsList.appendChild(li);
      });
    })
    .catch(error => console.error('Erreur chargement salons orphelins:', error));
  
  // Ajouter les listeners de drag & drop
  setTimeout(() => addDragAndDropListeners(), 0);
}

/**
 * Basculer le visibilité d'une catégorie
 */
function toggleCategory(categoryId) {
  const channelsContainer = document.getElementById(`category-${categoryId}-channels`);
  const categoryItem = document.querySelector(`[data-category-id="${categoryId}"]`);
  const toggle = categoryItem.querySelector('.category-toggle');
  
  if (channelsContainer.classList.contains('hidden')) {
    channelsContainer.classList.remove('hidden');
    toggle.textContent = '▼';
  } else {
    channelsContainer.classList.add('hidden');
    toggle.textContent = '▶';
  }
}

/**
 * Ouvrir le modal de création de canal dans une catégorie
 */
function openCreateChannelInCategory(categoryId) {
  window.currentCategoryForNewChannel = categoryId;
  createChannelModal.classList.add('active');
  document.getElementById('newChannelInput').focus();
}

/**
 * Ouvrir le gestionnaire de catégorie
 */
function openCategoryManager(categoryId, event) {
  event.stopPropagation();
  window.managingCategoryId = categoryId;
  
  // Réinitialiser les formulaires
  document.getElementById('categoryManageOptions').style.display = 'block';
  document.getElementById('renameCategoryForm').style.display = 'none';
  document.getElementById('deleteCategoryConfirm').style.display = 'none';
  
  const categoryManageModal = document.getElementById('categoryManageModal');
  categoryManageModal.classList.add('active');
}

/**
 * Ouvrir le formulaire de renommage de catégorie
 */
function openRenameCategory() {
  document.getElementById('categoryManageOptions').style.display = 'none';
  document.getElementById('renameCategoryForm').style.display = 'block';
  
  // Pré-remplir avec le nom actuel
  const category = channels.find(c => c.id === window.managingCategoryId);
  if (category) {
    document.getElementById('renameCategoryInput').value = category.name;
  }
  document.getElementById('renameCategoryInput').focus();
}

/**
 * Confirmer le renommage de catégorie
 */
function confirmRenameCategory() {
  const newName = document.getElementById('renameCategoryInput').value.trim();
  
  if (!newName) {
    alert('Veuillez entrer un nom pour la catégorie!');
    return;
  }

  if (newName.length < 2) {
    alert('Le nom doit contenir au moins 2 caractères!');
    return;
  }

  socket.emit('update_category', {
    categoryId: window.managingCategoryId,
    name: newName
  });

  closeCategoryManager();
}

/**
 * Annuler le renommage de catégorie
 */
function cancelRenameCategory() {
  document.getElementById('categoryManageOptions').style.display = 'block';
  document.getElementById('renameCategoryForm').style.display = 'none';
}

/**
 * Ouvrir la confirmation de suppression de catégorie
 */
function openDeleteCategory() {
  document.getElementById('categoryManageOptions').style.display = 'none';
  document.getElementById('deleteCategoryConfirm').style.display = 'block';
}

/**
 * Confirmer la suppression de catégorie
 */
function confirmDeleteCategory() {
  socket.emit('delete_category', {
    categoryId: window.managingCategoryId
  });

  closeCategoryManager();
}

/**
 * Annuler la suppression de catégorie
 */
function cancelDeleteCategory() {
  document.getElementById('categoryManageOptions').style.display = 'block';
  document.getElementById('deleteCategoryConfirm').style.display = 'none';
}

/**
 * Fermer le gestionnaire de catégorie
 */
function closeCategoryManager() {
  const categoryManageModal = document.getElementById('categoryManageModal');
  categoryManageModal.classList.remove('active');
  window.managingCategoryId = null;
}

/**
 * Fermer le modal de création de catégorie
 */
function closeCreateCategoryModal() {
  const createCategoryModal = document.getElementById('createCategoryModal');
  createCategoryModal.classList.remove('active');
  document.getElementById('newCategoryInput').value = '';
}

/**
 * Créer une nouvelle catégorie
 */
function createCategory() {
  const categoryName = document.getElementById('newCategoryInput').value.trim();

  if (!categoryName) {
    alert('Veuillez entrer un nom de catégorie!');
    return;
  }

  if (categoryName.length < 2) {
    alert('Le nom de la catégorie doit contenir au moins 2 caractères!');
    return;
  }

  socket.emit('create_category', {
    categoryName: categoryName
  });

  closeCreateCategoryModal();
}
/**
 * Bouton pour créer une catégorie (récupéré du HTML)
 */
const createCategoryHeaderBtn = document.getElementById('createCategoryHeaderBtn');
if (createCategoryHeaderBtn) {
  createCategoryHeaderBtn.onclick = () => {
    document.getElementById('createCategoryModal').classList.add('active');
    document.getElementById('newCategoryInput').focus();
  };
}

/**
 * Fermer les modals en cliquant en dehors
 */
const categoryManageModal = document.getElementById('categoryManageModal');
const createCategoryModal = document.getElementById('createCategoryModal');

categoryManageModal.addEventListener('click', (e) => {
  if (e.target === categoryManageModal) {
    closeCategoryManager();
  }
});

createCategoryModal.addEventListener('click', (e) => {
  if (e.target === createCategoryModal) {
    closeCreateCategoryModal();
  }
});

/**
 * Événement Enter dans l'input de création de catégorie
 */
document.getElementById('newCategoryInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createCategory();
  }
});

/**
 * Événement Enter dans l'input de renommage de catégorie
 */
document.getElementById('renameCategoryInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmRenameCategory();
  }
});

/**
 * ===========================
 * 🎯 DRAG & DROP - Déplacement de salons
 * ===========================
 */

let draggedChannelId = null;
let draggedFromCategoryId = null;

// Ajouter les événements de drag & drop de façon dynamique après le rendu
function addDragAndDropListeners() {
  // Écouter les dragstart sur tous les salons
  document.querySelectorAll('[data-channelId]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedChannelId = parseInt(item.dataset.channelId);
      draggedFromCategoryId = item.dataset.categoryId ? parseInt(item.dataset.categoryId) : null;
      item.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      draggedChannelId = null;
      draggedFromCategoryId = null;
    });
  });

  // Permettre le drop sur les catégories
  document.querySelectorAll('[data-category-id]').forEach(category => {
    category.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      category.style.backgroundColor = 'rgba(88, 101, 242, 0.2)';
    });

    category.addEventListener('dragleave', (e) => {
      if (e.target === category) {
        category.style.backgroundColor = '';
      }
    });

    category.addEventListener('drop', (e) => {
      e.preventDefault();
      category.style.backgroundColor = '';
      
      const categoryId = parseInt(category.dataset.categoryId);
      if (draggedChannelId) {
        moveChannelToCategory(draggedChannelId, categoryId);
      }
    });
  });

  // Permettre le drop sur la liste des salons orphelins
  const channelsList = document.getElementById('channelsList');
  if (channelsList) {
    channelsList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      channelsList.style.backgroundColor = 'rgba(88, 101, 242, 0.2)';
    });

    channelsList.addEventListener('dragleave', (e) => {
      if (e.target === channelsList) {
        channelsList.style.backgroundColor = '';
      }
    });

    channelsList.addEventListener('drop', (e) => {
      e.preventDefault();
      channelsList.style.backgroundColor = '';
      
      if (draggedChannelId && draggedFromCategoryId !== null) {
        moveChannelToCategory(draggedChannelId, null);
      }
    });
  }
}

/**
 * Déplacer un salon vers une catégorie
 */
function moveChannelToCategory(channelId, categoryId) {
  socket.emit('move_channel', {
    channelId: channelId,
    categoryId: categoryId
  });
}

/**
 * Sélectionner un salon
 */
function selectChannel(channelId) {
  currentChannelId = channelId;

  // Mettre à jour l'interface
  document.querySelectorAll('.channel-item').forEach(item => {
    item.classList.remove('active');
  });
  event.target?.closest('.channel-item')?.classList.add('active');

  // Chercher le canal dans les catégories
  let channel = null;
  for (const category of channels) {
    if (category.channels) {
      channel = category.channels.find(c => c.id === channelId);
      if (channel) break;
    }
  }

  // Mettre à jour l'en-tête
  if (channel) {
    document.getElementById('channelName').textContent = `# ${channel.name}`;
    document.getElementById('channelDescription').textContent = 
      channel.description || 'Aucune description';
  }

  // Notifier le serveur du changement de canal
  socket.emit('switch_channel', {
    channelId,
    username: currentUser
  });

  // Charger les messages du canal
  loadMessages(channelId);
  
  // Mettre à jour la liste des utilisateurs en ligne
  updateOnlineUsers(channelId);
}

// ===========================
// 💬 GESTION DES MESSAGES
// ===========================

/**
 * Charger les messages d'un canal
 */
function loadMessages(channelId) {
  // Tracker le canal en cours de chargement pour éviter les race conditions
  currentLoadingChannelId = channelId;
  
  fetch(`/api/messages/${channelId}`)
    .then(response => response.json())
    .then(messages => {
      // Vérifier que c'est toujours le même canal qu'on devrait afficher
      if (currentLoadingChannelId === channelId) {
        messageCache[channelId] = messages;
        renderMessages(messages);
      }
    })
    .catch(error => {
      console.error('Erreur chargement messages:', error);
    });
}

/**
 * Afficher les messages dans le conteneur
 */
function renderMessages(messages) {
  // Vérifier que c'est le bon canal qu'on affiche
  if (currentLoadingChannelId !== currentChannelId) {
    return;
  }
  
  messagesContainer.innerHTML = '';

  // Charger les profils de tous les auteurs de messages en parallèle
  const authors = [...new Set(messages.map(m => m.author))];
  const profilePromises = authors.map(author => {
    if (author && !userProfiles[author]) {
      return loadUserProfile(author);
    }
    return Promise.resolve();
  });

  // Attendre que tous les profils soient chargés avant d'afficher
  Promise.all(profilePromises).then(() => {
    // Vérifier une dernière fois que c'est toujours le bon canal
    if (currentLoadingChannelId === currentChannelId) {
      messagesContainer.innerHTML = '';
      messages.forEach(message => {
        addMessageToUI(message);
      });

      // Scroller en bas
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }).catch(error => {
    console.error('Erreur lors du chargement des profils:', error);
  });
}

/**
 * Ajouter un message à l'interface
 */
function addMessageToUI(message, isSystem = false) {
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'system-message' : 'message';

  if (isSystem) {
    messageEl.textContent = message.text;
  } else {
    const date = new Date(message.timestamp);
    const time = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris'
    });

    // Obtenir l'image de profil ou la première lettre
    const profileImage = userProfiles[message.author]?.profile_image;
    const avatarContent = profileImage 
      ? `<img src="${profileImage}" alt="${message.author}">`
      : message.author.charAt(0).toUpperCase();

    let messageContent = `<div class="message-content">
        <div class="message-header">
          <span class="message-author">${escapeHtml(message.author)}</span>
          <span class="message-timestamp">${time}</span>
        </div>`;

    // Vérifier si c'est une image ou un message texte
    if (message.content.startsWith('data:image/') || message.content.startsWith('IMAGE:')) {
      // C'est une image
      const imageData = message.content.startsWith('IMAGE:') ? message.content.substring(6) : message.content;
      messageContent += `<div class="message-image-wrapper">
        <img src="${imageData}" alt="Image" class="message-image" onclick="openImageFullView('${imageData}')">
      </div>`;
    } else {
      // C'est du texte
      messageContent += `<div class="message-text">${escapeHtml(message.content)}</div>`;
    }

    messageContent += `</div>`;

    messageEl.innerHTML = `
      <div class="message-avatar">${avatarContent}</div>
      ${messageContent}
    `;
  }

  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Ouvrir une image en grand
 */
function openImageFullView(imageSrc) {
  const fullViewDiv = document.getElementById('imageFullView');
  if (!fullViewDiv) {
    const div = document.createElement('div');
    div.id = 'imageFullView';
    div.className = 'image-full-view active';
    div.innerHTML = `<img src="${imageSrc}" onclick="event.stopPropagation()">`;
    div.onclick = () => div.classList.remove('active');
    document.body.appendChild(div);
  } else {
    fullViewDiv.querySelector('img').src = imageSrc;
    fullViewDiv.classList.add('active');
  }
}

/**
 * Compresser une image pour un message
 */
function compressImageForMessage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxWidth = 800;
      const maxHeight = 600;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compresser en JPEG
      let quality = 0.8;
      let compressed = canvas.toDataURL('image/jpeg', quality);

      // Réduire la qualité si c'est trop volumineux (max 1MB)
      while (compressed.length > 1048576 && quality > 0.3) {
        quality -= 0.1;
        compressed = canvas.toDataURL('image/jpeg', quality);
      }

      callback(compressed);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Envoyer un message avec ou sans image
 */
function sendMessage() {
  const content = messageInput.value.trim();
  const imageInput = document.getElementById('imageInput');
  const file = imageInput.files[0];

  if (!content && !file) {
    return;
  }

  if (!currentUser || !currentChannelId) {
    alert('Erreur: utilisateur ou canal non défini');
    return;
  }

  if (file) {
    // Vérifier le type de fichier
    if (!file.type.startsWith('image/')) {
      alert('❌ Seules les images sont acceptées');
      return;
    }

    // Vérifier la taille
    if (file.size > 10 * 1024 * 1024) {
      alert('❌ L\'image est trop grande (max 10MB)');
      return;
    }

    // Compresser et envoyer l'image
    compressImageForMessage(file, (compressedImageData) => {
      const optimisticMessage = {
        id: Date.now(),
        author: currentUser,
        content: compressedImageData,
        channelId: currentChannelId,
        timestamp: new Date().toISOString()
      };

      addMessageToUI(optimisticMessage);

      socket.emit('send_message', {
        author: currentUser,
        content: compressedImageData,
        channelId: currentChannelId,
        isImage: true
      });

      messageInput.value = '';
      imageInput.value = '';
      messageInput.focus();

      socket.emit('stop_typing', {
        username: currentUser,
        channelId: currentChannelId
      });
    });
  } else {
    // Envoyer le message texte
    const optimisticMessage = {
      id: Date.now(),
      author: currentUser,
      content,
      channelId: currentChannelId,
      timestamp: new Date().toISOString()
    };

    addMessageToUI(optimisticMessage);

    socket.emit('send_message', {
      author: currentUser,
      content,
      channelId: currentChannelId
    });

    messageInput.value = '';
    messageInput.focus();

    socket.emit('stop_typing', {
      username: currentUser,
      channelId: currentChannelId
    });
  }
}

/**
 * Gérer la sélection d'une image
 */
document.getElementById('imageInput')?.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    sendMessage();
  }
});

/**
 * Événement Enter pour envoyer un message
 */
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/**
 * Détecteur de typing
 */
let typingTimeout;
messageInput.addEventListener('input', () => {
  clearTimeout(typingTimeout);
  
  if (messageInput.value.length > 0) {
    socket.emit('typing', {
      username: currentUser,
      channelId: currentChannelId
    });
  }
  
  typingTimeout = setTimeout(() => {
    socket.emit('stop_typing', {
      username: currentUser,
      channelId: currentChannelId
    });
  }, 2000);
});

/**
 * Événement clic sur le bouton Envoyer
 */
sendBtn.addEventListener('click', sendMessage);

// ===========================
// 📢 CRÉATION DE SALONS
// ===========================

/**
 * Afficher le modal de création de salon
 */
addChannelBtn.addEventListener('click', () => {
  // Par défaut, ajouter le canal à la première catégorie
  if (channels.length > 0) {
    window.currentCategoryForNewChannel = channels[0].id;
  }
  createChannelModal.classList.add('active');
  document.getElementById('newChannelInput').focus();
});

/**
 * Fermer le modal de création de salon
 */
function closeCreateChannelModal() {
  createChannelModal.classList.remove('active');
  document.getElementById('newChannelInput').value = '';
}

/**
 * Créer un nouveau salon
 */
function createChannel() {
  const channelName = document.getElementById('newChannelInput').value.trim();

  if (!channelName) {
    alert('Veuillez entrer un nom de salon!');
    return;
  }

  if (channelName.length < 3) {
    alert('Le nom du salon doit contenir au moins 3 caractères!');
    return;
  }

  socket.emit('create_channel', {
    channelName: channelName.toLowerCase(),
    categoryId: window.currentCategoryForNewChannel || null
  });

  closeCreateChannelModal();
}

/**
 * Événement Enter dans l'input de création de canal
 */
document.getElementById('newChannelInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createChannel();
  }
});

/**
 * Fermer le modal en cliquant en dehors
 */
createChannelModal.addEventListener('click', (e) => {
  if (e.target === createChannelModal) {
    closeCreateChannelModal();
  }
});

// ===========================
// 👤 GESTION DU PROFIL
// ===========================

/**
 * Charger le profil de l'utilisateur
 */
function loadUserProfile(username) {
  // Ne pas recharger si déjà en cache
  if (userProfiles[username]) {
    return Promise.resolve(userProfiles[username]);
  }
  
  return fetch(`/api/users/${username}`)
    .then(response => response.json())
    .then(data => {
      userProfiles[username] = data;
      if (username === currentUser) {
        updateUserAvatarDisplay(username, data.profile_image);
      }
      return data;
    })
    .catch(error => {
      console.error('Erreur chargement profil:', error);
      return null;
    });
}

/**
 * Mettre à jour l'affichage de l'avatar
 */
function updateUserAvatarDisplay(username, imageData) {
  const avatar = document.getElementById('userAvatarDisplay');
  
  if (imageData) {
    avatar.innerHTML = `<img src="${imageData}" alt="${username}">`;
  } else {
    avatar.innerHTML = username.charAt(0).toUpperCase();
  }
}

/**
 * Ouvrir le modal de profil (clic sur l'avatar)
 */
userAvatarDisplay.addEventListener('click', () => {
  document.getElementById('profileUsername').textContent = currentUser;
  document.getElementById('profileImageDisplay').innerHTML = userAvatarDisplay.innerHTML;
  profileModal.classList.add('active');
});

/**
 * Fermer le modal de profil
 */
function closeProfileModal() {
  profileModal.classList.remove('active');
  document.getElementById('profileImageInput').value = '';
}

/**
 * Compresser une image avant upload
 */
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Redimensionner si trop grande (max 300x300)
      if (width > 300 || height > 300) {
        if (width > height) {
          height = Math.round((height * 300) / width);
          width = 300;
        } else {
          width = Math.round((width * 300) / height);
          height = 300;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convertir avec compression
      canvas.toBlob(
        (blob) => {
          const compressedReader = new FileReader();
          compressedReader.onload = (ev) => {
            callback(ev.target.result);
          };
          compressedReader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.7
      );
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Uploader l'image de profil
 */
function uploadProfileImage() {
  const fileInput = document.getElementById('profileImageInput');
  const file = fileInput.files[0];

  if (!file) {
    alert('Veuillez sélectionner une image');
    return;
  }

  // Vérifier le type de fichier
  if (!file.type.startsWith('image/')) {
    alert('Veuillez sélectionner une image valide');
    return;
  }

  // Vérifier la taille initiale
  if (file.size > 10485760) {
    alert('L\'image doit faire moins de 10MB');
    return;
  }

  alert('🔄 Compression en cours...');

  // Compresser l'image
  compressImage(file, (compressedImageData) => {
    // Vérifier la taille après compression
    if (compressedImageData.length > 2097152) {
      alert('❌ L\'image compressée est encore trop grande');
      return;
    }

    alert('📤 Upload en cours...');

    // Envoyer au serveur
    fetch(`/api/users/${currentUser}/profile-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageData: compressedImageData })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          if (!userProfiles[currentUser]) {
            userProfiles[currentUser] = {};
          }
          userProfiles[currentUser].profile_image = compressedImageData;
          updateUserAvatarDisplay(currentUser, compressedImageData);
          document.getElementById('profileImageDisplay').innerHTML = `<img src="${compressedImageData}" alt="${currentUser}">`;
          alert('✅ Image de profil mise à jour!');
          closeProfileModal();
        } else {
          alert('❌ Erreur: ' + (data.error || 'Impossible de mettre à jour l\'image'));
        }
      })
      .catch(error => {
        console.error('Erreur upload:', error);
        alert('❌ Erreur lors de l\'upload: ' + error.message);
      });
  });
}

/**
 * Fermer le modal de profil en cliquant en dehors
 */
profileModal.addEventListener('click', (e) => {
  if (e.target === profileModal) {
    closeProfileModal();
  }
});

// ===========================
// 📋 GESTION DES SALONS
// ===========================

const channelManageModal = document.getElementById('channelManageModal');

/**
 * Ouvrir le gestionnaire de salon
 */
function openChannelManager(channelId, event) {
  event.stopPropagation(); // Empêcher la sélection du salon
  managingChannelId = channelId;
  
  // Réinitialiser le modal
  document.getElementById('channelManageOptions').style.display = 'block';
  document.getElementById('renameChannelForm').style.display = 'none';
  document.getElementById('deleteChannelConfirm').style.display = 'none';
  
  channelManageModal.classList.add('active');
}

/**
 * Ouvrir le formulaire de renommage
 */
function openRenameChannel() {
  document.getElementById('channelManageOptions').style.display = 'none';
  document.getElementById('renameChannelForm').style.display = 'block';
  
  const channel = channels.find(c => c.id === managingChannelId);
  if (channel) {
    document.getElementById('renameChannelInput').value = channel.name;
    document.getElementById('renameChannelInput').focus();
  }
}

/**
 * Confirmer le renommage
 */
function confirmRenameChannel() {
  const newName = document.getElementById('renameChannelInput').value.trim();
  
  if (!newName) {
    alert('Le nom du salon est requis');
    return;
  }
  
  socket.emit('update_channel', {
    channelId: managingChannelId,
    name: newName,
    description: ''
  });
  
  channelManageModal.classList.remove('active');
}

/**
 * Annuler le renommage
 */
function cancelRenameChannel() {
  document.getElementById('channelManageOptions').style.display = 'block';
  document.getElementById('renameChannelForm').style.display = 'none';
}

/**
 * Ouvrir la confirmation de suppression
 */
function openDeleteChannel() {
  document.getElementById('channelManageOptions').style.display = 'none';
  document.getElementById('deleteChannelConfirm').style.display = 'block';
}

/**
 * Confirmer la suppression
 */
function confirmDeleteChannel() {
  socket.emit('delete_channel', {
    channelId: managingChannelId
  });
  
  channelManageModal.classList.remove('active');
}

/**
 * Annuler la suppression
 */
function cancelDeleteChannel() {
  document.getElementById('channelManageOptions').style.display = 'block';
  document.getElementById('deleteChannelConfirm').style.display = 'none';
}

/**
 * Mettre à jour tous les avatars des messages d'un utilisateur
 */
function updateMessageAvatars(username, imageData) {
  const messageElements = document.querySelectorAll('.message');
  
  messageElements.forEach(messageEl => {
    const authorSpan = messageEl.querySelector('.message-author');
    
    if (authorSpan && authorSpan.textContent.trim() === username) {
      const avatarDiv = messageEl.querySelector('.message-avatar');
      if (avatarDiv) {
        // Remplacer le contenu de l'avatar
        if (imageData) {
          avatarDiv.innerHTML = `<img src="${imageData}" alt="${username}">`;
        } else {
          avatarDiv.innerHTML = username.charAt(0).toUpperCase();
        }
      }
    }
  });
}

/**
 * Fermer le modal de gestion en cliquant en dehors
 */
channelManageModal.addEventListener('click', (e) => {
  if (e.target === channelManageModal) {
    channelManageModal.classList.remove('active');
  }
});

// ===========================
// 🔌 ÉVÉNEMENTS SOCKET.IO
// ===========================

/**
 * Réception d'un nouveau message
 */
socket.on('new_message', (message) => {
  // Mettre à jour le cache
  if (!messageCache[message.channelId]) {
    messageCache[message.channelId] = [];
  }
  messageCache[message.channelId].push(message);

  // Afficher le message seulement si on est dans le bon canal
  if (message.channelId === currentChannelId) {
    addMessageToUI(message);
  }
});

/**
 * Confirmation que le message a été sauvegardé par le serveur
 */
socket.on('message_confirmed', (data) => {
  // Le message optimiste est déjà affiché, on peut mettre à jour l'ID réel si besoin
  console.log('✅ Message confirmé:', data.message.id);
});

/**
 * Événement: Un utilisateur a rejoint
 */
socket.on('user_joined', (data) => {
  addMessageToUI({
    text: `✅ ${data.username} a rejoint le salon`
  }, true);
  
  // Mettre à jour la liste des utilisateurs
  updateOnlineUsers(currentChannelId);
});

/**
 * Événement: Un utilisateur a quitté
 */
socket.on('user_left', (data) => {
  addMessageToUI({
    text: `❌ ${data.username} a quitté le salon`
  }, true);
  
  // Mettre à jour la liste des utilisateurs
  updateOnlineUsers(currentChannelId);
});

/**
 * Événement: Un utilisateur tape
 */
socket.on('user_typing', (data) => {
  if (data.channelId === currentChannelId && data.username !== currentUser) {
    showTypingIndicator(data.username);
  }
});

/**
 * Événement: Un utilisateur arrête de taper
 */
socket.on('user_stopped_typing', (data) => {
  if (data.channelId === currentChannelId) {
    hideTypingIndicator(data.username);
  }
});

/**
 * Événement: Mise à jour des utilisateurs en ligne
 */
socket.on('users_update', (data) => {
  usersInChannel[data.channelId] = data.users;
  if (data.channelId === currentChannelId) {
    updateOnlineUsersDisplay();
  }
});

/**
 * Événement: Nouveau canal créé
 */
socket.on('channel_created', (channel) => {
  // Recharger les catégories pour avoir la structure à jour
  loadChannels();
  
  // Message système
  addMessageToUI({
    text: `📢 Nouveau salon créé: #${channel.name}`
  }, true);
});

/**
 * Événement: Catégorie créée
 */
socket.on('category_created', (category) => {
  // Recharger les catégories
  loadChannels();
  
  // Message système
  addMessageToUI({
    text: `📁 Nouvelle catégorie créée: ${category.name}`
  }, true);
});

/**
 * Événement: Catégorie modifiée
 */
socket.on('category_updated', (updatedCategory) => {
  // Recharger les catégories pour avoir la structure à jour
  loadChannels();
  
  // Message système
  addMessageToUI({
    text: `✏️ Catégorie modifiée: ${updatedCategory.name}`
  }, true);
});

/**
 * Événement: Catégorie supprimée
 */
socket.on('category_deleted', (data) => {
  // Recharger les catégories
  loadChannels();
  
  // Message système
  addMessageToUI({
    text: `🗑️ Catégorie supprimée: ${data.categoryName}`
  }, true);
});

/**
 * Événement: Canal supprimé
 */
socket.on('channel_deleted', (data) => {
  channels = channels.filter(c => c.id !== data.channelId);
  renderChannels();
  
  // Si on était dans le salon supprimé, aller au premier salon
  if (currentChannelId === data.channelId && channels.length > 0) {
    selectChannel(channels[0].id);
  }
  
  addMessageToUI({
    text: `🗑️ Salon supprimé: #${data.channelName}`
  }, true);
});

/**
 * Événement: Canal modifié
 */
socket.on('channel_updated', (updatedChannel) => {
  const index = channels.findIndex(c => c.id === updatedChannel.id);
  if (index !== -1) {
    channels[index] = { ...channels[index], ...updatedChannel };
    renderChannels();
    
    // Mettre à jour l'en-tête si c'est le salon actuel
    if (currentChannelId === updatedChannel.id) {
      document.getElementById('channelName').textContent = `# ${updatedChannel.name}`;
      document.getElementById('channelDescription').textContent = updatedChannel.description || 'Aucune description';
    }
  }
});

/**
 * Événement: Canal déplacé vers une catégorie
 */
socket.on('channel_moved', (data) => {
  loadChannels();
});

/**
 * Événement: Profil utilisateur mis à jour
 */
socket.on('user_profile_updated', (data) => {
  const { username, imageData } = data;
  
  // Mettre en cache
  if (!userProfiles[username]) {
    userProfiles[username] = {};
  }
  userProfiles[username].profile_image = imageData;
  
  // Si c'est l'utilisateur courant, mettre à jour l'avatar dans la sidebar
  if (username === currentUser) {
    updateUserAvatarDisplay(username, imageData);
  }
  
  // Rafraîchir tous les avatars des messages de cet utilisateur
  updateMessageAvatars(username, imageData);
  
  console.log(`✅ Profil de ${username} mis à jour`);
});

/**
 * Événement: Erreur
 */
socket.on('error', (data) => {
  console.error('Erreur serveur:', data);
  alert('Erreur: ' + data.message);
});

// ===========================
// 🛡️ SÉCURITÉ
// ===========================

/**
 * Échapper les caractères HTML pour éviter les injections XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===========================
// 👥 GESTION DES UTILISATEURS EN LIGNE
// ===========================

/**
 * Mettre à jour la liste des utilisateurs en ligne
 */
function updateOnlineUsers(channelId) {
  const countElement = document.getElementById('onlineCount');
  const users = usersInChannel[channelId] || [];
  
  if (countElement) {
    countElement.textContent = users.length || 1;
  }
  
  updateOnlineUsersDisplay();
}

/**
 * Afficher les utilisateurs en ligne
 */
function updateOnlineUsersDisplay() {
  const users = usersInChannel[currentChannelId] || [];
  
  // Créer/mettre à jour le conteneur d'utilisateurs en ligne
  let usersContainer = document.querySelector('.online-users');
  if (!usersContainer && users.length > 0) {
    usersContainer = document.createElement('div');
    usersContainer.className = 'online-users';
    usersContainer.style.cssText = 'background: rgba(88, 101, 242, 0.1); padding: 12px; margin-bottom: 12px; border-radius: 4px; font-size: 0.85rem; color: var(--text-secondary);';
    messagesContainer.parentElement.insertBefore(usersContainer, messagesContainer);
  }
  
  if (usersContainer && users.length > 0) {
    const usersList = users.map(u => `👤 ${u}`).join(' • ');
    usersContainer.textContent = `En ligne: ${usersList}`;
  }
}

/**
 * Afficher l'indicateur de typing
 */
const typingUsers = new Set();

function showTypingIndicator(username) {
  typingUsers.add(username);
  displayTypingUsers();
}

function hideTypingIndicator(username) {
  typingUsers.delete(username);
  displayTypingUsers();
}

function displayTypingUsers() {
  let typingIndicator = document.querySelector('.typing-indicator-container');
  
  if (typingUsers.size === 0) {
    if (typingIndicator) {
      typingIndicator.remove();
    }
    return;
  }
  
  if (!typingIndicator) {
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator-container';
    typingIndicator.style.cssText = 'padding: 8px 20px; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;';
    messagesContainer.appendChild(typingIndicator);
  }
  
  const userList = Array.from(typingUsers);
  if (userList.length === 1) {
    typingIndicator.textContent = `${userList[0]} est en train de taper...`;
  } else {
    typingIndicator.textContent = `${userList.join(', ')} sont en train de taper...`;
  }
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ===========================
// 📱 ÉVÉNEMENTS CLIC MODAL CONNEXION
// ===========================

/**
 * Fermer le modal en cliquant en dehors
 */
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) {
    // Empêcher la fermeture du modal de connexion
    return;
  }
});

/**
 * Événement Enter dans l'input de pseudo
 */
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    passwordInput.focus();
  }
});

/**
 * Événement Enter dans l'input de mot de passe
 */
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    login();
  }
});

/**
 * Focus sur l'input de pseudo au chargement + auto-login
 */
window.addEventListener('load', () => {
  usernameInput.focus();
  tryAutoLogin();
});

// ===========================
// 🎯 NOTIFICATIONS
// ===========================

/**
 * Mettre à jour le nombre d'utilisateurs en ligne (optionnel)
 */
function updateOnlineCount() {
  const count = Object.keys(socket.sockets || {}).length;
  const countElement = document.getElementById('onlineCount');
  if (countElement) {
    countElement.textContent = count || 1;
  }
}

socket.on('connect', () => {
  console.log('✅ Connecté au serveur');
  updateOnlineCount();

  // Re-joindre le canal actuel après une reconnexion
  if (currentUser && currentChannelId) {
    socket.emit('user_joined', {
      username: currentUser,
      channelId: currentChannelId
    });
    console.log('🔄 Reconnexion au canal', currentChannelId);
  }
});

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur');
});

// ===========================
// 🚀 INITIALISATION
// ===========================

console.log('✅ Discord Clone - Client initialized');
