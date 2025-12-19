document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT ---
    const state = {
        categories: [],
        sources: [],
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
        sources: 'budget_sources',
        transactions: 'budget_transactions',
        monthlyBudgets: 'budget_monthlyBudgets'
    };
    
    const DEFAULT_CATEGORIES = [
        { id: 'cat-transfer', name: 'Transfer', active: true, isTransfer: true },
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
    
    const DEFAULT_SOURCES = [
        { id: 'source-1', name: 'Wells Fargo', active: true },
        { id: 'source-2', name: 'Amazon Visa', active: true }
    ];

    function loadData() {
        state.categories = JSON.parse(localStorage.getItem(DB_KEYS.categories)) || [];
        if (state.categories.length === 0) {
            state.categories = DEFAULT_CATEGORIES;
            saveData('categories');
        }
        
        // Ensure Transfer category exists
        if (!state.categories.find(c => c.id === 'cat-transfer')) {
            state.categories.unshift({ id: 'cat-transfer', name: 'Transfer', active: true, isTransfer: true });
            saveData('categories');
        }
        
        state.sources = JSON.parse(localStorage.getItem(DB_KEYS.sources)) || [];
        if (state.sources.length === 0) {
            state.sources = DEFAULT_SOURCES;
            saveData('sources');
        }
        
        state.transactions = JSON.parse(localStorage.getItem(DB_KEYS.transactions)) || [];
        state.monthlyBudgets = JSON.parse(localStorage.getItem(DB_KEYS.monthlyBudgets)) || [];
        
        // Migrate existing transactions
        migrateTransactions();
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
    
    function getSourceName(sourceId) {
        const source = state.sources.find(s => s.id === sourceId);
        return source ? source.name : 'Unknown';
    }
    
    function migrateTransactions() {
        let migrated = false;
        state.transactions.forEach(tx => {
            // Migrate source field to importType
            if (tx.source && !tx.importType) {
                if (tx.source === 'csv' || tx.source === 'imported') {
                    tx.importType = 'imported';
                } else if (tx.source === 'manual') {
                    tx.importType = 'manual';
                } else {
                    tx.importType = 'manual'; // Default
                }
                delete tx.source;
                migrated = true;
            }
            
            // Add sourceId if missing
            if (!tx.sourceId && state.sources.length > 0) {
                tx.sourceId = state.sources[0].id; // Default to first source
                migrated = true;
            }
        });
        
        if (migrated) {
            saveData('transactions');
        }
    }
    
    function isTransferCategory(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category?.isTransfer === true;
    }

    // --- CSV VALIDATION UTILITIES ---
    
    /**
     * Parse a date string in MM/DD/YYYY format to ISO YYYY-MM-DD
     * @param {string} dateStr - Date string in MM/DD/YYYY format
     * @returns {string|null} - ISO date string or null if invalid
     */
    function parseDateMMDDYYYY(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        
        // Trim and check basic format
        dateStr = dateStr.trim();
        const parts = dateStr.split('/');
        
        if (parts.length !== 3) return null;
        
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        // Validate ranges
        if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
        if (month < 1 || month > 12) return null;
        if (day < 1 || day > 31) return null;
        if (year < 1900 || year > 2100) return null;
        
        // Create date and validate it's real (e.g., not Feb 31)
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }
        
        // Return ISO format YYYY-MM-DD
        const isoMonth = String(month).padStart(2, '0');
        const isoDay = String(day).padStart(2, '0');
        return `${year}-${isoMonth}-${isoDay}`;
    }
    
    /**
     * Validate and parse an amount string
     * @param {string} amountStr - Amount string (e.g., "-123.45", "1,234.56", "7189.72")
     * @returns {number|null} - Parsed amount or null if invalid
     */
    function validateAndParseAmount(amountStr) {
        if (!amountStr || typeof amountStr !== 'string') return null;
        
        // Trim whitespace
        amountStr = amountStr.trim();
        
        // Match currency pattern with two alternatives:
        // 1. Numbers with proper comma grouping: -?(\d{1,3}(,\d{3})+)
        // 2. Numbers without commas (1-10 digits): -?\d{1,10}
        // Both can have optional decimal part with up to 2 digits
        // Examples: -123.45, 1234, 7189.72, 1,234.56, -1,234,567.89, 0.24
        const currencyPattern = /^-?(?:\d{1,3}(?:,\d{3})+|\d{1,10})(?:\.\d{1,2})?$/;
        
        if (!currencyPattern.test(amountStr)) return null;
        
        // Remove commas and parse
        const cleaned = amountStr.replace(/,/g, '');
        const amount = parseFloat(cleaned);
        
        if (isNaN(amount)) return null;
        
        return amount;
    }
    
    /**
     * Validate a CSV row
     * @param {Array} row - Array of cell values
     * @param {number} expectedColumnCount - Expected number of columns
     * @param {number} dateColIndex - Index of date column
     * @param {number} amountColIndex - Index of amount column
     * @returns {Object} - Validation result with isValid and errors array
     */
    function validateCsvRow(row, expectedColumnCount, dateColIndex, amountColIndex) {
        const errors = [];
        
        // Check column count
        if (row.length !== expectedColumnCount) {
            errors.push(`Expected ${expectedColumnCount} columns, got ${row.length}`);
        }
        
        // Validate date if column exists
        if (dateColIndex >= 0 && dateColIndex < row.length) {
            const dateStr = row[dateColIndex];
            const parsedDate = parseDateMMDDYYYY(dateStr);
            if (!parsedDate) {
                errors.push(`Invalid date format: "${dateStr}" (expected MM/DD/YYYY)`);
            }
        }
        
        // Validate amount if column exists
        if (amountColIndex >= 0 && amountColIndex < row.length) {
            const amountStr = row[amountColIndex];
            const parsedAmount = validateAndParseAmount(amountStr);
            if (parsedAmount === null) {
                errors.push(`Invalid amount format: "${amountStr}"`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
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
        renderSources();
    }
    
    function renderDashboard() {
        const transactionsForMonth = state.transactions
            .filter(t => t.date.startsWith(state.selectedMonth))
            .filter(t => !isTransferCategory(t.categoryId)); // Exclude transfers
        
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
        state.categories.filter(c => c.active && !c.isTransfer).forEach(category => {
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
        const transactionsForMonth = state.transactions
            .filter(t => t.date.startsWith(state.selectedMonth))
            .filter(t => !isTransferCategory(t.categoryId)); // Exclude transfers

        state.categories.filter(c => c.active && !c.isTransfer).forEach(category => {
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
        const filterText = document.getElementById('transaction-filter')?.value.toLowerCase() || '';
        transactionBody.innerHTML = '';
        
        // Populate filter dropdowns
        const filterSourceEl = document.getElementById('filter-source');
        if (filterSourceEl) {
            const currentSourceFilter = filterSourceEl.value;
            filterSourceEl.innerHTML = '<option value="all">All Sources</option>';
            state.sources.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                filterSourceEl.appendChild(option);
            });
            filterSourceEl.value = currentSourceFilter;
        }
        
        const filterCategoryEl = document.getElementById('filter-category');
        if (filterCategoryEl) {
            const currentCategoryFilter = filterCategoryEl.value;
            filterCategoryEl.innerHTML = '<option value="all">All Categories</option>';
            state.categories.filter(c => c.active).forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name;
                filterCategoryEl.appendChild(option);
            });
            filterCategoryEl.value = currentCategoryFilter;
        }

        // Apply bulk delete filters
        let transactionsForMonth = state.transactions.filter(t => t.date.startsWith(state.selectedMonth));
        
        // Apply filter panel filters if they exist
        const filterFromDate = document.getElementById('filter-from-date')?.value;
        const filterToDate = document.getElementById('filter-to-date')?.value;
        const filterSource = document.getElementById('filter-source')?.value;
        const filterCategory = document.getElementById('filter-category')?.value;
        const filterType = document.getElementById('filter-type')?.value;
        const filterImportType = document.getElementById('filter-import-type')?.value;
        
        if (filterFromDate) {
            transactionsForMonth = transactionsForMonth.filter(t => t.date >= filterFromDate);
        }
        if (filterToDate) {
            transactionsForMonth = transactionsForMonth.filter(t => t.date <= filterToDate);
        }
        if (filterSource && filterSource !== 'all') {
            transactionsForMonth = transactionsForMonth.filter(t => t.sourceId === filterSource);
        }
        if (filterCategory && filterCategory !== 'all') {
            transactionsForMonth = transactionsForMonth.filter(t => t.categoryId === filterCategory);
        }
        if (filterType && filterType !== 'all') {
            transactionsForMonth = transactionsForMonth.filter(t => t.type === filterType);
        }
        if (filterImportType && filterImportType !== 'all') {
            transactionsForMonth = transactionsForMonth.filter(t => t.importType === filterImportType);
        }
        
        transactionsForMonth = transactionsForMonth
            .filter(t => t.description.toLowerCase().includes(filterText))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        transactionsForMonth.forEach(tx => {
            const isTransfer = isTransferCategory(tx.categoryId);
            const categoryName = getCategoryName(tx.categoryId);
            const categoryDisplay = isTransfer ? `🔄 ${categoryName}` : categoryName;
            const importTypeDisplay = tx.importType === 'imported' ? 'Imported' : 'Manual';
            
            const row = document.createElement('tr');
            
            // Create cells safely to prevent XSS
            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'transaction-checkbox';
            checkbox.dataset.id = tx.id;
            checkboxCell.appendChild(checkbox);
            
            const dateCell = document.createElement('td');
            dateCell.textContent = tx.date;
            
            const descCell = document.createElement('td');
            descCell.textContent = tx.description;
            
            const catCell = document.createElement('td');
            catCell.textContent = categoryDisplay;
            
            const typeCell = document.createElement('td');
            typeCell.textContent = tx.type;
            
            const amountCell = document.createElement('td');
            amountCell.textContent = `$${tx.amount.toFixed(2)}`;
            
            const sourceCell = document.createElement('td');
            sourceCell.textContent = getSourceName(tx.sourceId);
            
            const importTypeCell = document.createElement('td');
            importTypeCell.textContent = importTypeDisplay;
            
            const actionsCell = document.createElement('td');
            actionsCell.className = 'table-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm';
            editBtn.dataset.action = 'edit';
            editBtn.dataset.id = tx.id;
            editBtn.textContent = 'Edit';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.dataset.action = 'delete';
            deleteBtn.dataset.id = tx.id;
            deleteBtn.textContent = 'Delete';
            
            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            
            row.appendChild(checkboxCell);
            row.appendChild(dateCell);
            row.appendChild(descCell);
            row.appendChild(catCell);
            row.appendChild(typeCell);
            row.appendChild(amountCell);
            row.appendChild(sourceCell);
            row.appendChild(importTypeCell);
            row.appendChild(actionsCell);
            
            transactionBody.appendChild(row);
        });
        
        // Update select all checkbox state
        updateSelectAllCheckbox();
        updateDeleteSelectedButton();
    }

    function renderCategories() {
        const categoryBody = document.getElementById('categories-table-body');
        categoryBody.innerHTML = '';

        state.categories.forEach(cat => {
            const row = document.createElement('tr');
            const isTransfer = cat.isTransfer === true;
            
            // Create name input cell
            const nameCell = document.createElement('td');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'form-input category-name-input';
            nameInput.value = cat.name;
            nameInput.dataset.id = cat.id;
            if (isTransfer) {
                nameInput.disabled = true;
                nameInput.title = 'Transfer category cannot be renamed';
            }
            nameCell.appendChild(nameInput);
            
            // Create active checkbox cell
            const activeCell = document.createElement('td');
            const activeCheckbox = document.createElement('input');
            activeCheckbox.type = 'checkbox';
            activeCheckbox.className = 'category-active-toggle';
            activeCheckbox.checked = cat.active;
            activeCheckbox.dataset.id = cat.id;
            if (isTransfer) {
                activeCheckbox.disabled = true;
            }
            activeCell.appendChild(activeCheckbox);
            
            // Create save button cell
            const saveCell = document.createElement('td');
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary btn-sm';
            saveBtn.dataset.action = 'save-cat';
            saveBtn.dataset.id = cat.id;
            saveBtn.textContent = 'Save';
            if (isTransfer) {
                saveBtn.disabled = true;
            }
            saveCell.appendChild(saveBtn);
            
            row.appendChild(nameCell);
            row.appendChild(activeCell);
            row.appendChild(saveCell);
            categoryBody.appendChild(row);
        });
    }
    
    function renderSources() {
        const sourceBody = document.getElementById('sources-table-body');
        if (!sourceBody) return;
        sourceBody.innerHTML = '';

        state.sources.forEach(src => {
            const row = document.createElement('tr');
            
            // Create name input cell
            const nameCell = document.createElement('td');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'form-input source-name-input';
            nameInput.value = src.name;
            nameInput.dataset.id = src.id;
            nameCell.appendChild(nameInput);
            
            // Create active checkbox cell
            const activeCell = document.createElement('td');
            const activeCheckbox = document.createElement('input');
            activeCheckbox.type = 'checkbox';
            activeCheckbox.className = 'source-active-toggle';
            activeCheckbox.checked = src.active;
            activeCheckbox.dataset.id = src.id;
            activeCell.appendChild(activeCheckbox);
            
            // Create save button cell
            const saveCell = document.createElement('td');
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary btn-sm';
            saveBtn.dataset.action = 'save-source';
            saveBtn.dataset.id = src.id;
            saveBtn.textContent = 'Save';
            saveCell.appendChild(saveBtn);
            
            row.appendChild(nameCell);
            row.appendChild(activeCell);
            row.appendChild(saveCell);
            sourceBody.appendChild(row);
        });
    }
    
    function updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-transactions');
        if (!selectAllCheckbox) return;
        
        const checkboxes = document.querySelectorAll('.transaction-checkbox');
        const checkedCount = document.querySelectorAll('.transaction-checkbox:checked').length;
        
        selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
    
    function updateDeleteSelectedButton() {
        const deleteBtn = document.getElementById('delete-selected-btn');
        if (!deleteBtn) return;
        
        const checkedCount = document.querySelectorAll('.transaction-checkbox:checked').length;
        deleteBtn.textContent = `Delete Selected (${checkedCount})`;
        deleteBtn.disabled = checkedCount === 0;
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
            
            // Populate sources dropdown
            const sourceSelect = document.getElementById('transaction-source');
            if (sourceSelect) {
                sourceSelect.innerHTML = '<option value="">Select source...</option>';
                state.sources.filter(s => s.active).forEach(s => {
                    const option = document.createElement('option');
                    option.value = s.id;
                    option.textContent = s.name;
                    sourceSelect.appendChild(option);
                });
            }
            
            if (tx) {
                document.getElementById('transaction-date').value = tx.date;
                document.getElementById('transaction-description').value = tx.description;
                document.getElementById('transaction-amount').value = tx.amount;
                document.getElementById('transaction-type').value = tx.type;
                document.getElementById('transaction-category').value = tx.categoryId;
                if (sourceSelect && tx.sourceId) {
                    sourceSelect.value = tx.sourceId;
                }
            } else {
                document.getElementById('transaction-date').valueAsDate = new Date();
                // Set default source to first active source
                if (sourceSelect && state.sources.length > 0) {
                    const firstActiveSource = state.sources.find(s => s.active);
                    if (firstActiveSource) {
                        sourceSelect.value = firstActiveSource.id;
                    }
                }
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
            const sourceSelect = document.getElementById('transaction-source');
            const sourceId = sourceSelect ? sourceSelect.value : (state.sources.length > 0 ? state.sources[0].id : null);
            
            const transactionData = {
                date: document.getElementById('transaction-date').value,
                description: document.getElementById('transaction-description').value,
                amount: parseFloat(document.getElementById('transaction-amount').value),
                type: document.getElementById('transaction-type').value,
                categoryId: document.getElementById('transaction-category').value,
                sourceId: sourceId,
                importType: 'manual'
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
        
        // Select All checkbox
        const selectAllCheckbox = document.getElementById('select-all-transactions');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.transaction-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                updateDeleteSelectedButton();
            });
        }
        
        // Individual checkboxes
        document.getElementById('transactions-table-body').addEventListener('change', (e) => {
            if (e.target.classList.contains('transaction-checkbox')) {
                updateSelectAllCheckbox();
                updateDeleteSelectedButton();
            }
        });
        
        // Clear All button
        const clearAllBtn = document.getElementById('clear-all-transactions-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete all transactions? This cannot be undone.')) {
                    state.transactions = [];
                    saveData('transactions');
                    renderAll();
                }
            });
        }
        
        // Delete Selected button
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => {
                const checkedBoxes = document.querySelectorAll('.transaction-checkbox:checked');
                const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
                
                if (selectedIds.length === 0) return;
                
                if (confirm(`Are you sure you want to delete ${selectedIds.length} transaction(s)? This cannot be undone.`)) {
                    state.transactions = state.transactions.filter(t => !selectedIds.includes(t.id));
                    saveData('transactions');
                    renderAll();
                }
            });
        }
        
        // Filter panel listeners
        const filterElements = [
            'filter-from-date', 'filter-to-date', 'filter-source', 
            'filter-category', 'filter-type', 'filter-import-type'
        ];
        filterElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', renderTransactions);
            }
        });
        
        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                filterElements.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.value = element.tagName === 'SELECT' ? 'all' : '';
                    }
                });
                renderTransactions();
            });
        }
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
    
    // Sources Management
    function setupSources() {
        const addSourceBtn = document.getElementById('add-source-btn');
        if (addSourceBtn) {
            addSourceBtn.addEventListener('click', () => {
                const nameInput = document.getElementById('new-source-name');
                const name = nameInput.value.trim();
                if (name) {
                    state.sources.push({ id: generateId(), name, active: true });
                    saveData('sources');
                    renderSources();
                    renderAll(); // Update dropdowns
                    nameInput.value = '';
                }
            });
        }

        const sourcesTableBody = document.getElementById('sources-table-body');
        if (sourcesTableBody) {
            sourcesTableBody.addEventListener('click', e => {
                const target = e.target;
                const id = target.dataset.id;
                if (!id) return;

                const source = state.sources.find(s => s.id === id);
                if (!source) return;
                
                if (target.matches('.source-active-toggle')) {
                    source.active = target.checked;
                    saveData('sources');
                    renderAll(); // Re-render all to update dropdowns, etc.
                } else if (target.matches('[data-action="save-source"]')) {
                    const nameInput = target.closest('tr').querySelector('.source-name-input');
                    const newName = nameInput.value.trim();
                    if (newName && newName !== source.name) {
                        source.name = newName;
                        saveData('sources');
                        renderAll();
                        alert('Source updated!');
                    }
                }
            });
        }
    }

    // CSV Import Modal
    function setupCsvImportModal() {
        const modal = state.ui.csvImportModal;
        const openBtn = document.getElementById('import-csv-btn');
        const closeBtn = modal.querySelector('.close-btn');
        const fileInput = document.getElementById('csv-file-input');
        const triggerBtn = document.getElementById('trigger-csv-input');
        const previewArea = document.getElementById('csv-preview-area');
        const validationSummary = document.getElementById('csv-validation-summary');
        
        openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
        triggerBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                
                // Use custom CSV parser for robust CSV parsing
                const parseResult = Papa.parse(text, {
                    header: false,
                    skipEmptyLines: true,
                    trimHeaders: true,
                });
                
                if (parseResult.errors.length > 0) {
                    console.warn('CSV parsing warnings:', parseResult.errors);
                }
                
                const allRows = parseResult.data;
                if (allRows.length === 0) {
                    alert('CSV file is empty');
                    return;
                }
                
                const headers = allRows[0].map(h => String(h).trim());
                const dataRows = allRows.slice(1);
                
                // Auto-select columns based on header names
                const dateColIndex = headers.findIndex(h => /date/i.test(h));
                const amountColIndex = headers.findIndex(h => /amount|amt|value|total/i.test(h));
                const descColIndex = headers.findIndex(h => /desc|description|memo|detail/i.test(h));
                
                // Validate all rows and store results
                const rowValidations = dataRows.map(row => 
                    validateCsvRow(row, headers.length, dateColIndex, amountColIndex)
                );
                
                const validRows = rowValidations.filter(v => v.isValid).length;
                const invalidRows = rowValidations.filter(v => !v.isValid).length;
                
                // Display validation summary
                if (invalidRows > 0) {
                    validationSummary.innerHTML = `
                        <strong>⚠️ Validation Summary:</strong> 
                        ${validRows} valid row${validRows !== 1 ? 's' : ''}, 
                        ${invalidRows} invalid row${invalidRows !== 1 ? 's' : ''} (will be skipped during import)
                    `;
                    validationSummary.style.background = '#fff3cd';
                    validationSummary.style.color = '#856404';
                    validationSummary.classList.remove('hidden');
                } else {
                    validationSummary.innerHTML = `
                        <strong>✓ Validation Summary:</strong> 
                        All ${validRows} row${validRows !== 1 ? 's' : ''} validated successfully
                    `;
                    validationSummary.style.background = '#d4edda';
                    validationSummary.style.color = '#155724';
                    validationSummary.classList.remove('hidden');
                }
                
                // Populate preview with validation indicators
                const previewHead = document.getElementById('csv-preview-head');
                const previewBody = document.getElementById('csv-preview-body');
                previewHead.innerHTML = `<tr><th>Status</th>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
                
                const previewRows = dataRows.slice(0, 10).map((row, idx) => {
                    const validation = rowValidations[idx];
                    const statusIcon = validation.isValid 
                        ? '<span title="Valid row">✓</span>' 
                        : `<span title="${validation.errors.join('; ')}" style="color: red; cursor: help;">⚠️</span>`;
                    return `<tr><td>${statusIcon}</td>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                }).join('');
                
                previewBody.innerHTML = previewRows;
                
                // Populate mapping dropdowns
                const colSelectors = [
                    { id: '#csv-date-col', autoIndex: dateColIndex },
                    { id: '#csv-description-col', autoIndex: descColIndex },
                    { id: '#csv-amount-col', autoIndex: amountColIndex }
                ];
                
                colSelectors.forEach(({id, autoIndex}) => {
                    const select = document.querySelector(id);
                    select.innerHTML = headers.map((h, i) => 
                        `<option value="${i}" ${i === autoIndex ? 'selected' : ''}>${h}</option>`
                    ).join('');
                });

                // Populate category dropdown
                const catSelect = document.getElementById('csv-default-category');
                catSelect.innerHTML = state.categories.filter(c => c.active).map(c => 
                    `<option value="${c.id}">${c.name}</option>`
                ).join('');
                
                // Populate source dropdown
                const sourceSelect = document.getElementById('csv-source');
                if (sourceSelect) {
                    sourceSelect.innerHTML = state.sources.filter(s => s.active).map(s => 
                        `<option value="${s.id}">${s.name}</option>`
                    ).join('');
                }

                previewArea.classList.remove('hidden');

                // Store parsed data and validation results temporarily
                modal.dataset.csvData = JSON.stringify(dataRows);
                modal.dataset.csvValidations = JSON.stringify(rowValidations);
                modal.dataset.csvHeaders = JSON.stringify(headers);
            };
            reader.readAsText(file);
        });

        // Add change listeners to column selectors to re-validate when mapping changes
        ['#csv-date-col', '#csv-amount-col'].forEach(selector => {
            document.querySelector(selector).addEventListener('change', () => {
                const dataRows = JSON.parse(modal.dataset.csvData || '[]');
                const headers = JSON.parse(modal.dataset.csvHeaders || '[]');
                if (dataRows.length === 0) return;
                
                const dateCol = parseInt(document.getElementById('csv-date-col').value, 10);
                const amountCol = parseInt(document.getElementById('csv-amount-col').value, 10);
                
                // Re-validate with new column mappings
                const rowValidations = dataRows.map(row => 
                    validateCsvRow(row, headers.length, dateCol, amountCol)
                );
                
                const validRows = rowValidations.filter(v => v.isValid).length;
                const invalidRows = rowValidations.filter(v => !v.isValid).length;
                
                // Update validation summary
                if (invalidRows > 0) {
                    validationSummary.innerHTML = `
                        <strong>⚠️ Validation Summary:</strong> 
                        ${validRows} valid row${validRows !== 1 ? 's' : ''}, 
                        ${invalidRows} invalid row${invalidRows !== 1 ? 's' : ''} (will be skipped during import)
                    `;
                    validationSummary.style.background = '#fff3cd';
                    validationSummary.style.color = '#856404';
                } else {
                    validationSummary.innerHTML = `
                        <strong>✓ Validation Summary:</strong> 
                        All ${validRows} row${validRows !== 1 ? 's' : ''} validated successfully
                    `;
                    validationSummary.style.background = '#d4edda';
                    validationSummary.style.color = '#155724';
                }
                
                // Update preview status indicators
                const previewBody = document.getElementById('csv-preview-body');
                const previewRows = dataRows.slice(0, 10).map((row, idx) => {
                    const validation = rowValidations[idx];
                    const statusIcon = validation.isValid 
                        ? '<span title="Valid row">✓</span>' 
                        : `<span title="${validation.errors.join('; ')}" style="color: red; cursor: help;">⚠️</span>`;
                    return `<tr><td>${statusIcon}</td>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                }).join('');
                previewBody.innerHTML = previewRows;
                
                // Store updated validations
                modal.dataset.csvValidations = JSON.stringify(rowValidations);
            });
        });

        document.getElementById('import-csv-confirm-btn').addEventListener('click', () => {
            const dataRows = JSON.parse(modal.dataset.csvData || '[]');
            const rowValidations = JSON.parse(modal.dataset.csvValidations || '[]');
            if (dataRows.length === 0) return;

            const dateCol = parseInt(document.getElementById('csv-date-col').value, 10);
            const descCol = parseInt(document.getElementById('csv-description-col').value, 10);
            const amountCol = parseInt(document.getElementById('csv-amount-col').value, 10);
            
            // Get modal selections for defaults
            const defaultType = document.getElementById('csv-default-type').value;
            const defaultCategory = document.getElementById('csv-default-category').value;
            const sourceSelect = document.getElementById('csv-source');
            const sourceId = sourceSelect ? sourceSelect.value : (state.sources.length > 0 ? state.sources[0].id : null);
            
            const newTransactions = [];
            let skippedCount = 0;
            
            dataRows.forEach((row, idx) => {
                const validation = rowValidations[idx];
                
                // Skip invalid rows
                if (!validation.isValid) {
                    skippedCount++;
                    return;
                }
                
                // Parse amount with strict validation
                const amountStr = row[amountCol];
                const parsedAmount = validateAndParseAmount(amountStr);
                
                if (parsedAmount === null) {
                    skippedCount++;
                    return;
                }
                
                // Parse date with explicit MM/DD/YYYY format
                const dateStr = row[dateCol];
                const parsedDate = parseDateMMDDYYYY(dateStr);
                
                if (!parsedDate) {
                    skippedCount++;
                    return;
                }
                
                // Determine transaction type
                // If amount has a sign, use it; otherwise use modal default
                let transactionType = defaultType;
                if (parsedAmount !== 0) {
                    // Negative = expense, Positive = income
                    transactionType = parsedAmount < 0 ? 'expense' : 'income';
                }
                
                // Use modal default category
                const categoryId = defaultCategory;

                newTransactions.push({
                    id: generateId(),
                    date: parsedDate,
                    description: row[descCol],
                    amount: Math.abs(parsedAmount),
                    type: transactionType,
                    categoryId: categoryId,
                    sourceId: sourceId,
                    importType: 'imported'
                });
            });

            state.transactions.push(...newTransactions);
            saveData('transactions');
            renderAll();
            modal.classList.add('hidden');
            
            const message = skippedCount > 0 
                ? `${newTransactions.length} transactions imported, ${skippedCount} row${skippedCount !== 1 ? 's' : ''} skipped due to validation errors.`
                : `${newTransactions.length} transactions imported successfully.`;
            alert(message);
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
        setupSources();
        setupCsvImportModal();
        setupDataManagement();
        renderAll();
    }

    init();
});