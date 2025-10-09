// Настройки админа
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'ortosalon2024'
};

// НОВАЯ КОНФИГУРАЦИЯ для синхронизации данных между устройствами
const CLOUD_SYNC_CONFIG = {
    // Используем JSONBin.io для бесплатного облачного хранилища
    binId: '68e78e8aae596e708f0bb24e', // ID для хранилища пользователей (тот же что в user-script)
    apiKey: '$2a$10$YC7NQGItIeryJjaqSp/7oes7nTxC1YKQ9M3VVomFXDImvTlKn6QUm', // Ваш API ключ
    baseUrl: 'https://api.jsonbin.io/v3/b',
    enabled: true // Включить синхронизацию с облаком
};

let currentAdmin = null;
let allUsers = [];

// Проверка сохранённой админ сессии при загрузке
document.addEventListener('DOMContentLoaded', function() {
    const savedAdmin = localStorage.getItem('ortosalon_admin');
    if (savedAdmin) {
        currentAdmin = JSON.parse(savedAdmin);
        showAdminDashboard();
    }
});

// Вход администратора
function adminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const errorDiv = document.getElementById('loginError');
    
    if (!username || !password) {
        showError(errorDiv, 'Введите логин и пароль');
        return;
    }
    
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        currentAdmin = {
            username: username,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('ortosalon_admin', JSON.stringify(currentAdmin));
        showAdminDashboard();
    } else {
        showError(errorDiv, 'Неверные учётные данные');
    }
}

// Показ админ панели
async function showAdminDashboard() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('currentAdmin').textContent = currentAdmin.username;
    
    await loadUsers();
    updateStats();
}

// ОБНОВЛЁННАЯ загрузка пользователей с синхронизацией с облаком
async function loadUsers() {
    console.log('📥 Загрузка пользователей...');
    
    // Сначала пытаемся загрузить из облака
    if (CLOUD_SYNC_CONFIG.enabled) {
        try {
            console.log('☁️ Загрузка пользователей из облака...');
            const cloudUsers = await getCloudUsers();
            
            if (cloudUsers.length > 0) {
                allUsers = cloudUsers;
                // Синхронизируем облачные данные с локальными
                localStorage.setItem('admin_users', JSON.stringify(allUsers));
                console.log(`✅ Загружено ${allUsers.length} пользователей из облака`);
            } else {
                console.log('⚠️ Облачное хранилище пустое, используем локальные данные');
                allUsers = JSON.parse(localStorage.getItem('admin_users') || '[]');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки из облака:', error);
            allUsers = JSON.parse(localStorage.getItem('admin_users') || '[]');
        }
    } else {
        // Загружаем только локальные данные
        allUsers = JSON.parse(localStorage.getItem('admin_users') || '[]');
    }
    
    displayUsers(allUsers);
    console.log(`📊 Отображено ${allUsers.length} пользователей`);
}

// НОВАЯ ФУНКЦИЯ: Получение пользователей из облака
async function getCloudUsers() {
    try {
        const response = await fetch(`${CLOUD_SYNC_CONFIG.baseUrl}/${CLOUD_SYNC_CONFIG.binId}`, {
            method: 'GET',
            headers: {
                'X-Master-Key': CLOUD_SYNC_CONFIG.apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            return Array.isArray(result.record) ? result.record : [];
        } else {
            console.warn('⚠️ Не удалось получить данные из облака, используем локальные');
            return [];
        }
    } catch (error) {
        console.error('❌ Ошибка получения данных из облака:', error);
        return [];
    }
}

// НОВАЯ ФУНКЦИЯ: Сохранение пользователей в облако
async function saveCloudUsers(users) {
    try {
        const response = await fetch(`${CLOUD_SYNC_CONFIG.baseUrl}/${CLOUD_SYNC_CONFIG.binId}`, {
            method: 'PUT',
            headers: {
                'X-Master-Key': CLOUD_SYNC_CONFIG.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(users)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('☁️ Данные сохранены в облако:', result);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения в облако:', error);
        throw error;
    }
}

// Отображение пользователей в таблице
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.name || 'Не указано'}</td>
            <td>${user.phone}</td>
            <td>
                <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                    ${user.eanCode}
                </code>
            </td>
            <td>${formatDate(user.createdAt)}</td>
            <td>
                <div class="action-buttons">
                    <button onclick="editUser(${user.id})" class="btn-edit">Редактировать</button>
                    <button onclick="deleteUser(${user.id})" class="btn-delete">Удалить</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Обновление статистики
function updateStats() {
    const today = new Date().toDateString();
    const newUsersToday = allUsers.filter(user => 
        new Date(user.createdAt).toDateString() === today
    ).length;
    
    const activeUsers = allUsers.filter(user => {
        const lastLogin = new Date(user.lastLogin || user.createdAt);
        const daysSince = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 30; // Активные за последние 30 дней
    }).length;
    
    document.getElementById('totalUsers').textContent = allUsers.length;
    document.getElementById('newUsersToday').textContent = newUsersToday;
    document.getElementById('activeUsers').textContent = activeUsers;
}

// Поиск и фильтрация пользователей
function filterUsers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        displayUsers(allUsers);
        return;
    }
    
    const filteredUsers = allUsers.filter(user => 
        user.phone.toLowerCase().includes(searchTerm) ||
        (user.name && user.name.toLowerCase().includes(searchTerm)) ||
        user.eanCode.includes(searchTerm)
    );
    
    displayUsers(filteredUsers);
}

// ОБНОВЛЁННАЯ функция обновления списка пользователей
async function refreshUserList() {
    console.log('🔄 Обновление списка пользователей...');
    
    // Показываем индикатор загрузки
    const refreshBtn = document.querySelector('.btn-refresh');
    const originalText = refreshBtn.textContent;
    refreshBtn.textContent = 'Загрузка...';
    refreshBtn.disabled = true;
    
    try {
        await loadUsers();
        updateStats();
        document.getElementById('searchInput').value = '';
        console.log('✅ Список пользователей обновлён');
    } catch (error) {
        console.error('❌ Ошибка обновления:', error);
        alert('Ошибка при обновлении данных');
    } finally {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

// Редактирование пользователя
function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserPhone').value = user.phone;
    document.getElementById('editUserEAN').value = user.eanCode;
    
    // Очищаем предпросмотр штрихкода
    document.getElementById('barcodePreview').innerHTML = '';
    
    document.getElementById('editUserModal').classList.add('active');
}

// Предпросмотр загруженного изображения штрихкода
function previewBarcodeImage() {
    const fileInput = document.getElementById('barcodeImage');
    const preview = document.getElementById('barcodePreview');
    
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Штрихкод">`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

// ОБНОВЛЁННАЯ функция сохранения изменений пользователя с облачной синхронизацией
async function saveUserChanges() {
    const userId = parseInt(document.getElementById('editUserId').value);
    const name = document.getElementById('editUserName').value.trim();
    const phone = document.getElementById('editUserPhone').value.trim();
    const eanCode = document.getElementById('editUserEAN').value.trim();
    
    // Валидация
    if (!phone) {
        alert('Телефон обязателен для заполнения');
        return;
    }
    
    if (eanCode && eanCode.length !== 13) {
        alert('EAN код должен содержать 13 цифр');
        return;
    }
    
    // Найдём пользователя и обновим его данные
    const userIndex = allUsers.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        allUsers[userIndex] = {
            ...allUsers[userIndex],
            name: name,
            phone: phone,
            eanCode: eanCode || allUsers[userIndex].eanCode,
            updatedAt: new Date().toISOString()
        };
        
        try {
            // Сохраняем в localStorage
            localStorage.setItem('admin_users', JSON.stringify(allUsers));
            
            // Также обновляем в пользовательских данных
            const ortosalonUsers = JSON.parse(localStorage.getItem('ortosalon_users') || '[]');
            const ortosalonUserIndex = ortosalonUsers.findIndex(u => u.id === userId);
            if (ortosalonUserIndex !== -1) {
                ortosalonUsers[ortosalonUserIndex] = allUsers[userIndex];
                localStorage.setItem('ortosalon_users', JSON.stringify(ortosalonUsers));
            }
            
            // Обновляем текущего пользователя, если он авторизован
            const currentUser = JSON.parse(localStorage.getItem('ortosalon_user') || 'null');
            if (currentUser && currentUser.id === userId) {
                localStorage.setItem('ortosalon_user', JSON.stringify(allUsers[userIndex]));
            }
            
            // Синхронизируем с облаком
            if (CLOUD_SYNC_CONFIG.enabled) {
                await saveCloudUsers(allUsers);
                console.log('☁️ Изменения синхронизированы с облаком');
            }
            
            closeEditModal();
            displayUsers(allUsers);
            updateStats();
            alert('Данные пользователя обновлены');
            
        } catch (error) {
            console.error('❌ Ошибка сохранения:', error);
            alert('Ошибка при сохранении данных');
        }
    }
}

// ОБНОВЛЁННАЯ функция удаления пользователя с облачной синхронизацией
async function confirmDeleteUser() {
    const userId = parseInt(document.getElementById('deleteUserId').value);
    
    try {
        // Удаляем из админского списка
        allUsers = allUsers.filter(u => u.id !== userId);
        localStorage.setItem('admin_users', JSON.stringify(allUsers));
        
        // Удаляем из пользовательского списка
        const ortosalonUsers = JSON.parse(localStorage.getItem('ortosalon_users') || '[]');
        const updatedOrtosalonUsers = ortosalonUsers.filter(u => u.id !== userId);
        localStorage.setItem('ortosalon_users', JSON.stringify(updatedOrtosalonUsers));
        
        // Если удаляемый пользователь сейчас авторизован, выходим из системы
        const currentUser = JSON.parse(localStorage.getItem('ortosalon_user') || 'null');
        if (currentUser && currentUser.id === userId) {
            localStorage.removeItem('ortosalon_user');
        }
        
        // Синхронизируем с облаком
        if (CLOUD_SYNC_CONFIG.enabled) {
            await saveCloudUsers(allUsers);
            console.log('☁️ Удаление синхронизировано с облаком');
        }
        
        closeDeleteModal();
        displayUsers(allUsers);
        updateStats();
        alert('Пользователь удалён');
        
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        alert('Ошибка при удалении пользователя');
    }
}

// Удаление пользователя
function deleteUser(userId) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

// Закрытие модальных окон
function closeEditModal() {
    document.getElementById('editUserModal').classList.remove('active');
}

function closeDeleteModal() {
    document.getElementById('deleteConfirmModal').classList.remove('active');
}

// Выход из админ панели
function adminLogout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        currentAdmin = null;
        localStorage.removeItem('ortosalon_admin');
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('adminLogin').style.display = 'flex';
        
        // Очищаем поля входа
        document.getElementById('adminUsername').value = '';
        document.getElementById('adminPassword').value = '';
    }
}

// Форматирование даты
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Показ ошибки
function showError(errorDiv, message) {
    errorDiv.textContent = message;
    setTimeout(() => {
        errorDiv.textContent = '';
    }, 5000);
}

// Закрытие модальных окон по клику вне их
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.remove('active');
        }
    });
}