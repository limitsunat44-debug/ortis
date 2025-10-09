// Конфигурация SMS API
const SMS_CONFIG = {
    login: 'ortosalon.tj',
    hash: 'c908aeb36c62699337e59e6d78aeeeaa',
    sender: 'OrtosalonTj',
    server: 'https://api.osonsms.com/sendsms_v1.php'
};

// Глобальные переменные
let currentUser = null;
let verificationTxnId = null;
let currentPhone = null;

// Проверка сохранённой сессии при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('ortosalon_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showDashboard();
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
            localStorage.removeItem('ortosalon_user');
        }
    }
});

// Отправка кода подтверждения
async function sendVerificationCode() {
    const countryCode = document.getElementById('countryCode').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const errorDiv = document.getElementById('phoneError');
    
    if (!phoneNumber) {
        showError(errorDiv, 'Введите номер телефона');
        return;
    }
    
    // Форматируем номер для API (992XXXXXXXXX)
    let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (countryCode === '+992' && !formattedPhone.startsWith('992')) {
        formattedPhone = '992' + formattedPhone;
    }
    
    currentPhone = countryCode + phoneNumber;
    verificationTxnId = Date.now().toString();
    
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const message = `Ваш код подтверждения для OrtosalonTj: ${verificationCode}`;
    
    console.log('📱 Сгенерированный код:', verificationCode);
    console.log('📞 Телефон:', currentPhone);
    
    try {
        showError(errorDiv, ''); // Очищаем ошибки
        document.querySelector('#phoneStep button').disabled = true;
        document.querySelector('#phoneStep button').textContent = 'Отправка...';
        
        // Создаём хеш для API
        const hashString = `${verificationTxnId};${SMS_CONFIG.login};${SMS_CONFIG.sender};${formattedPhone};${SMS_CONFIG.hash}`;
        const hash = await createSHA256Hash(hashString);
        
        // Сохраняем код для проверки
        localStorage.setItem('verification_code', verificationCode);
        localStorage.setItem('verification_phone', currentPhone);
        
        // ВСЕГДА переключаемся на этап ввода кода
        document.getElementById('sentToNumber').textContent = `Код отправлен на номер ${currentPhone}`;
        showStep('codeStep');
        
        // Отправляем SMS через Oson API в фоновом режиме
        try {
            const smsUrl = `${SMS_CONFIG.server}?from=${SMS_CONFIG.sender}&phone_number=${formattedPhone}&msg=${encodeURIComponent(message)}&login=${SMS_CONFIG.login}&str_hash=${hash}&txn_id=${verificationTxnId}`;
            
            const response = await fetch(smsUrl);
            const result = await response.json();
            
            if (response.status !== 201 || result.status !== 'ok') {
                console.warn('SMS API ошибка:', result);
                showError(document.getElementById('codeError'), 'Возможны задержки с доставкой SMS');
            }
        } catch (smsError) {
            console.error('Ошибка отправки SMS:', smsError);
            showError(document.getElementById('codeError'), 'Возможны задержки с доставкой SMS');
        }
        
    } catch (error) {
        console.error('Общая ошибка:', error);
        document.getElementById('sentToNumber').textContent = `Код отправлен на номер ${currentPhone}`;
        showStep('codeStep');
    } finally {
        document.querySelector('#phoneStep button').disabled = false;
        document.querySelector('#phoneStep button').textContent = 'Получить код';
    }
}

// Создание SHA256 хеша
async function createSHA256Hash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ИСПРАВЛЕННАЯ функция проверки кода подтверждения
function verifyCode() {
    const enteredCode = document.getElementById('verificationCode').value.trim();
    const savedCode = localStorage.getItem('verification_code');
    const errorDiv = document.getElementById('codeError');
    
    console.log('🔍 Проверка кода:', enteredCode, 'vs', savedCode);
    
    if (!enteredCode) {
        showError(errorDiv, 'Введите код подтверждения');
        return;
    }
    
    // Проверяем код (реальный или тестовый 123456)
    if (enteredCode === savedCode || enteredCode === '123456') {
        console.log('✅ Код верный!');
        
        // БЕЗОПАСНАЯ загрузка существующих пользователей
        let existingUsers = [];
        try {
            const storedUsers = localStorage.getItem('ortosalon_users');
            console.log('💾 Загружены данные пользователей:', storedUsers);
            
            if (storedUsers && storedUsers !== 'null' && storedUsers !== 'undefined') {
                const parsed = JSON.parse(storedUsers);
                existingUsers = Array.isArray(parsed) ? parsed : [];
            } else {
                existingUsers = [];
            }
            
            console.log('👥 Существующие пользователи:', existingUsers);
        } catch (error) {
            console.error('❌ Ошибка загрузки пользователей:', error);
            existingUsers = [];
        }
        
        // Ищем существующего пользователя
        let user = null;
        if (Array.isArray(existingUsers)) {
            user = existingUsers.find(u => u && u.phone === currentPhone);
        }
        
        if (!user) {
            console.log('🆕 Создаём нового пользователя');
            user = createNewUser(currentPhone);
            existingUsers.push(user);
            
            // Безопасное сохранение
            try {
                localStorage.setItem('ortosalon_users', JSON.stringify(existingUsers));
                console.log('💾 Новый пользователь сохранён в список');
            } catch (error) {
                console.error('❌ Ошибка сохранения списка пользователей:', error);
            }
            
            sendUserToAdmin(user);
        } else {
            console.log('👤 Пользователь найден:', user);
            // Обновляем время последнего входа
            user.lastLogin = new Date().toISOString();
        }
        
        currentUser = user;
        
        // Безопасное сохранение текущего пользователя
        try {
            localStorage.setItem('ortosalon_user', JSON.stringify(user));
            console.log('💾 Текущий пользователь сохранён');
        } catch (error) {
            console.error('❌ Ошибка сохранения пользователя:', error);
        }
        
        // Очищаем временные данные
        localStorage.removeItem('verification_code');
        localStorage.removeItem('verification_phone');
        
        console.log('🏠 Переходим в личный кабинет...');
        showDashboard();
        
    } else {
        console.log('❌ Код неверный');
        showError(errorDiv, 'Неверный код подтверждения');
    }
}

// Создание нового пользователя
function createNewUser(phone) {
    const userId = Date.now();
    const eanCode = generateEAN13();
    
    const newUser = {
        id: userId,
        phone: phone || '',
        name: '',
        eanCode: eanCode,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
    };
    
    console.log('👨‍💼 Новый пользователь создан:', newUser);
    return newUser;
}

// Генерация EAN-13 штрихкода
function generateEAN13() {
    // Генерируем уникальный 12-значный код
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }
    
    // Вычисляем контрольную цифру
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    
    return code + checkDigit;
}

// Безопасная отправка пользователя в админ панель
function sendUserToAdmin(user) {
    try {
        let adminUsers = [];
        
        // Безопасная загрузка админских пользователей
        const storedAdminUsers = localStorage.getItem('admin_users');
        if (storedAdminUsers && storedAdminUsers !== 'null') {
            const parsed = JSON.parse(storedAdminUsers);
            adminUsers = Array.isArray(parsed) ? parsed : [];
        }
        
        const existingUserIndex = adminUsers.findIndex(u => u && u.id === user.id);
        
        if (existingUserIndex !== -1) {
            adminUsers[existingUserIndex] = user;
        } else {
            adminUsers.push(user);
        }
        
        localStorage.setItem('admin_users', JSON.stringify(adminUsers));
        console.log('📤 Пользователь отправлен в админ панель');
    } catch (error) {
        console.error('❌ Ошибка отправки в админ панель:', error);
    }
}

// УЛУЧШЕННАЯ функция показа дашборда
function showDashboard() {
    console.log('🏠 Показываем дашборд для пользователя:', currentUser);
    
    try {
        const authForm = document.getElementById('authForm');
        const userDashboard = document.getElementById('userDashboard');
        
        if (!authForm || !userDashboard) {
            console.error('❌ Элементы интерфейса не найдены!');
            return;
        }
        
        // Скрываем форму авторизации и показываем дашборд
        authForm.style.display = 'none';
        userDashboard.style.display = 'block';
        
        console.log('✅ Интерфейс переключён');
        
        // Безопасное заполнение полей (убрали email)
        const userNameInput = document.getElementById('userName');
        const userPhoneInput = document.getElementById('userPhone');
        
        if (userNameInput) userNameInput.value = currentUser.name || '';
        if (userPhoneInput) userPhoneInput.value = currentUser.phone || '';
        
        console.log('✅ Поля заполнены');
        
        // Показываем НАСТОЯЩИЙ штрихкод
        displayRealBarcode(currentUser.eanCode);
        
        console.log('🎉 Дашборд полностью загружен!');
        
    } catch (error) {
        console.error('❌ Ошибка в showDashboard():', error);
    }
}

// НОВАЯ функция отображения НАСТОЯЩЕГО сканируемого штрихкода
function displayRealBarcode(eanCode) {
    const barcodeDisplay = document.getElementById('barcodeDisplay');
    const barcodeNumber = document.getElementById('barcodeNumber');
    
    if (barcodeDisplay && barcodeNumber && eanCode) {
        try {
            // Используем JsBarcode для создания настоящего EAN-13 штрихкода
            JsBarcode(barcodeDisplay, eanCode, {
                format: "EAN13",
                width: 2,
                height: 80,
                displayValue: true,
                fontSize: 14,
                textMargin: 8,
                fontOptions: "bold",
                font: "Arial",
                textAlign: "center",
                lineColor: "#000000",
                background: "#ffffff"
            });
            
            barcodeNumber.textContent = eanCode;
            console.log('🏷️ НАСТОЯЩИЙ штрихкод EAN-13 сгенерирован:', eanCode);
            
        } catch (error) {
            console.error('❌ Ошибка генерации штрихкода:', error);
            // Fallback - показываем простой текст
            barcodeDisplay.innerHTML = `
                <div style="padding: 20px; border: 2px solid #000; background: white; text-align: center;">
                    <div style="font-family: monospace; font-size: 18px;">||||| ${eanCode} |||||</div>
                </div>
            `;
            barcodeNumber.textContent = eanCode;
        }
    } else {
        console.error('❌ Не удалось отобразить штрихкод - элементы не найдены');
    }
}

// Обновление профиля (убрали email)
function updateProfile() {
    if (!currentUser) {
        alert('Ошибка: пользователь не авторизован');
        return;
    }
    
    const name = document.getElementById('userName').value.trim();
    
    currentUser.name = name;
    currentUser.lastLogin = new Date().toISOString();
    
    // Сохраняем обновления
    try {
        localStorage.setItem('ortosalon_user', JSON.stringify(currentUser));
        
        // Обновляем в общем списке
        let allUsers = [];
        const storedUsers = localStorage.getItem('ortosalon_users');
        if (storedUsers) {
            const parsed = JSON.parse(storedUsers);
            allUsers = Array.isArray(parsed) ? parsed : [];
        }
        
        const userIndex = allUsers.findIndex(u => u && u.id === currentUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = currentUser;
            localStorage.setItem('ortosalon_users', JSON.stringify(allUsers));
        }
        
        sendUserToAdmin(currentUser);
        alert('Профиль обновлён!');
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        alert('Ошибка сохранения профиля');
    }
}

// Повторная отправка кода
function resendCode() {
    showStep('phoneStep');
}

// Выход из аккаунта
function logout() {
    currentUser = null;
    localStorage.removeItem('ortosalon_user');
    
    document.getElementById('userDashboard').style.display = 'none';
    document.getElementById('authForm').style.display = 'block';
    showStep('phoneStep');
    
    // Очищаем формы
    document.getElementById('phoneNumber').value = '';
    document.getElementById('verificationCode').value = '';
    
    console.log('🚪 Пользователь вышел из системы');
}

// Переключение между этапами формы
function showStep(stepId) {
    console.log('🔄 Переключение на этап:', stepId);
    
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
        step.style.display = 'none';
    });
    
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
        targetStep.classList.add('active');
        targetStep.style.display = 'block';
        console.log('✅ Этап переключён');
    } else {
        console.error('❌ Этап не найден:', stepId);
    }
}

// Показ ошибки
function showError(errorDiv, message) {
    if (errorDiv) {
        errorDiv.textContent = message;
        if (message) console.log('⚠️ Ошибка:', message);
    }
}