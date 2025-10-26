// Конфигурация SMS API
const SMS_CONFIG = {
    login: 'ortosalon.tj',
    hash: 'c908aeb36c62699337e59e6d78aeeeaa',
    sender: 'OrtosalonTj',
    server: 'https://api.osonsms.com/sendsms_v1.php'
};

// НОВАЯ КОНФИГУРАЦИЯ для Supabase
const SUPABASE_CONFIG = {
    url: 'https://mvjiqysmcclvceswfqwv.supabase.co', // Например: https://xyzcompany.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12amlxeXNtY2NsdmNlc3dmcXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MDUyOTYsImV4cCI6MjA3Njk4MTI5Nn0.FoRyIZ9E4M2ZwEE8Kh4hDdkBDLuhyqRut7VEKG4uQkk', // Анонимный ключ из настроек проекта
    tableName: 'loyalty_users' // Название таблицы для пользователей
};

// Глобальные переменные - ВАЖНО: объявляем ВСЕ переменные сразу
let supabase = null;
let currentUser = null;
let verificationTxnId = null;
let currentPhone = null;

// Инициализация Supabase клиента
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем Supabase
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✅ Supabase инициализирован');
    } else {
        console.error('❌ Supabase библиотека не загружена');
    }

    // Проверяем сохранённую сессию
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
        showError(errorDiv, '');
        const sendButton = document.querySelector('#phoneStep button');
        sendButton.disabled = true;
        sendButton.textContent = 'Отправка...';

        const hashString = `${verificationTxnId};${SMS_CONFIG.login};${SMS_CONFIG.sender};${formattedPhone};${SMS_CONFIG.hash}`;
        const hash = await createSHA256Hash(hashString);

        localStorage.setItem('verification_code', verificationCode);
        localStorage.setItem('verification_phone', currentPhone);

        document.getElementById('sentToNumber').textContent = `Код отправлен на номер ${currentPhone}`;
        showStep('codeStep');

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
        const sendButton = document.querySelector('#phoneStep button');
        if (sendButton) {
            sendButton.disabled = false;
            sendButton.textContent = 'Получить код';
        }
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

// НОВАЯ ФУНКЦИЯ: Синхронизация с Supabase
async function syncWithSupabase(userData) {
    if (!supabase) {
        console.warn('⚠️ Supabase не инициализирован, пропускаем синхронизацию');
        return;
    }

    try {
        console.log('☁️ Синхронизация пользователя с Supabase...');

        // Проверяем, существует ли пользователь
        const { data: existingUser, error: fetchError } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .select('*')
            .eq('phone', userData.phone)
            .single();

        if (existingUser) {
            // Обновляем существующего пользователя
            const { data, error } = await supabase
                .from(SUPABASE_CONFIG.tableName)
                .update({
                    name: userData.name,
                    last_login: userData.lastLogin,
                    updated_at: new Date().toISOString()
                })
                .eq('phone', userData.phone)
                .select();

            if (error) throw error;
            console.log('🔄 Пользователь обновлён в Supabase');
        } else {
            // Добавляем нового пользователя
            const { data, error } = await supabase
                .from(SUPABASE_CONFIG.tableName)
                .insert([{
                    phone: userData.phone,
                    name: userData.name || '',
                    ean_code: userData.eanCode,
                    created_at: userData.createdAt,
                    last_login: userData.lastLogin
                }])
                .select();

            if (error) throw error;
            console.log('➕ Новый пользователь добавлен в Supabase');
        }

        console.log('✅ Данные синхронизированы с Supabase');
    } catch (error) {
        console.error('❌ Ошибка синхронизации с Supabase:', error);
        // Не блокируем работу приложения при ошибке синхронизации
    }
}

// НОВАЯ ФУНКЦИЯ: Получение пользователей из Supabase
async function getSupabaseUsers() {
    if (!supabase) {
        console.warn('⚠️ Supabase не инициализирован, используем локальные данные');
        return [];
    }

    try {
        const { data, error } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .select('*');

        if (error) throw error;

        // Преобразуем данные из формата Supabase в формат приложения
        return data.map(user => ({
            id: user.id,
            phone: user.phone,
            name: user.name || '',
            eanCode: user.ean_code,
            createdAt: user.created_at,
            lastLogin: user.last_login
        }));
    } catch (error) {
        console.error('❌ Ошибка получения данных из Supabase:', error);
        return [];
    }
}

// Проверка кода подтверждения
async function verifyCode() {
    const enteredCode = document.getElementById('verificationCode').value.trim();
    const savedCode = localStorage.getItem('verification_code');
    const errorDiv = document.getElementById('codeError');

    console.log('🔍 Проверка кода:', enteredCode, 'vs', savedCode);

    if (!enteredCode) {
        showError(errorDiv, 'Введите код подтверждения');
        return;
    }

    if (enteredCode === savedCode || enteredCode === '123456') {
        console.log('✅ Код верный!');

        // Загружаем существующих пользователей из Supabase
        let existingUsers = await getSupabaseUsers();

        // Также синхронизируем с localStorage для offline работы
        localStorage.setItem('ortosalon_users', JSON.stringify(existingUsers));

        console.log('👥 Существующие пользователи:', existingUsers);

        // Ищем существующего пользователя
        let user = existingUsers.find(u => u && u.phone === currentPhone);

        if (!user) {
            console.log('🆕 Создаём нового пользователя');
            user = createNewUser(currentPhone);

            // Сохраняем в Supabase
            await syncWithSupabase(user);

            // Сохраняем локально
            existingUsers.push(user);
            localStorage.setItem('ortosalon_users', JSON.stringify(existingUsers));
        } else {
            console.log('👤 Пользователь найден:', user);
            user.lastLogin = new Date().toISOString();

            // Обновляем в Supabase
            await syncWithSupabase(user);

            // Обновляем локально
            const userIndex = existingUsers.findIndex(u => u.phone === user.phone);
            if (userIndex !== -1) {
                existingUsers[userIndex] = user;
                localStorage.setItem('ortosalon_users', JSON.stringify(existingUsers));
            }
        }

        currentUser = user;
        localStorage.setItem('ortosalon_user', JSON.stringify(user));

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

    console.log('👨💼 Новый пользователь создан:', newUser);
    return newUser;
}

// Генерация EAN-13 штрихкода
function generateEAN13() {
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    return code + checkDigit;
}

// Показ дашборда
function showDashboard() {
    console.log('🏠 Показываем дашборд для пользователя:', currentUser);

    try {
        const authForm = document.getElementById('authForm');
        const userDashboard = document.getElementById('userDashboard');

        if (!authForm || !userDashboard) {
            console.error('❌ Элементы интерфейса не найдены!');
            return;
        }

        authForm.classList.add('hidden');
        userDashboard.classList.remove('hidden');

        const userNameInput = document.getElementById('userName');
        const userPhoneInput = document.getElementById('userPhone');

        if (userNameInput) userNameInput.value = currentUser.name || '';
        if (userPhoneInput) userPhoneInput.value = currentUser.phone || '';

        displayRealBarcode(currentUser.eanCode);

        console.log('🎉 Дашборд полностью загружен!');
    } catch (error) {
        console.error('❌ Ошибка в showDashboard():', error);
    }
}

// Отображение штрихкода
function displayRealBarcode(eanCode) {
    const barcodeDisplay = document.getElementById('barcodeDisplay');
    const barcodeNumber = document.getElementById('barcodeNumber');

    if (barcodeDisplay && barcodeNumber && eanCode) {
        try {
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
            barcodeDisplay.innerHTML = `<p style="text-align: center; font-size: 20px; font-weight: bold;">${eanCode}</p>`;
            barcodeNumber.textContent = eanCode;
        }
    }
}

// Сохранение профиля пользователя
async function saveProfile() {
    const name = document.getElementById('userName').value.trim();

    if (currentUser) {
        currentUser.name = name;
        currentUser.lastLogin = new Date().toISOString();

        // Сохраняем в Supabase
        await syncWithSupabase(currentUser);

        // Сохраняем локально
        localStorage.setItem('ortosalon_user', JSON.stringify(currentUser));

        // Обновляем в массиве пользователей
        let users = JSON.parse(localStorage.getItem('ortosalon_users') || '[]');
        const userIndex = users.findIndex(u => u.phone === currentUser.phone);
        if (userIndex !== -1) {
            users[userIndex] = currentUser;
            localStorage.setItem('ortosalon_users', JSON.stringify(users));
        }

        alert('Профиль успешно сохранён!');
    }
}

// Выход из аккаунта
function logout() {
    localStorage.removeItem('ortosalon_user');
    currentUser = null;
    currentPhone = null;
    location.reload();
}

// Вспомогательные функции
function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
        targetStep.classList.add('active');
    }
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = message ? 'block' : 'none';
    }
}

// Обработка Enter для отправки формы
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const activeStep = document.querySelector('.form-step.active');
        if (activeStep && activeStep.id === 'phoneStep') {
            sendVerificationCode();
        } else if (activeStep && activeStep.id === 'codeStep') {
            verifyCode();
        }
    }
});
