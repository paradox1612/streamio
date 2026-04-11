const fetch = require('node-fetch');
const logger = require('./logger');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const RECAPTCHA_SITE_KEY = '6LcXSrcZAAAAABPziK8siiyZ2H3JKXSDe7Z750ah'; // Starshare site key
const CAPTCHA_POLL_INTERVAL_MS = Number(process.env.TWO_CAPTCHA_POLL_INTERVAL_MS || 5000);
const CAPTCHA_POLL_ATTEMPTS = Number(process.env.TWO_CAPTCHA_POLL_ATTEMPTS || 24);

/**
 * Xtream UI Reseller Panel Scraper (Session-based)
 * Designed for panels that don't expose a standard REST API and require session cookies.
 */
const xtreamUiScraper = {
  /**
   * Automate login via 2Captcha and form submission.
   */
  async autoLogin(host, username, password) {
    const captchaKey = process.env.TWO_CAPTCHA_API_KEY;
    if (!captchaKey) throw new Error('TWO_CAPTCHA_API_KEY is not configured');

    logger.info(`[Scraper] Requesting CAPTCHA solve for ${host}...`);
    
    // 1. Request captcha solve
    const solveReq = await fetch(`https://2captcha.com/in.php?key=${captchaKey}&method=userrecaptcha&googlekey=${RECAPTCHA_SITE_KEY}&pageurl=${encodeURIComponent(host + '/login.php')}&json=1`);
    const solveJson = await solveReq.json();
    if (solveJson.status !== 1) throw new Error(`2Captcha Request Error: ${solveJson.request}`);
    
    const requestId = solveJson.request;
    let token = null;
    logger.info(`[Scraper] 2Captcha request accepted: ${String(requestId).slice(0, 8)}...`);

    // 2. Poll for result (default up to 120s, configurable by env)
    for (let i = 0; i < CAPTCHA_POLL_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, CAPTCHA_POLL_INTERVAL_MS));
      const pollReq = await fetch(`https://2captcha.com/res.php?key=${captchaKey}&action=get&id=${requestId}&json=1`);
      const pollJson = await pollReq.json();
      if (pollJson.status === 1) {
        token = pollJson.request;
        break;
      }
      logger.info(`[Scraper] 2Captcha poll ${i + 1}/${CAPTCHA_POLL_ATTEMPTS}: ${pollJson.request}`);
      if (pollJson.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha Poll Error: ${pollJson.request}`);
      }
    }

    if (!token) {
      const totalWaitSeconds = Math.round((CAPTCHA_POLL_ATTEMPTS * CAPTCHA_POLL_INTERVAL_MS) / 1000);
      throw new Error(`CAPTCHA solve timed out after ${totalWaitSeconds}s`);
    }
    logger.info('[Scraper] CAPTCHA solved successfully');

    // 3. Perform POST login
    const loginUrl = `${host}/login.php`;
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('g-recaptcha-response', token);
    formData.append('login_button', '');

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': loginUrl,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // 4. Extract PHPSESSID from cookies
    const cookieHeader = loginRes.headers.get('set-cookie');
    if (!cookieHeader) throw new Error('No cookies returned from login');
    
    const sessMatch = cookieHeader.match(/PHPSESSID=([^;]+)/);
    if (!sessMatch) throw new Error('PHPSESSID not found in cookies');

    const phpsessid = sessMatch[1];
    logger.info(`[Scraper] Login successful, session acquired: ${phpsessid.substring(0, 8)}...`);
    return phpsessid;
  },

  /**
   * Validate if the provided PHPSESSID is still active.
   */
  async isSessionValid(host, phpsessid) {
    const url = `${host}/user_reseller.php`;
    try {
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          'Cookie': `PHPSESSID=${phpsessid}`,
        },
        timeout: 10000,
      });
      const body = await res.text();
      // If we are redirected to login or the body is small and contains login.php, session is dead
      return !body.toLowerCase().includes('login.php') && body.toLowerCase().includes('logout');
    } catch (err) {
      logger.warn(`Xtream UI session check failed for ${host}: ${err.message}`);
      return false;
    }
  },

  /**
   * Fetch bouquets (packages) from the user_reseller.php page.
   */
  async getBouquets(host, phpsessid) {
    const url = `${host}/user_reseller.php`;
    try {
      const res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          'Cookie': `PHPSESSID=${phpsessid}`,
        },
        timeout: 15000,
      });
      const body = await res.text();

      // Find the bouquet multi-select or checkboxes using regex
      // Pattern: <option value="(\d+)">([^<]+)</option> inside a bouquet-related select
      // Or looking for names in the ALL_BOUQUETS style
      
      const bouquets = [];
      const seen = new Set();

      const pushBouquet = (id, name) => {
        const cleanId = String(id || '').trim();
        const cleanName = String(name || '').replace(/&nbsp;/g, ' ').trim();
        if (!cleanId || !cleanName || /select/i.test(cleanName)) return;
        if (seen.has(cleanId)) return;
        seen.add(cleanId);
        bouquets.push({ id: cleanId, bouquet_name: cleanName });
      };

      const selectRegex = /<select[^>]+(?:name|id)="[^"]*bouquet[^"]*"[^>]*>([\s\S]*?)<\/select>/gi;
      const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi;
      let selectMatch;
      while ((selectMatch = selectRegex.exec(body)) !== null) {
        let optionMatch;
        while ((optionMatch = optionRegex.exec(selectMatch[1])) !== null) {
          pushBouquet(optionMatch[1], optionMatch[2]);
        }
      }

      const checkboxRegex = /<input[^>]+name="bouquet\[\]"[^>]+value="([^"]+)"[^>]*>[\s\S]{0,200}?<[^>]*>([^<]+)</gi;
      let checkboxMatch;
      while ((checkboxMatch = checkboxRegex.exec(body)) !== null) {
        pushBouquet(checkboxMatch[1], checkboxMatch[2]);
      }

      const objectRegex = /["']?(\d+)["']?\s*:\s*["']([^"']+)["']/g;
      let objectMatch;
      while ((objectMatch = objectRegex.exec(body)) !== null) {
        pushBouquet(objectMatch[1], objectMatch[2]);
      }

      return bouquets;
    } catch (err) {
      logger.error(`Xtream UI getBouquets failed: ${err.message}`);
      throw err;
    }
  },

  /**
   * Create a new line/trial by posting to user_reseller.php.
   */
  async createLine(host, phpsessid, userData) {
    const url = `${host}/user_reseller.php`;
    
    // First, we might need to GET the page to find the member_id or CSRF tokens if any
    const getRes = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Cookie': `PHPSESSID=${phpsessid}` }
    });
    const html = await getRes.text();
    
    // Attempt to find member_id from the HTML
    let memberId = userData.memberId;
    if (!memberId) {
      const memberMatch = html.match(/name="member_id" value="(\d+)"/);
      memberId = memberMatch ? memberMatch[1] : null;
    }

    const formData = new URLSearchParams();
    formData.append('trial', userData.trial ? '1' : '0');
    formData.append('username', userData.username || '');
    formData.append('password', userData.password || '');
    formData.append('member_id', memberId || '0');
    formData.append('package', userData.packageId || '');
    formData.append('mac_address_mag', '');
    formData.append('mac_address_e2', '');
    formData.append('reseller_notes', userData.notes || 'StreamBridge Automation');
    formData.append('submit_user', 'add');

    if (userData.bouquetIds && Array.isArray(userData.bouquetIds)) {
      formData.append('bouquets_selected', JSON.stringify(userData.bouquetIds));
      for (const b of userData.bouquetIds) {
        formData.append('bouquet[]', b);
      }
    }

    const postRes = await fetch(url, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': `PHPSESSID=${phpsessid}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
      },
      body: formData.toString(),
      redirect: 'manual', // XC UI often redirects on success
    });

    const status = postRes.status;
    const resBody = await postRes.text();
    const resBodyLower = resBody.toLowerCase();

    if (status === 302 || status === 200) {
      if (resBodyLower.includes('already exists') || resBodyLower.includes('username taken')) {
        return { success: false, message: 'Username already exists' };
      }
      return { success: true, message: 'Line created successfully' };
    }

    return { success: false, message: `Panel returned HTTP ${status}` };
  }
};

module.exports = xtreamUiScraper;
