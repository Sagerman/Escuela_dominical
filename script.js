// Usuarios predefinidos
const users = {
    'pastor': { password: 'pastor123', role: 'pastor', name: 'Pastor' },
    'maestro_ninos': { password: 'ninos123', role: 'children', name: 'Maestro de Niños' },
    'maestro_adolescentes': { password: 'adolescentes123', role: 'teens', name: 'Maestro de Adolescentes' }
};

// Estado de la aplicación
let currentUser = null;
let currentGroup = null;
let students = {
    children: [],
    teens: []
};

// Variables para edición
let currentEditingStudent = null;
let studentToDelete = null;

// Sistema de base de datos para asistencias
let attendanceDatabase = {};
let currentYear = new Date().getFullYear();

// Firebase status
let firebaseReady = false;
let studentsListeners = {};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    // Esperar a que Firebase esté listo
    setTimeout(() => {
        initializeApp();
    }, 1000);
});

function initializeApp() {
    // Event listeners
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('addStudentForm').addEventListener('submit', handleAddStudent);
    
    // Verificar si Firebase está disponible
    if (window.db && window.firebaseUtils) {
        firebaseReady = true;
        console.log('✅ Firebase conectado - Datos en la nube');
        initializeFirebaseData();
    } else {
        console.log('⚠️ Firebase no disponible - Usando localStorage');
        initializeLocalData();
    }
    
    // Verificar si hay una sesión activa
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
    } else {
        showLogin();
    }
}

async function initializeFirebaseData() {
    // Inicializar listeners para estudiantes
    setupStudentsListeners();
    
    // MIGRAR DATOS DE LOCALSTORAGE A FIREBASE
    await migrateLocalDataToFirebase();
    
    // Cargar datos de asistencia
    await loadAttendanceFromFirebase();
    
    // Verificar estado de Firebase
    console.log('🔍 Estado de Firebase:');
    console.log('- Firebase Ready:', firebaseReady);
    console.log('- Database:', window.db ? 'Conectada' : 'No conectada');
    console.log('- Año actual:', currentYear);
    console.log('- Asistencias cargadas:', attendanceDatabase[currentYear]);
}

function initializeLocalData() {
    // Cargar datos del localStorage como fallback
    students = {
        children: JSON.parse(localStorage.getItem('children_students') || '[]'),
        teens: JSON.parse(localStorage.getItem('teens_students') || '[]')
    };
    
    // Cargar asistencias desde localStorage
    const localAttendance = localStorage.getItem('attendance_database');
    if (localAttendance) {
        attendanceDatabase = JSON.parse(localAttendance);
        console.log('📊 Asistencias recuperadas desde localStorage:', attendanceDatabase);
    }
    
    initializeAttendanceDatabase();
}

// NUEVA FUNCIÓN: Migrar datos de localStorage a Firebase
async function migrateLocalDataToFirebase() {
    if (!firebaseReady) {
        console.log('⚠️ Firebase no disponible, no se puede migrar');
        return;
    }

    console.log('🔄 Iniciando migración de datos locales a Firebase...');

    try {
        const { collection, doc, setDoc, getDocs } = window.firebaseUtils;
        let migratedCount = 0;

        // Migrar asistencias desde localStorage
        const localAttendance = localStorage.getItem('attendance_database');
        if (localAttendance) {
            const localData = JSON.parse(localAttendance);
            console.log('📦 Datos locales encontrados:', localData);

            for (const [year, yearData] of Object.entries(localData)) {
                if (yearData.children || yearData.teens) {
                    // Migrar asistencias de niños
                    if (yearData.children) {
                        for (const [date, attendanceData] of Object.entries(yearData.children)) {
                            const docId = `children_${date}`;
                            const docRef = doc(window.db, 'attendance', year, 'records', docId);
                            
                            try {
                                await setDoc(docRef, attendanceData, { merge: false });
                                migratedCount++;
                                console.log(`✅ Migrado: ${docId}`);
                            } catch (error) {
                                console.error(`❌ Error migrando ${docId}:`, error);
                            }
                        }
                    }

                    // Migrar asistencias de adolescentes
                    if (yearData.teens) {
                        for (const [date, attendanceData] of Object.entries(yearData.teens)) {
                            const docId = `teens_${date}`;
                            const docRef = doc(window.db, 'attendance', year, 'records', docId);
                            
                            try {
                                await setDoc(docRef, attendanceData, { merge: false });
                                migratedCount++;
                                console.log(`✅ Migrado: ${docId}`);
                            } catch (error) {
                                console.error(`❌ Error migrando ${docId}:`, error);
                            }
                        }
                    }
                }
            }
        }

        if (migratedCount > 0) {
            console.log(`🎉 Migración completada: ${migratedCount} registros migrados a Firebase`);
            alert(`✅ Se migraron ${migratedCount} registros de asistencia a la nube`);
        } else {
            console.log('ℹ️ No hay datos locales para migrar');
        }

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
    }
}

function setupStudentsListeners() {
    if (!firebaseReady) return;

    const { collection, onSnapshot, query, orderBy } = window.firebaseUtils;

    // Listener para niños
    const childrenQuery = query(
        collection(window.db, 'students', 'children', 'list'),
        orderBy('name')
    );
    
    studentsListeners.children = onSnapshot(childrenQuery, (snapshot) => {
        students.children = [];
        snapshot.forEach((doc) => {
            students.children.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Actualizar vista si estamos en el grupo de niños
        if (currentGroup === 'children') {
            displayStudents();
        }
        
        console.log(`📚 Estudiantes niños actualizados: ${students.children.length}`);
    });

    // Listener para adolescentes
    const teensQuery = query(
        collection(window.db, 'students', 'teens', 'list'),
        orderBy('name')
    );
    
    studentsListeners.teens = onSnapshot(teensQuery, (snapshot) => {
        students.teens = [];
        snapshot.forEach((doc) => {
            students.teens.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Actualizar vista si estamos en el grupo de adolescentes
        if (currentGroup === 'teens') {
            displayStudents();
        }
        
        console.log(`👥 Estudiantes adolescentes actualizados: ${students.teens.length}`);
    });
}

async function loadAttendanceFromFirebase() {
    // Primero cargar desde localStorage
    const localData = localStorage.getItem('attendance_database');
    if (localData) {
        attendanceDatabase = JSON.parse(localData);
        console.log('📊 Datos de asistencia cargados desde localStorage');
    }
    
    if (!firebaseReady) {
        console.warn('⚠️ Firebase no disponible, usando solo localStorage');
        return;
    }

    try {
        const { collection, getDocs } = window.firebaseUtils;
        
        console.log('🔄 Cargando asistencias desde Firebase...');
        
        // Cargar asistencias del año actual
        const attendanceRef = collection(window.db, 'attendance', currentYear.toString(), 'records');
        const snapshot = await getDocs(attendanceRef);
        
        if (!attendanceDatabase[currentYear]) {
            attendanceDatabase[currentYear] = {
                children: {},
                teens: {},
                created: new Date().toISOString()
            };
        }
        
        let firebaseDataCount = 0;
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            firebaseDataCount++;
            
            console.log(`📄 Documento encontrado: ${docId}`, data);
            
            // Intentar extraer grupo y fecha del ID del documento
            if (docId.includes('_')) {
                const parts = docId.split('_');
                const group = parts[0];
                const date = parts.slice(1).join('_'); // Por si la fecha tiene guiones
                
                if (group === 'children' || group === 'teens') {
                    attendanceDatabase[currentYear][group][date] = data;
                    console.log(`✅ Asistencia cargada: ${group} - ${date}`);
                }
            } else {
                // Si no tiene el formato esperado, usar los datos del documento
                if (data.group && data.date) {
                    attendanceDatabase[currentYear][data.group][data.date] = data;
                    console.log(`✅ Asistencia cargada (formato alternativo): ${data.group} - ${data.date}`);
                }
            }
        });
        
        // Guardar en localStorage como respaldo
        localStorage.setItem('attendance_database', JSON.stringify(attendanceDatabase));
        
        if (firebaseDataCount > 0) {
            console.log(`📊 ${firebaseDataCount} registros de asistencia sincronizados desde Firebase`);
            console.log('Datos completos:', attendanceDatabase[currentYear]);
        } else {
            console.log('📊 No hay datos de asistencia en Firebase para este año');
        }
    } catch (error) {
        console.error('❌ Error cargando asistencias desde Firebase:', error);
        console.error('Detalles del error:', error.message);
        console.log('📊 Usando datos de localStorage como respaldo');
    }
}

function initializeAttendanceDatabase() {
    // Crear estructura de base de datos por año si no existe
    if (!attendanceDatabase[currentYear]) {
        attendanceDatabase[currentYear] = {
            children: {},
            teens: {},
            created: new Date().toISOString()
        };
        saveAttendanceDatabase();
    }
}

async function saveAttendanceDatabase() {
    // Siempre guardar en localStorage primero
    localStorage.setItem('attendance_database', JSON.stringify(attendanceDatabase));
    
    if (!firebaseReady) {
        console.warn('⚠️ Firebase no disponible, guardado solo en localStorage');
        return;
    }

    try {
        const { doc, setDoc } = window.firebaseUtils;
        
        // Guardar cada registro de asistencia
        const yearData = attendanceDatabase[currentYear];
        if (yearData) {
            let savedCount = 0;
            for (const [group, dates] of Object.entries(yearData)) {
                if (group === 'children' || group === 'teens') {
                    for (const [date, data] of Object.entries(dates)) {
                        const docId = `${group}_${date}`;
                        const docRef = doc(window.db, 'attendance', currentYear.toString(), 'records', docId);
                        
                        try {
                            // Usar setDoc en lugar de updateDoc para crear o actualizar
                            await setDoc(docRef, data, { merge: false });
                            savedCount++;
                            console.log(`✅ Guardado en Firebase: ${docId}`);
                        } catch (error) {
                            console.error(`❌ Error guardando ${docId}:`, error);
                        }
                    }
                }
            }
            
            console.log(`💾 ${savedCount} asistencias guardadas en Firebase`);
        }
    } catch (error) {
        console.error('❌ Error general guardando en Firebase:', error);
    }
}

function showLogin() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('loginScreen').classList.add('active');
}

function showDashboard() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('dashboardScreen').classList.add('active');
    
    // Actualizar información del usuario
    document.getElementById('currentUser').textContent = currentUser.name;
    
    // Mostrar fecha actual y estado del domingo
    updateDateAndStatus();
    
    // Mostrar/ocultar grupos según el rol
    updateGroupVisibility();
}

function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    if (users[username] && users[username].password === password) {
        currentUser = {
            username: username,
            role: users[username].role,
            name: users[username].name
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showDashboard();
        
        // Limpiar formulario
        document.getElementById('loginForm').reset();
        errorDiv.textContent = '';
    } else {
        errorDiv.textContent = 'Usuario o contraseña incorrectos  ';
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLogin();
}

function updateDateAndStatus() {
    const now = new Date();
    
    // Configurar para zona horaria de Colombia (UTC-5)
    const colombiaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
    
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    
    const dateString = colombiaTime.toLocaleDateString('es-CO', options);
    document.getElementById('currentDate').textContent = dateString;
    
    const isSunday = colombiaTime.getDay() === 0;
    const statusDiv = document.getElementById('sundayStatus');
    
    if (isSunday) {
        statusDiv.textContent = '✅ Hoy es domingo - Lista habilitada';
        statusDiv.className = 'status-message enabled';
    } else {
        statusDiv.textContent = '❌ La lista solo está disponible los domingos';
        statusDiv.className = 'status-message disabled';
    }
}

function updateGroupVisibility() {
    const childrenGroup = document.getElementById('childrenGroup');
    const teenGroup = document.getElementById('teenGroup');
    const reportsCard = document.querySelector('.reports-card');
    
    if (currentUser.role === 'pastor') {
        childrenGroup.style.display = 'block';
        teenGroup.style.display = 'block';
        reportsCard.style.display = 'block';
    } else if (currentUser.role === 'children') {
        childrenGroup.style.display = 'block';
        teenGroup.style.display = 'none';
        reportsCard.style.display = 'block';
    } else if (currentUser.role === 'teens') {
        childrenGroup.style.display = 'none';
        teenGroup.style.display = 'block';
        reportsCard.style.display = 'block';
    }
}

function openGroup(groupType) {
    // Verificar permisos
    if (currentUser.role !== 'pastor' && currentUser.role !== groupType) {
        alert('No tienes permisos para acceder a este grupo');
        return;
    }
    
    currentGroup = groupType;
    showGroupScreen();
}

function showGroupScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('groupScreen').classList.add('active');
    
    // Actualizar título del grupo
    const groupTitle = document.getElementById('groupTitle');
    groupTitle.textContent = currentGroup === 'children' ? 'Grupo de Niños' : 'Grupo de Adolescentes';
    
    // Mostrar fecha actual
    const now = new Date();
    const colombiaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
    const dateString = colombiaTime.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('groupDate').textContent = dateString;
    
    // HABILITADO PARA PRUEBAS - Lista siempre disponible
    const isSunday = true; // Cambiar a: colombiaTime.getDay() === 0 para producción
    const takeAttendanceBtn = document.getElementById('takeAttendanceBtn');
    takeAttendanceBtn.disabled = !isSunday;
    
    if (!isSunday) {
        takeAttendanceBtn.textContent = '📋 Lista disponible solo los domingos';
    } else {
        takeAttendanceBtn.textContent = '📋 Pasar Lista';
    }
    
    // Mostrar lista de estudiantes
    displayStudents();
}

function goBack() {
    currentGroup = null;
    document.getElementById('attendanceSection').style.display = 'none';
    showDashboard();
}

function displayStudents() {
    const studentsList = document.getElementById('studentsList');
    const groupStudents = students[currentGroup];
    
    if (groupStudents.length === 0) {
        studentsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No hay estudiantes registrados</p>';
        return;
    }
    
    studentsList.innerHTML = groupStudents.map(student => `
        <div class="student-item">
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-age">${student.age} años</div>
            </div>
            <div class="student-actions">
                <button class="action-btn view-btn" onclick="viewStudentDetails('${student.id}')">Ver</button>
                <button class="action-btn edit-student-btn" onclick="editStudentForm('${student.id}')">Editar</button>
                <button class="action-btn delete-student-btn" onclick="showDeleteConfirm('${student.id}')">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function showAddStudent() {
    currentEditingStudent = null;
    document.getElementById('studentModalTitle').textContent = 'Agregar Nuevo Estudiante';
    document.getElementById('studentSubmitBtn').textContent = 'Agregar';
    document.getElementById('addStudentForm').reset();
    document.getElementById('addStudentModal').classList.add('active');
}

function closeAddStudent() {
    document.getElementById('addStudentModal').classList.remove('active');
    document.getElementById('addStudentForm').reset();
    currentEditingStudent = null;
}

async function handleAddStudent(e) {
    e.preventDefault();
    
    const name = document.getElementById('studentName').value.trim();
    const age = parseInt(document.getElementById('studentAge').value);
    const phone = document.getElementById('studentPhone').value.trim();
    const address = document.getElementById('studentAddress').value.trim();
    const parents = document.getElementById('studentParents').value.trim();
    const notes = document.getElementById('studentNotes').value.trim();
    
    if (!name || !age) {
        alert('Por favor completa el nombre y la edad');
        return;
    }
    
    if (currentEditingStudent) {
        // Editar estudiante existente
        const existingStudent = students[currentGroup].find(student => 
            student.name.toLowerCase() === name.toLowerCase() && student.id !== currentEditingStudent.id
        );
        
        if (existingStudent) {
            alert('Ya existe otro estudiante con ese nombre');
            return;
        }
        
        const updatedStudent = {
            name: name,
            age: age,
            phone: phone || null,
            address: address || null,
            parents: parents || null,
            notes: notes || null,
            lastModified: new Date().toISOString(),
            group: currentGroup,
            addedBy: currentUser.name
        };
        
        if (firebaseReady) {
            try {
                const { doc, updateDoc } = window.firebaseUtils;
                const docRef = doc(window.db, 'students', currentGroup, 'list', currentEditingStudent.id);
                await updateDoc(docRef, updatedStudent);
                
                console.log('✅ Estudiante actualizado en Firebase');
                closeAddStudent();
                alert(`${name} ha sido actualizado exitosamente`);
            } catch (error) {
                console.error('Error actualizando estudiante:', error);
                alert('Error al actualizar el estudiante');
            }
        } else {
            // Fallback a localStorage
            const studentIndex = students[currentGroup].findIndex(s => s.id === currentEditingStudent.id);
            if (studentIndex !== -1) {
                students[currentGroup][studentIndex] = {
                    ...students[currentGroup][studentIndex],
                    ...updatedStudent
                };
                localStorage.setItem(`${currentGroup}_students`, JSON.stringify(students[currentGroup]));
                displayStudents();
                closeAddStudent();
                alert(`${name} ha sido actualizado exitosamente`);
            }
        }
    } else {
        // Agregar nuevo estudiante
        const existingStudent = students[currentGroup].find(student => 
            student.name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingStudent) {
            alert('Este estudiante ya está registrado');
            return;
        }
        
        const newStudent = {
            name: name,
            age: age,
            phone: phone || null,
            address: address || null,
            parents: parents || null,
            notes: notes || null,
            dateAdded: new Date().toISOString(),
            lastModified: null,
            group: currentGroup,
            addedBy: currentUser.name
        };
        
        if (firebaseReady) {
            try {
                const { collection, addDoc } = window.firebaseUtils;
                const docRef = await addDoc(collection(window.db, 'students', currentGroup, 'list'), newStudent);
                
                console.log('✅ Estudiante agregado a Firebase con ID:', docRef.id);
                closeAddStudent();
                alert(`${name} ha sido agregado exitosamente`);
            } catch (error) {
                console.error('Error agregando estudiante:', error);
                alert('Error al agregar el estudiante');
            }
        } else {
            // Fallback a localStorage
            newStudent.id = Date.now().toString();
            students[currentGroup].push(newStudent);
            localStorage.setItem(`${currentGroup}_students`, JSON.stringify(students[currentGroup]));
            displayStudents();
            closeAddStudent();
            alert(`${name} ha sido agregado exitosamente`);
        }
    }
}

// Funciones para ver detalles del estudiante
function viewStudentDetails(studentId) {
    console.log('Buscando estudiante con ID:', studentId);
    console.log('Estudiantes disponibles:', students[currentGroup]);
    
    const student = students[currentGroup].find(s => s.id == studentId || s.id === studentId);
    if (!student) {
        console.error('Estudiante no encontrado:', studentId);
        alert('Error: No se pudo encontrar la información del estudiante');
        return;
    }
    
    const detailsContent = document.getElementById('studentDetailsContent');
    
    detailsContent.innerHTML = `
        <div class="student-details">
            <div class="detail-item">
                <span class="detail-label">Nombre:</span>
                <span class="detail-value">${student.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Edad:</span>
                <span class="detail-value">${student.age} años</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Teléfono:</span>
                <span class="detail-value ${!student.phone ? 'empty' : ''}">${student.phone || 'No registrado'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Dirección:</span>
                <span class="detail-value ${!student.address ? 'empty' : ''}">${student.address || 'No registrada'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Padres:</span>
                <span class="detail-value ${!student.parents ? 'empty' : ''}">${student.parents || 'No registrados'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Notas:</span>
                <span class="detail-value ${!student.notes ? 'empty' : ''}">${student.notes || 'Sin notas adicionales'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Registrado:</span>
                <span class="detail-value">${new Date(student.dateAdded).toLocaleDateString('es-CO')}</span>
            </div>
            ${student.lastModified ? `
                <div class="detail-item">
                    <span class="detail-label">Última modificación:</span>
                    <span class="detail-value">${new Date(student.lastModified).toLocaleDateString('es-CO')}</span>
                </div>
            ` : ''}
        </div>
    `;
    
    currentEditingStudent = student;
    document.getElementById('studentDetailsModal').classList.add('active');
}

function closeStudentDetails() {
    document.getElementById('studentDetailsModal').classList.remove('active');
    currentEditingStudent = null;
}

function editStudent() {
    if (!currentEditingStudent) return;
    
    closeStudentDetails();
    editStudentForm(currentEditingStudent.id);
}

function editStudentForm(studentId) {
    console.log('Editando estudiante con ID:', studentId);
    const student = students[currentGroup].find(s => s.id == studentId || s.id === studentId);
    if (!student) {
        console.error('Estudiante no encontrado para editar:', studentId);
        alert('Error: No se pudo encontrar el estudiante para editar');
        return;
    }
    
    currentEditingStudent = student;
    
    // Llenar el formulario con los datos existentes
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentAge').value = student.age;
    document.getElementById('studentPhone').value = student.phone || '';
    document.getElementById('studentAddress').value = student.address || '';
    document.getElementById('studentParents').value = student.parents || '';
    document.getElementById('studentNotes').value = student.notes || '';
    
    // Cambiar el título y botón del modal
    document.getElementById('studentModalTitle').textContent = 'Editar Estudiante';
    document.getElementById('studentSubmitBtn').textContent = 'Actualizar';
    
    document.getElementById('addStudentModal').classList.add('active');
}

// Funciones para eliminar estudiante
function showDeleteConfirm(studentId) {
    console.log('Eliminando estudiante con ID:', studentId);
    const student = students[currentGroup].find(s => s.id == studentId || s.id === studentId);
    if (!student) {
        console.error('Estudiante no encontrado para eliminar:', studentId);
        alert('Error: No se pudo encontrar el estudiante para eliminar');
        return;
    }
    
    studentToDelete = student;
    document.getElementById('deleteStudentName').textContent = student.name;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

function closeDeleteConfirm() {
    document.getElementById('deleteConfirmModal').classList.remove('active');
    studentToDelete = null;
}

async function confirmDelete() {
    if (!studentToDelete) return;
    
    const studentName = studentToDelete.name;
    
    if (firebaseReady) {
        try {
            const { doc, deleteDoc } = window.firebaseUtils;
            const docRef = doc(window.db, 'students', currentGroup, 'list', studentToDelete.id);
            await deleteDoc(docRef);
            
            console.log('✅ Estudiante eliminado de Firebase');
            closeDeleteConfirm();
            alert(`${studentName} ha sido eliminado exitosamente`);
        } catch (error) {
            console.error('Error eliminando estudiante:', error);
            alert('Error al eliminar el estudiante');
        }
    } else {
        // Fallback a localStorage
        const studentIndex = students[currentGroup].findIndex(s => s.id === studentToDelete.id);
        
        if (studentIndex !== -1) {
            students[currentGroup].splice(studentIndex, 1);
            localStorage.setItem(`${currentGroup}_students`, JSON.stringify(students[currentGroup]));
            displayStudents();
            closeDeleteConfirm();
            alert(`${studentName} ha sido eliminado exitosamente`);
        }
    }
}

function deleteStudent() {
    if (!currentEditingStudent) return;
    
    closeStudentDetails();
    showDeleteConfirm(currentEditingStudent.id);
}

function takeAttendance() {
    const now = new Date();
    const colombiaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
    
    // DESHABILITADO PARA PRUEBAS - Permitir cualquier día
    // Descomentar la siguiente línea para producción:
    // if (colombiaTime.getDay() !== 0) {
    //     alert('La asistencia solo puede tomarse los domingos');
    //     return;
    // }
    
    const attendanceSection = document.getElementById('attendanceSection');
    const attendanceList = document.getElementById('attendanceList');
    const attendanceDate = document.getElementById('attendanceDate');
    
    // Mostrar fecha de asistencia
    const dateString = colombiaTime.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    attendanceDate.textContent = dateString;
    
    // Generar lista de asistencia
    const groupStudents = students[currentGroup];
    
    if (groupStudents.length === 0) {
        alert('No hay estudiantes registrados para tomar asistencia');
        return;
    }
    
    console.log('📋 Generando lista de asistencia para:', groupStudents.length, 'estudiantes');
    
    attendanceList.innerHTML = groupStudents.map(student => `
        <div class="attendance-item">
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-age">${student.age} años</div>
            </div>
            <label>
                <input type="checkbox" class="attendance-checkbox" data-student-id="${student.id}">
                Presente
            </label>
        </div>
    `).join('');
    
    attendanceSection.style.display = 'block';
    attendanceSection.scrollIntoView({ behavior: 'smooth' });
}

async function saveAttendance() {
    const checkboxes = document.querySelectorAll('.attendance-checkbox');
    const attendance = [];
    const now = new Date();
    const colombiaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
    const dateKey = colombiaTime.toISOString().split('T')[0];
    
    console.log('💾 Guardando asistencia para:', currentGroup, 'en fecha:', dateKey);
    
    checkboxes.forEach(checkbox => {
        const studentId = checkbox.dataset.studentId;
        const student = students[currentGroup].find(s => s.id == studentId || s.id === studentId);
        
        if (student) {
            attendance.push({
                studentId: studentId,
                studentName: student.name,
                studentAge: student.age,
                present: checkbox.checked,
                date: dateKey,
                timestamp: colombiaTime.toISOString()
            });
        }
    });
    
    const attendanceRecord = {
        date: dateKey,
        group: currentGroup,
        attendance: attendance,
        summary: {
            present: attendance.filter(a => a.present).length,
            total: attendance.length,
            percentage: Math.round((attendance.filter(a => a.present).length / attendance.length) * 100)
        },
        savedBy: currentUser.name,
        savedAt: colombiaTime.toISOString()
    };
    
    console.log('📊 Registro de asistencia:', attendanceRecord);
    
    // Guardar en la base de datos principal
    if (!attendanceDatabase[currentYear]) {
        attendanceDatabase[currentYear] = { children: {}, teens: {} };
    }
    attendanceDatabase[currentYear][currentGroup][dateKey] = attendanceRecord;
    
    let savedSuccessfully = false;
    let firebaseSaved = false;
    
    // PRIORIDAD: Guardar en Firebase primero
    if (firebaseReady) {
        try {
            const { doc, setDoc } = window.firebaseUtils;
            const docId = `${currentGroup}_${dateKey}`;
            const docRef = doc(window.db, 'attendance', currentYear.toString(), 'records', docId);
            
            // Usar setDoc con merge para asegurar que se guarde
            await setDoc(docRef, attendanceRecord, { merge: false });
            
            console.log('✅ Asistencia guardada en Firebase con ID:', docId);
            firebaseSaved = true;
            savedSuccessfully = true;
        } catch (error) {
            console.error('❌ Error guardando asistencia en Firebase:', error);
            console.error('Detalles del error:', error.message);
        }
    } else {
        console.warn('⚠️ Firebase no está disponible, guardando solo en localStorage');
    }
    
    // Siempre guardar en localStorage como respaldo
    try {
        localStorage.setItem('attendance_database', JSON.stringify(attendanceDatabase));
        const attendanceKey = `attendance_${currentGroup}_${dateKey}`;
        localStorage.setItem(attendanceKey, JSON.stringify(attendance));
        console.log('✅ Asistencia guardada en localStorage');
        savedSuccessfully = true;
    } catch (error) {
        console.error('❌ Error guardando en localStorage:', error);
    }
    
    if (savedSuccessfully) {
        // Mostrar resumen
        const presentCount = attendance.filter(a => a.present).length;
        const totalCount = attendance.length;
        const percentage = Math.round((presentCount / totalCount) * 100);
        
        let message = `✅ Asistencia guardada exitosamente!\n\nPresentes: ${presentCount}\nTotal: ${totalCount}\nPorcentaje: ${percentage}%\n\nFecha: ${new Date(dateKey).toLocaleDateString('es-CO')}`;
        
        if (firebaseSaved) {
            message += '\n\n☁️ Sincronizado en la nube';
        } else {
            message += '\n\n⚠️ Guardado localmente (sin conexión a Firebase)';
        }
        
        alert(message);
        
        // Ocultar sección de asistencia
        document.getElementById('attendanceSection').style.display = 'none';
        
        // Recargar reportes si estamos en esa pantalla
        if (document.getElementById('reportsScreen').classList.contains('active')) {
            loadReports();
        }
    } else {
        alert('❌ Error al guardar la asistencia. Por favor intenta de nuevo.');
    }
}

// Funciones para el sistema de reportes
function openReports() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('reportsScreen').classList.add('active');
    
    // Mostrar año actual
    document.getElementById('currentYear').textContent = `Año ${currentYear}`;
    
    // Cargar reportes
    loadReports();
}

function goBackToMain() {
    showDashboard();
}

function loadReports() {
    updateReportsSummary();
    displayAttendanceHistory();
}

function updateReportsSummary() {
    const yearData = attendanceDatabase[currentYear];
    if (!yearData) return;
    
    let totalSundays = 0;
    let totalChildrenAttendance = 0;
    let totalTeensAttendance = 0;
    let childrenSundays = 0;
    let teensSundays = 0;
    let bestAttendanceDate = '';
    let bestAttendanceCount = 0;
    
    // Filtrar datos según el rol del usuario
    if (currentUser.role === 'pastor') {
        // Pastor ve todo
        Object.keys(yearData.children || {}).forEach(date => {
            totalSundays++;
            childrenSundays++;
            const summary = yearData.children[date].summary;
            totalChildrenAttendance += summary.present;
            
            if (summary.present > bestAttendanceCount) {
                bestAttendanceCount = summary.present;
                bestAttendanceDate = date;
            }
        });
        
        Object.keys(yearData.teens || {}).forEach(date => {
            if (!yearData.children[date]) totalSundays++;
            teensSundays++;
            const summary = yearData.teens[date].summary;
            totalTeensAttendance += summary.present;
            
            if (summary.present > bestAttendanceCount) {
                bestAttendanceCount = summary.present;
                bestAttendanceDate = date;
            }
        });
        
        // Actualizar elementos del DOM para pastor
        document.getElementById('totalSundays').textContent = totalSundays;
        document.getElementById('avgChildren').textContent = childrenSundays > 0 ? Math.round(totalChildrenAttendance / childrenSundays) : 0;
        document.getElementById('avgTeens').textContent = teensSundays > 0 ? Math.round(totalTeensAttendance / teensSundays) : 0;
        
    } else if (currentUser.role === 'children') {
        // Maestro de niños solo ve datos de niños
        Object.keys(yearData.children || {}).forEach(date => {
            totalSundays++;
            const summary = yearData.children[date].summary;
            totalChildrenAttendance += summary.present;
            
            if (summary.present > bestAttendanceCount) {
                bestAttendanceCount = summary.present;
                bestAttendanceDate = date;
            }
        });
        
        // Actualizar elementos del DOM para maestro de niños
        document.getElementById('totalSundays').textContent = totalSundays;
        document.getElementById('avgChildren').textContent = totalSundays > 0 ? Math.round(totalChildrenAttendance / totalSundays) : 0;
        document.getElementById('avgTeens').textContent = '-';
        
    } else if (currentUser.role === 'teens') {
        // Maestro de adolescentes solo ve datos de adolescentes
        Object.keys(yearData.teens || {}).forEach(date => {
            totalSundays++;
            const summary = yearData.teens[date].summary;
            totalTeensAttendance += summary.present;
            
            if (summary.present > bestAttendanceCount) {
                bestAttendanceCount = summary.present;
                bestAttendanceDate = date;
            }
        });
        
        // Actualizar elementos del DOM para maestro de adolescentes
        document.getElementById('totalSundays').textContent = totalSundays;
        document.getElementById('avgChildren').textContent = '-';
        document.getElementById('avgTeens').textContent = totalSundays > 0 ? Math.round(totalTeensAttendance / totalSundays) : 0;
    }
    
    document.getElementById('bestAttendance').textContent = bestAttendanceDate ? 
        `${formatDate(bestAttendanceDate)} (${bestAttendanceCount})` : '-';
}

function displayAttendanceHistory() {
    const historyDiv = document.getElementById('attendanceHistory');
    const yearData = attendanceDatabase[currentYear];
    
    if (!yearData) {
        historyDiv.innerHTML = '<div class="no-data">No hay registros de asistencia para este año</div>';
        return;
    }
    
    let datesToShow = [];
    
    // Filtrar fechas según el rol del usuario
    if (currentUser.role === 'pastor') {
        // Pastor ve todas las fechas
        const allDates = new Set([
            ...Object.keys(yearData.children || {}),
            ...Object.keys(yearData.teens || {})
        ]);
        datesToShow = Array.from(allDates);
    } else if (currentUser.role === 'children') {
        // Maestro de niños solo ve fechas de niños
        datesToShow = Object.keys(yearData.children || {});
    } else if (currentUser.role === 'teens') {
        // Maestro de adolescentes solo ve fechas de adolescentes
        datesToShow = Object.keys(yearData.teens || {});
    }
    
    const sortedDates = datesToShow.sort().reverse();
    
    if (sortedDates.length === 0) {
        historyDiv.innerHTML = '<div class="no-data">No hay registros de asistencia</div>';
        return;
    }
    
    historyDiv.innerHTML = sortedDates.map(date => {
        const childrenData = yearData.children?.[date];
        const teensData = yearData.teens?.[date];
        
        // Mostrar datos según permisos del usuario
        let statsHTML = '';
        
        if (currentUser.role === 'pastor') {
            // Pastor ve ambos grupos
            if (childrenData) {
                statsHTML += `
                    <div class="stat-item">
                        <span class="stat-label">Niños</span>
                        <span class="stat-value children">${childrenData.summary.present}/${childrenData.summary.total}</span>
                    </div>
                `;
            }
            if (teensData) {
                statsHTML += `
                    <div class="stat-item">
                        <span class="stat-label">Adolescentes</span>
                        <span class="stat-value teens">${teensData.summary.present}/${teensData.summary.total}</span>
                    </div>
                `;
            }
            if (childrenData || teensData) {
                statsHTML += `
                    <div class="stat-item">
                        <span class="stat-label">Total</span>
                        <span class="stat-value">
                            ${(childrenData?.summary.present || 0) + (teensData?.summary.present || 0)}/
                            ${(childrenData?.summary.total || 0) + (teensData?.summary.total || 0)}
                        </span>
                    </div>
                `;
            }
        } else if (currentUser.role === 'children' && childrenData) {
            // Maestro de niños solo ve su grupo
            statsHTML = `
                <div class="stat-item">
                    <span class="stat-label">Niños</span>
                    <span class="stat-value children">${childrenData.summary.present}/${childrenData.summary.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Porcentaje</span>
                    <span class="stat-value">${childrenData.summary.percentage}%</span>
                </div>
            `;
        } else if (currentUser.role === 'teens' && teensData) {
            // Maestro de adolescentes solo ve su grupo
            statsHTML = `
                <div class="stat-item">
                    <span class="stat-label">Adolescentes</span>
                    <span class="stat-value teens">${teensData.summary.present}/${teensData.summary.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Porcentaje</span>
                    <span class="stat-value">${teensData.summary.percentage}%</span>
                </div>
            `;
        }
        
        return `
            <div class="attendance-record">
                <div class="record-date">${formatDate(date)}</div>
                <div class="record-stats">
                    ${statsHTML}
                </div>
            </div>
        `;
    }).join('');
}

function filterReports() {
    const groupFilter = document.getElementById('groupFilter').value;
    const monthFilter = document.getElementById('monthFilter').value;
    
    // Aquí puedes implementar la lógica de filtrado
    // Por ahora, simplemente recarga los reportes
    displayAttendanceHistory();
}

function generateYearReport() {
    document.getElementById('yearReportModal').classList.add('active');
    document.getElementById('reportYear').textContent = currentYear;
    
    generateYearCharts();
    updateYearStats();
}

function closeYearReport() {
    document.getElementById('yearReportModal').classList.remove('active');
}

function generateYearCharts() {
    generateMonthlyChart();
    generateGroupChart();
}

function generateMonthlyChart() {
    const chartDiv = document.getElementById('monthlyChart');
    const yearData = attendanceDatabase[currentYear];
    
    if (!yearData) {
        chartDiv.innerHTML = '<div class="no-data">No hay datos para mostrar</div>';
        return;
    }
    
    // Agrupar por mes según el rol del usuario
    const monthlyData = {};
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Inicializar meses
    months.forEach((month, index) => {
        monthlyData[index] = { children: 0, teens: 0, count: 0 };
    });
    
    // Procesar datos según el rol
    if (currentUser.role === 'pastor') {
        // Pastor ve ambos grupos
        Object.keys(yearData.children || {}).forEach(date => {
            const month = new Date(date).getMonth();
            monthlyData[month].children += yearData.children[date].summary.present;
            monthlyData[month].count++;
        });
        
        Object.keys(yearData.teens || {}).forEach(date => {
            const month = new Date(date).getMonth();
            monthlyData[month].teens += yearData.teens[date].summary.present;
        });
        
        // Generar gráfico combinado para pastor
        const maxValue = Math.max(...Object.values(monthlyData).map(m => m.children + m.teens));
        
        chartDiv.innerHTML = months.map((month, index) => {
            const total = monthlyData[index].children + monthlyData[index].teens;
            const height = maxValue > 0 ? (total / maxValue) * 150 : 0;
            
            return `
                <div class="chart-bar" style="height: ${height}px;">
                    <div class="chart-bar-value">${total}</div>
                    <div class="chart-bar-label">${month}</div>
                </div>
            `;
        }).join('');
        
    } else if (currentUser.role === 'children') {
        // Maestro de niños solo ve su grupo
        Object.keys(yearData.children || {}).forEach(date => {
            const month = new Date(date).getMonth();
            monthlyData[month].children += yearData.children[date].summary.present;
        });
        
        const maxValue = Math.max(...Object.values(monthlyData).map(m => m.children));
        
        chartDiv.innerHTML = months.map((month, index) => {
            const total = monthlyData[index].children;
            const height = maxValue > 0 ? (total / maxValue) * 150 : 0;
            
            return `
                <div class="chart-bar" style="height: ${height}px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);">
                    <div class="chart-bar-value">${total}</div>
                    <div class="chart-bar-label">${month}</div>
                </div>
            `;
        }).join('');
        
    } else if (currentUser.role === 'teens') {
        // Maestro de adolescentes solo ve su grupo
        Object.keys(yearData.teens || {}).forEach(date => {
            const month = new Date(date).getMonth();
            monthlyData[month].teens += yearData.teens[date].summary.present;
        });
        
        const maxValue = Math.max(...Object.values(monthlyData).map(m => m.teens));
        
        chartDiv.innerHTML = months.map((month, index) => {
            const total = monthlyData[index].teens;
            const height = maxValue > 0 ? (total / maxValue) * 150 : 0;
            
            return `
                <div class="chart-bar" style="height: ${height}px; background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);">
                    <div class="chart-bar-value">${total}</div>
                    <div class="chart-bar-label">${month}</div>
                </div>
            `;
        }).join('');
    }
}

function generateGroupChart() {
    const chartDiv = document.getElementById('groupChart');
    const yearData = attendanceDatabase[currentYear];
    
    if (!yearData) {
        chartDiv.innerHTML = '<div class="no-data">No hay datos para mostrar</div>';
        return;
    }
    
    // Solo el pastor puede ver comparación entre grupos
    if (currentUser.role !== 'pastor') {
        chartDiv.innerHTML = '<div class="no-data">Solo disponible para el pastor</div>';
        return;
    }
    
    let childrenTotal = 0;
    let teensTotal = 0;
    
    Object.values(yearData.children || {}).forEach(record => {
        childrenTotal += record.summary.present;
    });
    
    Object.values(yearData.teens || {}).forEach(record => {
        teensTotal += record.summary.present;
    });
    
    const maxValue = Math.max(childrenTotal, teensTotal);
    
    chartDiv.innerHTML = `
        <div class="chart-bar" style="height: ${maxValue > 0 ? (childrenTotal / maxValue) * 150 : 0}px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);">
            <div class="chart-bar-value">${childrenTotal}</div>
            <div class="chart-bar-label">Niños</div>
        </div>
        <div class="chart-bar" style="height: ${maxValue > 0 ? (teensTotal / maxValue) * 150 : 0}px; background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);">
            <div class="chart-bar-value">${teensTotal}</div>
            <div class="chart-bar-label">Adolescentes</div>
        </div>
    `;
}

function updateYearStats() {
    const yearData = attendanceDatabase[currentYear];
    
    if (!yearData) {
        document.getElementById('yearTotalSundays').textContent = '0';
        document.getElementById('yearAvgAttendance').textContent = '0';
        document.getElementById('bestMonth').textContent = '-';
        document.getElementById('bestSunday').textContent = '-';
        return;
    }
    
    const allDates = new Set([
        ...Object.keys(yearData.children || {}),
        ...Object.keys(yearData.teens || {})
    ]);
    
    let totalAttendance = 0;
    let bestSundayDate = '';
    let bestSundayCount = 0;
    
    allDates.forEach(date => {
        const childrenCount = yearData.children[date]?.summary.present || 0;
        const teensCount = yearData.teens[date]?.summary.present || 0;
        const dayTotal = childrenCount + teensCount;
        
        totalAttendance += dayTotal;
        
        if (dayTotal > bestSundayCount) {
            bestSundayCount = dayTotal;
            bestSundayDate = date;
        }
    });
    
    document.getElementById('yearTotalSundays').textContent = allDates.size;
    document.getElementById('yearAvgAttendance').textContent = allDates.size > 0 ? Math.round(totalAttendance / allDates.size) : 0;
    document.getElementById('bestSunday').textContent = bestSundayDate ? 
        `${formatDate(bestSundayDate)} (${bestSundayCount})` : '-';
    
    // Calcular mejor mes (simplificado)
    document.getElementById('bestMonth').textContent = 'Calculando...';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    return date.toLocaleDateString('es-CO', options);
}

// Función para limpiar años anteriores (opcional)
function cleanOldYears() {
    const currentYear = new Date().getFullYear();
    Object.keys(attendanceDatabase).forEach(year => {
        if (parseInt(year) < currentYear) {
            // Opcional: mantener solo los últimos 2 años
            if (parseInt(year) < currentYear - 1) {
                delete attendanceDatabase[year];
            }
        }
    });
    saveAttendanceDatabase();
}

// Función para obtener la fecha actual en Colombia
function getCurrentColombiaDate() {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
}

// Funciones de exportación a Excel
function exportStudentsToExcel() {
    const groupStudents = students[currentGroup];
    const groupName = currentGroup === 'children' ? 'Niños' : 'Adolescentes';
    
    if (groupStudents.length === 0) {
        alert('No hay estudiantes para exportar');
        return;
    }
    
    // Preparar datos para Excel
    const data = [
        ['Lista de Estudiantes - ' + groupName],
        ['El Bosque MMM - Movimiento Misionero Mundial'],
        ['Fecha de exportación: ' + new Date().toLocaleDateString('es-CO')],
        [], // Fila vacía
        ['#', 'Nombre Completo', 'Edad', 'Teléfono', 'Dirección', 'Padres', 'Notas', 'Fecha de Registro']
    ];
    
    groupStudents.forEach((student, index) => {
        data.push([
            index + 1,
            student.name,
            student.age + ' años',
            student.phone || 'No registrado',
            student.address || 'No registrada',
            student.parents || 'No registrados',
            student.notes || 'Sin notas',
            new Date(student.dateAdded).toLocaleDateString('es-CO')
        ]);
    });
    
    // Crear libro de Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Ajustar ancho de columnas
    ws['!cols'] = [
        { width: 5 },   // #
        { width: 25 },  // Nombre
        { width: 10 },  // Edad
        { width: 15 },  // Teléfono
        { width: 30 },  // Dirección
        { width: 25 },  // Padres
        { width: 30 },  // Notas
        { width: 15 }   // Fecha
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
    
    // Descargar archivo
    const fileName = `Estudiantes_${groupName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function exportAttendanceToExcel() {
    const yearData = attendanceDatabase[currentYear];
    if (!yearData) {
        alert('No hay datos de asistencia para exportar');
        return;
    }
    
    // Preparar datos según el rol del usuario
    let datesToExport = [];
    let groupName = '';
    
    if (currentUser.role === 'pastor') {
        groupName = 'Todos los Grupos';
        const allDates = new Set([
            ...Object.keys(yearData.children || {}),
            ...Object.keys(yearData.teens || {})
        ]);
        datesToExport = Array.from(allDates).sort();
    } else if (currentUser.role === 'children') {
        groupName = 'Niños';
        datesToExport = Object.keys(yearData.children || {}).sort();
    } else if (currentUser.role === 'teens') {
        groupName = 'Adolescentes';
        datesToExport = Object.keys(yearData.teens || {}).sort();
    }
    
    if (datesToExport.length === 0) {
        alert('No hay registros de asistencia para exportar');
        return;
    }
    
    // Crear datos para Excel
    const data = [
        ['Reporte de Asistencias - ' + groupName],
        ['El Bosque MMM - Movimiento Misionero Mundial'],
        ['Año: ' + currentYear],
        ['Fecha de exportación: ' + new Date().toLocaleDateString('es-CO')],
        [], // Fila vacía
    ];
    
    if (currentUser.role === 'pastor') {
        data.push(['Fecha', 'Niños Presentes', 'Total Niños', 'Adolescentes Presentes', 'Total Adolescentes', 'Total General']);
        
        datesToExport.forEach(date => {
            const childrenData = yearData.children?.[date];
            const teensData = yearData.teens?.[date];
            
            data.push([
                new Date(date).toLocaleDateString('es-CO'),
                childrenData?.summary.present || 0,
                childrenData?.summary.total || 0,
                teensData?.summary.present || 0,
                teensData?.summary.total || 0,
                (childrenData?.summary.present || 0) + (teensData?.summary.present || 0)
            ]);
        });
    } else {
        data.push(['Fecha', 'Presentes', 'Total', 'Porcentaje']);
        
        datesToExport.forEach(date => {
            const groupData = currentUser.role === 'children' ? 
                yearData.children?.[date] : yearData.teens?.[date];
            
            if (groupData) {
                data.push([
                    new Date(date).toLocaleDateString('es-CO'),
                    groupData.summary.present,
                    groupData.summary.total,
                    groupData.summary.percentage + '%'
                ]);
            }
        });
    }
    
    // Crear libro de Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Ajustar ancho de columnas
    if (currentUser.role === 'pastor') {
        ws['!cols'] = [
            { width: 15 }, // Fecha
            { width: 15 }, // Niños Presentes
            { width: 12 }, // Total Niños
            { width: 18 }, // Adolescentes Presentes
            { width: 18 }, // Total Adolescentes
            { width: 15 }  // Total General
        ];
    } else {
        ws['!cols'] = [
            { width: 15 }, // Fecha
            { width: 12 }, // Presentes
            { width: 10 }, // Total
            { width: 12 }  // Porcentaje
        ];
    }
    
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias');
    
    // Descargar archivo
    const fileName = `Asistencias_${groupName.replace(' ', '_')}_${currentYear}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// Funciones de impresión
function printStudentsList() {
    const groupStudents = students[currentGroup];
    const groupName = currentGroup === 'children' ? 'Niños' : 'Adolescentes';
    
    if (groupStudents.length === 0) {
        alert('No hay estudiantes para imprimir');
        return;
    }
    
    // Crear contenido para imprimir (solo nombres para la lista)
    let printContent = `
        <div class="print-content">
            <div class="print-header">
                <div class="print-title">El Bosque MMM</div>
                <div class="print-subtitle">Movimiento Misionero Mundial</div>
                <div class="print-subtitle">Lista de Asistencia - ${groupName}</div>
                <div class="print-subtitle">Fecha: ${new Date().toLocaleDateString('es-CO')}</div>
            </div>
            
            <table class="print-table">
                <thead>
                    <tr>
                        <th style="width: 10%">#</th>
                        <th style="width: 60%">Nombre Completo</th>
                        <th style="width: 15%">Presente</th>
                        <th style="width: 15%">Ausente</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    groupStudents.forEach((student, index) => {
        printContent += `
            <tr>
                <td>${index + 1}</td>
                <td>${student.name}</td>
                <td style="text-align: center;">☐</td>
                <td style="text-align: center;">☐</td>
            </tr>
        `;
    });
    
    printContent += `
                </tbody>
            </table>
            <div style="margin-top: 30px;">
                <p><strong>Total de estudiantes:</strong> ${groupStudents.length}</p>
                <p><strong>Maestro:</strong> _________________________</p>
                <p><strong>Observaciones:</strong></p>
                <div style="border: 1px solid #000; height: 100px; margin-top: 10px;"></div>
            </div>
        </div>
    `;
    
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Lista de Asistencia - ${groupName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .print-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .print-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .print-subtitle { font-size: 16px; color: #666; margin-bottom: 5px; }
                    .print-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .print-table th, .print-table td { border: 1px solid #000; padding: 12px 8px; text-align: left; }
                    .print-table th { background-color: #f0f0f0; font-weight: bold; }
                    p { margin: 10px 0; }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// Nueva función para imprimir información completa de estudiantes
function printStudentsInfo() {
    const groupStudents = students[currentGroup];
    const groupName = currentGroup === 'children' ? 'Niños' : 'Adolescentes';
    
    if (groupStudents.length === 0) {
        alert('No hay estudiantes para imprimir');
        return;
    }
    
    // Crear contenido para imprimir con información completa
    let printContent = `
        <div class="print-content">
            <div class="print-header">
                <div class="print-title">El Bosque MMM</div>
                <div class="print-subtitle">Movimiento Misionero Mundial</div>
                <div class="print-subtitle">Información Completa de Estudiantes - ${groupName}</div>
                <div class="print-subtitle">Fecha: ${new Date().toLocaleDateString('es-CO')}</div>
            </div>
            
            <table class="print-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Nombre</th>
                        <th>Edad</th>
                        <th>Teléfono</th>
                        <th>Dirección</th>
                        <th>Padres</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    groupStudents.forEach((student, index) => {
        printContent += `
            <tr>
                <td>${index + 1}</td>
                <td>${student.name}</td>
                <td>${student.age}</td>
                <td>${student.phone || 'N/A'}</td>
                <td>${student.address || 'N/A'}</td>
                <td>${student.parents || 'N/A'}</td>
            </tr>
        `;
    });
    
    printContent += `
                </tbody>
            </table>
        </div>
    `;
    
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Información de Estudiantes - ${groupName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
                    .print-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .print-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .print-subtitle { font-size: 16px; color: #666; margin-bottom: 5px; }
                    .print-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .print-table th, .print-table td { border: 1px solid #000; padding: 8px; text-align: left; }
                    .print-table th { background-color: #f0f0f0; font-weight: bold; }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

function printAttendanceReport() {
    const yearData = attendanceDatabase[currentYear];
    if (!yearData) {
        alert('No hay datos de asistencia para imprimir');
        return;
    }
    
    // Preparar datos según el rol del usuario
    let datesToPrint = [];
    let groupName = '';
    
    if (currentUser.role === 'pastor') {
        groupName = 'Todos los Grupos';
        const allDates = new Set([
            ...Object.keys(yearData.children || {}),
            ...Object.keys(yearData.teens || {})
        ]);
        datesToPrint = Array.from(allDates).sort().reverse();
    } else if (currentUser.role === 'children') {
        groupName = 'Niños';
        datesToPrint = Object.keys(yearData.children || {}).sort().reverse();
    } else if (currentUser.role === 'teens') {
        groupName = 'Adolescentes';
        datesToPrint = Object.keys(yearData.teens || {}).sort().reverse();
    }
    
    if (datesToPrint.length === 0) {
        alert('No hay registros de asistencia para imprimir');
        return;
    }
    
    // Crear contenido para imprimir
    let printContent = `
        <div class="print-content">
            <div class="print-header">
                <div class="print-title">El Bosque MMM</div>
                <div class="print-subtitle">Movimiento Misionero Mundial</div>
                <div class="print-subtitle">Reporte de Asistencias - ${groupName}</div>
                <div class="print-subtitle">Año: ${currentYear}</div>
                <div class="print-subtitle">Fecha de impresión: ${new Date().toLocaleDateString('es-CO')}</div>
            </div>
            
            <table class="print-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
    `;
    
    if (currentUser.role === 'pastor') {
        printContent += `
                        <th>Niños Presentes</th>
                        <th>Total Niños</th>
                        <th>Adolescentes Presentes</th>
                        <th>Total Adolescentes</th>
                        <th>Total General</th>
        `;
    } else {
        printContent += `
                        <th>Presentes</th>
                        <th>Total</th>
                        <th>Porcentaje</th>
        `;
    }
    
    printContent += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    datesToPrint.forEach(date => {
        printContent += `<tr><td>${new Date(date).toLocaleDateString('es-CO')}</td>`;
        
        if (currentUser.role === 'pastor') {
            const childrenData = yearData.children?.[date];
            const teensData = yearData.teens?.[date];
            
            printContent += `
                <td>${childrenData?.summary.present || 0}</td>
                <td>${childrenData?.summary.total || 0}</td>
                <td>${teensData?.summary.present || 0}</td>
                <td>${teensData?.summary.total || 0}</td>
                <td>${(childrenData?.summary.present || 0) + (teensData?.summary.present || 0)}</td>
            `;
        } else {
            const groupData = currentUser.role === 'children' ? 
                yearData.children?.[date] : yearData.teens?.[date];
            
            if (groupData) {
                printContent += `
                    <td>${groupData.summary.present}</td>
                    <td>${groupData.summary.total}</td>
                    <td>${groupData.summary.percentage}%</td>
                `;
            }
        }
        
        printContent += `</tr>`;
    });
    
    printContent += `
                </tbody>
            </table>
        </div>
    `;
    
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Reporte de Asistencias - ${groupName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .print-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                    .print-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                    .print-subtitle { font-size: 16px; color: #666; margin-bottom: 5px; }
                    .print-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .print-table th, .print-table td { border: 1px solid #000; padding: 8px; text-align: left; }
                    .print-table th { background-color: #f0f0f0; font-weight: bold; }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}
