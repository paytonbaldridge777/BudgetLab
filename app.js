document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT ---
    const state = {
        categories: [],
        transactions: [],
        monthlyBudgets: [],
        selectedMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
        ui: {
            transactionModal: document.getElementById('transaction-modal'),
            csvImportModal: document.getElementById('csv-import-modal'),
            transactionForm: document.getElementById('transaction-form'),
            // other UI elements
        }
    };

    // --- DATA HELPERS ---
    const DB_KEYS = {
        categories: 'budget_categories',
        transactions: 'budget_transactions',
        monthlyBudgets: 'budget_monthlyBudgets'
    };
    
    const DEFAULT_CATEGORIES = [
        { id: 'cat-1', name: 'Housing', active: true },
        { id: 'cat-2', name: 'Utilities', active: true },
        { id: 'cat-3', name: 'Groceries', active: true },
        { id: 'cat-4', name: 'Transportation', active: true },
        { id: 'cat-5', name: 'Insurance', active: true },
        { id: 'cat-6', name: 'Debt Payments', active: true },
        { id: 'cat-7', name: 'Savings', active: true },
        { id: 'cat-8', name: 'Entertainment', active: true },
        { id: 'cat-9', name: 'Miscellaneous', active: true }
    ];

    function loadData() {
        state.categories = JSON.parse(localStorage.getItem(DB_KEYS.categories)) || [];
        if (state.categories.length === 0) {
            state.categories = DEFAULT_CATEGORIES;
            saveData('categories');
        }
        state.transactions = JSON.parse(localStorage.getItem(DB_KEYS.transactions)) || [];
        state.monthlyBudgets = JSON.parse(localStorage.getItem(DB_KEYS.monthlyBudgets)) || [];
    }

    function saveData(key) {
        if (state[key]) {
            localStorage.setItem(DB_KEYS[key], JSON.stringify(state[key]));
        }
    }

    function generateId() {
        return `id-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    function getCategoryName(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category ? category.name : 'Uncategorized';
    }


    // --- NAVIGATION ---
    function setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.section');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = link.getAttribute('data-section');

                // Update active link
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Show/hide sections
                sections.forEach(sec => {
                    if (sec.id === sectionId) {
                        sec.classList.remove('hidden');
                    } else {
                        sec.classList.add('hidden');
                    }
                });
            });
        });
    }

    // --- MONTH SELECTION ---
    function setupMonthSelectors() {
        const monthDisplays = [
            document.getElementById('current-month-dashboard'),
            document.getElementById('current-month-budget'),
            document.getElementById('current-month-transactions'),
        ];
        
        const updateDisplays = () => {
            const date = new Date(state.selectedMonth + '-02'); // Use day 2 to avoid timezone issues
            const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            monthDisplays.forEach(el => el.textContent = monthName);
        };
        
        const changeMonth = (offset) => {
            const currentDate = new Date(state.selectedMonth + '-02');
            currentDate.setMonth(currentDate.getMonth() + offset);
            state.selectedMonth = currentDate.toISOString().slice(0, 7);
            updateDisplays();
            renderAll();
        };

        document.querySelectorAll('[id^="prev-month"]').forEach(btn => btn.addEventListener('click', () => changeMonth(-1)));
        document.querySelectorAll('[id^="next-month"]').forEach(btn => btn.addEventListener('click', () => changeMonth(1)));
        
        updateDisplays();
    }


    // --- RENDER FUNCTIONS ---
    function renderAll() {
        renderDashboard();
        renderBudget();
        renderTransactions();
        renderCategories();
    }
    
    function renderDashboard() {
        const transactionsForMonth = state.transactions.filter(t => t.date.startsWith(state.selectedMonth));
        
        const totalIncome = transactionsForMonth
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const totalExpenses = transactionsForMonth
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
            
        const netBalance = totalIncome - totalExpenses;

        document.getElementById('total-income-dashboard').textContent = `$${totalIncome.toFixed(2)}`;
        document.getElementById('total-expenses-dashboard').textContent = `$${totalExpenses.toFixed(2)}`;
        document.getElementById('net-balance-dashboard').textContent = `$${netBalance.toFixed(2)}`;
        
        const breakdownBody = document.getElementById('category-breakdown-body');
        breakdownBody.innerHTML = '';
        state.categories.filter(c => c.active).forEach(category => {
            const actualSpent = transactionsForMonth
                .filter(t => t.categoryId === category.id && t.type === 'expense')
                .reduce((sum, t) => sum + t.amount, 0);
            
            const budget = state.monthlyBudgets.find(b => b.month === state.selectedMonth && b.categoryId === category.id);
            const budgetedAmount = budget ? budget.amount : 0;
            const difference = budgetedAmount - actualSpent;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${category.name}</td>
                <td>$${actualSpent.toFixed(2)}</td>
                <td>$${budgetedAmount.toFixed(2)}</td>
                <td>$${difference.toFixed(2)}</td>
            `;
            breakdownBody.appendChild(row);
        });
    }

    function renderBudget() {
        const budgetBody = document.getElementById('budget-table-body');
        budgetBody.innerHTML = '';
        const transactionsForMonth = state.transactions.filter(t => t.date.startsWith(state.selectedMonth));

        state.categories.filter(c => c.active).forEach(category => {
            const budget = state.monthlyBudgets.find(b => b.month === state.selectedMonth && b.categoryId === category.id);
            const budgetedAmount = budget ? budget.amount : 0;
            
            const actualSpent = transactionsForMonth
                .filter(t => t.type === 'expense' && t.categoryId === category.id)
                .reduce((sum, t) => sum + t.amount, 0);
            
            const difference = budgetedAmount - actualSpent;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${category.name}</td>
                <td>
                    <input 
                        type="number" 
                        class="form-input" 
                        value="${budgetedAmount.toFixed(2)}" 
                        data-category-id="${category.id}"
                        min="0"
                        step="0.01"
                    >
                </td>
                <td>$${actualSpent.toFixed(2)}</td>
                <td>$${difference.toFixed(2)}</td>
            `;
            budgetBody.appendChild(row);
        });
    }

    function renderTransactions() {
        const transactionBody = document.getElementById('transactions-table-body');
        const filterText = document.getElementById('transaction-filter').value.toLowerCase();
        transactionBody.innerHTML = '';

        const transactionsForMonth = state.transactions
            .filter(t => t.date.startsWith(state.selectedMonth))
            .filter(t => t.description.toLowerCase().includes(filterText))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        transactionsForMonth.forEach(tx => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${tx.date}</td>
                <td>${tx.description}</td>
                <td>${getCategoryName(tx.categoryId)}</td>
                <td>${tx.type}</td>
                <td>$${tx.amount.toFixed(2)}</td>
                <td>${tx.source}</td>
                <td class="table-actions">
                    <button class="btn btn-sm" data-action="edit" data-id="${tx.id}">Edit</button>
                    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${tx.id}">Delete</button>
                </td>
            `;
            transactionBody.appendChild(row);
        });
    }

    function renderCategories() {
        const categoryBody = document.getElementById('categories-table-body');
        categoryBody.innerHTML = '';

        state.categories.forEach(cat => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="text" class="form-input category-name-input" value="${cat.name}" data-id="${cat.id}">
                </td>
                <td>
                    <input type="checkbox" class="category-active-toggle" ${cat.active ? 'checked' : ''} data-id="${cat.id}">
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" data-action="save-cat" data-id="${cat.id}">Save</button>
                </td>
            `;
            categoryBody.appendChild(row);
        });
    }

    // --- EVENT LISTENERS ---

    // Budget Saving
    document.getElementById('save-budget-btn').addEventListener('click', () => {
        const inputs = document.querySelectorAll('#budget-table-body input');
        inputs.forEach(input => {
            const categoryId = input.dataset.categoryId;
            const amount = parseFloat(input.value);
            
            let budgetEntry = state.monthlyBudgets.find(b => b.month === state.selectedMonth && b.categoryId === categoryId);
            
            if (budgetEntry) {
                budgetEntry.amount = amount;
            } else {
                state.monthlyBudgets.push({
                    month: state.selectedMonth,
                    categoryId: categoryId,
                    amount: amount
                });
            }
        });
        saveData('monthlyBudgets');
        renderAll();
        alert('Budget saved!');
    });

    // Transaction Modal
    function setupTransactionModal() {
        const modal = state.ui.transactionModal;
        const form = state.ui.transactionForm;
        const openBtn = document.getElementById('add-transaction-btn');
        const closeBtn = modal.querySelector('.close-btn');

        const openModal = (tx) => {
            form.reset();
            document.getElementById('modal-title').textContent = tx ? 'Edit Transaction' : 'Add Transaction';
            document.getElementById('transaction-id').value = tx ? tx.id : '';
            
            // Populate categories dropdown
            const categorySelect = document.getElementById('transaction-category');
            categorySelect.innerHTML = '';
            state.categories.filter(c => c.active).forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name;
                categorySelect.appendChild(option);
            });
            
            if (tx) {
                document.getElementById('transaction-date').value = tx.date;
                document.getElementById('transaction-description').value = tx.description;
                document.getElementById('transaction-amount').value = tx.amount;
                document.getElementById('transaction-type').value = tx.type;
                document.getElementById('transaction-category').value = tx.categoryId;
            } else {
                 document.getElementById('transaction-date').valueAsDate = new Date();
            }
            
            modal.classList.remove('hidden');
        };

        const closeModal = () => modal.classList.add('hidden');

        openBtn.addEventListener('click', () => openModal(null));
        closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('transaction-id').value;
            const transactionData = {
                date: document.getElementById('transaction-date').value,
                description: document.getElementById('transaction-description').value,
                amount: parseFloat(document.getElementById('transaction-amount').value),
                type: document.getElementById('transaction-type').value,
                categoryId: document.getElementById('transaction-category').value,
                source: 'manual'
            };

            if (id) { // Editing existing
                const index = state.transactions.findIndex(t => t.id === id);
                if (index > -1) {
                    state.transactions[index] = { ...state.transactions[index], ...transactionData };
                }
            } else { // Adding new
                transactionData.id = generateId();
                state.transactions.push(transactionData);
            }
            
            saveData('transactions');
            renderAll();
            closeModal();
        });
        
        // Edit/Delete buttons
        document.getElementById('transactions-table-body').addEventListener('click', e => {
            const target = e.target;
            const action = target.dataset.action;
            const id = target.dataset.id;
            
            if (action === 'edit') {
                const tx = state.transactions.find(t => t.id === id);
                if (tx) openModal(tx);
            } else if (action === 'delete') {
                if (confirm('Are you sure you want to delete this transaction?')) {
                    state.transactions = state.transactions.filter(t => t.id !== id);
                    saveData('transactions');
                    renderAll();
                }
            }
        });

        // Filter
        document.getElementById('transaction-filter').addEventListener('input', renderTransactions);
    }
    
    // Categories Management
    function setupCategories() {
        document.getElementById('add-category-btn').addEventListener('click', () => {
            const nameInput = document.getElementById('new-category-name');
            const name = nameInput.value.trim();
            if (name) {
                state.categories.push({ id: generateId(), name, active: true });
                saveData('categories');
                renderCategories();
                nameInput.value = '';
            }
        });

        document.getElementById('categories-table-body').addEventListener('click', e => {
            const target = e.target;
            const id = target.dataset.id;
            if (!id) return;

            const category = state.categories.find(c => c.id === id);
            if (!category) return;
            
            if (target.matches('.category-active-toggle')) {
                category.active = target.checked;
                saveData('categories');
                renderAll(); // Re-render all to update dropdowns, etc.
            } else if (target.matches('[data-action="save-cat"]')) {
                const nameInput = target.closest('tr').querySelector('.category-name-input');
                const newName = nameInput.value.trim();
                if (newName && newName !== category.name) {
                    category.name = newName;
                    saveData('categories');
                    renderAll();
                    alert('Category updated!');
                }
            }
        });
    }

    // CSV Import Modal
    function setupCsvImportModal() {
        const modal = state.ui.csvImportModal;
        const openBtn = document.getElementById('import-csv-btn');
        const closeBtn = modal.querySelector('.close-btn');
        const fileInput = document.getElementById('csv-file-input');
        const triggerBtn = document.getElementById('trigger-csv-input');
        const previewArea = document.getElementById('csv-preview-area');
        
        openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
        triggerBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const lines = text.split('\n').filter(line => line.trim() !== '');
                if(lines.length === 0) return;

                const headers = lines[0].split(',').map(h => h.trim());
                const data = lines.slice(1).map(line => line.split(',').map(item => item.trim()));
                
                // Populate preview
                const previewHead = document.getElementById('csv-preview-head');
                const previewBody = document.getElementById('csv-preview-body');
                previewHead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
                previewBody.innerHTML = data.slice(0, 5).map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
                
                // Populate mapping dropdowns
                const colSelectors = ['#csv-date-col', '#csv-description-col', '#csv-amount-col'];
                colSelectors.forEach(selId => {
                    const select = document.querySelector(selId);
                    select.innerHTML = headers.map((h, i) => `<option value="${i}">${h}</option>`).join('');
                });

                // Populate category dropdown
                const catSelect = document.getElementById('csv-default-category');
                catSelect.innerHTML = state.categories.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');

                previewArea.classList.remove('hidden');

                // Store parsed data temporarily
                modal.dataset.csvData = JSON.stringify(data);
            };
            reader.readAsText(file);
        });

        document.getElementById('import-csv-confirm-btn').addEventListener('click', () => {
            const data = JSON.parse(modal.dataset.csvData || '[]');
            if (data.length === 0) return;

            const dateCol = parseInt(document.getElementById('csv-date-col').value, 10);
            const descCol = parseInt(document.getElementById('csv-description-col').value, 10);
            const amountCol = parseInt(document.getElementById('csv-amount-col').value, 10);
            const defaultType = document.getElementById('csv-default-type').value;
            const defaultCategory = document.getElementById('csv-default-category').value;
            
            const newTransactions = data.map(row => {
                const amount = parseFloat(row[amountCol].replace(/[^0-9.-]+/g,""));
                if (isNaN(amount)) return null;

                return {
                    id: generateId(),
                    date: new Date(row[dateCol]).toISOString().slice(0, 10),
                    description: row[descCol],
                    amount: Math.abs(amount),
                    type: defaultType,
                    categoryId: defaultCategory,
                    source: 'csv'
                };
            }).filter(Boolean); // Filter out any nulls from failed parsing

            state.transactions.push(...newTransactions);
            saveData('transactions');
            renderAll();
            modal.classList.add('hidden');
            alert(`${newTransactions.length} transactions imported.`);
        });
    }

    // --- DATA MANAGEMENT (IMPORT/EXPORT) ---
    function setupDataManagement() {
        const exportBtn = document.getElementById('export-data-btn');
        const importBtn = document.getElementById('import-data-btn');
        const importInput = document.getElementById('import-data-input');

        exportBtn.addEventListener('click', () => {
            const dataToExport = {
                categories: state.categories,
                transactions: state.transactions,
                monthlyBudgets: state.monthlyBudgets
            };
            const dataStr = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `budget-data-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        importBtn.addEventListener('click', () => {
            importInput.click();
        });

        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (confirm('Are you sure you want to import this file? This will overwrite all current data.')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);
                        if (importedData.categories && importedData.transactions && importedData.monthlyBudgets) {
                            state.categories = importedData.categories;
                            state.transactions = importedData.transactions;
                            state.monthlyBudgets = importedData.monthlyBudgets;

                            saveData('categories');
                            saveData('transactions');
                            saveData('monthlyBudgets');

                            renderAll();
                            alert('Data imported successfully!');
                        } else {
                            alert('Import failed: The file is not in the correct format.');
                        }
                    } catch (error) {
                        alert(`Import failed: Could not parse the file. Error: ${error.message}`);
                    } finally {
                        // Reset input so the same file can be loaded again
                        importInput.value = '';
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // --- INITIALIZATION ---
    function init() {
        loadData();
        setupNavigation();
        setupMonthSelectors();
        setupTransactionModal();
        setupCategories();
        setupCsvImportModal();
        setupDataManagement(); // Added this line
        renderAll();
    }

    init();
});