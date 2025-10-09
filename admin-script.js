// Настройки админа
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'ortosalon2024'
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
function showAdminDashboard() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('currentAdmin').textContent = currentAdmin.username;
    
    loadUsers();
    updateStats();
}

// Загрузка пользователей
function loadUsers() {
    allUsers = JSON.parse(localStorage.getItem('admin_users') || '[]');
    displayUsers(allUsers);
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
            <td>${user.email || 'Не указано'}</td>
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
        (user.email && user.email.toLowerCase().includes(searchTerm)) ||
        user.eanCode.includes(searchTerm)
    );
    
    displayUsers(filteredUsers);
}

// Обновление списка пользователей
function refreshUserList() {
    loadUsers();
    updateStats();
    document.getElementById('searchInput').value = '';
}

// Редактирование пользователя
function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserPhone').value = user.phone;
    document.getElementById('editUserEmail').value = user.email || '';
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

// Сохранение изменений пользователя
function saveUserChanges() {
    const userId = parseInt(document.getElementById('editUserId').value);
    const name = document.getElementById('editUserName').value.trim();
    const phone = document.getElementById('editUserPhone').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
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
            email: email,
            eanCode: eanCode || allUsers[userIndex].eanCode,
            updatedAt: new Date().toISOString()
        };
        
        // Сохраняем в localStorage
        localStorage.setItem('admin_users', JSON.stringify(allUsers));
        
        // Также обновляем в пользовательских данных, если пользователь авторизован
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
        
        closeEditModal();
        displayUsers(allUsers);
        updateStats();
        alert('Данные пользователя обновлены');
    }
}

// Удаление пользователя
function deleteUser(userId) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

// Подтверждение удаления пользователя
function confirmDeleteUser() {
    const userId = parseInt(document.getElementById('deleteUserId').value);
    
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
    
    closeDeleteModal();
    displayUsers(allUsers);
    updateStats();
    alert('Пользователь удалён');
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