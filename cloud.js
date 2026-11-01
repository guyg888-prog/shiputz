
/* Beit Girshevich — Supabase shared images */
(() => {
  'use strict';

  const BASE = 'https://acyhooonucyogzdpeaus.supabase.co';
  const KEY = 'sb_publishable_czL0rcwPmK2QJMNtDJ_U7Q_EQSm0a8u';
  const BUCKET = 'renovation-images';

  const original = {
    all: window.dbAll,
    put: window.dbPut,
    del: window.dbDelete
  };

  let session = null;
  let cache = null;

  const sessionKey = 'beit-cloud-session';

  const style = document.createElement('style');
  style.textContent = `
    #familyCloudLogin {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #101a20e8;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      direction: rtl;
      font-family: Heebo, Arial, sans-serif;
    }

    #familyCloudLogin .panel {
      width: min(420px, 100%);
      background: #fff;
      color: #17242a;
      padding: 28px;
      border-radius: 18px;
      box-shadow: 0 20px 80px #0005;
    }

    #familyCloudLogin h2 {
      font-size: 24px;
      margin: 0 0 8px;
    }

    #familyCloudLogin p {
      line-height: 1.6;
      color: #536269;
    }

    #familyCloudLogin input {
      box-sizing: border-box;
      width: 100%;
      padding: 12px;
      margin: 7px 0;
      border: 1px solid #bbc5c9;
      border-radius: 9px;
      direction: ltr;
      font-size: 15px;
    }

    #familyCloudLogin button {
      background: #177a69;
      color: #fff;
      border: 0;
      border-radius: 9px;
      padding: 12px 18px;
      width: 100%;
      margin-top: 12px;
      cursor: pointer;
      font: inherit;
    }

    #familyCloudLogin .error {
      color: #b31c2b;
      white-space: pre-wrap;
      margin-top: 10px;
    }

    #familyCloudStatus {
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 9000;
      background: #163e3a;
      color: #fff;
      border: 1px solid #6c8d85;
      border-radius: 12px;
      padding: 9px 13px;
      cursor: pointer;
      font: 13px Heebo, Arial, sans-serif;
      direction: rtl;
    }
  `;

  document.head.appendChild(style);

  function headers() {
    return {
      apikey: KEY,
      Authorization: 'Bearer ' + session.access_token
    };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers(),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw Error(message.slice(0, 350) || `HTTP ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function persist(data) {
    session = data;
    sessionStorage.setItem(sessionKey, JSON.stringify(data));
  }

  async function renew() {
    if (!session?.refresh_token) return false;

    const response = await fetch(
      BASE + '/auth/v1/token?grant_type=refresh_token',
      {
        method: 'POST',
        headers: {
          apikey: KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: session.refresh_token
        })
      }
    );

    if (!response.ok) return false;

    persist(await response.json());
    return true;
  }

  async function authRequest(url, options) {
    try {
      return await request(url, options);
    } catch (error) {
      const message = error.message || '';

      if (
        (message.includes('JWT') || message.includes('token')) &&
        await renew()
      ) {
        return request(url, options);
      }

      throw error;
    }
  }

  async function checkMember() {
    const id = session?.user?.id;

    if (!id) throw Error('לא זוהה משתמש');

    const rows = await authRequest(
      BASE +
      '/rest/v1/renovation_members?select=user_id&user_id=eq.' +
      encodeURIComponent(id)
    );

    if (!rows?.length) {
      throw Error('החשבון אינו מורשה לגשת למידע המשפחתי.');
    }
  }

  async function signed(path) {
    const result = await authRequest(
      BASE + '/storage/v1/object/sign/' + BUCKET + '/' + path,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiresIn: 3600
        })
      }
    );

    return BASE + '/storage/v1' + result.signedURL;
  }

  async function cloudAll() {
    if (!session) return original.all();

    if (cache) return cache;

    const rows = await authRequest(
      BASE + '/rest/v1/renovation_media?select=*&order=updated_at.asc'
    );

    cache = await Promise.all(
      rows.map(async item => ({
        id: item.id,
        kind: item.kind,
        room: item.room || '',
        title: item.title || '',
        notes: item.notes || '',
        url: item.source_url || '',
        storagePath: item.storage_path,
        image: item.storage_path
          ? await signed(item.storage_path)
          : '',
        updatedAt: item.updated_at
      }))
    );

    return cache;
  }

  function asBlob(data) {
    const [meta, base64] = data.split(',');
    const type =
      (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type });
  }

  async function upload(data, id) {
    const blob = asBlob(data);

    const extension =
      blob.type === 'image/png'
        ? 'png'
        : blob.type === 'image/webp'
          ? 'webp'
          : 'jpg';

    const path = id + '.' + extension;

    const response = await fetch(
      BASE + '/storage/v1/object/' + BUCKET + '/' + path,
      {
        method: 'POST',
        headers: {
          ...headers(),
          'Content-Type': blob.type,
          'x-upsert': 'true'
        },
        body: blob
      }
    );

    if (!response.ok) {
      throw Error(
        'העלאת התמונה נכשלה: ' +
        (await response.text()).slice(0, 220)
      );
    }

    return path;
  }

  async function cloudPut(item) {
    if (!session) {
      throw Error('יש להתחבר כדי לשמור תמונות');
    }

    const validUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const id = validUUID.test(item.id || '')
      ? item.id
      : crypto.randomUUID();

    const existing = (await cloudAll()).find(x => x.id === id);

    let path =
      item.storagePath ||
      existing?.storagePath ||
      null;

    if (item.image?.startsWith('data:image/')) {
      path = await upload(item.image, id);
    }

    const row = {
      id,
      kind: item.kind || 'inspo',
      room: item.room || '',
      title: item.title || '',
      notes: item.notes || '',
      source_url: item.url || '',
      storage_path: path,
      updated_at: new Date().toISOString()
    };

    await authRequest(
      BASE + '/rest/v1/renovation_media?on_conflict=id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(row)
      }
    );

    cache = null;
  }

  async function cloudDelete(id) {
    if (!session) throw Error('יש להתחבר');

    const existing = (await cloudAll()).find(x => x.id === id);

    await authRequest(
      BASE +
      '/rest/v1/renovation_media?id=eq.' +
      encodeURIComponent(id),
      {
        method: 'DELETE'
      }
    );

    if (existing?.storagePath) {
      const response = await fetch(
        BASE +
        '/storage/v1/object/' +
        BUCKET +
        '/' +
        existing.storagePath,
        {
          method: 'DELETE',
          headers: headers()
        }
      );

      if (!response.ok) {
        console.warn('Could not remove image from Storage');
      }
    }

    cache = null;
  }

  window.dbAll = cloudAll;
  window.dbPut = cloudPut;
  window.dbDelete = cloudDelete;

  function status(text) {
    let element = document.getElementById('familyCloudStatus');

    if (!element) {
      element = document.createElement('button');
      element.id = 'familyCloudStatus';
      document.body.appendChild(element);

      element.onclick = () => {
        if (session) {
          if (confirm('להתנתק מהחשבון המשפחתי?')) {
            session = null;
            cache = null;
            sessionStorage.removeItem(sessionKey);
            status('☁ התחברות לענן');
            login();
          }
        } else {
          login();
        }
      };
    }

    element.textContent = text;
  }

  function login(message = '') {
    document.getElementById('familyCloudLogin')?.remove();

    const element = document.createElement('div');
    element.id = 'familyCloudLogin';

    element.innerHTML = `
      <div class="panel">
        <h2>כניסה לבית גירשביץ׳</h2>
        <p>
          התחברו כדי לצפות בהשראות ובהדמיות
          המשותפות לכל המשפחה.
        </p>

        <form id="familyCloudForm">
          <input
            id="familyEmail"
            type="email"
            placeholder="Email"
            autocomplete="username"
            required
          >

          <input
            id="familyPassword"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            required
          >

          <button type="submit">התחברות</button>

          <div id="familyCloudError" class="error"></div>
        </form>

        <p style="font-size:12px">
          התמונות שכבר נשמרו בדפדפן לא יימחקו.
          לאחר ההתחברות תוכלו להעביר אותן לענן.
        </p>
      </div>
    `;

    document.body.appendChild(element);

    document.getElementById('familyCloudError').textContent = message;

    document.getElementById('familyCloudForm').onsubmit = async event => {
      event.preventDefault();

      const button = event.target.querySelector('button');
      button.disabled = true;
      button.textContent = 'מתחבר...';

      try {
        const response = await fetch(
          BASE + '/auth/v1/token?grant_type=password',
          {
            method: 'POST',
            headers: {
              apikey: KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: document.getElementById('familyEmail').value,
              password: document.getElementById('familyPassword').value
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw Error(
            data.error_description ||
            data.msg ||
            data.error ||
            'התחברות נכשלה'
          );
        }

        persist(data);
        await checkMember();

        element.remove();

        status('☁ מחובר לענן · ' + data.user.email);

        render();
        migrate();

      } catch (error) {
        document.getElementById('familyCloudError').textContent =
          error.message;

        button.disabled = false;
        button.textContent = 'התחברות';
      }
    };
  }

  async function migrate() {
    try {
      const local = await original.all();

      if (!local.length) return;

      const flag = 'beit-cloud-imported-' + session.user.id;

      if (localStorage.getItem(flag)) return;

      if (!confirm(
        'נמצאו ' + local.length +
        ' תמונות ששמורות רק בדפדפן הזה. ' +
        'להעביר אותן לענן?\n\n' +
        'התמונות המקוריות לא יימחקו.'
      )) {
        return;
      }

      let done = 0;

      for (const item of local) {
        try {
          await cloudPut({
            ...item,
            id: crypto.randomUUID(),
            storagePath: null
          });

          done++;

        } catch (error) {
          alert(
            'הועברו ' + done +
            ' תמונות. שגיאה: ' + error.message
          );
          return;
        }
      }

      localStorage.setItem(flag, 'yes');

      alert(done + ' תמונות הועברו לענן בהצלחה');

      render();

    } catch (error) {
      console.error('Cloud import', error);
    }
  }

  async function init() {
    try {
      const saved = sessionStorage.getItem(sessionKey);

      if (saved) {
        session = JSON.parse(saved);
      }

      if (session) {
        try {
          await checkMember();

          status('☁ מחובר לענן · ' + session.user.email);

          render();
          migrate();
          return;

        } catch (error) {
          if (await renew()) {
            try {
              await checkMember();

              status('☁ מחובר לענן · ' + session.user.email);

              render();
              migrate();
              return;

            } catch {
              // Continue to login
            }
          }

          session = null;
        }
      }

      status('☁ התחברות לענן');
      login();

    } catch (error) {
      login(error.message);
    }
  }

  init();
})();
