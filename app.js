/* =========================
   Personal Budget Planner - app.js (Firestore-enabled)
   Changes:
   - Dashboard filter preserves selection when rebuilt.
   - Dashboard filter "Other" shows custom filter input.
   - Add Transaction Other shows inline custom input (unchanged).
   - budgetMonth input is type="date"; JS limits year to current year and extracts YYYY-MM internally.
   ========================= */

(() => {
  // ----- FIREBASE CONFIG (PASTE YOUR CONFIG HERE) -----
  // const FIREBASE_CONFIG = {
  //   /* <-- PASTE YOUR CONFIG HERE */
  //   apiKey: "AIzaSyCP7wbp7V7LB6wEYs05iQqzPeT49FAAeSw"
  // };

  // // initialize firebase only if config provided
  // let firebaseEnabled = false;
  // if (FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey) {
  //   try {
  //     firebase.initializeApp(FIREBASE_CONFIG);
  //     firebaseEnabled = true;
  //   } catch (err) {
  //     console.error('Firebase init error:', err);
  //     firebaseEnabled = false;
  //   }
  // }

  // ----- DEFAULT CATEGORY LIST (can be extended at runtime) -----
  const DEFAULT_CATS = ["Salary","Food","Rent","Transport","Shopping","Entertainment","Utilities","Savings","Health","Other"];

  // ----- STORAGE KEYS (local fallback) -----
  const LS_TX = 'bp_transactions_v1';
  const LS_BUDGETS = 'bp_budgets_v1';
  const LS_CATS = 'bp_categories_v1'; // persist dynamic cats across sessions

  // ----- app state -----
  let transactions = [];
  let budgets = [];
  let editingId = null;
  let currentUser = null;
  let dynamicCats = new Set(); // user-added categories at runtime

  // Firestore listeners unsubscribe functions
  let unsubscribeTx = null;
  let unsubscribeBud = null;

  // ----- DOM refs -----
  const categorySelect = document.getElementById('category');
  const budgetCategory = document.getElementById('budgetCategory');
  const saveBtn = document.getElementById('saveBtn');
  const txForm = document.getElementById('txForm');
  const txTbody = document.getElementById('txTbody');
  const totalIncomeEl = document.getElementById('totalIncome');
  const totalExpenseEl = document.getElementById('totalExpense');
  const balanceEl = document.getElementById('balance');
  const savingsRateEl = document.getElementById('savingsRate');
  const filterMonth = document.getElementById('filterMonth');
  const filterCategory = document.getElementById('filterCategory');
  const searchInput = document.getElementById('searchInput');
  const toastContainer = document.getElementById('toast');
  const budgetList = document.getElementById('budgetList');

  const exportCSVBtn = document.getElementById('exportCSV');
  const pieCtx = document.getElementById('pieChart').getContext('2d');
  const lineCtx = document.getElementById('lineChart').getContext('2d');

  const authSignUpBtn = document.getElementById('authSignUp');
  const authSignInBtn = document.getElementById('authSignIn');
  const authSignOutBtn = document.getElementById('authSignOut');
  const userEmailEl = document.getElementById('userEmail');

  let pieChart, lineChart;

  // ----- utilities -----
  const uid = () => 'id_' + Math.random().toString(36).slice(2,9);
  const fmt = (n,curr='₹') => `${curr}${Number(n||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

  // ----- Firestore helpers -----
  function getDb() { return firebaseEnabled ? firebase.firestore() : null; }
  function userCollection(path) {
    if (!currentUser) return null;
    const db = getDb();
    if (!db) return null;
    return db.collection('users').doc(currentUser.uid).collection(path);
  }

  // ----- custom inputs (transaction & filter) -----
  let customCategoryInput = null;   // for Add Transaction -> 'Other'
  let filterCustomInput = null;     // for Dashboard filter -> 'Other'
  let filterCustomValue = '';       // current custom filter string (if used)

  function ensureCustomInputExists() {
    if (customCategoryInput) return;
    customCategoryInput = document.createElement('input');
    customCategoryInput.type = 'text';
    customCategoryInput.id = 'customCategory';
    customCategoryInput.placeholder = 'Enter category...';
    customCategoryInput.style.marginTop = '6px';
    customCategoryInput.style.padding = '8px';
    customCategoryInput.style.borderRadius = '8px';
    customCategoryInput.style.border = '1px solid #e6e9ef';
    customCategoryInput.style.width = '100%';
    categorySelect.parentNode.appendChild(customCategoryInput);
  }






// services/firebase.js (compat version as you use compat libs)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCP7wbp7V7LB6wEYs05iQqzPeT49FAAeSw",
  authDomain: "https://personal-budget-planner-pro.firebaseapp.com/",
  projectId: "personal-budget-planner-pro",
  // ...other values
};
firebase.initializeApp(FIREBASE_CONFIG);

const auth = firebase.auth();

// Call to show Google popup (works well for desktop)
async function signInWithGooglePopup() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  try {
    const result = await auth.signInWithPopup(provider);
    // result.user contains user info
    return result.user;
  } catch (err) {
    console.error('Google sign-in popup error', err);
    throw err;
  }
}

// Or redirect flow (good for mobile)
function signInWithGoogleRedirect() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithRedirect(provider);
}

// Sign-out
function signOut() {
  return auth.signOut();
}

// Listen for changes
auth.onAuthStateChanged(user => {
  if (user) {
    // user is signed in
    console.log('Signed in:', user.email);
  } else {
    // signed out
  }
});

window.firebaseAuth = { signInWithGooglePopup, signInWithGoogleRedirect, signOut };
















  function showCustomInput(show){
    if (show) { ensureCustomInputExists(); customCategoryInput.style.display = 'block'; }
    else if (customCategoryInput) customCategoryInput.style.display = 'none';
  }

  function ensureFilterCustomInputExists(){
    if (filterCustomInput) return;
    // insert small input next to filterCategory select
    filterCustomInput = document.createElement('input');
    filterCustomInput.type = 'text';
    filterCustomInput.id = 'filterCustom';
    filterCustomInput.placeholder = 'Type category to filter';
    filterCustomInput.className = 'small';
    filterCustomInput.style.marginLeft = '8px';
    // place after filterCategory
    filterCategory.parentNode.appendChild(filterCustomInput);
    filterCustomInput.addEventListener('input', () => {
      filterCustomValue = filterCustomInput.value.trim();
      render(); // re-render while typing
    });
  }
  function showFilterCustomInput(show){
    if (show) { ensureFilterCustomInputExists(); filterCustomInput.style.display = 'inline-block'; filterCustomInput.focus(); }
    else if (filterCustomInput) { filterCustomInput.style.display = 'none'; filterCustomInput.value = ''; filterCustomValue = ''; render(); }
  }

  // ----- category helpers -----
  function registerCustomCategory(cat) {
    if (!cat) return;
    // store in dynamicCats and persist
    dynamicCats.add(cat);
    persistDynamicCats();
    // add to budgetCategory if missing
    if (!Array.from(budgetCategory.options).some(o => o.value === cat)) {
      const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat;
      budgetCategory.appendChild(opt);
    }
  }

  function persistDynamicCats(){
    try {
      localStorage.setItem(LS_CATS, JSON.stringify(Array.from(dynamicCats)));
    } catch(e){}
  }
  function loadDynamicCats(){
    try {
      const arr = JSON.parse(localStorage.getItem(LS_CATS) || '[]');
      arr.forEach(c => { if (c) dynamicCats.add(c); });
    } catch(e){}
  }

  function setCategoryOptionsForType(type) {
    let prevCustom = '';
    if (customCategoryInput && customCategoryInput.value) prevCustom = customCategoryInput.value;

    categorySelect.innerHTML = '';
    if (type === 'income') {
      ['Salary','Other'].forEach(o=>{
        const opt = document.createElement('option'); opt.value = o; opt.textContent = o; categorySelect.appendChild(opt);
      });
    } else {
      // expenses: DEFAULT_CATS except Salary, plus dynamicCats
      const catsToShow = DEFAULT_CATS.filter(c => c !== 'Salary');
      dynamicCats.forEach(c => { if (!catsToShow.includes(c)) catsToShow.push(c); });
      catsToShow.forEach(c => {
        const opt = document.createElement('option'); opt.value = c; opt.textContent = c; categorySelect.appendChild(opt);
      });
    }
    if (!Array.from(categorySelect.options).some(o=>o.value==='Other')) {
      const opt = document.createElement('option'); opt.value='Other'; opt.textContent='Other'; categorySelect.appendChild(opt);
    }

    // restore prev custom if possible
    if (prevCustom) {
      const found = Array.from(categorySelect.options).find(o=>o.value === prevCustom);
      if (found) {
        categorySelect.value = prevCustom;
        showCustomInput(false);
      } else {
        categorySelect.value = 'Other'; showCustomInput(true); ensureCustomInputExists(); customCategoryInput.value = prevCustom;
      }
    } else {
      categorySelect.selectedIndex = 0; showCustomInput(false);
    }
  }

  // ----- init UI -----
  function init() {
    loadDynamicCats();

    // populate budgetCategory with DEFAULT_CATS + dynamicCats
    for (const s of [budgetCategory]) {
      const existing = Array.from(s.querySelectorAll('option')).map(o=>o.value);
      DEFAULT_CATS.forEach(cat => { if (!existing.includes(cat)) { const opt=document.createElement('option'); opt.value=cat; opt.textContent=cat; s.appendChild(opt); }});
      dynamicCats.forEach(cat => { if (!existing.includes(cat)) { const opt=document.createElement('option'); opt.value=cat; opt.textContent=cat; s.appendChild(opt); }});
    }

    // set category options initially according to type
    const initialType = document.getElementById('type').value || 'expense';
    setCategoryOptionsForType(initialType);
    showCustomInput(false);
    showFilterCustomInput(false);

    updateCategoryFilter();

    // set default date to today
    document.getElementById('date').valueAsDate = new Date();

    // populate month filter
    populateMonthFilter();

    // limit budgetMonth to current year only (min Jan 1, max Dec 31)
    limitBudgetDateToCurrentYear();

    // bind events
    txForm.addEventListener('submit', onSaveTransaction);
    document.getElementById('resetBtn').addEventListener('click', resetForm);
    exportCSVBtn.addEventListener('click', exportCSV);
    document.getElementById('saveBudget').addEventListener('click', onSaveBudget);
    document.getElementById('clearBudgets').addEventListener('click', clearBudgets);
    filterMonth.addEventListener('change', render);

    // preserve selection when filterCategory is rebuilt
    filterCategory.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'Other') {
        showFilterCustomInput(true);
      } else {
        showFilterCustomInput(false);
      }
      render();
    });

    document.getElementById('type').addEventListener('change', (e) => { setCategoryOptionsForType(e.target.value); showCustomInput(false); });
    categorySelect.addEventListener('change', (e) => { if (e.target.value === 'Other') { showCustomInput(true); ensureCustomInputExists(); customCategoryInput.focus(); } else showCustomInput(false); });

    filterCategory.addEventListener('blur', () => { /* no-op; selection preserved in updateCategoryFilter */ });

    searchInput.addEventListener('input', render);

    // storage event for local multi-tab sync
    window.addEventListener('storage', (e) => {
      if (!currentUser && e.key === LS_TX) {
        transactions = JSON.parse(e.newValue || '[]'); render(); showToast('Sync: transactions updated (local)');
      } else if (!currentUser && e.key === LS_BUDGETS) {
        budgets = JSON.parse(e.newValue || '[]'); renderBudgets(); showToast('Sync: budgets updated (local)');
      } else if (e.key === LS_CATS) {
        loadDynamicCats();
        updateCategoryFilter();
      }
    });

    // auth UI binding
    if (firebaseEnabled) {
      authSignUpBtn.addEventListener('click', promptSignUp);
      authSignInBtn.addEventListener('click', promptSignIn);
      authSignOutBtn.addEventListener('click', signOut);

      firebase.auth().onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
          userEmailEl.textContent = user.email || user.displayName || '';
          authSignInBtn.style.display = 'none';
          authSignUpBtn.style.display = 'none';
          authSignOutBtn.style.display = 'inline-block';
          startFirestoreListeners();
        } else {
          userEmailEl.textContent = '';
          authSignInBtn.style.display = 'inline-block';
          authSignUpBtn.style.display = 'inline-block';
          authSignOutBtn.style.display = 'none';
          stopFirestoreListeners();
          loadLocalStateAndRender();
        }
      });
    } else {
      loadLocalStateAndRender();
    }

    render();
  }

  function populateMonthFilter(){
    const now = new Date();
    for (let i=0;i<12;i++){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = d.toLocaleString(undefined, {month:'short', year:'numeric'});
      filterMonth.appendChild(opt);
    }
    filterMonth.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  function limitBudgetDateToCurrentYear(){
    try {
      const input = document.getElementById('budgetMonth');
      if (!input) return;
      const now = new Date();
      const start = `${now.getFullYear()}-01-01`;
      const end = `${now.getFullYear()}-12-31`;
      input.min = start;
      input.max = end;
      // if no value, set to today (ensures month info available)
      if (!input.value) input.value = new Date().toISOString().slice(0,10);
    } catch(e){ console.warn(e); }
  }

  // ----- persistence / sync logic -----

// ---------- Robust local persistence ----------
function saveLocalState(){
  try {
    localStorage.setItem(LS_TX, JSON.stringify(transactions || []));
    localStorage.setItem(LS_BUDGETS, JSON.stringify(budgets || []));
    localStorage.setItem(LS_CATS, JSON.stringify(Array.from(dynamicCats || [])));
  } catch (err) {
    console.error('saveLocalState: failed to save', err);
    try { showToast('Warning: unable to save data locally (browser storage may be disabled)', true); } catch(e){}
  }
}

function loadLocalStateAndRender(){
  try {
    const rawTx = localStorage.getItem(LS_TX);
    const rawBud = localStorage.getItem(LS_BUDGETS);
    const rawCats = localStorage.getItem(LS_CATS);

    transactions = rawTx ? JSON.parse(rawTx) : [];
    budgets = rawBud ? JSON.parse(rawBud) : [];
    dynamicCats = new Set(rawCats ? JSON.parse(rawCats) : []);
  } catch(e) {
    console.error('loadLocalStateAndRender: failed to load local state', e);
    transactions = transactions || [];
    budgets = budgets || [];
    dynamicCats = dynamicCats || new Set();
    try { showToast('Warning: failed to read local data (corrupt or unsupported)', true); } catch(err){}
  }
  render();
}




  // function loadLocalStateAndRender(){
  //   try {
  //     transactions = JSON.parse(localStorage.getItem(LS_TX) || '[]');
  //     budgets = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
  //   } catch(e) { transactions = []; budgets = []; }
  //   render();
  // }
  // function saveLocalState(){ localStorage.setItem(LS_TX, JSON.stringify(transactions)); localStorage.setItem(LS_BUDGETS, JSON.stringify(budgets)); localStorage.setItem(LS_CATS, JSON.stringify(Array.from(dynamicCats))); }

  function startFirestoreListeners(){
    if (!firebaseEnabled || !currentUser) return;
    stopFirestoreListeners();
    unsubscribeTx = userCollection('transactions')
      .orderBy('date','desc')
      .onSnapshot(snapshot => { transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); render(); saveLocalState(); }, err => console.error('tx snapshot error', err));
    unsubscribeBud = userCollection('budgets')
      .onSnapshot(snapshot => { budgets = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); renderBudgets(); saveLocalState(); }, err => console.error('budgets snapshot error', err));
  }
  function stopFirestoreListeners(){ if (unsubscribeTx) { unsubscribeTx(); unsubscribeTx = null; } if (unsubscribeBud) { unsubscribeBud(); unsubscribeBud = null; } }

  async function writeTransactionToRemote(tx) {
    if (currentUser && firebaseEnabled) {
      const col = userCollection('transactions'); if (!col) return;
      if (tx.id && tx.id.startsWith('id_')) { const { id, ...payload } = tx; await col.add(payload); }
      else if (tx.id) await col.doc(tx.id).set(tx); else await col.add(tx);
    } else saveLocalState();
  }
  async function deleteTransactionRemote(id) { if (currentUser && firebaseEnabled) { const col = userCollection('transactions'); if (!col) return; await col.doc(id).delete(); } else saveLocalState(); }
  async function writeBudgetRemote(b) { if (currentUser && firebaseEnabled) { const col = userCollection('budgets'); if (!col) return; if (b.id && b.id.startsWith('id_')) { const { id, ...payload } = b; await col.add(payload); } else if (b.id) await col.doc(b.id).set(b); else await col.add(b); } else saveLocalState(); }
  async function deleteBudgetRemote(id){ if (currentUser && firebaseEnabled) { const col = userCollection('budgets'); if (!col) return; await col.doc(id).delete(); } else saveLocalState(); }

  // ----- transactions CRUD (with custom category handling) -----
async function onSaveTransaction(e){
  e.preventDefault();
  const type = document.getElementById('type').value;
  let category = categorySelect.value;

  if (category === 'Other') {
    ensureCustomInputExists();
    const custom = (customCategoryInput && customCategoryInput.value || '').trim();
    if (!custom) { showToast('Please enter a custom category name', true); return; }
    category = custom;
    registerCustomCategory(custom);
  }

  const amount = parseFloat(document.getElementById('amount').value || 0);
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value;
  const currency = document.getElementById('currency').value || 'INR';

  if (!amount || !date) { showToast('Please enter valid amount and date', true); return; }

  // ---------- EDIT flow ----------
  if (editingId) {
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx === -1) {
      showToast('Editing item not found', true);
      editingId = null;
      saveBtn.textContent = 'Add Transaction';
      return;
    }

    // capture before snapshot (deep clone)
    const before = JSON.parse(JSON.stringify(transactions[idx]));

    const updatedTx = {
      ...before,
      type,
      category,
      amount,
      date,
      note,
      currency,
      updatedAt: new Date().toISOString()
    };

    try {
      if (currentUser && firebaseEnabled && !updatedTx.id.startsWith('id_')) {
        await userCollection('transactions').doc(updatedTx.id).set(updatedTx);
        // remote listener will update local `transactions` and trigger render
      } else {
        transactions[idx] = updatedTx;
        saveLocalState();
        render();
      }

      // push edit action for undo/redo
      if (typeof pushAction === 'function') {
        pushAction({ kind: 'tx-edit', before: before, after: JSON.parse(JSON.stringify(updatedTx)) });
      }

      showToast('Transaction updated');
    } catch (err) {
      console.error('Failed to update transaction', err);
      showToast('Failed to update transaction', true);
    }

    editingId = null;
    saveBtn.textContent = 'Add Transaction';
    resetForm();
    checkBudgetsAndAlert();
    return;
  }

  // ---------- ADD flow ----------
  const tx = {
    id: uid(),
    type,
    category,
    amount,
    date,
    currency,
    note,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
       // after adding locally or after remote fallback
    if (currentUser && firebaseEnabled) {
      await writeTransactionToRemote(tx);
      // still save a client-side copy so page refresh doesn't clear while waiting remote
      saveLocalState();
    } else {
      transactions.push(tx);
      saveLocalState();
      render();
    }

    // if (currentUser && firebaseEnabled) {
    //   // writeTransactionToRemote will add or set depending on tx.id logic
    //   await writeTransactionToRemote(tx);
    //   // If you rely on Firestore to emit the saved doc back, transactions will be updated via listener.
    //   // We still push action using the tx object (client id) for undo mapping.
    // } else {
    //   transactions.push(tx);
    //   saveLocalState();
    //   render();
    // }

    // push add action for undo/redo (deep copy)
    if (typeof pushAction === 'function') {
      pushAction({ kind: 'tx-add', tx: JSON.parse(JSON.stringify(tx)) });
    }

    showToast('Transaction added');
  } catch (err) {
    console.error('Failed to add transaction', err);
    showToast('Failed to add transaction', true);
  }

  // ensure category appears in budget select if user created a custom one
  if (category && !DEFAULT_CATS.includes(category)) {
    if (!Array.from(budgetCategory.options).some(o => o.value === category)) {
      const opt = document.createElement('option'); opt.value = category; opt.textContent = category; budgetCategory.appendChild(opt);
    }
  }

  resetForm();
  checkBudgetsAndAlert();
}


//   async function onSaveTransaction(e){
//     e.preventDefault();
//     const type = document.getElementById('type').value;
//     let category = categorySelect.value;
//     if (category === 'Other') {
//       ensureCustomInputExists();
//       const custom = (customCategoryInput && customCategoryInput.value || '').trim();
//       if (!custom) { showToast('Please enter a custom category name', true); return; }
//       category = custom;
//       registerCustomCategory(custom);
//     }
//     const amount = parseFloat(document.getElementById('amount').value || 0);
//     const date = document.getElementById('date').value;
//     const note = document.getElementById('note').value;
//     const currency = document.getElementById('currency').value || 'INR';

//     if (!amount || !date) { showToast('Please enter valid amount and date'); return; }

//     if (editingId) {
//       const idx = transactions.findIndex(t=>t.id === editingId);
//       if (idx !== -1) {
//         const tx = { ...transactions[idx], type, category, amount, date, note, currency, updatedAt: new Date().toISOString() };
//         if (currentUser && firebaseEnabled && !tx.id.startsWith('id_')) { await userCollection('transactions').doc(tx.id).set(tx); }
//         else { transactions[idx] = tx; saveLocalState(); render(); }
//         showToast('Transaction updated');
//       }
//       editingId = null; saveBtn.textContent = 'Add Transaction';
//     } else {
//       const tx = { id: uid(), type, category, amount, date, currency, note, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
//       if (currentUser && firebaseEnabled) await writeTransactionToRemote(tx); else { transactions.push(tx); saveLocalState(); render(); }
//       showToast('Transaction added');
//     }

//     if (category && !DEFAULT_CATS.includes(category)) {
//       if (!Array.from(budgetCategory.options).some(o=>o.value===category)) {
//         const opt = document.createElement('option'); opt.value = category; opt.textContent = category; budgetCategory.appendChild(opt);
//       }
//     }
//     // after tx created and before resetForm()
// pushAction({ kind: 'tx-add', tx }); // tx is the object you just created (with id)

//     resetForm(); checkBudgetsAndAlert();
//   }

  function editTx(id) {
    const tx = transactions.find(t=>t.id===id); if (!tx) return;
    document.getElementById('type').value = tx.type;
    setCategoryOptionsForType(tx.type);
    if (!Array.from(categorySelect.options).some(o=>o.value === tx.category)) {
      categorySelect.value = 'Other'; showCustomInput(true); ensureCustomInputExists(); customCategoryInput.value = tx.category; registerCustomCategory(tx.category);
    } else { categorySelect.value = tx.category; showCustomInput(false); }
    document.getElementById('amount').value = tx.amount;
    document.getElementById('date').value = tx.date;
    document.getElementById('note').value = tx.note || '';
    document.getElementById('currency').value = tx.currency || 'INR';
    editingId = id; saveBtn.textContent = 'Update Transaction'; window.scrollTo({top:0, behavior:'smooth'});
  }

 async function deleteTx(id) {
  if (!confirm('Delete this transaction?')) return;
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  // push undo action BEFORE deletion
  if (typeof pushAction === 'function') pushAction({ kind: 'tx-delete', tx: JSON.parse(JSON.stringify(tx)) });

  if (currentUser && firebaseEnabled && !id.startsWith('id_')) {
    await deleteTransactionRemote(id);
  } else {
    transactions = transactions.filter(t => t.id !== id);
    saveLocalState();   // ensure persisted
    render();
  }
  showToast('Transaction deleted');
}


  // ----- budgets (monthly uses YYYY-MM extracted from date) -----
  async function onSaveBudget(){
    const scope = document.getElementById('budgetScope').value;
    const dateRaw = document.getElementById('budgetMonth').value; // format YYYY-MM-DD
    let month = null;
    if (scope === 'monthly') {
      if (!dateRaw) { showToast('Pick a date within the month for the budget', true); return; }
      month = dateRaw.slice(0,7); // YYYY-MM
    }
    const category = document.getElementById('budgetCategory').value;
    const limitRaw = document.getElementById('budgetLimit').value;
    const cleaned = String(limitRaw).replace(/[,₹$€\s]/g, '');
    const limit = Number(cleaned);
    if (!limit || Number.isNaN(limit) || limit <= 0) { showToast('Enter a valid numeric budget limit (> 0)', true); return; }
    const b = { id: uid(), scope, month: month || null, category: scope==='category' ? category : null, limit, createdAt: new Date().toISOString() };
    if (currentUser && firebaseEnabled) {
  await writeBudgetRemote(b);
  saveLocalState(); // still save local copy while remote settles
} else {
  budgets.push(b);
  saveLocalState();
  renderBudgets();
}
// push undo
if (typeof pushAction === 'function') pushAction({ kind: 'bud-add', bud: JSON.parse(JSON.stringify(b)) });

    // if (currentUser && firebaseEnabled) await writeBudgetRemote(b); else { budgets.push(b); saveLocalState(); renderBudgets(); }
    // showToast('Budget saved'); document.getElementById('budgetLimit').value = '';
  }

  async function clearBudgets(){ if (!confirm('Clear all budgets?')) return; if (currentUser && firebaseEnabled) { const col = userCollection('budgets'); const snap = await col.get(); const batch = getDb().batch(); snap.forEach(doc => batch.delete(doc.ref)); await batch.commit(); } else { budgets = []; saveLocalState(); renderBudgets(); } showToast('All budgets cleared'); }

   async function deleteBudget(id) {
  const theBud = budgets.find(b => b.id === id);
  if (!theBud) return;
  if (typeof pushAction === 'function') pushAction({ kind: 'bud-delete', bud: JSON.parse(JSON.stringify(theBud)) });

  if (currentUser && firebaseEnabled && !id.startsWith('id_')) {
    await deleteBudgetRemote(id);
  } else {
    budgets = budgets.filter(b => b.id !== id);
    saveLocalState();
    renderBudgets();
  }
  showToast('Budget removed');
}

  // async function deleteBudget(id){ if (currentUser && firebaseEnabled && !id.startsWith('id_')) await deleteBudgetRemote(id); else { budgets = budgets.filter(b=>b.id !== id); saveLocalState(); renderBudgets(); } showToast('Budget removed'); }

  function renderBudgets(){ budgetList.innerHTML = ''; if (budgets.length === 0) { budgetList.innerHTML = '<div class="muted">No budgets yet — create monthly or category budgets.</div>'; return; } budgets.forEach(b=>{ const el = document.createElement('div'); el.className = 'row'; el.style.justifyContent = 'space-between'; el.innerHTML = `<div style="flex:1"><strong>${b.scope==='monthly' ? 'Monthly' : 'Category'}</strong><div class="muted" style="font-size:0.9rem">${b.scope==='monthly' ? b.month : b.category}</div></div><div style="display:flex; gap:8px; align-items:center"><div class="muted">${fmt(b.limit)}</div><button class="btn btn-ghost" data-id="${b.id}">Delete</button></div>`; el.querySelector('button').addEventListener('click', ()=>deleteBudget(b.id)); budgetList.appendChild(el); }); }

  // ----- rendering & calculations (filterCategory supports custom filter) -----
  function render(){
    const monthFilter = filterMonth.value;
    let catFilter = filterCategory.value;
    if (catFilter === 'Other') {
      catFilter = filterCustomValue || ''; // if empty, treat as no filter (so shows all) — user can type to narrow
    }

    const q = searchInput.value.trim().toLowerCase();

    let rows = [...transactions];
    if (monthFilter){
      rows = rows.filter(t => { const d = new Date(t.date); const mm = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return mm === monthFilter; });
    }
    if (catFilter){
      rows = rows.filter(t=>t.category === catFilter);
    }
    if (q){
      rows = rows.filter(t => (t.note||'').toLowerCase().includes(q) || String(t.amount).includes(q));
    }

    rows.sort((a,b)=> new Date(b.date) - new Date(a.date));

    txTbody.innerHTML = '';
    rows.forEach(t=>{
      const tr = document.createElement('tr');
      tr.className = t.type === 'income' ? 'income' : 'expense';
      tr.innerHTML = `<td>${t.type === 'income' ? 'Income' : 'Expense'}</td><td>${t.category}</td><td class="amount">${fmt(t.amount, t.currency === 'INR' ? '₹' : t.currency + ' ')}</td><td>${new Date(t.date).toLocaleDateString()}</td><td>${(t.note || '').slice(0,60)}</td><td class="actions"><button class="btn btn-ghost" data-edit="${t.id}">Edit</button><button class="btn" data-delete="${t.id}">Delete</button></td>`;
      txTbody.appendChild(tr);
      tr.querySelector('[data-edit]').addEventListener('click', ()=>editTx(t.id));
      tr.querySelector('[data-delete]').addEventListener('click', ()=>deleteTx(t.id));
    });

    const totalIncome = rows.filter(r=>r.type==='income').reduce((s,r)=>s + Number(r.amount), 0);
    const totalExpense = rows.filter(r=>r.type==='expense').reduce((s,r)=>s + Number(r.amount), 0);
    const balance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((balance/totalIncome)*100) : 0;

    totalIncomeEl.textContent = fmt(totalIncome);
    totalExpenseEl.textContent = fmt(totalExpense);
    balanceEl.textContent = fmt(balance);
    savingsRateEl.textContent = `${savingsRate}%`;

    renderBudgets();
    renderBudgetAlerts(monthFilter);
    renderCharts(monthFilter);
    updateCategoryFilter();
  }

  function renderBudgetAlerts(){
  // Determine the month filter (YYYY-MM) from dashboard filter if present
  const dateFilterMonth = (typeof DOM !== 'undefined' && DOM.filterDate && DOM.filterDate.value) ? DOM.filterDate.value.slice(0,7) : null;

  budgets.forEach(b => {
    if (b.scope === 'monthly') {
      // monthly budgets use stored b.month (YYYY-MM)
      const monthKey = b.month || dateFilterMonth; // fallback if not set
      // total expense for that month
      const totalForMonth = transactions
        .filter(t => t.type === 'expense' && `${t.date.slice(0,7)}` === (monthKey || ''))
        .reduce((s, t) => s + Number(t.amount || 0), 0);

      const alertKey = `monthly:${b.month || 'unknown'}:limit:${b.limit}`;

      if (totalForMonth >= b.limit) {
        // persistent alert when exceeded
        showPersistentAlert(`Monthly budget exceeded for ${b.month || 'selected month'} — spent ${fmt(totalForMonth)} (limit ${fmt(b.limit)}).`, alertKey);
      } else if (totalForMonth >= b.limit * 0.9) {
        // transient near-limit toast
        showToast(`Monthly spend near budget (${fmt(totalForMonth)} / ${fmt(b.limit)})`);
      }
    } else if (b.scope === 'category') {
      const totalCat = transactions
        .filter(t => t.type === 'expense' && t.category === b.category)
        .reduce((s, t) => s + Number(t.amount || 0), 0);

      const alertKey = `category:${b.category}:limit:${b.limit}`;

      if (totalCat >= b.limit) {
        // persistent alert when exceeded for a category
        showPersistentAlert(`Budget exceeded for category "${b.category}" — spent ${fmt(totalCat)} (limit ${fmt(b.limit)}).`, alertKey);
      } else if (totalCat >= b.limit * 0.9) {
        showToast(`${b.category} nearing budget (${fmt(totalCat)} / ${fmt(b.limit)})`);
      }
    }
  });
}


  // ----- charts (unchanged) -----
  function renderCharts(monthFilter){
    const rows = transactions.filter(t => {
      if (filterCategory.value && filterCategory.value !== 'Other' && t.category !== filterCategory.value) return false;
      if (filterCategory.value === 'Other' && filterCustomValue && t.category !== filterCustomValue) return false;
      if (monthFilter) { const d = new Date(t.date); const mm = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return mm === monthFilter; }
      return true;
    });

    const catMap = {};
    rows.forEach(r=>{ if (r.type === 'expense') catMap[r.category] = (catMap[r.category] || 0) + Number(r.amount); });
    const catLabels = Object.keys(catMap);
    const catValues = catLabels.map(l => catMap[l]);

    if (pieChart) pieChart.destroy();
    pieChart = new Chart(pieCtx, { type: 'pie', data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: generateColors(catLabels.length) }] }, options: { plugins:{legend:{position:'bottom'}} } });

    const now = new Date(); const months = [];
    for (let i=5;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }
    const incomeSeries = months.map(m => transactions.filter(t=>{ const mm = `${new Date(t.date).getFullYear()}-${String(new Date(t.date).getMonth()+1).padStart(2,'0')}`; return mm === m && t.type === 'income'; }).reduce((s,t)=>s + Number(t.amount), 0));
    const expenseSeries = months.map(m => transactions.filter(t=>{ const mm = `${new Date(t.date).getFullYear()}-${String(new Date(t.date).getMonth()+1).padStart(2,'0')}`; return mm === m && t.type === 'expense'; }).reduce((s,t)=>s + Number(t.amount), 0));

    if (lineChart) lineChart.destroy();
    lineChart = new Chart(lineCtx, { type: 'line', data: { labels: months.map(m => { const parts = m.split('-'); const d = new Date(parts[0], Number(parts[1])-1, 1); return d.toLocaleString(undefined, {month:'short', year:'2-digit'}); }), datasets: [ { label: 'Income', data: incomeSeries, borderColor:'#10b981', tension:0.25, fill:false }, { label: 'Expense', data: expenseSeries, borderColor:'#ef4444', tension:0.25, fill:false } ] }, options: { plugins:{legend:{position:'bottom'}}, scales:{y:{beginAtZero:true}} } });
  }

  function generateColors(n){ const palette = ['#60a5fa','#f97316','#34d399','#f472b6','#a78bfa','#fb7185','#facc15','#60a5fa','#94a3b8']; return Array.from({length:n}, (_,i)=>palette[i%palette.length]); }

  // updateCategoryFilter preserves selection and adds dynamic/custom categories
  function updateCategoryFilter(){
    const catsFromTx = transactions.map(t=>t.category);
    const allSet = new Set([...DEFAULT_CATS, ...dynamicCats, ...catsFromTx]);
    // keep previous selection
    const prev = filterCategory.value;
    filterCategory.innerHTML = '';
    const allOpt = document.createElement('option'); allOpt.value = ''; allOpt.textContent = 'All Categories'; filterCategory.appendChild(allOpt);
    Array.from(allSet).forEach(c=>{ const opt = document.createElement('option'); opt.value = c; opt.textContent = c; filterCategory.appendChild(opt); });
    // ensure 'Other' option exists
    if (!Array.from(filterCategory.options).some(o=>o.value==='Other')) {
      const opt = document.createElement('option'); opt.value='Other'; opt.textContent='Other'; filterCategory.appendChild(opt);
    }
    // restore previous if still present, else default ''
    if (prev && Array.from(filterCategory.options).some(o=>o.value===prev)) {
      filterCategory.value = prev;
      if (prev === 'Other') showFilterCustomInput(true);
    } else {
      // if prev was a custom category that is not yet present but is stored in filterCustomValue, we re-add it
      if (filterCustomValue) {
        const opt = document.createElement('option'); opt.value = filterCustomValue; opt.textContent = filterCustomValue;
        filterCategory.appendChild(opt);
        filterCategory.value = filterCustomValue;
      } else {
        filterCategory.value = '';
        showFilterCustomInput(false);
      }
    }
  }

  // ----- Misc utilities -----
  function resetForm(){
    document.getElementById('type').value = 'expense';
    setCategoryOptionsForType('expense');
    showCustomInput(false);
    document.getElementById('amount').value = '';
    if (customCategoryInput) customCategoryInput.value = '';
    document.getElementById('note').value = '';
    document.getElementById('currency').value = 'INR';
    document.getElementById('date').valueAsDate = new Date();
    editingId = null;
    saveBtn.textContent = 'Add Transaction';
  }

  // ----- CSV Export -----
  function exportCSV(){
    if (transactions.length === 0) { showToast('No transactions to export'); return; }
    const header = ['id','type','category','amount','currency','date','note'];
    const rows = transactions.map(t => [t.id,t.type,t.category,t.amount,t.currency,t.date, `"${(t.note||'').replace(/"/g,'""')}"` ]);
    const csv = [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `budget_export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  // ----- Toasts (unchanged) -----
  function showToast(msg, danger=false){
    const node = document.createElement('div');
    node.className = 'toast-item';
    node.style.background = danger ? '#b91c1c' : '#111827';
    node.textContent = msg;
    toastContainer.appendChild(node);
    setTimeout(()=>{ node.style.opacity = '0.95' }, 20);
    setTimeout(()=>{ node.remove(); }, 5000);
  }







/* ===== Undo / Redo system ===== */
const UNDO_MAX = 50;
let undoStack = [];
let redoStack = [];

// DOM buttons (ensure IDs exist in HTML)
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function updateUndoRedoButtons() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// push action to history (call this when user performs an action)
function pushAction(action) {
  undoStack.push(action);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = []; // clear redo on new user action
  updateUndoRedoButtons();
}

// Action object shapes:
// { kind: 'tx-add', tx }           // user added transaction
// { kind: 'tx-delete', tx }        // user deleted transaction (tx = full object before deletion)
// { kind: 'tx-edit', before, after } // user edited tx
// { kind: 'bud-add', bud }         // budget add
// { kind: 'bud-delete', bud }      // budget delete
// { kind: 'bud-edit', before, after }

// perform = apply action (used for redo and initial user action if needed)
async function performAction(action) {
  if (!action) return;
  switch(action.kind) {
    case 'tx-add':
      // write back the tx
      if (currentUser && firebaseEnabled) {
        await writeTransactionToRemote(action.tx);
      } else {
        transactions.push(action.tx);
        saveLocalState();
        render();
      }
      break;

    case 'tx-delete':
      if (currentUser && firebaseEnabled && action.tx.id && !action.tx.id.startsWith('id_')) {
        await deleteTransactionRemote(action.tx.id);
      } else {
        transactions = transactions.filter(t => t.id !== action.tx.id);
        saveLocalState();
        render();
      }
      break;

    case 'tx-edit':
      if (currentUser && firebaseEnabled && action.after.id && !action.after.id.startsWith('id_')) {
        await userCollection('transactions').doc(action.after.id).set(action.after);
      } else {
        const idx = transactions.findIndex(t => t.id === action.after.id);
        if (idx !== -1) transactions[idx] = action.after;
        saveLocalState();
        render();
      }
      break;

    case 'bud-add':
      if (currentUser && firebaseEnabled) await writeBudgetRemote(action.bud);
      else { budgets.push(action.bud); saveLocalState(); renderBudgets(); }
      break;

    case 'bud-delete':
      if (currentUser && firebaseEnabled && action.bud.id && !action.bud.id.startsWith('id_')) await deleteBudgetRemote(action.bud.id);
      else { budgets = budgets.filter(b => b.id !== action.bud.id); saveLocalState(); renderBudgets(); }
      break;

    case 'bud-edit':
      if (currentUser && firebaseEnabled && action.after.id && !action.after.id.startsWith('id_')) {
        await userCollection('budgets').doc(action.after.id).set(action.after);
      } else {
        const bi = budgets.findIndex(b => b.id === action.after.id);
        if (bi !== -1) budgets[bi] = action.after;
        saveLocalState();
        renderBudgets();
      }
      break;
  }
}

// revert = undo action
async function revertAction(action) {
  if (!action) return;
  switch(action.kind) {
    case 'tx-add':
      // undoing an add -> remove that tx
      if (currentUser && firebaseEnabled && action.tx.id && !action.tx.id.startsWith('id_')) {
        await deleteTransactionRemote(action.tx.id);
      } else {
        transactions = transactions.filter(t => t.id !== action.tx.id);
        saveLocalState();
        render();
      }
      break;

    case 'tx-delete':
      // undoing a delete -> re-add the tx
      if (currentUser && firebaseEnabled) {
        await writeTransactionToRemote(action.tx);
      } else {
        transactions.push(action.tx);
        saveLocalState();
        render();
      }
      break;

    case 'tx-edit':
      // revert to 'before' state
      if (currentUser && firebaseEnabled && action.before.id && !action.before.id.startsWith('id_')) {
        await userCollection('transactions').doc(action.before.id).set(action.before);
      } else {
        const idx = transactions.findIndex(t => t.id === action.before.id);
        if (idx !== -1) transactions[idx] = action.before;
        saveLocalState();
        render();
      }
      break;

    case 'bud-add':
      // undo budget add => delete it
      if (currentUser && firebaseEnabled && action.bud.id && !action.bud.id.startsWith('id_')) await deleteBudgetRemote(action.bud.id);
      else { budgets = budgets.filter(b => b.id !== action.bud.id); saveLocalState(); renderBudgets(); }
      break;

    case 'bud-delete':
      // undo budget delete => re-add
      if (currentUser && firebaseEnabled) await writeBudgetRemote(action.bud);
      else { budgets.push(action.bud); saveLocalState(); renderBudgets(); }
      break;

    case 'bud-edit':
      // revert budget to before
      if (currentUser && firebaseEnabled && action.before.id && !action.before.id.startsWith('id_')) {
        await userCollection('budgets').doc(action.before.id).set(action.before);
      } else {
        const bi = budgets.findIndex(b => b.id === action.before.id);
        if (bi !== -1) budgets[bi] = action.before;
        saveLocalState();
        renderBudgets();
      }
      break;
  }
}

// Undo action: pop from undoStack, revert it, push to redoStack
async function undo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  await revertAction(action);
  redoStack.push(action);
  updateUndoRedoButtons();
  showToast('Undo performed');
}

// Redo action: pop from redoStack, perform it, push back to undoStack
async function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  await performAction(action);
  undoStack.push(action);
  updateUndoRedoButtons();
  showToast('Redo performed');
}

// Wire UI buttons
if (undoBtn) undoBtn.addEventListener('click', () => undo());
if (redoBtn) redoBtn.addEventListener('click', () => redo());

// Optional keyboard shortcuts: Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl+Shift+Z)
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const meta = isMac ? e.metaKey : e.ctrlKey;
  if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((meta && e.key === 'y') || (meta && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
});

// Initialize button state on load
updateUndoRedoButtons();

/* ===== Hook points (you need to call pushAction from user-driven functions) =====
   - For add transaction (in onSaveTransaction when creating a new tx): push { kind:'tx-add', tx }
   - For edit transaction: push { kind:'tx-edit', before:oldTx, after:newTx }
   - For delete transaction: push { kind:'tx-delete', tx:deletedTx }
   - For budgets: similar using bud keys (bud-add, bud-edit, bud-delete)
*/

// Example: inside your onSaveTransaction() when adding new tx (after tx created):
// pushAction({ kind: 'tx-add', tx });

// Example: when editing an existing tx, capture `before` then after saving:
// pushAction({ kind: 'tx-edit', before: oldTx, after: newTx });

// Example: inside your deleteTx(id) before actual deletion, capture tx then:
// pushAction({ kind: 'tx-delete', tx: theTxObject }); then perform deletion.










// --- persistent modal alerts (stays until user clicks OK) ---
const activePersistentAlerts = new Map(); // key -> DOM node

function showPersistentAlert(message, key) {
  // key: unique string identifying the alert so we don't create duplicates
  if (!key) key = String(Date.now());
  if (activePersistentAlerts.has(key)) return; // already shown

  // overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.35)';
  overlay.style.zIndex = '99999';

  // modal
  const modal = document.createElement('div');
  modal.style.maxWidth = '520px';
  modal.style.width = '92%';
  modal.style.background = '#fff';
  modal.style.borderRadius = '12px';
  modal.style.padding = '18px';
  modal.style.boxShadow = '0 12px 40px rgba(2,6,23,0.25)';
  modal.style.color = '#111827';
  modal.style.fontFamily = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial';

  const title = document.createElement('div');
  title.style.fontSize = '16px';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  title.textContent = 'Important budget alert';

  const body = document.createElement('div');
  body.style.fontSize = '14px';
  body.style.marginBottom = '16px';
  body.textContent = message;

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';

  const okBtn = document.createElement('button');
  okBtn.textContent = 'OK';
  okBtn.style.padding = '8px 12px';
  okBtn.style.borderRadius = '8px';
  okBtn.style.border = '0';
  okBtn.style.background = '#111827';
  okBtn.style.color = '#fff';
  okBtn.style.fontWeight = '600';
  okBtn.style.cursor = 'pointer';

  // (optional) Add a "Snooze" / "Dismiss" if you want — currently only OK removes
  okBtn.addEventListener('click', () => {
    overlay.remove();
    activePersistentAlerts.delete(key);
  });

  actions.appendChild(okBtn);
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(actions);
  overlay.appendChild(modal);

  document.body.appendChild(overlay);
  activePersistentAlerts.set(key, overlay);
}




// =====================
// DARK / LIGHT MODE
// =====================

// Load saved theme
(function () {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark");
  }
})();

// Toggle button
const themeBtn = document.getElementById("themeToggle");

function updateThemeButton() {
  if (document.body.classList.contains("dark")) {
    themeBtn.textContent = "☀️ Light";
  } else {
    themeBtn.textContent = "🌙 Dark";
  }
}

// Initial button text update
updateThemeButton();

// Button click event
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  // save preference
  const mode = document.body.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem("theme", mode);

  updateThemeButton();
});




  // ----- Auth helpers (prompt-based) -----
  function promptSignUp(){ const email = prompt('Sign up — enter email:'); if (!email) return; const password = prompt('Choose a password (min 6 chars):'); if (!password) return; firebase.auth().createUserWithEmailAndPassword(email, password).then(cred => { showToast('Sign up successful — logged in'); }).catch(err => { console.error(err); showToast('Sign up error: ' + err.message, true); }); }
  function promptSignIn(){ const email = prompt('Sign in — enter email:'); if (!email) return; const password = prompt('Enter password:'); if (!password) return; firebase.auth().signInWithEmailAndPassword(email, password).then(() => showToast('Signed in')).catch(err => { console.error(err); showToast('Sign in error: ' + err.message, true); }); }
  function signOut(){ if (!firebaseEnabled) return; firebase.auth().signOut().then(()=> { showToast('Signed out'); }); }





  // Try to persist state just before the page unloads (refresh/close)
window.addEventListener('beforeunload', () => {
  try { saveLocalState(); } catch(e) { /* ignore */ }
});



  // ----- initial load -----
  window.addEventListener('DOMContentLoaded', () => { init(); });

  // expose for debugging
  window._bp = { transactions, budgets, registerCustomCategory, dynamicCats };

})();
