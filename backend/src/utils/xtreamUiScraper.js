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

// Map to track ongoing login attempts to prevent redundant CAPTCHA solves
const loginPromises = new Map();

/**
 * Xtream UI Reseller Panel Scraper (Session-based)
 * Designed for panels that don't expose a standard REST API and require session cookies.
 */
const xtreamUiScraper = {
  /**
   * Automate login via 2Captcha and form submission.
   * Uses pooling to ensure only one CAPTCHA is solved for concurrent requests to the same target.
   */
  async autoLogin(host, username, password) {
    const targetKey = `${host}|${username}`;
    
    // If a login is already in progress for this target, join it
    if (loginPromises.has(targetKey)) {
      logger.info(`[Scraper] Joining existing login attempt for ${host} (${username})`);
      return loginPromises.get(targetKey);
    }

    const loginPromise = (async () => {
      try {
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
      } finally {
        // Always remove the promise from the map when finished
        loginPromises.delete(targetKey);
      }
    })();

    loginPromises.set(targetKey, loginPromise);
    return loginPromise;
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
   * Tries to find packages and fetch their associated bouquets via API.
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

      const bouquets = [];
      const seenIds = new Set();

      const addBouquet = (id, name) => {
        const cleanId = String(id || '').trim();
        const cleanName = String(name || '').replace(/&nbsp;/g, ' ').trim();
        if (!cleanId || !cleanName || /select/i.test(cleanName)) return;
        if (seenIds.has(cleanId)) return;
        seenIds.add(cleanId);
        bouquets.push({ id: cleanId, bouquet_name: cleanName });
      };

      // 1. Try to find package IDs in the HTML to fetch bouquets via API
      const packageRegex = /<option[^>]+value="(\d+)"[^>]*>([^<]+(CREDIT|OFFICIAL|TRIAL)[^<]*)<\/option>/gi;
      let pkgMatch;
      const packageIds = [];
      while ((pkgMatch = packageRegex.exec(body)) !== null) {
        packageIds.push(pkgMatch[1]);
      }

      if (packageIds.length > 0) {
        logger.info(`[Scraper] Found ${packageIds.length} packages, fetching bouquets via API...`);
        for (const pkgId of packageIds) {
          try {
            const apiRes = await fetch(`${host}/api.php?action=get_package&package_id=${pkgId}`, {
              headers: { ...BROWSER_HEADERS, 'Cookie': `PHPSESSID=${phpsessid}` },
            });
            const apiData = await apiRes.json();
            if (apiData && apiData.result && Array.isArray(apiData.bouquets)) {
              apiData.bouquets.forEach(b => addBouquet(b.id, b.bouquet_name));
            }
          } catch (err) {
            logger.warn(`[Scraper] Failed to fetch bouquets for package ${pkgId}: ${err.message}`);
          }
        }
      }

      // 2. Fallback: Traditional regex scraping of the page
      if (bouquets.length === 0) {
        const selectRegex = /<select[^>]+(?:name|id)="[^"]*bouquet[^"]*"[^>]*>([\s\S]*?)<\/select>/gi;
        const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi;
        let selectMatch;
        while ((selectMatch = selectRegex.exec(body)) !== null) {
          let optionMatch;
          while ((optionMatch = optionRegex.exec(selectMatch[1])) !== null) {
            addBouquet(optionMatch[1], optionMatch[2]);
          }
        }

        const checkboxRegex = /<input[^>]+type="checkbox"[^>]+name="bouquet\[\]"[^>]+value="(\d+)"[^>]*>([\s\S]*?)(?:<br|<\/td)/gi;
        let checkboxMatch;
        while ((checkboxMatch = checkboxRegex.exec(body)) !== null) {
          addBouquet(checkboxMatch[1], checkboxMatch[2].replace(/<[^>]+>/g, '').trim());
        }
      }

      logger.info(`[Scraper] Successfully found ${bouquets.length} bouquets`);
      return bouquets;
    } catch (err) {
      logger.error(`Xtream UI getBouquets failed: ${err.message}`);
      throw err;
    }
  },

  extractCreatedCredentials(responseBody, requestedUsername = '', requestedPassword = '') {
    const body = String(responseBody || '');
    const usernamePatterns = [
      /username[^a-z0-9]{0,20}<[^>]*>\s*([a-z0-9._-]{3,64})\s*</i,
      /username[^a-z0-9]{0,20}(?:value=|:)\s*["']?([a-z0-9._-]{3,64})["']?/i,
      /user(?:name)?\s*[:=]\s*["']?([a-z0-9._-]{3,64})["']?/i,
    ];
    const passwordPatterns = [
      /password[^a-z0-9]{0,20}<[^>]*>\s*([a-z0-9._@#%+=:-]{3,64})\s*</i,
      /password[^a-z0-9]{0,20}(?:value=|:)\s*["']?([a-z0-9._@#%+=:-]{3,64})["']?/i,
      /pass(?:word)?\s*[:=]\s*["']?([a-z0-9._@#%+=:-]{3,64})["']?/i,
    ];

    let username = null;
    let password = null;

    for (const pattern of usernamePatterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        username = String(match[1]).trim();
        break;
      }
    }

    for (const pattern of passwordPatterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        password = String(match[1]).trim();
        break;
      }
    }

    if (!username && requestedUsername) username = requestedUsername;
    if (!password && requestedPassword) password = requestedPassword;

    return {
      username: username || null,
      password: password || null,
    };
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
    
    // Attempt to find member_id from the HTML using multiple patterns
    let memberId = userData.memberId;
    if (!memberId) {
      const memberMatch =
        html.match(/name=["']member_id["'][^>]*value=["'](\d+)["']/) ||
        html.match(/value=["'](\d+)["'][^>]*name=["']member_id["']/) ||
        html.match(/member_id['":\s]+(\d+)/i);
      memberId = memberMatch ? memberMatch[1] : null;
    }

    // Research finding: when trial=true, package=1 (hidden trial package) makes the
    // panel set 24h expiry automatically. Any other package ID ignores the trial flag
    // and defaults to end-of-today.
    const packageId = userData.trial ? '1' : (userData.packageId || '');

    const bouquetIds = Array.isArray(userData.bouquetIds) ? userData.bouquetIds : [];
    const requestedUsername = String(userData.username || '').trim();
    const requestedPassword = String(userData.password || '').trim();
    const allowPanelGeneratedCredentials = userData.autoGenerateCredentials === true;

    const formData = new URLSearchParams();
    formData.append('trial', userData.trial ? '1' : '0');
    formData.append('bouquets_selected', JSON.stringify(bouquetIds.map(Number)));
    formData.append('username', allowPanelGeneratedCredentials ? '' : requestedUsername);
    formData.append('password', allowPanelGeneratedCredentials ? '' : requestedPassword);
    formData.append('member_id', memberId || '0');
    formData.append('package', packageId);
    formData.append('mac_address_mag', '');
    formData.append('mac_address_e2', '');
    formData.append('reseller_notes', userData.notes || 'StreamBridge Automation');
    for (const b of bouquetIds) formData.append('bouquet[]', String(b));
    formData.append('submit_user', 'add');

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
      if (resBodyLower.includes('error') || resBodyLower.includes('invalid') || resBodyLower.includes('failed')) {
        return { success: false, message: 'Panel returned an error while creating the line' };
      }

      const credentials = this.extractCreatedCredentials(
        resBody,
        allowPanelGeneratedCredentials ? '' : requestedUsername,
        allowPanelGeneratedCredentials ? '' : requestedPassword
      );

      if (!credentials.username || !credentials.password) {
        return {
          success: false,
          message: 'Panel did not return usable credentials for the created line',
        };
      }

      return {
        success: true,
        message: 'Line created successfully',
        username: credentials.username,
        password: credentials.password,
      };
    }

    return { success: false, message: `Panel returned HTTP ${status}` };
  }
};

module.exports = xtreamUiScraper;
