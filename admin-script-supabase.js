// Настройки админа
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'ortosalon2024'
};

// НОВАЯ КОНФИГУРАЦИЯ для Supabase
const SUPABASE_CONFIG = {
    url: 'https://mvjiqysmcclvceswfqwv.supabase.co', // Например: https://xyzcompany.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12amlxeXNtY2NsdmNlc3dmcXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MDUyOTYsImV4cCI6MjA3Njk4MTI5Nn0.FoRyIZ9E4M2ZwEE8Kh4hDdkBDLuhyqRut7VEKG4uQkk', // Анонимный ключ из настроек проекта
    tableName: 'loyalty_users' // Название таблицы для пользователей
};

// Инициализация Supabase клиента
let supabase;
if (typeof supabase === 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

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

// ОБНОВЛЁННАЯ загрузка пользователей из Supabase
async function loadUsers() {
    console.log('📥 Загрузка пользователей из Supabase...');

    try {
        const { data, error } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Преобразуем данные из формата Supabase в формат приложения
        allUsers = data.map(user => ({
            id: user.id,
            phone: user.phone,
            name: user.name || '',
            eanCode: user.ean_code,
            createdAt: user.created_at,
            lastLogin: user.last_login
        }));

        // Синхронизируем с локальным хранилищем
        localStorage.setItem('admin_users', JSON.stringify(allUsers));

        console.log(`✅ Загружено ${allUsers.length} пользователей из Supabase`);
    } catch (error) {
        console.error('❌ Ошибка загрузки из Supabase:', error);

        // Fallback на локальные данные при ошибке
        const localData = localStorage.getItem('admin_users');
        allUsers = localData ? JSON.parse(localData) : [];
        console.log(`⚠️ Используются локальные данные: ${allUsers.length} пользователей`);
    }

    displayUsers(allUsers);
}

// Подписка на изменения в реальном времени
function subscribeToRealtimeChanges() {
    console.log('🔄 Подписка на изменения в реальном времени...');

    supabase
        .channel('loyalty_users_changes')
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: SUPABASE_CONFIG.tableName 
            }, 
            (payload) => {
                console.log('🔔 Получено изменение:', payload);
                loadUsers(); // Перезагружаем список пользователей
            }
        )
        .subscribe();
}

// Вызываем подписку после входа
const originalShowAdminDashboard = showAdminDashboard;
showAdminDashboard = async function() {
    await originalShowAdminDashboard();
    subscribeToRealtimeChanges();
};

// Отображение пользователей в таблице
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.phone}</td>
            <td>${user.name || '<em>не указано</em>'}</td>
            <td><code>${user.eanCode}</code></td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${formatDate(user.lastLogin)}</td>
            <td>
                <button onclick="editUser(${user.id})" class="btn-edit">✏️ Изменить</button>
                <button onclick="deleteUser(${user.id})" class="btn-delete">🗑️ Удалить</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Обновление статистики
function updateStats() {
    const totalUsers = allUsers.length;
    const usersWithNames = allUsers.filter(u => u.name && u.name.trim() !== '').length;
    const recentUsers = allUsers.filter(u => {
        const created = new Date(u.createdAt);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return created >= weekAgo;
    }).length;

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('usersWithNames').textContent = usersWithNames;
    document.getElementById('recentUsers').textContent = recentUsers;
}

// Редактирование пользователя
async function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        alert('Пользователь не найден');
        return;
    }

    const newName = prompt('Введите новое имя пользователя:', user.name);
    if (newName === null) return; // Отмена

    try {
        // Обновляем в Supabase
        const { data, error } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .update({ 
                name: newName.trim(),
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select();

        if (error) throw error;

        console.log('✅ Пользователь обновлён в Supabase');

        // Обновляем локально
        user.name = newName.trim();
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex] = user;
            localStorage.setItem('admin_users', JSON.stringify(allUsers));
        }

        displayUsers(allUsers);
        updateStats();
        alert('Пользователь успешно обновлён!');
    } catch (error) {
        console.error('❌ Ошибка обновления пользователя:', error);
        alert('Ошибка обновления: ' + error.message);
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        alert('Пользователь не найден');
        return;
    }

    if (!confirm(`Вы уверены, что хотите удалить пользователя ${user.name || user.phone}?`)) {
        return;
    }

    try {
        // Удаляем из Supabase
        const { error } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .delete()
            .eq('id', userId);

        if (error) throw error;

        console.log('✅ Пользователь удалён из Supabase');

        // Удаляем локально
        allUsers = allUsers.filter(u => u.id !== userId);
        localStorage.setItem('admin_users', JSON.stringify(allUsers));

        displayUsers(allUsers);
        updateStats();
        alert('Пользователь успешно удалён!');
    } catch (error) {
        console.error('❌ Ошибка удаления пользователя:', error);
        alert('Ошибка удаления: ' + error.message);
    }
}

// Поиск пользователей
function searchUsers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

    if (!searchTerm) {
        displayUsers(allUsers);
        return;
    }

    const filtered = allUsers.filter(user => {
        return user.phone.toLowerCase().includes(searchTerm) ||
               (user.name && user.name.toLowerCase().includes(searchTerm)) ||
               user.eanCode.includes(searchTerm);
    });

    displayUsers(filtered);
}

// Экспорт данных в CSV
function exportToCSV() {
    if (allUsers.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const headers = ['ID', 'Телефон', 'Имя', 'Штрихкод', 'Дата регистрации', 'Последний вход'];
    const rows = allUsers.map(user => [
        user.id,
        user.phone,
        user.name || '',
        user.eanCode,
        formatDate(user.createdAt),
        formatDate(user.lastLogin)
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `ortosalon_users_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Синхронизация с облаком (принудительная)
async function syncWithCloud() {
    const syncBtn = document.querySelector('button[onclick="syncWithCloud()"]');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Синхронизация...';
    }

    try {
        await loadUsers();
        alert('✅ Синхронизация завершена успешно!');
    } catch (error) {
        alert('❌ Ошибка синхронизации: ' + error.message);
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.textContent = '🔄 Синхронизировать';
        }
    }
}

// Выход из админ панели
function adminLogout() {
    localStorage.removeItem('ortosalon_admin');
    currentAdmin = null;
    location.reload();
}

// Вспомогательные функции
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = message ? 'block' : 'none';
    }
}

// Обработка Enter для входа
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const loginForm = document.getElementById('adminLogin');
        if (loginForm && loginForm.style.display !== 'none') {
            adminLogin();
        }
    }
});
