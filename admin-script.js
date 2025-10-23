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
    // ⚠️ ЗАЩИТА ОТ ОЧИСТКИ: Не сохранять пустой массив в облако!
    if (!Array.isArray(users) || users.length === 0) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Попытка записи пустого массива в облако!');
        console.warn('⚠️ Сохранение отменено для защиты данных.');

        // Показываем предупреждение админу
        if (typeof alert !== 'undefined') {
            alert('⚠️ ВНИМАНИЕ!\n\nПопытка сохранить ПУСТОЙ список пользователей в облако!\n\nДанные НЕ были отправлены для защиты от потери информации.\n\nЕсли вы действительно хотите очистить все данные, обратитесь к разработчику.');
        }

        return; // Прерываем выполнение
    }

    // Дополнительная проверка: создаем бэкап перед сохранением
    try {
        const existingData = await getCloudUsers();
        if (existingData && existingData.length > 0) {
            console.log(`📦 Бэкап: В облаке сейчас ${existingData.length} пользователей`);
            // Сохраняем локальную копию на случай ошибки
            localStorage.setItem('admin_users_backup', JSON.stringify(existingData));
            localStorage.setItem('admin_users_backup_time', new Date().toISOString());
        }
    } catch (backupError) {
        console.warn('⚠️ Не удалось создать бэкап:', backupError);
    }

    try {
        console.log(`☁️ Сохранение ${users.length} пользователей в облако...`);

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
        console.log('✅ Данные успешно сохранены в облако:', result);
        console.log(`📊 Сохранено пользователей: ${users.length}`);

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

// ========== Добавление пользователя ==========

// Открыть модальное окно для добавления
function openAddUserModal() {
    document.getElementById('addUserName').value = '';
    document.getElementById('addUserPhone').value = '';
    document.getElementById('addUserEAN').value = generateEAN13();
    document.getElementById('addBarcodePreview').innerHTML = '';
    document.getElementById('addUserModal').classList.add('active');
}

// Генерация случайного штрихкода EAN-13
function generateEAN13() {
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }
    // Контрольная сумма
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return code + checkDigit;
}

// Отображение предпросмотра загруженного изображения
function previewAddBarcodeImage() {
    const fileInput = document.getElementById('addBarcodeImage');
    const preview = document.getElementById('addBarcodePreview');
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Штрихкод" style="max-width:150px;">`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}



// Сохранение нового пользователя
function addNewUser() {
    const name = document.getElementById('addUserName').value.trim();
    const phone = document.getElementById('addUserPhone').value.trim();
    const eanCode = document.getElementById('addUserEAN').value.trim();
    let barcodeImageData = null;

    // Валидация
    if (!phone) {
        alert('Телефон обязателен');
        return;
    }
    if (eanCode.length !== 13) {
        alert('EAN-13 должен содержать 13 цифр');
        return;
    }

    const fileInput = document.getElementById('addBarcodeImage');
    if (fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            barcodeImageData = e.target.result;
            saveUser();
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        saveUser();
    }

    function saveUser() {
        const users = JSON.parse(localStorage.getItem('admin_users') || '[]');
        const newUser = {
            id: Date.now(),
            name,
            phone,
            eanCode,
            barcodeImage: barcodeImageData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        users.push(newUser);
        localStorage.setItem('admin_users', JSON.stringify(users));
        closeAddUserModal();
        loadUsers(); // Функция для обновления списка на экране
        alert('Пользователь добавлен!');
    }
}

// Закрыть модалку добавления
function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('active');
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

// 🔧 ФУНКЦИЯ ДЛЯ ВОССТАНОВЛЕНИЯ БЭКАПА
async function restoreFromBackup() {
    const backup = localStorage.getItem('admin_users_backup');
    const backupTime = localStorage.getItem('admin_users_backup_time');

    if (!backup) {
        alert('❌ Бэкап не найден!\n\nВозможно, бэкап еще не был создан.');
        return;
    }

    const backupDate = backupTime ? new Date(backupTime).toLocaleString('ru-RU') : 'неизвестно';
    const confirmRestore = confirm(
        `🔄 ВОССТАНОВЛЕНИЕ БЭКАПА\n\n` +
        `Дата создания бэкапа: ${backupDate}\n\n` +
        `Вы уверены, что хотите восстановить данные из бэкапа?\n\n` +
        `Текущие данные будут заменены на данные из бэкапа.`
    );

    if (!confirmRestore) {
        return;
    }

    try {
        const backupUsers = JSON.parse(backup);

        if (!Array.isArray(backupUsers) || backupUsers.length === 0) {
            alert('❌ Бэкап пустой или поврежден!');
            return;
        }

        // Восстанавливаем данные локально
        allUsers = backupUsers;
        localStorage.setItem('admin_users', JSON.stringify(allUsers));

        // Восстанавливаем в облако
        if (CLOUD_SYNC_CONFIG.enabled) {
            await saveCloudUsers(allUsers);
        }

        // Обновляем отображение
        displayUsers(allUsers);
        updateStats();

        alert(`✅ Успешно восстановлено!\n\nВосстановлено пользователей: ${backupUsers.length}\nДата бэкапа: ${backupDate}`);
        console.log(`✅ Восстановлено ${backupUsers.length} пользователей из бэкапа`);

    } catch (error) {
        console.error('❌ Ошибка восстановления бэкапа:', error);
        alert(`❌ Ошибка при восстановлении бэкапа!\n\n${error.message}`);
    }
}

// 📊 ФУНКЦИЯ ДЛЯ ПРОСМОТРА ИНФОРМАЦИИ О БЭКАПЕ
function showBackupInfo() {
    const backup = localStorage.getItem('admin_users_backup');
    const backupTime = localStorage.getItem('admin_users_backup_time');

    if (!backup) {
        alert('ℹ️ ИНФОРМАЦИЯ О БЭКАПЕ\n\nБэкап не найден.\n\nБэкап создается автоматически при каждом сохранении данных в облако.');
        return;
    }

    try {
        const backupUsers = JSON.parse(backup);
        const backupDate = backupTime ? new Date(backupTime).toLocaleString('ru-RU') : 'неизвестно';

        let message = `📦 ИНФОРМАЦИЯ О БЭКАПЕ\n\n`;
        message += `📅 Дата создания: ${backupDate}\n`;
        message += `👥 Количество пользователей: ${backupUsers.length}\n\n`;

        if (backupUsers.length > 0) {
            message += `Последние 5 пользователей в бэкапе:\n`;
            backupUsers.slice(-5).forEach(user => {
                message += `  • ${user.name} (${user.phone})\n`;
            });
        }

        alert(message);
        console.log('📦 Бэкап содержит:', backupUsers);

    } catch (error) {
        alert('❌ Ошибка чтения бэкапа!\n\nБэкап может быть поврежден.');
        console.error('❌ Ошибка чтения бэкапа:', error);
    }
}

// 💾 ФУНКЦИЯ ДЛЯ ЭКСПОРТА БЭКАПА В ФАЙЛ
function exportBackupToFile() {
    const backup = localStorage.getItem('admin_users_backup');
    const backupTime = localStorage.getItem('admin_users_backup_time');

    if (!backup) {
        alert('❌ Бэкап не найден!');
        return;
    }

    try {
        const backupUsers = JSON.parse(backup);
        const backupDate = backupTime ? new Date(backupTime).toISOString().split('T')[0] : 'unknown';

        // Создаем красивый JSON для скачивания
        const exportData = {
            backup_date: backupTime || new Date().toISOString(),
            users_count: backupUsers.length,
            users: backupUsers
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(dataBlob);
        downloadLink.download = `ortosalon_backup_${backupDate}.json`;
        downloadLink.click();

        alert(`✅ Бэкап экспортирован!\n\nФайл: ortosalon_backup_${backupDate}.json\nПользователей: ${backupUsers.length}`);

    } catch (error) {
        alert('❌ Ошибка экспорта бэкапа!');
        console.error('❌ Ошибка экспорта:', error);
    }
}


// ==================== SMS РАССЫЛКА В АДМИН ПАНЕЛИ ====================

// Конфигурация SMS (такая же как в пользовательском приложении)
const SMS_CONFIG = {
    login: 'ortosalon.tj',
    hash: 'c908aeb36c62699337e59e6d78aeeeaa',
    sender: 'OrtosalonTj',
    server: 'https://api.osonsms.com/sendsms_v1.php'
};

// Статус рассылки
let broadcastStatus = {
    isRunning: false,
    sent: 0,
    failed: 0,
    total: 0,
    currentUser: null
};

// ==================== ФУНКЦИИ РАССЫЛКИ ====================

// Открыть окно рассылки
function openBroadcastModal() {
    document.getElementById('broadcastMessage').value = '';
    document.getElementById('broadcastRecipients').value = 'all';
    document.getElementById('broadcastModal').classList.add('active');
    
    // Обновляем счетчики получателей
    updateRecipientCount();
}

// Обновление счетчика получателей
function updateRecipientCount() {
    const recipientType = document.getElementById('broadcastRecipients').value;
    let count = 0;
    
    switch (recipientType) {
        case 'all':
            count = allUsers.length;
            break;
        case 'today':
            const today = new Date().toDateString();
            count = allUsers.filter(user => 
                new Date(user.createdAt).toDateString() === today
            ).length;
            break;
        case 'week':
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            count = allUsers.filter(user => 
                new Date(user.createdAt) >= weekAgo
            ).length;
            break;
        case 'active':
            const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            count = allUsers.filter(user => {
                const lastLogin = new Date(user.lastLogin || user.createdAt);
                return lastLogin >= monthAgo;
            }).length;
            break;
    }
    
    document.getElementById('recipientCount').textContent = count;
}

// Получить список получателей по типу
function getRecipients(type) {
    switch (type) {
        case 'all':
            return allUsers;
        
        case 'today':
            const today = new Date().toDateString();
            return allUsers.filter(user => 
                new Date(user.createdAt).toDateString() === today
            );
        
        case 'week':
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return allUsers.filter(user => 
                new Date(user.createdAt) >= weekAgo
            );
        
        case 'active':
            const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            return allUsers.filter(user => {
                const lastLogin = new Date(user.lastLogin || user.createdAt);
                return lastLogin >= monthAgo;
            });
        
        default:
            return [];
    }
}

// Создание SHA256 хеша для SMS API
async function createSHA256Hash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Отправка одного SMS
async function sendSingleSMS(phone, message, txnId) {
    try {
        // Форматируем номер (убираем + и приводим к формату 992XXXXXXXXX)
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (phone.startsWith('+992') && !formattedPhone.startsWith('992')) {
            formattedPhone = '992' + formattedPhone.substring(3);
        }
        
        console.log(`📤 Отправка SMS на ${phone} (${formattedPhone})`);
        
        // Создаем хеш
        const hashString = `${txnId};${SMS_CONFIG.login};${SMS_CONFIG.sender};${formattedPhone};${SMS_CONFIG.hash}`;
        const hash = await createSHA256Hash(hashString);
        
        // Формируем URL для API
        const smsUrl = `${SMS_CONFIG.server}?from=${SMS_CONFIG.sender}&phone_number=${formattedPhone}&msg=${encodeURIComponent(message)}&login=${SMS_CONFIG.login}&str_hash=${hash}&txn_id=${txnId}`;
        
        const response = await fetch(smsUrl);
        const result = await response.json();
        
        if (response.status === 201 && result.status === 'ok') {
            console.log(`✅ SMS отправлен на ${phone}`);
            return { success: true, phone, result };
        } else {
            console.error(`❌ Ошибка отправки SMS на ${phone}:`, result);
            return { success: false, phone, error: result };
        }
        
    } catch (error) {
        console.error(`❌ Критическая ошибка отправки SMS на ${phone}:`, error);
        return { success: false, phone, error: error.message };
    }
}

// Основная функция рассылки
async function startBroadcast() {
    const message = document.getElementById('broadcastMessage').value.trim();
    const recipientType = document.getElementById('broadcastRecipients').value;
    
    // Валидация
    if (!message) {
        alert('Введите текст сообщения');
        return;
    }
    
    if (message.length > 160) {
        if (!confirm('Сообщение длиннее 160 символов. Это может увеличить стоимость. Продолжить?')) {
            return;
        }
    }
    
    // Получаем список получателей
    const recipients = getRecipients(recipientType);
    
    if (recipients.length === 0) {
        alert('Нет получателей для рассылки');
        return;
    }
    
    // Подтверждение рассылки
    if (!confirm(`Отправить сообщение ${recipients.length} получателям?\n\nТекст: "${message}"`)) {
        return;
    }
    
    // Инициализация рассылки
    broadcastStatus = {
        isRunning: true,
        sent: 0,
        failed: 0,
        total: recipients.length,
        currentUser: null
    };
    
    // Обновляем интерфейс
    updateBroadcastProgress();
    document.getElementById('startBroadcastBtn').disabled = true;
    document.getElementById('stopBroadcastBtn').disabled = false;
    
    console.log(`🚀 Начинаем рассылку для ${recipients.length} получателей`);
    
    // Рассылка с задержкой между сообщениями
    for (let i = 0; i < recipients.length && broadcastStatus.isRunning; i++) {
        const user = recipients[i];
        broadcastStatus.currentUser = user.name || user.phone;
        
        updateBroadcastProgress();
        
        const txnId = `${Date.now()}_${i}`;
        const result = await sendSingleSMS(user.phone, message, txnId);
        
        if (result.success) {
            broadcastStatus.sent++;
        } else {
            broadcastStatus.failed++;
        }
        
        updateBroadcastProgress();
        
        // Задержка между отправками (2 секунды)
        if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Завершение рассылки
    broadcastStatus.isRunning = false;
    broadcastStatus.currentUser = null;
    
    document.getElementById('startBroadcastBtn').disabled = false;
    document.getElementById('stopBroadcastBtn').disabled = true;
    
    console.log(`✅ Рассылка завершена. Отправлено: ${broadcastStatus.sent}, Ошибок: ${broadcastStatus.failed}`);
    alert(`Рассылка завершена!\n\nОтправлено: ${broadcastStatus.sent}\nОшибок: ${broadcastStatus.failed}`);
    
    updateBroadcastProgress();
}

// Остановка рассылки
function stopBroadcast() {
    if (confirm('Вы уверены, что хотите остановить рассылку?')) {
        broadcastStatus.isRunning = false;
        document.getElementById('startBroadcastBtn').disabled = false;
        document.getElementById('stopBroadcastBtn').disabled = true;
        console.log('🛑 Рассылка остановлена пользователем');
    }
}

// Обновление прогресса рассылки
function updateBroadcastProgress() {
    const progressBar = document.getElementById('broadcastProgress');
    const progressText = document.getElementById('broadcastProgressText');
    const currentUserSpan = document.getElementById('currentUser');
    
    if (broadcastStatus.total > 0) {
        const percent = Math.round(((broadcastStatus.sent + broadcastStatus.failed) / broadcastStatus.total) * 100);
        progressBar.style.width = percent + '%';
        
        progressText.textContent = `${broadcastStatus.sent + broadcastStatus.failed} / ${broadcastStatus.total} (${percent}%)`;
        
        if (broadcastStatus.currentUser) {
            currentUserSpan.textContent = `Отправка: ${broadcastStatus.currentUser}`;
        } else {
            currentUserSpan.textContent = `Отправлено: ${broadcastStatus.sent}, Ошибок: ${broadcastStatus.failed}`;
        }
    }
}

// Закрытие окна рассылки
function closeBroadcastModal() {
    if (broadcastStatus.isRunning) {
        if (!confirm('Рассылка выполняется. Вы уверены, что хотите закрыть окно?')) {
            return;
        }
        stopBroadcast();
    }
    document.getElementById('broadcastModal').classList.remove('active');
}

// Предустановленные шаблоны сообщений
const messageTemplates = {
    welcome: 'Добро пожаловать в OrtosalonTj! Ваша карта лояльности готова к использованию.',
    promo: 'Специальное предложение только для вас! Скидка 20% на всю ортопедическую продукцию.',
    reminder: 'Не забудьте использовать свою карту лояльности при следующей покупке!',
    newProduct: 'Новинка в OrtosalonTj! Приходите и оценивайте новую коллекцию ортопедических товаров.'
};

// Применение шаблона сообщения
function applyMessageTemplate(templateKey) {
    const message = messageTemplates[templateKey];
    if (message) {
        document.getElementById('broadcastMessage').value = message;
    }
}

// Счетчик символов в сообщении
function updateCharacterCount() {
    const message = document.getElementById('broadcastMessage').value;
    const count = message.length;
    const counter = document.getElementById('characterCount');
    
    counter.textContent = `${count}/160`;
    
    if (count > 160) {
        counter.style.color = '#ff6b6b';
    } else if (count > 140) {
        counter.style.color = '#ffa726';
    } else {
        counter.style.color = '#666';
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// Добавляем обработчики событий при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Обработчик изменения типа получателей
    const recipientsSelect = document.getElementById('broadcastRecipients');
    if (recipientsSelect) {
        recipientsSelect.addEventListener('change', updateRecipientCount);
    }
    
    // Обработчик счетчика символов
    const messageTextarea = document.getElementById('broadcastMessage');
    if (messageTextarea) {
        messageTextarea.addEventListener('input', updateCharacterCount);
    }
    
    console.log('📱 SMS рассылка инициализирована');
});
