/* Shared renovation tables: public collaboration, with local backups. */
(() => {
  'use strict';
  const BASE = 'https://acyhooonucyogzdpeaus.supabase.co';
  const KEY = 'sb_publishable_czL0rcwPmK2QJMNtDJ_U7Q_EQSm0a8u';
  const URL = BASE + '/rest/v1/renovation_settings';
  const STORAGE_KEY = 'renovationV1';
  const ROW_KEY = 'shared-dashboard-v1';
  const originalSave = save;
  let ready = false;
  let busy = false;
  let lastRemote = '';
  let queue = Promise.resolve();
  let lastLocalEdit = 0;
  let warned = false;
  let starting = false;
  let lastError = '';
  function showSyncError(error) {
    lastError = String(error?.message || error);
    let panel = document.getElementById('renovationSyncError');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'renovationSyncError';
      panel.setAttribute('dir','rtl');
      panel.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;max-width:530px;margin:auto;z-index:999999;background:#18262d;color:white;padding:18px;border:1px solid #f59e0b;border-radius:14px;box-shadow:0 8px 32px #0008;font:15px Arial,sans-serif;line-height:1.6';
      panel.innerHTML = '<strong>הסנכרון לענן לא הושלם</strong><p id="syncErrorText" style="overflow-wrap:anywhere"></p><p style="font-size:12px">הנתונים המקומיים לא נמחקו. אפשר להעתיק את השגיאה ולשלוח אותה לבדיקה.</p><button id="syncCopyError" style="padding:9px;margin:4px">העתקת השגיאה</button><button id="syncRetry" style="padding:9px;margin:4px">נסה שוב</button><button id="syncDismiss" style="padding:9px;margin:4px">סגור</button>';
      document.body.appendChild(panel);
      panel.querySelector('#syncCopyError').onclick = () => navigator.clipboard?.writeText(lastError);
      panel.querySelector('#syncRetry').onclick = () => { panel.remove(); start(); };
      panel.querySelector('#syncDismiss').onclick = () => panel.remove();
    }
    panel.querySelector('#syncErrorText').textContent = lastError;
    panel.style.display = 'block';
  }

  async function api(method, body, query = '?key=eq.' + encodeURIComponent(ROW_KEY)) {
    const res = await fetch(URL + query, {
      method,
      headers: {
        apikey: KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    if (!res.ok) throw Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0, 180));
    return res.json();
  }

  function valid(value) {
    return value && Array.isArray(value.works) && Array.isArray(value.purchases) &&
      Array.isArray(value.decisions) && typeof value.reserve !== 'undefined';
  }

  function apply(value) {
    if (!valid(value)) throw Error('נתוני הענן אינם תקינים');
    data = structuredClone(value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render();
  }

  function notice(message) {
    if (typeof showToast === 'function') showToast(message, true);
    else console.warn(message);
  }

  function backupLocal() {
    const key = 'renovation-local-backup-' + new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(data));
    return key;
  }

  async function refresh() {
    if (!ready || busy || Date.now() - lastLocalEdit < 12000) return;
    try {
      const rows = await api('GET');
      if (!rows.length || !valid(rows[0].value)) return;
      const incoming = JSON.stringify(rows[0].value);
      if (incoming !== lastRemote) {
        lastRemote = incoming;
        apply(rows[0].value);
      }
    } catch (e) { console.warn('Cloud refresh failed:', e); }
  }

  save = () => {
    originalSave();
    if (!ready) return;
    lastLocalEdit = Date.now();
    const snapshot = structuredClone(data);
    queue = queue.then(async () => {
      busy = true;
      try {
        const rows = await api('PATCH', {value: snapshot}, '?key=eq.' + encodeURIComponent(ROW_KEY));
        if (!rows.length) throw Error('לא נמצאה רשומה משותפת');
        lastRemote = JSON.stringify(snapshot);
      } catch (e) {
        console.error('Cloud save failed:', e);
        notice('השינוי נשמר במכשיר בלבד. לא הצלחנו לשמור בענן');
      } finally {
        busy = false;
      }
    });
  };

  async function start() {
    if (starting) return;
    starting = true;
    try {
      const rows = await api('GET');
      if (rows.length && valid(rows[0].value)) {
        const remote = rows[0].value;
        const local = JSON.stringify(data);
        if (local !== JSON.stringify(remote)) {
          backupLocal();
          if (confirm('יש כבר נתונים משותפים בענן. לשמור עותק של הנתונים המקומיים ולטעון את הגרסה המשותפת?\\n\\nאישור = הצגת הנתונים המשותפים. ביטול = השארת הנתונים המקומיים במכשיר זה.')) {
            apply(remote);
          } else {
            notice('הסנכרון מושהה במכשיר זה עד לרענון ואישור');
            return;
          }
        }
        lastRemote = JSON.stringify(remote);
      } else {
        if (!confirm('הטבלאות עדיין לא הועברו לענן. להעלות את הנתונים מהמכשיר הזה כגרסה המשפחתית הראשונה?\\n\\nמומלץ לבצע זאת מהמחשב שבו נמצאים הנתונים המעודכנים ביותר.')) return;
        backupLocal();
        const created = await api('POST', {key: ROW_KEY, value: structuredClone(data)}, '?on_conflict=key');
        if (!created.length) throw Error('לא ניתן ליצור נתונים משותפים');
        lastRemote = JSON.stringify(data);
      }
      ready = true;
      setInterval(refresh, 15000);
      document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
    } catch (e) {
      console.warn('Shared tables unavailable:', e);
      if (!warned) {
        warned = true;
        showSyncError(e);
      }
    } finally {
      starting = false;
    }
  }
  start();
})();